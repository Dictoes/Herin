// Browser integration against a simulated Supabase HTTP API, never a live account.
const {chromium}=require('@playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const user={id:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',email:'student@example.test',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{}};
const tables=Object.fromEntries(['profiles','user_preferences','classes','pdfs','notes','highlights','flashcards','quizzes','assignments','reminders','study_topics','study_generations','quiz_attempts','push_subscriptions'].map(t=>[t,[]]));
const pushTest=process.env.HERIN_PUSH_TEST==='1';
const design=process.env.HERIN_DESIGN_TEST==='1'?require('./design-audit.cjs').capture:async()=>{};
let aiCalls=0,aiFailure=false;
const files=new Map();let rejectWrites=false,uploads=0,downloads=0;
const jwt=()=>{const b=value=>Buffer.from(JSON.stringify(value)).toString('base64url');return b({alg:'HS256',typ:'JWT'})+'.'+b({sub:user.id,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})+'.test';};
const session=()=>({access_token:jwt(),refresh_token:'test-refresh',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user});
(async()=>{
const {databaseJson}=await import('../src/utils/databaseText.js');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
const context=await browser.newContext({serviceWorkers:'block'});
if(pushTest)await context.addInitScript(()=>{
 Object.defineProperty(Notification,'permission',{get:()=> 'granted'});
 Notification.requestPermission=async()=> 'granted';
 const sub={endpoint:'https://fcm.googleapis.com/test-device',toJSON:()=>({endpoint:'https://fcm.googleapis.com/test-device',keys:{p256dh:'A'.repeat(87),auth:'B'.repeat(22)}}),unsubscribe:async()=>{localStorage.removeItem('test-push');return true;}};
 navigator.serviceWorker.getRegistration=async()=>({active:{postMessage:(data,ports)=>{localStorage.setItem('test-push-owner',data.userId||'');ports?.[0]?.postMessage({ok:true});}},pushManager:{getSubscription:async()=>localStorage.getItem('test-push')?sub:null,subscribe:async()=>{localStorage.setItem('test-push','1');return sub;}}});
});
await context.route('https://ycejqtvemiesuiflyqmw.supabase.co/**',async route=>{
 const request=route.request(),url=new URL(request.url()),method=request.method();
 const json=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
 if(method==='OPTIONS')return route.fulfill({status:204});
 if(url.pathname==='/auth/v1/signup')return json({user,session:null});
 if(url.pathname==='/auth/v1/token')return json(session());
 if(url.pathname==='/auth/v1/user')return json(user);
 if(url.pathname==='/auth/v1/logout')return json({});
 if(url.pathname==='/functions/v1/push-notifications'){
  const body=request.postDataJSON();
  if(body.action==='public-key')return json({publicKey:'A'.repeat(87)});
  if(body.action==='test'){assert.equal(body.endpoint,tables.push_subscriptions[0].endpoint);return json({sent:true});}
  assert.equal(body.action,'subscribe');assert.ok(body.timezone);
  tables.push_subscriptions=[{id:'push-device',user_id:user.id,endpoint:body.subscription.endpoint,timezone:body.timezone}];return json({subscribed:true});
 }
 if(url.pathname==='/functions/v1/generate-study-content'){
  aiCalls++;const body=request.postDataJSON();assert.ok(body.pdfId);assert.ok(body.requestId);assert.ok(!JSON.stringify(body).includes('key'));
  if(aiFailure)return json({code:'QUOTA',message:'Quota reached'},429);
  const previous=tables.study_generations.find(g=>g.id===body.requestId);if(previous)return json(previous.result);
  const pdf=tables.pdfs.find(p=>p.id===body.pdfId);assert.ok(pdf);const generationId=body.requestId,created_at=new Date().toISOString();
  const card={id:crypto.randomUUID(),user_id:user.id,pdf_id:pdf.id,question:'AI: What does photosynthesis use?',answer:'Light',data:{pdfId:pdf.data.id,generationId,sourcePage:1,generator:'gemini',generated:true}};
  const quizId=crypto.randomUUID(),q={id:crypto.randomUUID(),question:'AI: Which input is used?',correctAnswer:'Light',options:['Light','Stone','Metal','Sand'],type:'multiple',explanation:'The PDF describes light as the input.',sourcePage:1,generationId};
  const cards=['both','flashcards'].includes(body.contentType),quizzes=['both','quiz'].includes(body.contentType);
  if(cards)tables.flashcards.push({...card,created_at});if(quizzes)tables.quizzes.push({id:quizId,user_id:user.id,pdf_id:pdf.id,questions:[q],title:'AI quiz',total_questions:1,created_at});
  const result={generationId,flashcardCount:cards?1:0,quizCount:quizzes?1:0,summaries:body.contentType==='summary'?[{text:'Photosynthesis uses light.',pages:[1]}]:[]};
  tables.study_generations.push({id:generationId,user_id:user.id,pdf_id:pdf.id,status:'completed',created_at,result});return json(result);
 }
 if(url.pathname==='/rest/v1/rpc/save_quiz_attempt'){
  const b=request.postDataJSON();if(!tables.quiz_attempts.some(a=>a.id===b.p_id))tables.quiz_attempts.push({id:b.p_id,user_id:user.id,quiz_id:b.p_quiz,score:b.p_score,total_questions:b.p_total,created_at:new Date().toISOString()});return json(null);
 }
 if(url.pathname.startsWith('/rest/v1/')){
  const table=url.pathname.split('/').pop();if(!tables[table])return json({message:'Unknown table'},404);
  if(table==='push_subscriptions'){
   if(method==='GET')return json(tables.push_subscriptions.find(r=>r.user_id===user.id&&'eq.'+r.endpoint===url.searchParams.get('endpoint'))||null);
   if(method==='DELETE'){tables.push_subscriptions=tables.push_subscriptions.filter(r=>r.user_id!==user.id||'eq.'+r.endpoint!==url.searchParams.get('endpoint'));return json([]);}
  }
  if(method==='GET'){const rows=tables[table].filter(r=>r.user_id===user.id&&[...url.searchParams].every(([key,value])=>!value.startsWith('eq.')||String(r[key])===value.slice(3)));return json(url.searchParams.get('limit')==='0'?[]:rows);}
  if(rejectWrites)return json({message:'Test: write denied by RLS',code:'42501'},403);
  if(method==='POST'){
   const body=request.postDataJSON(),rows=Array.isArray(body)?body:[body];
   assert.equal(new Set(rows.map(row=>row.id||row.user_id)).size,rows.length,"No duplicate conflict keys in an upsert");
   if(JSON.stringify(rows)!==JSON.stringify(databaseJson(rows)))return json({message:"unsupported Unicode escape sequence",code:"22P05"},400);
   for(const row of rows){assert.equal(row.user_id,user.id);const key=row.id?'id':'user_id';const index=tables[table].findIndex(r=>r[key]===row[key]);const saved={created_at:new Date().toISOString(),updated_at:new Date().toISOString(),...tables[table][index],...row};if(index<0)tables[table].push(saved);else tables[table][index]=saved;}
   return json(Array.isArray(body)?rows:rows[0],201);
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
const page=await context.newPage(),errors=[];page.on('dialog',dialog=>dialog.accept());page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource:.*(403|429)/.test(m.text()))errors.push(m.text());});
const base=process.env.HERIN_URL||'http://127.0.0.1:4173';
const saved=()=>page.getByText('Saved to Supabase',{exact:true}).first().waitFor();
const navigate=async route=>{await page.goto(base+'/#/'+route);await page.locator('.topbar-title').waitFor();};
await page.goto(base);await design(page,'login');await page.getByRole('button',{name:'Create an account',exact:true}).click();await design(page,'signup');
await page.getByLabel('Email',{exact:true}).fill(user.email);await page.getByLabel('Password',{exact:true}).fill('test-password-123');await page.getByRole('button',{name:'Sign up',exact:true}).click();await page.getByText('Check your email to confirm your account, then log in.').waitFor();
await page.getByRole('button',{name:'Already have an account? Log in',exact:true}).click();await page.getByRole('button',{name:'Log in',exact:true}).click();await page.locator('.topbar-title').waitFor();
if(process.env.HERIN_DESIGN_TEST==='1'){
 for(const route of ['','schedule','pdfs','notes','flashcards','quiz']){await navigate(route);await design(page,'empty-'+(route||'dashboard'));}
}
await navigate('pdfs');await page.locator('input[type=file]').setInputFiles(path.join(__dirname,'fixtures/Biology-course.pdf'));
await page.getByText('Ready',{exact:true}).waitFor({timeout:60000});await saved();assert.equal(uploads,1);assert.equal(tables.pdfs[0].data.status,'ready',JSON.stringify(tables.pdfs[0].data));assert.equal(tables.pdfs[0].extracted_text.pages.length,24);
await page.getByText('Biology-course.pdf',{exact:true}).click();await page.locator('.pdf-text-layer span').first().waitFor();
const ai=page.getByRole('region',{name:'AI Herin Assistant'});
await page.getByRole('button',{name:'AI Herin Assistant',exact:true}).click();assert.equal(await page.evaluate(()=>document.activeElement.id),'ai-herin-assistant');
await ai.getByRole('button',{name:'Generate Both',exact:true}).click();await ai.getByText('Completed',{exact:true}).waitFor();assert.equal(aiCalls,1);
await ai.getByRole('link',{name:'Review generated flashcards'}).click();await page.getByRole('button',{name:'Tap to reveal answer'}).click();assert.ok((await page.locator('.study-answer-text').textContent()).includes('Light'));
await page.reload();await page.getByRole('button',{name:'Tap to reveal answer'}).waitFor();assert.ok(await page.getByText('AI: What does photosynthesis use?',{exact:true}).count());
await navigate('quiz');await page.locator('.quiz-options button').filter({hasText:'Light'}).click();await page.getByText('The PDF describes light as the input.').waitFor();await page.getByRole('button',{name:'See results',exact:true}).click();await page.getByText('Quiz history',{exact:true}).waitFor();assert.equal(tables.quiz_attempts.length,1);await page.reload();await page.getByText('Quiz history',{exact:true}).waitFor();assert.equal(tables.quiz_attempts.length,1);
await navigate('pdfs/'+tables.pdfs[0].data.id);await ai.getByRole('button',{name:'Summarize topic',exact:true}).click();await ai.getByText('Completed',{exact:true}).waitFor();await ai.getByText(/Saved summary/).click();await ai.getByText('Photosynthesis uses light.',{exact:true}).waitFor();
aiFailure=true;await ai.getByRole('button',{name:'Generate Flashcards',exact:true}).click();await ai.getByText(/AI quota or rate limit reached. Wait before retrying./).waitFor();aiFailure=false;await ai.getByRole('button',{name:'Retry AI generation'}).click();await ai.getByText('Completed',{exact:true}).waitFor();
for(const width of [390,1440]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));fs.mkdirSync('test-results',{recursive:true});await page.screenshot({path:`test-results/ai-study-${width}.png`,fullPage:true});}
await page.locator('.pdf-text-layer').evaluate(el=>{const span=[...el.querySelectorAll('span')].find(s=>s.textContent.includes('Photosynthesis is'));if(!span)throw Error('No definition');const range=document.createRange();range.selectNodeContents(span);getSelection().removeAllRanges();getSelection().addRange(range);el.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));});
await page.getByRole('button',{name:'PDF Yellow highlight',exact:true}).click();await saved();assert.ok(tables.highlights.length);assert.ok(tables.flashcards.length);assert.ok(tables.quizzes.length);
await page.getByRole('tab',{name:'Extracted text',exact:true}).click();
await page.locator('.extracted-text').evaluate(el=>{const text=el.textContent;const match=text.match(/Photosynthesis is[^.!?]*[.!?]/);if(!match)throw Error('No extracted definition');const start=match.index,end=start+match[0].length;const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);const range=document.createRange();let offset=0,node;while(node=walker.nextNode()){const next=offset+node.textContent.length;if(start>=offset&&start<next)range.setStart(node,start-offset);if(end>offset&&end<=next){range.setEnd(node,end-offset);break;}offset=next;}getSelection().removeAllRanges();getSelection().addRange(range);el.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));});
await page.getByRole('button',{name:'Yellow highlight',exact:true}).click();await saved();const textHighlight=tables.highlights.find(h=>h.data.source==='text');assert.ok(textHighlight);assert.ok(tables.flashcards.some(c=>c.data.highlightId===textHighlight.data.id));assert.equal(textHighlight.page_number,1);
await page.getByRole('tab',{name:/Highlights/}).click();const regenerate=page.locator('.highlight-item').last().getByRole('button',{name:'Regenerate',exact:true});assert.ok(await regenerate.isEnabled());const cardCount=tables.flashcards.length;await regenerate.click();await saved();assert.equal(tables.flashcards.length,cardCount);
await page.getByRole('tab',{name:'My notes',exact:true}).click();
await page.getByRole('button',{name:'Edit note',exact:true}).click();await page.getByLabel('Your notes for this file').fill('Cloud notes survive refresh.');await saved();
const readerUrl=page.url();await page.reload();await page.locator('.pdf-overlay > div').first().waitFor();await page.getByText('Cloud notes survive refresh.',{exact:true}).waitFor();assert.ok(downloads>=2);
const engineeringText='Safety, mobility, accessibility, reliability, economy, constructability, environmental effects, and long- term performance matter.';
await page.evaluate(({userId,text})=>{const key='herin:cloud:'+userId;const cached=JSON.parse(localStorage.getItem(key));cached.base=structuredClone(cached.model);const id=cached.model.pdfs.find(p=>p.kind!=='note').id;(cached.model.highlights[id]||=[]).push({id:'engineering-list-regression',source:'text',text,start:0,end:text.length,page:6,color:'green',generationStatus:'empty'});cached.pending=true;localStorage.setItem(key,JSON.stringify(cached));},{userId:user.id,text:engineeringText});
await page.reload();await page.getByRole('tab',{name:/Highlights/}).click();await page.locator('.highlight-item').filter({hasText:engineeringText}).getByRole('button',{name:'Generate flashcards',exact:true}).click();await saved();
const listCard=tables.flashcards.find(c=>c.data.highlightId==='engineering-list-regression');assert.ok(listCard);assert.equal(listCard.data.sourcePage,6);
const listQuiz=tables.quizzes.flatMap(q=>q.questions).find(q=>q.highlightId==='engineering-list-regression');assert.equal(listQuiz.expectedItems.length,8);
await navigate('flashcards');await page.getByLabel('Search flashcards').fill('Which 8 items');await page.getByRole('button',{name:'Tap to reveal answer'}).click();assert.ok((await page.locator('.study-answer-text').textContent()).includes('long-term performance'));
await navigate('quiz');await page.getByLabel('Question type').selectOption('enumeration');await page.locator('#quiz-answer').fill(listQuiz.correctAnswer);await page.getByRole('button',{name:'Check answer',exact:true}).click();await page.getByRole('heading',{name:'Correct',exact:true}).waitFor();await saved();await page.reload();await page.getByRole('heading',{name:'Correct',exact:true}).waitFor();await page.getByLabel('Question type').selectOption('');await saved();
await page.goto(readerUrl);await page.locator('.pdf-text-layer span').first().waitFor();
await page.evaluate(userId=>{const key='herin:cloud:'+userId;const cached=JSON.parse(localStorage.getItem(key));cached.base=structuredClone(cached.model);const id=cached.model.pdfs.find(p=>p.kind!=='note').id;cached.model.extractedTexts[id].pages[0].text+='\u0000\uD800';cached.pending=true;localStorage.setItem(key,JSON.stringify(cached));},user.id);
await page.reload();await page.locator('.topbar-title').waitFor();await saved();assert.ok(tables.pdfs[0].extracted_text.pages[0].text.endsWith('\uFFFD\uFFFD'));
await navigate('flashcards');await page.getByRole('button',{name:'Tap to reveal answer'}).click();await page.getByRole('button',{name:'Good',exact:true}).click();await saved();assert.equal(tables.flashcards[0].data.rating,'Good');
await navigate('quiz');const answer=page.locator('#quiz-answer');if(await answer.count()){await answer.fill('wrong answer');await page.getByRole('button',{name:'Check answer',exact:true}).click();}else await page.locator('.quiz-options button').first().click();await saved();assert.ok(tables.user_preferences[0].data.quizSession.status);
await navigate('schedule');await page.getByRole('button',{name:'Add class',exact:true}).first().click();await page.getByLabel('Class name',{exact:true}).fill('Cloud Biology');await page.getByRole('dialog').getByRole('button',{name:'Mon',exact:true}).click();await page.getByLabel('Start time').fill('10:00');await page.getByLabel('End time').fill('11:00');await page.getByRole('dialog').getByRole('button',{name:'Add class',exact:true}).click();await saved();assert.equal(tables.classes[0].name,'Cloud Biology');
await page.getByRole('button',{name:'Add deadline',exact:true}).click();await page.getByLabel('Assignment',{exact:true}).fill('Cloud homework');await page.getByLabel('Due date and time').fill('2026-10-01T12:00');await page.getByRole('button',{name:'Save deadline',exact:true}).click();await saved();assert.equal(tables.assignments[0].title,'Cloud homework');
await navigate('settings');await page.getByRole('button',{name:'Plum',exact:true}).click();await page.getByLabel('Color mode').selectOption('dark');await saved();await page.reload();await page.getByLabel('Color mode').waitFor();assert.equal(await page.locator('html').getAttribute('data-theme'),'plum');assert.equal(await page.locator('html').getAttribute('data-mode'),'dark');
if(process.env.HERIN_DESIGN_TEST==='1'){
 tables.pdfs[0].data.subject='Biology';
 await page.reload();await page.locator('.topbar-title').waitFor();
 for(const route of ['','schedule','pdfs','notes','flashcards','quiz','settings','pdfs/'+tables.pdfs[0].data.id]){await navigate(route);await design(page,'populated-'+(route.replace('/','-')||'dashboard'));}
 await navigate('schedule');await page.getByRole('button',{name:'Add class',exact:true}).first().click();await design(page,'class-form');await page.getByRole('button',{name:'Close dialog'}).click();
 await navigate('flashcards');await page.getByRole('button',{name:'Edit flashcard',exact:true}).click();await design(page,'flashcard-form');await page.getByRole('button',{name:'Close dialog'}).click();
 await page.getByRole('button',{name:'Delete flashcard',exact:true}).click();await design(page,'confirm-delete');await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await page.setViewportSize({width:360,height:900});await page.getByRole('button',{name:'Open navigation menu'}).click();await page.locator('.nav-subject summary').first().click();await page.screenshot({path:'test-results/design/navigation-mobile.png',animations:'disabled'});await page.getByRole('button',{name:'Close navigation menu'}).click();
 await navigate('settings');
}
rejectWrites=true;await page.getByLabel('Display name').fill('Retry student');await page.getByText(/Not synced: Test: write denied by RLS/).first().waitFor();await page.reload();await page.locator('.topbar-title').waitFor();await page.getByText(/Not synced: Test: write denied by RLS/).first().waitFor();rejectWrites=false;await page.getByRole('button',{name:'Retry sync',exact:true}).first().click();await saved();assert.equal(tables.profiles[0].display_name,'Retry student');
await context.setOffline(true);await page.getByRole('button',{name:'Forest',exact:true}).click();await page.getByText(/Not synced: Offline/).first().waitFor();await page.getByRole('button',{name:'Log out',exact:true}).click();assert.ok(await page.locator('.sidebar').count());await context.setOffline(false);await saved();assert.equal(tables.user_preferences[0].data.settings.theme,'forest');
tables.reminders.push({id:'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',user_id:user.id,title:'Cloud reminder',remind_at:new Date(Date.now()-1000).toISOString(),is_completed:false,related_entity_type:'custom',data:{}});tables.user_preferences[0].push_notifications=true;
await page.reload();await page.getByText('Cloud reminder',{exact:true}).waitFor();await saved();assert.equal(tables.reminders[0].is_completed,false);assert.ok(tables.reminders[0].data.localNotifiedAt);
if(pushTest){
 await page.getByRole('button',{name:'Enable background reminders',exact:true}).click();
 await page.getByRole('button',{name:'Disable on this device',exact:true}).waitFor();assert.equal(tables.push_subscriptions.length,1);
 await page.getByRole('button',{name:'Send test notification',exact:true}).click();await page.getByText('Test sent. Check your device notifications.',{exact:true}).waitFor();
 await page.reload();await page.getByRole('button',{name:'Disable on this device',exact:true}).waitFor();
 await page.getByRole('button',{name:'Disable on this device',exact:true}).click();await page.getByRole('button',{name:'Enable background reminders',exact:true}).waitFor();assert.equal(tables.push_subscriptions.length,0);
 await page.getByRole('button',{name:'Enable background reminders',exact:true}).click();await page.getByRole('button',{name:'Disable on this device',exact:true}).waitFor();
}
for(const width of [390,1440]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
await page.getByRole('button',{name:'Log out',exact:true}).click();await page.getByRole('button',{name:'Log in',exact:true}).waitFor();assert.equal(await page.locator('.sidebar').count(),0);
if(pushTest){assert.equal(tables.push_subscriptions.length,0);assert.equal(await page.evaluate(()=>localStorage.getItem('test-push-owner')),'');console.log('PASS push enrollment, reload status, device disable, re-enable, and logout revocation (mock push service).');}
await page.getByLabel('Email',{exact:true}).fill(user.email);await page.getByLabel('Password',{exact:true}).fill('test-password-123');await page.getByRole('button',{name:'Log in',exact:true}).click();await page.locator('.topbar-title').waitFor();
await page.goto(readerUrl);await page.locator('.pdf-overlay > div').first().waitFor();await page.getByText('Cloud notes survive refresh.',{exact:true}).waitFor();
await navigate('settings');await saved();await page.getByRole('button',{name:'Log out',exact:true}).click();await page.getByRole('button',{name:'Log in',exact:true}).waitFor();user.id='cccccccc-cccc-4ccc-cccc-cccccccccccc';user.email='second@example.test';await page.getByLabel('Email',{exact:true}).fill(user.email);await page.getByLabel('Password',{exact:true}).fill('test-password-123');await page.getByRole('button',{name:'Log in',exact:true}).click();await page.locator('.topbar-title').waitFor();await navigate('pdfs');assert.equal(await page.getByText('Biology-course.pdf',{exact:true}).count(),0);assert.equal(await page.locator('html').getAttribute('data-theme'),'ocean');
await page.evaluate(()=>{localStorage.setItem('studydesk:pdfs',JSON.stringify([{id:'legacy-note',name:'Imported personal note',kind:'note',status:'ready'}]));localStorage.setItem('studydesk:notes',JSON.stringify({'legacy-note':{content:'My existing local note'}}));});await navigate('settings');await page.getByRole('button',{name:'Import local workspace',exact:true}).click();await page.waitForLoadState('domcontentloaded');await page.getByRole('button',{name:'Import local workspace',exact:true}).waitFor();await saved();assert.ok(tables.notes.some(n=>n.user_id===user.id&&n.content==='My existing local note'));assert.ok(tables.pdfs.some(p=>p.user_id==='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'));
assert.deepEqual(errors,[]);fs.mkdirSync('test-results',{recursive:true});await page.screenshot({path:'test-results/supabase-browser.png',fullPage:true});
console.log('PASS simulated Supabase browser: signup confirmation, login/session, private PDF upload/reopen, highlights, notes, flashcards, quiz, classes, assignments, themes, RLS error/retry, offline recovery, reminders, blocked logout while unsynced, logout, relogin, account isolation, legacy import, layouts, zero unexpected console/page errors');
}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
