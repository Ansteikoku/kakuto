import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://mykrvfndwbphffghykdz.supabase.co"; // ←自分のURL
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15a3J2Zm5kd2JwaGZmZ2h5a2R6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA5Njg5NTYsImV4cCI6MjA3NjU0NDk1Nn0.0AYae2z_tlPBxO_A_XfAKVOqDTLtJFuOLfME8lvkgD4"; // ←自分のKey
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const playerNameInput = document.getElementById("playerName");
const playerList = document.getElementById("playerList");
const chatLog = document.getElementById("chatLog");
const sendButton = document.getElementById("sendMessage");
const messageInput = document.getElementById("messageInput");

let playerId = crypto.randomUUID();
let currentRoomId = null;
let peers = {}; // playerId -> RTCPeerConnection
let channels = {}; // playerId -> DataChannel

// ========== Supabaseルーム作成 ==========
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
  subscribeToSignals(data.id);
  renderPlayers(data.players);
  alert(`ルーム作成！ID: ${data.id}`);
};

// ========== ルーム参加 ==========
document.getElementById("joinRoom").onclick = async () => {
  const roomId = document.getElementById("roomId").value.trim();
  const { data: room } = await supabase.from("rooms").select("*").eq("id", roomId).single();

  if (!room) return alert("ルームが存在しません");
  if (room.players.length >= 4) return alert("満員です");

  const newPlayers = [...room.players, { id: playerId, name: playerNameInput.value }];
  await supabase.from("rooms").update({ players: newPlayers }).eq("id", roomId);

  currentRoomId = roomId;
  subscribeToRoom(roomId);
  subscribeToSignals(roomId);
  renderPlayers(newPlayers);

  // 既にいるプレイヤーに接続要求を送る
  room.players.forEach((p) => createOffer(p.id));
};

// ========== Supabase: ルーム監視 ==========
function subscribeToRoom(roomId) {
  supabase
    .channel(`room-${roomId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
      (payload) => renderPlayers(payload.new.players)
    )
    .subscribe();
}

function renderPlayers(players) {
  playerList.innerHTML = "";
  players.forEach((p) => {
    const li = document.createElement("li");
    li.textContent = p.name;
    playerList.appendChild(li);
  });
}

// ========== Supabase: WebRTCシグナリング ==========
function subscribeToSignals(roomId) {
  supabase
    .channel(`signal-${roomId}`)
    .on("broadcast", { event: "signal" }, ({ payload }) => handleSignal(payload))
    .subscribe();
}

async function sendSignal(data) {
  await supabase.channel(`signal-${currentRoomId}`).send({
    type: "broadcast",
    event: "signal",
    payload: data,
  });
}

// ========== WebRTC部分 ==========
async function createPeer(targetId) {
  const peer = new RTCPeerConnection();
  peers[targetId] = peer;

  const channel = peer.createDataChannel("chat");
  channels[targetId] = channel;

  channel.onmessage = (e) => addMessage(`💬 ${targetId}: ${e.data}`);

  peer.onicecandidate = (e) => {
    if (e.candidate) sendSignal({ from: playerId, to: targetId, ice: e.candidate });
  };

  peer.ondatachannel = (e) => {
    const ch = e.channel;
    ch.onmessage = (e) => addMessage(`💬 ${targetId}: ${e.data}`);
    channels[targetId] = ch;
  };

  return peer;
}

async function createOffer(targetId) {
  const peer = await createPeer(targetId);
  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);
  sendSignal({ from: playerId, to: targetId, offer });
}

async function handleSignal({ from, to, offer, answer, ice }) {
  if (to !== playerId) return;

  let peer = peers[from] || (peers[from] = await createPeer(from));

  if (offer) {
    await peer.setRemoteDescription(new RTCSessionDescription(offer));
    const answerDesc = await peer.createAnswer();
    await peer.setLocalDescription(answerDesc);
    sendSignal({ from: playerId, to: from, answer: answerDesc });
  }

  if (answer) {
    await peer.setRemoteDescription(new RTCSessionDescription(answer));
  }

  if (ice) {
    try {
      await peer.addIceCandidate(new RTCIceCandidate(ice));
    } catch (err) {
      console.error("ICE error:", err);
    }
  }
}

// ========== チャット送受信 ==========
sendButton.onclick = () => {
  const msg = messageInput.value;
  addMessage(`🧍 あなた: ${msg}`);
  Object.values(channels).forEach((ch) => ch.send(msg));
  messageInput.value = "";
};

function addMessage(text) {
  const div = document.createElement("div");
  div.textContent = text;
  chatLog.appendChild(div);
}
