import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {handleRequest} from '../api/flip.js';
import {handleSocialRequest} from '../api/social.js';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const token='12345:FLIP_V096_TEST_BOT';
const pub='11111111-1111-4111-8111-111111111111';
const reqid='22222222-2222-4222-8222-222222222222';
function signed(id){
 const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),
   user:JSON.stringify({id,first_name:'Player'})});
 const key=createHmac('sha256','WebAppData').update(token).digest();
 p.set('hash',createHmac('sha256',key).update([...p.entries()]
  .sort(([a],[b])=>a.localeCompare(b,'en')).map(([a,b])=>a+'='+b).join('\n')).digest('hex'));
 return p.toString();
}
async function withEnv(fetcher,fn){
 const old=process.env,prev=globalThis.fetch;
 process.env={...old,TELEGRAM_BOT_TOKEN:token,
  SUPABASE_URL:'https://flip-test.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_mock'};
 globalThis.fetch=(url,options)=>String(url).endsWith('/rpc/flip_player_is_banned')?
      Response.json(false):fetcher(url,options);
 try{return await fn();}finally{process.env=old;globalThis.fetch=prev;}
}
const read=(id,query)=>new Request('https://flip.test/api/flip'+query,
 {headers:id?{'x-telegram-init-data':signed(id)}:{}});
