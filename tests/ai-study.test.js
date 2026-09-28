import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRequest,sectionsFrom,validateOutput,callGemini,generateSections,StudyError} from '../supabase/functions/generate-study-content/core.js';
import {createHandler} from '../supabase/functions/generate-study-content/handler.js';
const id='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',requestId='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const base={pdfId:id,requestId,contentType:'both',quantity:10,difficulty:'mixed'};
const section={text:'[Page 1] Photosynthesis uses light.',pages:[1]};
const card={question:'What does photosynthesis use?',answer:'Light',difficulty:'easy',source_page:1};
const quiz={question:'What is used?',choices:['Light','Sand','Metal','Stone'],correct_answer:'Light',explanation:'The source says it uses light.',difficulty:'easy',source_page:1};
const output={flashcards:[card],quiz_questions:[quiz]};
const response=data=>new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(data)}]}}]}));
test('AI request rejects empty, invalid identifiers, quantity and difficulty; defaults are safe',()=>{
  for(const b of [null,{}, {...base,pdfId:'pdf_legacy'},{...base,quantity:0},{...base,quantity:31},{...base,difficulty:'expert'},{...base,topicId:'other'}])assert.throws(()=>validateRequest(b),StudyError);
  assert.deepEqual(validateRequest({pdfId:id,requestId}),{...base,classId:null,topicId:null});
});
test('large PDF chunks preserve every page, topic range and last text; scans fail before AI',()=>{
  const pages=Array.from({length:80},(_,i)=>({pageNum:i+1,text:`Content ${i+1} `.repeat(200)}));
  const sections=sectionsFrom({pages});assert.ok(sections.length>1);assert.ok(sections.at(-1).text.includes('Content 80'));
  assert.deepEqual(sectionsFrom({pages},{start_page:4,end_page:5}).flatMap(s=>s.pages),[4,5]);
  assert.throws(()=>sectionsFrom({pages:[{pageNum:1,text:''}]}),e=>e.code==='EMPTY_PDF');
  assert.throws(()=>sectionsFrom({pages:[{pageNum:1,text:'a'.repeat(240001)}]}),e=>e.code==='PDF_TOO_LARGE');
});
for(const difficulty of ['easy','medium','hard','mixed'])for(const contentType of ['flashcards','quiz','both','summary'])test(`AI validates ${contentType} / ${difficulty}`,async()=>{
  const value={flashcards:[{...card,difficulty:difficulty==='mixed'?'easy':difficulty}],quiz_questions:[{...quiz,difficulty:difficulty==='mixed'?'medium':difficulty}],summary:'Plants use light.'};
  const result=await callGemini(section,{...base,difficulty,contentType},{key:'test-only-placeholder',fetcher:async(url,options)=>{assert.ok(url.startsWith('https://generativelanguage.googleapis.com/'));assert.equal(JSON.parse(options.body).generationConfig.responseMimeType,'application/json');assert.equal(options.headers['x-goog-api-key'],'test-only-placeholder');return response(value);}});
  assert.ok(result.flashcards.length||result.quiz_questions.length||result.summaries.length);
});
test('invalid answers, difficulty, page, blank output and duplicate choices are rejected',()=>{
  for(const value of [{...output,quiz_questions:[{...quiz,choices:['A','A','B','C']}]},{...output,quiz_questions:[{...quiz,correct_answer:'missing'}]},{...output,flashcards:[{...card,source_page:99}]},{...output,flashcards:[]},{...output,flashcards:[{...card,answer:'\u0000'}]}])assert.throws(()=>validateOutput(value,base,section),StudyError);
  assert.throws(()=>validateOutput(output,{...base,difficulty:'hard'},section),StudyError);
  assert.equal(validateOutput({...output,flashcards:[card,card]},base,section).flashcards.length,1);
});
test('provider errors are safe, quota is not retried, transient retry is bounded',async()=>{
  for(const [status,code] of [[429,'QUOTA'],[403,'PROVIDER_CONFIGURATION'],[400,'PROVIDER_CONFIGURATION'],[404,'MODEL_UNAVAILABLE']]){
    let calls=0;await assert.rejects(callGemini(section,base,{key:'private-test',fetcher:async()=>{calls++;return new Response('private source text',{status});}}),e=>e.code===code&&!e.message.includes('private'));assert.equal(calls,1);
  }
  let calls=0;const delays=[];await assert.rejects(callGemini(section,base,{key:'test',sleep:async ms=>delays.push(ms),fetcher:async()=>{calls++;return new Response('',{status:503});}}),e=>e.code==='PROVIDER_UNAVAILABLE'&&e.providerStatus===503);assert.equal(calls,3);assert.deepEqual(delays,[1000,2000]);
  await assert.rejects(callGemini(section,base,{key:'test',fetcher:async()=>{throw Error('key must stay hidden');}}),e=>e.code==='TIMEOUT');
  await assert.rejects(callGemini(section,base,{key:'test',fetcher:async()=>new Response('{broken')}),e=>e.code==='INVALID_RESPONSE');
  await assert.rejects(callGemini(section,base,{key:''}),e=>e.code==='MISSING_API_KEY');
});
test('Gemini JSON fences are removed but malformed or empty output is still rejected',async()=>{
  const make=text=>new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text}]}}]}));
  const result=await callGemini(section,base,{key:'test',fetcher:async()=>make('```json\n'+JSON.stringify(output)+'\n```')});assert.equal(result.flashcards.length,1);
  for(const text of ['```json\n{bad}\n```','```json\n{}\n```',''])await assert.rejects(callGemini(section,base,{key:'test',fetcher:async()=>make(text)}),e=>e.code==='INVALID_RESPONSE');
});
test('a temporary Google 503 can recover within the bounded retry budget',async()=>{
  let calls=0;
  const result=await callGemini(section,base,{key:'test',sleep:async()=>{},fetcher:async()=>++calls===1?new Response('',{status:503}):response(output)});
  assert.equal(calls,2);assert.equal(result.quiz_questions.length,1);
});
test('multiple chunks deduplicate cards and quiz questions before saving',async()=>{
  const result=await generateSections([section,section],base,{key:'test',fetcher:async()=>response(output)});
  assert.equal(result.flashcards.length,1);assert.equal(result.quiz_questions.length,1);
});
function fixture({authenticated=true,owns=true,dbFailure=false,completed=false,topicOwns=true,classOwns=true}={}){
  let generated=0,saved=0;
  const client={auth:{getUser:async()=>({data:{user:authenticated?{id}:null}})},from(table){const q={select(){return q;},eq(){return q;},update(){return q;},maybeSingle:async()=>({data:table==='pdfs'?(owns?{id,extracted_text:{pages:[{pageNum:1,text:'Plants use light.'}]}}:null):table==='classes'?(classOwns?{id}:null):(topicOwns?{id,start_page:1,end_page:1}:null)})};return q;},rpc:async name=>{
    if(name==='claim_study_generation')return {data:{completed,result:{flashcardCount:1,quizCount:1}}};saved++;return dbFailure?{error:{message:'private postgres internals'}}:{data:{flashcardCount:1,quizCount:1}};
  }};
  const handler=createHandler({createClient:()=>client,env:()=>'',generate:async()=>{generated++;return output;}});
  const invoke=async(body=base,auth=true)=>handler(new Request('https://example.test',{method:'POST',headers:auth?{Authorization:'Bearer test'}:{},body:JSON.stringify(body)}));
  return {invoke,counts:()=>({generated,saved})};
}
test('handler rejects unauthenticated requests and cross-owner PDF/class/topic before Gemini',async()=>{
  let f=fixture();assert.equal((await f.invoke(base,false)).status,401);assert.equal(f.counts().generated,0);
  for(const options of [{authenticated:false},{owns:false},{topicOwns:false},{classOwns:false}]){f=fixture(options);assert.ok((await f.invoke({...base,topicId:id,classId:id})).status>=400);assert.equal(f.counts().generated,0);}
});
test('handler surfaces safe DB failure and reuses completed request without AI or another save',async()=>{
  const f=fixture({dbFailure:true}),r=await f.invoke();assert.equal(r.status,503);const failure=await r.json();assert.equal(failure.success,false);assert.equal(failure.error.code,'DATABASE_ERROR');assert.ok(!JSON.stringify(failure).includes('private postgres'));
  const repeat=fixture({completed:true}),ok=await repeat.invoke();assert.equal(ok.status,200);const saved=await ok.json();assert.equal(saved.success,true);assert.equal(saved.saved,true);assert.ok(Array.isArray(saved.flashcards));assert.ok(Array.isArray(saved.quiz_questions));assert.deepEqual(repeat.counts(),{generated:0,saved:0});
});
