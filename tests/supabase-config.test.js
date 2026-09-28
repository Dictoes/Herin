import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSupabaseConfig } from '../src/lib/supabaseConfig.js';

test('missing or blank Vercel variables use the configured public Herin project',()=>{
  const defaults=resolveSupabaseConfig();
  assert.equal(defaults.url,'https://ycejqtvemiesuiflyqmw.supabase.co');
  assert.ok(defaults.key.startsWith('sb_publishable_'));
  assert.deepEqual(resolveSupabaseConfig({VITE_SUPABASE_URL:' ',VITE_SUPABASE_ANON_KEY:''}),defaults);
});
test('explicit project configuration overrides defaults and rejects secret keys',()=>{
  assert.deepEqual(resolveSupabaseConfig({VITE_SUPABASE_URL:' https://example.supabase.co ',VITE_SUPABASE_ANON_KEY:' sb_publishable_test '}),{url:'https://example.supabase.co',key:'sb_publishable_test'});
  assert.throws(()=>resolveSupabaseConfig({VITE_SUPABASE_ANON_KEY:'sb_secret_invalid'}),/publishable key/);
});
