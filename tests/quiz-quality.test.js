import test from 'node:test';
import assert from 'node:assert/strict';
import {sameQuizFact,reviewQuiz,isCourseAdministration} from '../supabase/functions/generate-study-content/quizQuality.js';
import {validateOutput,generateSections} from '../supabase/functions/generate-study-content/core.js';
import {createHandler} from '../supabase/functions/generate-study-content/handler.js';
const fact='Pipelines provide continuous flow for specialized cargo such as oil, gas, and water.';
const second='Reconnaissance is the first phase of the route survey workflow.';
const section={text:`[Page 17]\n${fact}\n${second}`,pages:[17]};
const request={contentType:'quiz',quizType:'multiple',difficulty:'mixed',quantity:2};
const q={type:'multiple',question:'Which describes a key characteristic of pipeline transportation?',correct_answer:'Continuous flow for specialized cargo',explanation:fact,source_page:17,difficulty:'easy',choices:['Continuous flow for specialized cargo','Door to door flexibility','Passenger capacity','Air speed']};
const duplicate={...q,question:'Which describes the primary characteristic of pipeline transportation?',correct_answer:'Continuous flow and specialized cargo',choices:['Continuous flow and specialized cargo','Door to door flexibility','Passenger capacity','Air speed']};
const other={...q,question:'Which step comes first in the route survey workflow?',correct_answer:'Reconnaissance',explanation:second,choices:['Reconnaissance','Detailed survey','Construction','Operation']};
const response=value=>new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(value)}]}}]}));
const reviewFetch=decisions=>async()=>response({decisions});
const decision=(index,evidence=fact)=>({index,supported:true,duplicate_of:null,evidence});
test('course prerequisites, overviews, outcomes and policies are rejected even when source-supported',async()=>{
 const stems=[
  'What course serves as the direct prerequisite for CE331 Highway and Railroad Engineering?',
  'What are the course outcomes?',
  'What does the course overview describe?',
  'Which learning objective is listed for this module?',
  'What is the grading policy?',
  'How many credit units does this course have?',
 ];
 for(const question of stems){
  const item={...q,type:'identification',question,correct_answer:'CE221',explanation:'This detail is listed in the introduction.'};delete item.choices;
  assert.ok(isCourseAdministration(item));
  assert.deepEqual(validateOutput({quiz_questions:[item]},{...request,quizType:'identification'},section).quiz_questions,[]);
  assert.deepEqual(await reviewQuiz([item],[{text:'[Page 17]\nCE221 is the prerequisite course.',pages:[17]}],[],{key:'test',fetcher:reviewFetch([decision(0,'CE221 is the prerequisite course.')])}),[]);
 }
});
test('technical lesson prerequisites and engineering requirements are not course administration',()=>{
 for(const question of ['What is the prerequisite for laying the pavement surface?','What drainage requirements apply to railway ballast?','What determines the course of a river?']){
  assert.equal(isCourseAdministration({question,correct_answer:'Compaction',explanation:'The foundation must be compacted before paving.'}),false);
 }
 assert.equal(isCourseAdministration(q),false);
});
test('an overview-only PDF returns insufficient source rather than administrative questions',async()=>{
 const item={...q,question:'What course is the prerequisite for CE331?',correct_answer:'CE221',choices:['CE221','CE222','CE223','CE224']};
 await assert.rejects(generateSections([section],request,{key:'test',fetcher:async()=>response({quiz_questions:[item]})}),e=>e.code==='INSUFFICIENT_SOURCE');
});
test('normalization rejects identical questions and repeated choices despite punctuation and whitespace',()=>{
 assert.equal(validateOutput({quiz_questions:[q,{...q,question:' WHICH DESCRIBES A KEY CHARACTERISTIC OF PIPELINE TRANSPORTATION!!! '}]},request,section).quiz_questions.length,1);
 assert.equal(validateOutput({quiz_questions:[{...q,choices:['Oil',' OIL! ','Water','Gas'],correct_answer:'Oil'}]},request,section).quiz_questions.length,0);
});
test('pipeline paraphrases test the same fact, including across question types',async()=>{
 assert.ok(sameQuizFact(q,duplicate));
 const cross={...duplicate,type:'identification'};delete cross.choices;
 const result=await reviewQuiz([q,cross],[section],[],{key:'test',fetcher:reviewFetch([decision(0),decision(1)])});
 assert.deepEqual(result,[q]);
});
test('similar wording with genuinely different facts remains',()=>{
 assert.equal(sameQuizFact({...q,question:'What is the speed of road transport?',correct_answer:'60 km/h',explanation:'Road speed is 60 km/h.'},{...q,question:'What is the speed of rail transport?',correct_answer:'100 km/h',explanation:'Rail speed is 100 km/h.'}),false);
 assert.equal(sameQuizFact({...q,question:'What carries commuters?',correct_answer:'Rail',explanation:'Rail carries commuters.'},{...q,question:'What uses steel tracks?',correct_answer:'Rail',explanation:'Rail vehicles use steel tracks.'}),false);
});
test('semantic review excludes distant paraphrases and prior questions',async()=>{
 const far={...q,question:'Which mode can move petroleum without intermittent vehicle departures?'};
 const result=await reviewQuiz([far],[section],[q],{key:'test',fetcher:reviewFetch([{...decision(0),duplicate_of:-1}])});
 assert.deepEqual(result,[]);
});
test('unsupported answers, invented evidence, and evidence from the wrong page are excluded',async()=>{
 for(const d of [{...decision(0),supported:false},decision(0,'Pipelines transport passengers.'),decision(0,second)]){
  const pages=[{text:`[Page 17]\n${fact}\n[Page 18]\n${second}`,pages:[17,18]}];
  assert.deepEqual(await reviewQuiz([q],pages,[],{key:'test',fetcher:reviewFetch([d])}),[]);
 }
});
test('duplicates are refilled with unused facts, with page references preserved',async()=>{
 let generations=0,reviews=0;
 const result=await generateSections([section],request,{key:'test',fetcher:async(_url,options)=>{
  const payload=JSON.parse(options.body);
  if(payload.generationConfig.responseJsonSchema.properties.decisions){reviews++;const data=JSON.parse(payload.contents[0].parts[0].text);return response({decisions:data.candidates.map((item,i)=>decision(i,item.correct_answer==='Reconnaissance'?second:fact))});}
  generations++;return response({quiz_questions:generations===1?[q,duplicate]:[other]});
 }});
 assert.deepEqual(result.quiz_questions.map(item=>item.correct_answer),[q.correct_answer,other.correct_answer]);
 assert.ok(result.quiz_questions.every(item=>item.source_page===17));assert.equal(generations,2);assert.equal(reviews,2);
});
test('too little source content returns fewer unique questions after one bounded refill',async()=>{
 let generations=0;
 const result=await generateSections([section],request,{key:'test',fetcher:async(_url,options)=>{
  const payload=JSON.parse(options.body);
  if(payload.generationConfig.responseJsonSchema.properties.decisions){const data=JSON.parse(payload.contents[0].parts[0].text);return response({decisions:data.candidates.map((_,i)=>decision(i))});}
  generations++;return response({quiz_questions:[q,duplicate]});
 }});
 assert.equal(result.quiz_questions.length,1);assert.equal(generations,2);
});
test('malformed semantic review fails closed rather than saving an unchecked quiz',async()=>{
 await assert.rejects(generateSections([section],request,{key:'test',fetcher:async(_url,options)=>response(JSON.parse(options.body).generationConfig.responseJsonSchema.properties.decisions?{decisions:[]}:{quiz_questions:[q]})}),e=>e.code==='QUIZ_REVIEW_FAILED');
});
test('handler reads prior quizzes scoped to the authenticated owner, selected PDF and topic',async()=>{
 const id='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';let received;const filters=[];
 const client={auth:{getUser:async()=>({data:{user:{id}}})},from(table){
  const query={select(){return query;},eq(key,value){if(table==='quizzes')filters.push([key,value]);return query;},order(){return query;},limit:async()=>({data:[{questions:[{question:q.question,correctAnswer:q.correct_answer,explanation:fact,sourcePage:17}]}]}),maybeSingle:async()=>({data:table==='pdfs'?{id,extracted_text:{pages:[{pageNum:17,text:fact}]}}:{id,start_page:17,end_page:17}})};return query;
 },rpc:async(name)=>({data:name==='claim_study_generation'?{completed:false}:{quiz:{questions:[]}}})};
 const handler=createHandler({createClient:()=>client,env:()=>'',generate:async(_sections,_request,options)=>{received=options;return {quiz_questions:[],flashcards:[],summaries:[]};}});
 const result=await handler(new Request('https://test.invalid',{method:'POST',headers:{Authorization:'Bearer test'},body:JSON.stringify({...request,pdfId:id,requestId:id,topicId:id})}));
 assert.equal(result.status,200);assert.deepEqual(filters,[['pdf_id',id],['user_id',id],['topic_id',id]]);assert.equal(received.priorQuestions[0].correct_answer,q.correct_answer);
});
for(const type of ['multiple','identification','enumeration','application']){
 test(`individual ${type} generation keeps verified questions if optional refill fails`,async()=>{
  const item={...q,type};
  if(type!=='multiple')delete item.choices;
  if(type==='enumeration'){item.expected_items=['Oil','Gas'];item.correct_answer='Oil; Gas';}
  let generations=0;
  const result=await generateSections([section],{...request,quizType:type},{key:'test',fetcher:async(_url,options)=>{
   const payload=JSON.parse(options.body);
   if(payload.generationConfig.responseJsonSchema.properties.decisions)return response({decisions:[decision(0)]});
   assert.deepEqual(payload.generationConfig.responseJsonSchema.properties.quiz_questions.items.properties.type.enum,[type]);
   if(++generations>1)return new Response('',{status:429});
   return response({quiz_questions:[item]});
  }});
  assert.equal(result.quiz_questions.length,1);assert.equal(result.quiz_questions[0].type,type);
 });
}
test('partial review and JSON fences preserve only explicitly verified questions',async()=>{
 const fetcher=async()=>new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:'```json\n'+JSON.stringify({decisions:[decision(0),{index:1,supported:'invalid'}]})+'\n```'}]}}]}));
 assert.deepEqual(await reviewQuiz([q,other],[section],[],{key:'test',fetcher}),[q]);
});
test('a failed refill review keeps the verified quiz but excludes unreviewed replacements',async()=>{
 let reviews=0;
 const result=await generateSections([section],request,{key:'test',fetcher:async(_url,options)=>{
  const payload=JSON.parse(options.body);
  if(payload.generationConfig.responseJsonSchema.properties.decisions)return ++reviews===1?response({decisions:[decision(0)]}):response({decisions:[]});
  return response({quiz_questions:reviews?[other]:[q]});
 }});
 assert.deepEqual(result.quiz_questions,[q]);
});
