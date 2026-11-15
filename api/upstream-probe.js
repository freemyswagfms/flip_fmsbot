// Temporary fixed-source connectivity probe; removed before merge.
export async function GET(){
 const targets=[
  ['musicbrainz','https://musicbrainz.org/ws/2/artist?query=artist%3A%22Playboi%20Carti%22&fmt=json&limit=1'],
  ['itunes','https://itunes.apple.com/search?term=Playboi%20Carti&media=music&entity=musicArtist&country=us&limit=2']
 ];
 const results=await Promise.all(targets.map(async ([name,url])=>{
  try{
   const r=await fetch(url,{signal:AbortSignal.timeout(5000),
    headers:{Accept:'application/json','User-Agent':'FLIPStudio/0.9.0 (https://flip-studio-six.vercel.app)'}});
   let size=0,valid=false;
   if(r.ok){const t=await r.text();size=t.length;valid=!!JSON.parse(t)}
   return {name,status:r.status,valid,size}
  }catch(e){return {name,error:String(e.name||e.message).slice(0,60)}}
 }));
 return new Response(JSON.stringify({results}),{status:200,headers:{
  'content-type':'application/json','cache-control':'no-store'}});
}
