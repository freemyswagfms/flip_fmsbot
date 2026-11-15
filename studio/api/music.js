import {response,authenticate,issueError} from './_shared.js';
const normalize=q=>String(q||'').trim().slice(0,90);
export default async function handler(req){
 if(req.method!=='GET')return response({error:'METHOD_NOT_ALLOWED'},405);
 try{
   await authenticate(req,'editor');
   const u=new URL(req.url),kind=u.searchParams.get('kind')||'artists';
   const query=normalize(u.searchParams.get('q'));
   const id=u.searchParams.get('id')||'';
   let path;
   if(kind==='artists'){
     if(query.length<2)return response({error:'BAD_REQUEST'},400);
     path='artist?query='+encodeURIComponent('artist:"'+query.replace(/"/g,'')+'"')+'&fmt=json&limit=12';
   }else if(kind==='releases'){
     if(!/^[0-9a-f-]{36}$/i.test(id))return response({error:'BAD_REQUEST'},400);
     const page=Math.min(15,Math.max(0,Number(u.searchParams.get('page'))||0));
     path='release-group?artist='+encodeURIComponent(id)+'&fmt=json&limit=100&offset='+(page*100);
   }else return response({error:'BAD_REQUEST'},400);
   const upstream=await fetch('https://musicbrainz.org/ws/2/'+path,{
     headers:{'User-Agent':'FLIPStudio/0.9.0 (https://flip-studio.vercel.app)','Accept':'application/json'},
     signal:AbortSignal.timeout(12000)
   });
   if(!upstream.ok)return response({error:'MUSIC_CATALOG_UNAVAILABLE'},502);
   const data=await upstream.json();
   if(kind==='artists')return response({artists:(data.artists||[]).map(a=>({
     id:a.id,name:a.name,score:a.score,disambiguation:a.disambiguation||'',
     country:a.country||''
   }))});
   const entries=(data['release-groups']||[]).map(r=>{
     const primary=String(r['primary-type']||'').toLowerCase();
     const secondary=(r['secondary-types']||[]).map(t=>t.toLowerCase());
     const type=secondary.includes('mixtape/street')?'mixtape':
       secondary.includes('compilation')?'compilation':
       primary==='ep'?'ep':primary==='single'?'single':primary==='album'?'album':'other';
     return {id:r.id,title:r.title,type,date:r['first-release-date']||'',primary,secondary};
   });
   return response({releases:entries,count:data['release-group-count']||entries.length});
 }catch(e){return issueError(e)}
}
