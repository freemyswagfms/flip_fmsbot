import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {discoverMusic} from '../studio/api/music.js';
const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const withFetch=async (stub,fn)=>{
 const previous=globalThis.fetch;globalThis.fetch=stub;
 try{return await fn()}finally{globalThis.fetch=previous}
};
const json=(value,status=200)=>new Response(JSON.stringify(value),{
 status,headers:{'content-type':'application/json'}});
test('MusicBrainz 503 artist search automatically falls back to iTunes artists',async()=>{
 const seen=[];
 const results=await withFetch(async url=>{
  seen.push(String(url));
  if(String(url).includes('musicbrainz.org'))return json({error:'busy'},503);
  if(String(url).includes('itunes.apple.com/search'))return json({results:[{
   wrapperType:'artist',artistId:2131694,artistName:'Playboi Carti',
   primaryGenreName:'Hip-Hop/Rap'
  }]});
  throw Error('Unexpected url '+url);
 },()=>discoverMusic('artists',{q:'Playboi Carti'}));
 assert.equal(results.source,'iTunes');
 assert.equal(results.fallback,true);
 assert.equal(results.artists[0].id,'itunes-2131694');
 assert.equal(results.artists[0].name,'Playboi Carti');
 assert.equal(seen.length,2);
});
test('MusicBrainz release-group timeout resolves to iTunes discography without extra email or MusicBrainz requests',async()=>{
 const seen=[];
 const id='01234567-89ab-4cde-8abc-123456789abc';
 const result=await withFetch(async url=>{
  seen.push(String(url));
  if(String(url).includes('musicbrainz.org'))return json({error:'busy'},503);
  if(String(url).includes('/search'))return json({results:[{
   wrapperType:'artist',artistId:10,artistName:'Playboi Carti'
  }]});
  if(String(url).includes('/lookup'))return json({results:[
   {wrapperType:'artist',artistId:10},
   {wrapperType:'collection',collectionId:42,collectionName:'Whole Lotta Red',
     artistName:'Playboi Carti',trackCount:24,releaseDate:'2020-12-25T00:00:00Z'},
   {wrapperType:'collection',collectionId:43,collectionName:'New Single - Single',
     artistName:'Playboi Carti',trackCount:1,releaseDate:'2025-07-01T00:00:00Z'}
  ]});
  throw Error('Unexpected URL '+url);
 },()=>discoverMusic('releases',{id,q:'Playboi Carti',page:0}));
 assert.equal(result.source,'iTunes');
 assert.equal(result.releases.length,2);
 assert.equal(result.releases[0].id,'itunes-42');
 assert.equal(result.releases[0].type,'album');
 assert.equal(result.releases[1].type,'single');
 assert.deepEqual(seen.map(x=>new URL(x).hostname),[
  'musicbrainz.org','itunes.apple.com','itunes.apple.com'
 ]);
});
test('iTunes artist IDs are supported for subsequent album selection; invalid IDs reject',async()=>{
 const result=await withFetch(async url=>{
  assert.match(String(url),/itunes\.apple\.com\/lookup\?/);
  return json({results:[{wrapperType:'collection',collectionId:88,
   collectionName:'The Album',trackCount:10,releaseDate:'2026-05-09T00:00:00Z'}]});
 },()=>discoverMusic('releases',{id:'itunes-14'}));
 assert.equal(result.releases[0].id,'itunes-88');
 await assert.rejects(()=>discoverMusic('releases',{id:'../../etc/passwd'}),{message:'BAD_REQUEST'});
});
test('Invite hash login uses no SMTP and directly verifies the code via Supabase Auth',()=>{
 const server=source('studio/api/manage.js');
 const ui=source('studio/app.js');
 assert.match(server,/auth\.admin\.generateLink/);
 assert.match(server,/properties\?\.hashed_token/);
 assert.match(server,/delivery:'copy_code'/);
 assert.doesNotMatch(server,/inviteUserByEmail/);
 assert.match(server,/candidate\?'magiclink':'invite'/);
 assert.match(ui,/s\.db\.auth\.verifyOtp\(\{token_hash:match\[2\],type:match\[1\]\}\)/);
 assert.match(ui,/data-action="auth-invite-code"/);
 assert.match(ui,/data-action="invite-copy"/);
 assert.doesNotMatch(ui,/localStorage\.setItem\('studio-team-invite-code/);
});
