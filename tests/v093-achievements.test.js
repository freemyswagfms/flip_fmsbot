import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {handleRequest} from '../api/flip.js';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const token='123456:ACHIEVEMENTS_TEST';
const state={balance:100,xp:10,level:2,inventory:[],discovered:[]};
const achievements={total:30,completed:0,claimable:1,badges:[],items:[
  {code:'first_steps',stage:1,title:'Первые шаги',category:'oneoff',
    description:'Достигни 2-го уровня',progress:2,target:2,
    reward_f:30,claimable:true,total_stages:1,claimed_stages:0,completed:false}
]};
function signed(id){
 const params=new URLSearchParams({
   auth_date:String(Math.floor(Date.now()/1000)),
   user:JSON.stringify({id,first_name:'Test'})
 });
 const secret=createHmac('sha256','WebAppData').update(token).digest();
 params.set('hash',createHmac('sha256',secret).update([...params.entries()]
   .sort(([a],[b])=>a.localeCompare(b,'en'))
   .map(([a,b])=>a+'='+b).join('\n')).digest('hex'));
 return params.toString();
}
async function mockServer(fetcher,fn){
 const prev=process.env,old=globalThis.fetch;
 process.env={...prev,SUPABASE_URL:'https://flip-test.supabase.co',
   SUPABASE_SECRET_KEY:'sb_secret_mock',TELEGRAM_BOT_TOKEN:token};
 globalThis.fetch=(url,options)=>String(url).endsWith('/rpc/flip_player_is_banned')?
      Response.json(false):fetcher(url,options);
 try{return await fn();}finally{process.env=prev;globalThis.fetch=old}
}
const post=(action,id,args={})=>new Request('https://flip.app/api/flip',{
 method:'POST',headers:{'x-telegram-init-data':signed(id),'content-type':'application/json'},
 body:JSON.stringify({action,requestId:'11111111-2222-4333-8444-555555555555',...args})
});
test('Claim uses signed Telegram ID only; reward amount never comes from client',async()=>{
 const calls=[];
 const mock=async(url,opts)=>{
  const rpc=String(url).split('/').at(-1);
  calls.push({rpc,payload:JSON.parse(opts.body)});
  assert.equal(rpc,'flip_claim_achievement');
  return Response.json({ok:true,earned_f:30,state,achievements});
 };
 await mockServer(mock,async()=>{
  const res=await handleRequest(post('claim_achievement',891,{
   code:'first_steps',stage:1,
   telegram_id:22,p_telegram_id:22,reward_f:100000,progress:999
  }));
  assert.equal(res.status,200);
  const json=await res.json();
  assert.equal(json.earned_f,30);
  assert.deepEqual(calls[0].payload,{
   p_telegram_id:891,p_code:'first_steps',p_stage:1
  });
 });
});
test('Claim refuses malformed stages/codes, unauthenticated callers never touch RPC',async()=>{
 let hits=0;
 await mockServer(async()=>{hits++;throw Error('Unexpected database access');},async()=>{
  const bad=await handleRequest(post('claim_achievement',891,{code:'not allowed ',stage:1}));
  assert.equal(bad.status,400);
  const badStage=await handleRequest(post('claim_achievement',891,{code:'first_steps',stage:7}));
  assert.equal(badStage.status,400);
  const noAuth=await handleRequest(new Request('https://flip.app/api/flip',{
    method:'POST',body:JSON.stringify({action:'claim_achievement',code:'first_steps',stage:1,
      requestId:'11111111-2222-4333-8444-555555555555'})
  }));
  assert.equal(noAuth.status,401);
  assert.equal(hits,0);
 });
});
test('Achievement snapshot GET uses verified Telegram ID without touching game state',async()=>{
 const calls=[];
 await mockServer(async(url,opts)=>{
  calls.push({rpc:String(url).split('/').at(-1),payload:JSON.parse(opts.body)});
  return Response.json(achievements);
 },async()=>{
  const res=await handleRequest(new Request('https://flip.app/api/flip?achievements=1',{
    headers:{'x-telegram-init-data':signed(666)}
  }));
  assert.equal(res.status,200);
  assert.equal((await res.json()).total,30);
  assert.deepEqual(calls,[{rpc:'flip_achievement_snapshot',payload:{p_telegram_id:666}}]);
 });
});
test('All 30 agreed achievements plus invisible Hidden have guarded payouts',()=>{
 const sql=source('sql/010_flip_v093_achievements.sql');
 const rows=sql.match(/^ \('[a-z_]+','(?:oneoff|staged|secret|hidden)'/gm)||[];
 assert.equal(rows.length,31);
 assert.equal((sql.match(/^ \('[a-z_]+','oneoff'/gm)||[]).length,20);
 assert.equal((sql.match(/^ \('[a-z_]+','staged'/gm)||[]).length,7);
 assert.equal((sql.match(/^ \('[a-z_]+','secret'/gm)||[]).length,3);
 assert.equal((sql.match(/^ \('[a-z_]+','hidden'/gm)||[]).length,1);
 assert.match(sql,/Невозможное возможно/);
 assert.match(sql,/ARRAY\[1000\]::integer\[\]/);
 assert.match(sql,/a\.concealed and not unlocked then continue/);
 assert.match(sql,/ACHIEVEMENT_STAGE_ORDER/);
 assert.match(sql,/ACHIEVEMENT_ALREADY_CLAIMED/);
 assert.match(sql,/for update/);
 assert.match(sql,/balance=balance\+award_f/);
 assert.match(sql,/revoke all on public\.flip_achievement_defs/);
 assert.match(sql,/c\.rarity='hidden'/);
 assert.match(sql,/d\.first_found_at=t\.completed_at/);
});
test('Achievement UI reveals hidden names only after authoritative unlock',()=>{
 const src=source('src/scripts/achievements.js');
 const page={window:{}};
 runInNewContext(src,page);
 const ui=page.window.FLIPAchievements;
 const markup=ui.page({
   items:[
     {...achievements.items[0]},
     {code:'lucky_ticket',title:'ЗАСЕКРЕЧЕНО',category:'secret',secret:true,
      description:'Условие скрыто до выполнения',progress:0,target:1,
      total_stages:1,stage:1,reward_f:150,claimed_stages:0},
   ],badges:[],completed:0,total:30,claimable:1
 },{online:true});
 assert.match(markup,/Первые шаги/);
 assert.match(markup,/ЗАСЕКРЕЧЕНО/);
 assert.doesNotMatch(markup,/Невозможное возможно/);
 assert.match(markup,/data-achievement-claim="first_steps"/);
 assert.match(ui.profile(achievements,{online:true}),/0 \/ 30/);
 assert.match(ui.page(null,{online:false}),/Подключись через Telegram/);
});
