import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {handleAdminRequest} from '../api/admin.js';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const token='12345:ADMIN_0964_SIGNED_TEST';
const uuid='11111111-1111-4111-8111-111111111111';
const cid='carti/die-lit/rare',cid2='travis/utopia/mythic';
function signed(id){
 const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),
   user:JSON.stringify({id,first_name:'Tester'})});
 const key=createHmac('sha256','WebAppData').update(token).digest();
 p.set('hash',createHmac('sha256',key).update([...p.entries()]
  .sort(([a],[b])=>a.localeCompare(b,'en'))
  .map(([a,b])=>a+'='+b).join('\n')).digest('hex'));
 return p.toString();
}
async function withEnv(fetcher,fn){
 const prev=process.env,oldFetch=globalThis.fetch;
 process.env={...prev,TELEGRAM_BOT_TOKEN:token,FLIP_ADMIN_TELEGRAM_ID:'12345',
  SUPABASE_URL:'https://test.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_test'};
 globalThis.fetch=fetcher;
 try{return await fn();}finally{process.env=prev;globalThis.fetch=oldFetch;}
}
const post=(id,body)=>new Request('https://flip.test/api/admin',{
 method:'POST',headers:{'x-telegram-init-data':id?signed(id):'',
 'content-type':'application/json'},body:JSON.stringify(body)
});
const get=(id,qs)=>new Request('https://flip.test/api/admin?'+qs,{
 headers:{'x-telegram-init-data':id?signed(id):''}
});
test('Batch grants are owner-authenticated and preserve chosen player, quantity and mode',async()=>{
 const calls=[];
 await withEnv(async(url,opts)=>{
  calls.push({rpc:String(url).split('/').at(-1),data:JSON.parse(opts.body)});
  return Response.json({ok:true,total:3,mode:'ranked',recipient_id:'54321'});
 },async()=>{
  const res=await handleAdminRequest(post(12345,{
   action:'grant_cards',recipientId:'54321',
   cards:[{id:cid,quantity:2},{id:cid2,quantity:1}],
   mode:'ranked',note:'For friends',requestId:uuid
  }));
  assert.equal(res.status,200);
  assert.equal((await res.json()).total,3);
  assert.deepEqual(calls,[{rpc:'flip_admin_grant_batch',data:{
   p_admin_id:12345,p_recipient_id:54321,
   p_cards:[{id:cid,quantity:2},{id:cid2,quantity:1}],
   p_mode:'ranked',p_note:'For friends',p_request_id:uuid
  }}]);
 });
});
test('Unauthorized and malformed bulk grants cannot issue any SQL calls',async()=>{
 let hits=0;
 await withEnv(async()=>{hits++;throw Error('unexpected RPC');},async()=>{
  const base={action:'grant_cards',recipientId:'54321',
   cards:[{id:cid,quantity:1}],mode:'test',note:'',requestId:uuid};
  assert.equal((await handleAdminRequest(post(76543,base))).status,403);
  assert.equal((await handleAdminRequest(post(null,base))).status,401);
  const invalid=[
   {...base,recipientId:'0'},
   {...base,adminId:54321},
   {...base,p_admin_id:54321},
   {...base,cards:[]},
   {...base,cards:[{id:cid,quantity:0}]},
   {...base,cards:[{id:cid,quantity:1.2}]},
   {...base,cards:[{id:cid,quantity:21}]},
   {...base,cards:[{id:cid,quantity:1},{id:cid,quantity:1}]},
   {...base,cards:[{id:cid,quantity:15},{id:cid2,quantity:6}]},
   {...base,cards:[{id:'bad!card',quantity:1}]},
   {...base,cards:[{id:cid,quantity:1,other:true}]},
   {...base,mode:'free'},
   {...base,requestId:'not-a-uuid'},
   {...base,note:'a'.repeat(201)}
  ];
  for(const payload of invalid)assert.equal((await handleAdminRequest(post(12345,payload))).status,400,JSON.stringify(payload));
  assert.equal(hits,0);
 });
});
test('New card browser supports artist search, rarity filter and pagination, all signed',async()=>{
 const calls=[];
 await withEnv(async(url,opts)=>{
  calls.push({rpc:String(url).split('/').at(-1),data:JSON.parse(opts.body)});
  return Response.json({cards:[{id:cid}],total:135,offset:24});
 },async()=>{
  const response=await handleAdminRequest(get(12345,'view=cards_browser&q=carti&rarity=rare&offset=24'));
  assert.equal(response.status,200);
  assert.deepEqual(calls,[{rpc:'flip_admin_card_browser',
   data:{p_query:'carti',p_rarity:'rare',p_limit:24,p_offset:24}}]);
  assert.equal((await response.json()).total,135);
 });
});
test('Invalid catalog searches are blocked and ordinary players cannot browse admin cards',async()=>{
 let calls=0;
 await withEnv(async()=>{calls++;return Response.json({cards:[]});},async()=>{
  assert.equal((await handleAdminRequest(get(12345,'view=cards_browser&q='+('q'.repeat(81))))).status,400);
  assert.equal((await handleAdminRequest(get(12345,'view=cards_browser&rarity=invalid'))).status,400);
  assert.equal((await handleAdminRequest(get(12345,'view=cards_browser&offset=-1'))).status,400);
  assert.equal((await handleAdminRequest(get(12345,'view=cards_browser&offset=Infinity'))).status,400);
  assert.equal((await handleAdminRequest(get(54321,'view=cards_browser'))).status,403);
  assert.equal(calls,0);
 });
});
test('Player modes are changed only by signed creator and include explicit target in audit',async()=>{
 const calls=[];
 await withEnv(async(url,opts)=>{
  calls.push({name:String(url).split('/').at(-1),payload:JSON.parse(opts.body)});
  return Response.json({ok:true,target_id:'54321',enabled:true,status:{name:'Friend'}});
 },async()=>{
  const lookup=await handleAdminRequest(get(12345,'view=player_modes&recipientId=54321'));
  assert.equal(lookup.status,200);
  for(const kind of ['drop','pack']){
   const response=await handleAdminRequest(post(12345,{
    action:'set_player_unlimited',recipientId:'54321',kind,
    enabled:true,requestId:uuid
   }));
   assert.equal(response.status,200);
  }
  assert.deepEqual(calls,[
   {name:'flip_admin_player_mode_status',payload:{p_admin_id:12345,p_target_id:54321}},
   {name:'flip_admin_set_player_mode',payload:{
    p_admin_id:12345,p_target_id:54321,p_kind:'drop',p_enabled:true,p_request_id:uuid
   }},
   {name:'flip_admin_set_player_mode',payload:{
    p_admin_id:12345,p_target_id:54321,p_kind:'pack',p_enabled:true,p_request_id:uuid
   }}
  ]);
 });
});
test('Creator can revoke friend modes, but a friend cannot change privileges',async()=>{
 let calls=0;
 await withEnv(async(url,opts)=>{
  calls++;assert.equal(JSON.parse(opts.body).p_enabled,false);
  return Response.json({ok:true,enabled:false});
 },async()=>{
  const base={action:'set_player_unlimited',recipientId:'54321',
   kind:'drop',enabled:false,requestId:uuid};
  assert.equal((await handleAdminRequest(post(54321,base))).status,403);
  assert.equal((await handleAdminRequest(post(12345,base))).status,200);
  const invalid=[
   {...base,recipientId:'0'}, {...base,recipientId:'23456',adminId:54321},
   {...base,kind:'free'}, {...base,enabled:'false'}, {...base,requestId:'bad'},
   {...base,recipientId:54321}
  ];
  for(const payload of invalid)
   assert.equal((await handleAdminRequest(post(12345,payload))).status,400);
  assert.equal(calls,1);
 });
});
test('Visual card browser shows actual catalog artwork, a zoom button and an editable basket',()=>{
 const window={FLIPCatalog:{getCard:(artist,release,rarity)=>({
  artist:'Playboi Carti',title:release,rarity,color:rarity,
  art:'./src/assets/'+artist+'/'+release+'/'+rarity+'.webp'
 })}};
 runInNewContext(read('src/scripts/admin-visual.js'),{window});
 const ui=window.FLIPAdminVisual;
 const items=[{id:cid,rarity:'rare',label:'Carti / Die Lit',artist:'Playboi Carti',release:'Die Lit'},
   {id:cid2,rarity:'mythic',label:'Travis / Utopia',artist:'Travis Scott',release:'UTOPIA'}];
 const basket=[{...items[0],quantity:2},{...items[1],quantity:1}];
 const html=ui.grid(items,basket,120,2);
 assert.match(html,/data-admin-preview-card="carti\/die-lit\/rare"/);
 assert.match(html,/data-admin-add-card="travis\/utopia\/mythic"/);
 assert.match(html,/src\/assets\/carti\/die-lit\/rare\.webp/);
 assert.match(html,/ПОКАЗАТЬ ЕЩЁ/);
 assert.match(html,/В КОРЗИНЕ ×2/);
 const cart=ui.cart(basket);
 assert.match(cart,/data-admin-cart-minus/);
 assert.match(cart,/data-admin-cart-plus/);
 assert.match(cart,/data-admin-cart-remove/);
 assert.match(cart,/Playboi Carti/);
});
test('SQL is atomic, audited, bounded, and restricted to the server role',()=>{
 const sql=read('sql/018_flip_v0964_admin_batch_player_modes.sql');
 assert.match(sql,/create table if not exists public\.flip_admin_grant_batches/);
 assert.match(sql,/create table if not exists public\.flip_admin_player_mode_events/);
 assert.match(sql,/jsonb_array_length\(p_cards\) not between 1 and 20/);
 assert.match(sql,/if v_total>20 then raise exception 'BAD_ADMIN_BATCH'/);
 assert.match(sql,/old\.cards<>p_cards/);
 assert.match(sql,/perform public\.flip_admin_grant_card\(/);
 assert.match(sql,/gen_random_uuid\(\)/);
 assert.match(sql,/p_recipient_id for update/);
 assert.match(sql,/p_target_id for update/);
 assert.match(sql,/latest_drop\+interval '4 hours'/);
 assert.match(sql,/new\.packs_today=0|packs_today=0,updated_at=now\(\)/);
 assert.match(sql,/alter table public\.flip_admin_grant_batches enable row level security/);
 assert.match(sql,/alter table public\.flip_admin_player_mode_events enable row level security/);
 assert.match(sql,/from public,anon,authenticated/);
 assert.match(sql,/to service_role/);
 assert.doesNotMatch(sql,/update public\.flip_players set balance=/);
});
test('New admin panel binds card grid and per-player toggles, without changing the owner-only safeguards',()=>{
 const html=read('index.html'),admin=read('src/scripts/admin.js');
 assert.match(html,/src\/scripts\/admin-visual\.js\?v=0\.9\.6\.4/);
 assert.match(html,/src\/scripts\/admin\.js\?v=0\.9\.6\.4/);
 assert.match(html,/src\/styles\/admin-visual\.css\?v=0\.9\.6\.4/);
 assert.match(admin,/data-admin-rarity/);
 assert.match(admin,/data-admin-preview-card/);
 assert.match(admin,/data-admin-modes-recipient/);
 assert.match(admin,/data-admin-modes-self/);
 assert.match(admin,/data-admin-cart-plus/);
 assert.match(admin,/data-admin-cart-minus/);
 assert.match(admin,/action:'set_player_unlimited'/);
 assert.match(admin,/action:s\.rewardKind==='card'\?'grant_cards'/);
 assert.match(admin,/const id=retry\?\.kind===kind&&retry\?\.enabled===enabled&&retry\?\.target===target/);
 assert.equal(JSON.parse(read('package.json')).version,'0.9.6.4');
});
