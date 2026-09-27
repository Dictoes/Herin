import test from 'node:test';
import assert from 'node:assert/strict';
import {generateHighlightMaterials,INCOMPLETE_HIGHLIGHT} from '../src/utils/flashcardUtils.js';
const run=text=>generateHighlightMaterials({id:'h1',page:7,text},{id:'p1',name:'Course.pdf',subject:'Biology'});
test('highlight source and identity survive every generated item',()=>{
 const text='Mitosis is cell division. Osmosis is the movement of water. Diffusion is the movement of particles. Respiration is energy release.';
 const r=run(text);assert.ok(r.flashcards.length>=4);assert.ok(r.quizQuestions.some(q=>q.type==='multiple'));
 for(const q of [...r.flashcards,...r.quizQuestions]){assert.equal(q.highlightId,'h1');assert.equal(q.pdfId,'p1');assert.equal(q.sourcePage,7);assert.equal(q.sourceText,text);assert.ok(text.includes(q.sourceExcerpt));assert.ok(q.explanation);}
 assert.deepEqual(run(text),r);
 const other=generateHighlightMaterials({id:'h2',page:7,text},{id:'p1',name:'Course.pdf',subject:'Biology'});
 assert.notEqual(other.flashcards[0].id,r.flashcards[0].id);
});
test('labels and incomplete selections do not create study cards',()=>{
 for(const text of ['Course: Networking 2','Topic: Advanced Network Routing Principles','Lesson 1: Foundations of Biology','Networking','the main']){const r=run(text);assert.equal(r.flashcards.length,0,text);assert.equal(r.quizQuestions.length,0,text);assert.equal(r.message,INCOMPLETE_HIGHLIGHT);}
});
test('one definition does not generate random-word multiple choice options',()=>{
 const r=run('Mitosis is the division of a cell into daughter cells.');
 assert.ok(r.flashcards.length);assert.ok(r.quizQuestions.some(q=>q.type==='true-false'));assert.ok(!r.quizQuestions.some(q=>q.type==='multiple'));
});
test('cause, comparison, conditional and formula questions are supported by the highlight',()=>{
 for(const [text,answer] of [
 ['Water evaporates because heat increases molecular motion.','heat increases molecular motion.'],
 ['Evaporation happens when liquid gains enough energy.','Evaporation'],
 ['When water freezes, it becomes ice.','it becomes ice.'],
 ['Static routing is configured manually whereas dynamic routing adapts automatically.','dynamic routing adapts automatically.'],
 ['Force = mass × acceleration.','mass × acceleration.']]){
 const r=run(text);assert.ok(r.quizQuestions.some(q=>q.correctAnswer===answer),text);
 }
});
test('numbered highlighted steps become an enumeration',()=>{
 const r=run('The steps of preparation are:\n1. Measure the sample\n2. Heat the sample\n3. Record the temperature');
 const q=r.quizQuestions.find(q=>q.type==='enumeration');assert.ok(q);assert.equal(q.expectedItems.length,3);
});

import {validatePdf,MAX_PDF_BYTES} from '../src/utils/validatePdf.js';
test('PDF validation rejects unsupported, disguised and oversized files',async()=>{
 const file=(name,type,text,size)=>({name,type,size:size||text.length,slice:()=>({text:async()=>text})});
 await assert.rejects(validatePdf(file('x.txt','text/plain','hello')),/isn't a PDF/);
 await assert.rejects(validatePdf(file('fake.pdf','application/pdf','hello')),/valid PDF header/);
 await assert.rejects(validatePdf(file('large.pdf','application/pdf','%PDF-1.7',MAX_PDF_BYTES+1)),/larger than 60 MB/);
 assert.equal(await validatePdf(file('normal.pdf','application/pdf','%PDF-1.7')),true);
});
