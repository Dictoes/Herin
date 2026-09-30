import test from 'node:test';
import assert from 'node:assert/strict';
import {studySnapshot,validShareId} from '../src/utils/studyShare.js';
test('public snapshots only include explicitly selected learning content',()=>{
 const snapshot=studySnapshot({content:'Lesson',user_id:'private',email:'secret',file_path:'private.pdf',flashcards:[{question:'Q',answer:'A',explanation:'Why',user_id:'hidden',reviews:20,dueAt:'date',sourceText:'not selected',pdfId:'private-id'}],quizzes:[{question:'Quiz',correctAnswer:'B',options:['A','B'],score:10,cloudQuizId:'hidden'}]});
 assert.deepEqual(snapshot,{text:'Lesson',flashcards:[{question:'Q',answer:'A',explanation:'Why',options:[]}],quizzes:[{question:'Quiz',answer:'B',explanation:'',options:['A','B']}]});
});
test('snapshots detach from originals, preserve literal text, and reject empty/oversized selections',()=>{
 const item={question:'<script>alert(1)</script>',answer:'A'};const snapshot=studySnapshot({flashcards:[item]});item.answer='Changed';assert.equal(snapshot.flashcards[0].answer,'A');assert.equal(snapshot.flashcards[0].question,'<script>alert(1)</script>');
 assert.throws(()=>studySnapshot({}),/no study content/);assert.throws(()=>studySnapshot({content:'x'.repeat(1000000)}),/too large/);
 assert.equal(studySnapshot({content:'A\u0000B'}).text,'A\uFFFDB');
});
test('share tokens require random UUID v4 format',()=>{assert.ok(validShareId(crypto.randomUUID()));for(const id of ['abc123','../settings','',null,'b103ac16-0000-1000-8000-000000000020'])assert.equal(validShareId(id),false);});
