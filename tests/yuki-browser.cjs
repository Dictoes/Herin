// Isolated UI harness: actual components and storage, simulated AI transport only.
const {chromium}=require('@playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const base=process.env.BASE_URL||'http://127.0.0.1:5173';
const output=path.join(os.tmpdir(),'herin-yuki-final');
fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try {
 const page=await browser.newPage(); const errors=[];
 page.on('pageerror',e=>{errors.push(e.message); console.error(e.message);});
 await page.route('**/src/main.jsx*',route=>route.fulfill({contentType:'text/javascript',body:"import '/tests/yuki-harness.jsx';"}));
 await page.addInitScript(()=>{
  localStorage.setItem('studydesk:pdfs',JSON.stringify([{id:'p',name:'Biology',status:'ready'}]));
  localStorage.setItem('studydesk:notes',JSON.stringify({p:{content:'Plants use sunlight.'}}));
  localStorage.setItem('studydesk:extractedTexts',JSON.stringify({p:[{pageNum:1,text:'Plants use sunlight.'}]}));
  localStorage.setItem('herin:study',JSON.stringify({flashcards:[],quizQuestions:[{id:'q1',generationId:'batch-test',pdfId:'p',type:'multiple',question:'Which input do plants use?',options:['Sunlight','Stone'],correctAnswer:'Sunlight',explanation:'Plants use sunlight.'},{id:'q2',generationId:'batch-test',pdfId:'p',type:'multiple',question:'Choose the input.',options:['Sunlight','Stone'],correctAnswer:'Sunlight',explanation:'Plants use sunlight.'}]}));
 });
 let calls=0; const bodies=[];
 await page.route('**/functions/v1/generate-study-content',async route=>{
  bodies.push(route.request().postDataJSON()); calls++;
  await new Promise(resolve=>setTimeout(resolve,1000));
  await route.fulfill({status:calls===1?503:200,contentType:'application/json',body:JSON.stringify(calls===1?{message:'Test service unavailable'}:{success:true,answer:'UI test response: plants use sunlight.',sourcePages:[1,999]})});
 });
 await page.goto(base+'/#/ask?pdf=p');
 await page.locator('.yuki').waitFor();
 assert.equal(await page.locator('.yuki').getAttribute('data-state'),'welcome');
 await page.waitForFunction(()=>document.querySelector('.yuki')?.dataset.state==='idle');
 await page.locator('.yuki').scrollIntoViewIfNeeded();
 assert.ok((await page.locator('.yuki-frame').evaluate(el=>getComputedStyle(el).backgroundImage)).includes('yuki-idle-sheet.png'));
 const idleCheck=await page.evaluate(async()=>{
  const yuki=document.querySelector('.yuki'),initial=yuki.getBoundingClientRect(),frames=new Set([Number(yuki.dataset.frame)]);
  let stable=true;
  const observer=new MutationObserver(()=>{frames.add(Number(yuki.dataset.frame));const box=yuki.getBoundingClientRect();stable&&=Math.abs(box.width-initial.width)<.1&&Math.abs(box.height-initial.height)<.1&&Math.abs(box.y-initial.y)<.1;});
  observer.observe(yuki,{attributes:true,attributeFilter:['data-frame']});
  await new Promise(resolve=>setTimeout(resolve,8000));observer.disconnect();
  return {frames:[...frames].sort(),stable};
 });
 assert.deepEqual(idleCheck.frames,[0,1,2,3,4,5,6,7]);assert.ok(idleCheck.stable,'Idle must not shift surrounding layout');
 await page.locator('.yuki').evaluate(el=>el.style.transform='translateY(-10000px)');
 await page.locator('.yuki[data-visible="false"]').waitFor({state:'attached'});
 const pausedFrame=await page.locator('.yuki').getAttribute('data-frame');
 await page.waitForTimeout(1000);
 assert.equal(await page.locator('.yuki').getAttribute('data-frame'),pausedFrame,'Offscreen animation should pause');
 await page.locator('.yuki').evaluate(el=>el.style.transform='');
 await page.locator('.yuki[data-visible="true"]').waitFor();
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.waitForTimeout(100);
 const stillFrame=await page.locator('.yuki').getAttribute('data-frame');
 await page.waitForTimeout(900);
 assert.equal(await page.locator('.yuki').getAttribute('data-frame'),stillFrame);
 assert.equal(await page.locator('.yuki-frame').evaluate(el=>getComputedStyle(el).animationName),'none');
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.locator('.yuki[data-state="idle"]').waitFor();
 for(const width of [1440,390,320]) {
  await page.setViewportSize({width,height:900});
  for(const mode of ['light','dark']) {
   await page.evaluate(mode=>document.documentElement.dataset.mode=mode,mode);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${width} ${mode}`);
   await page.screenshot({path:path.join(output,`ask-${width}-${mode}.png`),fullPage:true});
  }
 }
 await page.getByRole('button',{name:'Explain a key idea from my material',exact:true}).click();
 await page.getByRole('button',{name:'Send question'}).click();
 await page.locator('.ask-herin-thinking .yuki[data-state="thinking"]').waitFor();
 await page.getByText('Test service unavailable',{exact:true}).waitFor();
 await page.locator('.ask-herin-error .yuki[data-state="error"]').waitFor();
 await page.getByRole('button',{name:'Retry',exact:true}).click();
 await page.locator('.ask-herin-message--assistant').waitFor();
 await page.locator('.ask-herin-message--assistant .yuki[data-state="speaking"]').waitFor();
 assert.equal(await page.locator('.ask-herin-message--user').count(),1);
 assert.deepEqual(bodies[0].context,bodies[1].context);
 assert.ok(bodies[0].context.length);
 assert.equal(await page.locator('.ask-herin-citations').textContent(),'Source pages: 1');
 await page.locator('.ask-herin-message--assistant .yuki[data-state="idle"]').waitFor();
 await page.screenshot({path:path.join(output,'answer-mobile.png'),fullPage:true});
 await page.evaluate(()=>location.hash='/notes');
 await page.locator('.yuki-note-tip').waitFor();
 await page.locator('.yuki-note-tip .yuki[data-state="encouraging"]').waitFor();
 await page.evaluate(()=>location.hash='/quiz');
 await page.locator('.quiz-options').waitFor();
 assert.equal(await page.locator('.quiz-yuki-response').count(),0);
 await page.getByRole('button',{name:'B Stone',exact:true}).click();
 await page.locator('.yuki[data-state="quizWrong"][data-frame="3"]').waitFor();
 await page.locator('.quiz-yuki-response .yuki[data-state="idle"]').waitFor();
 for(const width of [1440,390,320]) {
  await page.setViewportSize({width,height:900});
  const mascot=await page.locator('.quiz-yuki-response .yuki').boundingBox();
  const feedback=await page.locator('.quiz-yuki-response').boundingBox();
  assert.ok(mascot.width>=144);
  assert.ok(Math.abs(mascot.x+mascot.width/2-feedback.x-feedback.width/2)<2);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:path.join(output,`quiz-${width}.png`),fullPage:true});
 }
 await page.getByRole('button',{name:'Next question',exact:true}).click();
 await page.getByRole('button',{name:'A Sunlight',exact:true}).click();
 await page.locator('.yuki[data-state="quizCorrect"]').waitFor();
 await page.locator('.quiz-yuki-response .yuki[data-state="idle"]').waitFor();
 await page.getByRole('button',{name:'See results',exact:true}).click();
 await page.locator('.quiz-results .yuki').waitFor();
 assert.equal(await page.locator('.quiz-results .yuki').getAttribute('data-state'),'celebrating');
 assert.equal(await page.locator('.quiz-review-list').isVisible(),false);
 await page.locator('.quiz-review-dropdown > summary').click();
 assert.equal(await page.locator('.quiz-review-item').count(),2);
 assert.ok((await page.locator('.quiz-review-item').first().innerText()).includes('Your answer: Stone'));
 assert.ok((await page.locator('.quiz-review-item').last().innerText()).includes('Your answer: Sunlight'));
 await page.getByLabel('Incorrect only').check();
 assert.equal(await page.locator('.quiz-review-item').count(),1);
 await page.reload();
 await page.locator('.quiz-results').waitFor();
 assert.equal(await page.locator('.quiz-review-list').isVisible(),false);
 await page.locator('.quiz-review-dropdown > summary').click();
 assert.equal(await page.locator('.quiz-review-item').count(),2);
 assert.ok((await page.locator('.quiz-review-item').first().innerText()).includes('Your answer: Stone'));
 for(const width of [1440,390,320]) {
  await page.setViewportSize({width,height:900});
  await page.waitForTimeout(400);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:path.join(output,`results-${width}.png`),fullPage:true});
 }
 await page.getByRole('button',{name:'Back to top',exact:true}).click();
 await page.waitForFunction(()=>document.activeElement?.getBoundingClientRect().top>=0 && document.activeElement?.getBoundingClientRect().top<100);
 await page.locator('.quiz-review-dropdown > summary').click();
 assert.equal(await page.locator('.quiz-review-list').isVisible(),false);
 await page.getByRole('button',{name:'Practice again',exact:true}).click();
 await page.locator('.quiz-options').waitFor();
 assert.equal(await page.locator('.quiz-results').count(),0);
 await page.getByRole('button',{name:'Delete generated set',exact:true}).click();
 await page.getByRole('dialog').waitFor();
 assert.ok((await page.getByRole('dialog').innerText()).includes('all 2 questions'));
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await page.getByRole('button',{name:'Delete generated set',exact:true}).click();
 await page.getByRole('button',{name:'Delete 2 questions',exact:true}).click();
 await page.getByRole('heading',{name:'No questions in this selection',exact:true}).waitFor();
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.evaluate(()=>location.hash='/ask');
 await page.locator('.yuki[data-state="empty"]').waitFor();
 const frame=await page.locator('.yuki').getAttribute('data-frame');
 await page.waitForTimeout(900);
 assert.equal(await page.locator('.yuki').getAttribute('data-frame'),frame);
 assert.equal(await page.locator('.yuki-frame').evaluate(el=>getComputedStyle(el).animationName),'none');
 await page.evaluate(()=>location.hash='/');
 await page.locator('.dashboard-yuki').waitFor();
 for(const width of [1440,390,320]) {
  await page.setViewportSize({width,height:900});
  // Let the app layout's responsive width transition settle before measuring.
  await page.waitForTimeout(400);
  const mascot=await page.locator('.dashboard-yuki').boundingBox();
  const welcome=await page.locator('.welcome-banner').boundingBox();
  assert.ok(mascot.width>=168);
  const greeting=await page.locator('.dashboard-yuki-greeting').boundingBox();
  const bubble=await page.locator('.dashboard-yuki-bubble').boundingBox();
  assert.ok(Math.abs(greeting.x+greeting.width/2-welcome.x-welcome.width/2)<2);
  assert.ok(Math.abs(mascot.x+mascot.width/2-welcome.x-welcome.width/2)<2);
  if(width>680) assert.ok(bubble.x >= mascot.x+mascot.width);
  else assert.ok(bubble.y+bubble.height <= mascot.y);
  await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);
  await page.screenshot({path:path.join(output,`dashboard-${width}.png`),fullPage:true});
 }
 const previousGreeting=await page.locator('.dashboard-yuki-bubble').innerText();
 await page.evaluate(()=>location.hash='/ask');
 await page.locator('.ask-herin-welcome').waitFor();
 await page.evaluate(()=>location.hash='/');
 await page.locator('.dashboard-yuki-bubble').waitFor();
 assert.notEqual(await page.locator('.dashboard-yuki-bubble').innerText(),previousGreeting);
 // Inspect all 24 actual CSS crops at native frame dimensions.
 await page.setViewportSize({width:1056,height:1600});

 await page.evaluate(async()=>{
  const {YUKI_ROW_BOUNDS:bounds}=await import('/src/utils/yukiStates.js');
  document.body.innerHTML='<div style="display:grid;grid-template-columns:repeat(4,256px);gap:4px">'+Array.from({length:24},(_,i)=>{
   const row=Math.floor(i/4),top=bounds[i%4][row],height=bounds[i%4][row+1]-top,scale=Math.max(256,height);
   return '<span style="display:flex;align-items:center;justify-content:center;width:256px;height:256px"><span style="display:block;width:'+256/scale*100+'%;height:'+height/scale*100+'%;background-image:url(/yuki-study-helper.png);background-repeat:no-repeat;background-size:400% '+1536/height*100+'%;background-position:'+(i%4*100/3)+'% '+top/(1536-height)*100+'%"></span></span>';
  }).join('')+'</div>';
 });
 await page.screenshot({path:path.join(output,'sprite-crops.png'),fullPage:true});
 await page.setViewportSize({width:1040,height:540});
 await page.evaluate(async()=>{
  const {YUKI_IDLE_FRAMES}=await import('/src/utils/yukiStates.js');
  document.body.innerHTML='<div style="display:grid;grid-template-columns:repeat(4,256px);gap:4px;background:#edf5f1">'+YUKI_IDLE_FRAMES.map(f=>`<span style="display:block;width:256px;height:256px;background-image:url(/yuki-idle-sheet.png);background-repeat:no-repeat;background-size:400% 200%;background-position:${f.column*100/3}% ${f.row*100}%"></span>`).join('')+'</div>';
  await new Promise((resolve,reject)=>{const image=new Image();image.onload=resolve;image.onerror=reject;image.src='/yuki-idle-sheet.png';});
 });
 await page.screenshot({path:path.join(output,'idle-crops.png'),fullPage:true});
 // Every reduced-motion reaction retains its intended pose and accessible meaning.
 await page.evaluate(async()=>{
  const reactModule=await import('/node_modules/.vite/deps/react.js');
  const React=reactModule.default||reactModule;
  const client=await import('/node_modules/.vite/deps/react-dom_client.js');
  const {createRoot}=client.default||client;
  const {default:Yuki}=await import('/src/components/common/Yuki.jsx');
  const {YUKI_REACTIONS}=await import('/src/utils/yukiStates.js');
  document.body.innerHTML='<div id="reaction-gallery" style="display:grid;grid-template-columns:repeat(4,180px);gap:12px"></div>';
  createRoot(document.getElementById('reaction-gallery')).render(React.createElement(React.Fragment,null,...Object.keys(YUKI_REACTIONS).map(state=>React.createElement('div',{key:state},React.createElement(Yuki,{state,size:'small'}),React.createElement('p',null,state)))));
 });
 await page.waitForFunction(()=>document.querySelectorAll('#reaction-gallery .yuki').length===12);
 const stillReactions=await page.locator('#reaction-gallery .yuki').evaluateAll(els=>els.map(el=>({state:el.dataset.state,frame:el.dataset.frame,label:el.getAttribute('aria-label'),motion:getComputedStyle(el.querySelector('.yuki-motion')).animationName})));
 assert.ok(stillReactions.every(item=>item.label.startsWith('Yuki ')&&item.motion==='none'));
 await page.waitForTimeout(1000);
 assert.deepEqual(await page.locator('#reaction-gallery .yuki').evaluateAll(els=>els.map(el=>el.dataset.frame)),stillReactions.map(item=>item.frame));
 await page.screenshot({path:path.join(output,'reduced-reactions.png'),fullPage:true});
 assert.deepEqual(errors,[]);
 console.log('PASS: desktop/mobile light/dark, no overflow, welcome/idle, thinking, error/retry, citation filtering, notes, wrong/reassurance/correct, reduced motion. Simulated AI transport; no live AI call. Screenshots: '+output);
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});






