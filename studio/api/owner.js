import {response,authenticateUser,dbFetch,verifyPair,issueError} from '../lib/shared.js';
export default async function handler(req){
 if(req.method!=='POST')return response({error:'METHOD_NOT_ALLOWED'},405);
 try{
   const {user,db}=await authenticateUser(req);
   const body=await req.json();
   const payload=verifyPair(body.ticket);
   if(!payload)return response({error:'INVALID_OWNER_TICKET'},403);
   const existing=await dbFetch(db,'flip_studio_members?role=eq.owner&active=eq.true&select=user_id&limit=1');
   if(existing?.length&&existing[0].user_id!==user.id)return response({error:'STUDIO_OWNER_EXISTS'},409);
   // One-time token cannot be replayed even if it is copied from the URL.
   try{
     await dbFetch(db,'flip_studio_claims',{method:'POST',body:{nonce:payload.n,user_id:user.id}});
   }catch{return response({error:'ALREADY_CLAIMED'},409)}
   await dbFetch(db,'flip_studio_members?on_conflict=user_id',{
     method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},
     body:{user_id:user.id,email:user.email,role:'owner',active:true}
   });
   await dbFetch(db,'flip_studio_audit',{method:'POST',body:{
     actor:user.id,action:'owner_activated',entity:'studio',detail:{via:'FLIP Telegram admin'}
   }});
   return response({ok:true,role:'owner'});
 }catch(e){return issueError(e)}
}
