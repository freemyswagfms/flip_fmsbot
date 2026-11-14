import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {handleAdminRequest} from '../api/admin.js';
import {isFlipAdmin} from '../api/flip.js';
const token='12345:TEST-ADMIN-BOT';
function signed(id){
 const q=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),
    user:JSON.stringify({id,first_name:'Test'})});
 const key=createHmac('sha256','WebAppData').update(token).digest();
 q.set('hash',createHmac('sha256',key).update([...q.entries()].sort(([a],[b])=>a.localeCompare(b,'en'))
    .map(([k,v])=>k+'='+v).join('\n')).digest('hex'));
 return q.toString();
}
function req(id,url='https://flip.example.com/api/admin?view=me',method='GET',body){
 return new Request(url,{method,headers:{'x-telegram-init-data':signed(id),...(body?{'content-type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});
}
test('Admin route requires Telegram signature and rejects normal players',async()=>{
 const old=process.env;process.env={...old,TELEGRAM_BOT_TOKEN:token,FLIP_ADMIN_TELEGRAM_ID:'12345'};
 try{
   const unauth=await handleAdminRequest(new Request('https://flip.example.com/api/admin?view=me'));
   assert.equal(unauth.status,401);
   const forbidden=await handleAdminRequest(req(67890));
   assert.equal(forbidden.status,403);
   const me=await handleAdminRequest(req(12345));
   assert.equal(me.status,200);
   assert.equal((await me.json()).admin,true);
 }finally{process.env=old}
});
test('Admin ownership fails closed unless configured with exact numeric Telegram ID',()=>{
 const old=process.env;process.env={...old,FLIP_ADMIN_TELEGRAM_ID:'invalid'};try{
   assert.equal(isFlipAdmin(12345),false);
   process.env.FLIP_ADMIN_TELEGRAM_ID='12345';
   assert.equal(isFlipAdmin(12345),true);
   assert.equal(isFlipAdmin(67890),false);
 }finally{process.env=old}
});
test('Admin grants use the signed actor ID, never an actor ID supplied in request body',async()=>{
 const old=process.env,oldFetch=globalThis.fetch;
 let body;
 process.env={...old,TELEGRAM_BOT_TOKEN:token,SUPABASE_URL:'https://example.supabase.co',
   SUPABASE_SECRET_KEY:'sb_secret_testing',FLIP_ADMIN_TELEGRAM_ID:'12345'};
 globalThis.fetch=async(_url,opt)=>{body=JSON.parse(opt.body);return new Response(
   JSON.stringify({ok:true,mode:'test',recipient_id:'67890'}),{status:200});};
 try{
   const res=await handleAdminRequest(req(12345,'https://flip.example.com/api/admin','POST',{
     action:'grant_card',recipientId:'67890',cardId:'carti/die-lit/common',mode:'test',
     note:'verification',requestId:'11111111-1111-4111-8111-111111111111',adminId:'67890'
   }));
   assert.equal(res.status,200);
   assert.equal(body.p_admin_id,12345);
   assert.equal(body.p_recipient_id,67890);
   assert.equal(body.p_mode,'test');
   const invalid=await handleAdminRequest(req(12345,'https://flip.example.com/api/admin','POST',{
     action:'grant_card',recipientId:'0',cardId:'carti/die-lit/common',mode:'ranked',
     note:'bad',requestId:'11111111-1111-4111-8111-111111111111'
   }));
   assert.equal(invalid.status,400);
 }finally{process.env=old;globalThis.fetch=oldFetch}
});

test('Admin searches cards with bounded server query, never the full catalog',async()=>{
 const old=process.env,oldFetch=globalThis.fetch;
 let url,payload;
 process.env={...old,TELEGRAM_BOT_TOKEN:token,SUPABASE_URL:'https://example.supabase.co',
   SUPABASE_SECRET_KEY:'sb_secret_testing',FLIP_ADMIN_TELEGRAM_ID:'12345'};
 globalThis.fetch=async(u,opt)=>{url=u;payload=JSON.parse(opt.body);return new Response('[]',{status:200});};
 try{
   const res=await handleAdminRequest(req(12345,'https://flip.example.com/api/admin?view=cards&q=Playboi%20Carti'));
   assert.equal(res.status,200);
   assert.match(url,/flip_admin_search_cards$/);
   assert.deepEqual(payload,{p_query:'Playboi Carti',p_limit:50});
   const tooLong=await handleAdminRequest(req(12345,'https://flip.example.com/api/admin?view=cards&q='+('a'.repeat(81))));
   assert.equal(tooLong.status,400);
 }finally{process.env=old;globalThis.fetch=oldFetch}
});
test('XP/F grants are owner-only, bounded and use the signed Telegram actor',async()=>{
 const old=process.env,oldFetch=globalThis.fetch;
 const calls=[];
 process.env={...old,TELEGRAM_BOT_TOKEN:token,SUPABASE_URL:'https://example.supabase.co',
   SUPABASE_SECRET_KEY:'sb_secret_testing',FLIP_ADMIN_TELEGRAM_ID:'12345'};
 globalThis.fetch=async(u,opt)=>{calls.push({url:u,body:JSON.parse(opt.body)});
   return new Response(JSON.stringify({ok:true,level:2,balance:100,kind:'xp'}),{status:200});};
 try{
   const data={action:'grant_resource',recipientId:'67890',kind:'xp',amount:250,note:'Bonus',
     requestId:'11111111-1111-4111-8111-111111111111',adminId:'67890'};
   const forbidden=await handleAdminRequest(req(67890,'https://flip.example.com/api/admin','POST',data));
   assert.equal(forbidden.status,403);
   const res=await handleAdminRequest(req(12345,'https://flip.example.com/api/admin','POST',data));
   assert.equal(res.status,200);
   assert.match(calls[0].url,/flip_admin_grant_resource$/);
   assert.equal(calls[0].body.p_admin_id,12345);
   assert.equal(calls[0].body.p_amount,250);
   assert.equal(calls[0].body.p_kind,'xp');
   const invalid=await handleAdminRequest(req(12345,'https://flip.example.com/api/admin','POST',
     {...data,amount:1000001}));
   assert.equal(invalid.status,400);
   assert.equal(calls.length,1);
   const f=await handleAdminRequest(req(12345,'https://flip.example.com/api/admin','POST',
     {...data,kind:'f',amount:100}));
   assert.equal(f.status,200);
   assert.equal(calls[1].body.p_kind,'f');
 }finally{process.env=old;globalThis.fetch=oldFetch}
});
