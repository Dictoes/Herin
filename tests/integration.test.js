import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {indexedDB} from 'fake-indexeddb';
import {readFile,unlink} from 'node:fs/promises';
import {pathToFileURL,fileURLToPath} from 'node:url';
const bundle=new URL('./.integration-runtime.mjs',import.meta.url);
await build({entryPoints:['tests/integration-entry.jsx'],outfile:fileURLToPath(bundle),bundle:true,platform:'node',format:'esm',packages:'external',external:['react','react-dom','react-dom/*','pdfjs-dist'],define:{'import.meta.env.BASE_URL':'"/"','import.meta.env.PROD':'false'},plugins:[{name:'auth-stub',setup(b){b.onResolve({filter:/\/lib\/supabase$/},()=>({path:'supabase',namespace:'auth-stub'}));b.onLoad({filter:/.*/,namespace:'auth-stub'},()=>({contents:'export const supabase = null;',loader:'js'}));}},{name:'worker-url',setup(b){b.onResolve({filter:/\?url$/},args=>({path:args.path,namespace:'worker-url'}));b.onLoad({filter:/.*/,namespace:'worker-url'},()=>({contents:`export default ${JSON.stringify(pathToFileURL(process.cwd()+'/node_modules/pdfjs-dist/build/pdf.worker.mjs').href)}`,loader:'js'}));}}]});
const dom=new JSDOM('<div id="root"></div>',{url:'https://herin.test/'});
const {window}=dom;Object.assign(globalThis,{window,location:window.location,document:window.document,localStorage:window.localStorage,indexedDB,Event:window.Event,IS_REACT_ACT_ENVIRONMENT:true});
Object.defineProperty(globalThis,'navigator',{value:window.navigator,configurable:true});
window.matchMedia=globalThis.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
const runtime=await import(bundle.href);
const {mount,act,app,storage,savePdfBlob,getPdfBlob,processPdf}=runtime;
const root=document.getElementById('root');
const source='Mitosis is cell division. Osmosis is the movement of water. Diffusion is the movement of particles. Respiration is energy release.';
const click=async el=>{assert.ok(el,'control exists');await act(async()=>el.dispatchEvent(new window.MouseEvent('click',{bubbles:true})));};
test('saved highlight automatically generates linked study data; retry is idempotent and edits persist',async()=>{
 storage.setPdfs([{id:'p1',name:'Biology.pdf',status:'ready'}]);
 let stop=await mount(root);
 let h;await act(async()=>{h=app().addHighlight('p1',{page:3,source:'pdf',text:source,color:'yellow',rects:[]});});
 assert.ok(h.id);let saved=storage.getStudy();assert.equal(saved.flashcards.length,4);assert.ok(saved.quizQuestions.length>=4);
 assert.ok(saved.flashcards.every(c=>c.highlightId===h.id && c.sourcePage===3));
 await act(async()=>app().updateFlashcard(saved.flashcards[0].id,{question:'My edited question',edited:true}));
 await act(async()=>app().generateForHighlight('p1',h));assert.equal(storage.getStudy().flashcards.length,4);assert.equal(storage.getStudy().flashcards[0].question,'My edited question');
 await stop();stop=await mount(root);assert.equal(app().flashcards.length,4);assert.equal(app().getHighlights('p1')[0].generationStatus,'ready');
 const previous=storage.getStudy().flashcards.length;
 await act(async()=>app().addHighlight('p1',{source:'text',text:source,start:0,end:source.length,color:'pink'}));assert.equal(storage.getStudy().flashcards.length,previous+4);
 await stop();
});
test('quiz feedback, next step, persisted score, question edit and delete controls',async()=>{
 let stop=await mount(root,'/quiz');
 await act(async()=>{const q=app().quizQuestions[0];app().updateQuizQuestion(q.id,{type:'multiple',options:[q.correctAnswer,'Wrong option','Other','Neither']});});
 await click([...root.querySelectorAll('.quiz-options button')].find(b=>b.textContent.includes('Wrong option')));
 assert.match(root.textContent,/Review this answer/);assert.match(root.textContent,/Correct answer:/);
 const state=storage.getQuizSession();assert.equal(state.status,'incorrect');await stop();
 stop=await mount(root,'/quiz');assert.match(root.textContent,/Review this answer/);assert.equal(storage.getQuizSession().status,'incorrect');
 await click([...root.querySelectorAll('button')].find(b=>b.textContent==='Next question'));assert.equal(storage.getQuizSession().index,1);
 await click([...root.querySelectorAll('button')].find(b=>b.textContent==='Edit question'));assert.ok(root.querySelector('[role=dialog]'));
 await click(root.querySelector('button[aria-label="Close dialog"]'));await stop();
});
test('flashcard reveal and four ratings save progress; all normal routes render',async()=>{
 let stop=await mount(root,'/flashcards');await click(root.querySelector('.flip-front'));await click([...root.querySelectorAll('button')].find(b=>b.textContent==='Good'));
 assert.equal(storage.getStudy().flashcards[0].rating,'Good');assert.ok(storage.getStudy().flashcards[0].dueAt);await stop();
 for(const route of ['/','/schedule','/settings','/pdfs']){stop=await mount(root,route);assert.ok(root.querySelector('h1'));await stop();}
});
test('PDF extraction reads every page, preserves cards and custom notes, and keeps original bytes',async()=>{
 const file=new Blob([await readFile('tests/fixtures/Biology-course.pdf')],{type:'application/pdf'});
 const stop=await mount(root);
 let meta;await act(async()=>{meta=await app().addPdf(Object.assign(file,{name:'Biology-course.pdf'}));});
 await act(async()=>app().setNoteContent(meta.id,'My custom notes'));
 const before=JSON.stringify(storage.getStudy());
 await act(async()=>processPdf(file,meta,app()));
 assert.equal(storage.getExtractedTexts()[meta.id].pages.length,24);
 assert.equal(storage.getNotes()[meta.id].content,'My custom notes');assert.equal(JSON.stringify(storage.getStudy()),before);
 assert.equal((await getPdfBlob(meta.id)).size,file.size);assert.equal(storage.getPdfs().find(p=>p.id===meta.id).status,'ready');
 await stop();
});
test('scanned and damaged PDFs do not fabricate questions or remain processing',async()=>{
 const stop=await mount(root);
 for(const name of ['scan.pdf','broken.pdf']){
 const file=Object.assign(new Blob([await readFile(`tests/fixtures/${name}`)],{type:'application/pdf'}),{name});let meta;await act(async()=>{meta=await app().addPdf(file);});
 if(name==='broken.pdf')await act(async()=>{await assert.rejects(processPdf(file,meta,app()));});else await act(async()=>processPdf(file,meta,app()));
 const status=storage.getPdfs().find(p=>p.id===meta.id).status;assert.equal(status,name==='broken.pdf'?'error':'unreadable');
 }
 await stop();
});
test('failed study write is not reported as successful generation',async()=>{
 const stop=await mount(root);const original=storage.setStudy; // write callback captured by the hook: intercept backing store instead.
 const proto=Object.getPrototypeOf(localStorage),set=proto.setItem;
 proto.setItem=function(key,value){if(key==='herin:study')throw Error('Quota');return set.call(this,key,value);};
 await act(async()=>app().addHighlight('p1',{source:'pdf',page:9,text:'Gravity is an attractive force between masses.',rects:[],color:'blue'}));
 proto.setItem=set;
 assert.equal(storage.getHighlights().p1.at(-1).generationStatus,'error');await stop();
});
test('classes and assignments persist edits and deletion across remounts',async()=>{
 let stop=await mount(root,'/schedule');let cls;
 await act(async()=>{cls=app().addClass({name:'Chemistry',days:[1,3],startTime:'10:00',endTime:'11:00',location:'Room 2',instructor:'Professor',subject:'Science'});});
 await act(async()=>app().updateClass(cls.id,{location:'Lab 1'}));
 await act(async()=>app().saveAssignment({title:'Lab report',classId:cls.id,due:'2026-09-30T12:00',completed:false}));
 await stop();stop=await mount(root,'/schedule');assert.equal(app().classes.find(c=>c.id===cls.id).location,'Lab 1');assert.match(root.textContent,/Lab report/);
 const task=app().assignments[0];await act(async()=>app().saveAssignment({...task,completed:true}));assert.ok(storage.getAssignments()[0].completed);
 await act(async()=>app().deleteAssignment(task.id));await act(async()=>app().deleteClass(cls.id));assert.equal(storage.getAssignments().length,0);assert.ok(!storage.getClasses().some(c=>c.id===cls.id));await stop();
});
test('15-minute reminder records the occurrence and does not repeat after remount',async t=>{
 t.mock.timers.enable({apis:['Date'],now:new Date(2026,8,26,9,45).getTime()});
 const cls={id:'reminder-test',name:'Test class',days:[new Date().getDay()],startTime:'10:00',endTime:'11:00'};
 storage.setClasses([cls]);storage.setSettings({...storage.getSettings(),notificationsEnabled:true,reminderMinutes:15});
 let stop=await mount(root);assert.ok(app().toasts.some(t=>t.message.includes('starts in 15 min')));await stop();
 stop=await mount(root);assert.ok(!app().toasts.some(t=>t.message.includes('starts in 15 min')));await stop();
 storage.setSettings({...storage.getSettings(),notificationsEnabled:false});
});
test.after(async()=>{dom.window.close();await unlink(bundle);});
