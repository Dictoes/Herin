import test from 'node:test';
import assert from 'node:assert/strict';
import { databaseText, databaseJson } from '../src/utils/databaseText.js';
import { encodeRows } from '../src/utils/cloudRepository.js';

test('database text repairs NUL and lone surrogates without shifting highlight offsets',()=>{
  const source='A\u0000B\uD800C\uDC00D';
  assert.equal(databaseText(source),'A\uFFFDB\uFFFDC\uFFFDD');
  assert.equal(databaseText(source).length,source.length);
  const valid='Монгол 日本語 café 😀 👩🏽‍💻\n\t literal \\u0000';
  assert.equal(databaseText(valid),valid);
});

test('nested JSON values and keys are repaired without mutating pending local data',()=>{
  const original={'key\u0000':[{text:'PDF\u0000text',count:0,enabled:false,empty:null}]};
  assert.deepEqual(databaseJson(original),{'key\uFFFD':[{text:'PDF\uFFFDtext',count:0,enabled:false,empty:null}]});
  assert.equal(original['key\u0000'][0].text,'PDF\u0000text');
  assert.throws(()=>databaseJson({'a\u0000':1,'a\uFFFD':2}),/conflicting/);
});

test('previously queued PDF, notes, highlights, cards, quizzes and preferences encode safely',async()=>{
  const text='Cell\u0000 division\uD800 😀';
  const model={pdfs:[{id:'p1',name:'file.pdf'}],extractedTexts:{p1:{pages:[{pageNum:1,text}]}},notes:{p1:{content:text}},highlights:{p1:[{id:'h1',text,start:0,end:text.length}]},study:{flashcards:[{id:'c1',pdfId:'p1',highlightId:'h1',question:text,answer:text}],quizQuestions:[{id:'q1',pdfId:'p1',question:text,correctAnswer:text}]},settings:{displayName:text}};
  const rows=await encodeRows(model,'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');
  assert.equal(rows.notes[0].content,databaseText(text));
  assert.equal(rows.pdfs[0].extracted_text.pages[0].text,databaseText(text));
  assert.equal(rows.highlights[0].data.end,text.length);
  assert.equal(rows.flashcards[0].question,databaseText(text));
  assert.equal(rows.quizzes[0].questions[0].correctAnswer,databaseText(text));
  assert.equal(rows.profiles[0].display_name,databaseText(text));
  assert.ok(!JSON.stringify(rows).includes('\\u0000'));
});
