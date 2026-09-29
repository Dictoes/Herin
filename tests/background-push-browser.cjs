// Real Chrome service-worker test. CDP injects the push event instead of a vendor push service.
const {chromium}=require('@playwright/test');
const {createServer}=require('node:http');
const {readFileSync}=require('node:fs');
const assert=require('node:assert/strict');
(async()=>{
 const source=readFileSync('scripts/sw-template.js','utf8').replace('__VERSION__','push-test').replace('__PRECACHE__','[]');
 const server=createServer((req,res)=>{if(req.url==='/sw.js'){res.setHeader('Content-Type','application/javascript');res.end(source);}else{res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Push test</title><h1>Herin push test</h1>');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  const context=await browser.newContext({permissions:['notifications']});
  const observer=await context.newPage(),cdp=await context.newCDPSession(observer);
  let registrationId;
  cdp.on('ServiceWorker.workerRegistrationUpdated',({registrations})=>{const reg=registrations.find(r=>r.scopeURL===origin+'/');if(reg)registrationId=reg.registrationId;});
  await cdp.send('ServiceWorker.enable');
  let page=await context.newPage();await page.goto(origin);
  await page.evaluate(async()=>{await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;});
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await page.evaluate(()=>new Promise(resolve=>{const channel=new MessageChannel();channel.port1.onmessage=resolve;navigator.serviceWorker.controller.postMessage({type:'PUSH_OWNER',userId:'owner'},[channel.port2]);}));
  assert.ok(registrationId);
  await page.close();
  assert.ok(context.pages().every(p=>!p.url().startsWith(origin)));
  const payload={userId:'owner',title:'Closed-tab reminder',body:'Your class starts soon.',tag:'closed-tab-test',url:'/#/schedule',expiresAt:new Date(Date.now()+60000).toISOString()};
  await cdp.send('ServiceWorker.deliverPushMessage',{origin,registrationId,data:JSON.stringify(payload)});
  page=await context.newPage();await page.goto(origin);
  await page.waitForFunction(async()=>{const r=await navigator.serviceWorker.ready;return (await r.getNotifications()).some(n=>n.tag==='closed-tab-test');});
  assert.equal(await page.evaluate(async()=>(await(await navigator.serviceWorker.ready).getNotifications())[0].title),'Closed-tab reminder');
  await page.evaluate(()=>new Promise(resolve=>{const channel=new MessageChannel();channel.port1.onmessage=resolve;navigator.serviceWorker.controller.postMessage({type:'PUSH_OWNER',userId:null},[channel.port2]);}));
  assert.equal(await page.evaluate(async()=>(await(await navigator.serviceWorker.ready).getNotifications()).length),0);
  await page.close();await cdp.send('ServiceWorker.deliverPushMessage',{origin,registrationId,data:JSON.stringify({...payload,tag:'after-logout'})});
  page=await context.newPage();await page.goto(origin);
  assert.equal(await page.evaluate(async()=>(await(await navigator.serviceWorker.ready).getNotifications()).filter(n=>n.tag==='after-logout').length),0);
  console.log('PASS real Chrome: push event displayed with all app tabs closed; clearing account closes notifications and suppresses queued account messages. Transport was CDP-injected, not a live vendor push.');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exit(1);});
