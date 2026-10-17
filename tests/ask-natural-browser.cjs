// Real page and retrieval with simulated AI transport; no credentials or live inference.
const {chromium}=require('@playwright/test');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try {
  const page=await browser.newPage({viewport:{width:390,height:900}});
  await page.route('**/src/main.jsx*',r=>r.fulfill({contentType:'text/javascript',body:"import '/tests/yuki-harness.jsx';"}));
  await page.addInitScript(()=>{
   localStorage.setItem('studydesk:pdfs',JSON.stringify([{id:'code',name:'Programming.pdf'},{id:'scan',name:'Scan.pdf'}]));
   localStorage.setItem('studydesk:extractedTexts',JSON.stringify({code:[{pageNum:1,text:'Course Outcomes: learn programming.'},{pageNum:2,text:'Functions take inputs and return results.'},{pageNum:3,text:'def double(x):\n    return x * 2\nThe double function multiplies its input by two.'}],scan:[]}));
  });
  const requests=[];
  await page.route('**/functions/v1/generate-study-content',async route=>{
   const body=route.request().postDataJSON();requests.push(body);
   const answer=body.question.includes('example') ? 'The function doubles its input. Illustrative example (not from the PDF):\n```python\nprint(double(4))\n```' : 'Page 3 explains that double multiplies its input by two.';
   await route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,answer,sourcePages:[3]})});
  });
  await page.goto('http://127.0.0.1:5173/#/ask');
  const ask=async question=>{
   const count=await page.locator('.ask-herin-message--assistant').count();
   await page.getByLabel('Ask a question about your study material').fill(question);
   await page.getByRole('button',{name:'Send question',exact:true}).click();
   await page.waitForFunction(count=>document.querySelectorAll('.ask-herin-message--assistant').length>count,count);
  };
  await ask('Explain this concept');
  assert.match(await page.locator('.ask-herin-message--assistant').last().innerText(),/Choose a PDF or note/);
  assert.equal(requests.length,0);
  await page.getByLabel('Select study material').selectOption('code');
  await ask('Why do functions return results?');
  assert.ok(requests.at(-1).context.some(s=>s.page===2));
  await ask('Can you explain page 3 briefly?');
  assert.deepEqual(requests.at(-1).context.map(s=>s.page),[3]);
  assert.match(await page.locator('.ask-herin-message--assistant').last().innerText(),/Page 3/);
  await ask('Give me an example of this code.');
  assert.match(requests.at(-1).context[0].text,/def double/);
  assert.equal(await page.locator('pre code').innerText(),'print(double(4))\n');
  await ask('How does this idea relate to the previous section?');
  assert.deepEqual(requests.at(-1).context.map(s=>s.page),[3,2]);
  const before=requests.length;
  await ask('Describe volcanic eruptions');
  assert.match(await page.locator('.ask-herin-message--assistant').last().innerText(),/could not find supporting text/);
  assert.equal(requests.length,before);
  await page.getByLabel('Select study material').selectOption('scan');
  await ask('What does this concept mean in simpler words?');
  assert.match(await page.locator('.ask-herin-message--assistant').last().innerText(),/could not read text/);
  assert.equal(requests.length,before);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  console.log('PASS: natural question, page 3, code block, previous section, no selection, unsupported question, unreadable PDF; simulated AI transport.');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
