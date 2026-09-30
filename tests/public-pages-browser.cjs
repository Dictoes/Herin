const {chromium}=require('@playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
 const page=await browser.newPage({serviceWorkers:'block'});const errors=[];let requests=0;
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://*.supabase.co/**',route=>{requests++;return route.abort();});
 fs.mkdirSync('test-results/help',{recursive:true});
 for(const name of ['guide','privacy']){
 await page.goto(`${process.env.HERIN_URL||'http://127.0.0.1:4173'}/#/${name}`);
 await page.getByRole('heading',{name:name==='guide'?'How to use Herin':'Privacy policy',exact:true}).waitFor();
 for(const width of [360,768,1440])for(const mode of ['light','dark']){
 await page.setViewportSize({width,height:900});await page.evaluate(m=>document.documentElement.dataset.mode=m,mode);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.screenshot({path:`test-results/help/${name}-${width}-${mode}.png`,fullPage:true});
 }
 if(name==='privacy')assert.equal(await page.locator('a[href="mailto:johnbenedictbucao2@gmail.com"]').count(),2);
 }
 assert.equal(requests,0,'Public help should not load account data');assert.deepEqual(errors,[]);
 await page.getByRole('link',{name:'User guide',exact:true}).click();await page.getByRole('heading',{name:'How to use Herin',exact:true}).waitFor();
 console.log('PASS: public routes, navigation, contact links, no account requests or JS errors, 12 responsive/theme screenshots');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

