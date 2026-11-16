import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {handleRequest} from '../api/flip.js';

const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const token='123456:TEST_BOT_TOKEN';
const state={balance:60,xp:0,level:1,inventory:[],discovered:[]};
const sampleTasks={daily:[{scope:'daily',slot:1,type:'default',version:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  title:'Открой дроп',ready:false,claimed:false,rerollable:true}],
  weekly:[],streak:{days:7,unclaimed:1,grace_used:false}};
function signed(id){
  const params=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),
    user:JSON.stringify({id,first_name:'Player'})});
  const key=createHmac('sha256','WebAppData').update(token).digest();
  params.set('hash',createHmac('sha256',key).update([...params.entries()]
    .sort(([a],[b])=>a.localeCompare(b,'en')).map(([a,b])=>a+'='+b).join('\n')).digest('hex'));
  return params.toString();
}
async function setup(mock,cb){
  const oldEnv=process.env, oldFetch=globalThis.fetch;
  process.env={...oldEnv,TELEGRAM_BOT_TOKEN:token,
    SUPABASE_URL:'https://flip-test.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_mock'};
  globalThis.fetch=(url,opts)=>
   String(url).endsWith('/rpc/flip_player_is_banned')?Response.json(false):mock(url,opts);
  try{return await cb();}finally{process.env=oldEnv;globalThis.fetch=oldFetch;}
}
const post=(action,id,more={})=>new Request('https://flip.test/api/flip',{
 method:'POST',headers:{'x-telegram-init-data':signed(id),'content-type':'application/json'},
 body:JSON.stringify({action,requestId:'11111111-1111-4111-8111-111111111111',...more})
});
test('Reroll and streak claim authorize only signed Telegram user identity',async()=>{
 const calls=[];
 const mock=async(url,options)=>{
  const name=String(url).split('/').at(-1),args=JSON.parse(options.body);
  calls.push({name,args});
  if(name==='flip_reroll_task')return Response.json({ok:true,tasks:sampleTasks});
  if(name==='flip_claim_streak')return Response.json({ok:true,earned_f:100,state,tasks:sampleTasks});
  throw Error('Unexpected RPC: '+name);
 };
 await setup(mock,async()=>{
  const reroll=await handleRequest(post('reroll_task',789,{scope:'daily',slot:2,
    p_telegram_id:999,player_id:999,owner:true}));
  assert.equal(reroll.status,200);
  const claim=await handleRequest(post('claim_streak',789,{telegram_id:999,earned_f:9999}));
  assert.equal(claim.status,200);
  assert.equal((await claim.json()).earned_f,100);
  assert.equal(calls[0].name,'flip_reroll_task');
  assert.deepEqual(calls[0].args,{p_telegram_id:789,p_scope:'daily',p_slot:2});
  assert.equal(calls[1].name,'flip_claim_streak');
  assert.deepEqual(calls[1].args,{p_telegram_id:789});
 });
});
test('Malformed reroll parameters and missing Telegram auth cannot reach database',async()=>{
 let hits=0;
 await setup(async()=>{hits++;throw Error('Should not call SQL');},async()=>{
  const bad=await handleRequest(post('reroll_task',21,{scope:'daily',slot:20}));
  assert.equal(bad.status,400);
  const noAuth=await handleRequest(new Request('https://flip.test/api/flip',{
    method:'POST',body:JSON.stringify({action:'claim_streak',
      requestId:'11111111-1111-4111-8111-111111111111'})}));
  assert.equal(noAuth.status,401);
  assert.equal(hits,0);
 });
});
test('Signed player bootstraps before streak touch and task assignment',async()=>{
 const calls=[];
 const mock=async(url,options)=>{
  const name=String(url).split('/').at(-1),args=JSON.parse(options.body);
  calls.push({name,args});
  if(name==='flip_bootstrap'||name==='flip_snapshot')return Response.json(state);
  if(name==='flip_streak_touch')return Response.json({days:1,unclaimed:0});
  if(name==='flip_task_snapshot')return Response.json(sampleTasks);
  if(name==='flip_showcase_own')return Response.json({public_id:'11111111-1111-4111-8111-111111111111',slots:[]});
  if(name==='flip_profile_cosmetics_shop')return Response.json({items:[],owned:[],slot_count:3});
  if(name==='flip_achievement_snapshot')return Response.json({items:[],badges:[],total:30,completed:0,claimable:0});
  if(name==='flip_public_catalog')return Response.json({artists:[],releases:[],cards:[]});
  throw Error('Unexpected RPC: '+name);
 };
 await setup(mock,async()=>{
  const response=await handleRequest(new Request('https://flip.test/api/flip',{
    headers:{'x-telegram-init-data':signed(321)}}));
  assert.equal(response.status,200);
  const payload=await response.json();
  assert.equal(payload.tasks.streak.days,7);
  assert.equal(calls[0].name,'flip_bootstrap');
  assert.equal(calls[1].name,'flip_streak_touch');
  assert.equal(calls[1].args.p_telegram_id,321);
  assert.equal(calls[2].name,'flip_snapshot');
 });
});
test('Tasks are fixed 3+3 slots; owner subscriptions cannot be replaced by players',()=>{
 const sql=source('sql/009_flip_v092_tasks_activity.sql');
 const app=source('src/scripts/app.js'),browser=source('src/scripts/server.js');
 assert.match(sql,/primary key\(telegram_id,scope,slot,period_start\)/);
 assert.match(sql,/primary key\(telegram_id,scope,period_start\)/);
 assert.match(sql,/TASK_REROLL_USED/);
 assert.match(sql,/TASK_REROLL_FORBIDDEN/);
 assert.match(sql,/t\.kind='subscription' and \(t\.ends_at is null or t\.ends_at>now\(\)\)/);
 assert.match(sql,/streak_last_day=today_msk/);
 assert.match(sql,/next_days=7/);
 assert.match(sql,/streak_unclaimed=streak_unclaimed-1/);
 assert.match(sql,/streak_grace_used/);
 assert.match(sql,/status='accepted'/);
 assert.match(app,/flip-task-reroll/);
 assert.match(app,/flip-streak-days/);
 assert.match(app,/data-streak-claim/);
 assert.match(browser,/bridge\.rerollTask/);
 assert.match(browser,/bridge\.claimStreak/);
});
