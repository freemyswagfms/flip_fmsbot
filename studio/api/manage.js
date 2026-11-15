import {createClient} from '@supabase/supabase-js';
import {response,authenticate,dbFetch,issueError,uuid} from '../lib/shared.js';

const BASE_RARITIES=['common','rare','epic','legendary','mythic'];
const isEmail=value=>typeof value==='string'&&value.length<=254&&
 /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const checkOrigin=req=>{
 const source=req.headers.get('origin');
 return !source||source==='https://flip-studio-six.vercel.app'||source===new URL(req.url).origin;
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
 email=String(email||'').trim().toLowerCase();
 if(!isEmail(email)||!['admin','editor'].includes(role))return response({error:'BAD_REQUEST'},400);
 const supabase=clientFor(auth.db);
 const base='https://flip-studio-six.vercel.app';
 // The owner generates a one-time login/invitation link, without contacting
 // Supabase SMTP or disclosing the project's service role key to browsers.
 let candidate=null;
 for(let page=1;page<=5;page++){
   const {data,error}=await supabase.auth.admin.listUsers({page,perPage:200});
   if(error)throw new Error('AUTH_LIST_FAILED');
   candidate=(data.users||[]).find(u=>u.email?.toLowerCase()===email)||null;
   if(candidate||(data.users||[]).length<200)break;
 }
 // For an existing Auth account issue a fresh login link. For a new account
 // issue an invite link. Both are single-use, and must be shared by the owner.
 const {data,error}=await supabase.auth.admin.generateLink({
   type:candidate?'magiclink':'invite',
   email,
   options:{redirectTo:base}
 });
 const actionLink=data?.properties?.action_link;
 const hashedToken=data?.properties?.hashed_token;
 if(error||!data?.user?.id||typeof actionLink!=='string'||
    typeof hashedToken!=='string'||!/^[A-Za-z0-9_-]{32,256}$/.test(hashedToken))
   return response({error:'INVITE_LINK_UNAVAILABLE'},502);
 let secureLink;
 try{
   secureLink=new URL(actionLink);
   if(secureLink.protocol!=='https:'||secureLink.origin!==auth.db.origin||
      secureLink.pathname!=='/auth/v1/verify'||secureLink.username||secureLink.password)
     return response({error:'INVITE_LINK_UNAVAILABLE'},502);
 }catch{return response({error:'INVITE_LINK_UNAVAILABLE'},502)}
 const user=data.user;
 if(user.email?.toLowerCase()!==email)return response({error:'INVITE_LINK_UNAVAILABLE'},502);
 const payload={user_id:user.id,email,role,active:true};
 await dbFetch(auth.db,'flip_studio_members?on_conflict=user_id',{
   method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:payload
 });
 await dbFetch(auth.db,'flip_studio_audit',{method:'POST',body:{
   actor:auth.user.id,action:'invite_or_change_role',entity:'member',
   detail:{email,role,delivery:'manual_link'}
 }});
 // A token hash can be redeemed by POST verifyOtp instead of clicking a GET
 // link, preventing chat link previews/scanners from consuming the one-time
 // session before the intended team member opens it. Never log this secret.
 return response({ok:true,email,role,delivery:'copy_code',inviteCode:
   (candidate?'magiclink':'invite')+'.'+hashedToken,url:secureLink.href});
}

const safeSlug=s=>typeof s==='string'&&/^[a-z0-9][a-z0-9-]{1,63}$/.test(s);
const safeImageCard=s=>typeof s==='string'&&s.length<=220&&
 /^([a-z0-9][a-z0-9-]{1,63})\/([a-z0-9][a-z0-9-]{1,63})\/(common|rare|epic|legendary|mythic|hidden)$/.test(s);
