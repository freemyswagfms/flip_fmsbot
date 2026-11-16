/* FLIP v0.8 — browser adapter. Never stores keys or writes authoritative rewards. */
(() => {
  'use strict';
  const telegram = window.Telegram?.WebApp;
  const initData = telegram?.initData || '';
  const telegramClient=window.FLIPViewport?.isTelegram || !!initData;
  const api='/api/flip';
  const bridge={mode:'loading',health:'connecting',error:null,connectedUser:null,profile:null,isAdmin:false,tasks:null,achievements:null,showcase:null,cosmetics:null,shop:null,hub:null};
  const setHealth=status=>{
    if(bridge.health===status)return;
    bridge.health=status;
    window.dispatchEvent(new CustomEvent('flip-server-status',{detail:{status}}));
  };
  async function request(action,requestId,payload={},query=''){
    const headers={'x-telegram-init-data':initData};
    const options={method:action?'POST':'GET',headers,cache:'no-store'};
    if(action){headers['content-type']='application/json';options.body=JSON.stringify({action,requestId,...payload});}
    let response;
    try{response=await fetch(api+query,options);}
    catch(error){setHealth('offline');throw error;}
    let data;try{data=await response.json()}catch{data={error:'INVALID_RESPONSE'}};
    if(!response.ok){
      if(response.status>=500||response.status===401)setHealth('offline');
      const error=new Error(data.error||'SERVER_ERROR');error.status=response.status;throw error;
    }
    setHealth('online');
    return data;
  }
  function makeState(snapshot,profile=bridge.profile){
    if(!snapshot || !Array.isArray(snapshot.inventory)||!Array.isArray(snapshot.discovered))throw new Error('INVALID_SNAPSHOT');
    const received=[];
    const catalog=window.FLIPCatalog;
    for(const item of snapshot.inventory){
      const parts=String(item.id).split('/');
      const card=item.id==='demo/hidden/archive-001'?
        {id:item.id,title:'ARCHIVE 001',artist:'FLIP // SECRET',rarity:'Hidden',color:'hidden'}:
        (parts.length===3?catalog.getCard(parts[0],parts[1],parts[2]):null);
      if(!card)continue;
      const count=Math.min(10000,Math.max(0,Number(item.count)||0));
      const ranked=Math.max(0,Math.min(count,Number(item.ranked_count??count)||0));
      for(let i=0;i<count;i++)received.push({...card,isTestCopy:i>=ranked});
    }
    return {received, discovered:snapshot.discovered, balance:snapshot.balance,cp:Number(snapshot.cp)||0,
      xp:snapshot.xp,level:snapshot.level,xpToNext:snapshot.xp_to_next,
      dropReadyAt:Date.parse(snapshot.drop_ready_at),
      welcomeRemaining:snapshot.welcome_remaining,
      pityMisses:snapshot.pity_misses,
      claimedTasks:snapshot.claimed_tasks||[], packsToday:snapshot.packs_today||0,
      unlimitedDrop:snapshot.unlimited_drop===true,
      unlimitedPacks:snapshot.unlimited_packs===true,
      bonusPacks:snapshot.bonus_packs||0,
      telegramName:profile?.display_name||snapshot.first_name||snapshot.username||'FLIP PLAYER',
      telegramHandle:profile?.handle||(snapshot.username?'@'+snapshot.username:'FLIP PLAYER'),
      telegramAvatarUrl:profile?.avatar_url||''};
  }
  bridge.connect=async()=>{
    if(!initData){
      bridge.mode=telegramClient?'blocked':'demo';
      bridge.error=telegramClient?'NO_TELEGRAM_AUTH':'OUTSIDE_TELEGRAM';
      setHealth(telegramClient?'offline':'demo');
      return null;
    }
    try{const data=await request();if(data.catalog)window.FLIPCatalog?.importServerCatalog?.(data.catalog);bridge.mode='server';bridge.error=null;bridge.profile=data.profile||null;bridge.isAdmin=data.admin===true;bridge.tasks=data.tasks||null;bridge.achievements=data.achievements||null;bridge.showcase=data.showcase||null;bridge.cosmetics=data.cosmetics||null;return makeState(data.state);}
    catch(error){
      // Never switch an authenticated Telegram user back to writable browser currency.
      bridge.mode='blocked';bridge.error=error.message;setHealth('offline');return null;
    }
  };
  // Keep unfinished requests separate across Telegram accounts on a shared device.
  let playerNamespace='unknown';
  try{
    const rawUser=new URLSearchParams(initData).get('user');
    const parsedUser=JSON.parse(rawUser||'null');
    if(Number.isSafeInteger(parsedUser?.id)&&parsedUser.id>0)playerNamespace=String(parsedUser.id);
  }catch{}
  function pendingKey(action){return `flip_v08_${playerNamespace}_pending_${action}`;}
  const validId=id=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id||'');
  function pending(action){try{const id=localStorage.getItem(pendingKey(action));return validId(id)?id:null;}catch{return null;}}
  function remember(action,id){try{localStorage.setItem(pendingKey(action),id)}catch{}}
  function forget(action){try{localStorage.removeItem(pendingKey(action))}catch{}}
  bridge.hasPending=action=>Boolean(pending(action));
  async function perform(action,requestId,payload={},pendingLabel=action){
    if(bridge.mode!=='server')throw new Error('NOT_AUTHENTICATED');
    const id=pending(pendingLabel)||requestId;
    if(!validId(id))throw new Error('INVALID_REQUEST_ID');
    remember(pendingLabel,id);
    try{
      const data=await request(action,id,payload);
      const result={...data,state:makeState(data.state)};
      forget(pendingLabel);
      return result;
    }catch(error){
      // If transport failed after the database committed, replay the SAME ID.
      // Business errors cannot have awarded a card, so allow a fresh request next time.
      const terminal=['DROP_COOLDOWN','INSUFFICIENT_FUNDS','DAILY_PACK_LIMIT',
        'DUPLICATE_REQUEST_ACTION','INVALID_TELEGRAM_SESSION','EXPIRED_TELEGRAM_SESSION','BAD_REQUEST'];
      if(terminal.includes(error.message)||['UNKNOWN_PACK','THEME_UNAVAILABLE','PACK_GENERATION_FAILED'].includes(error.message))forget(pendingLabel);
      throw error;
    }
  }
  bridge.drop=id=>perform('drop',id);
  bridge.pack=id=>perform('pack',id);
  bridge.themePack=(theme,id)=>{
    if(!['archive','new-era'].includes(theme))throw new Error('UNKNOWN_PACK');
    return perform('theme_pack',id,{theme},'theme_pack_'+theme);
  };
  bridge.refreshHub=async()=>{
    if(bridge.mode!=='server')return null;
    const data=await request(null,null,{},'?hub=1');
    bridge.hub=data;
    window.dispatchEvent(new CustomEvent('flip-hub-updated',{detail:{unread:data.unread_count||0}}));
    return data;
  };
  bridge.refreshInventory=async()=>{
    if(bridge.mode!=='server')return null;
    const snapshot=await request(null,null,{},'?inventory=1');
    return makeState(snapshot);
  };
  bridge.ackCardDeliveries=async ids=>{
    if(bridge.mode!=='server')throw new Error('NOT_AUTHENTICATED');
    if(!Array.isArray(ids)||ids.length<1||ids.length>20||
       ids.some(id=>!Number.isSafeInteger(id)||id<=0))
      throw new Error('BAD_REQUEST');
    return request('ack_card_deliveries',crypto.randomUUID(),{deliveryIds:ids});
  };
  bridge.markEventsRead=async(eventId=null)=>{
    if(bridge.mode!=='server')throw new Error('NOT_AUTHENTICATED');
    const payload=eventId===null?{all:true}:{eventId};
    const result=await request('mark_events_read',crypto.randomUUID(),payload);
    // Requery to keep per-event state and badge consistent across clients.
    await bridge.refreshHub();
    return result;
  };
  bridge.refreshShop=async()=>{
    if(bridge.mode!=='server')return null;
    const data=await request(null,null,{},'?store=1');
    bridge.shop=data;
    return data;
  };
   bridge.refreshTasks=async()=>{
     if(bridge.mode!=='server')return null;
     const data=await request();
     bridge.tasks=data.tasks||null;
     return bridge.tasks;
   };
   bridge.claimTask=async(scope,slot,version)=>{
     if(bridge.mode!=='server')throw new Error('NOT_AUTHENTICATED');
     const result=await request('claim_task',crypto.randomUUID(),{scope,slot,version});
     bridge.tasks=result.tasks||bridge.tasks;
     return {...result,state:makeState(result.state)};
   };
   bridge.rerollTask=async(scope,slot)=>{
     if(bridge.mode!=='server')throw new Error('NOT_AUTHENTICATED');
     const result=await request('reroll_task',crypto.randomUUID(),{scope,slot});
     bridge.tasks=result.tasks||bridge.tasks;
     return result;
   };
   bridge.refreshShowcase=async()=>{
     if(bridge.mode!=='server')return null;
     const data=await request(null,null,{},'?showcase=1');
     bridge.showcase=data;
     return data;
   };
   bridge.refreshCosmetics=async()=>{
     if(bridge.mode!=='server')return null;
     bridge.cosmetics=await request(null,null,{},'?cosmetics=1');
     return bridge.cosmetics;
   };
   bridge.buyProfile=async(kind,itemId)=>{
     if(bridge.mode!=='server')throw new Error('NOT_AUTHENTICATED');
     const label='profile_'+kind+'_'+itemId;
     const id=pending(label)||crypto.randomUUID();
     remember(label,id);
     try{
       const result=await request('profile_buy',id,{kind,itemId});
       forget(label);
       bridge.showcase=result.profile||bridge.showcase;
       bridge.cosmetics=result.shop||bridge.cosmetics;
       return result;
     }catch(error){
       if(error.status>=400&&error.status<500&&error.status!==408&&error.status!==429)
         forget(label);
       throw error;
     }
   };
   bridge.equipProfile=async(kind,itemId)=>{
     if(bridge.mode!=='server')throw new Error('NOT_AUTHENTICATED');
     const result=await request('profile_equip',crypto.randomUUID(),{kind,itemId});
     bridge.showcase=result.profile||bridge.showcase;
     return result;
   };
   bridge.setFavoriteArtist=async(artistId)=>{
     if(bridge.mode!=='server')throw new Error('NOT_AUTHENTICATED');
     const result=await request('profile_favorite',crypto.randomUUID(),{artistId});
     bridge.showcase=result.profile||bridge.showcase;
     return result;
   };
   bridge.pinProfileBadge=async(slot,code)=>{
     if(bridge.mode!=='server')throw new Error('NOT_AUTHENTICATED');
     const result=await request('profile_pin_badge',crypto.randomUUID(),{slot,code});
     bridge.showcase=result.profile||bridge.showcase;
     return result;
   };
   bridge.setShowcase=async(slot,cardId)=>{
     if(bridge.mode!=='server')throw new Error('NOT_AUTHENTICATED');
     const result=await request('set_showcase',crypto.randomUUID(),{slot,cardId});
     bridge.showcase=result.profile||bridge.showcase;
     return bridge.showcase;
   };
   bridge.publicProfile=async(publicId)=>{
     if(bridge.mode!=='server')throw new Error('NOT_AUTHENTICATED');
     if(typeof publicId!=='string'||!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(publicId))
       throw new Error('BAD_PROFILE');
     return request(null,null,{},'?profile='+encodeURIComponent(publicId));
   };
   bridge.refreshAchievements=async()=>{
     if(bridge.mode!=='server')return null;
     const result=await request(null,null,{},'?achievements=1');
     bridge.achievements=result;
     return result;
   };
   bridge.claimAchievement=async(code,stage)=>{
     if(bridge.mode!=='server')throw new Error('NOT_AUTHENTICATED');
     const result=await request('claim_achievement',crypto.randomUUID(),{code,stage});
     bridge.achievements=result.achievements||bridge.achievements;
     return {...result,state:makeState(result.state)};
   };
   bridge.claimStreak=async()=>{
     if(bridge.mode!=='server')throw new Error('NOT_AUTHENTICATED');
     const result=await request('claim_streak',crypto.randomUUID());
     bridge.tasks=result.tasks||bridge.tasks;
     return {...result,state:makeState(result.state)};
   };
  // A visible Telegram client keeps checking connectivity, including during maintenance.
  // Demo mode never contacts the player server and never syncs local state.
  let lastProbe=0,checking=false;
  async function probe(){
    if(!initData||checking||document.visibilityState==='hidden')return;
    checking=true;lastProbe=Date.now();
    try{
      const response=await fetch(api+'?probe=1',{
        headers:{'x-telegram-init-data':initData},cache:'no-store',
        signal:AbortSignal.timeout(12000)
      });
      if(!response.ok)throw new Error('HEALTH_PROBE_FAILED');
      if(bridge.mode==='blocked'){
        const restored=await bridge.connect();
        if(restored)window.dispatchEvent(new CustomEvent('flip-server-recovered',{detail:{state:restored}}));
      }else setHealth('online');
    }catch{setHealth('offline');}
    finally{checking=false;}
  }
  setInterval(()=>{if(Date.now()-lastProbe>=60000)probe();},60000);
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible'&&Date.now()-lastProbe>=60000)probe();
  });
  window.FLIPServer=bridge;
})();
