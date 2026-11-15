import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {readFileSync} from 'node:fs';
import {handleStudioRequest} from '../api/studio.js';
import {signPair,verifyPair} from '../studio/lib/shared.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('CORS gateway only accepts official Studio origin and disallows strangers',async()=>{
 const bad=await handleStudioRequest(new Request('https://flip-fmsbot.vercel.app/api/studio?route=music',{
   method:'OPTIONS',headers:{origin:'https://attacker.example'}}));
 assert.equal(bad.status,403);
 const good=await handleStudioRequest(new Request('https://flip-fmsbot.vercel.app/api/studio?route=music',{
   method:'OPTIONS',headers:{origin:'https://flip-studio-six.vercel.app'}}));
 assert.equal(good.status,204);
 assert.equal(good.headers.get('access-control-allow-origin'),'https://flip-studio-six.vercel.app');
 assert.match(good.headers.get('access-control-allow-headers'),/authorization/);
 const missing=await handleStudioRequest(new Request('https://flip-fmsbot.vercel.app/api/studio?route=nope',{
  headers:{origin:'https://flip-studio-six.vercel.app'}}));
 assert.equal(missing.status,404);
});
test('Studio backend rejects unsigned calls without reading or changing player data',async()=>{
 const req=new Request('https://flip-fmsbot.vercel.app/api/studio?route=music&kind=artists&q=Carti',{
  headers:{origin:'https://flip-studio-six.vercel.app'}});
 const result=await handleStudioRequest(req);
 assert.equal(result.status,401);
 assert.equal((await result.json()).error,'UNAUTHORIZED');
 const r=await handleStudioRequest(new Request('https://flip-fmsbot.vercel.app/api/studio?route=manage',{
   method:'POST',headers:{origin:'https://flip-studio-six.vercel.app'},
   body:JSON.stringify({action:'publish',releaseId:'00000000-0000-0000-0000-000000000000'})}));
 assert.equal(r.status,401);
});
test('Owner pairing signature cannot be altered or reused after timeout',()=>{
 const env=process.env;
 process.env={...env,SUPABASE_SECRET_KEY:'server-test-secret',
  FLIP_ADMIN_TELEGRAM_ID:'234567890'};
 try{
  const p={v:1,scope:'studio_owner',n:'123e4567-e89b-42d3-a456-426614174000',
   t:'234567890',e:Date.now()+180000};
  const valid=signPair(p);
  assert.deepEqual(verifyPair(valid),p);
  assert.equal(verifyPair(valid.slice(0,-1)+'a'),null);
  assert.equal(verifyPair(signPair({...p,e:Date.now()-30000})),null);
  assert.equal(verifyPair(signPair({...p,t:'123'})),null);
 }finally{process.env=env}
});
test('Dynamic catalog retains card identities, rejects external injected images',()=>{
 const context={window:{}};
 runInNewContext(read('src/scripts/catalog.js'),context);
 const catalog=context.window.FLIPCatalog;
 assert.equal(catalog.getCard('carti','music','common').id,'carti/music/common');
 const accepted=catalog.importServerCatalog({
 artists:[{id:'carti',name:'Playboi Carti',active:true},
  {id:'nettspend',name:'Nettspend',active:true}],
 releases:[{artist_id:'carti',id:'music',title:'MUSIC',year:2025,active:true},
  {artist_id:'nettspend',id:'new-record',title:'New Record',year:2026,active:true}],
 cards:[{artist_id:'nettspend',release_id:'new-record',rarity:'mythic',active:true,
  art_url:'https://evil.example/steal.jpg'},
  {artist_id:'carti',release_id:'music',rarity:'rare',active:true,art_url:null}]
 });
 assert.equal(accepted,true);
 const card=catalog.getCard('nettspend','new-record','mythic');
 assert.equal(card.id,'nettspend/new-record/mythic');
 assert.equal(card.art,'./src/assets/nettspend/new-record/mythic.webp');
 assert.equal(catalog.getCard('carti','music','common').title,'MUSIC');
 const before=catalog.artists.length;
 assert.equal(catalog.importServerCatalog({artists:[],releases:[],cards:[]}),false);
 assert.equal(catalog.artists.length,before);
});
test('Rewards admin remains in Mini App and has no Studio migration dependency',()=>{
 const admin=read('src/scripts/admin.js');
 const api=read('api/admin.js');
 const vercel=read('studio/app.js');
 assert.match(admin,/data-admin-studio/);
 assert.match(admin,/grant_card|rewardKind/);
 assert.match(api,/grant_card/);
 assert.match(api,/grant_resource/);
 assert.match(vercel,/flip-fmsbot\.vercel\.app\/api\/studio/);
 assert.doesNotMatch(vercel,/SUPABASE_SECRET_KEY|TELEGRAM_BOT_TOKEN/);
});