function isWebp(buffer){
 const b=new Uint8Array(buffer);
 return b.length>20 && b[0]===82 && b[1]===73 && b[2]===70 && b[3]===70 &&
   b[8]===87 && b[9]===69 && b[10]===66 && b[11]===80 &&
   ['VP8 ','VP8L','VP8X'].includes(String.fromCharCode(...b.slice(12,16)));
}
async function catalog(auth){
 const result=await dbFetch(auth.db,'rpc/flip_public_catalog',{method:'POST',body:{}});
 return response({catalog:result});
}
async function updateMember(auth,body){
 // No one can demote the owner or promote another user to owner.
 if(auth.member.role!=='owner')return response({error:'FORBIDDEN'},403);
 const memberId=body.userId;
 if(!uuid(memberId)||!['admin','editor'].includes(body.role)||
    typeof body.active!=='boolean'||memberId===auth.user.id)
   return response({error:'BAD_REQUEST'},400);
 const existing=await dbFetch(auth.db,'flip_studio_members?user_id=eq.'+
   encodeURIComponent(memberId)+'&select=user_id,email,role,active&limit=1');
 const current=existing?.[0];
 if(!current||current.role==='owner')return response({error:'MEMBER_NOT_EDITABLE'},409);
 const updated=await dbFetch(auth.db,'flip_studio_members?user_id=eq.'+
   encodeURIComponent(memberId)+'&role=neq.owner',{
    method:'PATCH',body:{role:body.role,active:body.active}
   });
 if(updated?.length!==1)return response({error:'MEMBER_NOT_EDITABLE'},409);
 await dbFetch(auth.db,'flip_studio_audit',{method:'POST',body:{
  actor:auth.user.id,action:'member_updated',entity:'member',
  detail:{user_id:memberId,email:current.email,old_role:current.role,
    new_role:body.role,old_active:current.active,new_active:body.active}
 }});
 return response({ok:true,member:updated[0]});
}
async function replaceArtwork(auth,body){
 if(!['owner','admin'].includes(auth.member.role))return response({error:'FORBIDDEN'},403);
 const cardId=body?.cardId,source=body?.processedPath;
 if(!safeImageCard(cardId)||typeof source!=='string'||source.length>330)
   return response({error:'BAD_REQUEST'},400);
 const [artist,release,rarity]=cardId.split('/');
 const prefix=auth.user.id+'/published/'+artist+'/'+release+'/'+rarity+'/';
 if(!source.startsWith(prefix)||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-1024\.webp$/.test(source.slice(prefix.length)))
   return response({error:'BAD_IMAGE_REFERENCE'},400);
 // Ensure this artwork belongs to an existing game card and an active release.
 const rows=await dbFetch(auth.db,'flip_cards?id=eq.'+encodeURIComponent(cardId)+
    '&select=id,artist_id,release_id,rarity,active&limit=1');
 const card=rows?.[0];
 if(!card||!card.active||card.artist_id!==artist||card.release_id!==release||card.rarity!==rarity)
   return response({error:'CARD_NOT_FOUND'},404);
 const releaseRows=await dbFetch(auth.db,'flip_releases?artist_id=eq.'+
   encodeURIComponent(artist)+'&id=eq.'+encodeURIComponent(release)+
   '&select=active&limit=1');
 if(!releaseRows?.[0]?.active)return response({error:'CARD_NOT_FOUND'},404);
 const supabase=clientFor(auth.db);
 const {data:file,error:readError}=await supabase.storage.from('flip-studio-drafts').download(source);
 if(readError||!file)return response({error:'ARTWORK_DOWNLOAD_FAILED'},422);
 if(file.size===0||file.size>5242880)return response({error:'ARTWORK_TOO_LARGE'},422);
 const bytes=await file.arrayBuffer();
 if(!isWebp(bytes))return response({error:'INVALID_ARTWORK_FORMAT'},422);
 // The new filename is immutable so client and CDN caches cannot show stale art.
 const publicPath=artist+'/'+release+'/revisions/'+rarity+'-'+crypto.randomUUID()+'.webp';
 const {error:uploadError}=await supabase.storage.from('flip-artwork').upload(publicPath,bytes,{
  contentType:'image/webp',cacheControl:'31536000',upsert:false
 });
 if(uploadError)return response({error:'ARTWORK_PUBLICATION_FAILED'},502);
 const {data:pub}=supabase.storage.from('flip-artwork').getPublicUrl(publicPath);
 if(!pub?.publicUrl)return response({error:'ARTWORK_PUBLICATION_FAILED'},502);
 const old=await dbFetch(auth.db,'flip_artwork_overrides?card_id=eq.'+
    encodeURIComponent(cardId)+'&select=public_url&limit=1');
 // Only the service account can modify this table. IDs and all owned player
 // cards remain unchanged; the game's catalogue resolves this URL on refresh.
 await dbFetch(auth.db,'flip_artwork_overrides?on_conflict=card_id',{
   method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},
   body:{card_id:cardId,public_url:pub.publicUrl,updated_by:auth.user.id,
    updated_at:new Date().toISOString()}
 });
 await dbFetch(auth.db,'flip_studio_audit',{method:'POST',body:{
  actor:auth.user.id,action:'replace_artwork',entity:'card',
  detail:{card_id:cardId,previous_url:old?.[0]?.public_url||null,
    public_url:pub.publicUrl,source:'studio'}
 }});
 return response({ok:true,cardId,artUrl:pub.publicUrl});
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
     const view=new URL(req.url).searchParams.get('view');
     if(view==='catalog')return catalog(await authenticate(req,'editor'));
     if(!view||view==='team')return team(await authenticate(req,'owner'));
     return response({error:'BAD_REQUEST'},400);
   }
   const body=await req.json();
   if(!body||typeof body!=='object')return response({error:'BAD_REQUEST'},400);
   const action=body.action;
   const auth=await authenticate(req,
    ['invite','update_member'].includes(action)?'owner':'admin');
   if(action==='invite')return invite(auth,String(body.email||''),body.role,req);
   if(action==='update_member')return updateMember(auth,body);
   if(action==='replace_artwork')return replaceArtwork(auth,body);
   if(action==='publish')return publish(auth,body.releaseId);
   return response({error:'BAD_REQUEST'},400);
 }catch(e){return issueError(e)}
}
