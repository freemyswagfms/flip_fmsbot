import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GET,POST} from '../studio/api/config.js';

test('Studio public config uses a named GET handler returning a real response',async()=>{
  const prevUrl=process.env.SUPABASE_URL,prevKey=process.env.SUPABASE_PUBLISHABLE_KEY;
  try{
    process.env.SUPABASE_URL='https://example.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY='sb_publishable_test';
    const result=GET();
    assert.ok(result instanceof Response);
    assert.equal(result.status,200);
    assert.equal(result.headers.get('cache-control'),'no-store, max-age=0');
    assert.deepEqual(await result.json(),{
      supabaseUrl:'https://example.supabase.co',
      publishableKey:'sb_publishable_test',
      version:'0.9.8.4'
    });
    assert.equal(POST().status,405);
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
    const unavailable=GET();
    assert.equal(unavailable.status,503);
    assert.equal((await unavailable.json()).error,'STUDIO_CONFIG_MISSING');
  }finally{
    if(prevUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=prevUrl;
    if(prevKey===undefined)delete process.env.SUPABASE_PUBLISHABLE_KEY;
    else process.env.SUPABASE_PUBLISHABLE_KEY=prevKey;
  }
});
test('Studio boot has bounded startup and visible retry path',()=>{
  const js=readFileSync(new URL('../studio/app.js',import.meta.url),'utf8');
  assert.match(js,/AbortSignal\.timeout\(10000\)/);
  assert.match(js,/SESSION_TIMEOUT/);
  assert.match(js,/data-action="boot-retry"/);
  assert.match(js,/case 'boot-retry':await boot\(\);break/);
  assert.doesNotMatch(readFileSync(new URL('../studio/api/config.js',import.meta.url),'utf8'),
   /export default async function/);
});
