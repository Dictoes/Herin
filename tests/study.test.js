import test from 'node:test';
import assert from 'node:assert/strict';
import {generateStudyMaterials,generateClearNotes,checkQuizAnswer,studyUnits} from '../src/utils/flashcardUtils.js';

const long = {pages:Array.from({length:120},(_,i)=>({pageNum:i+1,text:`Concept${i} is the distinct explanation for lesson ${i}.\nUnit${i} includes alpha, beta, and gamma.\nPractice retrieval throughout this entire chapter without looking at your notes.`}))};
test('all pages generate cards, including the last page; legacy target cannot truncate',()=>{
  const r=generateStudyMaterials(long,2,{id:'long',name:'Course.pdf'});
  assert.equal(r.details.pagesRead,120);
  assert.equal(new Set(r.flashcards.map(c=>c.sourcePage)).size,120);
  assert.ok(r.flashcards.length>120);
  assert.ok(r.quizQuestions.some(q=>q.sourcePage===120));
  assert.equal(r.details.charsRead,long.pages.reduce((n,p)=>n+p.text.length,0));
});
test('multiple choice has four distinct options and exactly one answer',()=>{
  const r=generateStudyMaterials(long,undefined,{id:'mc'});
  const mc=r.quizQuestions.filter(q=>q.type==='multiple');
  assert.equal(mc.length,120);
  for(const q of mc){assert.equal(new Set(q.options).size,4);assert.equal(q.options.filter(o=>o===q.correctAnswer).length,1);}
});
test('identification and enumeration exist and enumeration rejects substring guesses',()=>{
  const r=generateStudyMaterials(long);
  assert.ok(r.quizQuestions.some(q=>q.type==='identification'));
  const q=r.quizQuestions.find(q=>q.type==='enumeration');
  assert.ok(checkQuizAnswer(q,'gamma, alpha, beta'));
  assert.ok(!checkQuizAnswer(q,'a, b, g'));
  assert.ok(!checkQuizAnswer(q,'alpha, beta, gamma, delta'));
});
test('punctuation-free text is chunked without dropping its last words',()=>{
  const text=Array.from({length:15000},(_,i)=>`vocabulary${i}`).join(' ');
  assert.equal(studyUnits(text).join(' '),text);
  const r=generateStudyMaterials(text);
  assert.ok(r.flashcards.length>200);
  assert.ok(r.notes.includes('vocabulary14999'));
});
test('short PDFs need no arbitrary 50-character threshold',()=>{
  assert.ok(generateStudyMaterials('Mitosis is cell division.').flashcards.length);
});
test('blank and scanned pages are reported instead of fabricated',()=>{
  const r=generateStudyMaterials({pages:[{pageNum:1,text:''},{pageNum:2,text:'Diffusion is the movement of particles.'}]});
  assert.equal(r.warnings.length,1);assert.equal(r.details.coverage[0].cards,0);
  assert.ok(r.notes.includes('No selectable text on this page'));
});
test('notes have structure and every page; source is unchanged',()=>{
  const before=JSON.stringify(long); const notes=generateClearNotes(long,'Course.pdf');
  for(let i=1;i<=120;i++)assert.ok(notes.includes(`## Page ${i}`));
  assert.ok(notes.includes('### Key terms'));assert.ok(notes.includes('### Key points'));assert.ok(notes.includes('### Recall prompts'));
  assert.equal(JSON.stringify(long),before);
});
test('IDs are stable across retries and distinct across files',()=>{
  const a=generateStudyMaterials(long,undefined,{id:'a'}),b=generateStudyMaterials(long,undefined,{id:'b'});
  assert.deepEqual(a.flashcards,generateStudyMaterials(long,undefined,{id:'a'}).flashcards);
  assert.equal(new Set(a.flashcards.map(c=>c.id)).size,a.flashcards.length);
  assert.notEqual(a.flashcards[0].id,b.flashcards[0].id);
});
test('Unicode answers stay meaningful',()=>{
  assert.ok(checkQuizAnswer({type:'identification',correctAnswer:'Эс'},'эс'));
  assert.ok(!checkQuizAnswer({type:'identification',correctAnswer:'Эс'},'өөр'));
});

test('lesson headings and document titles never become questions or distractors',()=>{
  const data={pages:[{pageNum:1,text:`Lesson 1: Introduction to the Foundations of Biology
Introduction to the Foundations of Biology
Course: General Biology
Photosynthesis is the process of converting light into chemical energy.
Diffusion is the movement of particles from high to low concentration.
Osmosis is the movement of water across a selectively permeable membrane.
Respiration is the release of energy from nutrients.
The cell membrane contains lipids, proteins, and carbohydrates.`}]};
  const r=generateStudyMaterials(data,undefined,{name:'Introduction to the Foundations of Biology.pdf'});
  assert.ok(r.flashcards.some(c=>c.question==='What is Photosynthesis?'));
  assert.ok(r.quizQuestions.some(q=>q.type==='multiple'));
  assert.ok(r.quizQuestions.some(q=>q.type==='enumeration'));
  for(const c of [...r.flashcards,...r.quizQuestions]){
    assert.doesNotMatch(c.sourceText,/Lesson 1|Foundations of Biology|Course:/);
    assert.doesNotMatch(JSON.stringify(c.options||[]),/Lesson|Foundations/);
  }
});
test('title-only pages do not fabricate study questions',()=>{
  const r=generateStudyMaterials({pages:[{pageNum:1,text:'Chapter 2: The Structure and Function of Cells\nThe Structure and Function of Cells'}]});
  assert.equal(r.flashcards.length,0);
  assert.equal(r.quizQuestions.length,0);
  assert.equal(r.details.pagesRead,1);
});

test('generic course and topic labels cannot become lesson questions',()=>{
 const r=generateStudyMaterials({pages:[{pageNum:1,text:'Course is Networking 2. Topic is Routing Protocols. Lesson 1: Static Routing. A static route manually defines the next hop for a remote network. Routers use a routing table to forward packets.'}]});
 assert.ok(r.flashcards.some(c=>/static route/i.test(c.question+c.answer)));
 assert.ok(!r.flashcards.some(c=>/^What is (Course|Topic|Lesson)/i.test(c.question)));
 assert.ok(!r.quizQuestions.some(q=>/correctAnswer.*^(Course|Topic|Lesson)$/i.test(JSON.stringify(q))));
});


test('User requirements validation test', () => {
  const data = {
    pages: [{
      pageNum: 1,
      text: `Course: Advanced Web Development
      Topic: Service Workers
      M O D U L E 1: Offline First
      What is the course?
      Service workers act as a proxy between the web app and the network.
      The purpose of a service worker is to enable offline experiences.
      Advantages of service workers include background sync, push notifications, and offline caching.
      If a service worker fails to register, then the app falls back to normal network requests.`
    }]
  };
  const r = generateStudyMaterials(data, undefined, {name: 'WebDev.pdf'});
  
  assert.ok(r.flashcards.length >= 3);
  
  assert.ok(r.flashcards.some(c => c.question.includes('What is the purpose of')));
  assert.ok(r.flashcards.some(c => c.question.includes('What are the advantages of')));
  assert.ok(r.flashcards.some(c => c.question.includes('What happens when')));

  const textCheck = JSON.stringify(r.flashcards) + JSON.stringify(r.quizQuestions);
  assert.doesNotMatch(textCheck, /module 1/i);
  assert.doesNotMatch(textCheck, /m o d u l e 1/i);
  assert.doesNotMatch(textCheck, /course:/i);
  
  assert.ok(r.quizQuestions.some(q => q.type === 'enumeration' && q.correctAnswer.includes('background sync')));
});
