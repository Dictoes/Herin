const CACHE='herin-shell-__VERSION__';
const ASSETS=__PRECACHE__;
const absolute=p=>new URL(p,self.registration.scope).href;
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(CACHE);
 try { await cache.addAll(ASSETS.map(absolute)); await self.skipWaiting(); } catch(error){await caches.delete(CACHE);throw error;}
})()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('message',event=>{
 if(event.data==='ACTIVATE_UPDATE') self.skipWaiting();
 if(event.data==='OFFLINE_STATUS') event.ports[0]?.postMessage({ready:true,version:CACHE});
 if(event.data?.type==='PUSH_OWNER') event.waitUntil((async()=>{
   const cache=await caches.open('herin-push-state');
   await cache.put(absolute('./push-owner'),new Response(JSON.stringify({userId:event.data.userId||null})));
   if(!event.data.userId){for(const notification of await self.registration.getNotifications())notification.close();}
   event.ports[0]?.postMessage({ok:true});
 })());
});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin)return;
 const relative='./'+url.pathname.slice(new URL(self.registration.scope).pathname.length);
 if(request.mode==='navigate'){
   // Refreshes must see a deployed fix while online. Keep the precached shell
   // unchanged so its matching assets remain available when offline.
   event.respondWith((async()=>{
     try { const response=await fetch(request,{signal:AbortSignal.timeout(5000),cache:'no-cache'});if(response.ok)return response; } catch {}
     return (await (await caches.open(CACHE)).match(absolute('./index.html'))) || fetch(request);
   })());return;
 }
 if(!ASSETS.includes(relative)&&!relative.startsWith('./assets/'))return;
 // Previously open tabs may still need an old hashed lazy chunk after activation.
 event.respondWith((async()=>{const saved=await caches.match(request,{ignoreSearch:true});return saved||fetch(request);})());
});
self.addEventListener('push',event=>{
 event.waitUntil((async()=>{
   let data;try{data=event.data?.json();}catch{return;}
   const saved=await (await caches.open('herin-push-state')).match(absolute('./push-owner'));
   const owner=saved?await saved.json():null;
   if(!data?.userId||owner?.userId!==data.userId||!Number.isFinite(Date.parse(data.expiresAt))||Date.parse(data.expiresAt)<=Date.now())return;
   const target=new URL(data.url||'./#/schedule',self.registration.scope);
   if(target.origin!==self.location.origin)return;
   await self.registration.showNotification(String(data.title||'Herin reminder'),{body:String(data.body||''),tag:data.tag,icon:absolute('./icons/herin-192.png'),badge:absolute('./icons/herin-192.png'),data:{url:target.href},renotify:false});
 })());
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{let target=new URL(event.notification.data?.url||'./#/schedule',self.registration.scope);if(target.origin!==self.location.origin)target=new URL('./#/schedule',self.registration.scope);const list=await self.clients.matchAll({type:'window'});if(list.length){await list[0].navigate(target.href);return list[0].focus();}return self.clients.openWindow(target.href);})());
});
