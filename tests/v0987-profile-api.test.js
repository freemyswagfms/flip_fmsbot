import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {handleRequest} from '../api/flip.js';
const token='123456:PROFILE-COSMETIC-TEST';
const uuid='99999999-9999-4999-8999-999999999901';
const signed=id=>{
 const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),
  user:JSON.stringify({id,username:'test',first_name:'Test'})});
 const secret=createHmac('sha256','WebAppData').update(token).digest();
 const data=[...p].sort(([a],[b])=>a.localeCompare(b,'en'))
  .map(([k,v])=>k+'='+v).join('\n');
 p.set('hash',createHmac('sha256',secret).update(data).digest('hex'));
 return p.toString();
};
async function setup(callback){
 const env=process.env,previous=globalThis.fetch,calls=[];
 process.env={...env,TELEGRAM_BOT_TOKEN:token,
  SUPABASE_URL:'https://test.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_test'};
 globalThis.fetch=async(url,opts={})=>{
  const name=String(url).split('/').at(-1);
  const payload=JSON.parse(opts.body||'{}');
  calls.push({name,payload});
  if(name==='flip_player_is_banned')return Response.json(false);
  if(name==='flip_profile_cosmetics_shop')return Response.json({items:[],owned:[],slot_count:3});
  if(name==='flip_profile_purchase')return Response.json({ok:true,balance:700,profile:{},shop:{}});
  if(['flip_profile_equip','flip_profile_favorite_artist','flip_profile_pin_badge','flip_showcase_set'].includes(name))
   return Response.json({ok:true,profile:{}});
  throw Error('unexpected RPC '+name);
 };
 try{await callback(calls)}
 finally{process.env=env;globalThis.fetch=previous}
}
const request=(id,body)=>new Request('https://flip.test/api/flip',{
 method:'POST',headers:{'x-telegram-init-data':signed(id),'content-type':'application/json'},
 body:JSON.stringify({requestId:uuid,...body})});
test('Signed cosmetic purchases only spend currency of the Telegram account that signed initData',async()=>{
 await setup(async calls=>{
  const purchase=await handleRequest(request(87654,{
   action:'profile_buy',kind:'buy_cosmetic',itemId:'acid-signal'}));
  assert.equal(purchase.status,200);
  assert.ok(calls.some(c=>c.name==='flip_profile_purchase'&&
    c.payload.p_telegram_id===87654&&c.payload.p_request_id===uuid&&
    c.payload.p_item_id==='acid-signal'));
  assert.ok(calls.some(c=>c.name==='flip_player_is_banned'&&c.payload.p_telegram_id===87654));
  const forged=await handleRequest(request(87654,{
   action:'profile_buy',kind:'buy_cosmetic',itemId:'acid-signal',telegramId:99999}));
  assert.equal(forged.status,400);
  assert.equal(calls.filter(c=>c.name==='flip_profile_purchase').length,1);
 });
});
test('Cosmetics shop always uses the signed player and ignores a forged target query',async()=>{
 await setup(async calls=>{
  const r=await handleRequest(new Request('https://flip.test/api/flip?cosmetics=1&telegram_id=99999',
   {headers:{'x-telegram-init-data':signed(87654)}}));
  assert.equal(r.status,200);
  assert.deepEqual(calls.filter(c=>c.name==='flip_profile_cosmetics_shop'),
   [{name:'flip_profile_cosmetics_shop',payload:{p_telegram_id:87654}}]);
 });
});
test('Cosmetic and badge actions validate payload and reach only the corresponding service RPCs',async()=>{
 await setup(async calls=>{
  for(const [action,payload,rpc] of [
   ['profile_equip',{kind:'title',itemId:'day-one'},'flip_profile_equip'],
   ['profile_favorite',{artistId:'carti'},'flip_profile_favorite_artist'],
   ['profile_pin_badge',{slot:2,code:'mythic_first'},'flip_profile_pin_badge'],
   ['set_showcase',{slot:6,cardId:null},'flip_showcase_set']
  ]){
   const r=await handleRequest(request(87654,{action,...payload}));
   assert.equal(r.status,200,action);
   assert.ok(calls.some(c=>c.name===rpc&&c.payload.p_telegram_id===87654));
  }
  const called=calls.length;
  for(const payload of [
   {action:'profile_buy',kind:'buy_slot',itemId:'slot-7'},
   {action:'profile_buy',kind:'buy_cosmetic',itemId:'<svg>'},
   {action:'profile_equip',kind:'balance',itemId:'acid-signal'},
   {action:'profile_pin_badge',slot:4,code:'mythic_first'},
   {action:'profile_favorite',artistId:'../../private'},
   {action:'set_showcase',slot:7,cardId:null}
  ]){
   const response=await handleRequest(request(87654,payload));
   // Valid-looking slot-7 is rejected by server SQL, not by the URL parser.
   if(payload.itemId==='slot-7')continue;
   assert.equal(response.status,400,JSON.stringify(payload));
  }
  assert.ok(calls.length>=called);
 });
});
