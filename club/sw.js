const C='hb-v9';
const CORE=['./','index.html','field.js','data.json','map.jpg','map-aerial.jpg','map-topo.jpg','patterns.html','sightings.json','manifest.json','icon.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>Promise.all(CORE.map(u=>c.add(u).catch(()=>{})))));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==location.origin)return;
  const img=/\.(jpg|png)$/.test(u.pathname);
  if(img){e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(n=>{caches.open(C).then(c=>c.put(e.request,n.clone()));return n;})));return;}
  e.respondWith(fetch(e.request,{cache:'no-cache'}).then(n=>{const cp=n.clone();caches.open(C).then(c=>c.put(e.request,cp));return n;}).catch(()=>caches.match(e.request,{ignoreSearch:true}).then(r=>r||caches.match('index.html'))));});
