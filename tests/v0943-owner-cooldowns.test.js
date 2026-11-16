import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {handleAdminRequest} from '../api/admin.js';

const src=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const token='12345:FLIP_OWNER_COOLDOWNS_TEST';
const uuid='11111111-1111-4111-8111-111111111111';
const fakeState={
  drop_ready_at:'2026-11-16T12:00:00Z',drop_ready:false,
  packs_today:9,packs_limit:10,welcome_remaining:0,history:[]
};
function signed(id){
 const params=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),
   user:JSON.stringify({id,first_name:'Player'})});
 const key=createHmac('sha256','WebAppData').update(token).digest();
 params.set('hash',createHmac('sha256',key).update([...params.entries()]
   .sort(([a],[b])=>a.localeCompare(b,'en'))
   .map(([k,v])=>k+'='+v).join('\n')).digest('hex'));
 return params.toString();
}
const get=(id,view='cooldowns')=>new Request(
 'https://flip.test/api/admin?view='+view,
 {headers:id?{'x-telegram-init-data':signed(id)}:{}});
const post=(id,body)=>new Request('https://flip.test/api/admin',{
 method:'POST',headers:{'x-telegram-init-data':signed(id),'content-type':'application/json'},
 body:JSON.stringify(body)});
async function withEnv(fetcher,fn){
 const originalEnv=process.env,originalFetch=globalThis.fetch;
 process.env={...originalEnv,TELEGRAM_BOT_TOKEN:token,
   FLIP_ADMIN_TELEGRAM_ID:'12345',SUPABASE_URL:'https://flip-test.supabase.co',
   SUPABASE_SECRET_KEY:'sb_secret_mock'};
 globalThis.fetch=fetcher;
 try{return await fn();}finally{process.env=originalEnv;globalThis.fetch=originalFetch;}
}
test('Cooldown controls reject all normal users before any database call',async()=>{
 let dbRequests=0;
 await withEnv(async()=>{dbRequests++;throw Error('Forbidden database access');},async()=>{
   assert.equal((await handleAdminRequest(get(null))).status,401);
   assert.equal((await handleAdminRequest(get(55555))).status,403);
   assert.equal((await handleAdminRequest(post(55555,{action:'reset_cooldown',
     kind:'drop',requestId:uuid}))).status,403);
   assert.equal(dbRequests,0);
 });
});
test('GET status is private and scoped to the signed owner',async()=>{
 const calls=[];
 await withEnv(async(url,opts)=>{
   calls.push({url:String(url),body:JSON.parse(opts.body)});
   return Response.json(fakeState);
 },async()=>{
   const response=await handleAdminRequest(get(12345));
   assert.equal(response.status,200);
   assert.deepEqual((await response.json()).cooldowns,fakeState);
   assert.equal(calls.length,1);
   assert.match(calls[0].url,/flip_admin_cooldown_status$/);
   assert.deepEqual(calls[0].body,{p_admin_id:12345});
 });
});
test('Both resets target only signed creator, never client supplied player ID',async()=>{
 const calls=[];
 await withEnv(async(url,opts)=>{
   calls.push({url:String(url),body:JSON.parse(opts.body)});
   return Response.json({ok:true,cooldowns:{...fakeState,packs_today:0,drop_ready:true}});
 },async()=>{
   for(const kind of ['drop','pack']){
     const res=await handleAdminRequest(post(12345,{
       action:'reset_cooldown',kind,requestId:uuid
     }));
     assert.equal(res.status,200);
   }
   assert.equal(calls.length,2);
   assert.deepEqual(calls[0].body,{
     p_admin_id:12345,p_kind:'drop',p_request_id:uuid
   });
   assert.deepEqual(calls[1].body,{
     p_admin_id:12345,p_kind:'pack',p_request_id:uuid
   });
   assert.match(calls[0].url,/flip_admin_reset_cooldown$/);
 });
});
test('Cooldown API rejects arbitrary recipients, malformed kinds and request IDs',async()=>{
 let hits=0;
 await withEnv(async()=>{hits++;throw Error('Unexpected database access');},async()=>{
   const bad=[
     {action:'reset_cooldown',kind:'both',requestId:uuid},
     {action:'reset_cooldown',kind:'drop',requestId:'invalid'},
     {action:'reset_cooldown',kind:'pack',requestId:uuid,recipientId:'55555'},
     {action:'reset_cooldown',kind:'drop',requestId:uuid,p_admin_id:55555},
     {action:'reset_cooldown',kind:'pack',requestId:uuid,telegram_id:55555},
   ];
   for(const body of bad){
     const res=await handleAdminRequest(post(12345,body));
     assert.equal(res.status,400,JSON.stringify(body));
   }
   assert.equal(hits,0);
 });
});
test('Reset is idempotent and never awards cards, currency, or welcome drops',()=>{
 const sql=src('sql/013_flip_v0943_owner_cooldowns.sql');
 assert.match(sql,/request_id uuid primary key/);
 assert.match(sql,/where telegram_id=p_admin_id for update/);
 assert.match(sql,/if previous\.admin_telegram_id<>p_admin_id or previous\.kind<>p_kind/);
 assert.match(sql,/p\.drop_ready_at,p\.pack_day,p\.packs_today/);
 assert.match(sql,/drop_ready_at=now\(\)-interval '1 second'/);
 assert.match(sql,/pack_day=today_msk,packs_today=0/);
 assert.match(sql,/flip_admin_cooldown_status\(p_admin_id\)/);
 assert.match(sql,/revoke all on public\.flip_admin_cooldown_resets/);
 assert.match(sql,/to service_role/);
 assert.doesNotMatch(sql,/balance\s*=/);
 assert.doesNotMatch(sql,/pity_misses\s*=/);
 assert.doesNotMatch(sql,/bonus_packs\s*=/);
 assert.doesNotMatch(sql,/welcome_remaining\s*=/);
});
test('Developer cooldown controls are owner-only and preserve Moscow status',()=>{
 const html=src('index.html'),admin=src('src/scripts/admin.js'),app=src('src/scripts/app.js');
 assert.match(admin,/data-admin-set-unlimited="drop"/);
 assert.match(admin,/data-admin-set-unlimited="pack"/);
 assert.match(admin,/call\('cooldowns'\)/);
 assert.match(admin,/action:'set_unlimited',kind,enabled,requestId:id/);
 assert.match(admin,/flip-admin-self-changed/);
 assert.match(admin,/window\.confirm/);
 assert.match(admin,/timeZone:'Europe\/Moscow'/);
 assert.doesNotMatch(app,/data-admin-set-unlimited/);
 assert.match(html,/src\/scripts\/admin\.js\?v=0\.9\.4\.4/);
 assert.match(html,/src\/styles\/admin\.css\?v=0\.9\.4\.4/);
});
