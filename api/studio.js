/** FLIP STUDIO backend gateway.
 * Secrets remain in the EXISTING FLIP Vercel project. The separate Studio site
 * contains only a public Supabase publishable key and sends JWTs here.
 * Routes cannot touch the Telegram rewards admin. */
import music from '../studio/api/music.js';
import owner from '../studio/api/owner.js';
import manage from '../studio/api/manage.js';
import tasks from '../studio/api/tasks.js';
import players from '../studio/api/players.js';

const STUDIO_ORIGIN='https://flip-studio-six.vercel.app';
const routes={music,owner,manage,tasks,players};
function corsHeaders(){
  return {'Access-Control-Allow-Origin':STUDIO_ORIGIN,'Access-Control-Allow-Headers':
    'authorization,content-type','Access-Control-Allow-Methods':'GET,POST,OPTIONS',
    'Access-Control-Max-Age':'600','Vary':'Origin'};
}
export async function handleStudioRequest(request){
  const origin=request.headers.get('origin');
  if(origin&&origin!==STUDIO_ORIGIN)
    return new Response(JSON.stringify({error:'FORBIDDEN'}),{
      status:403,headers:{'content-type':'application/json','cache-control':'no-store'}});
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:corsHeaders()});
  const url=new URL(request.url);
  const route=url.searchParams.get('route');
  if(!Object.prototype.hasOwnProperty.call(routes,route))
    return new Response(JSON.stringify({error:'NOT_FOUND'}),{status:404,headers:{
      ...corsHeaders(),'content-type':'application/json','cache-control':'no-store'}});
  let result;
  try{result=await routes[route](request);}
  catch{result=new Response(JSON.stringify({error:'STUDIO_SERVER_ERROR'}),{status:500,headers:{
    'content-type':'application/json','cache-control':'no-store'}});}
  const response=new Response(result.body,{status:result.status,headers:result.headers});
  for(const [k,v] of Object.entries(corsHeaders()))response.headers.set(k,v);
  response.headers.set('cache-control','no-store');
  return response;
}
export default {fetch:handleStudioRequest};
