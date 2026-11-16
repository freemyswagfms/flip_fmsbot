import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {handleSocialRequest} from '../api/social.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const token='12345:FLIP_V098_SIGNED_TEST';
const reqid='33333333-3333-4333-8333-333333333333';
const card='carti/die-lit/rare';
function signed(id){
 const params=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),
   user:JSON.stringify({id,first_name:'Tester'})});
 const secret=createHmac('sha256','WebAppData').update(token).digest();
 params.set('hash',createHmac('sha256',secret).update([...params.entries()]
  .sort(([a],[b])=>a.localeCompare(b,'en')).map(([a,b])=>a+'='+b).join('\n'))
  .digest('hex'));
 return params.toString();
}
const post=(id,body)=>new Request('https://flip.test/api/social',{
 method:'POST',headers:{'x-telegram-init-data':id?signed(id):'',
  'content-type':'application/json'},body:JSON.stringify({requestId:reqid,...body})
});
const get=(id,path)=>new Request('https://flip.test/api/social?'+path,{
 headers:{'x-telegram-init-data':id?signed(id):''}
});
async function withMock(fetcher,fn){
 const originalEnv=process.env,prev=globalThis.fetch;
 process.env={...originalEnv,TELEGRAM_BOT_TOKEN:token,
  SUPABASE_URL:'https://flip-test.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_fake'};
 globalThis.fetch=fetcher;
 try{return await fn();}finally{process.env=originalEnv;globalThis.fetch=prev;}
}
test('Signed gift is transferred only through the server with a scoped request ID',async()=>{
 const calls=[];
 await withMock(async(url,opts)=>{
  calls.push({rpc:String(url).split('/').at(-1),body:JSON.parse(opts.body)});
  return Response.json({ok:true,id:reqid});
 },async()=>{
  const response=await handleSocialRequest(post(12345,{action:'gift',
   recipientId:'54321',cardId:card}));
  assert.equal(response.status,200);
  assert.deepEqual(calls,[{rpc:'flip_gift_send',body:{
   p_actor_id:12345,p_recipient_id:54321,p_card_id:card,p_request_id:reqid
  }}]);
 });
});
test('Malformed gifts and F deals never invoke database functions',async()=>{
 let calls=0;
 await withMock(async()=>{calls++;throw Error('unexpected SQL');},async()=>{
  const invalid=[
   {action:'gift',recipientId:'invalid',cardId:card},
   {action:'gift',recipientId:'54321',cardId:'script!'},
   {action:'create_f',recipientId:'54321',offerCards:[card],wantCards:[],offerF:0,wantF:0},
   {action:'create_f',recipientId:'54321',offerCards:[card],wantCards:[],offerF:20,wantF:30},
   {action:'create_f',recipientId:'54321',offerCards:[card],wantCards:[card],offerF:0,wantF:10},
   {action:'create_f',recipientId:'54321',offerCards:[card,card],wantCards:[],offerF:0,wantF:10},
   {action:'create_f',recipientId:'54321',offerCards:[card],wantCards:[],offerF:0,wantF:10001},
   {action:'create_f',recipientId:'54321',offerCards:[],wantCards:[card],offerF:1.2,wantF:0},
   {action:'create_f',recipientId:'54321',offerCards:[],wantCards:[card],offerF:'10',wantF:0},
   {action:'accept_f',tradeId:'bad-id'}
  ];
  for(const body of invalid){
   const response=await handleSocialRequest(post(12345,body));
   assert.equal(response.status,400,JSON.stringify(body));
  }
  assert.equal((await handleSocialRequest(post(null,{action:'gift',recipientId:'54321',cardId:card}))).status,401);
  assert.equal((await handleSocialRequest(get(null,'view=expanded'))).status,401);
  assert.equal(calls,0);
 });
});
test('Cards for F: both purchase and sale map to separate transaction RPC',async()=>{
 const calls=[];
 await withMock(async(url,opts)=>{
  calls.push({rpc:String(url).split('/').at(-1),body:JSON.parse(opts.body)});
  return Response.json({ok:true});
 },async()=>{
  for(const value of [
   {offerCards:[card],wantCards:[],offerF:0,wantF:150},
   {offerCards:[],wantCards:[card],offerF:250,wantF:0}
  ]){
   const res=await handleSocialRequest(post(12345,{action:'create_f',recipientId:'54321',...value}));
   assert.equal(res.status,200);
  }
  assert.deepEqual(calls.map(c=>c.rpc),['flip_f_trade_create','flip_f_trade_create']);
  assert.equal(calls[0].body.p_offer_f,0);
  assert.equal(calls[0].body.p_want_f,150);
  assert.equal(calls[1].body.p_offer_f,250);
  assert.deepEqual(calls[1].body.p_want_cards,[card]);
 });
});
test('Only signed actors may accept or cancel F proposals, server controls verb',async()=>{
 const calls=[];
 await withMock(async(url,opts)=>{
  calls.push({rpc:String(url).split('/').at(-1),body:JSON.parse(opts.body)});
  return Response.json({ok:true,status:'accepted',sender_xp:0,recipient_xp:0});
 },async()=>{
  const response=await handleSocialRequest(post(12345,{action:'accept_f',
   tradeId:reqid,actorId:99999}));
  assert.equal(response.status,200);
  assert.deepEqual(calls,[{rpc:'flip_f_trade_reply',body:{
   p_actor_id:12345,p_trade_id:reqid,p_verb:'accept',p_request_id:reqid
  }}]);
 });
});
test('Expanded signed feed merges old and F trades, with recent gifts',async()=>{
 const mockName=(id)=>({sender_id:'12345',recipient_id:'54321',
  sender_username:'sender',sender_name:'Sender',
  recipient_username:'recipient',recipient_name:'Recipient',created_at:'2026-11-16T12:00:00Z',id});
 const calls=[];
 await withMock(async(url,opts)=>{
  const rpc=String(url).split('/').at(-1),body=JSON.parse(opts.body);
  calls.push({rpc,body});
  if(rpc==='flip_trade_list')return Response.json([{...mockName('11111111-1111-4111-8111-111111111111'),status:'pending',offer_cards:[card],want_cards:['carti/music/common']}]);
  if(rpc==='flip_f_trade_list')return Response.json([{...mockName('22222222-2222-4222-8222-222222222222'),status:'pending',offer_cards:[card],want_cards:[],offer_f:0,want_f:200}]);
  if(rpc==='flip_gift_list')return Response.json([{...mockName('33333333-3333-4333-8333-333333333333'),card_id:card}]);
  if(rpc==='flip_profile_directory')return Response.json([]);
  throw Error('unexpected '+rpc);
 },async()=>{
  const response=await handleSocialRequest(get(12345,'view=expanded&telegram_id=99999'));
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.trades.length,2);
  assert.deepEqual(body.trades.map(t=>t.type),['cards','currency']);
  assert.equal(body.trades[1].want_f,200);
  assert.equal(body.gifts[0].mine,true);
  assert.equal(body.gifts[0].partner_label,'@recipient');
  assert.equal(calls[0].body.p_actor_id,12345);
  assert.equal(calls[1].body.p_actor_id,12345);
  assert.equal(calls[2].body.p_actor_id,12345);
 });
});
test('SQL: gifts and F transfers are atomic, server-only and no XP farm',()=>{
 const sql=read('sql/019_flip_v098_gifts_currency.sql');
 assert.match(sql,/flip_gift_send/);
 assert.match(sql,/flip_f_trade_create/);
 assert.match(sql,/flip_f_trade_reply/);
 assert.match(sql,/ORDER BY telegram_id FOR UPDATE/);
 assert.match(sql,/p_request_id uuid/);
 assert.match(sql,/flip_transferable_ranked/);
 assert.match(sql,/interval '24 hours'/);
 assert.match(sql,/flip_card_deliveries/);
 assert.match(sql,/flip_user_events/);
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.flip_gift_send/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.flip_f_trade_reply/);
 assert.doesNotMatch(sql,/xp=xp\+15|sender_xp',15/);
});
test('Client gift and F action modes are present and use existing trade UI',()=>{
 const script=read('src/scripts/trades.js');
 const html=read('index.html'),pkg=JSON.parse(read('package.json'));
 assert.match(script,/data-trade-mode/);
 assert.match(script,/data-trade-currency-side/);
 assert.match(script,/action:'gift'/);
 assert.match(script,/action:'create_f'/);
 assert.match(script,/currency_preview/);
 assert.match(script,/data-trade-verb/);
 assert.match(read('src/scripts/delivery-reveal.js'),/source==='gift'/);
 assert.match(read('src/scripts/activity.js'),/gift_received/);
 assert.match(read('src/scripts/activity.js'),/currency_offer/);
 assert.equal(pkg.version,'0.9.8');
 assert.match(html,/trades\.js\?v=0\.9\.8/);
});
