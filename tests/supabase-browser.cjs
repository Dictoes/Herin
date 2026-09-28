// Browser integration against a simulated Supabase HTTP API, never a live account.
const {chromium}=require('@playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const user={id:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',email:'student@example.test',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{}};
const tables=Object.fromEntries(['profiles','user_preferences','classes','pdfs','notes','highlights','flashcards','quizzes','assignments','reminders'].map(t=>[t,[]]));
const files=new Map();let rejectWrites=false,uploads=0,downloads=0;
const jwt=()=>{const b=value=>Buffer.from(JSON.stringify(value)).toString('base64url');return b({alg:'HS256',typ:'JWT'})+'.'+b({sub:user.id,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})+'.test';};
const session=()=>({access_token:jwt(),refresh_token:'test-refresh',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user});
(async()=>{
const {databaseJson}=await import('../src/utils/databaseText.js');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
const context=await browser.newContext({serviceWorkers:'block'});
await context.route('https://ycejqtvemiesuiflyqmw.supabase.co/**',async route=>{
 const request=route.request(),url=new URL(request.url()),method=request.method();
 const json=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
 if(method==='OPTIONS')return route.fulfill({status:204});
 if(url.pathname==='/auth/v1/signup')return json({user,session:null});
 if(url.pathname==='/auth/v1/token')return json(session());
 if(url.pathname==='/auth/v1/user')return json(user);
 if(url.pathname==='/auth/v1/logout')return json({});
 if(url.pathname.startsWith('/rest/v1/')){
  const table=url.pathname.split('/').pop();if(!tables[table])return json({message:'Unknown table'},404);
  if(method==='GET')return json(url.searchParams.get('limit')==='0'?[]:tables[table].filter(r=>r.user_id===user.id));
  if(rejectWrites)return json({message:'Test: write denied by RLS',code:'42501'},403);
  if(method==='POST'){
   const rows=request.postDataJSON();
   if(JSON.stringify(rows)!==JSON.stringify(databaseJson(rows)))return json({message:"unsupported Unicode escape sequence",code:"22P05"},400);
   for(const row of rows){assert.equal(row.user_id,user.id);const key=row.id?'id':'user_id';const index=tables[table].findIndex(r=>r[key]===row[key]);const saved={created_at:new Date().toISOString(),updated_at:new Date().toISOString(),...tables[table][index],...row};if(index<0)tables[table].push(saved);else tables[table][index]=saved;}
   return json(rows,201);
  }
  if(method==='DELETE'){assert.equal(url.searchParams.get('user_id'),'eq.'+user.id);const ids=url.searchParams.get('id').slice(3,-1).split(',');tables[table]=tables[table].filter(r=>!ids.includes(r.id));return json([]);}
 }
 if(url.pathname.startsWith('/storage/v1/object/')){
  const key=url.pathname.replace('/storage/v1/object/authenticated/','').replace('/storage/v1/object/','');
  if(method==='POST'){assert.ok(key.startsWith('herin-pdfs/'+user.id+'/'));const body=request.postDataBuffer();const contentType=request.headers()['content-type'];let bytes=body;if(contentType?.includes('multipart/form-data')){const form=await new Response(body,{headers:{'content-type':contentType}}).formData();const file=[...form.values()].find(v=>typeof v!=='string');bytes=Buffer.from(await file.arrayBuffer());}// Chromium omits disk file contents from intercepted multipart bodies.
   if(!bytes.length)bytes=fs.readFileSync(path.join(__dirname,'fixtures/Biology-course.pdf'));files.set(key,bytes);uploads++;return json({Key:key});}
  if(method==='GET'){downloads++;const data=files.get(key);return data?route.fulfill({status:200,contentType:'application/pdf',body:data}):json({message:'Not found'},404);}
  if(method==='DELETE')return json([]);
 }
 throw Error('Unhandled request: '+method+' '+url);
});
const page=await context.newPage(),errors=[];page.on('dialog',dialog=>dialog.accept());page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource:.*403/.test(m.text()))errors.push(m.text());});
const base=process.env.HERIN_URL||'http://127.0.0.1:4173';
const saved=()=>page.getByText('Saved to Supabase',{exact:true}).first().waitFor();
const navigate=async route=>{await page.goto(base+'/#/'+route);await page.locator('.topbar-title').waitFor();};
await page.goto(base);await page.getByRole('button',{name:'Create an account',exact:true}).click();
await page.getByLabel('Email',{exact:true}).fill(user.email);await page.getByLabel('Password',{exact:true}).fill('test-password-123');await page.getByRole('button',{name:'Sign up',exact:true}).click();await page.getByText('Check your email to confirm your account, then log in.').waitFor();
await page.getByRole('button',{name:'Already have an account? Log in',exact:true}).click();await page.getByRole('button',{name:'Log in',exact:true}).click();await page.locator('.topbar-title').waitFor();
await navigate('pdfs');await page.locator('input[type=file]').setInputFiles(path.join(__dirname,'fixtures/Biology-course.pdf'));
await page.getByText('Ready',{exact:true}).waitFor({timeout:60000});await saved();assert.equal(uploads,1);assert.equal(tables.pdfs[0].data.status,'ready',JSON.stringify(tables.pdfs[0].data));assert.equal(tables.pdfs[0].extracted_text.pages.length,24);
await page.getByText('Biology-course.pdf',{exact:true}).click();await page.locator('.pdf-text-layer span').first().waitFor();
await page.locator('.pdf-text-layer').evaluate(el=>{const span=[...el.querySelectorAll('span')].find(s=>s.textContent.includes('Photosynthesis is'));if(!span)throw Error('No definition');const range=document.createRange();range.selectNodeContents(span);getSelection().removeAllRanges();getSelection().addRange(range);el.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));});
await page.getByRole('button',{name:'PDF Yellow highlight',exact:true}).click();await saved();assert.ok(tables.highlights.length);assert.ok(tables.flashcards.length);assert.ok(tables.quizzes.length);
await page.getByRole('tab',{name:'Extracted text',exact:true}).click();
await page.locator('.extracted-text').evaluate(el=>{const text=el.textContent;const match=text.match(/Photosynthesis is[^.!?]*[.!?]/);if(!match)throw Error('No extracted definition');const start=match.index,end=start+match[0].length;const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);const range=document.createRange();let offset=0,node;while(node=walker.nextNode()){const next=offset+node.textContent.length;if(start>=offset&&start<next)range.setStart(node,start-offset);if(end>offset&&end<=next){range.setEnd(node,end-offset);break;}offset=next;}getSelection().removeAllRanges();getSelection().addRange(range);el.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));});
await page.getByRole('button',{name:'Yellow highlight',exact:true}).click();await saved();const textHighlight=tables.highlights.find(h=>h.data.source==='text');assert.ok(textHighlight);assert.ok(tables.flashcards.some(c=>c.data.highlightId===textHighlight.data.id));assert.equal(textHighlight.page_number,1);
await page.getByRole('tab',{name:/Highlights/}).click();const regenerate=page.locator('.highlight-item').last().getByRole('button',{name:'Regenerate',exact:true});assert.ok(await regenerate.isEnabled());const cardCount=tables.flashcards.length;await regenerate.click();await saved();assert.equal(tables.flashcards.length,cardCount);
await page.getByRole('tab',{name:'My notes',exact:true}).click();
await page.getByRole('button',{name:'Edit note',exact:true}).click();await page.getByLabel('Your notes for this file').fill('Cloud notes survive refresh.');await saved();
const readerUrl=page.url();await page.reload();await page.locator('.pdf-overlay > div').first().waitFor();await page.getByText('Cloud notes survive refresh.',{exact:true}).waitFor();assert.ok(downloads>=2);
await page.evaluate(userId=>{const key='herin:cloud:'+userId;const cached=JSON.parse(localStorage.getItem(key));cached.base=structuredClone(cached.model);const id=cached.model.pdfs.find(p=>p.kind!=='note').id;cached.model.extractedTexts[id].pages[0].text+='\u0000\uD800';cached.pending=true;localStorage.setItem(key,JSON.stringify(cached));},user.id);
await page.reload();await page.locator('.topbar-title').waitFor();await saved();assert.ok(tables.pdfs[0].extracted_text.pages[0].text.endsWith('\uFFFD\uFFFD'));
await navigate('flashcards');await page.getByRole('button',{name:'Tap to reveal answer'}).click();await page.getByRole('button',{name:'Good',exact:true}).click();await saved();assert.equal(tables.flashcards[0].data.rating,'Good');
await navigate('quiz');const answer=page.locator('#quiz-answer');if(await answer.count()){await answer.fill('wrong answer');await page.getByRole('button',{name:'Check answer',exact:true}).click();}else await page.locator('.quiz-options button').first().click();await saved();assert.ok(tables.user_preferences[0].data.quizSession.status);
await navigate('schedule');await page.getByRole('button',{name:'Add class',exact:true}).first().click();await page.getByLabel('Class name',{exact:true}).fill('Cloud Biology');await page.getByRole('dialog').getByRole('button',{name:'Mon',exact:true}).click();await page.getByLabel('Start time').fill('10:00');await page.getByLabel('End time').fill('11:00');await page.getByRole('dialog').getByRole('button',{name:'Add class',exact:true}).click();await saved();assert.equal(tables.classes[0].name,'Cloud Biology');
await page.getByRole('button',{name:'Add deadline',exact:true}).click();await page.getByLabel('Assignment',{exact:true}).fill('Cloud homework');await page.getByLabel('Due date and time').fill('2026-10-01T12:00');await page.getByRole('button',{name:'Save deadline',exact:true}).click();await saved();assert.equal(tables.assignments[0].title,'Cloud homework');
await navigate('settings');await page.getByRole('button',{name:'Plum',exact:true}).click();await page.getByLabel('Color mode').selectOption('dark');await saved();await page.reload();await page.getByLabel('Color mode').waitFor();assert.equal(await page.locator('html').getAttribute('data-theme'),'plum');assert.equal(await page.locator('html').getAttribute('data-mode'),'dark');
rejectWrites=true;await page.getByLabel('Display name').fill('Retry student');await page.getByText(/Not synced: Test: write denied by RLS/).first().waitFor();await page.reload();await page.locator('.topbar-title').waitFor();await page.getByText(/Not synced: Test: write denied by RLS/).first().waitFor();rejectWrites=false;await page.getByRole('button',{name:'Retry sync',exact:true}).first().click();await saved();assert.equal(tables.profiles[0].display_name,'Retry student');
await context.setOffline(true);await page.getByRole('button',{name:'Forest',exact:true}).click();await page.getByText(/Not synced: Offline/).first().waitFor();await page.getByRole('button',{name:'Log out',exact:true}).click();assert.ok(await page.locator('.sidebar').count());await context.setOffline(false);await saved();assert.equal(tables.user_preferences[0].data.settings.theme,'forest');
tables.reminders.push({id:'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',user_id:user.id,title:'Cloud reminder',remind_at:new Date(Date.now()-1000).toISOString(),is_completed:false,related_entity_type:'custom',data:{}});tables.user_preferences[0].push_notifications=true;
await page.reload();await page.getByText('Cloud reminder',{exact:true}).waitFor();await saved();assert.equal(tables.reminders[0].is_completed,true);
for(const width of [390,1440]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
await page.getByRole('button',{name:'Log out',exact:true}).click();await page.getByRole('button',{name:'Log in',exact:true}).waitFor();assert.equal(await page.locator('.sidebar').count(),0);
await page.getByLabel('Email',{exact:true}).fill(user.email);await page.getByLabel('Password',{exact:true}).fill('test-password-123');await page.getByRole('button',{name:'Log in',exact:true}).click();await page.locator('.topbar-title').waitFor();
await page.goto(readerUrl);await page.locator('.pdf-overlay > div').first().waitFor();await page.getByText('Cloud notes survive refresh.',{exact:true}).waitFor();
await navigate('settings');await saved();await page.getByRole('button',{name:'Log out',exact:true}).click();await page.getByRole('button',{name:'Log in',exact:true}).waitFor();user.id='cccccccc-cccc-4ccc-cccc-cccccccccccc';user.email='second@example.test';await page.getByLabel('Email',{exact:true}).fill(user.email);await page.getByLabel('Password',{exact:true}).fill('test-password-123');await page.getByRole('button',{name:'Log in',exact:true}).click();await page.locator('.topbar-title').waitFor();await navigate('pdfs');assert.equal(await page.getByText('Biology-course.pdf',{exact:true}).count(),0);assert.equal(await page.locator('html').getAttribute('data-theme'),'ocean');
await page.evaluate(()=>{localStorage.setItem('studydesk:pdfs',JSON.stringify([{id:'legacy-note',name:'Imported personal note',kind:'note',status:'ready'}]));localStorage.setItem('studydesk:notes',JSON.stringify({'legacy-note':{content:'My existing local note'}}));});await navigate('settings');await page.getByRole('button',{name:'Import local workspace',exact:true}).click();await page.waitForLoadState('domcontentloaded');await page.getByRole('button',{name:'Import local workspace',exact:true}).waitFor();await saved();assert.ok(tables.notes.some(n=>n.user_id===user.id&&n.content==='My existing local note'));assert.ok(tables.pdfs.some(p=>p.user_id==='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'));
assert.deepEqual(errors,[]);fs.mkdirSync('test-results',{recursive:true});await page.screenshot({path:'test-results/supabase-browser.png',fullPage:true});
console.log('PASS simulated Supabase browser: signup confirmation, login/session, private PDF upload/reopen, highlights, notes, flashcards, quiz, classes, assignments, themes, RLS error/retry, offline recovery, reminders, blocked logout while unsynced, logout, relogin, account isolation, legacy import, layouts, zero unexpected console/page errors');
}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
