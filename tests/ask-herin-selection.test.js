import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAskContext} from '../src/utils/askHerinContext.js';
const material = {pdfId:'p', pdfs:[{id:'p',name:'Biology'}], extractedText:[{pageNum:2,text:'Plants convert sunlight into chemical energy.'}], notes:[{pdfId:'p',content:'Remember chlorophyll.'}], highlights:[{id:'h',pdfId:'p',text:'Chloroplasts contain chlorophyll.'}], selectedHighlightIds:new Set(['h'])};
const coursePages = [
  {pageNum:1,text:'What Does CE331 Cover? Core engineering scope: road and railroad infrastructure design.'},
  {pageNum:2,text:'Course Outcomes CO1 - Describe historical development of highways.'},
  {pageNum:3,text:'Stopping sight distance is the distance a driver needs to perceive a hazard and stop.'},
  {pageNum:4,text:'Railway ballast distributes wheel loads and provides drainage.'},
];
test('natural page questions retrieve only the requested physical PDF page', () => {
  const context=buildAskContext({...material,extractedText:coursePages,question:'Can you explain page 3 briefly?'});
  assert.deepEqual(context.map(source=>source.page),[3]);
  assert.match(context[0].text,/Stopping sight distance/);
  assert.deepEqual(buildAskContext({...material,extractedText:coursePages,question:'Explain page 30'}),[]);
});
test('follow-ups can retrieve the current page and previous page without relabeling sources', () => {
  const context=buildAskContext({...material,extractedText:coursePages,preferredPage:4,question:'How does this idea relate to the previous section?'});
  assert.deepEqual(context.map(source=>source.page),[4,3]);
});
test('code examples retrieve actual code even when the question has no shared keywords', () => {
  const context=buildAskContext({...material,notes:[],selectedHighlightIds:new Set(),question:'Give me an example of this code.',extractedText:[{pageNum:1,text:'Course Outcomes: programming'},{pageNum:3,text:'def double(x):\n    return x * 2'}]});
  assert.deepEqual(context.map(source=>source.page),[3]);
  assert.match(context[0].text,/return x \* 2/);
});
test('natural concept questions use selected notes; unreadable PDFs do not invent sources', () => {
  assert.ok(buildAskContext({...material,question:'What does this concept mean in simpler words?'}).length);
  assert.deepEqual(buildAskContext({...material,notes:[],highlights:[],extractedText:[],question:'What does this concept mean in simpler words?'}),[]);
});
test('general topic requests select actual lessons instead of administrative opening slides', () => {
  for (const question of ['summarize this topic','Summarize this PDF','What is the main topic of this PDF?','Explain a key idea from my material']) {
    const context=buildAskContext({...material,notes:[],selectedHighlightIds:new Set(),extractedText:coursePages,question});
    assert.deepEqual(context.map(source=>source.page),[3,4]);
  }
});
test('explicit outcome questions retain access to course outcomes', () => {
  const context=buildAskContext({...material,extractedText:coursePages,question:'What are the course outcomes?'});
  assert.ok(context.some(source=>source.page===2));
});
test('overview-only PDFs keep real evidence for an honest limitation response', () => {
  const context=buildAskContext({...material,notes:[],selectedHighlightIds:new Set(),extractedText:coursePages.slice(0,2),question:'Summarize this PDF'});
  assert.deepEqual(context.map(source=>source.page),[1,2]);
});
test('welcome prompts include real selected material without keyword overlap', () => {
  for (const question of ['Explain a key idea from my material','What are the main points of my notes?','Help me understand this highlight']) {
    const sources=buildAskContext({...material,question});
    assert.deepEqual(sources.map(s=>s.kind),['pdf','note','highlight']);
    assert.equal(sources[0].page,2);
  }
});
test('missing material never borrows notes or highlights from another document', () => {
  assert.deepEqual(buildAskContext({...material,pdfId:'missing',question:'Help me understand this highlight'}),[]);
});
test('long PDFs retain selected highlights within the source budget', () => {
  const sources=buildAskContext({...material,question:'Explain a key idea from my material',extractedText:Array.from({length:30},(_,i)=>({pageNum:i+1,text:'Plants use sunlight.'}))});
  assert.equal(sources.length,12);
  assert.equal(sources.at(-1).kind,'highlight');
  assert.ok(sources.some(s=>s.kind==='note'));
});
