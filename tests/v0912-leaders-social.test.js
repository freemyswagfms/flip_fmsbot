import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {handleSocialRequest} from '../api/social.js';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const bot='12345:LEADER_TEST';
const one='11111111-1111-4111-8111-111111111111';
const two='22222222-2222-4222-8222-222222222222';
function signed(id){
 const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),
  user:JSON.stringify({id,first_name:'Test'})});
 const secret=createHmac('sha256','WebAppData').update(bot).digest();
 const message=[...p.entries()].sort(([a],[b])=>a.localeCompare(b,'en'))
  .map(([k,v])=>k+'='+v).join('\n');
 p.set('hash',createHmac('sha256',secret).update(message).digest('hex'));
 return p.toString();
}
async function withEnv(fn){
 const old=process.env,oldFetch=globalThis.fetch;
 process.env={...old,TELEGRAM_BOT_TOKEN:bot,
   SUPABASE_URL:'https://test.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_mock'};
 try{await fn();}finally{process.env=old;globalThis.fetch=oldFetch}
}
function request(id,path){
 return new Request('https://flip.test/api/social'+path,{headers:{
  'x-telegram-init-data':signed(id)}});
}
test('Signed all-player search returns true rank, profile skin, no exposed Telegram IDs',async()=>{
 await withEnv(async()=>{
  const calls=[];
  globalThis.fetch=async(url,opts)=>{
   if(String(url).endsWith('/rpc/flip_player_is_banned'))return Response.json(false);
   const method=String(url).split('/').at(-1),payload=JSON.parse(opts.body);
   calls.push({method,payload});
   if(method==='flip_leaderboard_social')return Response.json({
    leaders:[{telegram_id:'999',username:'victory',first_name:'Vicky',
      public_id:two,place:356,level:5,cp:48.25,ranked_cards:31,ranked_variants:16,
      appearance:{background:'midnight-grid',showcase_skin:'midnight-vault',
       frame_color:'blue'}}],
    me:{place:4,cp:999,username:'viewer',first_name:'Viewer',
      public_id:one,level:7,ranked_cards:22,ranked_variants:12,
      appearance:{background:'redline',frame_color:'pink'}},
    players:1200,matches:1});
   throw Error('Unexpected RPC '+method);
  };
  const r=await handleSocialRequest(request(123,'?view=leaderboard_social&q=%40Vic'));
  assert.equal(r.status,200);
  assert.deepEqual(calls,[{method:'flip_leaderboard_social',payload:{
    p_viewer_id:123,p_query:'Vic',p_limit:25}}]);
  const data=await r.json();
  assert.equal(data.leaders[0].place,356);
  assert.equal(data.leaders[0].profileId,two);
  assert.equal(data.leaders[0].appearance.background,'midnight-grid');
  assert.equal(data.leaders[0].name,'@victory');
  assert.equal(data.players,1200);
  assert.equal(data.matches,1);
  assert.ok(!('telegram_id' in data.leaders[0]));
  assert.ok(!('telegram_id' in data.me));
  assert.equal(data.me.name,'@viewer');
  assert.equal(data.me.appearance.background,'redline');
 });
});
test('Public profile trade-target resolution checks signed actor and rejects own UUID',async()=>{
 await withEnv(async()=>{
  const calls=[];
  globalThis.fetch=async(url,opts)=>{
   if(String(url).endsWith('/rpc/flip_player_is_banned'))return Response.json(false);
   calls.push(JSON.parse(opts.body));
   return Response.json({telegram_id:'987',first_name:'Friend',username:'friend',level:8});
  };
  const r=await handleSocialRequest(request(123,'?view=profile_target&publicId='+two));
  assert.equal(r.status,200);
  assert.deepEqual(await r.json(),{player:{id:'987',name:'@friend',level:8}});
  assert.deepEqual(calls,[{p_actor_id:123,p_public_id:two}]);
  assert.equal((await handleSocialRequest(request(123,'?view=profile_target&publicId=bad'))).status,400);
 });
 await withEnv(async()=>{
  globalThis.fetch=async url=>String(url).endsWith('/rpc/flip_player_is_banned')
   ?Response.json(false):Response.json(null);
  const r=await handleSocialRequest(request(123,'?view=profile_target&publicId='+one));
  assert.equal(r.status,404);
 });
});
test('Leaderboard visually skins every known background while blocking unsafe CSS injection',async()=>{
 const result={innerHTML:'',dataset:{},setAttribute(){}};
 const input={value:'',focus(){}};
 const listeners={};
 const root={isConnected:true,innerHTML:'',
  querySelector(q){return q==='#flip-leaderboard-results'?result:
    q==='#flip-leader-query'?input:null},
  addEventListener(kind,cb){listeners[kind]=cb}};
 const list=[
  ['acid-signal','red'],['midnight-grid','blue'],['redline','glitch'],
  ['pastel-dream','pink'],['lunar-haze','white'],['prism-shift','rgb']
 ].map(([background,frame_color],i)=>({
   place:i+1,name:i===2?'<script>alert(1)</script>':'@collector'+i,
   profileId:i===0?one:two,level:2,cp:999-i,rankedVariants:5,rankedCards:8,
   isMe:i===0,appearance:{background,frame_color,showcase_skin:'midnight-vault'}
 }));
 let calls=0;
 const context={window:{Telegram:{WebApp:{initData:'signed_launch'}},
   FLIPIcons:{render(){}}},fetch:async(url,opts)=>{
     calls++;assert.equal(opts.headers['x-telegram-init-data'],'signed_launch');
     return {ok:true,async json(){return {leaders:list,players:6,matches:6,
       me:{place:1,cp:999,name:'@collector0',profileId:one,level:2,
        rankedVariants:5,rankedCards:8,appearance:{background:'acid-signal'}}}}};},
    setTimeout(){return 1;},clearTimeout(){},URL,JSON,Set};
 runInNewContext(read('src/scripts/leaderboard.js'),context);
 context.window.FLIPLeaderboard.mount(root);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(calls,1);
 for(const p of list)assert.match(result.innerHTML,
  new RegExp('flip-leader-bg-'+p.appearance.background));
 assert.match(result.innerHTML,/flip-leader-podium/);
 assert.match(result.innerHTML,/flip-leader-runners/);
 assert.match(result.innerHTML,/flip-leader-color-rgb/);
 assert.doesNotMatch(result.innerHTML,/<script>/);
 assert.match(result.innerHTML,/&lt;script&gt;/);
 listeners.input({target:{id:'flip-leader-query',value:'victory'}});
 listeners.keydown({target:{id:'flip-leader-query'},key:'Enter',preventDefault(){}});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(calls,2);
 const skin=read('src/styles/leaderboard-v0912.css');
 for(const background of ['acid-signal','midnight-grid','redline','pastel-dream','lunar-haze','prism-shift'])
  assert.ok(skin.includes('.flip-leader-bg-'+background+'{'));
});
test('Showcase immediately follows identity, then themed leader CTA',()=>{
 const app=read('src/scripts/app.js');
 assert.match(app,/hero\+showcase\+rankingProfile\(data\)/);
 assert.doesNotMatch(app,/hero\+rankingProfile\(\)\+showcase/);
 assert.match(app,/FLIPProfileCosmetics\?\.safe\?\.\(/);
 assert.doesNotMatch(app,/profile\(\)\+rankingProfile\(\)\+idInfo/);
 assert.match(app,/flip-leaderboard-page/);
 assert.match(app,/data-profile-trade/);
 assert.match(app,/openWithProfile\?\.\(publicId\)/);
 const showcase=read('src/scripts/showcase.js');
 assert.match(showcase,/isOwn=false/);
 assert.match(showcase,/identity\+tradeCta/);
 assert.match(showcase,/data-profile-trade/);
 const trades=read('src/scripts/trades.js');
 assert.match(trades,/async function openWithProfile\(publicId\)/);
 assert.match(trades,/api\('profile_target',\{publicId\}\)/);
 assert.match(trades,/await choosePlayer\(p.id/);
});
test('SQL server-only functions do not leak database roles or modify CP economy',()=>{
 const sql=read('sql/024_flip_v0912_leaders_social.sql');
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.flip_leaderboard_social/);
 assert.match(sql,/ROW_NUMBER\(\) OVER\(ORDER BY cp DESC/);
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.flip_trade_profile_target/);
 assert.match(sql,/p\.telegram_id<>p_actor_id/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.flip_leaderboard_social/);
 assert.match(sql,/FROM PUBLIC,anon,authenticated/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.flip_trade_profile_target/);
 assert.doesNotMatch(sql,/UPDATE\s+public\.flip_players|DELETE\s+FROM|TRUNCATE/i);
});
test('Versioned social assets and existing app navigation remain intact',()=>{
 const index=read('index.html'),pkg=JSON.parse(read('package.json'));
 assert.equal(pkg.version,'0.9.13');
 for(const p of ['showcase.js','trades.js','app.js'])
  assert.ok(index.includes('src/scripts/'+p+'?v='+(p==='trades.js'?'0.9.13':'0.9.13.5')),p);
 assert.ok(index.includes('src/scripts/leaderboard.js?v=0.9.13.4'));
 assert.ok(index.includes('src/styles/leaderboard-v0912.css?v=0.9.13.4'));
 const spacing=read('src/styles/leaderboard-v0912.css');
 assert.match(spacing,/\.flip-leader-podium \+ \.flip-leader-list\{margin-top:8px\}/);
 assert.ok(spacing.includes('.flip-leaderboard-page .flip-leader-results-heading{'));
 assert.ok(spacing.includes('margin:25px 0 14px'));
 assert.ok(spacing.includes('.flip-profile-page .flip-leader-entry{'));
 assert.match(spacing,/\.flip-leader-runners\{display:grid;gap:8px\}/);
 assert.match(spacing,/\.flip-leader-list\{display:grid;gap:8px;margin-top:0\}/);
 assert.match(index,/data-tab="home"/);
 assert.match(index,/data-tab="profile"/);
 assert.ok(read('api/flip.js').includes("version:'0.9.13'"));
});
