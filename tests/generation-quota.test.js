import test from 'node:test';
import assert from 'node:assert/strict';
import {readGenerationQuota, quotaCountdown} from '../src/utils/generationQuota.js';

test('allowance countdown uses server time even when device clock is wrong', () => {
  const quota=readGenerationQuota({limit:20,remaining:7,server_now:'2026-10-17T08:00:00Z',resets_at:'2026-10-17T16:00:00Z'},1000);
  assert.equal(quotaCountdown(quota.deadline,1000),'8h 0m');
  assert.equal(quotaCountdown(quota.deadline,1000+7*3600000+59*60000),'0h 1m');
  assert.equal(quotaCountdown(quota.deadline,quota.deadline),'Checking reset…');
  assert.equal(quotaCountdown(quota.deadline,quota.deadline+60000),'Checking reset…');
});
test('missing or invalid server balances never become a fake full allowance', () => {
  const valid={limit:20,remaining:0,server_now:'2026-10-17T08:00:00Z',resets_at:'2026-10-17T16:00:00Z'};
  assert.equal(readGenerationQuota(valid).remaining,0);
  for(const invalid of [null,{}, {...valid,remaining:21},{...valid,remaining:-1},{...valid,resets_at:'bad'},{...valid,resets_at:valid.server_now}]) assert.throws(()=>readGenerationQuota(invalid));
});
