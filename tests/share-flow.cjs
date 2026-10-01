const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
exports.run=async({browser,context,page,tables,sharedPdfs,base,readerUrl,navigate,saved,setUploadFailure,setUploadDelay,setExpireNextSignedUrl,uploadCount})=>{
 await context.grantPermissions(['clipboard-read','clipboard-write']);
 await page.goto(readerUrl);await page.locator('.topbar-title').waitFor();
 await page.getByRole('tab',{name:'My notes',exact:true}).click();
 await page.getByRole('button',{name:'Share',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Share study link'});await dialog.waitFor();
 assert.ok((await dialog.textContent()).includes('Cloud notes survive refresh.'));
 await page.evaluate(()=>{window.testClipboard=navigator.clipboard.writeText.bind(navigator.clipboard);navigator.clipboard.writeText=async()=>{throw Error('blocked');};});
 await dialog.getByRole('button',{name:'Create & copy link'}).click();
 await dialog.getByText(/Clipboard access was blocked/).waitFor();
 const url=await dialog.getByLabel('Public study link').inputValue();assert.equal(tables.shared_study_links.length,1);
 assert.equal(tables.shared_study_links[0].pdf_file_name,null);
 await page.evaluate(()=>{navigator.clipboard.writeText=window.testClipboard;delete window.testClipboard;});
 await dialog.getByRole('button',{name:'Copy link',exact:true}).click();await page.getByText('Study link copied!',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),url);assert.equal(tables.shared_study_links.length,1);
 await dialog.getByRole('button',{name:'Close',exact:true}).click();
 const anon=await browser.newContext({serviceWorkers:'block'});let lookups=0,expireNextDownload=false;
 try{
  await anon.route('https://*.supabase.co/**',async route=>{
   const request=route.request(),target=new URL(request.url());
   if(target.pathname==='/functions/v1/shared-pdf'){
    const body=request.postDataJSON(),share=tables.shared_study_links.find(s=>s.share_id===body.share_id&&s.is_public),pdf=sharedPdfs.get(body.share_id);
    if(!share)return route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({error:'This study link is no longer available.'})});
    if(!pdf)return route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({error:'The attached PDF is missing or unreadable.'})});
    if(body.action==='check')return route.fulfill({contentType:'application/json',body:JSON.stringify({available:true,file_name:pdf.name,file_size:pdf.size})});
    if(body.action==='download'){
     if(expireNextDownload){expireNextDownload=false;return route.fulfill({status:410,contentType:'application/json',body:JSON.stringify({error:'The signed URL expired.'})});}
     return route.fulfill({contentType:'application/json',body:JSON.stringify({url:`https://ycejqtvemiesuiflyqmw.supabase.co/storage/v1/object/sign/herin-pdfs/${share.user_id}/shared/${body.share_id}.pdf?token=short-lived`,expires_in:300})});
    }
   }
   if(target.pathname==='/rest/v1/rpc/get_shared_study'){
    lookups++;const id=request.postDataJSON().p_share_id,share=tables.shared_study_links.find(s=>s.share_id===id&&s.is_public);
    const data=share?[{title:share.title,subject:share.subject,content_snapshot:share.content_snapshot,created_at:share.created_at,pdf_file_name:share.pdf_file_name,pdf_file_size:share.pdf_file_size,pdf_mime_type:share.pdf_mime_type,pdf_attached_at:share.pdf_attached_at}]:[];
    return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
   }
   if(target.pathname.includes('/storage/v1/object/sign/herin-pdfs/')){
    const id=target.pathname.split('/').at(-1).replace(/\.pdf$/,''),pdf=sharedPdfs.get(id);
    if(!pdf)return route.fulfill({status:404,body:'Not found'});
    return route.fulfill({status:200,headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${pdf.name}"`},body:pdf.bytes});
   }
   throw Error('Unexpected public request: '+request.method()+' '+request.url());
  });
  const visitor=await anon.newPage();const errors=[];visitor.on('pageerror',e=>errors.push(e.message));
  await visitor.goto(url);await visitor.getByText('Cloud notes survive refresh.',{exact:true}).waitFor();
  assert.equal(await visitor.getByRole('button',{name:'Download PDF'}).count(),0);
  assert.equal(await visitor.getByRole('button',{name:/edit|delete/i}).count(),0);
  fs.mkdirSync('test-results/share',{recursive:true});
  for(const width of [360,768,1440])for(const mode of ['light','dark']){
   await visitor.setViewportSize({width,height:900});await visitor.evaluate(m=>document.documentElement.dataset.mode=m,mode);
   assert.ok(await visitor.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await visitor.screenshot({path:`test-results/share/public-${width}-${mode}.png`,fullPage:true,animations:'disabled'});
  }
  await page.getByRole('button',{name:'Share',exact:true}).click();
  const pdfDialog=page.getByRole('dialog',{name:'Share study link'});
  const input=pdfDialog.getByLabel('Choose PDF to attach'),countBefore=uploadCount();
  await input.setInputFiles({name:'notes.txt',mimeType:'text/plain',buffer:Buffer.from('not a pdf')});
  await pdfDialog.getByText('Choose a PDF file.',{exact:true}).waitFor();assert.equal(uploadCount(),countBefore);
  await input.setInputFiles(path.join(__dirname,'fixtures/broken.pdf'));
  await pdfDialog.getByText('This file is not a readable PDF.',{exact:true}).waitFor();assert.equal(uploadCount(),countBefore);
  setUploadDelay(true);
  await input.setInputFiles(path.join(__dirname,'fixtures/Biology-course.pdf'));
  await pdfDialog.getByText('Uploading PDF').waitFor();
  await pdfDialog.getByRole('button',{name:'Cancel upload'}).click();
  await pdfDialog.getByRole('button',{name:'Attach PDF'}).waitFor();setUploadDelay(false);
  assert.equal(sharedPdfs.size,0);
  await input.setInputFiles(path.join(__dirname,'fixtures/Biology-course.pdf'));
  await pdfDialog.getByText('PDF attached',{exact:true}).waitFor();
  const firstUploadCount=uploadCount();
  await pdfDialog.getByRole('button',{name:'Replace',exact:true}).click();
  await input.setInputFiles(path.join(__dirname,'fixtures/Biology-course.pdf'));
  await pdfDialog.locator('.share-pdf-file strong').waitFor();assert.equal(await pdfDialog.locator('.share-pdf-file strong').textContent(),'Biology-course.pdf');assert.equal(uploadCount(),firstUploadCount);
  await pdfDialog.getByRole('button',{name:'Replace',exact:true}).click();
  await input.setInputFiles(path.join(__dirname,'fixtures/scan.pdf'));
  await pdfDialog.locator('.share-pdf-file strong').waitFor();for(let i=0;i<50&&await pdfDialog.locator('.share-pdf-file strong').textContent()!=='scan.pdf';i++)await new Promise(resolve=>setTimeout(resolve,100));assert.equal(await pdfDialog.locator('.share-pdf-file strong').textContent(),'scan.pdf');assert.equal(uploadCount(),firstUploadCount+1);
  assert.equal([...sharedPdfs.values()][0].name,'scan.pdf');
  await pdfDialog.getByRole('button',{name:'Remove attached PDF'}).click();
  await pdfDialog.getByRole('button',{name:'Attach PDF'}).waitFor();assert.equal(sharedPdfs.size,0);
  await input.setInputFiles(path.join(__dirname,'fixtures/scan.pdf'));
  await pdfDialog.getByText('PDF attached',{exact:true}).waitFor();
  const attached=await page.getByLabel('Public study link').count();assert.equal(attached,0);
  await pdfDialog.getByRole('button',{name:'Create & copy link'}).click();
  await pdfDialog.getByLabel('Public study link').waitFor();
  const pdfUrl=await pdfDialog.getByLabel('Public study link').inputValue(),pdfShare=tables.shared_study_links.find(s=>s.share_id===new URL(pdfUrl).hash.split('/').pop());
  assert.equal(pdfShare.pdf_file_name,'scan.pdf');assert.ok(pdfShare.pdf_file_size>0);assert.equal(pdfShare.pdf_mime_type,'application/pdf');
  await pdfDialog.getByRole('button',{name:'Close',exact:true}).click();

  await visitor.goto(pdfUrl);await visitor.getByText('Cloud notes survive refresh.',{exact:true}).waitFor();
  await visitor.getByText('scan.pdf',{exact:true}).waitFor();await visitor.getByText(/\d+ KB|\d+\.\d MB/).waitFor();
  expireNextDownload=true;await visitor.getByRole('button',{name:'Download PDF'}).click();
  await visitor.getByRole('alert').getByText('The PDF could not be downloaded. Please try again.').waitFor();
  const anonymousDownload=visitor.waitForEvent('download');
  await visitor.getByRole('button',{name:'Download PDF'}).click();
  assert.equal((await anonymousDownload).suggestedFilename(),'scan.pdf');
  await visitor.setViewportSize({width:360,height:800});assert.ok(await visitor.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));

  const ownerPage=await context.newPage();const ownerDownload=ownerPage.waitForEvent('download');
  await ownerPage.goto(pdfUrl);await ownerPage.getByRole('button',{name:'Download PDF'}).click();
  assert.equal((await ownerDownload).suggestedFilename(),'scan.pdf');await ownerPage.close();
  const pdfId=pdfShare.share_id;sharedPdfs.delete(pdfId);await visitor.reload();
  await visitor.getByText('This PDF is currently unavailable.',{exact:true}).waitFor();
  assert.equal(await visitor.getByRole('button',{name:'Download PDF'}).count(),0);
  sharedPdfs.set(pdfId,{name:'scan.pdf',size:pdfShare.pdf_file_size,bytes:fs.readFileSync(path.join(__dirname,'fixtures/scan.pdf'))});

  await page.getByRole('button',{name:'Share',exact:true}).click();
  const failedDialog=page.getByRole('dialog',{name:'Share study link'});setUploadFailure(true);
  await failedDialog.getByLabel('Choose PDF to attach').setInputFiles(path.join(__dirname,'fixtures/Biology-course.pdf'));
  await failedDialog.getByText('The PDF could not be uploaded. You can still share the note without the PDF.',{exact:true}).waitFor();
  await failedDialog.getByRole('button',{name:'Create & copy link'}).click();await failedDialog.getByLabel('Public study link').waitFor();setUploadFailure(false);
  const noPdfUrl=await failedDialog.getByLabel('Public study link').inputValue();assert.equal(tables.shared_study_links.find(s=>s.share_id===new URL(noPdfUrl).hash.split('/').pop()).pdf_file_name,null);
  await failedDialog.getByRole('button',{name:'Close',exact:true}).click();

  await page.getByRole('button',{name:'Edit note',exact:true}).click();await page.getByLabel('Your notes for this file').fill('Edited after sharing.');await saved();
  await visitor.goto(url);await visitor.getByText('Cloud notes survive refresh.',{exact:true}).waitFor();assert.equal(await visitor.getByText('Edited after sharing.',{exact:true}).count(),0);
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
  assert.ok(lookups>=7);assert.deepEqual(errors,[]);
  console.log('PASS share browser: legacy text-only link, upload/replace/remove/deduplicate/failure, anonymous + owner downloads, expired/missing files, share snapshots, revoke, and responsive layouts');
 }finally{await anon.close();}
};
