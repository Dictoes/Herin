const assert=require('node:assert/strict');const fs=require('node:fs');
exports.run=async({browser,context,page,tables,base,readerUrl,navigate,saved})=>{
 await context.grantPermissions(['clipboard-read','clipboard-write']);
 await page.goto(readerUrl);await page.locator('.topbar-title').waitFor();
 await page.getByRole('tab',{name:'My notes',exact:true}).click();
 await page.getByRole('button',{name:'Share',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Share study link'});await dialog.waitFor();
 assert.ok((await dialog.textContent()).includes('Cloud notes survive refresh.'));
 // The link must remain usable when browser clipboard permission is denied.
 await page.evaluate(()=>{window.testClipboard=navigator.clipboard.writeText.bind(navigator.clipboard);navigator.clipboard.writeText=async()=>{throw Error('blocked');};});
 await dialog.getByRole('button',{name:'Create & copy link'}).click();
 await dialog.getByText(/Clipboard access was blocked/).waitFor();
 const url=await dialog.getByLabel('Public study link').inputValue();assert.equal(tables.shared_study_links.length,1);
 await page.evaluate(()=>{navigator.clipboard.writeText=window.testClipboard;delete window.testClipboard;});
 await dialog.getByRole('button',{name:'Copy link',exact:true}).click();await page.getByText('Study link copied!',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),url);assert.equal(tables.shared_study_links.length,1);
 await dialog.getByRole('button',{name:'Close',exact:true}).click();
 const anon=await browser.newContext({serviceWorkers:'block'});let lookups=0;
 try{
 await anon.route('https://*.supabase.co/**',route=>{
  assert.ok(route.request().url().endsWith('/rest/v1/rpc/get_shared_study'),'Public route must not fetch private workspace data');lookups++;
  const id=route.request().postDataJSON().p_share_id;const share=tables.shared_study_links.find(s=>s.share_id===id&&s.is_public);
  const data=share?[{title:share.title,subject:share.subject,content_snapshot:share.content_snapshot,created_at:share.created_at}]:[];
  return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
 });
 const visitor=await anon.newPage();const errors=[];visitor.on('pageerror',e=>errors.push(e.message));
 await visitor.goto(url);await visitor.getByText('Cloud notes survive refresh.',{exact:true}).waitFor();
 assert.equal(await visitor.getByRole('button',{name:/edit|delete/i}).count(),0);
 fs.mkdirSync('test-results/share',{recursive:true});
 for(const width of [360,768,1440])for(const mode of ['light','dark']){
  await visitor.setViewportSize({width,height:900});await visitor.evaluate(m=>document.documentElement.dataset.mode=m,mode);
  assert.ok(await visitor.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await visitor.screenshot({path:`test-results/share/public-${width}-${mode}.png`,fullPage:true,animations:'disabled'});
 }
 // Editing the source must not change a previously shared snapshot.
 await page.getByRole('button',{name:'Edit note',exact:true}).click();await page.getByLabel('Your notes for this file').fill('Edited after sharing.');await saved();
 await visitor.reload();await visitor.getByText('Cloud notes survive refresh.',{exact:true}).waitFor();assert.equal(await visitor.getByText('Edited after sharing.',{exact:true}).count(),0);
 await page.getByLabel('Your notes for this file').fill('Cloud notes survive refresh.');await saved();
 for(const route of ['flashcards','quiz']){
  await navigate(route);await page.getByRole('button',{name:'Share',exact:true}).first().click();
  await page.getByRole('dialog').getByRole('button',{name:'Create & copy link'}).click();await page.getByLabel('Public study link').waitFor();
  const link=await page.getByLabel('Public study link').inputValue();await visitor.goto(link);
  await visitor.getByRole('heading',{name:route==='flashcards'?/Flashcards/:/Quiz preview/}).waitFor();
  await visitor.locator('summary').first().click();assert.ok(await visitor.locator('details[open]').count());await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
 }
 await navigate('settings');await page.getByRole('button',{name:'Stop sharing',exact:true}).first().click();
 await page.getByText('Study link disabled.',{exact:true}).waitFor();
 const revoked=tables.shared_study_links.find(s=>!s.is_public);await visitor.goto(base+'/#/share/'+revoked.share_id);await visitor.getByRole('heading',{name:'This study link is no longer available.',exact:true}).waitFor();
 await visitor.goto(base+'/#/share/not-a-valid-token');await visitor.getByRole('heading',{name:'This study link is no longer available.',exact:true}).waitFor();
 assert.ok(lookups>=5);assert.deepEqual(errors,[]);
 console.log('PASS share browser: publication preview, clipboard + fallback, retry without duplicates, logged-out read, immutable notes, flashcard/quiz previews, revoke/missing, six responsive layouts');
 }finally{await anon.close();}
};
