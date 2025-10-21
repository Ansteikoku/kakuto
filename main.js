import { createClient } from "@supabase/supabase-js";

// ---------------- Supabase ----------------
const SUPABASE_URL = "https://phcbglafbctxrbjmdskc.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoY2JnbGFmYmN0eHJiam1kc2tjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA5NTI1MTcsImV4cCI6MjA3NjUyODUxN30.8XdFyB9eYWz_bww1EBWH9dz4IiRAHLeT8q3WvLLshiA";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const myId = Math.random().toString(36).slice(2);
let myCharacter, myName, player, dead=false, hp=100, roomId="room1";
let otherPlayers = {}, cursors, space, skillKey, attackHitbox;
let peerConnections = {};

// キャラ性能
const CHARACTER_STATS = {
  char1:{name:"ソードマン", speed:200, jump:350, attack:20, skill:"spinSlash"},
  char2:{name:"アーチャー", speed:250, jump:300, attack:15, skill:"arrowRain"},
  char3:{name:"メイジ", speed:180, jump:320, attack:25, skill:"fireball"},
};

// ---------------- Phaser 設定 ----------------
const config = {
  type: Phaser.AUTO,
  width:800, height:600,
  backgroundColor:"#66ccff",
  parent:"game-container",
  physics:{ default:"arcade", arcade:{ gravity:{y:600}, debug:false } },
  scene:[CharacterSelectScene, GameScene]
};
new Phaser.Game(config);

// ---------------- キャラ選択 ----------------
class CharacterSelectScene extends Phaser.Scene{
  constructor(){super("CharacterSelectScene");}
  preload(){
    this.load.image("bg","assets/select_bg.png");
    this.load.image("char1","assets/char1.png");
    this.load.image("char2","assets/char2.png");
    this.load.image("char3","assets/char3.png");
  }
  create(){
    const scene=this;
    this.add.image(400,300,"bg").setAlpha(0.4);
    this.add.text(240,50,"キャラを選んでください",{fontSize:"32px",color:"#fff"});
    const input=this.add.dom(400,120,"input",{type:"text",width:"200px",textAlign:"center"});
    input.node.placeholder="名前を入力";

    const chars=[
      {key:"char1",name:"ソードマン"},
      {key:"char2",name:"アーチャー"},
      {key:"char3",name:"メイジ"}
    ];
    const preview=this.add.image(400,250,"char1").setScale(2);

    chars.forEach((ch,i)=>{
      const x=250+i*150,y=350;
      const icon=this.add.image(x,y,ch.key).setInteractive().setScale(2);
      icon.on("pointerover",()=>preview.setTexture(ch.key));
      icon.on("pointerout",()=>preview.setTexture(myCharacter||"char1"));
      icon.on("pointerdown", async ()=>{
        myCharacter=ch.key; myName=input.node.value||"名無し";

        // 最大4人制限
        const { data } = await supabase.from("players").select("id").eq("room",roomId);
        if(data.length>=4){ alert("部屋が満員です"); return; }

        await supabase.from("players").upsert({
          id:myId,name:myName,character:myCharacter,x:400,y:200,hp:100,room:roomId
        });

        connectToPeers(data.map(p=>({id:p.id})));
        scene.scene.start("GameScene");
      });
      this.add.text(x-40,y+60,ch.name,{fontSize:"18px",color:"#fff"});
    });
  }
}

// ---------------- ゲームシーン ----------------
class GameScene extends Phaser.Scene{
  constructor(){super("GameScene");}
  preload(){
    this.load.image("ground","assets/ground.png");
    this.load.image("char1","assets/char1.png");
    this.load.image("char2","assets/char2.png");
    this.load.image("char3","assets/char3.png");
  }
  create(){
    const scene=this;
    const platforms=scene.physics.add.staticGroup();
    for(let x=0;x<800;x+=128) platforms.create(x,568,"ground").setOrigin(0,0).refreshBody();

    player=scene.physics.add.sprite(400,200,myCharacter||"char1").setCollideWorldBounds(true);
    scene.physics.add.collider(player,platforms);
    player.nameLabel=scene.add.text(player.x-20,player.y-40,myName,{fontSize:"18px",color:"#fff"});
    player.hpBar=scene.add.graphics();
    updateHpBar(player);

    attackHitbox=scene.add.rectangle(0,0,50,30,0xffff00,0.3);
    scene.physics.add.existing(attackHitbox);
    attackHitbox.active=false; attackHitbox.visible=false;

    cursors=scene.input.keyboard.createCursorKeys();
    space=scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    skillKey=scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Z);

    supabase.from(`players:room=eq.${roomId}`).on("INSERT",handleJoin).on("UPDATE",handleUpdate).subscribe();

    scene.events.on("update",()=>{
      if(player.nameLabel){player.nameLabel.x=player.x-20; player.nameLabel.y=player.y-40;}
      updatePlayerMovement(scene);
      updateHpBar(player);
      Object.values(otherPlayers).forEach(p=>updateHpBar(p));
      if(player.y>700 && !dead) handleDeath(scene,"fall");
    });
  }
}

