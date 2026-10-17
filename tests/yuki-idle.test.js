import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {YUKI_IDLE_FRAMES} from '../src/utils/yukiStates.js';

test('idle atlas maps the supplied full-resolution 4 by 2 artwork in reading order', () => {
  const png=readFileSync(new URL('../public/yuki-idle-sheet.png',import.meta.url));
  assert.equal(png.readUInt32BE(16),1774);
  assert.equal(png.readUInt32BE(20),887);
  assert.deepEqual(YUKI_IDLE_FRAMES.map(f=>[f.column,f.row]),[[0,0],[1,0],[2,0],[3,0],[0,1],[1,1],[2,1],[3,1]]);
  assert.ok(YUKI_IDLE_FRAMES[4].duration<=180,'Closed eyes should be a brief blink');
  assert.ok(YUKI_IDLE_FRAMES.reduce((sum,f)=>sum+f.duration,0)>=7000,'Idle should stay gentle');
});
