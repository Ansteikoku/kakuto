// main.js
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://xxxxxxxx.supabase.co"; // ←自分のURL
const SUPABASE_KEY = "public-anon-key"; // ←自分のKey
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const playerNameInput = document.getElementById("playerName");
const playerList = document.getElementById("playerList");

let currentRoomId = null;
let playerId = crypto.randomUUID(); // ランダムなプレイヤーID

// ルーム作成
document.getElementById("createRoom").onclick = async () => {
  const { data, error } = await supabase
    .from("rooms")
    .insert({
      name: `room_${Math.floor(Math.random() * 1000)}`,
      players: [{ id: playerId, name: playerNameInput.value }],
    })
    .select()
    .single();

  currentRoomId = data.id;
  subscribeToRoom(data.id);
  renderPlayers(data.players);
  alert(`ルーム作成成功！ID: ${data.id}`);
};

// ルーム参加
document.getElementById("joinRoom").onclick = async () => {
  const roomId = document.getElementById("roomId").value.trim();
  const { data: room } = await supabase.from("rooms").select("*").eq("id", roomId).single();

  if (!room) {
    alert("ルームが見つかりません！");
    return;
  }

  if (room.players.length >= 4) {
    alert("このルームは満員です！");
    return;
  }

  const newPlayers = [...room.players, { id: playerId, name: playerNameInput.value }];
  await supabase.from("rooms").update({ players: newPlayers }).eq("id", roomId);

  currentRoomId = roomId;
  subscribeToRoom(roomId);
  renderPlayers(newPlayers);
};

// プレイヤー一覧更新
function renderPlayers(players) {
  playerList.innerHTML = "";
  players.forEach(p => {
    const li = document.createElement("li");
    li.textContent = p.name;
    playerList.appendChild(li);
  });
}

// Realtime購読
function subscribeToRoom(roomId) {
  supabase
    .channel(`room-${roomId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
      (payload) => {
        const players = payload.new.players;
        renderPlayers(players);
      }
    )
    .subscribe();
}
