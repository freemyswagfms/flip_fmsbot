import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {validateTelegramInitData,handleRequest} from '../api/flip.js';
const key='12345:TEST-TOKEN';
function signedData({id=12345,date=Math.floor(Date.now()/1000),username='tester',token=key}={}){
  const user=JSON.stringify({id,username,first_name:'Tester'});
  const raw=new URLSearchParams({auth_date:String(date),user});
  const secret=createHmac('sha256','WebAppData').update(token).digest();
  const digest=createHmac('sha256',secret).update([...raw.entries()].sort(([a],[b])=>a.localeCompare(b,'en')).map(([k,v])=>`${k}=${v}`).join('\n')).digest('hex');
  raw.set('hash',digest);
  return raw.toString();
}
test('Telegram legitimate signature yields trusted identity',()=>{
  const result=validateTelegramInitData(signedData(),key);
  assert.equal(result.telegram_id,12345);assert.equal(result.username,'tester');
});
test('Telegram forged user, signature, replay, duplicate fields are rejected',()=>{
  const raw=signedData();
  assert.throws(()=>validateTelegramInitData(raw.replace('tester','admin'),key));
  assert.throws(()=>validateTelegramInitData(signedData({date:1}),key));
  assert.throws(()=>validateTelegramInitData(raw+'&user=%7B%7D',key));
  assert.throws(()=>validateTelegramInitData(raw,'wrong-token'));
});
test('Health gives no keys and reports unconfigured environment', async()=>{
  const response=await handleRequest(new Request('https://example.com/api/flip?health=1'));
  const result=await response.json();
  assert.equal(result.service,'FLIP');assert.equal(typeof result.configured,'boolean');
  assert.ok(!('secret' in result));
});
test('Neither forged requests nor unauthenticated POST can award a card',async()=>{
  const before=process.env;
  process.env={...before,SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_fake',TELEGRAM_BOT_TOKEN:key};
  try{
    const response=await handleRequest(new Request('https://example.com/api/flip',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'drop',requestId:'11111111-1111-4111-8111-111111111111'})}));
    assert.equal(response.status,401);
    assert.equal((await response.json()).error,'INVALID_TELEGRAM_SESSION');
  }finally{process.env=before;}
});
test('Reject unlisted actions and invalid requestIds before database access',async()=>{
  const before=process.env;
  process.env={...before,SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_fake',TELEGRAM_BOT_TOKEN:key};
  try{
    const response=await handleRequest(new Request('https://example.com/api/flip',{method:'POST',headers:{'content-type':'application/json','x-telegram-init-data':signedData()},body:JSON.stringify({action:'give-me-100000F',requestId:'invalid'})}));
    assert.equal(response.status,400);
  }finally{process.env=before;}
});

test('Authenticated GET and POST forward only the validated Telegram ID to the server-side RPC',async()=>{
  const originalEnv=process.env, originalFetch=globalThis.fetch;
  const calls=[];
  process.env={...originalEnv,SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_for_test',TELEGRAM_BOT_TOKEN:key};
  globalThis.fetch=async(url,options)=>{
    calls.push({url:String(url),payload:JSON.parse(options.body),auth:options.headers.apikey});
    const state={balance:0,xp:0,level:1,xp_to_next:100,inventory:[],discovered:[]};
    if(String(url).endsWith('flip_bootstrap'))return new Response(JSON.stringify(state),{status:200});
    if(String(url).endsWith('flip_open_drop'))return new Response(JSON.stringify({card_id:'carti/die-lit/common',state}),{status:200});
    return new Response(JSON.stringify({error:'unexpected rpc'}),{status:500});
  };
  try{
    const initData=signedData({id:58321,username:'SomeFan'});
    const boot=await handleRequest(new Request('https://flip.example.com/api/flip',{headers:{'x-telegram-init-data':initData}}));
    assert.equal(boot.status,200);
    assert.equal(calls[0].payload.telegram_id,58321);
    assert.equal(calls[0].payload.username,'SomeFan');
    const open=await handleRequest(new Request('https://flip.example.com/api/flip',{method:'POST',headers:{'x-telegram-init-data':initData},body:JSON.stringify({action:'drop',requestId:'11111111-2222-4333-8444-555555555555'})}));
    assert.equal(open.status,200);
    assert.equal((await open.json()).card_id,'carti/die-lit/common');
    assert.equal(calls[1].payload.p_telegram_id,58321);
    assert.equal(calls[1].payload.p_request_id,'11111111-2222-4333-8444-555555555555');
    assert.equal(calls[1].auth,'sb_secret_for_test');
    assert.equal(calls[0].url,'https://example.supabase.co/rest/v1/rpc/flip_bootstrap');
  }finally{process.env=originalEnv;globalThis.fetch=originalFetch;}
});
