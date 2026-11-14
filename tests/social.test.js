import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {handleSocialRequest} from '../api/social.js';

const bot='12345:TEST-SOCIAL-BOT';
function signed(id){
  const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),
    user:JSON.stringify({id,username:'player'+id,first_name:'Test'})});
  const secret=createHmac('sha256','WebAppData').update(bot).digest();
  const text=[...p.entries()].sort(([a],[b])=>a.localeCompare(b,'en'))
    .map(([k,v])=>k+'='+v).join('\n');
  p.set('hash',createHmac('sha256',secret).update(text).digest('hex'));
  return p.toString();
}
function request(id,path='https://flip.example.com/api/social?view=leaderboard',body){
  return new Request(path,{method:body?'POST':'GET',
    headers:{'x-telegram-init-data':signed(id),...(body?{'content-type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{})});
}
const withEnv=fn=>async()=>{
  const env=process.env,fetch=globalThis.fetch;
  process.env={...env,TELEGRAM_BOT_TOKEN:bot,
    SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'test_server_secret'};
  try{await fn();}finally{process.env=env;globalThis.fetch=fetch;}
};
test('Social endpoints reject unsigned callers',withEnv(async()=>{
  const response=await handleSocialRequest(new Request('https://flip.example.com/api/social'));
  assert.equal(response.status,401);
  const malformed=await handleSocialRequest(new Request('https://flip.example.com/api/social',{
    headers:{'x-telegram-init-data':'user={"id":42}'}}));
  assert.equal(malformed.status,401);
}));
test('Public leaderboard reveals names and CP, not private Telegram IDs',withEnv(async()=>{
  let body,name;
  globalThis.fetch=async(url,options)=>{name=url;body=JSON.parse(options.body);
    return new Response(JSON.stringify({players:2,me:{telegram_id:'123',place:1,cp:125},
      leaders:[{telegram_id:'123',username:'mike',first_name:'Mike',level:3,cp:125,ranked_cards:4,ranked_variants:2},
        {telegram_id:'789',username:'',first_name:'Player',level:1,cp:0,ranked_cards:0,ranked_variants:0}]}),{status:200});};
  const response=await handleSocialRequest(request(123));
  assert.equal(response.status,200);
  const data=await response.json();
  assert.match(name,/flip_cp_leaderboard$/);
  assert.equal(body.p_viewer_id,123);
  assert.equal(data.leaders[0].name,'@mike');
  assert.ok(!('telegram_id' in data.leaders[0]));
  assert.ok(!('telegram_id' in data.me));
  assert.match(data.leaders[1].name,/FLIP#[0-9A-F]{10}/);
}));
test('Trade creation ignores forged sender ID and refuses fake currencies',withEnv(async()=>{
  let body,name,count=0;
  globalThis.fetch=async(url,options)=>{name=url;body=JSON.parse(options.body);count++;
    return new Response(JSON.stringify({ok:true,id:'11111111-1111-4111-8111-111111111111'}),{status:200});};
  const valid={action:'create',recipientId:'456',offerCard:'carti/die-lit/mythic',
    wantCard:'carti/music/legendary',requestId:'11111111-1111-4111-8111-111111111112',
    actorId:'456',currency:'F',amount:999999};
  const res=await handleSocialRequest(request(123,'https://flip.example.com/api/social',valid));
  assert.equal(res.status,200);
  assert.match(name,/flip_trade_create$/);
  assert.equal(body.p_actor_id,123);
  assert.equal(body.p_recipient_id,456);
  assert.equal(body.p_offer_card,'carti/die-lit/mythic');
  assert.ok(!('amount' in body));
  const bad=await handleSocialRequest(request(123,'https://flip.example.com/api/social',
    {...valid,offerCard:'carti/../mythic'}));
  assert.equal(bad.status,400);
  const fake=await handleSocialRequest(request(123,'https://flip.example.com/api/social',
    {...valid,action:'give_F'}));
  assert.equal(fake.status,400);
  assert.equal(count,1);
}));
test('Only a signed actor can accept and only with a valid trade UUID',withEnv(async()=>{
  const calls=[];
  globalThis.fetch=async(url,options)=>{
    calls.push({url,body:JSON.parse(options.body)});
    return new Response(JSON.stringify({ok:true,status:'accepted'}),{status:200});};
  const body={action:'accept',tradeId:'99999999-9999-4999-8999-999999999999',
    requestId:'88888888-8888-4888-8888-888888888888',actorId:456};
  const res=await handleSocialRequest(request(123,'https://flip.example.com/api/social',body));
  assert.equal(res.status,200);
  assert.equal(calls[0].body.p_actor_id,123);
  assert.equal(calls[0].body.p_verb,'accept');
  assert.match(calls[0].url,/flip_trade_reply$/);
  const invalid=await handleSocialRequest(request(123,'https://flip.example.com/api/social',
    {...body,tradeId:'not-a-uuid'}));
  assert.equal(invalid.status,400);
}));
test('Partner inventory and preview are read-only and validated',withEnv(async()=>{
  const calls=[];
  globalThis.fetch=async(url,options)=>{
    calls.push({url,body:JSON.parse(options.body)});
    return new Response(JSON.stringify([]),{status:200});};
  const bad=await handleSocialRequest(request(123,'https://flip.example.com/api/social?view=cards&playerId=0'));
  assert.equal(bad.status,400);
  const valid=await handleSocialRequest(request(123,'https://flip.example.com/api/social?view=cards&playerId=456'));
  assert.equal(valid.status,200);
  assert.equal(calls[0].body.p_actor_id,123);
  assert.equal(calls[0].body.p_player_id,456);
  assert.match(calls[0].url,/flip_trade_player_cards$/);
}));
