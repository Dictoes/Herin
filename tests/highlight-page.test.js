import test from 'node:test';
import assert from 'node:assert/strict';
import { highlightPage } from '../src/utils/highlightPage.js';

test('extracted highlights link to their starting PDF page, including legacy highlights',()=>{
  const pages={pages:[{pageNum:1,text:'First'},{pageNum:2,text:'Mitosis is cell division.'}]};
  assert.equal(highlightPage({source:'text',start:7},pages),2);
  assert.equal(highlightPage({source:'text',start:0},pages),1);
  assert.equal(highlightPage({source:'pdf',page:8},pages),8);
  assert.equal(highlightPage({source:'text',start:0},'Legacy text'),1);
});
