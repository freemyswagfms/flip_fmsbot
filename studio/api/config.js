/** Public app configuration only. No admin secrets are stored in Studio. */
export default async function handler(req){
 const headers={'content-type':'application/json; charset=utf-8',
   'cache-control':'no-store','x-content-type-options':'nosniff'};
 if(req.method!=='GET')return new Response(JSON.stringify({error:'METHOD_NOT_ALLOWED'}),
   {status:405,headers});
 const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_PUBLISHABLE_KEY;
 if(!url||!key)return new Response(JSON.stringify({error:'STUDIO_CONFIG_MISSING'}),
   {status:503,headers});
 return new Response(JSON.stringify({supabaseUrl:url,publishableKey:key,version:'0.9.0'}),
   {status:200,headers});
}
