/* Kum Dök — oyun arayüzü, çizim, ses, kayıt */
(function(){
'use strict';
var K=window.KD, KL=window.KDL, LEVELS=KL.LEVELS, WORLDS=KL.WORLDS;
var W=K.W,H=K.H,CELL=K.CELL,GW=K.GW,GH=K.GH;
var $=function(id){return document.getElementById(id);};

/* ---------- kayıt (kurallar save.js'de; eski kd4/kd3 kayıtları otomatik taşınır) ---------- */
var KS=window.KDS, mem=null;
function save(){ try{ localStorage.setItem(KS.KEY,JSON.stringify(mem)); }catch(e){} }
mem=KS.load(function(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } },KL.OLDMAP||null); save();
function totalStars(){ var t=0,k; for(k in mem.stars)t+=mem.stars[k]; for(k in mem.daily)t+=mem.daily[k]; return t; }
function today(){ return KS.dateStr(new Date()); }
function yesterday(){ var d=new Date(); d.setDate(d.getDate()-1); return KS.dateStr(d); }
/* bölüm kilidi: önceki bölüm bitmiş/atlanmış ya da bu bölüm zaten bitmiş */
function isUnlocked(i){ if(i<=0)return true; if(!LEVELS[i])return false; var id=LEVELS[i].id; if(mem.stars[id]||mem.skipped[id])return true; var pid=LEVELS[i-1].id; return !!(mem.stars[pid]||mem.skipped[pid]); }
function firstOpenIndex(){ for(var i=0;i<LEVELS.length;i++){ var id=LEVELS[i].id; if(!mem.stars[id]&&isUnlocked(i))return i; } return LEVELS.length-1; }
function wRange(w){ var a=-1,b=-1; for(var i=0;i<LEVELS.length;i++){ if(LEVELS[i].world===w){ if(a<0)a=i; b=i+1; } } return a<0?[0,0]:[a,b]; }
function isBoss(i){ return !!LEVELS[i]&&(i===LEVELS.length-1||LEVELS[i+1].world!==LEVELS[i].world); }
function worldStars(w){ var r=wRange(w),t=0; for(var i=r[0];i<r[1];i++)t+=mem.stars[LEVELS[i].id]||0; return t; }
function worldDone(w){ var r=wRange(w),c=0; for(var i=r[0];i<r[1];i++)if(mem.stars[LEVELS[i].id])c++; return c; }
function worldCount(w){ var r=wRange(w); return r[1]-r[0]; }

/* ---------- kum çeşitleri ---------- */
var SKINS=[
 {id:'klasik',name:'Klasik Kum',need:0,pal:['#f3c970','#e9b95a','#f7d98a','#dfae4f','#f0c36a','#e6b254','#f9de9a','#d9a644']},
 {id:'altin',name:'Altın Tozu',need:5,pal:['#ffd700','#ffcc33','#fff0a0','#e6b800','#ffe14d','#ffb700','#fff5c2','#d4a000']},
 {id:'buz',name:'Buz Kristali',need:12,pal:['#c9f0ff','#a8e4ff','#e6f9ff','#8fd8f7','#b9ecff','#9ddcf8','#f2fcff','#7fcbee']},
 {id:'neon',name:'Neon',need:22,neon:true,pal:[]},
 {id:'magma',name:'Magma',need:35,pal:['#ff4d2e','#ff7a18','#ffb142','#e8321d','#ff6a2b','#ffa133','#ff905a','#c9251a']}
];
function skinById(id){ for(var i=0;i<SKINS.length;i++)if(SKINS[i].id===id)return SKINS[i]; return SKINS[0]; }
function curSkin(){ var s=skinById(mem.skin); if(totalStars()<s.need)s=SKINS[0]; return s; }

/* ---------- ses ve müzik (audio.js) ---------- */
var KA=window.KDA, sfx=KA.sfx;
KA.setPrefs({sound:mem.sound,music:mem.music});
/* tarayıcılar sesi ilk dokunuşta açmaya izin verir */
document.addEventListener('pointerdown',function(){ KA.unlock(); },{capture:true});
function vib(p){ if(mem.vib&&navigator.vibrate){ try{navigator.vibrate(p);}catch(e){} } }
function setPour(v){ KA.setPour(v); }

/* ---------- çizim ---------- */
var cv=$('cv'), ctx=cv.getContext('2d');
var sc=1, ox=0, oy=0, dpr=1, cw=0, ch=0;
var sim=null, level=null, mode=null, wallCache=null, particles=[], t0=performance.now();
var shake=0, flipFlash=0;

function resize(){
  if(typeof stopDraw==='function')stopDraw();
  var r=cv.parentNode.getBoundingClientRect();
  dpr=Math.min(window.devicePixelRatio||1,2);   // 2'nin üstü görünür fark vermez, düşük donanımlı telefonda kare hızını düşürür
  cw=Math.max(50,Math.floor(r.width)); ch=Math.max(50,Math.floor(r.height));
  cv.width=Math.floor(cw*dpr); cv.height=Math.floor(ch*dpr); cv.style.width=cw+'px'; cv.style.height=ch+'px';
  sc=Math.min((cw-4)/W,(ch-4)/H); ox=(cw-W*sc)/2; oy=(ch-H*sc)/2;
  wallCache=null;
}
window.addEventListener('resize',function(){ if(!$('game').hidden)resize(); });
window.addEventListener('orientationchange',function(){ setTimeout(function(){ if(!$('game').hidden)resize(); },250); });
if(window.visualViewport)window.visualViewport.addEventListener('resize',function(){ if(!$('game').hidden)resize(); });

var plankMaskArr=null;
function computePlankMask(L){
  var m=new Uint8Array(GW*GH);
  if(L&&L.planks&&L.planks.length){
    var tmp=new K.Sim({emitters:[],cups:[],planks:L.planks,seed:1});
    for(var i=0;i<m.length;i++){ if(tmp.t[i]===K.WALL){ var x=i%GW,y=(i/GW)|0; if(x>0&&y>0&&x<GW-1&&y<GH-1)m[i]=1; } }
  }
  return m;
}
function drawPlanks(g,L){
  if(!L||!L.planks||!L.planks.length)return;
  g.save(); g.lineCap='round'; g.globalAlpha=0.9;
  L.planks.forEach(function(p){
    var w=Math.max(9,p.w||10);
    g.strokeStyle='#5f8fcc'; g.lineWidth=w; g.beginPath(); g.moveTo(p.x1,p.y1); g.lineTo(p.x2,p.y2); g.stroke();
    g.strokeStyle='#a9cdf5'; g.lineWidth=Math.max(3,w-5); g.beginPath(); g.moveTo(p.x1,p.y1); g.lineTo(p.x2,p.y2); g.stroke();
    g.strokeStyle='rgba(255,255,255,0.6)'; g.lineWidth=1.6; g.beginPath(); g.moveTo(p.x1,p.y1-2); g.lineTo(p.x2,p.y2-2); g.stroke();
  });
  g.restore();
}
function buildWallCache(){
  var c=document.createElement('canvas'), pw=Math.ceil(W*sc*dpr), ph=Math.ceil(H*sc*dpr);
  c.width=pw; c.height=ph; var g=c.getContext('2d'), k=sc*dpr*CELL;
  var t=sim.t, pm=computePlankMask(sim.L), wall=function(x,y){ return x>=0&&y>=0&&x<GW&&y<GH&&t[y*GW+x]===K.WALL&&!pm[y*GW+x]; };
  var CUPTINT={16:'#ff6b7a',17:'#5aaeff',18:'#b4c2d6',19:'#eef2ff',20:'#b07a52'};
  var tints=sim.cups.filter(function(cp){ return cp.color&&CUPTINT[cp.color]; }).map(function(cp){ return {c:CUPTINT[cp.color],x0:cp.x/CELL-4,x1:(cp.x+cp.w)/CELL+4,y0:cp.y/CELL-4,y1:(cp.y+cp.h)/CELL+4}; });
  var wallCol=function(x,y){ for(var q=0;q<tints.length;q++){ var tq=tints[q]; if(x>=tq.x0&&x<=tq.x1&&y>=tq.y0&&y<=tq.y1)return tq.c; } return '#7aa8e0'; };
  for(var pass=0;pass<2;pass++){
    for(var y=1;y<GH-1;y++)for(var x=1;x<GW-1;x++){
      if(!wall(x,y))continue;
      if(pass===0){ g.fillStyle=wallCol(x,y); g.fillRect(x*k-0.4,y*k-0.4,k+0.8,k+0.8); }
      else {
        g.fillStyle='rgba(240,250,255,0.85)';
        if(!wall(x-1,y))g.fillRect(x*k,y*k,Math.max(1,k*0.28),k);
        if(!wall(x,y-1))g.fillRect(x*k,y*k,k,Math.max(1,k*0.28));
        g.fillStyle='rgba(20,40,90,0.35)';
        if(!wall(x+1,y))g.fillRect((x+1)*k-Math.max(1,k*0.28),y*k,Math.max(1,k*0.28),k);
        if(!wall(x,y+1))g.fillRect(x*k,(y+1)*k-Math.max(1,k*0.28),k,Math.max(1,k*0.28));
      }
    }
  }
  wallCache=c;
}

/* dünya temaları: [üst, alt, ışık] — her dünyanın kendi rengi var */
var WORLD_BG=[['#1b2062','#0b0d2a','#6a7bff'],['#2d1b66','#10092c','#b06bff'],['#12406a','#08172e','#38d0ff'],['#0f4d58','#07222c','#3df0c8'],['#612c1c','#26100b','#ff9a5c'],['#1b5d3c','#0a2519','#5cff9a'],['#611b4d','#260a1e','#ff5cb8'],['#614c1b','#261d0a','#ffd25c'],['#2c3274','#0b0d27','#8ea0ff'],['#62192b','#260a11','#ff5c6c']];
function hexA(h,a){ var n=parseInt(h.slice(1),16); return 'rgba('+(n>>16)+','+((n>>8)&255)+','+(n&255)+','+a+')'; }
var KIND_HEX={16:'#ff5a6a',17:'#4aa8ff',18:'#9fb0c4',19:'#f4f6ff',20:'#8b5a3c'};
var KIND_RGB={16:'255,90,106',17:'74,168,255',18:'159,176,196',19:'244,246,255',20:'139,90,60'};
var KIND_LIGHT={16:'#ff8a96',17:'#8cc6ff',18:'#c9d6e6',19:'#ffffff',20:'#c08a5c'};
/* renk körlüğü desteği: renkli huni ve bardaklar ayrıca şekille işaretlenir */
var KIND_SYM={16:'▲',17:'●',18:'■',19:'◆',20:'✚'};
var RM=false; try{ RM=window.matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){}
/* çizgi görsel kalınlığı: fizikten bağımsız ayarlanır (fizik yarıçapı: KD.CFG.drawR) */
var INK_VIS={glow:11,mid:6.4,core:2.4};
/* Üç çizgi stili (ayarlardan seçilir). Orta kalınlık fiziksel kalınlığa (≈8 birim) yakın tutulur: kum çizginin gerçek üstünde durur. */
var LINE_NAMES=['Işıklı','Beyaz özlü','Mat'];
function drawStroke(g,path,style){
  if(style===1){            // beyaz merkez + mor/mercan kenar
    path(); g.strokeStyle='rgba(20,10,50,0.55)'; g.lineWidth=8.6; g.stroke();
    path(); g.strokeStyle='#b69cff'; g.lineWidth=7; g.stroke();
    path(); g.strokeStyle='#ffffff'; g.lineWidth=3.2; g.stroke();
  } else if(style===2){     // mat, temiz, koyu dış hat ile kum üstünde seçilir
    path(); g.strokeStyle='rgba(8,10,30,0.7)'; g.lineWidth=8.4; g.stroke();
    path(); g.strokeStyle='#3fe0c5'; g.lineWidth=6; g.stroke();
  } else {                  // ince, yumuşak ışıklı turkuaz
    path(); g.strokeStyle='rgba(120,230,255,0.20)'; g.lineWidth=INK_VIS.glow; g.stroke();
    path(); g.strokeStyle='#7fe7ff'; g.lineWidth=INK_VIS.mid; g.shadowColor='#4fd6ff'; g.shadowBlur=8; g.stroke();
    g.shadowBlur=0; path(); g.strokeStyle='#f4fdff'; g.lineWidth=INK_VIS.core; g.stroke();
  }
}

function drawWorld(g,s,opts){
  opts=opts||{};
  var tm=(performance.now()-t0)/1000, flipped=s.g===-1;
  /* arka plan */
  var wb=WORLD_BG[((s.L&&s.L.world)||1)-1]||WORLD_BG[0];
  var gr=g.createLinearGradient(0,0,0,ch);
  if(!flipped){ gr.addColorStop(0,wb[0]); gr.addColorStop(1,wb[1]); }
  else { gr.addColorStop(0,'#0b3a44'); gr.addColorStop(1,wb[0]); }
  g.fillStyle=gr; g.fillRect(0,0,cw,ch);
  var rg=g.createRadialGradient(cw/2,ch*0.12,10,cw/2,ch*0.12,ch*0.75);
  rg.addColorStop(0,hexA(flipped?'#3df0d0':wb[2],0.20)); rg.addColorStop(1,hexA(wb[2],0));
  g.fillStyle=rg; g.fillRect(0,0,cw,ch);
  if(RM)shake=0;
  g.save(); g.translate(ox+(shake?(Math.random()-0.5)*shake:0),oy+(shake?(Math.random()-0.5)*shake:0)); g.scale(sc,sc);
  /* alan paneli */
  g.fillStyle='rgba(255,255,255,0.035)'; g.fillRect(0,0,W,H);
  g.strokeStyle='rgba(255,255,255,0.10)'; g.lineWidth=1.5/sc*1.2; g.strokeRect(0,0,W,H);
  /* nokta ızgara */
  g.fillStyle='rgba(255,255,255,0.045)';
  for(var gy=40;gy<H;gy+=40)for(var gx=40;gx<W;gx+=40){ g.fillRect(gx-1,gy-1,2,2); }
  /* fizik bölgeleri */
  drawZones(g,s,tm);
  /* lav */
  (s.L.lava||[]).forEach(function(v){
    var lg=g.createLinearGradient(0,v.y,0,v.y+v.h);
    lg.addColorStop(0,'#ffb04a'); lg.addColorStop(0.4,'#ff6a1f'); lg.addColorStop(1,'#b3141f');
    g.save(); g.shadowColor='rgba(255,90,30,0.85)'; g.shadowBlur=22; g.fillStyle=lg;
    g.beginPath(); g.moveTo(v.x,v.y+v.h);
    for(var xx=0;xx<=v.w;xx+=4){ g.lineTo(v.x+xx,v.y+Math.sin(tm*2.4+xx*0.18+v.x)*2.4); }
    g.lineTo(v.x+v.w,v.y+v.h); g.closePath(); g.fill(); g.restore();
    g.save(); g.translate(v.x+v.w/2,v.y+2); g.scale(v.w/2+16,30); var hz=g.createRadialGradient(0,0,0,0,0,1); hz.addColorStop(0,'rgba(255,120,40,0.34)'); hz.addColorStop(1,'rgba(255,120,40,0)'); g.fillStyle=hz; g.beginPath(); g.arc(0,0,1,Math.PI,0); g.fill(); g.restore();
    g.fillStyle='rgba(255,230,150,0.7)';
    for(var b=0;b<3;b++){ var bx=v.x+((b*0.37+tm*0.15+v.y*0.01)%1)*v.w, by=v.y+v.h*0.55+Math.sin(tm*3+b*2)*v.h*0.25; g.beginPath(); g.arc(bx,by,2+((b+1)%3),0,6.283); g.fill(); }
  });
  /* bardak içleri + çizgi */
  s.cups.forEach(function(cp){
    var tint=cp.color?KIND_RGB[cp.color]:'190,220,255';
    var ix=cp.c0*CELL, iw=(cp.c1-cp.c0)*CELL;
    var y0=cp.dir==='up'?cp.lineY-0:0;
    g.fillStyle='rgba('+tint+',0.07)';
    if(cp.dir==='up') g.fillRect(ix,cp.y,iw,cp.y+cp.h-cp.y); else g.fillRect(ix,cp.y,iw,cp.h);
    if(!cp.count)return;
    var col=cp.ok?'#7dffb2':(cp.color?KIND_LIGHT[cp.color]:'#ffd27a');
    g.save(); g.setLineDash([7,6]); g.strokeStyle=col; g.lineWidth=2.2; g.globalAlpha=0.95;
    g.beginPath(); g.moveTo(ix,cp.lineY); g.lineTo(ix+iw,cp.lineY); g.stroke(); g.restore();
    var pct=Math.round(cp.pct*100); if(pct>100)pct=100;
    var lx=cp.x+cp.w/2, ly=cp.dir==='up'?cp.y-12:cp.lineY-15;
    if(cp.dir==='up'){ if(ly<14)ly=cp.y+cp.h+16; if(ly>H-6)ly=cp.y-12; }
    g.font='800 15px Nunito, system-ui, sans-serif'; g.textAlign='center'; g.textBaseline='middle';
    var sym=cp.color&&KIND_SYM[cp.color]?KIND_SYM[cp.color]+' ':'';
    var label=(cp.ok?'✓ ':'')+sym+pct+'%'; var tw=g.measureText(label).width+16;
    g.fillStyle='rgba(8,10,28,0.78)'; roundRect(g,lx-tw/2,ly-11,tw,22,11); g.fill();
    g.strokeStyle=col; g.lineWidth=1.4; g.stroke();
    g.fillStyle=col; g.fillText(label,lx,ly+1);
  });
  /* duvarlar (cam) */
  s.cups.forEach(function(cp){ var ix=cp.c0*CELL, iw=(cp.c1-cp.c0)*CELL; var sg=g.createLinearGradient(ix,0,ix+iw,0); sg.addColorStop(0,'rgba(255,255,255,0.10)'); sg.addColorStop(0.18,'rgba(255,255,255,0.02)'); sg.addColorStop(0.82,'rgba(255,255,255,0.0)'); sg.addColorStop(1,'rgba(255,255,255,0.06)'); g.fillStyle=sg; g.fillRect(ix,cp.y,iw,cp.h); if(cp.ok){ g.fillStyle='rgba(125,255,178,0.08)'; g.fillRect(ix,cp.y,iw,cp.h); } });
  if(wallCache){ g.globalAlpha=0.8; g.drawImage(wallCache,0,0,W,H); g.globalAlpha=1; }
  drawPlanks(g,s.L);
  drawMovers(g,s,tm);
  /* kum */
  drawSand(g,s,tm);
  /* çizgiler */
  g.save(); g.lineCap='round'; g.lineJoin='round';
  s.strokes.forEach(function(st){
    if(st.pts.length<1)return;
    var pts=st.pts, path=function(){ g.beginPath(); g.moveTo(pts[0][0],pts[0][1]); if(pts.length===1)g.lineTo(pts[0][0]+0.1,pts[0][1]); for(var i=1;i<pts.length;i++)g.lineTo(pts[i][0],pts[i][1]); };
    drawStroke(g,path,mem.line|0);
  });
  g.restore();
  if(tip&&drawing){ g.save(); g.lineWidth=1.6; g.strokeStyle='rgba(255,255,255,0.8)'; g.beginPath(); g.arc(tip.x,tip.y,9,0,6.283); g.stroke(); g.restore(); }
  drawHint(g);
  /* huniler */
  var active=s.state==='run'&&s.g===1&&!s.sealed;
  s.L.emitters.forEach(function(e,i){
    var em=s.em[i], left=em?em.left:e.n, open=active&&left>0;
    var tintA=e.color?KIND_LIGHT[e.color]:'#cfd6ff';
    var tintB=e.color?KIND_HEX[e.color]:'#6a74b8';
    var fg=g.createLinearGradient(e.x-30,0,e.x+30,0); fg.addColorStop(0,tintB); fg.addColorStop(0.45,tintA); fg.addColorStop(1,tintB);
    g.save(); g.globalAlpha=open||s.state==='ready'?1:0.55; g.fillStyle=fg;
    var nk=((e.spread|0)>3?(e.spread*5+6)/2:7), tp=24+(nk-7)*1.1; g.beginPath(); g.moveTo(e.x-tp,e.y-42); g.lineTo(e.x+tp,e.y-42); g.lineTo(e.x+nk,e.y-10); g.lineTo(e.x+nk,e.y-3); g.lineTo(e.x-nk,e.y-3); g.lineTo(e.x-nk,e.y-10); g.closePath(); g.fill();
    g.fillStyle='rgba(255,255,255,0.4)'; g.beginPath(); g.moveTo(e.x-tp+4,e.y-40); g.lineTo(e.x-tp+12,e.y-40); g.lineTo(e.x-nk+3,e.y-12); g.lineTo(e.x-nk,e.y-12); g.closePath(); g.fill();
    if(e.color&&KIND_SYM[e.color]){ g.fillStyle='rgba(10,12,30,0.85)'; g.font='800 13px Nunito, system-ui, sans-serif'; g.textAlign='center'; g.textBaseline='middle'; g.fillText(KIND_SYM[e.color],e.x,e.y-30); }
    g.restore();
  });
  /* parçacıklar */
  for(var i=particles.length-1;i>=0;i--){
    var p=particles[i]; p.life-=1/60; if(p.life<=0){particles.splice(i,1);continue;}
    p.vy+=p.g; p.x+=p.vx; p.y+=p.vy; if(p.rot!==undefined)p.rot+=p.vr;
    g.globalAlpha=Math.min(1,p.life*2); g.fillStyle=p.c;
    if(p.rot!==undefined){ g.save(); g.translate(p.x,p.y); g.rotate(p.rot); g.fillRect(-p.s,-p.s*0.5,p.s*2,p.s); g.restore(); }
    else { g.beginPath(); g.arc(p.x,p.y,p.s,0,6.283); g.fill(); }
    g.globalAlpha=1;
  }
  g.restore();
  if(flipFlash>0){ g.fillStyle='rgba(120,255,230,'+(flipFlash*(RM?0.08:0.25))+')'; g.fillRect(0,0,cw,ch); flipFlash=Math.max(0,flipFlash-0.04); }
  if(shake>0)shake=Math.max(0,shake-0.6);
}

function drawMovers(g,s,tm){
  if(!s.movers||!s.movers.length)return;
  g.save(); g.lineCap='round';
  s.movers.forEach(function(m){
    var w=m.w||10;
    if(m.k==='slide'){ g.strokeStyle='rgba(255,198,92,0.16)'; g.lineWidth=2; g.setLineDash([4,6]); g.beginPath(); g.moveTo(m.ax,m.ay); g.lineTo(m.bx,m.by); g.stroke(); g.setLineDash([]); }
    var sg=s.moverSeg(m,s.frame);
    if(!sg){ // açık kapı: hayalet çizgi
      var ex=m.x+m.len*Math.cos(m.ang||0), ey=m.y+m.len*Math.sin(m.ang||0);
      g.strokeStyle='rgba(255,198,92,0.22)'; g.lineWidth=2; g.setLineDash([3,5]); g.beginPath(); g.moveTo(m.x,m.y); g.lineTo(ex,ey); g.stroke(); g.setLineDash([]);
      return;
    }
    g.strokeStyle='rgba(255,176,60,0.9)'; g.lineWidth=w; g.shadowColor='rgba(255,176,60,0.8)'; g.shadowBlur=10;
    g.beginPath(); g.moveTo(sg[0],sg[1]); g.lineTo(sg[2],sg[3]); g.stroke();
    g.shadowBlur=0; g.strokeStyle='#ffe7b0'; g.lineWidth=Math.max(2,w-6);
    g.beginPath(); g.moveTo(sg[0],sg[1]); g.lineTo(sg[2],sg[3]); g.stroke();
    if(m.k==='swing'||m.k==='rot'){ var px=m.k==='swing'?m.cx:m.cx, py=m.k==='swing'?m.cy:m.cy; g.fillStyle='#6a4a1a'; g.beginPath(); g.arc(px,py,5,0,6.283); g.fill(); g.fillStyle='#ffd27a'; g.beginPath(); g.arc(px,py,2.4,0,6.283); g.fill(); }
  });
  g.restore();
}
var ZONE_STYLE={goo:['91,227,160','Reçine'],windR:['127,200,255','Rüzgâr'],windL:['127,200,255','Rüzgâr'],boost:['255,122,217','Hız']};
function drawZones(g,s,tm){
  var zs=s.L.zones; if(!zs||!zs.length)return;
  zs.forEach(function(z){
    var st=ZONE_STYLE[z.k]; if(!st)return;
    g.save(); g.beginPath(); g.rect(z.x,z.y,z.w,z.h); g.clip();
    var gr=g.createLinearGradient(0,z.y,0,z.y+z.h); gr.addColorStop(0,'rgba('+st[0]+',0.05)'); gr.addColorStop(1,'rgba('+st[0]+',0.17)');
    g.fillStyle=gr; g.fillRect(z.x,z.y,z.w,z.h);
    g.strokeStyle='rgba('+st[0]+',0.55)'; g.lineWidth=1.4; g.setLineDash([5,5]); g.strokeRect(z.x+0.7,z.y+0.7,z.w-1.4,z.h-1.4); g.setLineDash([]);
    g.strokeStyle='rgba('+st[0]+',0.55)'; g.fillStyle='rgba('+st[0]+',0.5)'; g.lineWidth=2.2; g.lineCap='round'; g.lineJoin='round';
    var k;
    if(z.k==='goo'){ for(k=0;k<7;k++){ var bx=z.x+((k*0.37+0.1)%1)*z.w, by=z.y+z.h-((tm*0.12+k*0.21)%1)*z.h; g.beginPath(); g.arc(bx,by,2+(k%3),0,6.283); g.fill(); } }
    else if(z.k==='windR'||z.k==='windL'){ var dr=z.k==='windR'?1:-1; for(k=0;k<6;k++){ var yy=z.y+8+((k*0.173)%1)*(z.h-16), ph=((tm*0.35+k*0.29)%1), xx=dr>0?z.x+ph*z.w:z.x+z.w-ph*z.w; g.beginPath(); g.moveTo(xx-5*dr,yy-5); g.lineTo(xx,yy); g.lineTo(xx-5*dr,yy+5); g.stroke(); } }
    else { for(k=0;k<5;k++){ var xx2=z.x+10+((k*0.213)%1)*(z.w-20), ph2=((tm*0.8+k*0.31)%1), yy2=z.y+ph2*z.h; g.beginPath(); g.moveTo(xx2-5,yy2-4); g.lineTo(xx2,yy2+3); g.lineTo(xx2+5,yy2-4); g.stroke(); } }
    g.restore();
    g.save(); g.font='800 11px Nunito, system-ui, sans-serif'; g.fillStyle='rgba('+st[0]+',0.85)'; g.textAlign='left'; g.textBaseline='top'; g.fillText(st[1],z.x+5,z.y+4); g.restore();
  });
}
function roundRect(g,x,y,w,h,r){ g.beginPath(); g.moveTo(x+r,y); g.arcTo(x+w,y,x+w,y+h,r); g.arcTo(x+w,y+h,x,y+h,r); g.arcTo(x,y+h,x,y,r); g.arcTo(x,y,x+w,y,r); g.closePath(); }

var batches=[];
function drawSand(g,s,tm){
  var skin=curSkin(), pal=skin.pal;
  if(skin.neon){ pal=[]; for(var q=0;q<8;q++)pal.push('hsl('+((tm*60+q*45)%360)+',100%,62%)'); }
  var np=pal.length, n=np+5, b;
  for(b=0;b<n;b++)batches[b]=[];
  var t=s.t,c=s.c,r=CELL*0.64;
  for(var y=1;y<GH-1;y++){
    var row=y*GW;
    for(var x=1;x<GW-1;x++){
      if(t[row+x]!==K.S)continue;
      var ci=c[row+x], bi=ci>=16?np+(ci-16):(ci&7);
      batches[bi].push(x,y);
    }
  }
  g.fillStyle='rgba(5,6,20,0.30)'; g.beginPath();
  for(b=0;b<n;b++){ var sa=batches[b]; for(var si=0;si<sa.length;si+=2){ var sx=sa[si]*CELL+CELL/2+0.6, sy=sa[si+1]*CELL+CELL/2+1.0; g.moveTo(sx+r+0.5,sy); g.arc(sx,sy,r+0.5,0,6.283); } }
  g.fill();
  for(b=0;b<n;b++){
    var arr=batches[b]; if(!arr.length)continue;
    g.fillStyle=b>=np?KIND_HEX[16+b-np]:pal[b];
    g.beginPath();
    for(var i=0;i<arr.length;i+=2){ var px=arr[i]*CELL+CELL/2, py=arr[i+1]*CELL+CELL/2; g.moveTo(px+r,py); g.arc(px,py,r,0,6.283); }
    g.fill();
  }
  g.fillStyle='rgba(255,255,255,0.28)';
  g.beginPath();
  for(b=0;b<n;b++){ var a2=batches[b]; for(var k=0;k<a2.length;k+=6){ var hx=a2[k]*CELL+CELL*0.38, hy=a2[k+1]*CELL+CELL*0.36; g.moveTo(hx+1,hy); g.arc(hx,hy,0.9,0,6.283);} }
  g.fill();
}

/* ---------- oyun akışı ---------- */
var autoTimer=null, resultTimer=null, hintTimer=null, curMode='level', curIndex=0, dailyInfo=null;
var drawing=false, rawPts=[], lastRaw=null, tip=null;

/* Android geri tuşu / tarayıcı geri: ana ekran dışındaki her ekran tek bir geçmiş kaydı tutar.
   Geri basılınca oyundan bölüm listesine, diğer ekranlardan ana ekrana dönülür; ana ekranda geri uygulamadan çıkar. */
var navIgnore=0;
function navSync(name){
  try{
    var sub=history.state&&history.state.kd==='sub';
    if(name!=='home'&&!sub)history.pushState({kd:'sub'},'');
    else if(name==='home'&&sub){ navIgnore++; history.back(); }
  }catch(e){}
}
try{ if(!history.state||!history.state.kd)history.replaceState({kd:'home'},''); }catch(e){}
window.addEventListener('popstate',function(){
  if(navIgnore>0){ navIgnore--; return; }
  if(!$('game').hidden){ clearTimeout(autoTimer); clearTimeout(resultTimer); $('modal').hidden=true; showScreen(curMode==='daily'?'home':'levels'); }
  else if($('home').hidden)showScreen('home');
});
/* Android uygulaması (Capacitor): donanım geri tuşu yukarıdaki geçmiş mantığını kullanır, ana ekranda uygulamayı kapatır */
(function(){
  var App=window.Capacitor&&window.Capacitor.Plugins&&window.Capacitor.Plugins.App;
  if(!App||!App.addListener)return;
  App.addListener('backButton',function(){
    if(!$('home').hidden){ App.exitApp(); return; }
    history.back();
  });
  /* uygulama arka plana alınınca çizimi bitir, sesi durdur */
  App.addListener('pause',function(){ if(typeof stopDraw==='function')stopDraw(); KA.setHidden(true); });
  App.addListener('resume',function(){ KA.setHidden(false); });
})();
function showScreen(name){
  navSync(name);
  ['home','levels','collection','stats','game'].forEach(function(n){ $(n).hidden=(n!==name); });
  if(name!=='game'){ setPour(0); clearTimeout(autoTimer); clearTimeout(resultTimer); sim=null; particles=[]; drawing=false; wallCache=null; }
  if(name==='home')renderHome();
  if(name==='levels')renderLevels();
  if(name==='collection')renderCollection();
  if(name==='stats')renderStats();
  if(name==='game'){ requestAnimationFrame(function(){ resize(); }); }
}

function startLevel(mode,idx){
  curMode=mode; curIndex=idx;
  clearTimeout(autoTimer); clearTimeout(resultTimer); clearTimeout(hintTimer);
  $('modal').hidden=true;
  if(mode==='daily'){
    if(!dailyInfo||dailyInfo.date!==today()){ var d=KL.buildDaily(today()); dailyInfo={date:today(),level:d.level,sol:d.sol}; }
    level=dailyInfo.level;
  } else level=LEVELS[idx];
  sim=new K.Sim(JSON.parse(JSON.stringify(level)));
  particles=[]; drawing=false; rawPts=[]; lastRaw=null; wallCache=null;
  showScreen('game');
  $('lvTitle').textContent=mode==='daily'?level.name:(level.id+' · '+level.name);
  document.getElementById('game').setAttribute('data-world',mode==='daily'?'0':String(level.world||1));
  $('hint').textContent=level.hint||'';
  $('btnFlip').hidden=!(level.flips>0);
  $('btnPlay').hidden=false;
  updateHud();
  resize(); buildWallCacheLater();
  hintUntil=0; if(hintLevelId!==(mode==='daily'?'d':level.id))hintLevelId=null;   // aynı bölüm yeniden başlarsa ipucu tekrar ücretlenmez
  mem.stat.plays++; save();
  if(level.autostart){ autoTimer=setTimeout(function(){ if(sim&&sim.state==='ready'){ sim.start(); sfx.start(); } },1100); }
}
function buildWallCacheLater(){ requestAnimationFrame(function(){ if(sim){ resize(); buildWallCache(); } }); }

var toastT=null, giftNow=false;
function toast(msg,ms){ var t=$('toast'); t.textContent=msg; t.hidden=false; clearTimeout(toastT); toastT=setTimeout(function(){ t.hidden=true; },ms||2600); }
/* İpucu: referans çözümün hayalet çizgisini kısa süre gösterir (otomatik çözmez, çizgiyi oyuncu çizer). */
var hintUntil=0, hintLevelId=null;
function hintSteps(){ if(curMode==='daily')return dailyInfo&&dailyInfo.sol?dailyInfo.sol.steps.map(function(s){ return {s:s.strokes,flip:s.flip,w:s.when,n:s.n}; }):null; return (KL.SOLS&&KL.SOLS[level.id])||null; }
function showHint(){
  if(!sim||(sim.state!=='ready'&&sim.state!=='run'))return;
  var st=hintSteps(); if(!st){ toast('Bu bölüm için ipucu yok.'); return; }
  var key=curMode==='daily'?'d':level.id;
  if(hintLevelId!==key){ if(mem.hints<=0){ toast('İpucu hakkın bitti. Her gün +1 hediye, patron bölümü yenince +1.',3200); return; } mem.hints--; hintLevelId=key; save(); }
  hintUntil=performance.now()+12000;
  var flips=st.filter(function(x){ return x.flip; }).length, strokes=st.filter(function(x){ return x.s&&x.s.length; }).length;
  var msg=strokes?('Kesikli çizgiyi kendin çiz.'+(flips?(' Kum dolunca ⇅ ile çevir ('+flips+' kez).'):'')):(flips?('Çizgi gerekmiyor. Kum dolunca ⇅ ile çevir ('+flips+' kez).'):'Çizgi gerekmiyor.');
  toast(msg,3200);
  updateHud();
}
function drawHint(g){
  var now=performance.now(); if(now>hintUntil||drawing)return; var st=hintSteps(); if(!st)return;
  g.save(); g.lineCap='round'; g.lineJoin='round'; var k=0, off=-(now/40)%30;
  st.forEach(function(x){ (x.s||[]).forEach(function(pl){ k++;
    g.setLineDash([9,7]); g.lineDashOffset=off; g.strokeStyle='rgba(255,236,160,0.95)'; g.lineWidth=3.2; g.globalAlpha=0.55+0.35*Math.sin(now/260);
    g.beginPath(); g.moveTo(pl[0][0],pl[0][1]); for(var i=1;i<pl.length;i++)g.lineTo(pl[i][0],pl[i][1]); g.stroke();
    g.setLineDash([]); g.globalAlpha=1; g.fillStyle='rgba(255,236,160,0.95)'; g.beginPath(); g.arc(pl[0][0],pl[0][1],9,0,6.283); g.fill();
    g.fillStyle='#2a1a00'; g.font='800 12px Nunito, system-ui, sans-serif'; g.textAlign='center'; g.textBaseline='middle'; g.fillText(String(k),pl[0][0],pl[0][1]+0.5); }); });
  g.restore();
}
function updateHud(){
  if(!sim)return;
  $('hintN').textContent=mem.hints;
  var ri=sim.ink>0?Math.max(0,(sim.ink-sim.inkUsed)/sim.ink):0, rs=Math.max(0,(sim.total-sim.emitted)/sim.total);
  $('inkFill').style.width=(ri*100)+'%'; $('sandFill').style.width=(rs*100)+'%';
  $('inkWrap').style.opacity=sim.ink>0?1:0.35;
  $('flipCount').textContent=sim.flipsLeft;
  $('btnFlip').disabled=!(sim.state==='run'&&sim.flipsLeft>0);
  $('btnFlip').classList.toggle('ready',sim.state==='run'&&sim.flipsLeft>0&&sim.emitted>=sim.total*0.35);
  $('btnPlay').hidden=sim.state!=='ready';
  $('btnUndo').disabled=!sim.strokes.length||sim.state==='win'||sim.state==='fail';
}

function toWorld(e){
  var r=cv.getBoundingClientRect(), x=(e.clientX-r.left-ox)/sc, y=(e.clientY-r.top-oy)/sc;
  return [Math.min(W-8,Math.max(8,x)),Math.min(H-8,Math.max(8,y))];
}
/* Dokunmatik çizim: tek parmak izlenir (ikinci parmak yok sayılır), titreme ölü bölge + hıza bağlı yumuşatma ile azaltılır.
   Çizgi parmağın temas noktasının tam altında oluşur (kaydırma yok). Bitişte son nokta kesin eklenir, parmak kalkma kıvrımı kırpılır. */
var activeId=null, filt=null, DEAD=1.0;
function stopDraw(){ if(drawing)endDraw(null); }
cv.addEventListener('pointerdown',function(e){
  if(drawing)return;                       // ikinci parmak: yoksay
  if(!sim||(sim.state!=='ready'&&sim.state!=='run'))return;
  if(e.pointerType==='mouse'&&e.button!==0)return;
  e.preventDefault(); try{cv.setPointerCapture(e.pointerId);}catch(_){}
  clearTimeout(autoTimer); drawing=true; activeId=e.pointerId;
  var p=toWorld(e); lastRaw=p; filt={x:p[0],y:p[1]}; tip={x:p[0],y:p[1]};
  sim.beginStroke(p[0],p[1]); sfx.draw();
});
cv.addEventListener('pointermove',function(e){
  if(!drawing||e.pointerId!==activeId)return; e.preventDefault();
  var evs=e.getCoalescedEvents?e.getCoalescedEvents():[e];
  if(!evs.length)evs=[e];
  for(var k=0;k<evs.length;k++){
    var p=toWorld(evs[k]); lastRaw=p;
    var dx=p[0]-filt.x, dy=p[1]-filt.y, d=Math.hypot(dx,dy);
    if(d<DEAD)continue;                                   // küçük titreme: yoksay
    var a=Math.min(1,0.5+d*0.07);                         // hızlı harekette gecikme yok, yavaşta yumuşak
    filt.x+=dx*a; filt.y+=dy*a;
    sim.extendStroke(filt.x,filt.y);
  }
  tip={x:lastRaw[0],y:lastRaw[1]};
  var mv=0; for(var q=0;q<evs.length;q++)mv+=Math.abs(evs[q].movementX||0)+Math.abs(evs[q].movementY||0);
  KA.setDraw(mv||6);   // kalem sesi hızla artar
  updateHud();
});
function endDraw(e){
  if(!drawing)return; if(e&&e.pointerId!==undefined&&e.pointerId!==activeId)return;
  drawing=false; activeId=null; tip=null; KA.setDraw(0);
  if(lastRaw&&sim)sim.extendStroke(lastRaw[0],lastRaw[1]);
  if(sim){
    sim.trimHook();
    var s=sim.strokes[sim.strokes.length-1];
    if(s&&s.pts.length<2)sim.strokes.pop();
  }
  if(sim&&sim.state==='ready'&&sim.strokes.length&&!level.autostart){
    clearTimeout(autoTimer);
    autoTimer=setTimeout(function(){ if(sim&&sim.state==='ready'){ sim.start(); sfx.start(); updateHud(); } },900);
  }
  updateHud();
}
cv.addEventListener('pointerup',endDraw); cv.addEventListener('pointercancel',endDraw); cv.addEventListener('lostpointercapture',endDraw);
cv.addEventListener('touchmove',function(e){ e.preventDefault(); },{passive:false});
cv.addEventListener('touchstart',function(e){ e.preventDefault(); },{passive:false});
document.addEventListener('gesturestart',function(e){ e.preventDefault(); });
document.addEventListener('visibilitychange',function(){ if(document.hidden)stopDraw(); });
window.addEventListener('blur',stopDraw);
cv.addEventListener('contextmenu',function(e){e.preventDefault();});

$('btnPlay').addEventListener('click',function(){ KA.unlock(); clearTimeout(autoTimer); if(sim&&sim.state==='ready'){ sim.start(); sfx.start(); updateHud(); } });
$('btnHint').addEventListener('click',function(){ sfx.hint(); showHint(); });
$('btnUndo').addEventListener('click',function(){ if(sim&&sim.undo()){ sfx.undo(); updateHud(); } });
$('btnRestart').addEventListener('click',function(){ sfx.tap(); startLevel(curMode,curIndex); });
$('btnFlip').addEventListener('click',function(){
  if(sim&&sim.flip()){ sfx.flip(); vib(40); flipFlash=1; shake=6; mem.stat.flips++; updateHud(); }
});
$('btnBack').addEventListener('click',function(){ sfx.tap(); clearTimeout(autoTimer); clearTimeout(resultTimer); $('modal').hidden=true; showScreen(curMode==='daily'?'home':'levels'); });

/* ---------- sonuç ---------- */
function confetti(){
  var cols=['#ffd27a','#7fe7ff','#ff6b8a','#7dffb2','#c7a3ff'];
  for(var i=0;i<(RM?24:110);i++) particles.push({x:W/2+(Math.random()-0.5)*60,y:H*0.35,vx:(Math.random()-0.5)*7,vy:-Math.random()*8-2,g:0.22,life:1.6+Math.random(),s:3+Math.random()*3,c:cols[i%cols.length],rot:Math.random()*6,vr:(Math.random()-0.5)*0.4});
}
function achievements(){
  var A=[
   {id:'first',name:'İlk Dökülüş',desc:'Bir bölümü bitir',ok:function(){return Object.keys(mem.stars).length>=1;}},
   {id:'three',name:'Ustalık',desc:'Bir bölümü 3 yıldızla bitir',ok:function(){for(var k in mem.stars)if(mem.stars[k]>=3)return true;return false;}},
   {id:'ten',name:'Yıldız Toplayıcı',desc:'Toplam 10 yıldıza ulaş',ok:function(){return totalStars()>=10;}},
   {id:'flip',name:'Ters Dünya',desc:'6. bölümü bitir',ok:function(){return !!mem.stars[6];}},
   {id:'streak3',name:'Üç Gün Üst Üste',desc:'Günlük seriyi 3 yap',ok:function(){return mem.best>=3;}},
   {id:'w1',name:'Dünya 1 Bitti',desc:'Temel Mekanikler dünyasını tamamla',ok:function(){return worldDone(1)>=worldCount(1);}},
   {id:'w5',name:'Yarı Yol',desc:'60 bölümü bitir',ok:function(){return Object.keys(mem.stars).length>=60;}},
   {id:'stars100',name:'Yıldız Avcısı',desc:'Toplam 100 yıldıza ulaş',ok:function(){return totalStars()>=100;}},
   {id:'all',name:'Kum Efendisi',desc:'115 bölümün hepsini bitir',ok:function(){return Object.keys(mem.stars).length>=LEVELS.length;}},
   {id:'burn',name:'Lavın Efendisi',desc:'Toplam 500 kum tanesini lavda kaybet',ok:function(){return mem.stat.burned>=500;}}
  ];
  return A;
}
function checkAch(){ achievements().forEach(function(a){ if(!mem.ach[a.id]&&a.ok())mem.ach[a.id]=1; }); }

function finishRun(){
  var r=sim.result; mem.stat.poured+=sim.emitted; mem.stat.burned+=sim.burned;
  if(r&&r.win){
    mem.stat.wins++;
    var daily=curMode==='daily', prevBest=daily?0:(mem.stars[level.id]||0);
    r.prevBest=prevBest;
    var achBefore=Object.keys(mem.ach).length;
    mem=KS.recordWin(mem,{key:daily?today():level.id,daily:daily,stars:r.stars,boss:!daily&&isBoss(curIndex),today:today(),yesterday:yesterday()});
    if(mem._reward){ delete mem._reward; setTimeout(function(){ toast('Ödül: +1 ipucu 💡'); },1500); }
    checkAch(); save();
    r.newAch=achievements().filter(function(a){ return mem.ach[a.id]; }).length>achBefore;
    sfx.win(); vib([30,40,60]); confetti(); shake=5;
    resultTimer=setTimeout(function(){ showModal(true,r); },900);
  } else {
    sfx.fail(); vib(90); if(curMode==='level'){ mem.fails[level.id]=(mem.fails[level.id]||0)+1; } save();
    resultTimer=setTimeout(function(){ showModal(false,null); },500);
  }
}
function showModal(win,r){
  var m=$('modal'); m.hidden=false;
  $('mTitle').textContent=win?'Harika!':'Olmadı';
  var st=$('mStars'); st.innerHTML='';
  if(win){
    for(var i=0;i<3;i++){ var sp=document.createElement('span'); sp.className='star'+(i<r.stars?' on':''); sp.textContent='★'; sp.style.animationDelay=(0.15+i*0.25)+'s'; st.appendChild(sp); if(i<r.stars)(function(i){setTimeout(function(){sfx.star(i);},150+i*250);})(i); }
    $('mTitle').textContent=r.stars===3?'Mükemmel!':r.stars===2?'Harika!':'Başardın!';
    $('mText').textContent='Kum: %'+Math.round(r.remSand*100)+' kaldı · Çizgi: %'+Math.round(r.remInk*100)+' kaldı';
    var hasNext=curMode==='level'&&curIndex<LEVELS.length-1;
    $('mNext').hidden=!hasNext; $('mNext').textContent='Sonraki ▶';
    var last=curMode==='level'&&curIndex===LEVELS.length-1;
    var wEnd=curMode==='level'&&hasNext&&isBoss(curIndex);
    var rec=r.prevBest&&r.stars>r.prevBest;
    $('mText2').textContent=(curMode==='daily'?('Seri: '+mem.streak+' gün 🔥 · Yarın yeni bulmaca'):
      (last?'Tüm bölümleri bitirdin! Efsanesin.':
      wEnd?('🌍 Yeni dünya açıldı: '+WORLDS[level.world].name):
      rec?('Yeni rekor: '+r.prevBest+'★ → '+r.stars+'★'):
      (r.stars<3?'3 yıldız için daha az kum ve çizgi harca.':'Tam puan!')));
    $('mSkip').hidden=true; $('mHint').hidden=true;
  } else {
    var burn=sim.burned>sim.total*0.2, inkOut=sim.ink>0&&sim.inkUsed>=sim.ink-1, noLine=sim.ink>0&&!sim.strokes.length;
    var flipLeft=level.flips>0&&sim.flips===0;
    var near=sim.cups.some(function(cp){ return cp.count&&cp.pct>=0.6; });
    $('mTitle').textContent=near?'Az kaldı!':'Bir daha dene';
    $('mText').textContent=burn?'Kumun çoğu lava düştü. Lavın üstüne bir kalkan çizmeyi dene.':
      flipLeft?'Kum yukarı çıkmadı. Kum biraz birikince ⇅ ile yerçekimini çevir.':
      noLine?'Bu bölümde kumu yönlendiren bir çizgi gerekiyor.':
      inkOut?'Çizgi hakkın bitti. Daha kısa ve dik bir çizgi dene.':
      'Bardaklar dolmadı. Çizgiyi biraz kaydırıp tekrar dene.';
    $('mText2').textContent=''; $('mNext').hidden=true;
    var fl=curMode==='level'?(mem.fails[level.id]||0):0;
    var canSkip=curMode==='level'&&fl>=6&&curIndex<LEVELS.length-1&&!mem.stars[level.id]&&!mem.skipped[level.id];
    $('mSkip').hidden=!canSkip;
    $('mHint').hidden=!(fl>=2||curMode==='daily')||!hintSteps()||mem.hints<=0&&hintLevelId!==(curMode==='daily'?'d':level.id);
    if(canSkip)$('mText2').textContent='Takıldın mı? Bu bölümü atlayıp devam edebilirsin.';
    else if(!$('mHint').hidden)$('mText2').textContent='İpucu kesikli çizgiyle yolu gösterir.';
  }
}
$('mAgain').addEventListener('click',function(){ sfx.tap(); startLevel(curMode,curIndex); });
$('mHint').addEventListener('click',function(){ sfx.tap(); startLevel(curMode,curIndex); showHint(); });

$('mNext').addEventListener('click',function(){ sfx.tap(); startLevel('level',curIndex+1); });
$('mSkip').addEventListener('click',function(){ sfx.skip(); mem.skipped[level.id]=1; save(); startLevel('level',curIndex+1); });
$('mMenu').addEventListener('click',function(){ sfx.tap(); $('modal').hidden=true; showScreen(curMode==='daily'?'home':'levels'); });

/* ---------- ekranlar ---------- */
function renderHome(){
  if(mem.gift!==today()){ if(KS.dailyGift(mem,today()))giftNow=true; save(); }
  var gb=$('giftBar'); if(gb){ gb.hidden=!giftNow; gb.textContent='🎁 Günlük hediye: +1 ipucu · Toplam '+mem.hints; }
  giftNow=false;
  var fi=firstOpenIndex(), n=fi+1;
  $('btnPlayMain').textContent=(Object.keys(mem.stars).length?'Devam · Bölüm '+n:'Oyna');
  $('btnPlayMain').onclick=function(){ sfx.tap(); startLevel('level',fi); };
  var done=!!mem.daily[today()];
  $('dailySub').textContent=done?('Bugün tamam · '+mem.daily[today()]+'★'):'Bugünün bulmacası hazır';
  $('streak').textContent=KS.shownStreak(mem,today(),yesterday())+' gün';
  $('totStars').textContent=totalStars();
  $('tgLine').textContent='Çizgi: '+LINE_NAMES[mem.line|0]; $('tgSound').classList.toggle('on',!!mem.sound); $('tgMusic').classList.toggle('on',!!mem.music);
  $('tgSound').setAttribute('aria-pressed',mem.sound?'true':'false'); $('tgMusic').setAttribute('aria-pressed',mem.music?'true':'false'); $('tgVib').setAttribute('aria-pressed',mem.vib?'true':'false'); $('tgVib').classList.toggle('on',!!mem.vib);
}
function renderLevels(){
  var tabs=$('worldTabs'); tabs.innerHTML='';
  var cur=mem.world||1;
  WORLDS.forEach(function(W){
    var b=document.createElement('button'); b.type='button'; b.className='wtab'+(W.id===cur?' sel':'');
    var firstIdx=wRange(W.id)[0], open=isUnlocked(firstIdx);
    b.innerHTML='<b>'+W.id+'</b>'+(open?'':'<i>🔒</i>');
    b.setAttribute('aria-label','Dünya '+W.id+': '+W.name);
    b.addEventListener('click',function(){ sfx.tap(); mem.world=W.id; save(); renderLevels(); });
    tabs.appendChild(b);
  });
  var W=WORLDS[cur-1];
  $('wName').textContent='Dünya '+cur+' · '+W.name; $('wDesc').textContent=W.desc;
  $('wProg').textContent=worldDone(cur)+' / '+worldCount(cur)+' bölüm · '+worldStars(cur)+' / '+(worldCount(cur)*3)+' ★';
  var g=$('lvGrid'); g.innerHTML=''; g.setAttribute('data-world',cur);
  var wr=wRange(cur), nextI=firstOpenIndex(); for(var i=wr[0];i<wr[1];i++)(function(i){
    var L=LEVELS[i], unlocked=isUnlocked(i);
    var b=document.createElement('button'); b.type='button'; b.className='tile'+(unlocked?'':' lock')+(isBoss(i)?' boss':(L.teach&&L.teach!=='Dünya sonu'?' sp':''))+(i===nextI&&!mem.stars[L.id]?' next':'');
    var s=mem.stars[L.id]||0, skp=!s&&mem.skipped[L.id];
    b.innerHTML='<b>'+L.id+'</b><span>'+(skp?'<u>atlandı</u>':'★'.repeat(s)+'<u>'+'★'.repeat(3-s)+'</u>')+'</span>';
    b.disabled=!unlocked; b.setAttribute('aria-label','Bölüm '+L.id+(unlocked?'':' kilitli'));
    b.addEventListener('click',function(){ sfx.tap(); startLevel('level',i); });
    g.appendChild(b);
  })(i);
}
function renderCollection(){
  var g=$('skGrid'); g.innerHTML=''; var tot=totalStars();
  $('skTotal').textContent=tot;
  SKINS.forEach(function(sk){
    var open=tot>=sk.need;
    var b=document.createElement('button'); b.className='skin'+(open?'':' lock')+(mem.skin===sk.id?' sel':'');
    var sw=document.createElement('div'); sw.className='sw';
    var pal=sk.neon?['#ff3df2','#3dffe0','#ffe83d','#7a3dff','#3d9bff','#ff3d6e']:sk.pal;
    for(var i=0;i<6;i++){ var d=document.createElement('i'); d.style.background=pal[i%pal.length]; d.style.left=(8+i*13)+'%'; d.style.top=(20+((i*37)%50))+'%'; sw.appendChild(d); }
    b.appendChild(sw);
    var nm=document.createElement('b'); nm.textContent=sk.name; b.appendChild(nm);
    var sub=document.createElement('span'); sub.textContent=open?(mem.skin===sk.id?'Seçili':'Seç'):('🔒 '+sk.need+' ★ gerekir'); b.appendChild(sub);
    b.disabled=!open;
    b.addEventListener('click',function(){ mem.skin=sk.id; save(); sfx.tap(); renderCollection(); });
    g.appendChild(b);
  });
}
function renderStats(){
  var s=mem.stat;
  var rows=[['Toplam yıldız',totalStars()],['Biten bölüm',Object.keys(mem.stars).length+' / '+LEVELS.length],['Biten dünya',(function(){var c=0;for(var w=1;w<=10;w++)if(worldDone(w)>=worldCount(w))c++;return c;})()+' / 10'],['Günlük bulmaca',Object.keys(mem.daily).length+' gün'],
    ['En uzun seri',mem.best+' gün'],['Dökülen kum',s.poured],['Lavda yanan kum',s.burned],['Çevrilen yerçekimi',s.flips],['Deneme / başarı',s.plays+' / '+s.wins]];
  var g=$('stGrid'); g.innerHTML='';
  rows.forEach(function(r){ var d=document.createElement('div'); d.className='stat'; d.innerHTML='<span>'+r[0]+'</span><b>'+r[1]+'</b>'; g.appendChild(d); });
  var a=$('achList'); a.innerHTML='';
  achievements().forEach(function(x){ var li=document.createElement('li'); var ok=!!mem.ach[x.id]; li.className=ok?'ok':''; li.innerHTML='<b>'+(ok?'★ ':'☆ ')+x.name+'</b><span>'+x.desc+'</span>'; a.appendChild(li); });
}
$('btnDaily').addEventListener('click',function(){ sfx.tap(); startLevel('daily',0); });
$('btnLevels').addEventListener('click',function(){ sfx.tap(); showScreen('levels'); });
$('btnColl').addEventListener('click',function(){ sfx.tap(); showScreen('collection'); });
$('btnStats').addEventListener('click',function(){ sfx.tap(); showScreen('stats'); });
['bk1','bk2','bk3'].forEach(function(id){ $(id).addEventListener('click',function(){ sfx.tap(); showScreen('home'); }); });
$('tgSound').addEventListener('click',function(){
  mem.sound=mem.sound?0:1; save(); KA.setPrefs({sound:mem.sound,music:mem.music}); KA.unlock();
  renderHome(); sfx.toggle(true);
});
$('tgMusic').addEventListener('click',function(){
  mem.music=mem.music?0:1; save(); KA.setPrefs({sound:mem.sound,music:mem.music}); KA.unlock();
  renderHome(); sfx.toggle(!!mem.music);
});
$('tgLine').addEventListener('click',function(){ mem.line=((mem.line|0)+1)%3; save(); renderHome(); sfx.tap(); });
$('tgVib').addEventListener('click',function(){ mem.vib=mem.vib?0:1; save(); renderHome(); vib(30); });

/* ---------- ana ekran arka planı (canlı kum) ---------- */
var hv=document.getElementById('homeCv'), hctx=hv.getContext('2d'), homeSim=null;
function newHomeSim(){ homeSim=new K.Sim({id:0,ink:0,emitters:[{x:330,y:60,n:99999,rate:1.1}],cups:[],seed:Math.floor(Math.random()*9999)}); homeSim.start(); }
function drawHome(){
  var r=hv.parentNode.getBoundingClientRect(); var w=Math.floor(r.width), h=Math.floor(r.height);
  if(hv.width!==w||hv.height!==h){ hv.width=w; hv.height=h; }
  var g=hctx; var gr=g.createLinearGradient(0,0,0,h); gr.addColorStop(0,'#1a1d44'); gr.addColorStop(1,'#0a0c1e'); g.fillStyle=gr; g.fillRect(0,0,w,h);
  if(!homeSim)newHomeSim();
  homeSim.step();
  var pile=0; for(var x=1;x<GW-1;x++)if(homeSim.t[(GH-30)*GW+x]===K.S)pile++;
  if(pile>50)newHomeSim();
  var k=Math.max(w/W,h/H)*1.0, oxh=(w-W*k)/2, oyh=(h-H*k)/2, pal=curSkin().pal.length?curSkin().pal:['#ff3df2','#3dffe0','#ffe83d','#7a3dff'];
  g.save(); g.globalAlpha=0.42; g.translate(oxh,oyh); g.scale(k,k);
  g.fillStyle=pal[0];
  var buckets=[[],[],[],[]];
  for(var y=1;y<GH-1;y++)for(var xx=1;xx<GW-1;xx++){ if(homeSim.t[y*GW+xx]===K.S)buckets[homeSim.c[y*GW+xx]&3].push(xx,y); }
  buckets.forEach(function(arr,bi){ g.fillStyle=pal[bi%pal.length]; g.beginPath(); for(var i=0;i<arr.length;i+=2){ var px=arr[i]*CELL+2.5,py=arr[i+1]*CELL+2.5; g.moveTo(px+3.2,py); g.arc(px,py,3.2,0,6.283);} g.fill(); });
  g.restore();
}

/* bardak efektleri: bardak hedefe ulaşınca kıvılcım patlaması; kum girerken küçük parıltılar */
function cupFx(){
  if(!sim||particles.length>160)return;
  sim.cups.forEach(function(cp,ci){
    if(!cp.count)return;
    if(cp.ok&&!cp._ok)sfx.cup(ci);
    var cx=(cp.c0+cp.c1)/2*CELL, top=cp.dir==='up'?cp.y:cp.y+cp.h, col=cp.color?KIND_LIGHT[cp.color]:'#ffe9a0';
    if(cp.ok&&!cp._ok){ for(var q=0;q<16;q++)particles.push({x:cx+(Math.random()-0.5)*(cp.c1-cp.c0)*CELL*0.8,y:top,vx:(Math.random()-0.5)*2.2,vy:-(cp.dir==='up'?1:-1)*(Math.random()*2.6+0.8),g:0.05*(cp.dir==='up'?1:-1),life:0.7+Math.random()*0.5,s:1.4+Math.random()*1.8,c:q%3?'#9dffc6':col}); vib(15); }
    cp._ok=cp.ok;
    if(cp.match>(cp._lastM||0)+9){ cp._lastM=cp.match; particles.push({x:cx+(Math.random()-0.5)*(cp.c1-cp.c0)*CELL*0.7,y:cp.lineY,vx:(Math.random()-0.5)*0.8,vy:-0.9*(cp.dir==='up'?1:-1),g:0.02,life:0.45,s:1.5,c:col}); }
    if(cp.match<(cp._lastM||0))cp._lastM=cp.match;
  });
}

/* ---------- ana döngü ---------- */
var last=performance.now(), acc=0, idleTick=0;
function frame(now){
  var dt=Math.min(0.05,(now-last)/1000); last=now; acc+=dt;
  if(!$('home').hidden){ drawHome(); }
  else if(!$('game').hidden&&sim){
    if(!wallCache&&sim)buildWallCache();
    var steps=0; while(acc>=1/60&&steps<3){ acc-=1/60; steps++;
      if(sim.state==='run'){ sim.step(); }
      if(sim.fx.length){ sim.fx.forEach(function(f){ for(var q=0;q<3;q++)particles.push({x:f.x*CELL+2,y:f.y*CELL+2,vx:(Math.random()-0.5)*1.6,vy:-Math.random()*2-0.5,g:0.04,life:0.5+Math.random()*0.4,s:1.4+Math.random()*1.6,c:q%2?'#ffb04a':'#ffe9a0'}); sfx.burn(); }); sim.fx.length=0; }
      if(sim.state==='run'&&sim.frame%3===0)cupFx();
      if((sim.state==='win'||sim.state==='fail')&&!sim.reported){ sim.reported=true; finishRun(); }
    }
    if(acc>0.1)acc=0;
    var pouring=sim.state==='run'&&sim.g===1&&!sim.sealed&&sim.emitted<sim.total;
    setPour(pouring?1:0);
    if(sim.frame%4===0||sim.state!=='run')updateHud();
    var idle=sim.state!=='run'&&!drawing&&!particles.length&&flipFlash<=0&&shake<=0;
    idleTick^=1;
    if(!idle||idleTick){ ctx.setTransform(dpr,0,0,dpr,0,0); drawWorld(ctx,sim); }
  } else { acc=0; }
  requestAnimationFrame(frame);
}
/* uygulama arka plana alınınca ses tamamen durur, çizim biter; öne gelince devam eder */
document.addEventListener('visibilitychange',function(){
  if(document.hidden)stopDraw();
  KA.setHidden(document.hidden);
});
showScreen('home');
/* #l50 bağlantısı açık bir bölümü doğrudan açar. Geliştirme için #l50dev kilidi de atlar. */
(function(){ var m=/^#l(\d{1,3})(dev|demo)?$/.exec(location.hash||''); if(m){ var i=+m[1]-1; if(i>=0&&i<KL.LEVELS.length&&(m[2]||isUnlocked(i)))setTimeout(function(){
  startLevel('level',i);
  if(m[2]==='demo'){   // mağaza görselleri için: referans çözümün ilk adımı çizilir ve başlatılır
    var st=KL.SOLS&&KL.SOLS[level.id];
    if(st&&st[0]&&st[0].w==='start')KL.applyStrokes(sim,st[0].s); sim.start();
    for(var k=0;k<170&&sim.state==='run';k++)sim.step(); updateHud();
  }
},50); } })();
requestAnimationFrame(frame);
window.__kd={start:function(m,i){startLevel(m,i);},get sim(){return sim;},mem:function(){return mem;},view:function(){ return {sc:sc,ox:ox,oy:oy}; },adopt:function(s){ if($('game').hidden)showScreen('game'); sim=s; level=s.L; particles=[]; wallCache=null; resize(); updateHud(); }};
})();
