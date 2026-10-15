/* Kum Dök — kayıt kuralları (saf fonksiyonlar; depolama erişimi game.js'de).
   Sürüm 5 = 115 bölüm. kd4 (300 bölüm) ve kd3 (v1) kayıtları OLDMAP ile yeni numaralara taşınır. */
(function(root){
'use strict';
var VER=5, KEY='kd5', OLD_KEYS=['kd4','kd3'], MAX_HINTS=9, GIFT_CAP=5;

function isObj(o){ return !!o&&typeof o==='object'&&!Array.isArray(o); }
function cleanMap(m,maxv){ var o={}; if(!isObj(m))return o; for(var k in m){ var v=+m[k]; if(isFinite(v)&&v>0&&v<=maxv)o[k]=Math.round(v); } return o; }
function normalize(d){
  if(!isObj(d))d={};
  var o={v:VER};
  o.stars=cleanMap(d.stars,3); o.daily=cleanMap(d.daily,3); o.skipped=cleanMap(d.skipped,1); o.fails=cleanMap(d.fails,999);
  o.streak=Math.max(0,Math.floor(+d.streak||0)); o.best=Math.max(o.streak,Math.floor(+d.best||0)); o.last=typeof d.last==='string'?d.last:'';
  o.skin=typeof d.skin==='string'?d.skin:'klasik'; o.sound=d.sound===undefined?1:(d.sound?1:0); o.vib=d.vib===undefined?1:(d.vib?1:0);
  o.music=d.music===undefined?1:(d.music?1:0);
  var st=isObj(d.stat)?d.stat:{}; o.stat={poured:+st.poured||0,burned:+st.burned||0,flips:+st.flips||0,plays:+st.plays||0,wins:+st.wins||0};
  o.ach=isObj(d.ach)?d.ach:{}; o.world=Math.max(1,Math.min(10,Math.floor(+d.world||1))); o.line=(d.line===0||d.line===1||d.line===2)?d.line:2;
  o.hints=(d.hints===undefined)?3:Math.max(0,Math.min(MAX_HINTS,Math.floor(+d.hints||0))); o.gift=typeof d.gift==='string'?d.gift:'';
  o.seen=cleanMap(d.seen,1);
  return o;
}
function parse(raw){ if(raw===null||raw===undefined)return null; try{ return JSON.parse(raw); }catch(e){ return null; } }
function remap(m,map){ var o={}; if(!isObj(m))return o; for(var k in m){ var nk=map?map[k]:k; if(nk)o[nk]=m[k]; } return o; }
/* read(key) -> ham metin ya da null. Yeni kayıt varsa o kullanılır; yoksa eski kayıt taşınır; o da yoksa varsayılan. */
function load(read,oldmap){
  var d=parse(read(KEY));
  if(isObj(d))return normalize(d);
  for(var i=0;i<OLD_KEYS.length;i++){
    var old=parse(read(OLD_KEYS[i]));
    if(isObj(old)){ old=Object.assign({},old); old.stars=remap(old.stars,oldmap); old.skipped=remap(old.skipped,oldmap); old.fails=remap(old.fails,oldmap); return normalize(old); }
  }
  return normalize(null);
}
/* Zafer kaydı. Yeni nesne döner; ilk patron/günlük zaferinde ._reward=1 (+1 ipucu verildi). */
function recordWin(m,w){
  var o=normalize(JSON.parse(JSON.stringify(m)));
  var store=w.daily?o.daily:o.stars, key=w.key, first=!store[key];
  if(!store[key]||store[key]<w.stars)store[key]=w.stars;
  if(first&&(w.boss||w.daily)){ o.hints=Math.min(MAX_HINTS,o.hints+1); o._reward=1; }
  if(w.daily&&first){
    if(o.last===w.yesterday)o.streak++; else if(o.last!==w.today)o.streak=1;
    o.last=w.today; if(o.streak>o.best)o.best=o.streak;
  }
  return o;
}
/* Ekranda gösterilecek seri: dün ya da bugün çözülmediyse seri bozulmuştur. */
function shownStreak(m,today,yesterday){ return (m.last===today||m.last===yesterday)?m.streak:0; }
/* Günlük hediye: günde bir kez +1 ipucu (en çok 5'e kadar). Hediye verildiyse true. */
function dailyGift(m,today){
  if(m.gift===today)return false;
  m.gift=today; if(m.hints<GIFT_CAP){ m.hints++; return true; } return false;
}
function dateStr(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }

var API={VER:VER,KEY:KEY,normalize:normalize,load:load,recordWin:recordWin,shownStreak:shownStreak,dailyGift:dailyGift,dateStr:dateStr};
if(typeof module!=='undefined'&&module.exports)module.exports=API; else root.KDS=API;
})(typeof window!=='undefined'?window:globalThis);
