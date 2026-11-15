/** FLIP STUDIO public startup configuration.
 * Vercel's named GET export uses the Web Response contract.
 * Never return Response from default (req, res): Vercel would ignore it. */
const headers={
  'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store, max-age=0',
  'x-content-type-options':'nosniff'
};
function json(value,status=200){
  return new Response(JSON.stringify(value),{status,headers});
}
export function GET(){
  const supabaseUrl=process.env.SUPABASE_URL;
  const publishableKey=process.env.SUPABASE_PUBLISHABLE_KEY;
  if(!supabaseUrl||!publishableKey)
    return json({error:'STUDIO_CONFIG_MISSING'},503);
  return json({supabaseUrl,publishableKey,version:'0.9.0'});
}
export function POST(){
  return json({error:'METHOD_NOT_ALLOWED'},405);
}
