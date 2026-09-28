// Reproduce the old cache-first deployment problem in a real browser, then upgrade.
const {chromium}=require('@playwright/test');
const {createServer}=require('node:http');
const {readFileSync}=require('node:fs');
const {execFileSync}=require('node:child_process');
const assert=require('node:assert/strict');
(async()=>{
 let version=1;
 const old=execFileSync('git',['show','a3e5a28:scripts/sw-template.js'],{encoding:'utf8'});
 const current=readFileSync('scripts/sw-template.js','utf8');
 const server=createServer((req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.url==='/sw.js') {res.setHeader('Content-Type','application/javascript');res.end((version===1?old:current).replace('__VERSION__',String(version)).replace('__PRECACHE__',JSON.stringify(['./index.html',`./assets/version-${version}.js`])));}
  else if(req.url.startsWith('/assets/')) {res.setHeader('Content-Type','application/javascript');res.end(`window.assetVersion=${version};`);}
  else {res.setHeader('Content-Type','text/html');res.end(`<html><body><h1>Deployment ${version}</h1></body></html>`);}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  const context=await browser.newContext(),page=await context.newPage();const base=`http://127.0.0.1:${server.address().port}`;
  await page.goto(base);await page.evaluate(async()=>{await navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'});await navigator.serviceWorker.ready;});
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  version=2;
  await page.reload();assert.equal(await page.locator('h1').textContent(),'Deployment 1');
  await page.evaluate(async()=>{await(await navigator.serviceWorker.getRegistration()).update();});
  await page.waitForFunction(async()=>{
   const worker=navigator.serviceWorker.controller;if(!worker)return false;
   return new Promise(resolve=>{const channel=new MessageChannel();channel.port1.onmessage=e=>{channel.port1.close();resolve(e.data.version==='herin-shell-2');};worker.postMessage('OFFLINE_STATUS',[channel.port2]);});
  });
  await page.reload();assert.equal(await page.locator('h1').textContent(),'Deployment 2');
  await context.setOffline(true);await page.reload();assert.equal(await page.locator('h1').textContent(),'Deployment 2');
  const oldChunk=await page.evaluate(async()=>await(await fetch('/assets/version-1.js')).text());assert.equal(oldChunk,'window.assetVersion=1;');
  console.log('PASS real service-worker upgrade: reproduced stale shell, activated deployed fix, refresh loads new UI, offline access and older chunks preserved.');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exit(1);});
