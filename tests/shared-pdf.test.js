import test from 'node:test';
import assert from 'node:assert/strict';
import {MAX_SHARED_PDF_SIZE,requestSharedPdf,validateSharedPdf} from '../src/utils/sharedPdf.js';

function fakePdf({name='lesson.pdf',type='application/pdf',size,header='%PDF-1.7\n%%EOF'}={}) {
 const data=new Blob([header]);
 return {name,type,size:size??data.size,slice:(start,end)=>data.slice(start,end)};
}

test('shared PDF validation requires a PDF filename, MIME type, signature, and allowed size',async()=>{
 assert.equal(await validateSharedPdf(fakePdf()),'');
 assert.match(await validateSharedPdf(fakePdf({name:'lesson.txt'})),/Choose a PDF/);
 assert.match(await validateSharedPdf(fakePdf({type:'text/plain'})),/Choose a PDF/);
 assert.match(await validateSharedPdf(fakePdf({size:MAX_SHARED_PDF_SIZE+1})),/25 MB or smaller/);
 assert.match(await validateSharedPdf(fakePdf({header:'not a PDF'})),/readable PDF/);
 assert.match(await validateSharedPdf(fakePdf({header:'%PDF-1.7'})),/readable PDF/);
 assert.match(await validateSharedPdf(fakePdf({size:0})),/empty/);
});

test('PDF requests only send authentication for owner actions and never include a storage path',async()=>{
 const original=globalThis.fetch,requests=[];
 globalThis.fetch=async(url,options)=>{
  requests.push({url,options});
  return new Response(JSON.stringify({available:true}),{status:200,headers:{'Content-Type':'application/json'}});
 };
 const client={supabaseUrl:'https://herin.example',supabaseKey:'public-key',auth:{getSession:async()=>({data:{session:{access_token:'owner-token'}},error:null})}};
 try{
  await requestSharedPdf(client,'check',{shareId:'b103ac16-0000-4000-8000-000000000020'});
  await requestSharedPdf(client,'remove',{shareId:'b103ac16-0000-4000-8000-000000000020'});
  assert.equal(requests[0].options.headers.Authorization,undefined);
  assert.equal(requests[1].options.headers.Authorization,'Bearer owner-token');
  assert.ok(requests.every(({url,options})=>url.endsWith('/functions/v1/shared-pdf')&&!JSON.stringify(options).includes('/shared/')));
 }finally{globalThis.fetch=original;}
});
