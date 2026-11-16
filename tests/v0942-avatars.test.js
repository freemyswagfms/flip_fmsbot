import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {getPublicAvatarData} from '../api/profile-avatar.js';
import {handleRequest} from '../api/flip.js';

const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const token='12345:FLIP_AVATAR_TEST_TOKEN';
const publicId='11111111-1111-4111-8111-111111111111';
const jpeg=Buffer.from([0xff,0xd8,0xff,0xe0,0x01,0x02,0x03,0x04]);
function signed(id,photoUrl){
  const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),
    user:JSON.stringify({id,first_name:'Viewer',
      ...(photoUrl?{photo_url:photoUrl}:{})})});
  const key=createHmac('sha256','WebAppData').update(token).digest();
  p.set('hash',createHmac('sha256',key).update([...p.entries()]
    .sort(([a],[b])=>a.localeCompare(b,'en'))
    .map(([k,v])=>k+'='+v).join('\n')).digest('hex'));
  return p.toString();
}
async function env(fetcher,fn){
  const oldEnv=process.env,oldFetch=globalThis.fetch;
  process.env={...oldEnv,TELEGRAM_BOT_TOKEN:token,
    SUPABASE_URL:'https://flip-test.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_mock'};
  globalThis.fetch=fetcher;
  try{return await fn();}finally{process.env=oldEnv;globalThis.fetch=oldFetch}
}
function mockTelegram(hits){
  return async(url,opts)=>{
    hits.push(String(url));
    const address=String(url);
    if(address.endsWith('/getUserProfilePhotos')){
      const payload=JSON.parse(opts.body);
      assert.equal(payload.user_id,345);
      assert.equal(payload.limit,1);
      return Response.json({ok:true,result:{total_count:1,photos:[[
        {file_id:'small',width:100,height:100,file_size:100},
        {file_id:'larger',width:320,height:320,file_size:120}
      ]]}});
    }
    if(address.endsWith('/getFile')){
      assert.equal(JSON.parse(opts.body).file_id,'larger');
      return Response.json({ok:true,result:{file_path:'photos/file_42.jpg',file_size:120}});
    }
    if(address.endsWith('/photos/file_42.jpg')){
      return new Response(jpeg,{status:200,headers:{'content-type':'image/jpeg'}});
    }
    throw Error('Unexpected Telegram request');
  };
}
test('Telegram avatars use protected server-only method and embedded raster data',async()=>{
  const hits=[];
  const avatar=await getPublicAvatarData(345,token,mockTelegram(hits));
  assert.equal(avatar,'data:image/jpeg;base64,'+jpeg.toString('base64'));
  assert.equal(hits.length,3);
  assert.ok(hits.every(url=>url.startsWith('https://api.telegram.org/')));
  assert.ok(hits[2].includes('file/bot'));
});
test('Private photos or malformed bot/file responses yield initials fallback',async()=>{
  const privatePhoto=async()=>Response.json({ok:true,result:{total_count:0,photos:[]}});
  assert.equal(await getPublicAvatarData(345,token,privatePhoto),null);
  assert.equal(await getPublicAvatarData(-1,token,privatePhoto),null);
  assert.equal(await getPublicAvatarData(345,'bad-token',privatePhoto),null);
  const forbiddenPath=async(url)=>{
    if(String(url).endsWith('/getUserProfilePhotos'))
      return Response.json({ok:true,result:{photos:[[{file_id:'id',width:160,height:160}]]}});
    return Response.json({ok:true,result:{file_path:'../../.env'}});
  };
  assert.equal(await getPublicAvatarData(345,token,forbiddenPath),null);
});
test('Authenticated public profile returns avatar without leaking Telegram ID or bot file path',async()=>{
 const hits=[];
 await env(async(url,options)=>{
   const address=String(url);
   if(address.endsWith('/flip_public_profile_stats'))return Response.json({drops:3,packs:4});
   if(address.endsWith('/flip_public_profile'))
     return Response.json({public_id:publicId,username:'friend',level:4,slots:[],badges:[]});
   if(address.endsWith('/flip_public_avatar_target')){
     assert.deepEqual(JSON.parse(options.body),{p_public_id:publicId});
     return Response.json(345);
   }
   return mockTelegram(hits)(url,options);
 },async()=>{
   const response=await handleRequest(new Request('https://flip.test/api/flip?profile='+publicId,{
     headers:{'x-telegram-init-data':signed(123)}
   }));
   assert.equal(response.status,200);
   const raw=await response.text();
   const data=JSON.parse(raw);
   assert.equal(data.avatar_data,'data:image/jpeg;base64,'+jpeg.toString('base64'));
   assert.ok(!('telegram_id' in data));
   assert.ok(!raw.includes(token));
   assert.ok(!raw.includes('photos/file_42.jpg'));
   assert.equal(hits.length,3);
 });
});
test('Owner can use a signed Telegram avatar URL when available',async()=>{
  const image='https://t.me/i/userpic/320/photo.jpg';
  let tgCalls=0;
  await env(async(url,opts)=>{
    const address=String(url);
    if(address.endsWith('/flip_public_profile_stats'))return Response.json({drops:3,packs:4});
    if(address.endsWith('/flip_public_profile'))
      return Response.json({public_id:publicId,username:'owner',slots:[]});
    if(address.endsWith('/flip_public_avatar_target'))return Response.json(123);
    tgCalls++;return Response.json({ok:false});
  },async()=>{
    const response=await handleRequest(new Request('https://flip.test/api/flip?profile='+publicId,{
      headers:{'x-telegram-init-data':signed(123,image)}
    }));
    assert.equal(response.status,200);
    assert.equal((await response.json()).avatar_data,image);
    assert.equal(tgCalls,0);
  });
});
test('Public profile shows square player photo and retains readable initials underneath',()=>{
  const win={FLIPCatalog:{getCard:()=>null}};
  runInNewContext(source('src/scripts/showcase.js'),{window:win});
  const plain={public_id:publicId,username:'fan',level:6,slots:[],ranked_cards:0,
    ranked_variants:0,badges:[]};
  const without=win.FLIPShowcase.publicPage(plain);
  assert.match(without,/flip-showcase-avatar-initials/);
  assert.doesNotMatch(without,/flip-showcase-player-photo/);
  const withPhoto=win.FLIPShowcase.publicPage({...plain,
    avatar_data:'data:image/jpeg;base64,'+jpeg.toString('base64')});
  assert.match(withPhoto,/flip-showcase-player-photo/);
  assert.match(withPhoto,/data:image\/jpeg;base64/);
  assert.match(withPhoto,/referrerpolicy="no-referrer"/);
  assert.match(source('src/scripts/app.js'),/publicPhoto\.addEventListener\('error',\(\)=>publicPhoto\.remove\(\),\{once:true\}\)/);
  assert.match(source('src/styles/showcase.css'),/flip-showcase-player-photo\.is-loaded/);
});
test('Avatar ID lookup is restricted to service role',()=>{
  const sql=source('sql/012_flip_v0942_public_avatars.sql');
  assert.match(sql,/from public\.flip_players p/);
  assert.match(sql,/where p\.public_id = p_public_id/);
  assert.match(sql,/revoke all on function public\.flip_public_avatar_target\(uuid\)/);
  assert.match(sql,/grant execute on function public\.flip_public_avatar_target\(uuid\)/);
  assert.match(sql,/to service_role/);
});
