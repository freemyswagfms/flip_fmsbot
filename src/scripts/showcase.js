/* FLIP v0.9.4 — in-game personal showcase and public profiles. */
(()=>{
 'use strict';
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({
   '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
 }[c]));
 const rank={common:0,rare:1,epic:2,legendary:3,mythic:4,hidden:5};
 const rarityLabel={common:'COMMON',rare:'RARE',epic:'EPIC',
   legendary:'LEGENDARY',mythic:'MYTHIC',hidden:'HIDDEN'};
 const fmt=x=>Number(x||0).toLocaleString('ru-RU',{maximumFractionDigits:2});
 const cardsFromState=state=>{
   const found=new Map();
   for(const c of state?.received||[]){
     if(!c||!c.id||c.isTestCopy)continue;
     if(!found.has(c.id))found.set(c.id,c);
   }
   return [...found.values()].sort((a,b)=>
     (rank[String(b.color||b.rarity).toLowerCase()]??-1)-
     (rank[String(a.color||a.rarity).toLowerCase()]??-1)||
     String(a.artist||'').localeCompare(String(b.artist||''),'ru')||
     String(a.title||'').localeCompare(String(b.title||''),'ru'));
 };
 function cardFromId(id){
   if(typeof id!=='string'||id.length>160)return null;
   const parts=id.split('/');
   if(parts.length!==3)return null;
   const card=window.FLIPCatalog?.getCard(parts[0],parts[1],parts[2]);
   return card?{...card}:null;
 }
 function picture(card){
   const rarity=String(card.color||card.rarity||'common').toLowerCase();
   return '<span class="flip-showcase-frame flip-showcase-'+esc(rarity)+
     (rarity==='hidden'?' flip-hidden-frame':'')+'">'+
     (card.art?'<img src="'+esc(card.art)+'" alt="'+esc(card.title||'Обложка')+
       '" loading="lazy" decoding="async" draggable="false">':
       '<span class="flip-showcase-no-art">FLIP</span>')+
     '<small class="flip-showcase-rarity">'+esc(rarityLabel[rarity]||rarity.toUpperCase())+
       '</small></span>';
 }
 function slotButtons(slots,editable=false,slotCount=3,{showLocks=false}={}){
    const source=Array.isArray(slots)?slots:[];
    const max=Math.min(6,Math.max(3,Number(slotCount)||3));
    const limit=showLocks?6:max;
    return '<div class="flip-showcase-grid '+(limit>3?'is-expanded':'')+'">'+
      Array.from({length:limit},(_,i)=>{
       const slot=i+1,locked=slot>max;
       if(locked)return '<button type="button" class="flip-showcase-locked" '+
        'data-cosmetic-open-shop aria-label="Открыть дополнительное место '+slot+
        '"><span class="flip-showcase-lock-icon">+</span>'+
        '<small>МЕСТО '+slot+'</small><span>ЗАКРЫТО</span></button>';
       const data=source.find(x=>Number(x.slot)===slot);
       const card=data?.card_id?cardFromId(data.card_id):null;
       if(!card)return editable?
        '<button class="flip-showcase-empty" data-showcase-slot="'+slot+
        '" type="button"><strong>+</strong><small>МЕСТО '+slot+'</small></button>':
        '<div class="flip-showcase-empty is-public"><strong>—</strong><small>МЕСТО '+slot+'</small></div>';
       return '<div class="flip-showcase-slot"><button type="button" '+
          'data-showcase-view-card="'+esc(card.id)+'" aria-label="Посмотреть '+esc(card.title)+'">'+
           picture(card)+'</button>'+
        '<span class="flip-showcase-title">'+esc(card.title)+'</span>'+
        (editable?'<button class="flip-showcase-change" type="button" data-showcase-slot="'+slot+
         '">ИЗМЕНИТЬ</button>':'')+'</div>';
      }).join('')+'</div>';
  }
  function badges(items){
   const list=Array.isArray(items)?items:[];
   if(!list.length)return '<p class="flip-showcase-no-badges">Особые значки пока не получены.</p>';
   return '<div class="flip-showcase-badges">'+list.slice(0,12).map(x=>
     '<span title="'+esc(x.title)+'"><b>'+esc(x.symbol||'✦')+'</b><small>'+
       esc(x.title)+'</small></span>').join('')+'</div>';
 }
 function own(profile,{online=false}={}){
    const slots=online?profile?.slots:null;
    const limit=online?Math.min(6,Math.max(3,Number(profile?.slot_count)||3)):3;
    const pinned=Array.isArray(slots)?slots.filter(x=>x.card_id).length:0;
    const skin=window.FLIPProfileCosmetics?.classes?.(profile)||'';
    return '<section class="content-card flip-showcase-profile '+esc(skin)+'">'+
      '<div class="flip-showcase-heading"><div><span class="eyebrow">COLLECTION / TOP 6</span>'+
        '<h3>ВИТРИНА КАРТОЧЕК</h3></div><strong>'+pinned+' / '+limit+'</strong></div>'+
      slotButtons(slots,online,limit,{showLocks:online})+
      (online?'<div class="flip-showcase-controls">'+
         '<button class="outlinebtn" type="button" data-action="showcaseEdit">РЕДАКТИРОВАТЬ ↗</button>'+
         '<button class="flip-showcase-public-link" type="button" data-open-my-profile>'+
          'МОЙ ПУБЛИЧНЫЙ ПРОФИЛЬ ↗</button></div>':
       '<small class="flip-showcase-offline">Доступно в Telegram.</small>')+
      '</section>';
  }
  function editor(state,profile,selectedSlot){
   const cards=cardsFromState(state);
   const limit=Math.min(6,Math.max(3,Number(profile?.slot_count)||3));
   const slot=Math.max(1,Math.min(limit,Number(selectedSlot)||1));
   const slots=profile?.slots||[];
   const chosen=slots.find(x=>Number(x.slot)===slot)?.card_id||null;
   return '<div class="panel flip-showcase-editor">'+
     '<button class="link" data-action="profile">← К ПРОФИЛЮ</button>'+
     '<span class="eyebrow">SHOWCASE / EDIT</span>'+
     '<h2>ТВОЯ ВИТРИНА<span style="color:var(--lime)">.</span></h2>'+
     '<p class="desc">'+
        'Выбери слот и карточку.</p>'+
     '<div class="flip-showcase-slottabs">'+Array.from({length:limit},(_,i)=>i+1).map(n=>
       '<button type="button" class="'+(n===slot?'is-active':'')+
       '" data-showcase-slot="'+n+'">СЛОТ '+n+'</button>').join('')+'</div>'+
     '<div class="flip-showcase-editor-current">РЕДАКТИРУЕМ СЛОТ <b>'+slot+'</b>'+
       (chosen?'<button type="button" data-showcase-clear="'+slot+
         '">УБРАТЬ КАРТОЧКУ ✕</button>':'<span>ПУСТО</span>')+'</div>'+
     '<label class="flip-showcase-search"><span>ПОИСК ПО КОЛЛЕКЦИИ</span>'+
       '<input type="search" data-showcase-search maxlength="80" placeholder="Артист или релиз…"></label>'+
     (cards.length?'<div class="flip-showcase-choices">'+cards.map(c=>{
       const pinned=slots.find(x=>x.card_id===c.id)?.slot;
       return '<button type="button" class="flip-showcase-choice'+(c.id===chosen?' is-selected':'')+
          '" data-showcase-pick="'+esc(c.id)+'" data-showcase-filter="'+
          esc((c.artist||'')+' '+(c.title||'')+' '+(c.rarity||''))+'">'+
          picture(c)+'<span>'+esc(c.title||'')+'</span>'+
          '<small>'+esc(c.artist||'')+(pinned?' · СЛОТ '+pinned:'')+'</small></button>';
     }).join('')+'</div>':
       '<div class="flip-showcase-empty-inventory">В коллекции пока нет карточек. '+
       'Открой бесплатный дроп, чтобы добавить первую.</div>')+
     '<p class="flip-showcase-info">'+
       'Если продашь или обменяешь последнюю копию карточки, она исчезнет из витрины.</p>'+
     '</div>';
 }
 function publicPage(profile,{loading=false,error=''}={}){
    if(loading)return '<div class="panel"><button class="link" data-action="leaderboard">'+
      '← К РЕЙТИНГУ</button><h2>ПРОФИЛЬ ИГРОКА</h2>'+
      '<p class="flip-showcase-notice">Загружаем публичный профиль…</p></div>';
    if(error||!profile)return '<div class="panel">'+
      '<button class="link" data-action="leaderboard">← К РЕЙТИНГУ</button>'+
      '<h2>ПРОФИЛЬ НЕДОСТУПЕН</h2><p class="flip-showcase-notice">'+
       esc(error||'Попробуй снова.')+'</p></div>';
    const name=profile.username?'@'+profile.username:
      (profile.first_name||'FLIP PLAYER');
    const initial=String(profile.username||profile.first_name||'F').slice(0,2).toUpperCase();
    const avatar=typeof profile.avatar_data==='string'&&
      (/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(profile.avatar_data)||
       /^https:\/\/[A-Za-z0-9.-]+(?:\/[A-Za-z0-9_./%?&=+-]*)?$/.test(profile.avatar_data))?
       profile.avatar_data:'';
    const photo=avatar?'<img class="flip-showcase-player-photo" src="'+esc(avatar)+
       '" alt="" decoding="async" referrerpolicy="no-referrer" draggable="false">':'';
    const avatarContent='<span class="flip-player-avatar"><span class="flip-player-initials">'+
      esc(initial)+'</span>'+photo+'</span>';
    const identity=window.FLIPProfileCosmetics?.identity({profile,name,
      handle:profile.username?'@'+profile.username:'',
      avatar:avatarContent,level:profile.level,publicMode:true})||'';
    const limit=Math.min(6,Math.max(3,Number(profile.slot_count)||3));
    return '<div class="panel flip-public-profile">'+
      '<button class="link" data-action="leaderboard">← К РЕЙТИНГУ</button>'+
      identity+
      '<section class="content-card flip-showcase-profile '+
        esc(window.FLIPProfileCosmetics?.classes?.(profile)||'')+'">'+
      '<div class="flip-showcase-heading"><div><span class="eyebrow">PLAYER COLLECTION</span>'+
      '<h3>ВИТРИНА ИГРОКА</h3></div><strong>TOP '+limit+'</strong></div>'+
        slotButtons(profile.slots,false,limit)+'</section>'+
      (window.FLIPProfileCosmetics?.featuredBadges(profile)||'')+
      '<div class="flip-showcase-stats flip-showcase-stats-public">'+
        '<div><small>COLLECTION POINTS</small><strong>'+fmt(profile.cp)+' CP</strong></div>'+
        '<div><small>РЕЙТИНГОВЫХ КАРТОЧЕК</small><strong>'+fmt(profile.ranked_cards)+'</strong></div>'+
        '<div><small>РАЗНЫХ РЕЙТИНГОВЫХ</small><strong>'+fmt(profile.ranked_variants)+'</strong></div></div>'+
      (window.FLIPActivity?.publicStats(profile.stats)||'')+
      (profile.badges?.length?'<section class="content-card"><h3>ЗНАЧКИ ИГРОКА</h3>'+
        badges(profile.badges)+'</section>':'')+'</div>';
  }
  window.FLIPShowcase={own,editor,publicPage,cardFromId,cardsFromState};
})();
