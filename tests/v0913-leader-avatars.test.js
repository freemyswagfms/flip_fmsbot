import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {handleRequest} from '../api/flip.js';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const token='12345:FLIP_AVATAR_TEST_TOKEN';
const publicId='33333333-3333-4333-8333-333333333333';
const privateId='44444444-4444-4444-8444-444444444444';
const image=Buffer.from([255,216,255,224,11,22,33,44]);
function signed(id,photoUrl){
 const values=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),
  user:JSON.stringify({id,first_name:'Viewer',
    ...(photoUrl?{photo_url:photoUrl}:{})})});
 const secret=createHmac('sha256','WebAppData').update(token).digest();
 values.set('hash',createHmac('sha256',secret).update([...values.entries()]
  .sort(([a],[b])=>a.localeCompare(b,'en')).map(([k,v])=>k+'='+v).join('\n')).digest('hex'));
 return values.toString();
}
function request(id,query,photoUrl){
 return new Request('https://flip.test/api/flip?'+query,{headers:{
  'x-telegram-init-data':signed(id,photoUrl)}});
}
async function mockEnv(fetcher,work){
 const origEnv=process.env,origFetch=globalThis.fetch;
 process.env={...origEnv,TELEGRAM_BOT_TOKEN:token,
  SUPABASE_URL:'https://flip-test.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_mock'};
 globalThis.fetch=async(url,options)=>{
  if(String(url).endsWith('/rpc/flip_player_is_banned'))return Response.json(false);
  return fetcher(String(url),options);
 };
 try{return await work();}finally{process.env=origEnv;globalThis.fetch=origFetch}
}
test('Leaderboard avatar endpoint gets real Telegram photo server-side, caches it and hides IDs',async()=>{
 const calls=[];
 await mockEnv(async(url,options)=>{
  calls.push(url);
  if(url.endsWith('/rpc/flip_public_avatar_target')){
   assert.deepEqual(JSON.parse(options.body),{p_public_id:publicId});
   return Response.json(98765);
  }
  if(url.endsWith('/getUserProfilePhotos'))
   return Response.json({ok:true,result:{photos:[[
    {file_id:'image',width:320,height:320,file_size:80}]]}});
  if(url.endsWith('/getFile'))
   return Response.json({ok:true,result:{file_path:'photos/test.jpg',file_size:80}});
  if(url.endsWith('/photos/test.jpg'))
   return new Response(image,{headers:{'content-type':'image/jpeg'}});
  throw Error('Unexpected URL '+url);
 },async()=>{
  const response=await handleRequest(request(123,'avatar='+publicId));
  assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'no-store');
  const body=await response.text();
  assert.deepEqual(JSON.parse(body),{
   avatar_data:'data:image/jpeg;base64,'+image.toString('base64')});
  assert.ok(!body.includes(token));
  assert.ok(!body.includes('98765'));
  assert.ok(!body.includes('photos/test.jpg'));
  const again=await handleRequest(request(123,'avatar='+publicId));
  assert.equal(again.status,200);
  assert.equal((await again.json()).avatar_data,'data:image/jpeg;base64,'+image.toString('base64'));
  assert.equal(calls.filter(x=>x.endsWith('/getUserProfilePhotos')).length,1);
  assert.equal(calls.filter(x=>x.endsWith('/rpc/flip_public_avatar_target')).length,1);
 });
});
test('Unavailable photo returns null; unsigned or malformed requests are rejected',async()=>{
 await mockEnv(async url=>{
  if(url.endsWith('/rpc/flip_public_avatar_target'))return Response.json(56789);
  if(url.endsWith('/getUserProfilePhotos'))
   return Response.json({ok:true,result:{photos:[]}});
  throw Error('No further requests expected');
 },async()=>{
  const response=await handleRequest(request(123,'avatar='+privateId));
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{avatar_data:null});
  assert.equal((await handleRequest(request(123,'avatar=bad-uuid'))).status,400);
  assert.equal((await handleRequest(new Request(
   'https://flip.test/api/flip?avatar='+privateId))).status,401);
 });
});
const tick=()=>new Promise(r=>setImmediate(r));
test('Client lazily fetches photos only for visible players and preserves colored initials fallback',async()=>{
 let observer,avatarGets=0,leaderGets=0;
 const avatar={
  dataset:{},isConnected:true,children:[],
  getAttribute(name){return name==='data-leader-avatar'?publicId:null},
  appendChild(img){this.children.push(img)}
 };
 const output={dataset:{},innerHTML:'',setAttribute(){},
  querySelectorAll(sel){return sel==='[data-leader-avatar]'?[avatar]:[]}};
 const root={isConnected:true,innerHTML:'',addEventListener(){},
  querySelector(q){return q==='#flip-leaderboard-results'?output:null}};
 class FakeObserver{
  constructor(callback){this.callback=callback;observer=this}
  observe(el){this.element=el}
  unobserve(){}
  disconnect(){}
  trigger(){this.callback([{target:this.element,isIntersecting:true}])}
 }
 const window={Telegram:{WebApp:{initData:'signed_telegram_launch'}},
  IntersectionObserver:FakeObserver,FLIPIcons:{render(){}}};
 const document={createElement(name){
  assert.equal(name,'img');
  return {addEventListener(){},remove(){this.removed=true}};
 }};
 const ctx={window,document,URL,JSON,Set,Map,Promise,
  setTimeout(){return 1;},clearTimeout(){},
  fetch:async(url,opts)=>{
   assert.equal(opts.headers['x-telegram-init-data'],'signed_telegram_launch');
   if(url.startsWith('/api/social?')){
    leaderGets++;
    return {ok:true,json:async()=>({
     leaders:[{place:1,name:'@viewer',profileId:publicId,
      level:4,rankedCards:11,rankedVariants:8,cp:123,
      appearance:{background:'midnight-grid',frame_color:'pink'}}],
     me:null,players:1,matches:1})};
   }
   assert.equal(url,'/api/flip?avatar='+publicId);
   avatarGets++;
   return {ok:true,json:async()=>({avatar_data:'data:image/png;base64,AA=='})};
  }};
 runInNewContext(read('src/scripts/leaderboard.js'),ctx);
 window.FLIPLeaderboard.mount(root);
 await tick();
 assert.equal(leaderGets,1);
 assert.equal(avatarGets,0,'Photo should not download before becoming visible');
 assert.match(output.innerHTML,/data-leader-avatar="/);
 assert.match(output.innerHTML,/flip-leader-color-pink/);
 assert.match(output.innerHTML,/flip-leader-avatar[^>]*>VI<\/span>/);
 observer.trigger();
 await tick();
 assert.equal(avatarGets,1);
 assert.equal(avatar.children.length,1);
 assert.equal(avatar.children[0].src,'data:image/png;base64,AA==');
 assert.equal(avatar.children[0].referrerPolicy,'no-referrer');
 assert.equal(avatar.children[0].alt,'');
});
test('No image URL is ever built from the Telegram user ID, and photo stays inside frame',()=>{
 const client=read('src/scripts/leaderboard.js');
 const css=read('src/styles/leaderboard-v0912.css');
 assert.match(client,/data-leader-avatar/);
 assert.match(client,/getAttribute\('data-leader-avatar'\)/);
 assert.match(client,/safePhoto\(data\?\.avatar_data\)/);
 assert.match(client,/photoActive<3/);
 assert.match(client,/IntersectionObserver/);
 assert.match(css,/\.flip-leader-avatar\{\s*position:relative;overflow:hidden/);
 assert.match(css,/\.flip-leader-photo\{[\s\S]*?object-fit:cover/);
 const index=read('index.html');
 assert.ok(index.includes('src/scripts/leaderboard.js?v=0.9.13.3'));
 assert.ok(index.includes('src/styles/leaderboard-v0912.css?v=0.9.13.3'));
});
