/* FLIP STUDIO / tasks: Owner-only task slot editor. */
import {response,authenticate,dbFetch,issueError} from '../lib/shared.js';
import {normalizeTarget,assertBotCanVerify} from '../../api/task-bot.js';

const defaults={
 daily:[
  ['Открой бесплатный дроп','Обычный дроп, не приветственный'],
  ['Получи новую карточку','Открой ранее неизвестную разновидность'],
  ['Открой стандартный пак','Приобрети пак за F']
 ],
 weekly:[
  ['Открой 5 бесплатных дропов','Пять обычных дропов за неделю'],
  ['Собери 5 новых карточек','Пять новых разновидностей за неделю'],
  ['Открой 3 стандартных пака','Три пака за неделю']
 ]
};
function validScope(scope,slot){
 return Object.hasOwn(defaults,scope)&&Number.isInteger(slot)&&slot>=1&&slot<=3;
}
function validReward(f,xp){
 return Number.isInteger(f)&&Number.isInteger(xp)&&f>=0&&f<=1000&&xp>=0&&xp<=300;
}
function handleError(e){
 const code=e?.message||'';
 if(['BOT_NOT_CONFIGURED','BOT_NOT_ADMIN','NOT_A_CHANNEL','CHANNEL_MISMATCH',
      'TELEGRAM_CHECK_FAILED'].includes(code))
   return response({error:code},code==='TELEGRAM_CHECK_FAILED'?503:422);
 return issueError(e);
}
export default async function handler(req){
 if(!['GET','POST'].includes(req.method))return response({error:'METHOD_NOT_ALLOWED'},405);
 const origin=req.headers.get('origin');
 if(origin&&origin!=='https://flip-studio-six.vercel.app'&&origin!==new URL(req.url).origin)
   return response({error:'FORBIDDEN'},403);
 try{
   const auth=await authenticate(req,'owner');
   if(auth.member.role!=='owner')return response({error:'FORBIDDEN'},403);
   if(req.method==='GET'){
     const slots=await dbFetch(auth.db,'flip_task_slots?select=*&order=scope.asc,slot.asc');
     return response({slots});
   }
   const raw=await req.text();
   if(raw.length>2000)return response({error:'BAD_REQUEST'},400);
   let body;
   try{body=JSON.parse(raw);}catch{return response({error:'BAD_REQUEST'},400);}
   const scope=body.scope,slot=body.slot,kind=body.kind;
   if(!validScope(scope,slot)||!['default','subscription'].includes(kind))
     return response({error:'BAD_REQUEST'},400);
   let update;
   if(kind==='default'){
     const [title,description]=defaults[scope][slot-1];
     update={kind,title,description,channel_url:null,channel_id:null,
       ends_at:null,reward_f:scope==='daily'?30:100,reward_xp:scope==='daily'?20:60};
   }else{
     const title=String(body.title||'').trim(),description=String(body.description||'').trim();
     const rewardF=body.rewardF,rewardXp=body.rewardXp;
     const target=normalizeTarget(body.url,body.channelId);
     if(title.length<3||title.length>100||description.length>240||!target||
        !validReward(rewardF,rewardXp))return response({error:'BAD_REQUEST'},400);
     let endAt=null;
     if(body.endsAt){
       const ms=Date.parse(body.endsAt);
       if(!Number.isFinite(ms)||ms<=Date.now()||ms>Date.now()+366*86400000)
         return response({error:'BAD_REQUEST'},400);
       endAt=new Date(ms).toISOString();
     }
     const chatId=await assertBotCanVerify(target);
     update={kind,title,description,channel_url:target.url,
       channel_id:chatId,reward_f:rewardF,reward_xp:rewardXp,ends_at:endAt};
   }
   update.version=crypto.randomUUID();
   update.updated_at=new Date().toISOString();
   const slots=await dbFetch(auth.db,'flip_task_slots?scope=eq.'+scope+'&slot=eq.'+slot,{
     method:'PATCH',body:update
   });
   if(!Array.isArray(slots)||slots.length!==1)return response({error:'TASK_SLOT_NOT_FOUND'},404);
   await dbFetch(auth.db,'flip_studio_audit',{method:'POST',body:{
     actor:auth.user.id,action:'task_slot_updated',entity:'task',
     detail:{scope,slot,kind,title:update.title,reward_f:update.reward_f}
   }});
   return response({ok:true,slot:slots[0]});
 }catch(e){return handleError(e);}
}
