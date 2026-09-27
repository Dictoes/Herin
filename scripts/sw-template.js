const CACHE='herin-shell-__VERSION__';
const ASSETS=__PRECACHE__;
const absolute=p=>new URL(p,self.registration.scope).href;
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(CACHE);
 try { await cache.addAll(ASSETS.map(absolute)); } catch(error){await caches.delete(CACHE);throw error;}
})()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('message',event=>{
 if(event.data==='ACTIVATE_UPDATE') self.skipWaiting();
 if(event.data==='OFFLINE_STATUS') event.ports[0]?.postMessage({ready:true,version:CACHE});
});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin)return;
 const relative='./'+url.pathname.slice(new URL(self.registration.scope).pathname.length);
 if(request.mode==='navigate'){
   event.respondWith(caches.open(CACHE).then(cache=>cache.match(absolute('./index.html'))).then(cached=>cached||fetch(request)));return;
 }
 if(!ASSETS.includes(relative))return;
 event.respondWith((async()=>{const cache=await caches.open(CACHE);const saved=await cache.match(request,{ignoreSearch:true});return saved||fetch(request);})());
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{const list=await self.clients.matchAll({type:'window'});if(list.length)return list[0].focus();return self.clients.openWindow(absolute('./#/schedule'));})());
});
