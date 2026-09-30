// Explicit opt-in: creates only synthetic fixtures, then deletes them in finally.
const {chromium}=require('@playwright/test');
const {execFileSync}=require('node:child_process');
const fs=require('node:fs');const assert=require('node:assert/strict');const crypto=require('node:crypto');
if(process.env.HERIN_LIVE_SHARE_TEST!=='1')throw Error('Set HERIN_LIVE_SHARE_TEST=1 to run the live fixture test.');
const owner=crypto.randomUUID(),source=crypto.randomUUID(),share=crypto.randomUUID();
const sqlFile='supabase/.temp/shared-study-live.sql';
const query=sql=>{fs.writeFileSync(sqlFile,sql);execFileSync('cmd.exe',['/d','/s','/c','npx.cmd supabase db query --linked --project-ref ycejqtvemiesuiflyqmw --file supabase/.temp/shared-study-live.sql'],{stdio:'pipe'});};
(async()=>{
 let browser;
 try{
 query(`begin;
 insert into auth.users(id,email) values('${owner}','share-${owner}@example.invalid');
 insert into public.pdfs(id,user_id,title,file_path) values('${source}','${owner}','Synthetic shared lesson','test-only.pdf');
 set local role authenticated;
 select set_config('request.jwt.claim.sub','${owner}',true);
 select public.create_study_share('${share}','pdf','${source}',null,'Photosynthesis practice','Biology','{"text":"Photosynthesis converts light energy into chemical energy.\\n\\nThis is synthetic test content, not user data.","flashcards":[{"question":"What provides the energy?","answer":"Light","explanation":"Plants use light during photosynthesis.","options":[]}],"quizzes":[{"question":"Which energy source is used?","answer":"Light","explanation":"The lesson describes light energy.","options":["Light","Sound"]}]}');
 commit;`);
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const url=(process.env.HERIN_URL||'http://127.0.0.1:4173')+'/#/share/'+share;
 await page.goto(url);await page.getByRole('heading',{name:'Photosynthesis practice',exact:true}).waitFor();
 assert.ok(await page.getByText('Biology',{exact:true}).count());await page.getByText('Reveal answer',{exact:true}).click();await page.getByText('View answer & explanation',{exact:true}).click();
 assert.equal(await page.locator('details[open]').count(),2);
 fs.mkdirSync('test-results/share',{recursive:true});
 for(const width of [360,768,1440])for(const mode of ['light','dark']){
 await page.setViewportSize({width,height:900});await page.evaluate(m=>document.documentElement.dataset.mode=m,mode);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.screenshot({path:`test-results/share/live-${width}-${mode}.png`,fullPage:true,animations:'disabled'});
 }
 const api='https://ycejqtvemiesuiflyqmw.supabase.co/rest/v1/';const headers={apikey:'sb_publishable_AijWNHD9Yhl39nMhB1HwOA_pCeE5ySV','Content-Type':'application/json'};
 const response=await fetch(api+'rpc/get_shared_study',{method:'POST',headers,body:JSON.stringify({p_share_id:share})});assert.equal(response.status,200);const rows=await response.json();assert.deepEqual(Object.keys(rows[0]).sort(),['content_snapshot','created_at','subject','title']);
 const denied=await fetch(api+'shared_study_links?select=*',{headers});assert.ok([401,403].includes(denied.status));
 query(`begin;set local role authenticated;select set_config('request.jwt.claim.sub','${owner}',true);select public.revoke_study_share('${share}');commit;`);
 await page.reload();await page.getByRole('heading',{name:'This study link is no longer available.',exact:true}).waitFor();assert.deepEqual(errors,[]);
 console.log('PASS live Supabase: owner RPC creation, anonymous browser view, actual content/answers, public response allowlist, enumeration denied, revocation, six mobile/desktop/theme layouts');
 }finally{
 if(browser)await browser.close();
 query(`delete from auth.users where id='${owner}' and email='share-${owner}@example.invalid';`);
 fs.unlinkSync(sqlFile);
 }
})().catch(e=>{console.error(e.message);process.exit(1);});
