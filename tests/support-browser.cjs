const {chromium}=require('@playwright/test');const assert=require('node:assert/strict');const fs=require('node:fs');const crypto=require('node:crypto');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
 const page=await browser.newPage({serviceWorkers:'block'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto((process.env.HERIN_URL||'http://127.0.0.1:4173')+'/#/guide');
 fs.mkdirSync('test-results/support',{recursive:true});
 const trigger=page.getByRole('button',{name:'Support Herin',exact:true});
 for(const width of [360,768,1440])for(const mode of ['light','dark']){
 await page.setViewportSize({width,height:800});await page.evaluate(m=>document.documentElement.dataset.mode=m,mode);await trigger.click();
 const modal=page.getByRole('dialog',{name:'Support Herin',exact:true});await modal.waitFor();
 await page.waitForFunction(()=>{const img=document.querySelector('.support-qr');return img?.complete&&img.naturalWidth===1170;});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 const rect=await modal.boundingBox();assert.ok(rect.x>=0&&rect.y>=0&&rect.x+rect.width<=width+1&&rect.y+rect.height<=801);
 await page.screenshot({path:`test-results/support/${width}-${mode}.png`});
 await page.keyboard.press('Escape');assert.equal(await modal.count(),0);assert.ok(await trigger.evaluate(el=>el===document.activeElement));
 }
 await trigger.click();await page.getByRole('button',{name:'Close dialog',exact:true}).focus();await page.keyboard.press('Shift+Tab');assert.equal(await page.locator(':focus').textContent(),'Save QR image');await page.keyboard.press('Tab');assert.equal(await page.locator(':focus').getAttribute('aria-label'),'Close dialog');
 const pending=page.waitForEvent('download');await page.getByRole('link',{name:'Save QR image'}).click();const download=await pending;assert.equal(download.suggestedFilename().toLowerCase(),'herin-support-qr.jpg');
 const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');assert.equal(hash(await download.path()),hash('public/herin-support-qr.jpg'));
 await page.getByRole('button',{name:'Close',exact:true}).click();assert.equal(await page.getByRole('dialog').count(),0);assert.deepEqual(errors,[]);
 console.log('PASS support: image, original-byte download, focus trap/restoration, close/Escape, six responsive/theme layouts, no JS errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
