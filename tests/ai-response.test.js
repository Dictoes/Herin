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
test('quiz responses preserve and validate selected question formats',async()=>{
 const question=(type,extra={})=>({type,question:`Question for ${type}?`,correct_answer:type==='enumeration'?'Light; Water':'Answer',explanation:'Supported by the selected source.',...extra});
 const questions=[
  question('multiple',{choices:['Answer','Other A','Other B','Other C']}),
  question('identification'),
  question('enumeration',{expected_items:['Light','Water']}),
  question('application')
 ];
 const payload=quiz_questions=>({success:true,saved:true,flashcardCount:0,quizCount:quiz_questions.length,quiz_questions});
 assert.equal((await readStudyResponse({data:payload(questions)},{contentType:'quiz',quizType:'all',quantity:5})).quizCount,4);
 assert.equal((await readStudyResponse({data:{...payload([]),flashcardCount:1}},{contentType:'both',quizType:'all',quantity:5})).quizCount,0);
 for(const [quizType,index] of [['multiple',0],['identification',1],['enumeration',2],['application',3]])assert.equal((await readStudyResponse({data:payload([questions[index]])},{contentType:'quiz',quizType,quantity:1})).quizCount,1);
 await assert.rejects(readStudyResponse({data:payload([{type:'true-false',question:'True or false?',choices:['True','False'],correct_answer:'True',explanation:'The source says so.'}])},{contentType:'quiz',quizType:'all',quantity:1}),/INVALID_BACKEND_RESPONSE/);
 await assert.rejects(readStudyResponse({data:payload([questions[1]])},{contentType:'quiz',quizType:'multiple',quantity:1}),/INVALID_BACKEND_RESPONSE/);
 await assert.rejects(readStudyResponse({data:payload([question('enumeration',{correct_answer:'Light; Air',expected_items:['Light','Water']})])},{contentType:'quiz',quizType:'enumeration',quantity:1}),/INVALID_BACKEND_RESPONSE/);
 await assert.rejects(readStudyResponse({data:payload([questions[0],questions[0]])},{contentType:'quiz',quizType:'multiple',quantity:2}),/INVALID_BACKEND_RESPONSE/);
});
