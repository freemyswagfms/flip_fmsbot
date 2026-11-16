/* FLIP v0.9.4.2: read public Telegram profile photos server-side.
 * Never disclose the bot token, Telegram numeric IDs, or Telegram file URLs.
 */
const TOKEN_RE=/^[0-9]+:[A-Za-z0-9_-]{10,}$/;
const PATH_RE=/^photos\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\.(?:jpg|jpeg|png|webp)$/i;
const MAX_IMAGE_BYTES=256*1024;

async function telegramJSON(token,method,payload,http) {
  const response=await http('https://api.telegram.org/bot'+token+'/'+method,{
    method:'POST',
    headers:{'content-type':'application/json','accept':'application/json'},
    body:JSON.stringify(payload),
    cache:'no-store',
    signal:AbortSignal.timeout(3500)
  });
  if(!response.ok)return null;
  const result=await response.json();
  return result&&result.ok===true?result.result:null;
}

export async function getPublicAvatarData(telegramId,botToken,http=fetch) {
  if(!Number.isSafeInteger(telegramId)||telegramId<=0||
    typeof botToken!=='string'||!TOKEN_RE.test(botToken))return null;
  try{
    const info=await telegramJSON(botToken,'getUserProfilePhotos',{
      user_id:telegramId,offset:0,limit:1
    },http);
    const photos=info?.photos?.[0];
    if(!Array.isArray(photos)||photos.length===0)return null;
    const candidate=photos
      .filter(item=>typeof item.file_id==='string'&&
        (!Number.isFinite(item.file_size)||item.file_size<=MAX_IMAGE_BYTES))
      .sort((a,b)=>{
        const score=item=>Math.abs(Math.max(item.width||0,item.height||0)-320);
        return score(a)-score(b);
      })[0];
    if(!candidate)return null;

    const details=await telegramJSON(botToken,'getFile',{file_id:candidate.file_id},http);
    const path=details?.file_path;
    if(typeof path!=='string'||!PATH_RE.test(path)||
      (Number.isFinite(details.file_size)&&details.file_size>MAX_IMAGE_BYTES))return null;

    const photo=await http('https://api.telegram.org/file/bot'+botToken+'/'+path,{
      cache:'no-store',signal:AbortSignal.timeout(3500)
    });
    if(!photo.ok)return null;
    const type=(photo.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
    const mime=type==='image/jpeg'||type==='image/png'||type==='image/webp'
      ?type:path.toLowerCase().endsWith('.png')?'image/png':
         path.toLowerCase().endsWith('.webp')?'image/webp':'image/jpeg';
    if(type&&!['image/jpeg','image/png','image/webp','application/octet-stream'].includes(type))
      return null;
    const size=Number(photo.headers.get('content-length')||0);
    if(size>MAX_IMAGE_BYTES)return null;
    const bytes=Buffer.from(await photo.arrayBuffer());
    if(bytes.length===0||bytes.length>MAX_IMAGE_BYTES)return null;
    // Embed only a bounded raster image; token-bearing file URL stays private.
    return 'data:'+mime+';base64,'+bytes.toString('base64');
  }catch{
    // Missing or private Telegram photo never blocks the public profile.
    return null;
  }
}
