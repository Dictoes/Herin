import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile,readdir} from 'node:fs/promises';
const template=await readFile('scripts/sw-template.js','utf8');
function worker(fail=false,online=false){
 const listeners={},stores=new Map(),requested=[];
 const caches={open:async name=>{if(!stores.has(name))stores.set(name,new Map());const store=stores.get(name);return {addAll:async urls=>{if(fail)throw Error('offline during install');for(const url of urls)store.set(url,new Response(url.endsWith('index.html')?'HERIN SHELL':'ASSET'));},match:async (req,options)=>{const url=new URL(typeof req==='string'?req:req.url);if(options?.ignoreSearch)url.search='';const value=store.get(url.href);return value?.clone();}};},delete:async key=>stores.delete(key)};
 const scope='https://herin.test/app/';
 caches.match=async(req,options)=>{for(const key of stores.keys()){const result=await(await caches.open(key)).match(req,options);if(result)return result;}};
 const self={registration:{scope},location:{origin:'https://herin.test'},clients:{claim:async()=>true,matchAll:async()=>[],openWindow:async url=>url},skipWaiting(){},addEventListener:(name,fn)=>listeners[name]=fn};
 const context={self,caches,URL,Response,AbortSignal,fetch:async req=>{requested.push(req);if(online)return new Response('NEW DEPLOYMENT');throw Error('No connection');}};
 vm.runInNewContext(template.replace('__VERSION__','test').replace('__PRECACHE__',JSON.stringify(['./index.html','./assets/main.js','./assets/reader.js','./assets/pdf.worker.mjs'])),context);
 async function event(type,extra={}){let promise;listeners[type]({...extra,waitUntil:p=>promise=p,respondWith:p=>promise=p});return await promise;}
 return {event,stores,requested,scope,listeners};
}
test('service worker precaches shell, lazy page and PDF worker; navigation works with network disabled',async()=>{
 const w=worker();await w.event('install');await w.event('activate');
 const nav=await w.event('fetch',{request:{method:'GET',url:w.scope+'anything',mode:'navigate'}});assert.equal(await nav.text(),'HERIN SHELL');
 const script=await w.event('fetch',{request:{method:'GET',url:w.scope+'assets/reader.js',mode:'cors'}});assert.equal(await script.text(),'ASSET');assert.equal(w.requested.length,1);
});
test('online navigation sees a new deployment while offline shell and old chunks remain available',async()=>{
 const w=worker(false,true);await w.event('install');
 const response=await w.event('fetch',{request:{method:'GET',url:w.scope,mode:'navigate'}});assert.equal(await response.text(),'NEW DEPLOYMENT');
 assert.equal(await w.stores.get('herin-shell-test').get(w.scope+'index.html').clone().text(),'HERIN SHELL');
 w.stores.set('herin-shell-old',new Map([[w.scope+'assets/old-reader.js',new Response('OLD CHUNK')]]));
 const old=await w.event('fetch',{request:{method:'GET',url:w.scope+'assets/old-reader.js',mode:'cors'}});assert.equal(await old.text(),'OLD CHUNK');
});
test('incomplete offline install fails and removes its partial cache',async()=>{const w=worker(true);await assert.rejects(w.event('install'));assert.equal(w.stores.size,0);});
test('production offline list contains every emitted app asset and iPhone icons',async()=>{
 const sw=await readFile('dist/sw.js','utf8');const match=sw.match(/const ASSETS=(.+);/);assert.ok(match);
 const urls=JSON.parse(match[1]);assert.ok(urls.includes('./index.html'));assert.ok(urls.includes('./icons/herin-180.png'));
 for(const file of await readdir('dist/assets'))assert.ok(urls.includes('./assets/'+file),file);
 for(const url of urls)await readFile('dist/'+url.slice(2));
 const manifest=JSON.parse(await readFile('dist/manifest.json','utf8'));assert.equal(manifest.display,'standalone');assert.equal(manifest.name,'Herin');
});
