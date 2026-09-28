import test from 'node:test';
import assert from 'node:assert/strict';
import {databaseId,encodeRows,decodeRows,createRepository} from '../src/utils/cloudRepository.js';
import {mergeWorkspace} from '../src/utils/mergeWorkspace.js';
const user='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const model={classes:[{id:'class1',name:'Biology',days:[1,3],startTime:'09:00',endTime:'10:00',location:'Lab'}],pdfs:[{id:'p1',name:'Book.pdf',pageCount:24,status:'ready'},{id:'n1',name:'Personal note',kind:'note'}],notes:{p1:{content:'My notes'},n1:{content:'Standalone'}},highlights:{p1:[{id:'h1',text:'Mitosis is cell division.',color:'yellow',page:2,source:'pdf',rects:[{x:1,y:2,width:3,height:4}]}]},extractedTexts:{p1:{pages:[{pageNum:2,text:'Mitosis is cell division.'}]}},study:{flashcards:[{id:'generated-string',highlightId:'h1',pdfId:'p1',question:'What is mitosis?',answer:'Cell division',reviews:3,level:2}],quizQuestions:[{id:'q1',pdfId:'p1',question:'What is mitosis?',correctAnswer:'Cell division',type:'identification'}]},assignments:[{id:'a1',classId:'class1',title:'Read',due:'2026-09-30T12:00',completed:false}],reminders:{occurrence:{title:'Biology',remindAt:'2026-09-30T12:00:00Z',completed:true,entityId:'class1'}},settings:{theme:'plum',mode:'dark',reminderMinutes:15,displayName:'Student'},quizSession:{score:1,index:0}};
test('all feature models round-trip through the supplied SQL schema',async()=>{
 const rows=await encodeRows(model,user);const loaded=decodeRows(rows);
 assert.equal(loaded.classes[0].location,'Lab');assert.deepEqual(loaded.classes[0].days,[1,3]);
 assert.equal(loaded.pdfs[0].name,'Book.pdf');assert.match(rows.pdfs[0].file_path,new RegExp('^'+user+'/'));
 assert.equal(loaded.notes.p1.content,'My notes');assert.equal(loaded.notes.n1.content,'Standalone');
 assert.equal(rows.notes[1].pdf_id,null);assert.equal(loaded.pdfs[1].kind,'note');
 assert.deepEqual(loaded.highlights.p1[0].rects,model.highlights.p1[0].rects);
 assert.equal(loaded.study.flashcards[0].reviews,3);assert.equal(loaded.study.quizQuestions[0].correctAnswer,'Cell division');
 assert.equal(loaded.assignments[0].classId,'class1');assert.equal(loaded.settings.theme,'plum');assert.equal(loaded.settings.mode,'dark');assert.equal(loaded.quizSession.score,1);assert.equal(loaded.reminders.occurrence.completed,true);
 assert.deepEqual(loaded.extractedTexts,model.extractedTexts);
 assert.equal(await databaseId('generated-string',user),rows.flashcards[0].id);assert.equal(await databaseId(user),user);
});
test('repository enforces owner filters, private paths, and propagates RLS failures',async()=>{
 const calls=[];let fail=false;
 const client={from(table){let mutation=false;const q={select(){return q;},eq(k,v){assert.equal(k,'user_id');assert.equal(v,user);return q;},order(){return q;},range(){return q;},limit(){return q;},in(){return q;},upsert(rows){mutation=true;assert.ok(rows.every(r=>r.user_id===user));calls.push(table);return q;},delete(){return q;},then(resolve){resolve({data:[],error:mutation&&fail?{message:'RLS denied'}:null});}};return q;},storage:{from(bucket){assert.equal(bucket,'herin-pdfs');return {upload:async(path)=>{assert.ok(path.startsWith(user+'/'));return {data:{path}};},download:async()=>({data:new Blob(['pdf'])}),remove:async()=>({data:[]})};}}};
 const repo=createRepository(client,user);await repo.load();fail=true;await assert.rejects(repo.save(model),/RLS denied/);fail=false;await repo.save(model);assert.ok(calls.includes('reminders'));await repo.upload('p1',new Blob());
});

test('offline reconciliation preserves other-device additions and applies only local edits/deletions',()=>{
 const base={classes:[{id:'a',name:'Old',location:'Room 1'},{id:'b',name:'Delete'}],settings:{theme:'ocean',mode:'light'}};
 const local={classes:[{id:'a',name:'Local',location:'Room 1'}],settings:{theme:'plum',mode:'light'}};
 const remote={classes:[{id:'a',name:'Old',location:'Lab'},{id:'b',name:'Delete'},{id:'c',name:'Other device'}],settings:{theme:'ocean',mode:'dark'}};
 const merged=mergeWorkspace(base,local,remote);
 assert.deepEqual(merged.classes,[{id:'a',name:'Local',location:'Lab'},{id:'c',name:'Other device'}]);assert.deepEqual(merged.settings,{theme:'plum',mode:'dark'});
});
test('standalone note annotations and cards from removed highlights remain supported',async()=>{
 const copy=structuredClone(model);copy.highlights.n1=[{id:'text-h1',source:'text',text:'Standalone',start:0,end:10}];copy.highlights.p1=[];
 const rows=await encodeRows(copy,user);assert.equal(rows.highlights.length,0);assert.equal(rows.flashcards[0].highlight_id,null);
 const restored=decodeRows(rows);assert.equal(restored.highlights.n1[0].text,'Standalone');assert.equal(restored.study.flashcards[0].highlightId,'h1');
 assert.notEqual(await databaseId('same-legacy-id',user),await databaseId('same-legacy-id','other-user'));
});

test('new questions merge into the loaded document quiz without duplicate upsert IDs or lost questions',async()=>{
 const existing=await encodeRows(model,user);
 const loaded=decodeRows(existing);
 loaded.study.quizQuestions.push({id:'new-question',pdfId:'p1',question:'List the factors',correctAnswer:'Safety; mobility',type:'enumeration',expectedItems:['Safety','mobility']});
 const next=await encodeRows(loaded,user);
 assert.equal(next.quizzes.length,1);
 assert.equal(next.quizzes[0].id,existing.quizzes[0].id);
 assert.deepEqual(next.quizzes[0].questions.map(q=>q.id),['q1','new-question']);
 assert.equal(decodeRows(next).study.quizQuestions.length,2);
});
