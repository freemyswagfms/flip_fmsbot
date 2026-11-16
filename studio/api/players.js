/* FLIP STUDIO — creator-only game player directory and moderation.
 * Privileged actions require a verified Supabase Auth owner session.
 * All writes are atomic, owner-audited RPCs; never use client player IDs as actors.
 */
import {authenticate,dbFetch,issueError,response,uuid} from '../lib/shared.js';

const playerId=value=>typeof value==='string'&&/^[1-9]\d{0,15}$/.test(value)&&
  Number.isSafeInteger(Number(value));
const cardId=value=>typeof value==='string'&&value.length<=160&&
  /^[a-z0-9-]+\/[a-z0-9-]+\/(common|rare|epic|legendary|mythic|hidden)$/.test(value);

async function rpc(db,name,params){
 return dbFetch(db,'rpc/'+name,{method:'POST',body:params});
}

function safeError(error){
 const value=String(error?.message||'');
 const codes=['PLAYER_NOT_FOUND','CARD_NOT_OWNED','CARD_COUNT_CHANGED',
   'DUPLICATE_REQUEST_ACTION','BAD_REQUEST','FORBIDDEN'];
 return codes.find(code=>value.includes(code))||'PLAYER_OPERATION_FAILED';
}

export default async function handler(request){
 if(!['GET','POST'].includes(request.method))return response({error:'METHOD_NOT_ALLOWED'},405);
 const origin=request.headers.get('origin');
 if(origin&&origin!=='https://flip-studio-six.vercel.app'&&
   origin!==new URL(request.url).origin)
   return response({error:'FORBIDDEN'},403);
 try{
  const auth=await authenticate(request,'owner');
  if(auth.member.role!=='owner')return response({error:'FORBIDDEN'},403);
  if(request.method==='GET'){
    const params=new URL(request.url).searchParams;
    const view=params.get('view')||'list';
    if(view==='list'){
      const q=(params.get('q')||'').trim();
      const offset=Number(params.get('offset')||0);
      if(q.length>80||!Number.isSafeInteger(offset)||offset<0||offset>1000000)
        return response({error:'BAD_REQUEST'},400);
      const result=await rpc(auth.db,'flip_studio_player_search',{
        p_query:q,p_limit:25,p_offset:offset
      });
      return response(result);
    }
    if(view==='detail'){
      const id=params.get('id'),offset=Number(params.get('offset')||0);
      if(!playerId(id)||!Number.isSafeInteger(offset)||offset<0||offset>1000000)
        return response({error:'BAD_REQUEST'},400);
      return response(await rpc(auth.db,'flip_studio_player_detail',{
        p_target_id:Number(id),p_limit:50,p_offset:offset
      }));
    }
    return response({error:'BAD_REQUEST'},400);
  }
  if(Number(request.headers.get('content-length')||0)>2000)
    return response({error:'BAD_REQUEST'},400);
  const raw=await request.text();
  if(raw.length>2000)return response({error:'BAD_REQUEST'},400);
  let body;
  try{body=JSON.parse(raw);}catch{return response({error:'BAD_REQUEST'},400)}
  if(!body||typeof body!=='object'||Array.isArray(body)||
    !['ban','unban','remove_card'].includes(body.action)||
    !playerId(body.playerId)||!uuid(body.requestId))
   return response({error:'BAD_REQUEST'},400);
  const action=body.action;
  const reason=String(body.reason||'').trim();
  if(reason.length>300||(action!=='unban'&&reason.length<3))
    return response({error:'BAD_REQUEST'},400);
  if(action==='remove_card'&&(!cardId(body.cardId)||
    !['ranked','test'].includes(body.kind)||
    !Number.isSafeInteger(body.quantity)||body.quantity<1||body.quantity>100))
   return response({error:'BAD_REQUEST'},400);
  const ownerTelegramId=(process.env.FLIP_ADMIN_TELEGRAM_ID||'').trim();
  if(!playerId(ownerTelegramId))return response({error:'STUDIO_CONFIG_MISSING'},503);
  const target=Number(body.playerId);
  if(action==='ban'&&body.playerId===ownerTelegramId)
    return response({error:'FORBIDDEN'},403);
  try{
   const result=await rpc(auth.db,'flip_studio_player_action',{
     p_actor:auth.user.id,p_owner_telegram_id:Number(ownerTelegramId),
     p_target_id:target,p_action:action,
     p_card_id:action==='remove_card'?body.cardId:null,
     p_kind:action==='remove_card'?body.kind:null,
     p_quantity:action==='remove_card'?body.quantity:null,
     p_reason:reason,p_request_id:body.requestId
   });
   return response(result);
  }catch(e){
   const code=safeError(e);
   return response({error:code},code==='PLAYER_NOT_FOUND'?404:
     code==='FORBIDDEN'?403:code==='BAD_REQUEST'?400:409);
  }
 }catch(e){return issueError(e);}
}
