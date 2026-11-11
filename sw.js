// Bei jeder neuen Version V erhöhen (gleich wie VERSION in app.js). Der Service Worker berührt Firestore-Daten nie.
const V='einkauf-3.1.0', CORE=['./','index.html','app.js','config.js','manifest.json','icon.svg'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(CORE)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const r=e.request,u=new URL(r.url);
  if(r.method!=='GET')return;
  if(u.origin===location.origin){
    e.respondWith(fetch(r).then(x=>{const c=x.clone();caches.open(V).then(k=>k.put(r,c));return x}).catch(()=>caches.match(r,{ignoreSearch:true}).then(m=>m||caches.match('index.html'))));
  }else if(u.hostname==='www.gstatic.com'&&u.pathname.startsWith('/firebasejs/')){
    e.respondWith(caches.match(r).then(m=>m||fetch(r).then(x=>{const c=x.clone();caches.open(V).then(k=>k.put(r,c));return x})));
  }
});
