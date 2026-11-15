/* FLIP server-only Telegram task verification. No bot token reaches the client. */
export function normalizeTarget(link,chatId=''){
  let url;
  try{url=new URL(String(link||''));}catch{return null;}
  if(url.protocol!=='https:'||!['t.me','telegram.me'].includes(url.hostname)||
     url.port||url.username||url.password||url.search||url.hash)return null;
  const path=url.pathname.replace(/^\/|\/$/g,'');
  if(path.includes('/'))return null;
  const publicName=/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(path)?path:null;
  const invite=/^\+[A-Za-z0-9_-]{10,80}$/.test(path);
  if(!publicName&&!invite)return null;
  const supplied=String(chatId||'').trim();
  const channelId=publicName?'@'+publicName:supplied;
  if(publicName&&supplied&&supplied.toLowerCase()!==channelId.toLowerCase()&&
    !/^-100[0-9]{6,17}$/.test(supplied))return null;
  if(invite&&!/^-100[0-9]{6,17}$/.test(channelId))return null;
  return {url:'https://t.me/'+path,chatId:invite?channelId:
    (/^-100[0-9]{6,17}$/.test(supplied)?supplied:channelId),publicName};
}
export async function botApi(method,args,token=process.env.TELEGRAM_BOT_TOKEN){
  if(!token)throw new Error('BOT_NOT_CONFIGURED');
  const response=await fetch('https://api.telegram.org/bot'+token+'/'+method,{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify(args),cache:'no-store',signal:AbortSignal.timeout(9000)
  });
  const data=await response.json().catch(()=>null);
  if(!response.ok||!data?.ok)throw new Error('TELEGRAM_CHECK_FAILED');
  return data.result;
}
export function isJoined(member){
  return ['creator','administrator','member'].includes(member?.status)||
    (member?.status==='restricted'&&member.is_member===true);
}
export async function assertBotCanVerify(target){
  const chat=await botApi('getChat',{chat_id:target.chatId});
  if(chat?.type!=='channel')throw new Error('NOT_A_CHANNEL');
  if(target.publicName&&chat.username?.toLowerCase()!==target.publicName.toLowerCase())
    throw new Error('CHANNEL_MISMATCH');
  const bot=await botApi('getMe',{});
  const member=await botApi('getChatMember',{chat_id:target.chatId,user_id:bot.id});
  if(!['creator','administrator'].includes(member?.status))throw new Error('BOT_NOT_ADMIN');
  return String(chat.id);
}
export async function verifySubscription(channelId,telegramId){
  const member=await botApi('getChatMember',{chat_id:channelId,user_id:telegramId});
  return isJoined(member);
}
