import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {handleAdminRequest} from '../api/admin.js';

const src=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const token='12345:UNLIMITED_OWNER_TEST',uuid='11111111-1111-4111-8111-111111111111';
function signed(id){
 const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),
   user:JSON.stringify({id,first_name:'Test'})});
 const secret=createHmac('sha256','WebAppData').update(token).digest();
 p.set('hash',createHmac('sha256',secret).update([...p.entries()].sort(([a],[b])=>a.localeCompare(b,'en'))
   .map(([a,b])=>a+'='+b).join('\n')).digest('hex'));
 return p.toString();
}
async function withEnv(fetcher,fn){
 const old=process.env,oldFetch=globalThis.fetch;
 process.env={...old,TELEGRAM_BOT_TOKEN:token,FLIP_ADMIN_TELEGRAM_ID:'12345',
  SUPABASE_URL:'https://flip-test.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_mock'};
 globalThis.fetch=fetcher;
 try{return await fn();}finally{process.env=old;globalThis.fetch=oldFetch;}
}
function post(id,body){
 return new Request('https://flip.test/api/admin',{method:'POST',
 headers:{'x-telegram-init-data':id?signed(id):'','content-type':'application/json'},
 body:JSON.stringify(body)});
}
test('Both permanent modes are restricted to the signed creator ID',async()=>{
 const calls=[];
 await withEnv(async(url,opts)=>{
  calls.push({url:String(url),body:JSON.parse(opts.body)});
  return Response.json({ok:true,enabled:true,cooldowns:{drop_unlimited:true,pack_unlimited:true}});
 },async()=>{
  for(const kind of ['drop','pack']){
   const res=await handleAdminRequest(post(12345,{
    action:'set_unlimited',kind,enabled:true,requestId:uuid}));
   assert.equal(res.status,200);
  }
  assert.deepEqual(calls.map(x=>x.body),[
    {p_admin_id:12345,p_kind:'drop',p_enabled:true,p_request_id:uuid},
    {p_admin_id:12345,p_kind:'pack',p_enabled:true,p_request_id:uuid}
  ]);
  assert.ok(calls.every(x=>x.url.endsWith('/flip_admin_set_unlimited')));
 });
});
test('Disabling sends boolean false and never trusts any external recipient',async()=>{
 const calls=[];
 await withEnv(async(url,opts)=>{calls.push(JSON.parse(opts.body));
  return Response.json({ok:true,enabled:false});},async()=>{
   const result=await handleAdminRequest(post(12345,{
    action:'set_unlimited',kind:'drop',enabled:false,requestId:uuid}));
   assert.equal(result.status,200);
   assert.deepEqual(calls,[{p_admin_id:12345,p_kind:'drop',p_enabled:false,p_request_id:uuid}]);
 });
});
test('Malformed and unauthorized mode changes make no database calls',async()=>{
 let hits=0;
 await withEnv(async()=>{hits++;throw Error('Should not call SQL');},async()=>{
  const base={action:'set_unlimited',kind:'drop',enabled:true,requestId:uuid};
  assert.equal((await handleAdminRequest(post(null,base))).status,401);
  assert.equal((await handleAdminRequest(post(54321,base))).status,403);
  for(const bad of [
   {...base,telegram_id:54321},{...base,recipientId:'54321'},
   {...base,p_admin_id:54321},{...base,kind:'both'},
   {...base,enabled:'true'},{...base,enabled:null},{...base,requestId:'oops'}
  ])assert.equal((await handleAdminRequest(post(12345,bad))).status,400);
  assert.equal(hits,0);
 });
});
test('SQL maintains unlimited counters without editing drop, pack, or currency awards',()=>{
 const sql=src('sql/014_flip_v0944_owner_unlimited_modes.sql');
 assert.match(sql,/create table if not exists public\.flip_admin_play_modes/);
 assert.match(sql,/unlimited_drop boolean not null default false/);
 assert.match(sql,/unlimited_packs boolean not null default false/);
 assert.match(sql,/before update of drop_ready_at,pack_day,packs_today/);
 assert.match(sql,/new\.drop_ready_at=now\(\)-interval '1 second'/);
 assert.match(sql,/new\.packs_today=0/);
 assert.match(sql,/p_admin_id for update/);
 assert.match(sql,/latest_drop\+interval '4 hours'/);
 assert.match(sql,/request_id uuid primary key/);
 assert.match(sql,/revoke all on public\.flip_admin_play_modes/);
 assert.match(sql,/to service_role/);
 assert.match(sql,/'unlimited_packs',coalesce/);
 assert.doesNotMatch(sql,/update public\.flip_players set balance=/);
 assert.doesNotMatch(sql,/update public\.flip_players set pity_misses=/);
});
test('Preview button exists only for authenticated owner and has a second click guard',()=>{
 const app=src('src/scripts/app.js');
 assert.ok(app.includes('live()&&bridge?.isAdmin===true ? '));
 assert.ok(app.includes("if(!live()||bridge?.isAdmin!==true)return;"));
 assert.ok(app.includes("e.target.closest('#dropPreviewBtn')&&live()&&bridge?.isAdmin===true"));
 assert.doesNotMatch(app,/function previewRoulette\(\)\{\s*if\(window\.FLIPReveal/);
});
test('Owner UI toggles and game state reflect permanent mode, with cache busting',()=>{
 const html=src('index.html'),app=src('src/scripts/app.js'),
  server=src('src/scripts/server.js'),admin=src('src/scripts/admin.js');
 assert.ok(admin.includes('data-admin-set-unlimited="drop"'));
 assert.ok(admin.includes('data-admin-set-unlimited="pack"'));
 assert.ok(admin.includes("action:'set_unlimited',kind,enabled,requestId:id"));
 assert.ok(admin.includes("new Event('flip-admin-self-changed')"));
 assert.ok(server.includes("unlimitedPacks:snapshot.unlimited_packs===true"));
 assert.ok(server.includes("unlimitedDrop:snapshot.unlimited_drop===true"));
 assert.ok(src('src/scripts/store.js').includes('unlimitedPacks===true'));
 assert.ok(html.includes('src/scripts/admin.js?v=0.9.4.4'));
 for(const x of ['app.js','server.js'])
  assert.ok(html.includes('src/scripts/'+x+'?v=0.9.5'));
 assert.ok(html.includes('src/styles/admin.css?v=0.9.4.4'));
 assert.ok(html.includes('FLIP v0.9.5 · TELEGRAM GAME'));
});