const post=(id,body)=>new Request('https://flip.test/api/flip',{
 method:'POST',headers:id?{'x-telegram-init-data':signed(id),'content-type':'application/json'}:
  {'content-type':'application/json'},
 body:JSON.stringify({requestId:reqid,...body})
});
test('Private hub uses only verified Telegram identity',async()=>{
 const calls=[];
 const snapshot={unread_count:1,notifications:[],activity:[],stats:{drops:5},rewards_ready:0};
 await withEnv(async(url,opts)=>{
  calls.push({name:String(url).split('/').at(-1),payload:JSON.parse(opts.body)});
  return Response.json(snapshot);
 },async()=>{
  const r=await handleRequest(read(45678,'?hub=1&telegram_id=999999'));
  assert.equal(r.status,200);
  assert.deepEqual(await r.json(),snapshot);
  assert.deepEqual(calls,[{name:'flip_event_snapshot',payload:{p_telegram_id:45678}}]);
 });
});
test('Only signed owner can mark own event read; client cannot override scope',async()=>{
 const calls=[];
 await withEnv(async(url,opts)=>{
  calls.push({name:String(url).split('/').at(-1),payload:JSON.parse(opts.body)});
  return Response.json({ok:true,updated:1,unread_count:0});
 },async()=>{
  let r=await handleRequest(post(45678,{action:'mark_events_read',eventId:23}));
  assert.equal(r.status,200);
  r=await handleRequest(post(45678,{action:'mark_events_read',all:true}));
  assert.equal(r.status,200);
  assert.deepEqual(calls,[
   {name:'flip_event_mark_read',payload:{p_telegram_id:45678,p_event_id:23}},
   {name:'flip_event_mark_read',payload:{p_telegram_id:45678,p_event_id:null}}
  ]);
 });
});
test('Forged player scope, malformed event ID and unsigned requests never reach SQL',async()=>{
 let hits=0;
 await withEnv(async()=>{hits++;throw Error('unexpected RPC');},async()=>{
  const cases=[
   {action:'mark_events_read',eventId:'23'},
   {action:'mark_events_read',eventId:-1},
   {action:'mark_events_read',all:true,eventId:4},
   {action:'mark_events_read',all:false},
   {action:'mark_events_read',all:true,telegram_id:999},
   {action:'mark_events_read',eventId:3,p_telegram_id:999}
  ];
  for(const body of cases){
   const r=await handleRequest(post(45678,body));
   assert.equal(r.status,400,JSON.stringify(body));
  }
  assert.equal((await handleRequest(read(null,'?hub=1'))).status,401);
  assert.equal((await handleRequest(post(null,{action:'mark_events_read',all:true}))).status,401);
  assert.equal(hits,0);
 });
});
test('Public player statistics use opaque UUID, never caller-provided Telegram ID',async()=>{
 const calls=[];
 await withEnv(async(url,opts)=>{
  const name=String(url).split('/').at(-1);
  if(name==='flip_public_profile')return Response.json({public_id:pub,level:5,slots:[],badges:[]});
  if(name==='flip_public_profile_stats'){
   calls.push(JSON.parse(opts.body));return Response.json({drops:5,packs:3,trades:2});
  }
  if(name==='flip_public_avatar_target')return Response.json(null);
  throw Error('Unknown RPC '+name);
 },async()=>{
  const response=await handleRequest(read(12345,'?profile='+pub+'&telegram_id=999'));
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.stats.drops,5);
  assert.ok(!('telegram_id' in body));
  assert.deepEqual(calls,[{p_public_id:pub}]);
 });
});
test('Trade listing includes public partner profile ID without adding extra private data',async()=>{
 const calls=[];
 await withEnv(async(url,opts)=>{
  const name=String(url).split('/').at(-1);
  calls.push(name);
  if(name==='flip_trade_list')return Response.json([{
   id:reqid,status:'pending',sender_id:12345,recipient_id:999,
   sender_username:'sender',recipient_username:'recipient'
  }]);
  if(name==='flip_profile_directory'){
   assert.deepEqual(JSON.parse(opts.body).p_player_ids,[12345,999]);
   return Response.json([{telegram_id:'999',public_id:pub}]);
  }
  throw Error('unknown rpc');
 },async()=>{
  const response=await handleSocialRequest(new Request('https://flip.test/api/social?view=trades',{
   headers:{'x-telegram-init-data':signed(12345)}
  }));
  assert.equal(response.status,200);
  const data=await response.json();
  assert.equal(data.trades[0].partner_public_id,pub);
  assert.equal(data.trades[0].mine,true);
  assert.deepEqual(calls,['flip_trade_list','flip_profile_directory']);
 });
});
test('The inbox renders safely, handles unread badges and links to actual destinations',()=>{
 const window={FLIPCatalog:{getCard:()=>({artist:'Artist',title:'Record'})}};
 runInNewContext(source('src/scripts/activity.js'),{window});
 const ui=window.FLIPActivity;
 const hub={unread_count:1,rewards_ready:2,notifications:[
  {id:12,kind:'trade_offer',created_at:'2026-11-16T02:00:00Z',read:false,
   partner_name:'<script>alert(1)</script>',partner_public_id:pub,details:{}}
 ],activity:[],stats:{drops:10,packs:5,trades:2,achievements:3,owned_cards:15,
   unique_cards:12}};
 const html=ui.notifications(hub,{online:true});
 assert.match(html,/data-event-read="12"/);
 assert.match(html,/data-event-route="trades"/);
 assert.match(html,/data-event-route="achievements"/);
 assert.match(html,/data-event-read-all/);
 assert.doesNotMatch(html,/<script>/);
 assert.match(html,/&lt;script&gt;/);
 assert.match(ui.profileStats(hub.stats,{online:true}),/ИСТОРИЯ АКТИВНОСТИ/);
 assert.match(ui.activityPage(hub,{online:true}),/Эту историю видишь только ты/);
 assert.match(ui.notifications(null,{online:false}),/входа через Telegram/);
});
test('Event ledger is private, backfills history as read and supports real database triggers',()=>{
 const sql=source('sql/016_flip_v096_activity_notifications.sql');
 assert.match(sql,/create table if not exists public\.flip_user_events/);
 assert.match(sql,/is_notification boolean not null default false/);
 assert.match(sql,/after insert or update of status on public\.flip_trades/);
 assert.match(sql,/after insert on public\.flip_actions/);
 assert.match(sql,/after insert on public\.flip_achievement_claims/);
 assert.match(sql,/read_at,now\(\)/);
 assert.match(sql,/where e\.telegram_id=p_telegram_id/);
 assert.match(sql,/where telegram_id=p_telegram_id and is_notification/);
 assert.match(sql,/flip_public_profile_stats\(p_public_id uuid\)/);
 assert.match(sql,/revoke all on public\.flip_user_events/);
 assert.match(sql,/to service_role/);
 assert.doesNotMatch(sql,/grant select on public\.flip_user_events to authenticated/);
});
test('Static placeholder alerts are gone and UI refreshes after trades and on focus',()=>{
 const html=source('index.html'),app=source('src/scripts/app.js'),
   trades=source('src/scripts/trades.js'),bridge=source('src/scripts/server.js');
 assert.ok(html.includes('id="flip-notifications-body"'));
 assert.doesNotMatch(html,/NEW COLLECTION: свежий релиз/);
 assert.ok(html.includes('activity.js?v=0.9.8'));
 assert.match(app,/setInterval\(\(\)=>\{/);
 assert.match(app,/45000/);
 assert.match(app,/flip-trade-changed/);
 assert.match(app,/data-event-read-all/);
 assert.match(bridge,/bridge\.markEventsRead=async/);
 assert.match(bridge,/bridge\.refreshHub=async/);
 assert.match(trades,/data-player-profile/);
});
