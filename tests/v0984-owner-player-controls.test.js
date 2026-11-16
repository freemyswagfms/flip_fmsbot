import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {handleStudioRequest} from '../api/studio.js';
import {handleRequest} from '../api/flip.js';
import {handleSocialRequest} from '../api/social.js';
import {playerListPage,playerDetailPage,playerRows} from '../studio/player-desk.js';
import {createHmac} from 'node:crypto';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const owner='11111111-1111-4111-8111-111111111111';
const rid='33333333-3333-4333-8333-333333333333';
const env={
 SUPABASE_URL:'https://owner-moderation-test.supabase.co',
 SUPABASE_SECRET_KEY:'sb_secret_mock',
 FLIP_ADMIN_TELEGRAM_ID:'12345',
 TELEGRAM_BOT_TOKEN:'12345:TEST-BOT'
};
const route=(q,body)=>new Request('https://flip-fmsbot.vercel.app/api/studio?route=players'+(q?'&'+q:''),{
 method:body?'POST':'GET',
 headers:{origin:'https://flip-studio-six.vercel.app',
 authorization:'Bearer '+'a'.repeat(40),
 ...(body?{'content-type':'application/json'}:{})},
 ...(body?{body:JSON.stringify(body)}:{})
});
async function setup(role,callback){
 const before=process.env,fetch=globalThis.fetch,calls=[];
 process.env={...before,...env};
 globalThis.fetch=async(url,opts={})=>{
  const path=new URL(String(url));
  if(path.pathname==='/auth/v1/user')return Response.json({id:owner,email:'owner@example.com'});
  if(path.pathname==='/rest/v1/flip_studio_members')
    return Response.json([{user_id:owner,role,active:true}]);
  if(path.pathname.includes('/rest/v1/rpc/')){
   calls.push({rpc:path.pathname.split('/').at(-1),payload:JSON.parse(opts.body)});
   const rpc=path.pathname.split('/').at(-1);
   if(rpc==='flip_studio_player_search')return Response.json({total:1,offset:0,players:[
     {id:'54321',username:'friend',first_name:'Friend',balance:10,level:1,banned:false}
   ]});
   if(rpc==='flip_studio_player_detail')return Response.json({player:{
     id:'54321',username:'friend',first_name:'Friend',balance:10,level:1,xp:40,cp:100,banned:false
    },cards:[],cards_total:0,actions:[]});
   if(rpc==='flip_studio_player_action')return Response.json({ok:true,status:'banned'});
  }
  throw new Error('Unexpected request '+path.href);
 };
 try{await callback(calls);}
 finally{process.env=before;globalThis.fetch=fetch;}
}
test('Studio players are inaccessible to unauthenticated callers and editors/admins',async()=>{
 const unsigned=await handleStudioRequest(new Request('https://flip-fmsbot.vercel.app/api/studio?route=players',{
  headers:{origin:'https://flip-studio-six.vercel.app'}
 }));
 assert.equal(unsigned.status,401);
 for(const role of ['editor','admin']){
  await setup(role,async calls=>{
   assert.equal((await handleStudioRequest(route('view=list'))).status,403);
   assert.equal((await handleStudioRequest(route('',{action:'ban',playerId:'54321',
     reason:'Test ban',requestId:rid}))).status,403);
   assert.equal(calls.length,0);
  });
 }
});
test('Owner can page and search registered players without trusting a forged actor',async()=>{
 await setup('owner',async calls=>{
  const res=await handleStudioRequest(route('view=list&q=friend&offset=0'));
  assert.equal(res.status,200);
  const json=await res.json();
  assert.equal(json.players[0].username,'friend');
  assert.deepEqual(calls[0],{rpc:'flip_studio_player_search',
   payload:{p_query:'friend',p_limit:25,p_offset:0}});
  assert.equal((await handleStudioRequest(route('view=detail&id=54321'))).status,200);
  assert.deepEqual(calls[1],{rpc:'flip_studio_player_detail',
   payload:{p_target_id:54321,p_limit:50,p_offset:0}});
 });
});
test('Ban and ordinary/test-card deletion use trusted owner and server-only action RPC',async()=>{
 await setup('owner',async calls=>{
  const body={action:'remove_card',playerId:'54321',requestId:rid,cardId:'carti/music/rare',
   quantity:2,kind:'test',reason:'Duplicate test cards'};
  const r=await handleStudioRequest(route('',body));
  assert.equal(r.status,200);
  assert.equal(calls.length,1);
  assert.deepEqual(calls[0],{rpc:'flip_studio_player_action',payload:{
   p_actor:owner,p_owner_telegram_id:12345,p_target_id:54321,
   p_action:'remove_card',p_card_id:body.cardId,p_kind:'test',
   p_quantity:2,p_reason:body.reason,p_request_id:rid
  }});
  const ban=await handleStudioRequest(route('',{
   action:'ban',playerId:'54321',reason:'Repeated exploit abuse',requestId:rid
  }));
  assert.equal(ban.status,200);
  assert.equal(calls[1].payload.p_action,'ban');
  assert.equal((await handleStudioRequest(route('',{
   action:'ban',playerId:'12345',reason:'Invalid owner ban',requestId:rid
  }))).status,403);
  assert.equal(calls.length,2,'cannot ban the game creator');
 });
});
test('Input validation rejects invalid deletion and player IDs before touching database',async()=>{
 await setup('owner',async calls=>{
  const bad=[
   {action:'remove_card',playerId:'54321',cardId:'carti/music/rare',quantity:-1,kind:'ranked',reason:'Test'},
   {action:'remove_card',playerId:'54321',cardId:'carti/music/rare',quantity:101,kind:'test',reason:'Test'},
   {action:'remove_card',playerId:'54321',cardId:'carti/music/rare',quantity:1,kind:'bonus',reason:'Test'},
   {action:'remove_card',playerId:'54321',cardId:'../../etc/passwd',quantity:1,kind:'test',reason:'Test'},
   {action:'ban',playerId:'not-number',reason:'Test'},
   {action:'ban',playerId:'54321',reason:'x'}
  ];
  for(const body of bad){
   const r=await handleStudioRequest(route('',{requestId:rid,...body}));
   assert.equal(r.status,400,JSON.stringify(body));
  }
  assert.equal(calls.length,0);
 });
});
test('Player list and profile escape user content; copies are distinguished',()=>{
 const state={playerList:[{id:'54321',username:'<img onerror=alert(1)>',level:2,balance:200,banned:false}],
 playerTotal:1,playerOffset:0,playerListLoaded:true,playerQuery:'foo"',
 playerCardsOffset:0,playerDetail:{player:{
 id:'54321',username:'<script>x</script>',balance:9,level:3,xp:120,cp:300,banned:false
 },cards:[{card_id:'carti/music/rare',artist:'Playboi Carti',title:'Music',rarity:'rare',
  ranked_quantity:2,test_quantity:1,quantity:3}],cards_total:1,actions:[]}};
 const list=playerListPage(state),rows=playerRows(state);
 assert.match(list,/data-action="players-search"/);
 assert.match(list,/placeholder="@username, имя или Telegram ID"/);
 assert.doesNotMatch(rows,/<img onerror/);
 const detail=playerDetailPage(state,{cards:[]});
 assert.match(detail,/Обычных: 2 · Тестовых: 1/);
 assert.match(detail,/data-kind="ranked"/);
 assert.match(detail,/data-kind="test"/);
 assert.match(detail,/data-player-ban="ban"/);
 assert.doesNotMatch(detail,/<script>/);
});
test('Signed game and social requests both reject banned accounts before reward RPCs',()=>{
 const flip=read('api/flip.js'),social=read('api/social.js');
 assert.match(flip,/rpc\('flip_player_is_banned',\{p_telegram_id:user.telegram_id\},db\)/);
 assert.match(social,/rpc\('flip_player_is_banned',\{p_telegram_id:actor\},db\)/);
 assert.match(flip,/ACCOUNT_BANNED'\},403/);
 assert.match(social,/ACCOUNT_BANNED'\},403/);
});
test('SQL prevents public access, owner ban and double card deletion',()=>{
 const sql=read('sql/020_flip_v0984_owner_player_controls.sql');
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/g);
 assert.match(sql,/p_target_id=p_owner_telegram_id/);
 assert.match(sql,/request_id uuid PRIMARY KEY/);
 assert.match(sql,/WHERE request_id=p_request_id/);
 assert.match(sql,/FOR UPDATE/);
 assert.match(sql,/flip_inventory/);
 assert.match(sql,/status='cancelled'/);
 assert.match(sql,/flip_studio_audit/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public.flip_studio_player_action/);
 assert.match(sql,/TO service_role/);
});
test('Separate owner navigation is wired without exposing privileged operations in browser',()=>{
 const app=read('studio/app.js'),gateway=read('api/studio.js');
 assert.match(app,/['"]players['"],['"]users['"],['"]Игроки['"]/);
 assert.match(app,/!['"]owner['"]\)/);
 assert.match(app,/case 'player-confirm'/);
 assert.match(app,/requestId:a.requestId/,'retry after lost response must preserve request UUID');
 assert.match(gateway,/const routes=\{music,owner,manage,tasks,players\}/);
 assert.doesNotMatch(app,/SUPABASE_SECRET_KEY/);
 const pkg=JSON.parse(read('package.json'));
 assert.equal(pkg.version,'0.9.8.4');
});
