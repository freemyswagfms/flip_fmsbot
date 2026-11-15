/* FLIP STUDIO music discovery.
 * MusicBrainz is rate limited by shared IP (~1 request/sec). iTunes Search
 * provides a separate keyless fallback for discovery/metadata only.
 * No audio, preview, or artwork is imported from any music service. */
import {response,authenticate,issueError} from '../lib/shared.js';
const normalize=q=>String(q||'').trim().slice(0,90);
const validMBID=id=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
const iTunesId=id=>/^itunes-([1-9]\d{0,15})$/.exec(id)?.[1]||'';
const artistName=a=>String(a||'').trim().slice(0,90);
const UAGENT='FLIPStudio/0.9.0 (https://flip-studio-six.vercel.app)';
const artistResult=a=>({
 id:a.id,name:a.name,score:a.score,disambiguation:a.disambiguation||'',
 country:a.country||'',source:'MusicBrainz'
});
const releaseResult=r=>{
 const primary=String(r['primary-type']||'').toLowerCase();
 const secondary=(r['secondary-types']||[]).map(t=>String(t).toLowerCase());
 const type=secondary.includes('mixtape/street')?'mixtape':
   secondary.includes('compilation')?'compilation':
   primary==='ep'?'ep':primary==='single'?'single':primary==='album'?'album':'other';
 return {id:r.id,title:r.title,type,date:r['first-release-date']||'',primary,secondary,source:'MusicBrainz'};
};
async function getJSON(url,{agent=false}={}){
 const res=await fetch(url,{
  headers:{Accept:'application/json',...(agent?{'User-Agent':UAGENT}:{})},
  signal:AbortSignal.timeout(6500),cache:'no-store'
 });
 if(!res.ok)throw Object.assign(new Error('UPSTREAM_UNAVAILABLE'),{upstreamStatus:res.status});
 return res.json();
}
async function searchApple(query){
 const params=new URLSearchParams({term:query,media:'music',entity:'musicArtist',
  country:'us',limit:'20',explicit:'Yes'});
 const data=await getJSON('https://itunes.apple.com/search?'+params.toString());
 const seen=new Set();
 return (data.results||[]).filter(a=>{
  if(a.wrapperType!=='artist'||!Number.isSafeInteger(a.artistId)||seen.has(a.artistId))return false;
  seen.add(a.artistId);return true;
 }).map(a=>({
  id:'itunes-'+a.artistId,name:String(a.artistName||'').slice(0,180),
  country:'',score:Math.round(100*Math.max(0,1-(seen.size-1)*.05)),
  disambiguation:String(a.primaryGenreName||'').slice(0,80),source:'iTunes'
 })).filter(a=>a.name);
}
async function appleReleases(rawId,query=''){
 let id=rawId;
 if(!id&&query){
  const artists=await searchApple(query);
  const wanted=query.toLowerCase().trim();
  const exact=artists.find(a=>a.name.toLowerCase()===wanted)||artists[0];
  id=iTunesId(exact?.id||'');
 }
 if(!id)return {releases:[],count:0,source:'iTunes'};
 const params=new URLSearchParams({id,entity:'album',country:'us',limit:'200'});
 const data=await getJSON('https://itunes.apple.com/lookup?'+params.toString());
 const seen=new Set();
 const releases=(data.results||[]).filter(item=>{
  if(item.wrapperType!=='collection'||!Number.isSafeInteger(item.collectionId)||
     !item.collectionName||seen.has(item.collectionId))return false;
  seen.add(item.collectionId);return true;
 }).map(item=>{
  const n=Number(item.trackCount)||0;
  const name=String(item.collectionName||'').slice(0,250);
  const type=/\bEP\b/i.test(name)?'ep':/\b(single| - single)\b/i.test(name)||n<=2?
    'single':n<=6&&n>0?'ep':'album';
  return {
    id:'itunes-'+item.collectionId,title:name,type,
    date:String(item.releaseDate||'').slice(0,10),
    source:'iTunes',primary:'album',secondary:[],artistName:item.artistName||''
  };
 });
 return {releases,count:releases.length,source:'iTunes'};
}
export async function lookupMusicBrainz(kind,{query,id,page}){
 if(kind==='artists'){
  const path='artist?query='+encodeURIComponent('artist:"'+query.replace(/"/g,'')+'"')+
   '&fmt=json&limit=12';
  const data=await getJSON('https://musicbrainz.org/ws/2/'+path,{agent:true});
  const artists=(data.artists||[]).map(artistResult);
  return {artists,source:'MusicBrainz'};
 }
 const path='release-group?artist='+encodeURIComponent(id)+'&fmt=json&limit=100&offset='+(page*100);
 const data=await getJSON('https://musicbrainz.org/ws/2/'+path,{agent:true});
 const releases=(data['release-groups']||[]).map(releaseResult);
 return {releases,count:data['release-group-count']||releases.length,source:'MusicBrainz'};
}
export async function discoverMusic(kind,{q='',id='',page=0}={}){
 const query=normalize(q);
 if(kind==='artists'){
  if(query.length<2)throw Object.assign(new Error('BAD_REQUEST'),{status:400});
  try{
   const result=await lookupMusicBrainz('artists',{query});
   if(result.artists.length)return result;
  }catch(_){/* iTunes fallback when MusicBrainz rejects or times out */}
  const artists=await searchApple(query);
  return {artists,source:'iTunes',fallback:true};
 }
 if(kind!=='releases'||page<0||page>15||(!validMBID(id)&&!iTunesId(id)))
  throw Object.assign(new Error('BAD_REQUEST'),{status:400});
 if(iTunesId(id))return appleReleases(iTunesId(id));
 try{
  const data=await lookupMusicBrainz('releases',{id,page});
  if(data.releases.length||page>0)return data;
 }catch(_){/* Alternative metadata, not audio */}
 // If the original artist came from MusicBrainz, use its display name to
 // locate the corresponding iTunes artist, without assuming ID equivalence.
 if(query.length<2)throw Object.assign(new Error('MUSIC_CATALOG_UNAVAILABLE'),{status:502});
 const result=await appleReleases('',query);
 return {...result,fallback:true};
}
export default async function handler(req){
 if(req.method!=='GET')return response({error:'METHOD_NOT_ALLOWED'},405);
 try{
  await authenticate(req,'editor');
  const u=new URL(req.url),kind=u.searchParams.get('kind')||'artists';
  const id=u.searchParams.get('id')||'';
  const page=Math.min(15,Math.max(0,Number(u.searchParams.get('page'))||0));
  const data=await discoverMusic(kind,{q:u.searchParams.get('q')||'',id,page});
  return response(data);
 }catch(e){
  if(e.message==='UPSTREAM_UNAVAILABLE'||e.name==='TimeoutError'||e.message==='fetch failed')
   return response({error:'MUSIC_CATALOG_UNAVAILABLE'},502);
  return issueError(e);
 }
}
