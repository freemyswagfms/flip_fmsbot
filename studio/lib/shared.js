import {createHmac,timingSafeEqual} from 'node:crypto';

export function response(value,status=200){
 return new Response(JSON.stringify(value),{status,headers:{
 'content-type':'application/json; charset=utf-8','cache-control':'no-store',
 'x-content-type-options':'nosniff','referrer-policy':'no-referrer'
 }});
}
export const uuid=s=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
export const roleRank={editor:1,admin:2,owner:3};
export function settings(){
 const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY;
 if(!url||!key)throw new Error('STUDIO_CONFIG_MISSING');
 const u=new URL(url);
 if(u.protocol!=='https:'||!u.hostname.endsWith('.supabase.co')||u.username||u.password)
   throw new Error('STUDIO_CONFIG_MISSING');
 return {origin:u.origin,key};
}
export async function dbFetch(db,path,options={}){
 const method=options.method||'GET';
 const headers={apikey:db.key,'Content-Type':'application/json',
   Accept:'application/json',Prefer:options.prefer||'return=representation',
   ...options.headers};
 const res=await fetch(db.origin+'/rest/v1/'+path,{
   method,headers,body:options.body===undefined?undefined:JSON.stringify(options.body),
   signal:AbortSignal.timeout(18000),cache:'no-store'
 });
 const raw=await res.text();let data;
 try{data=raw?JSON.parse(raw):null}catch{data=null}
 if(!res.ok)throw Object.assign(new Error('STUDIO_DATABASE_ERROR'),{status:res.status});
 return data;
}
export async function authenticate(req,minRole='editor'){
 const header=req.headers.get('authorization')||'';
 if(!/^Bearer [a-zA-Z0-9._-]{30,}$/i.test(header))throw Object.assign(new Error('UNAUTHORIZED'),{status:401});
 const token=header.slice(7),db=settings();
 const auth=await fetch(db.origin+'/auth/v1/user',{
   headers:{apikey:db.key,Authorization:'Bearer '+token},
   cache:'no-store',signal:AbortSignal.timeout(12000)
 });
 if(!auth.ok)throw Object.assign(new Error('UNAUTHORIZED'),{status:401});
 const user=await auth.json();
 if(!uuid(user?.id))throw Object.assign(new Error('UNAUTHORIZED'),{status:401});
 const data=await dbFetch(db,'flip_studio_members?user_id=eq.'+encodeURIComponent(user.id)+
   '&select=user_id,email,role,active&limit=1');
 const member=data?.[0];
 if(!member?.active||roleRank[member.role]<roleRank[minRole])
   throw Object.assign(new Error('FORBIDDEN'),{status:403});
 return {user,member,db};
}
export async function authenticateUser(req){
 const header=req.headers.get('authorization')||'';
 if(!/^Bearer [a-zA-Z0-9._-]{30,}$/i.test(header))throw Object.assign(new Error('UNAUTHORIZED'),{status:401});
 const db=settings(),auth=await fetch(db.origin+'/auth/v1/user',{
 headers:{apikey:db.key,Authorization:header},cache:'no-store',signal:AbortSignal.timeout(12000)});
 if(!auth.ok)throw Object.assign(new Error('UNAUTHORIZED'),{status:401});
 const user=await auth.json();
 if(!uuid(user?.id)||!user.email)throw Object.assign(new Error('UNAUTHORIZED'),{status:401});
 return {user,db};
}
export function signPair(payload){
 const key=process.env.SUPABASE_SECRET_KEY;
 if(!key)throw new Error('STUDIO_CONFIG_MISSING');
 const part=Buffer.from(JSON.stringify(payload)).toString('base64url');
 const mac=createHmac('sha256',key).update('flip-studio-v1:'+part).digest('base64url');
 return part+'.'+mac;
}
export function verifyPair(ticket){
 const [part,signature,extra]=String(ticket||'').split('.');
 if(extra||!part||!signature||part.length>600)return null;
 const expected=signPair(JSON.parse(Buffer.from(part,'base64url').toString('utf8'))).split('.')[1];
 const a=Buffer.from(signature),b=Buffer.from(expected);
 if(a.length!==b.length||!timingSafeEqual(a,b))return null;
 const data=JSON.parse(Buffer.from(part,'base64url').toString('utf8'));
 if(data.v!==1||data.scope!=='studio_owner'||!uuid(data.n)||
  String(data.t)!==String(process.env.FLIP_ADMIN_TELEGRAM_ID)||!Number.isSafeInteger(data.e)||
  data.e<Date.now()||data.e>Date.now()+10*60*1000)return null;
 return data;
}
export function issueError(e){
 const allowed=['UNAUTHORIZED','FORBIDDEN','STUDIO_CONFIG_MISSING','BAD_REQUEST','ALREADY_CLAIMED',
 'STUDIO_OWNER_EXISTS','MISSING_ARTWORK','PUBLISH_FAILED','EMAIL_DELIVERY_UNAVAILABLE'];
 const message=allowed.includes(e?.message)?e.message:'STUDIO_SERVER_ERROR';
 return response({error:message},[400,401,403,409,422,500,502,503].includes(e?.status)?e.status:500);
}
