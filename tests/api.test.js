import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {validateTelegramInitData,handleRequest} from '../api/flip.js';
const key='12345:TEST-TOKEN';
function signedData(options={}){
  const {id=12345,date=Math.floor(Date.now()/1000),token=key,userExtras={}}=options;
  const username=Object.prototype.hasOwnProperty.call(options,'username')?options.username:'tester';
  const user=JSON.stringify({id,username,first_name:'Tester',...userExtras});
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
    if(String(url).endsWith('/rpc/flip_player_is_banned'))return Response.json(false);
    calls.push({url:String(url),payload:JSON.parse(options.body),auth:options.headers.apikey});
    const state={balance:0,xp:0,level:1,xp_to_next:100,inventory:[],discovered:[]};
    if(String(url).endsWith('flip_bootstrap'))return new Response(JSON.stringify(state),{status:200});
    if(String(url).endsWith('flip_streak_touch'))return new Response(JSON.stringify({days:1,unclaimed:0}),{status:200});
    if(String(url).endsWith('flip_snapshot'))return new Response(JSON.stringify(state),{status:200});
    if(String(url).endsWith('flip_public_catalog'))return new Response(JSON.stringify({artists:[],releases:[],cards:[]}),{status:200});
    if(String(url).endsWith('flip_task_snapshot'))return new Response(JSON.stringify({daily:[],weekly:[]}),{status:200});
    if(String(url).endsWith('flip_showcase_own'))return new Response(JSON.stringify({public_id:'11111111-1111-4111-8111-111111111111',slots:[]}),{status:200});
    if(String(url).endsWith('flip_achievement_snapshot'))return new Response(JSON.stringify({items:[],badges:[],total:30,completed:0,claimable:0}),{status:200});
    if(String(url).endsWith('flip_open_drop'))return new Response(JSON.stringify({card_id:'carti/die-lit/common',state}),{status:200});
    return new Response(JSON.stringify({error:'unexpected rpc'}),{status:500});
  };
  try{
    const initData=signedData({id:58321,username:'SomeFan'});
    const boot=await handleRequest(new Request('https://flip.example.com/api/flip',{headers:{'x-telegram-init-data':initData}}));
    assert.equal(boot.status,200);
    assert.equal(calls.find(x=>x.url.endsWith('flip_bootstrap')).payload.telegram_id,58321);
    assert.equal(calls.find(x=>x.url.endsWith('flip_bootstrap')).payload.username,'SomeFan');
    const open=await handleRequest(new Request('https://flip.example.com/api/flip',{method:'POST',headers:{'x-telegram-init-data':initData},body:JSON.stringify({action:'drop',requestId:'11111111-2222-4333-8444-555555555555'})}));
    assert.equal(open.status,200);
    assert.equal((await open.json()).card_id,'carti/die-lit/common');
    assert.equal(calls.find(x=>x.url.endsWith('flip_open_drop')).payload.p_telegram_id,58321);
    assert.equal(calls.find(x=>x.url.endsWith('flip_open_drop')).payload.p_request_id,'11111111-2222-4333-8444-555555555555');
    assert.equal(calls.find(x=>x.url.endsWith('flip_open_drop')).auth,'sb_secret_for_test');
    assert.ok(calls.some(x=>x.url==='https://example.supabase.co/rest/v1/rpc/flip_bootstrap'));
    // Ban denial is validated separately in v0.9.8.4 security tests.
  }finally{process.env=originalEnv;globalThis.fetch=originalFetch;}
});

test('First-party Telegram HMAC includes signature when present',()=>{
  const raw=new URLSearchParams({
    auth_date:String(Math.floor(Date.now()/1000)),
    user:JSON.stringify({id:12345,first_name:'Tester'}),
    signature:'tg-third-party-signature-example'
  });
  const secret=createHmac('sha256','WebAppData').update(key).digest();
  const dataCheck=[...raw.entries()].sort(([a],[b])=>a.localeCompare(b,'en'))
    .map(([k,v])=>k+'='+v).join('\n');
  raw.set('hash',createHmac('sha256',secret).update(dataCheck).digest('hex'));
  assert.equal(validateTelegramInitData(raw.toString(),key).telegram_id,12345);
  raw.set('signature','tampered');
  assert.throws(()=>validateTelegramInitData(raw.toString(),key),/INVALID_TELEGRAM_SESSION/);
});

test('Telegram validated profile includes safe photo and optional username',()=>{
  const data=validateTelegramInitData(signedData({username:undefined,userExtras:{
    first_name:'First',last_name:'Last',photo_url:'https://t.me/i/userpic/320/photo.jpg'}}),key);
  assert.equal(data.username,'');
  assert.equal(data.last_name,'Last');
  assert.equal(data.photo_url,'https://t.me/i/userpic/320/photo.jpg');
  for(const url of ['javascript:alert(1)','http://host.example/photo.jpg','https://user:pass@host.example/photo.jpg']){
    assert.equal(validateTelegramInitData(signedData({userExtras:{photo_url:url}}),key).photo_url,'');
  }
});
test('Server profile fallback tag stable for no username and photo never written into Supabase RPC',async()=>{
  const env=process.env, orig=globalThis.fetch;
  process.env={...env,SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_fake',TELEGRAM_BOT_TOKEN:key};
  const calls=[];
  globalThis.fetch=async(url,options)=>{
    if(String(url).endsWith('/rpc/flip_player_is_banned'))return Response.json(false);calls.push(JSON.parse(options.body));return new Response(
    JSON.stringify({balance:0,xp:0,level:1,inventory:[],discovered:[],first_name:'First',username:''}),{status:200}
  );};
  try{
    const init=signedData({id:987654,username:undefined,userExtras:{first_name:'First',last_name:'Last',photo_url:'https://t.me/i/userpic/photo.jpg'}});
    const request=()=>new Request('https://flip.example.com/api/flip',{headers:{'x-telegram-init-data':init}});
    const a=await (await handleRequest(request())).json();
    const b=await (await handleRequest(request())).json();
    assert.equal(a.profile.display_name,'First Last');
    assert.match(a.profile.handle,/^FLIP#[0-9A-F]{10}$/);
    assert.equal(a.profile.handle,b.profile.handle);
    assert.equal(a.profile.avatar_url,'https://t.me/i/userpic/photo.jpg');
    assert.deepEqual(calls.filter(x=>x.telegram_id),[{telegram_id:987654,username:'',first_name:'First'},{telegram_id:987654,username:'',first_name:'First'}]);
  }finally{process.env=env;globalThis.fetch=orig;}
});
