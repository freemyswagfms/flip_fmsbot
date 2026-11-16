import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {handleRequest} from '../api/flip.js';

const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const token='12345:FLIP_SHOWCASE_TEST';
const publicId='11111111-1111-4111-8111-111111111111';
const owned='carti/die-lit/mythic',hidden='carti/die-lit/hidden';
function signed(id){
 const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),
   user:JSON.stringify({id,first_name:'Player'})});
 const secret=createHmac('sha256','WebAppData').update(token).digest();
 p.set('hash',createHmac('sha256',secret).update([...p.entries()]
   .sort(([a],[b])=>a.localeCompare(b,'en'))
   .map(([k,v])=>k+'='+v).join('\n')).digest('hex'));
 return p.toString();
}
async function withEnv(fetcher,fn){
 const env=process.env,oldFetch=globalThis.fetch;
 process.env={...env,TELEGRAM_BOT_TOKEN:token,
  SUPABASE_URL:'https://flip-test.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_mock'};
 globalThis.fetch=(url,options)=>String(url).endsWith('/rpc/flip_player_is_banned')?
      Response.json(false):fetcher(url,options);
 try{return await fn();}finally{process.env=env;globalThis.fetch=oldFetch}
}
const post=(id,body)=>new Request('https://flip.test/api/flip',{
 method:'POST',headers:{'x-telegram-init-data':signed(id),'content-type':'application/json'},
 body:JSON.stringify({requestId:'11111111-1111-4111-8111-111111111111',...body})
});
test('Showcase slot mutation trusts only signed Telegram identity, not a forged owner',async()=>{
 const calls=[];
 await withEnv(async(url,options)=>{
  calls.push({name:String(url).split('/').at(-1),body:JSON.parse(options.body)});
  return Response.json({ok:true,profile:{public_id:publicId,slots:[]}});
 },async()=>{
  const r=await handleRequest(post(123,{
   action:'set_showcase',slot:2,cardId:owned,
   telegram_id:999,p_telegram_id:999,owner:999,ranked_count:999
  }));
  assert.equal(r.status,200);
  assert.deepEqual(calls,[{name:'flip_showcase_set',
    body:{p_telegram_id:123,p_slot:2,p_card_id:owned}}]);
 });
});
test('Removal uses explicit null; malformed slot and art ID never reach database',async()=>{
 let hits=0;
 await withEnv(async(url,options)=>{
  hits++;
  return Response.json({ok:true,profile:{slots:[]}});
 },async()=>{
  const cases=[
   {action:'set_showcase',slot:7,cardId:owned},
   {action:'set_showcase',slot:0,cardId:null},
   {action:'set_showcase',slot:1,cardId:'carti/../hidden'},
   {action:'set_showcase',slot:1,cardId:'javascript:alert(1)'},
   {action:'set_showcase',slot:2,cardId:42},
  ];
  for(const body of cases)assert.equal((await handleRequest(post(123,body))).status,400);
  assert.equal(hits,0);
  const r=await handleRequest(post(123,{action:'set_showcase',slot:2,cardId:null}));
  assert.equal(r.status,200);assert.equal(hits,1);
 });
});
test('Unsigned requests cannot read public profiles or manipulate showcase',async()=>{
 let hits=0;
 await withEnv(async()=>{hits++;throw Error('unexpected RPC');},async()=>{
  const noAuth=await handleRequest(new Request('https://flip.test/api/flip?profile='+publicId));
  assert.equal(noAuth.status,401);
  const bad=await handleRequest(new Request('https://flip.test/api/flip?profile=not-a-uuid',{
    headers:{'x-telegram-init-data':signed(123)}}));
  assert.equal(bad.status,400);
  const fake=await handleRequest(new Request('https://flip.test/api/flip',{
    method:'POST',body:JSON.stringify({action:'set_showcase',slot:1,cardId:owned,
      requestId:'11111111-1111-4111-8111-111111111111'})}));
  assert.equal(fake.status,401);assert.equal(hits,0);
 });
});
test('Public profile read is UUID-scoped and does not return wallet state',async()=>{
 const calls=[];
 await withEnv(async(url,options)=>{
  const name=String(url).split('/').at(-1);
  calls.push({name,body:JSON.parse(options.body)});
  if(name==='flip_public_avatar_target')return Response.json(null);
  if(name==='flip_public_profile_stats')return Response.json({drops:2,packs:3,trades:0});
  return Response.json({public_id:publicId,level:4,cp:55,slots:[],badges:[]});
 },async()=>{
  const r=await handleRequest(new Request('https://flip.test/api/flip?profile='+publicId,{
    headers:{'x-telegram-init-data':signed(891)}}));
  assert.equal(r.status,200);
  const json=await r.json();
  assert.equal(json.public_id,publicId);
  assert.ok(!('balance' in json));
  assert.deepEqual(calls,[{name:'flip_public_profile',body:{p_public_id:publicId}},
    {name:'flip_public_profile_stats',body:{p_public_id:publicId}},
    {name:'flip_public_avatar_target',body:{p_public_id:publicId}}]);
 });
});
test('Showcase model only offers ranked copies and renders unique Hidden frame',()=>{
 const window={FLIPCatalog:{getCard:(a,r,rarity)=>({
  id:[a,r,rarity].join('/'),artist:'Playboi Carti',title:'Die Lit',
  rarity:rarity.toUpperCase(),color:rarity,art:'./src/assets/demo.webp'})}};
 runInNewContext(source('src/scripts/showcase.js'),{window});
 const module=window.FLIPShowcase;
 const state={received:[
  {id:owned,color:'mythic',rarity:'Mythic',artist:'Playboi Carti',title:'Die Lit',isTestCopy:false},
  {id:owned,color:'mythic',rarity:'Mythic',artist:'Playboi Carti',title:'Die Lit',isTestCopy:true},
  {id:hidden,color:'hidden',rarity:'Hidden',artist:'Playboi Carti',title:'Die Lit',isTestCopy:false},
  {id:'carti/music/common',color:'common',rarity:'Common',artist:'Playboi Carti',
    title:'Music',isTestCopy:true}
 ]};
 const cards=module.cardsFromState(state);
 assert.deepEqual(Array.from(cards,c=>c.id),[hidden,owned]);
 const profile={public_id:publicId,slots:[
  {slot:1,card_id:hidden,rarity:'hidden'},
  {slot:2,card_id:owned,rarity:'mythic'},
  {slot:3,card_id:null,rarity:null}
 ]};
 const own=module.own(profile,{online:true});
 assert.match(own,/flip-hidden-frame/);
 assert.match(own,/flip-showcase-mythic/);
 assert.match(own,/data-showcase-slot="3"/);
 const editor=module.editor(state,profile,1);
 assert.match(editor,/data-showcase-pick="carti\/die-lit\/hidden"/);
 assert.doesNotMatch(editor,/data-showcase-pick="carti\/music\/common"/);
 const pub=module.publicPage({...profile,username:'carti',level:8,cp:150,
   ranked_cards:2,ranked_variants:2,badges:[]});
 assert.match(pub,/@carti/);
 assert.match(pub,/150 CP/);
 assert.doesNotMatch(pub,/data-showcase-slot=/);
});
test('Database rules protect public identifiers, ownership, and stale pins',()=>{
 const sql=source('sql/011_flip_v094_showcase_profiles.sql');
 assert.match(sql,/public_id uuid not null default gen_random_uuid/);
 assert.match(sql,/unique\(telegram_id,card_id\)/);
 assert.match(sql,/p_slot not between 1 and 3/);
 assert.match(sql,/coalesce\(v_quantity,0\)<=0/);
 assert.match(sql,/SHOWCASE_NOT_OWNED/);
 assert.match(sql,/after update of ranked_quantity or delete/);
 assert.match(sql,/inv\.ranked_quantity>0/);
 assert.match(sql,/flip_cp_total/);
 assert.doesNotMatch(sql,/jsonb_build_object\('telegram_id',p\.telegram_id/);
 assert.match(sql,/revoke all on public\.flip_showcase_slots/);
 assert.match(sql,/to service_role/);
 assert.match(source('src/styles/showcase.css'),/flip-showcase-hidden\.flip-hidden-frame::after/);
 assert.match(source('src/styles/showcase.css'),/flip-showcase-mythic::before/);
 assert.match(source('src/scripts/leaderboard.js'),/data-player-profile/);
});
