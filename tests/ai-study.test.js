import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateRequest,validateAskRequest,sectionsFrom,responseSchema,validateOutput,callGemini,answerQuestion,generateSections,StudyError} from '../supabase/functions/generate-study-content/core.js';
import {createHandler} from '../supabase/functions/generate-study-content/handler.js';
import {YUKI_ROWS} from '../src/utils/yukiStates.js';
const id='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',requestId='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const base={pdfId:id,requestId,contentType:'both',quantity:10,difficulty:'mixed'};
const section={text:'[Page 1] Photosynthesis uses light.',pages:[1]};
const card={question:'What does photosynthesis use?',answer:'Light',difficulty:'easy',source_page:1};
const quiz={type:'multiple',question:'What is used?',choices:['Light','Sand','Metal','Stone'],correct_answer:'Light',explanation:'The source says it uses light.',difficulty:'easy',source_page:1};
const typedQuestions=[
  quiz,
  {type:'identification',question:'What provides the energy?',correct_answer:'Light',explanation:'The source says photosynthesis uses light.',difficulty:'easy',source_page:1},
  {type:'enumeration',question:'What two things does the process use?',expected_items:['Light','Water'],correct_answer:'Light; Water',explanation:'Both items appear in the source.',difficulty:'easy',source_page:1},
  {type:'application',question:'What energy source should be available for photosynthesis?',correct_answer:'Light',explanation:'The source identifies light as the energy source.',difficulty:'easy',source_page:1}
];
const output={flashcards:[card],quiz_questions:[quiz]};
const response=data=>new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(data)}]}}]}));
test('Yuki states map to the supplied six atlas rows',()=>{
  const sprite=readFileSync(new URL('../public/yuki-study-helper.png',import.meta.url));
  assert.equal(sprite.readUInt32BE(16),1024);
  assert.equal(sprite.readUInt32BE(20),1536);
  assert.equal(sprite.readUInt32BE(16)/4,sprite.readUInt32BE(20)/6);
  assert.deepEqual(YUKI_ROWS,{idle:0,welcome:1,notes:2,thinking:3,explaining:3,quizWrong:4,quizCorrect:5});
});
test('Ask requests are bounded, normalized, and retain only valid source metadata',()=>{
  const body={action:'ask',question:'  Explain photosynthesis  ',history:[{role:'user',text:'What does the source say?'}],context:[{kind:'pdf',title:'Biology',text:'Plants use light.',page:2}]};
  assert.deepEqual(validateAskRequest(body),{question:'Explain photosynthesis',history:[{role:'user',text:'What does the source say?'}],context:[{kind:'pdf',title:'Biology',text:'Plants use light.',page:2}]});
  for(const invalid of [{...body,question:''},{...body,history:Array(9).fill(body.history[0])},{...body,context:[{...body.context[0],page:0}]},{...body,context:[{...body.context[0],kind:'url'}]}])assert.throws(()=>validateAskRequest(invalid),StudyError);
  assert.throws(()=>validateAskRequest({...body,context:Array(4).fill({kind:'note',title:'Note',text:'x'.repeat(6000)})}),StudyError);
});
test('Ask sends supplied context only to Gemini and constrains source pages',async()=>{
  const request=validateAskRequest({action:'ask',question:'What is photosynthesis?',history:[],context:[{kind:'pdf',title:'Biology',text:'Plants use light.',page:2}]});
  let payload;
  const result=await answerQuestion(request,{key:'server-test-key',fetcher:async(_url,options)=>{
    payload=JSON.parse(options.body);
    assert.equal(options.headers['x-goog-api-key'],'server-test-key');
    assert.match(payload.systemInstruction.parts[0].text,/Plants use light/);
    assert.match(payload.systemInstruction.parts[0].text,/Illustrative example \(not from the PDF\)/);
    assert.match(payload.systemInstruction.parts[0].text,/specific page/);
    assert.match(payload.systemInstruction.parts[0].text,/ask which snippet or page/);
    assert.doesNotMatch(payload.systemInstruction.parts[0].text,/private omitted material/);
    assert.deepEqual(payload.generationConfig.responseJsonSchema.properties.source_pages.items.enum,[2]);
    return response({answer:'The source says plants use light.',source_pages:[2]});
  }});
  assert.deepEqual(result,{answer:'The source says plants use light.',sourcePages:[2]});
  await assert.rejects(answerQuestion(request,{key:'test',fetcher:async()=>response({answer:'Unverified.',source_pages:[99]})}),e=>e.code==='INVALID_RESPONSE');
  await assert.rejects(answerQuestion(request,{key:'',fetcher:async()=>{throw Error('should not run');}}),e=>e.code==='MISSING_API_KEY');
  assert.equal(payload.contents.at(-1).parts[0].text,request.question);
});
test('AI request rejects empty, invalid identifiers, quantity and difficulty; defaults are safe',()=>{
  for(const b of [null,{}, {...base,pdfId:'pdf_legacy'},{...base,quantity:0},{...base,quantity:31},{...base,difficulty:'expert'},{...base,topicId:'other'}])assert.throws(()=>validateRequest(b),StudyError);
  assert.deepEqual(validateRequest({pdfId:id,requestId}),{...base,classId:null,topicId:null});
  assert.throws(()=>validateRequest({...base,quizType:'unsupported'}),StudyError);
  assert.throws(()=>validateRequest({...base,quizType:'true-false'}),StudyError);
  assert.equal(validateRequest({...base,quizType:'all'}).quizType,'all');
});
test('large PDF chunks preserve every page, topic range and last text; scans fail before AI',()=>{
  const pages=Array.from({length:80},(_,i)=>({pageNum:i+1,text:`Content ${i+1} `.repeat(200)}));
  const sections=sectionsFrom({pages});assert.ok(sections.length>1);assert.ok(sections.at(-1).text.includes('Content 80'));
  assert.deepEqual(sectionsFrom({pages},{start_page:4,end_page:5}).flatMap(s=>s.pages),[4,5]);
  assert.throws(()=>sectionsFrom({pages:[{pageNum:1,text:''}]}),e=>e.code==='EMPTY_PDF');
  assert.throws(()=>sectionsFrom({pages:[{pageNum:1,text:'a'.repeat(240001)}]}),e=>e.code==='PDF_TOO_LARGE');
});
for(const difficulty of ['easy','medium','hard','mixed'])for(const contentType of ['flashcards','quiz','both','summary'])test(`AI validates ${contentType} / ${difficulty}`,async()=>{
  const value=contentType==='flashcards'?{flashcards:[{...card,difficulty:difficulty==='mixed'?'easy':difficulty}]}:contentType==='quiz'?{quiz_questions:[{...quiz,difficulty:difficulty==='mixed'?'medium':difficulty}]}:contentType==='both'?{flashcards:[{...card,difficulty:difficulty==='mixed'?'easy':difficulty}],quiz_questions:[{...quiz,difficulty:difficulty==='mixed'?'medium':difficulty}]}:{summary:'Plants use light.'};
  const result=await callGemini(section,{...base,difficulty,contentType},{key:'test-only-placeholder',fetcher:async(url,options)=>{assert.ok(url.startsWith('https://generativelanguage.googleapis.com/'));assert.equal(JSON.parse(options.body).generationConfig.responseMimeType,'application/json');assert.equal(options.headers['x-goog-api-key'],'test-only-placeholder');return response(value);}});
  assert.ok(result.flashcards.length||result.quiz_questions.length||result.summaries.length);
});
test('invalid flashcards and difficulty fail safely; malformed quiz questions are discarded',()=>{
  for(const value of [{...output,flashcards:[{...card,source_page:99}]},{...output,flashcards:[]},{...output,flashcards:[{...card,answer:'\u0000'}]}])assert.throws(()=>validateOutput(value,base,section),StudyError);
  for(const question of [{...quiz,choices:['A','A','B','C']},{...quiz,correct_answer:'missing'}])assert.deepEqual(validateOutput({quiz_questions:[question]},{...base,contentType:'quiz'},section).quiz_questions,[]);
  assert.throws(()=>validateOutput(output,{...base,difficulty:'hard'},section),StudyError);
  assert.equal(validateOutput({...output,flashcards:[card,card]},base,section).flashcards.length,1);
});
test('valid questions survive malformed and duplicate model output without saving bad items',()=>{
  const malformed={...typedQuestions[0],choices:['Light','Light','Sand','Stone']};
  const result=validateOutput({quiz_questions:[malformed,typedQuestions[1],typedQuestions[1]]},{...base,contentType:'quiz',quizType:'all'},section);
  assert.deepEqual(result.quiz_questions.map(item=>item.type),['identification']);
});
test('a quiz with no valid questions reports insufficient source instead of saving an empty quiz',async()=>{
  const request={...base,contentType:'quiz'};
  await assert.rejects(generateSections([section],request,{key:'test',reviewQuiz:async items=>items,fetcher:async()=>response({quiz_questions:[{...quiz,choices:['A','A','B','C']}]})}),e=>e.code==='INSUFFICIENT_SOURCE');
});
test('supported quiz types preserve their UI formats and specific requests discard other types',()=>{
  const all={...base,contentType:'quiz',quizType:'all'};
  assert.deepEqual(responseSchema('quiz','all').properties.quiz_questions.items.properties.type.enum,['multiple','identification','enumeration','application']);
  const choicesSchema=responseSchema('quiz','all').properties.quiz_questions.items.properties.choices;
  assert.equal(choicesSchema.type,'array');
  assert.equal(choicesSchema.minItems,undefined);
  assert.equal(choicesSchema.maxItems,undefined);
  assert.deepEqual(validateOutput({quiz_questions:typedQuestions},all,section).quiz_questions.map(q=>q.type),['multiple','identification','enumeration','application']);
  assert.deepEqual(validateOutput({quiz_questions:[typedQuestions[2]]},{...all,quizType:'enumeration'},section).quiz_questions[0].expected_items,['Light','Water']);
  for(const [type,index] of [['multiple',0],['identification',1],['enumeration',2],['application',3]]) {
    assert.equal(validateOutput({quiz_questions:[typedQuestions[index]]},{...all,quizType:type},section).quiz_questions[0].type,type);
  }
  assert.deepEqual(validateOutput({quiz_questions:[{type:'true-false',question:'Photosynthesis uses light.',choices:['True','False'],correct_answer:'True',explanation:'The source says so.',difficulty:'easy',source_page:1}]},all,section).quiz_questions,[]);
  assert.deepEqual(validateOutput({quiz_questions:[typedQuestions[1]]},{...all,quizType:'multiple'},section).quiz_questions,[]);
  assert.deepEqual(validateOutput({quiz_questions:[{...typedQuestions[2],expected_items:undefined}]},{...all,quizType:'enumeration'},section).quiz_questions,[]);
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
test('multiple chunks deduplicate flashcards and quiz questions',async()=>{
  const result=await generateSections([section,section],{...base,contentType:'flashcards'},{key:'test',reviewQuiz:async items=>items,fetcher:async()=>response({flashcards:[card]})});
  assert.equal(result.flashcards.length,1);
  const quizResult=await generateSections([section,section],{...base,contentType:'quiz'},{key:'test',reviewQuiz:async items=>items,fetcher:async()=>response({quiz_questions:[quiz]})});
  assert.equal(quizResult.quiz_questions.length,1);
});
test('all mode mixes supported types and empty supported quiz output reports insufficient source',async()=>{
  const result=await generateSections([section],{...base,contentType:'quiz',quizType:'all',quantity:5},{key:'test',reviewQuiz:async items=>items,fetcher:async()=>response({quiz_questions:typedQuestions})});
  assert.deepEqual(result.quiz_questions.map(q=>q.type),['multiple','identification','enumeration','application']);
  await assert.rejects(generateSections([section],{...base,contentType:'quiz',quizType:'identification'},{key:'test',reviewQuiz:async items=>items,fetcher:async()=>response({quiz_questions:[]})}),e=>e.code==='INSUFFICIENT_SOURCE');
  const both=await generateSections([section],{...base,contentType:'both',quizType:'all'},{key:'test',reviewQuiz:async items=>items,fetcher:async(_url,options)=>response(JSON.parse(options.body).generationConfig.responseJsonSchema.properties.flashcards?{flashcards:[card],quiz_questions:[]}:{quiz_questions:[]})});
  assert.equal(both.flashcards.length,1);assert.equal(both.quiz_questions.length,0);
});
test('all mode requests and saves up to ten questions of each supported type',async()=>{
  const types=['multiple','identification','enumeration','application'];
  const questions=types.flatMap((type,index)=>Array.from({length:10},(_,i)=>({...typedQuestions[index],question:`${typedQuestions[index].question} Item ${i+1}?`})));
  const result=await generateSections([section],{...base,contentType:'quiz',quizType:'all',quantity:10},{key:'test',reviewQuiz:async items=>items,fetcher:async(_url,options)=>{
    const prompt=JSON.parse(options.body).contents[0].parts[0].text;
    assert.match(prompt,/Requested number of quiz questions per type when all types are selected, otherwise total: 10/);
    return response({quiz_questions:questions});
  }});
  assert.equal(result.quiz_questions.length,40);
  assert.deepEqual(Object.fromEntries(types.map(type=>[type,result.quiz_questions.filter(q=>q.type===type).length])),Object.fromEntries(types.map(type=>[type,10])));
});
function fixture({authenticated=true,owns=true,dbFailure=false,completed=false,topicOwns=true,classOwns=true}={}){
  let generated=0,saved=0;
  const client={auth:{getUser:async()=>({data:{user:authenticated?{id}:null}})},from(table){const q={select(){return q;},eq(){return q;},order(){return q;},limit:async()=>({data:[]}),update(){return q;},maybeSingle:async()=>({data:table==='pdfs'?(owns?{id,extracted_text:{pages:[{pageNum:1,text:'Plants use light.'}]}}:null):table==='classes'?(classOwns?{id}:null):(topicOwns?{id,start_page:1,end_page:1}:null)})};return q;},rpc:async name=>{
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
test('authenticated Ask action uses the existing server Gemini configuration without returning secrets',async()=>{
  let received;
  const client={auth:{getUser:async()=>({data:{user:{id}}})}};
  const handler=createHandler({
    createClient:()=>client,
    env:key=>({GEMINI_API_KEY:'server-only-key',GEMINI_MODEL:'existing-model'})[key],
    answer:async(input,options)=>{received={input,options};return {answer:'The supplied text explains the topic.',sourcePages:[2]};},
  });
  const result=await handler(new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer signed-in-token'},body:JSON.stringify({
    action:'ask',question:'Explain this',history:[],context:[{kind:'pdf',title:'Biology',text:'Plants use light.',page:2}],
  })}));
  assert.equal(result.status,200);
  assert.deepEqual(await result.json(),{success:true,answer:'The supplied text explains the topic.',sourcePages:[2]});
  assert.deepEqual(received.options,{key:'server-only-key',model:'existing-model'});
  assert.equal(received.input.context[0].page,2);
});
test('handler surfaces safe DB failure and reuses completed request without AI or another save',async()=>{
  const f=fixture({dbFailure:true}),r=await f.invoke();assert.equal(r.status,503);const failure=await r.json();assert.equal(failure.success,false);assert.equal(failure.error.code,'DATABASE_ERROR');assert.ok(!JSON.stringify(failure).includes('private postgres'));
  const repeat=fixture({completed:true}),ok=await repeat.invoke();assert.equal(ok.status,200);const saved=await ok.json();assert.equal(saved.success,true);assert.equal(saved.saved,true);assert.ok(Array.isArray(saved.flashcards));assert.ok(Array.isArray(saved.quiz_questions));assert.deepEqual(repeat.counts(),{generated:0,saved:0});
});
