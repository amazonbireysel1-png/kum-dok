/* Kum Dök — çevrimdışı çalışma: oyun dosyaları ilk açılışta önbelleğe alınır.
   Oyun güncellenince SURUM değiştirilmeli; telefon bir sonraki açılışta yeni sürümü indirir. */
var SURUM='kumdok-v1';
var DOSYALAR=['./','index.html','css/style.css','js/engine.js','js/levels.js','js/levels-data.js','js/save.js','js/audio.js','js/game.js',
  'icon.svg','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png','icons/maskable-512.png'];
self.addEventListener('install',function(e){
  e.waitUntil(caches.open(SURUM).then(function(c){ return c.addAll(DOSYALAR); }).then(function(){ return self.skipWaiting(); }));
});
self.addEventListener('activate',function(e){
  e.waitUntil(caches.keys().then(function(ks){ return Promise.all(ks.filter(function(k){ return k!==SURUM; }).map(function(k){ return caches.delete(k); })); }).then(function(){ return self.clients.claim(); }));
});
/* önce ağ, olmazsa önbellek: internet varken hep en yeni sürüm, yokken kayıtlı sürüm */
self.addEventListener('fetch',function(e){
  if(e.request.method!=='GET'||new URL(e.request.url).origin!==location.origin)return;
  e.respondWith(fetch(e.request).then(function(r){
    var kopya=r.clone(); caches.open(SURUM).then(function(c){ c.put(e.request,kopya); }); return r;
  }).catch(function(){ return caches.match(e.request,{ignoreSearch:true}).then(function(m){ return m||caches.match('index.html'); }); }));
});