// ---------------- 移動・攻撃・スキル ----------------
function updatePlayerMovement(scene){
  if(!player || dead) return;
  const stats = CHARACTER_STATS[myCharacter];
  player.body.setVelocityX(0);
  if(cursors.left.isDown) player.body.setVelocityX(-stats.speed), player.flipX=true;
  else if(cursors.right.isDown) player.body.setVelocityX(stats.speed), player.flipX=false;
  if(cursors.up.isDown && player.body.blocked.down) player.body.setVelocityY(-stats.jump);

  sendMove(player.x,player.y);
  if(Phaser.Input.Keyboard.JustDown(space)) doAttack();
  if(Phaser.Input.Keyboard.JustDown(skillKey)) doSkillAttack();
}

function doAttack(){
  const stats=CHARACTER_STATS[myCharacter];
  attackHitbox.x=player.x+(player.flipX?-30:30); attackHitbox.y=player.y;
  attackHitbox.visible=true; attackHitbox.active=true;

  Object.values(otherPlayers).forEach(p=>{
    if(Phaser.Math.Distance.Between(attackHitbox.x,attackHitbox.y,p.sprite.x,p.sprite.y)<40){
      p.hp=Math.max(0,p.hp-stats.attack);
      supabase.from("players").upsert({id:p.id,hp:p.hp});
    }
  });
  showAttackEffect(attackHitbox.x,attackHitbox.y,player.flipX);
  sendAttack(attackHitbox.x,attackHitbox.y,player.flipX);
}

function doSkillAttack(){ /* キャラスキル同期 */ sendSkill(CHARACTER_STATS[myCharacter].skill,player.x,player.y,player.flipX); }

function showAttackEffect(x,y,flip){
  const fx=game.scene.keys["GameScene"].add.rectangle(x,y,50,10,0xffff00,0.6);
  fx.setOrigin(flip?1:0,0.5);
  game.scene.keys["GameScene"].tweens.add({targets:fx,alpha:0,scaleX:1.5,duration:200,onComplete:()=>fx.destroy()});
}

function updateHpBar(obj){
  if(!obj.hpBar) return;
  obj.hpBar.clear();
  obj.hpBar.fillStyle(0x00ff00,1);
  obj.hpBar.fillRect(obj.sprite?obj.sprite.x-25:obj.x-25,obj.sprite?obj.sprite.y-40:obj.y-40,obj.hp,5);
}

function handleDeath(scene,reason="attack"){
  dead=true; hp=0; player.setTint(0x333333);
  supabase.from("players").upsert({id:myId,hp:0});
  const text=scene.add.text(player.x-20,player.y-40,reason==="fall"?"落下死！":"倒された！",{fontSize:"16px",color:"#ff0000"});
  scene.time.delayedCall(1000,()=>text.destroy());
  scene.time.delayedCall(3000,()=>respawn(scene));
}

function respawn(scene){
  const spawnPoints=[{x:100,y:200},{x:400,y:100},{x:700,y:250}];
  const pos=Phaser.Utils.Array.GetRandom(spawnPoints);
  hp=100; dead=false; player.clearTint(); player.x=pos.x; player.y=pos.y;
  supabase.from("players").upsert({id:myId,x:player.x,y:player.y,hp});
}

// ---------------- Supabase リアルタイム ----------------
function handleJoin(payload){
  const data=payload.new;
  if(data.id===myId) return;
  if(!otherPlayers[data.id]){
    const scene=game.scene.keys["GameScene"];
    const sprite=scene.physics.add.sprite(data.x,data.y,data.character).setCollideWorldBounds(true);
    const label=scene.add.text(sprite.x-20,sprite.y-40,data.name,{fontSize:"18px",color:"#fff"});
    sprite.hp=data.hp;
    sprite.hpBar=scene.add.graphics();
    otherPlayers[data.id]={sprite,label,stats:CHARACTER_STATS[data.character],hp:data.hp};
  }
}
function handleUpdate(payload){
  const data=payload.new;
  const p=otherPlayers[data.id];
  if(!p || data.id===myId) return;
  if(data.x!==undefined) p.sprite.x=data.x;
  if(data.y!==undefined) p.sprite.y=data.y;
  if(data.hp!==undefined) p.hp=data.hp;
}

// ---------------- WebRTC P2P ----------------
async function connectToPeers(players){ /* offer/answer/candidate 送受信 */ }
function sendMove(x,y){ broadcast({type:"move",id:myId,x,y}); }
function sendAttack(x,y,flip){ broadcast({type:"attack",id:myId,x,y,flip}); }
function sendSkill(skill,x,y,flip){ broadcast({type:"skill",id:myId,skill,x,y,flip}); }
function broadcast(msg){ Object.values(peerConnections).forEach(p=>{ if(p.dc&&p.dc.readyState==="open") p.dc.send(JSON.stringify(msg)); }); }
function handleRTCMessage(data){ /* 受信した移動・攻撃・スキル反映 */ }
