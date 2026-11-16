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
 function slotButtons(slots,editable=false){
   const source=Array.isArray(slots)?slots:[];
   return '<div class="flip-showcase-grid">'+[1,2,3].map(slot=>{
     const data=source.find(x=>Number(x.slot)===slot);
     const card=data?.card_id?cardFromId(data.card_id):null;
     if(!card)return editable?
       '<button class="flip-showcase-empty" data-showcase-slot="'+slot+
       '" type="button"><strong>+</strong><small>СЛОТ '+slot+'</small></button>':
       '<div class="flip-showcase-empty is-public"><strong>—</strong><small>СЛОТ '+slot+'</small></div>';
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
   const pinned=Array.isArray(slots)?slots.filter(x=>x.card_id).length:0;
   return '<section class="content-card flip-showcase-profile">'+
     '<div class="flip-showcase-heading"><div><span class="eyebrow">YOUR TOP 3 / FLIP</span>'+
       '<h3>ВИТРИНА КАРТОЧЕК</h3></div><strong>'+pinned+' / 3</strong></div>'+
     slotButtons(slots,online)+
     '<p>Закрепи три любимые карточки. Игроки увидят их в твоём публичном профиле. '+
       'Эффекты редкостей сохраняются.</p>'+
     (online?'<button class="outlinebtn" type="button" data-action="showcaseEdit">'+
         'РЕДАКТИРОВАТЬ ВИТРИНУ ↗</button>'+
         '<button class="flip-showcase-public-link" type="button" data-open-my-profile>'+
         'ПОСМОТРЕТЬ МОЙ ПУБЛИЧНЫЙ ПРОФИЛЬ ↗</button>':
         '<small>Войти через Telegram, чтобы закрепить карточки.</small>')+
     '</section>';
 }
 function editor(state,profile,selectedSlot){
   const cards=cardsFromState(state);
   const slot=Math.max(1,Math.min(3,Number(selectedSlot)||1));
   const slots=profile?.slots||[];
   const chosen=slots.find(x=>Number(x.slot)===slot)?.card_id||null;
   return '<div class="panel flip-showcase-editor">'+
     '<button class="link" data-action="profile">← К ПРОФИЛЮ</button>'+
     '<span class="eyebrow">SHOWCASE / EDIT</span>'+
     '<h2>ТВОЯ ВИТРИНА<span style="color:var(--lime)">.</span></h2>'+
     '<p class="desc">Выбери три карточки из своей коллекции. '+
        'Для изменения нажми на нужный слот, затем на обложку.</p>'+
     '<div class="flip-showcase-slottabs">'+[1,2,3].map(n=>
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
   return '<div class="panel flip-public-profile">'+
     '<button class="link" data-action="leaderboard">← К РЕЙТИНГУ</button>'+
     '<span class="eyebrow">PLAYER PROFILE / FLIP</span>'+
     '<h2>ПРОФИЛЬ<span style="color:var(--lime)">.</span></h2>'+
     '<div class="content-card flip-showcase-player"><div class="flip-showcase-player-avatar">'+
       '<span class="flip-showcase-avatar-initials">'+esc(initial)+'</span>'+photo+
       '</div><div><h3>'+esc(name)+'</h3>'+
       '<span class="pill">LVL '+fmt(profile.level)+'</span></div></div>'+
     '<div class="flip-showcase-stats">'+
       '<div><small>COLLECTION POINTS</small><strong>'+fmt(profile.cp)+' CP</strong></div>'+
       '<div><small>КАРТОЧЕК</small><strong>'+fmt(profile.ranked_cards)+'</strong></div>'+
       '<div><small>РАЗНЫХ КАРТОЧЕК</small><strong>'+fmt(profile.ranked_variants)+'</strong></div></div>'+
     (window.FLIPActivity?.publicStats(profile.stats)||'')+
     '<section class="content-card flip-showcase-profile"><div class="flip-showcase-heading">'+
       '<h3>ВИТРИНА ИГРОКА</h3><strong>TOP 3</strong></div>'+
       slotButtons(profile.slots,false)+'</section>'+
     '<section class="content-card"><h3>СПЕЦИАЛЬНЫЕ ЗНАЧКИ</h3>'+
       badges(profile.badges)+'</section>'+
     '<p class="flip-showcase-info">'+
       'Смотри любимые карточки и особые значки этого игрока.</p></div>';
 }
 window.FLIPShowcase={own,editor,publicPage,cardFromId,cardsFromState};
})();
