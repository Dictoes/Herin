import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAskRequest, ASK_REQUEST_BYTES} from '../src/utils/askHerinRequest.js';
import {buildAskContext} from '../src/utils/askHerinContext.js';
import {validateAskRequest} from '../supabase/functions/generate-study-content/core.js';

const material = {pdfId:'p',pdfs:[{id:'p',name:'Engineering'}],notes:[],highlights:[],selectedHighlightIds:new Set()};
test('escaped text, Unicode, long titles and long history fit the existing server gate',()=>{
  const request=buildAskRequest({question:'Explain the material',
    history:Array.from({length:8},(_,i)=>({role:i%2?'assistant':'user',text:'Long answer \\ " \n \u2603 '.repeat(1000),sourcePages:Array(20000).fill(1)})),
    context:Array.from({length:12},(_,i)=>({kind:'pdf',title:'Title'.repeat(200),page:i+1,text:'\\"\n\u0000\u4e16\u754c'.repeat(2000)}))});
  assert.ok(new TextEncoder().encode(JSON.stringify(request)).length<=ASK_REQUEST_BYTES);
  assert.ok(JSON.stringify(request).length<40000);
  assert.doesNotThrow(()=>validateAskRequest(request));
  assert.ok(request.context.some(s=>s.page===12));
  assert.ok(request.history.every(m=>Object.keys(m).sort().join(',')==='role,text'));
});
test('page ranking finds the best match on the final page, after many weaker matches',()=>{
  const pages=Array.from({length:100},(_,i)=>({pageNum:i+1,text:i===99?'Railway ballast drainage distributes loads.':'Railway construction has many stages.'}));
  const context=buildAskContext({...material,question:'Explain railway ballast drainage',extractedText:pages});
  assert.equal(context[0].page,100);
  assert.ok(context[0].text.includes('ballast drainage'));
});
test('a relevant passage at the end of a very long page is not truncated away',()=>{
  const context=buildAskContext({...material,question:'Explain ballast drainage',extractedText:[{pageNum:80,text:'Unrelated introductory material. '.repeat(3000)+'Ballast drainage removes water from the track.'}]});
  assert.ok(context[0].text.includes('Ballast drainage'));
  assert.equal(context[0].page,80);
});
test('broad overviews sample the beginning, middle and end of a long PDF',()=>{
  const context=buildAskContext({...material,question:'What are the main points of my notes?',extractedText:Array.from({length:100},(_,i)=>({pageNum:i+1,text:`Lesson ${i+1}: engineering topic.`}))});
  assert.equal(context[0].page,1);
  assert.equal(context.at(-1).page,100);
  assert.ok(context.some(s=>s.page>40&&s.page<60));
  assert.doesNotThrow(()=>validateAskRequest(buildAskRequest({question:'Summarize this PDF',context})));
});
