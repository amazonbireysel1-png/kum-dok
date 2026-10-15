/* Kum Dök — ses ve müzik (tamamı Web Audio ile üretilir; dosya yok, internet gerekmez).
   Yollar: efektler → sfxBus, müzik → musicBus; ikisi de ortak yankı (reverb) ve master'a gider.
   Ayarlar game.js'den gelir: KDA.setPrefs({sound, music}). Tarayıcı kuralı gereği ses ilk dokunuşta açılır (KDA.unlock). */
(function(root){
'use strict';
var AC=null, master, sfxBus, musicBus, verb, verbIn, noiseBuf, pref={sound:1,music:1}, hidden=false;
var pour=null, draw=null, lastBurn=0, lastCup=0;

function ctx(){
  if(AC)return AC;
  try{
    AC=new (window.AudioContext||window.webkitAudioContext)();
    master=AC.createDynamicsCompressor(); master.threshold.value=-14; master.ratio.value=3; master.connect(AC.destination);
    var out=AC.createGain(); out.gain.value=0.9; out.connect(master); master=out;
    sfxBus=AC.createGain(); musicBus=AC.createGain(); sfxBus.connect(master); musicBus.connect(master);
    sfxBus.gain.value=pref.sound?1:0; musicBus.gain.value=0;
    /* yankı: üretilmiş, sönümlenen gürültü darbesi */
    var len=Math.floor(AC.sampleRate*2.2), ir=AC.createBuffer(2,len,AC.sampleRate);
    for(var ch=0;ch<2;ch++){ var d=ir.getChannelData(ch); for(var i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,3.2); }
    verb=AC.createConvolver(); verb.buffer=ir; var vg=AC.createGain(); vg.gain.value=0.32; verb.connect(vg); vg.connect(master);
    verbIn=verb;
    noiseBuf=AC.createBuffer(1,AC.sampleRate*2,AC.sampleRate); var nd=noiseBuf.getChannelData(0); for(var k=0;k<nd.length;k++)nd[k]=Math.random()*2-1;
    pour=loopNoise('bandpass',2600,0.9,sfxBus); draw=loopNoise('bandpass',3400,1.4,sfxBus);
    var hp=AC.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=1200; draw.f.disconnect(); draw.f.connect(hp); hp.connect(draw.g);
  }catch(e){ AC=null; }
  return AC;
}
function loopNoise(type,freq,q,bus){
  var s=AC.createBufferSource(); s.buffer=noiseBuf; s.loop=true;
  var f=AC.createBiquadFilter(); f.type=type; f.frequency.value=freq; f.Q.value=q;
  var g=AC.createGain(); g.gain.value=0; s.connect(f); f.connect(g); g.connect(bus); s.start();
  return {s:s,f:f,g:g};
}
function now(){ return AC.currentTime; }
function ok(){ return pref.sound&&!hidden&&ctx(); }

/* --- yapı taşları --- */
function env(g,t,a,peak,dur){ g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(peak,t+a); g.gain.exponentialRampToValueAtTime(0.0001,t+dur); }
function osc(type,f,t,dur,vol,bus,opt){
  opt=opt||{}; var o=AC.createOscillator(), g=AC.createGain();
  o.type=type; o.frequency.setValueAtTime(f,t); if(opt.to)o.frequency.exponentialRampToValueAtTime(opt.to,t+dur*0.9); if(opt.detune)o.detune.value=opt.detune;
  env(g,t,opt.a||0.005,vol,dur); o.connect(g);
  if(opt.lp){ var lp=AC.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=opt.lp; g.connect(lp); lp.connect(bus); if(opt.wet)lp.connect(wetGain(opt.wet)); }
  else { g.connect(bus); if(opt.wet)g.connect(wetGain(opt.wet)); }
  o.start(t); o.stop(t+dur+0.05);
}
function wetGain(v){ var w=AC.createGain(); w.gain.value=v; w.connect(verbIn); return w; }
/* çan: uyumsuz kısmi tonlarla parlak, yumuşak bir zil */
function bell(f,t,vol,dur,bus,wet){
  [[1,1],[2.76,0.35],[5.4,0.12],[0.5,0.18]].forEach(function(p){ osc('sine',f*p[0],t,dur*(p[0]>2?0.5:1),vol*p[1],bus,{a:0.003,wet:wet||0.5}); });
}
function noise(t,dur,type,freq,q,vol,bus,opt){
  opt=opt||{}; var s=AC.createBufferSource(); s.buffer=noiseBuf;
  var f=AC.createBiquadFilter(); f.type=type; f.frequency.setValueAtTime(freq,t); f.Q.value=q; if(opt.to)f.frequency.exponentialRampToValueAtTime(opt.to,t+dur);
  var g=AC.createGain(); env(g,t,opt.a||0.004,vol,dur); s.connect(f); f.connect(g); g.connect(bus); if(opt.wet)g.connect(wetGain(opt.wet));
  s.start(t,Math.random()*1.5); s.stop(t+dur+0.05);
}
function midi(n){ return 440*Math.pow(2,(n-69)/12); }

/* --- efektler --- */
var sfx={
  tap:function(){ if(!ok())return; var t=now(); noise(t,0.035,'bandpass',2200,2,0.09,sfxBus); osc('sine',880,t,0.07,0.05,sfxBus,{to:1200}); },
  toggle:function(on){ if(!ok())return; var t=now(); osc('sine',on?660:520,t,0.08,0.07,sfxBus); osc('sine',on?990:390,t+0.06,0.1,0.06,sfxBus); },
  draw:function(){ if(!ok())return; noise(now(),0.05,'highpass',3000,0.7,0.05,sfxBus); },
  undo:function(){ if(!ok())return; var t=now(); osc('triangle',700,t,0.12,0.07,sfxBus,{to:380,lp:2400}); },
  start:function(){ if(!ok())return; var t=now(); noise(t,0.45,'bandpass',500,1.2,0.12,sfxBus,{to:3200,a:0.15,wet:0.3}); bell(midi(76),t+0.25,0.06,0.9,sfxBus,0.4); },
  flip:function(){ if(!ok())return; var t=now(); noise(t,0.6,'bandpass',3000,1.5,0.16,sfxBus,{to:350,a:0.08,wet:0.5}); osc('sine',110,t+0.05,0.5,0.22,sfxBus,{to:55}); osc('triangle',330,t,0.45,0.05,sfxBus,{to:660,lp:1500,wet:0.4}); },
  burn:function(){ var n=performance.now(); if(n-lastBurn<70||!ok())return; lastBurn=n; var t=now();
    noise(t,0.12,'highpass',4200,0.8,0.07,sfxBus); for(var i=0;i<3;i++)noise(t+Math.random()*0.08,0.012,'bandpass',1800+Math.random()*2500,3,0.08,sfxBus); },
  cup:function(i){ var n=performance.now(); if(n-lastCup<120||!ok())return; lastCup=n; var t=now(), base=[72,76,79,84][i%4];
    bell(midi(base),t,0.09,1.4,sfxBus,0.6); bell(midi(base+7),t+0.09,0.06,1.2,sfxBus,0.6); },
  win:function(){ if(!ok())return; var t=now(); duck(2.4);
    [72,76,79,84,88].forEach(function(n,i){ bell(midi(n),t+i*0.11,0.08,1.6,sfxBus,0.7); });
    [60,64,67,71].forEach(function(n){ osc('triangle',midi(n),t+0.35,1.8,0.035,sfxBus,{a:0.3,lp:1800,wet:0.6}); }); },
  star:function(i){ if(!ok())return; var t=now(); bell(midi([79,83,86][i]||86),t,0.09,1.1,sfxBus,0.6); noise(t,0.25,'highpass',7000,0.5,0.03,sfxBus,{wet:0.5}); },
  fail:function(){ if(!ok())return; var t=now(); duck(1.4); osc('triangle',midi(64),t,0.35,0.08,sfxBus,{lp:1400,wet:0.4}); osc('triangle',midi(60),t+0.22,0.6,0.08,sfxBus,{lp:1100,wet:0.5}); osc('sine',midi(48),t+0.22,0.7,0.06,sfxBus); },
  hint:function(){ if(!ok())return; var t=now(); [84,88,91,96].forEach(function(n,i){ bell(midi(n),t+i*0.07,0.035,0.8,sfxBus,0.8); }); },
  skip:function(){ if(!ok())return; var t=now(); noise(t,0.35,'bandpass',800,1,0.08,sfxBus,{to:4000}); }
};
/* sürekli sesler: kum akışı ve çizim (değer 0..1) */
function setPour(v){ if(!AC||!pour)return; var t=now(), on=pref.sound&&!hidden;
  pour.g.gain.setTargetAtTime(on?v*0.08:0,t,0.12); pour.f.frequency.setTargetAtTime(2200+Math.random()*900,t,0.2); }
function setDraw(speed){ if(!AC||!draw)return; var t=now(), v=pref.sound&&!hidden?Math.min(1,speed/14):0;
  draw.g.gain.setTargetAtTime(v*0.06,t,v>0?0.02:0.06); draw.f.frequency.setTargetAtTime(2600+v*2200,t,0.05); }

/* --- müzik: sakin, kendini tekrar etmeyen dört akorluk döngü (A minör / C majör) --- */
var CHORDS=[[57,60,64,67],[53,57,60,64],[48,55,59,64],[55,59,62,67],[57,60,64,69],[50,57,60,65],[53,57,60,64],[55,59,62,65]];
var SCALE=[69,72,74,76,79,81,84];   // A minör pentatonik (üst oktav)
var mTimer=null, mNext=0, mStep=0, mSeed=1, BEAT=60/76/2;   // sekizlik süre
function rnd(){ mSeed=(mSeed*16807)%2147483647; return mSeed/2147483647; }
var delayIn=null;
function musicNodes(){
  if(delayIn)return;
  var d=AC.createDelay(1); d.delayTime.value=BEAT*3; var fb=AC.createGain(); fb.gain.value=0.32; var dl=AC.createBiquadFilter(); dl.type='lowpass'; dl.frequency.value=2200;
  d.connect(dl); dl.connect(fb); fb.connect(d); var dg=AC.createGain(); dg.gain.value=0.35; dl.connect(dg); dg.connect(musicBus); dg.connect(wetGain(0.4));
  delayIn=d;
}
function schedule(){
  if(!AC)return;
  while(mNext<AC.currentTime+0.5){
    var t=mNext, bar=Math.floor(mStep/8), pos=mStep%8, ch=CHORDS[Math.floor(bar/2)%CHORDS.length];
    if(pos===0&&bar%2===0){   // pad: iki ölçü
      ch.forEach(function(n){ [-7,7].forEach(function(dt){ osc('triangle',midi(n),t,BEAT*16+1.2,0.022,musicBus,{a:1.4,lp:1100,detune:dt,wet:0.7}); }); });
    }
    if(pos===0||pos===4){ osc('sine',midi(ch[0]-12),t,BEAT*4,0.11,musicBus,{a:0.04,lp:400}); }
    var p=(pos%2===0)?0.62:0.28;
    if(rnd()<p){
      var cand=SCALE.filter(function(n){ return ch.some(function(c){ return (n-c)%12===0; })||rnd()<0.35; });
      var n=cand[Math.floor(rnd()*cand.length)]||SCALE[0];
      var o=AC.createOscillator(), g=AC.createGain(), o2=AC.createOscillator(), g2=AC.createGain();
      o.type='sine'; o.frequency.value=midi(n); o2.type='triangle'; o2.frequency.value=midi(n)*2;
      env(g,t,0.004,0.05,0.9); env(g2,t,0.002,0.012,0.25); o.connect(g); o2.connect(g2); g.connect(musicBus); g2.connect(musicBus); g.connect(delayIn);
      o.start(t); o.stop(t+1); o2.start(t); o2.stop(t+0.3);
    }
    if(pos%2===1&&rnd()<0.7){   // hafif çalkalama
      var s=AC.createBufferSource(); s.buffer=noiseBuf; var f=AC.createBiquadFilter(); f.type='highpass'; f.frequency.value=7000; var sg=AC.createGain(); env(sg,t,0.002,0.012,0.05);
      s.connect(f); f.connect(sg); sg.connect(musicBus); s.start(t,Math.random()*1.5); s.stop(t+0.08);
    }
    mNext+=BEAT; mStep++;
  }
}
function musicOn(){
  if(!AC||mTimer||!pref.music||hidden)return;
  musicNodes(); mSeed=(Date.now()%100000)+1; mStep=0; mNext=AC.currentTime+0.15;
  musicBus.gain.cancelScheduledValues(AC.currentTime); musicBus.gain.setTargetAtTime(0.55,AC.currentTime,0.8);
  schedule(); mTimer=setInterval(schedule,120);
}
function musicOff(){
  if(!AC)return; clearInterval(mTimer); mTimer=null;
  musicBus.gain.cancelScheduledValues(AC.currentTime); musicBus.gain.setTargetAtTime(0,AC.currentTime,0.15);
}
/* zafer/kayıp jingle'ında müzik kısa süre kısılır */
function duck(sec){ if(!AC||!mTimer)return; var t=AC.currentTime; musicBus.gain.cancelScheduledValues(t); musicBus.gain.setTargetAtTime(0.15,t,0.05); musicBus.gain.setTargetAtTime(0.55,t+sec,0.8); }

function apply(){
  if(!AC)return;
  sfxBus.gain.setTargetAtTime(pref.sound?1:0,AC.currentTime,0.03);
  if(!pref.sound){ setPour(0); setDraw(0); }
  if(pref.music)musicOn(); else musicOff();
  var need=(pref.sound||pref.music)&&!hidden;
  try{ if(need&&AC.state==='suspended')AC.resume(); else if(!need&&AC.state==='running')AC.suspend(); }catch(e){}
}
var API={
  sfx:sfx, setPour:setPour, setDraw:setDraw,
  setPrefs:function(p){ pref.sound=p.sound?1:0; pref.music=p.music?1:0; apply(); },
  /* ilk kullanıcı dokunuşunda çağrılır (tarayıcı ses kuralı) */
  unlock:function(){ if(!(pref.sound||pref.music))return; ctx(); apply(); },
  /* uygulama arka plana geçince / öne gelince */
  setHidden:function(h){ hidden=!!h; if(!AC)return; if(hidden){ setPour(0); setDraw(0); musicOff(); } apply(); },
  get musicPlaying(){ return !!mTimer; }
};
if(typeof module!=='undefined'&&module.exports)module.exports=API; else root.KDA=API;
})(typeof window!=='undefined'?window:globalThis);
