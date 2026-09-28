import test from 'node:test';
import assert from 'node:assert/strict';
import {readStudyResponse} from '../src/utils/aiResponse.js';
test('nested provider errors show HTTP status without displaying upstream secrets or text',async()=>{
 const response=new Response(JSON.stringify({success:false,error:{code:'PROVIDER_UNAVAILABLE',providerStatus:503,message:'private secret and PDF text'}}),{status:502});
 await assert.rejects(readStudyResponse({error:{context:response}}),e=>e.message.includes('HTTP 503')&&!e.message.includes('private'));
});
test('HTTP 200 error envelopes, legacy errors, missing backend, and network failures remain failures',async()=>{
 for(const [value,code] of [
  [{data:{success:false,error:{code:'MISSING_API_KEY'}}},'MISSING_API_KEY'],
  [{error:{context:new Response(JSON.stringify({code:'QUOTA'}),{status:429})}},'QUOTA'],
  [{error:{context:new Response('Not Found',{status:404})}},'FUNCTION_NOT_DEPLOYED'],
  [{error:{name:'FunctionsFetchError'}},'NETWORK_ERROR']
 ])await assert.rejects(readStudyResponse(value),e=>e.code===code);
});
test('only confirmed saves become a completed generation',async()=>{
 const valid={success:true,saved:true,flashcardCount:3,quizCount:3};assert.equal(await readStudyResponse({data:valid}),valid);
 for(const data of [null,{}, {success:true,saved:false,flashcardCount:3,quizCount:0}])await assert.rejects(readStudyResponse({data}),/INVALID_BACKEND_RESPONSE/);
});
