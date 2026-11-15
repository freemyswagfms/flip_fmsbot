import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {normalizeTarget,isJoined} from '../api/task-bot.js';
import {handleRequest} from '../api/flip.js';
import studioTasks from '../studio/api/tasks.js';

const botToken='12345:TEST-TOKEN';
const testEnv={SUPABASE_URL:'https://test.supabase.co',
 SUPABASE_SECRET_KEY:'sb_secret_mock',TELEGRAM_BOT_TOKEN:botToken};
const version='11111111-1111-4111-8111-111111111111';
const owner='22222222-2222-4222-8222-222222222222';
function signedData(id=5555){
 const params=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),
  user:JSON.stringify({id,first_name:'Player'})});
 const secret=createHmac('sha256','WebAppData').update(botToken).digest();
 params.set('hash',createHmac('sha256',secret).update([...params.entries()]
  .sort(([a],[b])=>a.localeCompare(b,'en')).map(([a,b])=>a+'='+b).join('\n')).digest('hex'));
 return params.toString();
}
function withEnv(fetchMock,run){
 const before=process.env,old=globalThis.fetch;
 process.env={...before,...testEnv};globalThis.fetch=fetchMock;
 return Promise.resolve().then(run).finally(()=>{process.env=before;globalThis.fetch=old});
}
const json=x=>Response.json(x);
test('Subscription target must be Telegram, no forged external URL',()=>{
 assert.deepEqual(normalizeTarget('https://t.me/LOWFREQ'),{
  url:'https://t.me/LOWFREQ',chatId:'@LOWFREQ',publicName:'LOWFREQ'});
 assert.equal(normalizeTarget('https://evil.example/LOWFREQ'),null);
 assert.equal(normalizeTarget('https://t.me/LOWFREQ/15'),null);
 assert.equal(normalizeTarget('https://t.me/+abcdefghi123'),null);
 assert.equal(normalizeTarget('https://t.me/+abcdefghi123','-1001234567890')?.chatId,
  '-1001234567890');
 assert.equal(isJoined({status:'left'}),false);
 assert.equal(isJoined({status:'kicked'}),false);
 assert.equal(isJoined({status:'restricted',is_member:false}),false);
 assert.equal(isJoined({status:'restricted',is_member:true}),true);
 assert.equal(isJoined({status:'member'}),true);
});
test('Editor and Admin cannot read or change task slots even via direct API',async()=>{
 for(const role of ['editor','admin']){
  let wrote=false;
  const fetchMock=async url=>{
   const u=new URL(url);
   if(u.pathname==='/auth/v1/user')return json({id:owner,email:'staff@test.com'});
   if(u.pathname.endsWith('/flip_studio_members'))
     return json([{user_id:owner,email:'staff@test.com',role,active:true}]);
   wrote=true;throw Error('Unauthorized DB access');
  };
  await withEnv(fetchMock,async()=>{
   const req=new Request('https://flip-fmsbot.vercel.app/api/studio?route=tasks',{
    method:'GET',headers:{authorization:'Bearer '+'x'.repeat(40),
      origin:'https://flip-studio-six.vercel.app'}});
   const reply=await studioTasks(req);
   assert.equal(reply.status,403);assert.equal(wrote,false);
  });
 }
});
test('Cannot claim a subscription task by simply clicking without Telegram membership',async()=>{
 let claims=0;
 const mock=async(url,opts={})=>{
  const uri=String(url);
  if(uri.endsWith('/rpc/flip_task_snapshot'))
   return json({daily:[{scope:'daily',slot:1,version,claimed:false,type:'subscription'}],
    weekly:[]});
  if(uri.includes('/flip_task_slots?'))
   return json([{kind:'subscription',channel_id:'-1001234567890',version}]);
  if(uri.includes('api.telegram.org'))
   return json({ok:true,result:{status:'left'}});
  if(uri.endsWith('/rpc/flip_claim_task')){claims++;throw Error('reward not permitted')}
  throw Error('Unexpected '+uri);
 };
 await withEnv(mock,async()=>{
  const res=await handleRequest(new Request('https://flip.example.com/api/flip',{
   method:'POST',headers:{'content-type':'application/json',
    'x-telegram-init-data':signedData()},
   body:JSON.stringify({action:'claim_task',scope:'daily',slot:1,version,
    requestId:'12345678-1234-4234-8234-123456789123'})
  }));
  assert.equal(res.status,409);assert.equal((await res.json()).error,'TASK_NOT_SUBSCRIBED');
  assert.equal(claims,0);
 });
});
test('Verified membership uses server-held channel ID and only then claims task',async()=>{
 let rpcClaim;
 const mock=async(url,opts={})=>{
  const uri=String(url);
  if(uri.endsWith('/rpc/flip_task_snapshot'))
   return json({daily:[{scope:'daily',slot:1,version,claimed:false,type:'subscription'}],
    weekly:[]});
  if(uri.includes('/flip_task_slots?'))
   return json([{kind:'subscription',channel_id:'-1001234567890',version}]);
  if(uri.includes('api.telegram.org')){
   assert.deepEqual(JSON.parse(opts.body),{chat_id:'-1001234567890',user_id:5555});
   return json({ok:true,result:{status:'member'}});
  }
  if(uri.endsWith('/rpc/flip_claim_task')){
   rpcClaim=JSON.parse(opts.body);
   return json({ok:true,earned_f:50,earned_xp:20,state:{},tasks:{}});
  }
  throw Error('Unexpected '+uri);
 };
 await withEnv(mock,async()=>{
  const res=await handleRequest(new Request('https://flip.example.com/api/flip',{
   method:'POST',headers:{'content-type':'application/json',
    'x-telegram-init-data':signedData()},
   body:JSON.stringify({action:'claim_task',scope:'daily',slot:1,version,
    channelId:'@hacker',userId:1,verified:true,
    requestId:'12345678-1234-4234-8234-123456789123'})
  }));
  assert.equal(res.status,200);
  assert.deepEqual(rpcClaim,{
   p_telegram_id:5555,p_scope:'daily',p_slot:1,p_version:version,p_verified:true
  });
 });
});
