import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {YUKI_IDLE_FRAMES, YUKI_REACTIONS, yukiFrameDuration} from '../src/utils/yukiStates.js';

test('idle atlas maps the supplied full-resolution 4 by 2 artwork in reading order', () => {
  const png=readFileSync(new URL('../public/yuki-idle-sheet.png',import.meta.url));
  assert.equal(png.readUInt32BE(16),1774);
  assert.equal(png.readUInt32BE(20),887);
  assert.deepEqual(YUKI_IDLE_FRAMES.map(f=>[f.column,f.row]),[[0,0],[1,0],[2,0],[3,0],[0,1],[1,1],[2,1],[3,1]]);
  assert.ok(YUKI_IDLE_FRAMES[4].duration<=180,'Closed eyes should be a brief blink');
  assert.ok(YUKI_IDLE_FRAMES.reduce((sum,f)=>sum+f.duration,0)>=7000,'Idle should stay gentle');
});

test('blink timing varies, stays brief, and never changes reaction expression timing',()=>{
  assert.equal(yukiFrameDuration('idle',3,()=>0),2500);
  assert.equal(yukiFrameDuration('idle',3,()=>.999),6496);
  assert.equal(yukiFrameDuration('idle',4,()=>0),110);
  assert.equal(yukiFrameDuration('idle',4,()=>.999),159);
  for(const state of Object.keys(YUKI_REACTIONS).filter(s=>s!=='idle')) {
    for(let frame=0;frame<4;frame++)assert.equal(yukiFrameDuration(state,frame,()=>0),yukiFrameDuration(state,frame,()=>.999));
  }
});

test('all reactions use existing source poses with accessible meanings and only thinking loops',()=>{
  for(const [state,reaction] of Object.entries(YUKI_REACTIONS)) {
    assert.ok(reaction.row>=0&&reaction.row<6,state);
    assert.ok(reaction.still>=0&&reaction.still<4,state);
    assert.ok(reaction.label.length>5,state);
    for(const frame of reaction.frames||[0,1,2,3])assert.ok(frame>=0&&frame<4,state);
    assert.equal(!!reaction.loop,state==='thinking');
  }
  assert.equal(YUKI_REACTIONS.celebrating.motion,'celebrating');
  assert.notEqual(YUKI_REACTIONS.quizCorrect.motion,YUKI_REACTIONS.celebrating.motion);
});
