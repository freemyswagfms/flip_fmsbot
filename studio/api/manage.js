import {createClient} from '@supabase/supabase-js';
import {response,authenticate,dbFetch,issueError,uuid} from './_shared.js';

const BASE_RARITIES=['common','rare','epic','legendary','mythic'];
const isEmail=value=>typeof value==='string'&&value.length<=254&&
 /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const checkOrigin=req=>{
 const source=req.headers.get('origin');
 return !source||source===new URL(req.url).origin;
};
const clientFor=db=>createClient(db.origin,db.key,{
 auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}
});
async function publish(auth,releaseId){
 if(!uuid(releaseId))return response({error:'BAD_REQUEST'},400);
 const {db,user}=auth;
 const rows=await dbFetch(db,'flip_studio_releases?id=eq.'+releaseId+
 '&select=id,slug,title,artist_id,status,artist:flip_studio_artists(slug,name)&limit=1');
 const release=rows?.[0];
 if(!release||!['draft','ready'].includes(release.status))
  return response({error:'INVALID_RELEASE_STATUS'},409);
 const variants=await dbFetch(db,'flip_studio_variants?release_id=eq.'+releaseId+
 '&select=release_id,rarity,processed_path,public_url,uploaded_by');
 const complete=BASE_RARITIES.every(r=>variants.some(v=>v.rarity===r&&v.processed_path));
 if(!complete)return response({error:'MISSING_ARTWORK',required:BASE_RARITIES},422);
 const supabase=clientFor(db);
 const chosen=variants.filter(v=>BASE_RARITIES.includes(v.rarity)||v.rarity==='hidden');
 const published=await Promise.all(chosen.map(async v=>{
   if(v.public_url)return {rarity:v.rarity,url:v.public_url};
   if(!v.processed_path.startsWith(String(v.uploaded_by)+'/'))throw new Error('BAD_IMAGE_REFERENCE');
   const {data:file,error:readError}=await supabase.storage.from('flip-studio-drafts').download(v.processed_path);
   if(readError||!file)throw new Error('ARTWORK_DOWNLOAD_FAILED');
   if(file.size>5242880||file.size===0)throw new Error('ARTWORK_TOO_LARGE');
   const path=release.artist.slug+'/'+release.slug+'/'+release.id+'/'+v.rarity+'.webp';
   const bytes=await file.arrayBuffer();
   const {error:writeError}=await supabase.storage.from('flip-artwork').upload(path,bytes,{
     contentType:'image/webp',cacheControl:'31536000',upsert:false
   });
   if(writeError&&!/already exists|duplicate/i.test(writeError.message||''))
      throw new Error('ARTWORK_PUBLICATION_FAILED');
   const {data}=supabase.storage.from('flip-artwork').getPublicUrl(path);
   if(!data?.publicUrl)throw new Error('ARTWORK_PUBLICATION_FAILED');
   return {rarity:v.rarity,url:data.publicUrl};
 }));
 for(const item of published){
   await dbFetch(db,'flip_studio_variants?release_id=eq.'+releaseId+
    '&rarity=eq.'+item.rarity,{method:'PATCH',body:{public_url:item.url}});
 }
 const result=await dbFetch(db,'rpc/flip_studio_commit_release',{method:'POST',body:{
   p_release_id:releaseId,p_actor:user.id
 }});
 return response({ok:true,release:release.title,...result});
}
async function invite(auth,email,role,request){
 if(auth.member.role!=='owner')return response({error:'FORBIDDEN'},403);
 if(!isEmail(email)||!['admin','editor'].includes(role))return response({error:'BAD_REQUEST'},400);
 const supabase=clientFor(auth.db);
 const base=new URL(request.url).origin;
 // Adding existing verified Auth users is supported, too.
 let candidate=null;
 for(let page=1;page<=5;page++){
   const {data,error}=await supabase.auth.admin.listUsers({page,perPage:200});
   if(error)throw new Error('AUTH_LIST_FAILED');
   candidate=(data.users||[]).find(u=>u.email?.toLowerCase()===email.toLowerCase())||null;
   if(candidate||(data.users||[]).length<200)break;
 }
 if(!candidate){
   const {data,error}=await supabase.auth.admin.inviteUserByEmail(email,{redirectTo:base});
   if(error)return response({error:'EMAIL_DELIVERY_UNAVAILABLE',
     hint:'Настройте SMTP и разрешённый URL в Supabase Auth, затем повторите.'},502);
   candidate=data.user;
 }
 if(!candidate?.id)return response({error:'INVITE_FAILED'},502);
 const payload={user_id:candidate.id,email:email.toLowerCase(),role,active:true};
 await dbFetch(auth.db,'flip_studio_members?on_conflict=user_id',{
 method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:payload});
 await dbFetch(auth.db,'flip_studio_audit',{method:'POST',body:{
   actor:auth.user.id,action:'invite_or_change_role',entity:'member',
   detail:{email:email.toLowerCase(),role}
 }});
 return response({ok:true,email,role,invited:!candidate.email_confirmed_at});
}
async function team(auth){
 if(auth.member.role!=='owner')return response({error:'FORBIDDEN'},403);
 const members=await dbFetch(auth.db,'flip_studio_members?select=user_id,email,role,active,created_at&order=created_at.asc');
 return response({members});
}
export default async function handler(req){
 if(!['GET','POST'].includes(req.method))return response({error:'METHOD_NOT_ALLOWED'},405);
 if(!checkOrigin(req))return response({error:'FORBIDDEN'},403);
 try{
   if(req.method==='GET'){
     const auth=await authenticate(req,'owner');return team(auth);
   }
   const body=await req.json();
   if(!body||typeof body!=='object')return response({error:'BAD_REQUEST'},400);
   const action=body.action;
   const auth=await authenticate(req,action==='invite'?'owner':'admin');
   if(action==='invite')return invite(auth,String(body.email||''),body.role,req);
   if(action==='publish')return publish(auth,body.releaseId);
   return response({error:'BAD_REQUEST'},400);
 }catch(e){return issueError(e)}
}
