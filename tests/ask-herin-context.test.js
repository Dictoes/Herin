import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAskContext} from '../src/utils/askHerinContext.js';

test('Ask context sends matching excerpts and keeps available source page metadata',()=>{
  const context=buildAskContext({
    question:'Explain photosynthesis and light',
    pdfId:'pdf-1',
    pdfs:[{id:'pdf-1',name:'Biology'}],
    extractedText:{pages:[
      {pageNum:1,text:'Cell walls provide structure.\n\nPlants use light for photosynthesis.'},
      {pageNum:2,text:'Photosynthesis converts light energy into stored chemical energy.'},
    ]},
    notes:[{pdfId:'pdf-1',content:'Photosynthesis needs light and water.'}],
    highlights:[{id:'hl-1',pdfId:'pdf-1',text:'Plants use light.'},{id:'hl-2',pdfId:'pdf-1',text:'Cell walls provide structure.'}],
    selectedHighlightIds:new Set(['hl-1']),
    preferredPage:2,
  });
  assert.deepEqual(context.map(source=>source.kind),['pdf','pdf','note','highlight']);
  assert.deepEqual(context.slice(0,2).map(source=>source.page),[2,1]);
  assert.ok(context.every(source=>source.text.toLowerCase().includes('photosynthesis')||source.text.toLowerCase().includes('light')));
  assert.ok(context.every(source=>source.text.length < 2200));
});

test('Ask context omits unrelated notes, unselected highlights and sources without matching terms',()=>{
  const context=buildAskContext({
    question:'Tell me about mitochondria',
    pdfId:'pdf-1',
    pdfs:[{id:'pdf-1',name:'Biology'}],
    extractedText:'Photosynthesis uses light.',
    notes:[{pdfId:'pdf-1',content:'Cell membranes control entry.'}],
    highlights:[{id:'selected',pdfId:'pdf-1',text:'Mitochondria produce energy.'},{id:'unselected',pdfId:'pdf-1',text:'Mitochondria have membranes.'}],
    selectedHighlightIds:new Set(),
  });
  assert.deepEqual(context,[]);
});
