/* Kum Dök — bölüm verisi (dünya 400x600) */
(function(root){
var K=(typeof module!=='undefined'&&module.exports)?require('./engine.js'):root.KD;
var RED=K.RED,BLUE=K.BLUE;
var LEVELS=[];   // bölümler levels-data.js içinde

/* ---------- Günlük bulmaca üreticisi (tarih tohumlu, çözüm doğrulamalı) ---------- */
function hashStr(str){ var h=2166136261; for(var i=0;i<str.length;i++){ h^=str.charCodeAt(i); h=Math.imul(h,16777619);} return h>>>0; }
function mirror(L){
  function mc(c){ var o=Object.assign({},c); o.x=400-c.x-c.w; if(o.open==='R')o.open='L'; else if(o.open==='L')o.open='R'; return o; }
  var o=Object.assign({},L);
  o.emitters=L.emitters.map(function(e){return Object.assign({},e,{x:400-e.x});});
  o.cups=(L.cups||[]).map(mc);
  o.lava=(L.lava||[]).map(function(v){return Object.assign({},v,{x:400-v.x-v.w});});
  o.walls=(L.walls||[]).map(function(v){return Object.assign({},v,{x:400-v.x-v.w});});
  o.planks=(L.planks||[]).map(function(p){return Object.assign({},p,{x1:400-p.x1,x2:400-p.x2});});
  return o;
}
function mirrorSol(sol){
  var o={steps:sol.steps.map(function(st){ var n=Object.assign({},st); if(st.strokes)n.strokes=st.strokes.map(function(pl){return pl.map(function(p){return [400-p[0],p[1]];});}); return n;})};
  return o;
}
function plen(pl){ var d=0; for(var i=1;i<pl.length;i++)d+=Math.hypot(pl[i][0]-pl[i-1][0],pl[i][1]-pl[i-1][1]); return d; }
function applyStrokes(s,strokes){
  (strokes||[]).forEach(function(pl){
    s.beginStroke(pl[0][0],pl[0][1]);
    for(var k=1;k<pl.length;k++){ var a=pl[k-1],b=pl[k],n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/3);
      for(var q=1;q<=n;q++) s.extendStroke(a[0]+(b[0]-a[0])*q/n,a[1]+(b[1]-a[1])*q/n); }
  });
}
/* Çözüm = sıralı adımlar. when: 'start' | 'emitted'(n) | 'frame'(f) | 'quiet'(q: kum q kare durulunca) */
function runSolution(L,sol,maxFrames){
  var s=new K.Sim(L), f=0, idx=0, steps=sol.steps;
  maxFrames=maxFrames||1800;
  while(f<maxFrames){
    while(idx<steps.length){
      var st=steps[idx], ok=false;
      if(st.when==='start')ok=true;
      else if(s.state!=='run')ok=false;
      else if(st.when==='emitted')ok=s.emitted>=st.n;
      else if(st.when==='frame')ok=s.frame>=st.f;
      else if(st.when==='quiet')ok=s.noMove>=st.q;
      if(!ok)break;
      applyStrokes(s,st.strokes); if(st.flip)s.flip(); idx++;
    }
    if(s.state==='ready'&&f>=1)s.start();
    if(s.state==='run')s.step();
    if(s.state==='win'||s.state==='fail')break;
    f++;
  }
  return {state:s.state,sim:s};
}
function dailyTemplate(kind,r){
  var L,sol,ex,cupX,sgn,cupC,S,Eend,len,i;
  if(kind===0){
    ex=Math.round(70+r()*260);
    for(i=0;i<20;i++){ cupX=Math.round(20+r()*270); cupC=cupX+55; if(Math.abs(cupC-ex)>=110)break; }
    sgn=cupC>ex?1:-1;
    S=[ex-sgn*18,160]; Eend=[cupC-sgn*10,Math.min(430,160+Math.abs(cupC-ex)*0.72)];
    len=plen([S,Eend]);
    var planks=[]; for(i=0;i<2;i++){ var x1=Math.round(30+r()*300), y1=Math.round(230+r()*170), a=(r()*0.5-0.25)+(r()<0.5?0:Math.PI), l=45+r()*40;
      planks.push({x1:x1,y1:y1,x2:x1+Math.cos(a)*l,y2:y1+Math.sin(a)*l,w:12}); }
    var lava=[]; if(r()<0.6){ var lw=50+r()*40; lava.push({x:Math.round(Math.min(340,Math.max(10,(ex+cupC)/2-lw/2+(r()*80-40)))),y:Math.round(470+r()*0),w:Math.round(lw),h:22}); lava[0].y=Math.round(330+r()*100); }
    L={name:'Günlük',teach:'Günlük',hint:'Bugünün bulmacası. Kumu bardağa ulaştır.',ink:Math.round(len*1.35+40),flips:0,
      emitters:[{x:ex,y:55,n:520,rate:1.5}],planks:planks,lava:lava,cups:[{x:cupX,y:470,w:110,h:110,fill:0.5}]};
    sol={steps:[{when:'start',strokes:[[S,Eend]]}]};
  } else if(kind===1){
    ex=200+Math.round(r()*20-10); var lw2=Math.round(70+r()*40), ly=Math.round(290+r()*40);
    L={name:'Günlük',teach:'Günlük',hint:'Bugünün bulmacası. Kum iki bardağa da dolmalı.',ink:300,flips:0,
      emitters:[{x:ex,y:55,n:560,rate:1.5}],lava:[{x:Math.round(ex-lw2/2),y:ly,w:lw2,h:30}],
      cups:[{x:30,y:470,w:110,h:110,fill:0.5},{x:260,y:470,w:110,h:110,fill:0.5}]};
    sol={steps:[{when:'start',strokes:[[[120,235],[ex,170],[280,235]]]}]};
  } else if(kind===2){
    var sw=r()<0.5; var rc=K.RED,bc=K.BLUE;
    L={name:'Günlük',teach:'Günlük',hint:'Bugünün bulmacası. Renkleri doğru bardağa ayır.',ink:380,flips:0,
      emitters:[{x:185,y:55,n:300,rate:0.8,color:sw?bc:rc},{x:215,y:55,n:300,rate:0.8,color:sw?rc:bc}],
      lava:r()<0.6?[{x:Math.round(165+r()*20),y:Math.round(330+r()*60),w:50,h:22}]:[],
      cups:[{x:30,y:470,w:110,h:110,fill:0.5,color:sw?bc:rc},{x:260,y:470,w:110,h:110,fill:0.5,color:sw?rc:bc}]};
    sol={steps:[{when:'start',strokes:[[[112,215],[200,150],[288,215]]]}]};
  } else {
    L={name:'Günlük',teach:'Günlük',hint:'Bugünün bulmacası. Kumu doldur, köprü çiz, çevir.',ink:300,flips:2,autostart:true,
      emitters:[{x:90,y:55,n:380,rate:1.5}],
      cups:[{x:260,y:5,w:100,h:110,dir:'down',fill:0.4},{x:30,y:490,w:120,h:105,count:false}]};
    sol={steps:[{when:'emitted',n:175,strokes:[[[30,210],[285,120]]],flip:true}]};
    if(r()<0.5){ L=mirror(L); sol=mirrorSol(sol); }
  }
  return {level:L,sol:sol};
}
var INK_SCALE=1.25;   // oyuncu geri bildirimi: hak biraz kısaydı; zorluk korunsun diye ılımlı artış
function scaleInk(v){ return Math.round(v*INK_SCALE/10)*10; }
function buildDaily(dateStr){
  var base=hashStr('kumdok'+dateStr);
  for(var att=0;att<10;att++){
    var r=K.rng(base+att*7919);
    var kind=(att===0)?(base%4):Math.floor(r()*4);
    var d=dailyTemplate(kind,r);
    d.level.id='daily'; d.level.seed=base+att;
    var res=runSolution(d.level,d.sol,2400);
    if(res.state==='win'){ d.level.inkStar=d.level.ink; d.level.ink=scaleInk(d.level.ink||0); d.level.name='Günlük · '+dateStr.slice(8)+'.'+dateStr.slice(5,7); d.kind=kind; return d; }
  }
  return fallbackDaily(dateStr);
}
/* Yedek günlük bulmaca: 10 deneme de doğrulanamazsa sabit, testle doğrulanmış lav düzeni kullanılır. */
function fallbackDaily(dateStr){
  var d=dailyTemplate(1,function(){ return 0.5; });
  d.level.id='daily'; d.level.seed=hashStr('kumdok-yedek'); d.kind=1; d.fallback=true; d.level.inkStar=d.level.ink; d.level.ink=scaleInk(d.level.ink);
  d.level.name='Günlük · '+dateStr.slice(8)+'.'+dateStr.slice(5,7);
  return d;
}

var API={LEVELS:LEVELS,INK_SCALE:INK_SCALE,scaleInk:scaleInk,buildDaily:buildDaily,fallbackDaily:fallbackDaily,runSolution:runSolution,applyStrokes:applyStrokes,mirror:mirror};
if(typeof module!=='undefined'&&module.exports)module.exports=API; else root.KDL=API;
})(typeof window!=='undefined'?window:globalThis);
