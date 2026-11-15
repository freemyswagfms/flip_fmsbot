import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import handler from '../studio/api/manage.js';
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const app=source('studio/app.js'),server=source('studio/api/manage.js');
const ownerId='11111111-1111-4111-8111-111111111111',
 editorId='22222222-2222-4222-8222-222222222222';
const env={SUPABASE_URL:'https://test.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_test'};
async function call(action,role='owner',extra={},fetchOverride=null,method='POST'){
 const beforeEnv=process.env,oldFetch=globalThis.fetch;
 process.env={...beforeEnv,...env};
 let updateCalls=0,roleReads=0;
 globalThis.fetch=async(url,options={})=>{
  const str=String(url);
  const path=new URL(str);
  const json=value=>new Response(JSON.stringify(value),{
   headers:{'content-type':'application/json'},status:200});
  if(str.includes('/auth/v1/user'))return json({id:ownerId,email:'owner@example.com'});
  if(path.pathname.endsWith('/flip_studio_members')&&
    path.searchParams.get('user_id')==='eq.'+ownerId){
   roleReads++;
   return json([{user_id:ownerId,email:'owner@example.com',role,active:true}]);
  }
  if(fetchOverride){
   const reply=await fetchOverride(url,options);
   if(reply)return reply;
  }
  throw Error('Unexpected request '+options.method+' '+str);
 };
 const req=new Request('https://flip-fmsbot.vercel.app/api/studio?route=manage'+
  (method==='GET'?'&view=catalog':''),{
  method,headers:{authorization:'Bearer '+'a'.repeat(35),
   origin:'https://flip-studio-six.vercel.app','content-type':'application/json'},
  body:method==='POST'?JSON.stringify({action,...extra}):undefined
 });
 try{
  const result=await handler(req);
  return {status:result.status,body:await result.json(),roleReads};
 }finally{process.env=beforeEnv;globalThis.fetch=oldFetch}
}
test('Role edit rejects editor permissions, self-demotion, and owner role',async()=>{
 const changed=await call('update_member','editor',{userId:editorId,role:'admin',active:true});
 assert.equal(changed.status,403);
 assert.equal((await call('update_member','owner',{userId:ownerId,role:'admin',active:true})).status,400);
 assert.equal((await call('update_member','owner',{userId:editorId,role:'owner',active:true})).status,400);
});
test('Role change updates only a non-owner record with audit trail',async()=>{
 let updated=false,audited=false;
 const response=await call('update_member','owner',{userId:editorId,role:'admin',active:false},
 (url,options)=>{
  const path=new URL(url);
  if(path.pathname.endsWith('/flip_studio_members')&&options.method==='GET')
   return Response.json([{user_id:editorId,email:'e@example.com',role:'editor',active:true}]);
  if(path.pathname.endsWith('/flip_studio_members')&&options.method==='PATCH'){
   assert.equal(path.searchParams.get('role'),'neq.owner');
   assert.deepEqual(JSON.parse(options.body),{role:'admin',active:false});
   updated=true;return Response.json([{user_id:editorId,role:'admin',active:false}]);
  }
  if(path.pathname.endsWith('/flip_studio_audit')){audited=true;return Response.json([{}])}
  return null;
 });
 assert.equal(response.status,200);
 assert.equal(updated,true);
 assert.equal(audited,true);
});
test('A non-owner can read published catalog but cannot replace an image',async()=>{
 const result=await call(null,'editor',{},(url,options)=>{
  const p=new URL(url);
  if(p.pathname.endsWith('rpc/flip_public_catalog'))
   return Response.json({artists:[],releases:[],cards:[]});
  return null;
 },'GET');
 assert.equal(result.status,200);
 assert.equal(result.body.catalog.cards.length,0);
 assert.equal((await call('replace_artwork','editor',{
  cardId:'carti/die-lit/common',processedPath:ownerId+'/published/carti/die-lit/common/a.webp'
 })).status,403);
});
test('Published image replacement strictly validates ownership and existing cards',async()=>{
 const id=ownerId+'/published/carti/die-lit/common/'+editorId+'-1024.webp';
 assert.equal((await call('replace_artwork','owner',{
  cardId:'carti/die-lit/common',processedPath:'other/'+id
 })).status,400);
 assert.equal((await call('replace_artwork','owner',{
  cardId:'carti/die-lit/common',processedPath:id
 },()=>Response.json([]))).status,404);
 assert.match(server,/flip_artwork_overrides\?on_conflict=card_id/);
 assert.match(server,/upsert:false/);
 assert.match(server,/isWebp\(bytes\)/);
 assert.match(server,/auth\.member\.role!=='owner'/);
});
test('Artist view filters exact artist id, never sorts other artists to top',()=>{
 const begin=app.indexOf('function releaseGrid(){');
 const end=app.indexOf('function importStage(',begin);
 const ctx={
 s:{
  artistFilter:'a1',artists:[{id:'a1',name:'Playboi Carti'},{id:'a2',name:'Travis Scott'}],
  releases:[{id:'r1',artist_id:'a1',title:'Die Lit',release_type:'album',status:'draft'},
   {id:'r2',artist_id:'a2',title:'UTOPIA',release_type:'album',status:'draft'}],
  filter:'all',q:''
 },
 pageHead:(a,b,c,d)=>b+' '+c+d,button:()=>'',ico:()=>'',esc:x=>String(x),
 releaseRow:x=>'<release>'+x.title+'</release>',artistName:id=>id,
 tag:()=>'',loadingMarkup:()=>'',Math
 };
 const html=runInNewContext(app.slice(begin,end)+'\nreleaseGrid()',ctx);
 assert.match(html,/Die Lit/);
 assert.doesNotMatch(html,/UTOPIA/);
 assert.match(html,/Показать всех артистов/);
 assert.ok(!app.includes('s.releases=s.releases.sort('));
});
test('Already-published game catalog includes initial Carti release art with immutable ID',()=>{
 const s={
  publishedCatalog:{
    artists:[{id:'carti',name:'Playboi Carti',active:true}],
    releases:[{artist_id:'carti',id:'die-lit',title:'Die Lit',active:true}],
    cards:[{id:'carti/die-lit/common',artist_id:'carti',release_id:'die-lit',rarity:'common',active:true,art_url:null}]
  }
 };
 const begin=app.indexOf('function publishedGroups(){'),
  end=app.indexOf('function publishedCard(',begin);
 const list=runInNewContext(app.slice(begin,end)+'\npublishedGroups()', {s,Math,Map});
 assert.equal(list.length,1);
 assert.equal(list[0].key,'carti/die-lit');
 assert.match(app,/flip-fmsbot\.vercel\.app\/src\/assets\//);
 assert.match(app,/action:'replace_artwork',cardId,processedPath/);
 assert.match(app,/editorMode==='published'/);
});


test('An Owner can replace a live Carti image without changing any card ID',async()=>{
 const cardId='carti/die-lit/common';
 const path=ownerId+'/published/carti/die-lit/common/'+editorId+'-1024.webp';
 let downloaded=false,uploaded=false,overridden=false;
 const bytes=new Uint8Array(32);
 bytes.set([82,73,70,70],0);bytes.set([87,69,66,80],8);
 bytes.set([86,80,56,32],12);
 const r=await call('replace_artwork','owner',{cardId,processedPath:path},
 async (url,options)=>{
   const u=new URL(url);
   if(u.pathname.endsWith('/flip_cards'))
    return Response.json([{id:cardId,artist_id:'carti',release_id:'die-lit',
     rarity:'common',active:true}]);
   if(u.pathname.endsWith('/flip_releases'))
    return Response.json([{active:true}]);
   if(u.pathname.includes('/storage/v1/object/flip-studio-drafts/')){
    downloaded=true;
    return new Response(bytes,{headers:{'content-type':'image/webp'}});
   }
   if(u.pathname.includes('/storage/v1/object/flip-artwork/')){
    uploaded=true;
    assert.match(u.pathname,/carti\/die-lit\/revisions\/common-[a-f0-9-]+\.webp$/);
    return Response.json({Key:'test',Id:'test'});
   }
   if(u.pathname.endsWith('/flip_artwork_overrides')){
    if(options.method==='GET')return Response.json([]);
    assert.equal(options.method,'POST');
    const values=JSON.parse(options.body);
    assert.equal(values.card_id,cardId);
    assert.match(values.public_url,/flip-artwork\/carti\/die-lit\/revisions\//);
    overridden=true;
    return Response.json([values]);
   }
   if(u.pathname.endsWith('/flip_studio_audit'))return Response.json([{}]);
   return null;
 });
 assert.equal(r.status,200,JSON.stringify(r.body));
 assert.equal(r.body.cardId,cardId);
 assert.equal(downloaded,true);
 assert.equal(uploaded,true);
 assert.equal(overridden,true);
});
