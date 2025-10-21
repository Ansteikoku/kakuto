// Supabase は CDN 経由で supabaseJs が定義される
const SUPABASE_URL = "https://phcbglafbctxrbjmdskc.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoY2JnbGFmYmN0eHJiam1kc2tjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA5NTI1MTcsImV4cCI6MjA3NjUyODUxN30.8XdFyB9eYWz_bww1EBWH9dz4IiRAHLeT8q3WvLLshiA";
const supabase = supabaseJs.createClient(SUPABASE_URL, SUPABASE_KEY);

const myId = Math.random().toString(36).slice(2);
let myCharacter, myName, player, dead=false, hp=100, roomId="room1";
let otherPlayers = {}, cursors, space, skillKey, attackHitbox;
let peerConnections = {};

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
  dom: { createContainer: true }, // DOM 入力対応
  scene:[CharacterSelectScene, GameScene]
};
new Phaser.Game(config);

// ---------------- キャラ選択 ----------------
class CharacterSelectScene extends Phaser.Scene{
  constructor(){super("CharacterSelectScene");}
  preload(){
    // GitHub Pages 用にリポジトリパスを含める場合
    this.load.image("bg","/kakuto/assets/select_bg.png");
    this.load.image("char1","/kakuto/assets/char1.png");
    this.load.image("char2","/kakuto/assets/char2.png");
    this.load.image("char3","/kakuto/assets/char3.png");
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
    this.load.image("ground","/kakuto/assets/ground.png");
    this.load.image("char1","/kakuto/assets/char1.png");
    this.load.image("char2","/kakuto/assets/char2.png");
    this.load.image("char3","/kakuto/assets/char3.png");
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
// ... updatePlayerMovement, doAttack, doSkillAttack, showAttackEffect, updateHpBar, handleDeath, respawn
// ... handleJoin, handleUpdate, WebRTC P2P 関数 など
