import {response} from '../lib/shared.js';
export default async function handler(req){
 if(req.method!=='GET')return response({error:'METHOD_NOT_ALLOWED'},405);
 const url=process.env.SUPABASE_URL,publishable=process.env.SUPABASE_PUBLISHABLE_KEY;
 if(!url||!publishable)return response({error:'STUDIO_CONFIG_MISSING'},503);
 return response({supabaseUrl:url,publishableKey:publishable,version:'0.9.0'});
}
