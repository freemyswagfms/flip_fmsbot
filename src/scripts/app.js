// FLIP — клиентский демо-прототип. Реальные игровые операции требуют сервера.
(() => {
'use strict';
const $=s=>document.querySelector(s);
const now=Date.now();
const initial={balance:1250,xp:64,level:8,dropReadyAt:now,received:[],claimedTasks:[],packsToday:0,lastPackDay:'',notices:1,pityMisses:0};
let saved={};try{saved=JSON.parse(localStorage.getItem('flip_demo')||localStorage.getItem('flip20_demo')||'{}')||{}}catch{}
// Never display or load writable local demo balances in the authenticated Telegram UI.
// The local demo state only exists when launched outside Telegram.
const state={balance:0,xp:0,level:1,xpToNext:100,dropReadyAt:Date.now()+4*3600*1000,
  received:[],discovered:[],claimedTasks:[],packsToday:0,notices:0,pityMisses:0};
window.FLIPGame={state};
let serverBusy=false;
const bridge=window.FLIPServer;
const live=()=>bridge?.mode==='server';
const blocked=()=>bridge?.mode==='blocked'||bridge?.mode==='loading';
// The point after the FLIP logo is the only visible server-status indicator.
function updateServerDot(){
  const brand=$('#flipBrand');
  if(!brand)return;
  const mode=bridge?.health||'connecting';
  const state=['online','demo','offline'].includes(mode)?mode:'connecting';
  brand.dataset.serverStatus=state;
  brand.setAttribute('aria-label','FLIP · '+({
    online:'Сервер работает, прогресс синхронизирован',
    demo:'Демо без синхронизации',
    offline:'Игровой сервер временно недоступен',
    connecting:'Подключение к серверу'
  }[state]));
}
window.addEventListener('flip-server-status',updateServerDot);
window.addEventListener('flip-server-recovered',event=>{
  if(event.detail?.state)applyServerState(event.detail.state);
  updateServerDot();
});
function applyServerState(snapshot){
  if(snapshot){Object.assign(state,snapshot);render(current)}
}
function applyLocalDemoState(){
  Object.assign(state,initial,saved);
  if(!Array.isArray(state.received))state.received=[];
  if(!Array.isArray(state.discovered))state.discovered=[];
  for(const item of state.received){if(item?.id&&!state.discovered.includes(item.id))state.discovered.push(item.id)}
  render(current);
}
// Keep a permanent discovery register independently from current owned copies.
if(!Array.isArray(state.received)) state.received=[];
if(!Array.isArray(state.discovered)) state.discovered=[];
const previousDiscoveries=new Set(state.discovered);
for(const oldCard of state.received){if(oldCard?.id && !previousDiscoveries.has(oldCard.id)){state.discovered.push(oldCard.id);previousDiscoveries.add(oldCard.id)}}

let current='home';
let collectionArtistId=null, collectionReleaseId=null;
let showcaseEditingSlot=1,publicProfileData=null,publicProfileLoading=false,publicProfileError='';
let shopTab='packs',shopLoading=false,shopBusy=false,shopError='';
let hubLoading=false,hubError='';
const catalog=window.FLIPCatalog;
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const artCards=catalog.rarities.map((rarity,i)=>catalog.getCard('carti',catalog.artists[0].releases[i%5].id,rarity));
const hiddenDemoCard={id:'demo/hidden/archive-001',title:'ARCHIVE 001',artist:'FLIP // SECRET',rarity:'Hidden',color:'hidden'};
const save=()=>{if(blocked()||live())return;try{localStorage.setItem('flip_demo',JSON.stringify(state))}catch{}};
const money=n=>n.toLocaleString('ru-RU');
const sq=(c,i=0)=>`<div class="sq-card ${escapeHtml(c.color||'')}" title="${escapeHtml(c.artist||'')} · ${escapeHtml(c.title)} · ${escapeHtml(c.rarity)}">${c.art?`<img class="sq-art-image" src="${escapeHtml(c.art)}" alt="${escapeHtml(c.title)} · ${escapeHtml(c.rarity)}" loading="lazy" decoding="async">`:`<span class="sq-art">${escapeHtml(c.title||'FLIP')}</span>`}<span class="small-badge">${escapeHtml(c.rarity)}${c.count?' ×'+c.count:''}</span></div>`;
function home(){return `<div class="hero-intro">
  <h2>Открой свой дроп.</h2>
  <div class="hero-progress" id="levelQuick" role="button" tabindex="0" aria-label="Открыть прогресс уровня">
    <span>LVL ${state.level}</span><span class="progress-separator"></span><span>${state.xp}/${state.xpToNext||100} XP</span><span class="hero-progress-arrow">↗</span>
  </div>
</div>
<section class="drop-shell" aria-label="Бесплатный дроп">
  <div class="drop-info"><span class="drop-badge" id="readyBadge">● ДРОП ДОСТУПЕН</span></div>
  <div class="drop-stage" aria-hidden="true">
    <div class="drop-stage-ring ring-outer"></div><div class="drop-stage-ring ring-inner"></div>
    <div class="deck">
      <div class="deck-card one"><span class="back-mark">FLIP</span></div>
      <div class="deck-card two"><span class="back-mark">FLIP</span></div>
      <div class="deck-card main"><div class="deck-logo">FLIP</div><div class="deck-tag">+ COLLECT /<br> TRADE +</div></div>
    </div>
  </div>
  <button class="drop-cta" id="dropBtn"><span>ОТКРЫТЬ ДРОП</span><span class="drop-cta-arrow" aria-hidden="true">↗</span></button>
  <div class="drop-footer">
${live()&&bridge?.isAdmin===true ? `
    <button type="button" class="drop-preview-btn" id="dropPreviewBtn" aria-label="Тест рулетки без получения карточки">
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.25 5.56"/><path d="M20 4v7h-7"/></svg>
      <span>ТЕСТ РУЛЕТКИ</span>
    </button>
    ` : ''}
    <span class="flip-drop-timer" id="dropTimer" hidden><strong id="timerValue">00:00:00</strong></span>
  </div>
</section>
<section class="content-section"><div class="section-head"><span class="section-title"><b>✳</b> НОВАЯ КОЛЛЕКЦИЯ</span></div><div class="feature"><div class="feature-copy"><h3>PLAYBOI<br>CARTI</h3><button data-action="catalog">СМОТРЕТЬ РЕЛИЗЫ ↗</button></div><div class="artwork second" aria-hidden="true"><img class="feature-cover" src="./src/assets/carti/die-lit/epic.webp" alt=""></div><div class="artwork" aria-hidden="true"><img class="feature-cover" src="./src/assets/carti/whole-lotta-red/mythic.webp" alt=""></div></div></section>
<section class="content-section"><div class="section-head"><span class="section-title"><b>◎</b> ЗАДАНИЯ</span><button class="link" data-action="tasks">СМОТРЕТЬ ВСЕ ↗</button></div><div class="task-list">${taskRow(0,true)}${taskRow(1,true)}${taskRow(2,true)}</div></section>
${streakHomeTeaser()}
`}
const taskDefs=[{title:'Открой бесплатный дроп',detail:'0 / 1',reward:'30 F'},{title:'Получи новую карточку',detail:'0 / 1',reward:'30 F'},{title:'Открой стандартный пак',detail:'0 / 1',reward:'30 F'}];

function gameTaskRow(t){
 const complete=t.claimed,custom=t.type==='subscription';
 const status=complete?'ВЫПОЛНЕНО':custom?'Подпишись на канал, затем проверь подписку':
   Math.min(t.progress,t.target)+' / '+t.target+' · '+t.description;
 const id='data-task-scope="'+escapeHtml(t.scope)+'" data-task-slot="'+Number(t.slot)+'"';
 const claim=complete?'<span class="pill">✓ ПОЛУЧЕНО</span>':custom?
   '<button type="button" class="outlinebtn" data-task-action="open" '+id+'>ПЕРЕЙТИ ↗</button>'+
   '<button type="button" class="outlinebtn" data-task-action="claim" '+id+'>ПРОВЕРИТЬ</button>':
   '<button type="button" class="outlinebtn" data-task-action="claim" '+id+
   (t.ready?'':' disabled')+'>'+(t.ready?'ЗАБРАТЬ':'В ПРОЦЕССЕ')+'</button>';
 const reroll=!custom&&!complete&&t.rerollable?
   '<button type="button" class="flip-task-reroll" data-task-action="reroll" '+id+
   ' aria-label="Бесплатно заменить задание '+Number(t.slot)+'">↻ ЗАМЕНИТЬ</button>':'';
 return '<div class="task flip-real-task"><div class="task-text">'+
   '<h4>'+escapeHtml(t.title)+'</h4><p>'+escapeHtml(status)+'</p></div>'+
   '<span class="reward">+'+Number(t.reward_f)+' F</span>'+
   '<div class="flip-task-controls">'+claim+reroll+'</div></div>';
}
function streakHomeTeaser(){
 if(!live()||!bridge?.tasks?.streak)return '';
 const streak=bridge.tasks.streak,days=Math.min(7,Math.max(0,Number(streak.days)||0));
 return '<button type="button" class="flip-streak-mini" data-action="tasks">'+
   '<span>✦ СЕРИЯ АКТИВНОСТИ</span><strong>'+days+' / 7</strong>'+
   '<small>'+(Number(streak.unclaimed)>0?'Награда +100 F готова к получению ↗':
     '+100 F за 7 дней · 1 пропуск')+'</small></button>';
}
function streakPanel(){
 const streak=live()?bridge?.tasks?.streak:null;
 if(!streak)return '';
 const days=Math.min(7,Math.max(0,Number(streak.days)||0)),unclaimed=Math.max(0,Number(streak.unclaimed)||0);
 return '<section class="flip-streak-panel" aria-label="Серия активности">'+
   '<div class="flip-streak-head"><div><span class="eyebrow">7-DAY STREAK / FLIP</span>'+
   '<h3>СЕРИЯ АКТИВНОСТИ</h3></div><b>'+days+' / 7</b></div>'+
   '<div class="flip-streak-days" aria-label="'+days+' из 7 дней">'+
   Array.from({length:7},(_,i)=>'<span class="'+(i<days?'is-filled':'')+'">'+(i<days?'✓':i+1)+'</span>').join('')+
   '</div><p>'+(streak.grace_used?'Пропуск использован.':
     '1 пропуск доступен.')+
   ' За 7 дней — <strong>100 F</strong>.</p>'+
   (unclaimed?'<button class="flip-streak-claim" type="button" data-streak-claim>'+
     'ЗАБРАТЬ '+(unclaimed>1?unclaimed+' × ':'')+'100 F ↗</button>':
     '<small>Обновление · 00:00 МСК</small>')+
   '</section>';
}
function taskRow(i,compact=false){
 const t=live()?bridge?.tasks?.daily?.[i]:null;
 if(t)return gameTaskRow(t);
 const task=taskDefs[i],done=state.claimedTasks.includes(i);
 return '<div class="task"><button class="taskbutton" data-task="'+i+'" '+(done?'disabled':'')+
   '><div class="task-check '+(done?'completed':'')+'">'+(done?'✓':'↗')+'</div>'+
   '<div class="task-text"><h4>'+task.title+'</h4><p>'+(done?'ВЫПОЛНЕНО':task.detail)+
   '</p></div><span class="reward">'+(done?'✓':task.reward)+
   '</span><span class="task-arrow">›</span></button></div>';
}
function collection(){return window.FLIPCollection.home(state)}
function collectionArtist(){return window.FLIPCollection.artist(state,collectionArtistId)}
function collectionRelease(){return window.FLIPCollection.release(state,collectionArtistId,collectionReleaseId)}
function collectionHistory(){return window.FLIPCollection.history(state)}
function catalogView(){
  const artistList=catalog.artists.filter(a=>a.active!==false);
  const releases=artistList.flatMap(artist=>artist.releases.filter(r=>r.active!==false)
    .map(release=>({artist,release})));
  return '<div class="panel"><button class="link" data-action="collection">← К КОЛЛЕКЦИИ</button>'+
   '<h2>КАТАЛОГ<span style="color:var(--lime)">.</span></h2>'+
   '<div class="chips catalog-stats" aria-label="Состав каталога">'+
   '<span class="catalog-stat">'+artistList.length+' АРТИСТОВ</span>'+
   '<span class="catalog-stat">'+releases.length+' РЕЛИЗОВ</span></div>'+
   releases.map(({artist,release})=>'<section class="catalog-release">'+
     '<div class="collection-heading"><h3>'+escapeHtml(artist.name+' — '+release.title)+
     '</h3><span>'+escapeHtml(String(release.year||'АРХИВ'))+'</span></div>'+
     '<div class="square-grid catalog-grid">'+catalog.rarities.map(rarity=>{
       const card=catalog.getCard(artist.id,release.id,rarity);
       return '<button type="button" class="catalog-tile" data-catalog-artist="'+escapeHtml(artist.id)+
        '" data-catalog-release="'+escapeHtml(release.id)+'" data-catalog-rarity="'+rarity+
        '" aria-label="Посмотреть '+escapeHtml(card.title)+', '+escapeHtml(card.rarity)+'">'+
        sq(card)+'<span class="catalog-tile-label rarity-'+rarity+'">'+escapeHtml(card.rarity)+
        '</span></button>';
     }).join('')+'</div></section>').join('')+
   '</div>';
}

function trades(){return '<div class="panel"><h2>ОБМЕНЫ<span style="color:var(--lime)">.</span></h2><div id="flip-trades-root"></div></div>'}
function achievements(){return window.FLIPAchievements?.page(bridge?.achievements,{online:live()})||'<div class="panel"><h2>ДОСТИЖЕНИЯ</h2><p>Загрузка…</p></div>'}
function leaderboard(){return '<div class="panel"><button class="link" data-action="profile">← К ПРОФИЛЮ</button><h2>РЕЙТИНГ<span style="color:var(--lime)">.</span></h2><p class="desc">CP не тратятся и не покупаются.</p><div id="flip-leaderboard-root"></div></div>'}
function store(){
 return window.FLIPStore?.page({
   shop:bridge?.shop,state,live:live(),demo:bridge?.mode==='demo',busy:shopBusy||serverBusy,
   tab:shopTab,loading:shopLoading,error:shopError
 })||'<div class="panel"><h2>МАГАЗИН</h2><p>Загрузка...</p></div>';
}
async function openStore(){
 render('store');
 if(!live()||shopLoading||!bridge?.refreshShop)return;
 shopLoading=true;shopError='';
 render('store');
 try{await bridge.refreshShop();}
 catch(error){shopError=error.message||'STORE_ERROR';}
 finally{shopLoading=false;if(current==='store')render('store');}
}
// Render a profile photo only after the server has verified the Telegram launch.
function playerAvatar(){
  const name=live()?state.telegramName||'FLIP PLAYER':'FLIP PLAYER';
  const words=String(name).trim().split(/\s+/).filter(Boolean);
  const initial=words.length>1
    ? [...words[0]][0]+[...words[1]][0]
    : [...(words[0]||'F')].slice(0,2).join('');
  const photo=live() && typeof state.telegramAvatarUrl==='string' &&
    state.telegramAvatarUrl.startsWith('https://')
    ? `<img id="flipPlayerPhoto" class="flip-player-photo" src="${escapeHtml(state.telegramAvatarUrl)}" alt="" referrerpolicy="no-referrer" decoding="async">`
    : '';
  return `<div class="flip-player-avatar"><span class="flip-player-initials">${escapeHtml(initial.toUpperCase())}</span>${photo}</div>`;
}
function profile(){return `<div class="panel"><h2>ПРОФИЛЬ<span style="color:var(--lime)">.</span></h2><div class="content-card"><div class="flip-player-row">${playerAvatar()}<div class="flip-player-meta"><h3>${escapeHtml(live()?(state.telegramName||'FLIP PLAYER'):'FLIP PLAYER')}</h3><p class="flip-player-handle">${escapeHtml(live()?(state.telegramHandle||'FLIP PLAYER'):'FLIP / DEMO')}</p><span class="pill">LVL ${state.level} · ${state.xp} XP</span></div></div><div class="progress" style="--p:${Math.min(100,100*state.xp/(state.xpToNext||100))}%;margin-top:19px"><i></i></div><p>Следующий уровень · +30 F</p></div>${window.FLIPShowcase?.own(bridge?.showcase,{online:live()})||''}${window.FLIPAchievements?.profile(bridge?.achievements,{online:live()})||''}${window.FLIPActivity?.profileStats(bridge?.hub?.stats,{online:live()})||''}${live()?'':blocked()?'<div class="content-card"><h3>НЕТ СОЕДИНЕНИЯ</h3><p>Не удалось подключиться к серверу. Проверь Telegram и открой FLIP снова.</p></div>':'<div class="content-card"><h3>ДЕМО</h3><button class="outlinebtn" id="resetBtn">СБРОСИТЬ ДЕМО</button></div>'}</div>`}
function tasks(){
 const payload=live()?bridge?.tasks:null;
 const daily=payload?.daily,weekly=payload?.weekly;
 const note=scope=>'<div class="flip-quest-reroll-info">'+
   (payload?.[scope+'_reroll_used']?'Замена использована':'Замена: 1 бесплатно')+'</div>';
 return '<div class="panel"><button class="link" data-action="home">← НА ГЛАВНУЮ</button>'+
  '<h2>ЗАДАНИЯ<span style="color:var(--lime)">.</span></h2>'+
  ''+
  streakPanel()+
  '<div class="section-head"><span class="section-title">DAILY TASKS · 3</span>'+
  '<span class="section-sub">ЕЖЕДНЕВНО · 00:00</span></div>'+
  (payload?note('daily'):'')+
  '<div class="task-list">'+
  (daily?.length===3?daily.map(gameTaskRow).join(''):[0,1,2].map(i=>taskRow(i)).join(''))+'</div>'+
  '<div class="section-head" style="margin-top:24px"><span class="section-title">WEEKLY TASKS · 3</span>'+
  '<span class="section-sub">ПОНЕДЕЛЬНИК · 00:00</span></div>'+
  (payload?note('weekly'):'')+
  '<div class="task-list">'+
  (weekly?.length===3?weekly.map(gameTaskRow).join(''):'<p>Загрузка еженедельных заданий…</p>')+
  '</div><p class="note">За выполнение всех трёх недельных заданий: дополнительно +50 F.</p></div>';
}
function showcaseEdit(){
 if(!live())return '<div class="panel"><button class="link" data-action="profile">← К ПРОФИЛЮ</button><h2>ВИТРИНА</h2><p>Доступно только через Telegram.</p></div>';
 return window.FLIPShowcase?.editor(state,bridge?.showcase,showcaseEditingSlot)||'';
}
function publicProfile(){
 return window.FLIPShowcase?.publicPage(publicProfileData,{
   loading:publicProfileLoading,error:publicProfileError
 })||'';
}
async function openPlayerProfile(publicId){
 if(!live()||!bridge?.publicProfile)return;
 if(typeof publicId!=='string'||!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(publicId))return;
 publicProfileData=null;publicProfileLoading=true;publicProfileError='';
 render('publicProfile');
 try{
   publicProfileData=await bridge.publicProfile(publicId);
 }catch(error){
   publicProfileError=error.message==='PLAYER_NOT_FOUND'?
     'Этот игрок пока не зарегистрирован в FLIP.':'Не удалось загрузить профиль игрока.';
 }finally{
   publicProfileLoading=false;
   if(current==='publicProfile')render('publicProfile');
 }
}
async function updateShowcase(slot,cardId){
 if(!live()||serverBusy||!bridge?.setShowcase)return;
 if(!Number.isInteger(slot)||slot<1||slot>3)return;
 serverBusy=true;
 try{
   if(cardId!==null){
     const permitted=window.FLIPShowcase?.cardsFromState(state).some(c=>c.id===cardId);
     if(!permitted)return;
   }
   await bridge.setShowcase(slot,cardId);
   render('profile');
   toast(cardId===null?'Карточка убрана из витрины.':'Витрина обновлена!');
 }catch(error){
   const text=error.message==='SHOWCASE_NOT_OWNED'?
     'Этой карточки больше нет в коллекции.':
     'Не удалось сохранить витрину. Попробуй снова.';
   toast(text);
   try{await bridge.refreshShowcase();render(current)}catch{}
 }finally{serverBusy=false}
}
function activity(){
 return window.FLIPActivity?.activityPage(bridge?.hub,{online:live(),loading:hubLoading,error:hubError})||
  '<div class="panel"><h2>АКТИВНОСТЬ</h2><p>Загрузка…</p></div>';
}
function updateInbox(){
 const dot=document.querySelector('#bellBtn .dot');
 const unread=live()?Math.max(0,Number(bridge?.hub?.unread_count)||0):0;
 if(dot){dot.hidden=unread===0;dot.textContent=unread>9?'9+':String(unread);}
 const body=document.querySelector('#flip-notifications-body');
 if(body){
   body.innerHTML=window.FLIPActivity?.notifications(bridge?.hub,{
     online:live(),loading:hubLoading
   })||'';
   // The inbox is replaced after each server poll; convert every new glyph
   // to the same platform-independent SVG icons as the rest of FLIP.
   window.FLIPIcons?.render(body);
 }
}
async function refreshHub({rerender=false}={}){
 if(!live()||hubLoading||!bridge?.refreshHub)return null;
 hubLoading=true;hubError='';
 try{
   const data=await bridge.refreshHub();
   // Reconcile offers and badges using this existing signed 45-second hub poll.
   window.FLIPTrades?.syncHub?.(data);
   // Admin-awarded tester modes are published through this existing private
   // hub poll. Players see a changed cooldown without restarting FLIP.
   const modes=data?.play_modes;
   if(modes&&typeof modes==='object'){
     const drop=modes.unlimited_drop===true;
     const pack=modes.unlimited_packs===true;
     const timestamp=Date.parse(modes.drop_ready_at);
     const changed=state.unlimitedDrop!==drop||state.unlimitedPacks!==pack||
       (Number.isFinite(timestamp)&&state.dropReadyAt!==timestamp);
     state.unlimitedDrop=drop;state.unlimitedPacks=pack;
     if(Number.isFinite(timestamp))state.dropReadyAt=timestamp;
     if(Number.isSafeInteger(modes.packs_today))state.packsToday=modes.packs_today;
     if(changed){
       if(current==='home')updateTimer();
       if(current==='store')bridge.refreshShop?.().then(()=>{
         if(current==='store')render('store');
       }).catch(()=>{});
     }
   }
   // Reuse the existing hub poll, including on Telegram launch and after
   // successful trades. Acknowledgments never alter owned inventory.
   const hasNewCards=window.FLIPDelivery?.enqueue(data?.card_deliveries,{
     onAcknowledge:ids=>bridge.ackCardDeliveries(ids),
     onRefresh:()=>refreshHub({rerender:true})
   });
   if(hasNewCards&&bridge?.refreshInventory){
     // One fetch per fresh receipt batch, not a new polling interval.
     // Keep collection copies current even if the gift arrived mid-session.
     bridge.refreshInventory().then(snapshot=>{
       if(!snapshot)return;
       Object.assign(state,snapshot);
       if(['collection','collectionArtist','collectionRelease','profile'].includes(current))
         render(current);
       else $('#balance').textContent=money(state.balance);
     }).catch(()=>{/* The next signed launch will reconcile card copies. */});
   }
   if(rerender&&['profile','activity'].includes(current))render(current);
   updateInbox();
   return data;
 }catch(error){hubError=error.message||'HUB_ERROR';updateInbox();return null;}
 finally{hubLoading=false;}
}
function openActivity(){render('activity');refreshHub({rerender:true});}
async function markNotification(eventId=null,route=null){
 if(!live())return;
 try{
   await bridge.markEventsRead(eventId);updateInbox();
   if(['activity','profile'].includes(current))render(current);
 }catch{toast('Не удалось обновить уведомления. Попробуй ещё раз.');}
 if(route){
   document.querySelector('#notifications')?.classList.remove('show');
   if(route==='store')openStore();
   else if(route==='activity')openActivity();
   else if(['trades','achievements','collection','profile'].includes(route))render(route);
 }
}
function rankingProfile(){return live()?'<div class="content-card"><h3 style="margin-top:9px;font-size:15px">ТВОЙ РЕЙТИНГ</h3><div class="kpi">'+Number(state.cp||0).toLocaleString('ru-RU',{maximumFractionDigits:2})+' CP</div><button type="button" class="outlinebtn" data-action="leaderboard">ОТКРЫТЬ ОБЩИЙ ТОП ↗</button></div>':''}
function adminProfile(){
  const id=window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
  const idInfo=live()&&bridge?.isAdmin===true&&Number.isSafeInteger(id)&&id>0?
    '<div class="content-card"><p>Твой Telegram ID: <strong>'+id+'</strong></p><p class="muted">Используется для настройки административного доступа. Не является паролем.</p></div>':'';
  return profile()+rankingProfile()+idInfo+(live()&&bridge?.isAdmin?
    '<div class="content-card flip-admin-entry"><button type="button" class="outlinebtn" data-action="admin">◆ ОТКРЫТЬ АДМИН-ПАНЕЛЬ ↗</button></div>':'');
}
function adminPage(){return live()&&bridge?.isAdmin?
  '<div class="panel flip-admin-page"><button class="link" data-action="profile">← НАЗАД В ПРОФИЛЬ</button><span class="eyebrow">FLIP / PRIVATE ACCESS</span><h2>CONTROL CENTER<span style="color:var(--lime)">.</span></h2><p class="desc">Поиск игроков и карточек, выдача карт, XP и F с журналом начислений.</p><div id="flip-admin-root"></div></div>':
  '<div class="panel"><h2>ДОСТУП ЗАКРЫТ</h2></div>';}
const render=(view=current)=>{current=view;$('#screen').innerHTML=({home,collection,collectionArtist,collectionRelease,collectionHistory,catalog:catalogView,trades,leaderboard,store,profile:adminProfile,admin:adminPage,tasks,achievements,showcaseEdit,publicProfile,activity}[view]||home)();document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.dataset.tab===(['catalog','collectionArtist','collectionRelease','collectionHistory'].includes(view)?'collection':['achievements','showcaseEdit','publicProfile','activity'].includes(view)?'profile':view)));$('#balance').textContent=money(state.balance);$('#scroll').scrollTop=0;updateTimer();window.FLIPIcons?.render($('#screen'));if(view==='admin'&&bridge?.isAdmin)window.FLIPAdmin?.mount($('#flip-admin-root'));if(view==='trades')window.FLIPTrades?.mount($('#flip-trades-root'));if(view==='leaderboard')window.FLIPLeaderboard?.mount($('#flip-leaderboard-root'));const photo=$('#flipPlayerPhoto');if(photo)photo.addEventListener('error',()=>photo.remove(),{once:true});const publicPhoto=$('.flip-showcase-player-photo');if(publicPhoto){const reveal=()=>publicPhoto.classList.add('is-loaded');if(publicPhoto.complete&&publicPhoto.naturalWidth>0)reveal();else{publicPhoto.addEventListener('load',reveal,{once:true});publicPhoto.addEventListener('error',()=>publicPhoto.remove(),{once:true});}}};
let toastTid;const toast=msg=>{const el=$('#toast');el.textContent=msg;el.classList.add('show');clearTimeout(toastTid);toastTid=setTimeout(()=>el.classList.remove('show'),3000)};
const closeModal=()=>{
 if(window.FLIPPackReveal?.isOpen?.())window.FLIPPackReveal.close();
 else $('#overlay').classList.remove('show');
};
function modal(html){$('#modal').innerHTML=html;window.FLIPIcons?.render($('#modal'));$('#overlay').classList.add('show')}
function updateTimer(){
  if(current!=='home')return;
  const welcome=live()&&Number(state.welcomeRemaining||0)>0;
  const recovering=live()&&bridge?.hasPending?.('drop');
  const delta=state.dropReadyAt-Date.now();
  const ready=recovering||welcome||delta<=0;
  const value=$('#timerValue'), timer=$('#dropTimer'), badge=$('#readyBadge'), button=$('#dropBtn');
  if(!value)return;
  if(timer)timer.hidden=ready||blocked();
  button.disabled=serverBusy||blocked()||!ready;
  if(blocked()){
    value.textContent='';badge.textContent='◷ ОЖИДАНИЕ СЕРВЕРА';
    button.innerHTML='<span>ПОДКЛЮЧЕНИЕ…</span><span class="drop-cta-arrow">↗</span>';
  }else if(recovering){
    value.textContent='';badge.textContent='◷ НЕОКОНЧЕННЫЙ ЗАПРОС';
    button.innerHTML='<span>ВОССТАНОВИТЬ ДРОП</span><span class="drop-cta-arrow">↗</span>';
  }else if(welcome){
    value.textContent='';
    badge.textContent=`● ПРИВЕТСТВЕННЫЙ ДРОП · ${4-state.welcomeRemaining}/3`;
    button.innerHTML='<span>ОТКРЫТЬ ПРИВЕТСТВЕННЫЙ ДРОП</span><span class="drop-cta-arrow">↗</span>';
  }else if(ready){
    value.textContent='';badge.textContent='● ДРОП ДОСТУПЕН';
    button.innerHTML='<span>ОТКРЫТЬ ДРОП</span><span class="drop-cta-arrow">↗</span>';
  }else{
    const seconds=Math.ceil(delta/1000),h=String(Math.floor(seconds/3600)).padStart(2,'0'),m=String(Math.floor((seconds%3600)/60)).padStart(2,'0'),sec=String(seconds%60).padStart(2,'0');
    value.textContent=`${h}:${m}:${sec}`;badge.textContent='◷ ДРОП ПЕРЕЗАРЯЖАЕТСЯ';
    button.innerHTML='<span>ДРОП НЕ ГОТОВ</span><span class="drop-cta-arrow">↗</span>';
  }
  window.FLIPIcons?.render(button);window.FLIPIcons?.render(badge);
}
function rollRarity(source='drop',rarePlus=false){
  // Browser RNG is strictly a prototype; authoritative payouts need a backend.
  const forced=(location.hostname==='localhost'||location.hostname==='127.0.0.1')?new URLSearchParams(location.search).get('previewRarity'):null;
  if(forced&&['common','rare','epic','legendary','mythic','hidden'].includes(forced.toLowerCase()))return forced.toLowerCase();
  if(rarePlus){
    const n=Math.random()*35;
    return n<25?'rare':n<33?'epic':n<34.8?'legendary':'mythic';
  }
  const misses=source==='drop'?Number(state.pityMisses||0):0;
  const bonus=source==='drop'?Math.min(40,Math.max(0,misses-29)*2):0;
  const common=64.995-bonus*(64.995/89.995),rare=25-bonus*(25/89.995);
  const r=Math.random()*100;
  if(r<0.005)return 'hidden';
  const t=r-0.005;
  if(t<common)return 'common';
  if(t<common+rare)return 'rare';
  if(t<common+rare+8+bonus)return 'epic';
  if(t<common+rare+8+bonus+1.8)return 'legendary';
  return 'mythic';
}
function randomCard(source='drop',rarePlus=false){
  // Order is important: artist → release → rarity.
  const artist=catalog.artists[Math.floor(Math.random()*catalog.artists.length)];
  const release=artist.releases[Math.floor(Math.random()*artist.releases.length)];
  const rarity=rollRarity(source,rarePlus);
  if(rarity==='hidden')return {...hiddenDemoCard}; // Future: hidden leaks get their own separate catalog.
  return catalog.getCard(artist.id,release.id,rarity);
}
function gain(card,source){
  const first=!state.received.some(c=>uniqueKey(c)===uniqueKey(card));
  state.received.push(card);
  if(card?.id && !state.discovered.includes(card.id))state.discovered.push(card.id);
  state.xp+=source==='drop'?10:0;
  if(first)state.xp+=10;
  const finishTask=i=>{if(!state.claimedTasks.includes(i)){state.claimedTasks.push(i);state.balance+=30;state.xp+=20}};
  if(source==='drop'){
    if(card.rarity==='Hidden'){/* Hidden must not affect pity. */}
    else if(['Epic','Legendary','Mythic'].includes(card.rarity))state.pityMisses=0;
    else state.pityMisses=Number(state.pityMisses||0)+1;
    state.dropReadyAt=Date.now()+4*3600*1000;
    finishTask(0);if(first)finishTask(1);
  }
  if(source==='pack'){if(first)finishTask(1);finishTask(2)}
  while(state.xp>=100){state.xp-=100;state.level++;state.balance+=30}
  save();
}
function cardReveal(card,label){modal(`<span class="eyebrow">${escapeHtml(label)}</span><h3>НОВАЯ КАРТОЧКА!</h3>${sq(card)}<div class="pill">✦ ${escapeHtml(card.rarity.toUpperCase())}</div><p>ТЕСТ · БЕЗ НАГРАДЫ</p><button class="bigbtn" id="closeReveal">ПРОДОЛЖИТЬ ↗</button>`)}
function serverError(error){
  const reasons={DROP_COOLDOWN:'Дроп ещё перезаряжается',INSUFFICIENT_FUNDS:'Недостаточно F',DAILY_PACK_LIMIT:'Лимит: 10 паков за день',THEME_UNAVAILABLE:'Этот тематический набор пока недоступен',UNKNOWN_PACK:'Такой набор не найден',PACK_GENERATION_FAILED:'Не удалось сформировать набор. Попробуй ещё раз.',EXPIRED_TELEGRAM_SESSION:'Перезапусти FLIP через Telegram',INVALID_TELEGRAM_SESSION:'Ошибка Telegram: перезапусти приложение'};
  return reasons[error?.message]||'Не удалось связаться с сервером. Повтори попытку.';
}
function cardById(id){
  if(id==='demo/hidden/archive-001')return {...hiddenDemoCard};
  const [a,r,rarity]=String(id||'').split('/');
  return catalog.getCard(a,r,rarity);
}
async function doDrop(){
  if(window.FLIPReveal?.isOpen()||serverBusy)return;
  if(blocked()){toast('Открой FLIP через Telegram и проверь подключение');return;}
  if(live()){
    if(!bridge.hasPending('drop')&&!(state.welcomeRemaining>0)&&Date.now()<state.dropReadyAt)return;
    serverBusy=true;updateTimer();
    // Start the roulette while the authoritative server determines the card.
    const rouletteStarted=window.FLIPReveal?.begin?.()===true;
    try{
      const result=await bridge.drop(crypto.randomUUID());
      applyServerState(result.state);
      bridge.refreshTasks?.().then(()=>{if(current==='home')render('home')}).catch(()=>{});
      bridge.refreshAchievements?.().catch(()=>{});
       refreshHub({rerender:true});
      const card=cardById(result.card_id);
      if(card){
        if(rouletteStarted)window.FLIPReveal.resolve(card);
        else if(window.FLIPReveal)window.FLIPReveal.open(card);
        else cardReveal(card,'FREE DROP');
      }else{
        window.FLIPReveal?.abort?.();
        toast('Дроп сохранён, но изображение пока не найдено. Открой коллекцию.');
      }
    }catch(error){
      window.FLIPReveal?.abort?.();
      toast(serverError(error));
    }
    finally{serverBusy=false;updateTimer();}
    return;
  }
  if(Date.now()<state.dropReadyAt)return;
  const card=randomCard('drop');gain(card,'drop');render('home');
  if(window.FLIPReveal)window.FLIPReveal.open(card);else cardReveal(card,'FREE DROP');
}
// Preview runs through every style with real art. Never touches game state.
let roulettePreviewIndex=0;
function previewRoulette(){
  if(!live()||bridge?.isAdmin!==true)return;
  if(window.FLIPReveal?.isOpen())return;
  const sequence=[
    catalog.getCard('carti','die-lit','common'),
    catalog.getCard('carti','in-abundance','rare'),
    catalog.getCard('carti','playboi-carti','epic'),
    catalog.getCard('carti','whole-lotta-red','legendary'),
    catalog.getCard('carti','music','mythic'),
    hiddenDemoCard
  ];
  const card={...sequence[roulettePreviewIndex++%sequence.length]};
  if(window.FLIPReveal)window.FLIPReveal.open(card,{preview:true});
  else toast('Рулетка пока не загрузилась. Попробуй ещё раз.');
}
async function doPack(packType='standard'){
 if(serverBusy||shopBusy)return;
 if(blocked()){toast('Нет подключения к серверу Telegram');return;}
 if(!['standard','archive','new-era'].includes(packType))return;
 if(live()){
   serverBusy=true;shopBusy=true;
   if(current==='store')render('store');
   try{
     const result=packType==='standard'?
       await bridge.pack(crypto.randomUUID()):
       await bridge.themePack(packType,crypto.randomUUID());
     applyServerState(result.state);
     bridge.refreshTasks?.().catch(()=>{});
     bridge.refreshAchievements?.().catch(()=>{});
     refreshHub({rerender:true});
     bridge.refreshShop?.().then(()=>{
       if(current==='store')render('store');
     }).catch(()=>{});
     const pack=(result.card_ids||[]).map(cardById).filter(Boolean);
     const actualType=result.pack_type||packType;
     const price=Number(result.price)||(actualType==='standard'?200:250);
     if(pack.length===3){
       if(!window.FLIPPackReveal?.open?.(pack,{type:actualType,price})){
         modal('<h3>ТВОЙ НАБОР</h3><div class="square-grid pack-open-grid">'+
           pack.map(sq).join('')+'</div>'+
           '<p>Три карточки сохранены в коллекции.</p>'+
           '<button class="bigbtn" id="closeReveal">ПРОДОЛЖИТЬ ↗</button>');
       }
     }else{
       toast('Набор сохранён. Проверь коллекцию — не все изображения доступны.');
     }
   }catch(error){toast(serverError(error));}
   finally{
     serverBusy=false;shopBusy=false;
     if(current==='store')render('store');
   }
   return;
 }
 if(packType==='standard')doPackDemo();
}
function doPackDemo(){
  const day=new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Moscow'});
  if(state.lastPackDay!==day){state.lastPackDay=day;state.packsToday=0}
  if(state.packsToday>=10){toast('Дневной лимит 10 стандартных паков исчерпан');return}
  if(state.balance<200){toast('Не хватает F для покупки стандартного пака');return}
  const pack=[];let attempts=0;
  while(pack.length<3&&attempts++<1000){const card=randomCard('pack');if(!pack.some(c=>uniqueKey(c)===uniqueKey(card)))pack.push(card)}
  if(pack.length<3){toast('Не удалось собрать пак. Попробуй ещё раз.');return}
  if(pack.every(c=>c.rarity==='Common')){
    let replacement,tries=0;
    do{replacement=randomCard('pack',true)}while(++tries<1000&&pack.some(c=>uniqueKey(c)===uniqueKey(replacement)));
    pack[Math.floor(Math.random()*3)]=replacement;
  }
  state.balance-=200;state.packsToday++;
  for(const card of pack)gain(card,'pack');
  state.xp+=30;
  while(state.xp>=100){state.xp-=100;state.level++;state.balance+=30}
  save();render('store');
  if(!window.FLIPPackReveal?.open?.(pack,{type:'standard',price:200}))
    modal(`<h3>ТВОЙ ПАК</h3><div class="square-grid pack-open-grid">${pack.map(sq).join('')}</div><p>Демо-коллекция обновлена локально.</p><button class="bigbtn" id="closeReveal">ПРОДОЛЖИТЬ ↗</button>`);
}
// FLIP v0.8.9: construct navigation sets exclusively from visible/owned
// collection entries. Catalog previews are deliberately kept separate.
function collectionViewerCards(historyMode=false,hiddenOnly=false){
  const records=window.FLIPCollection.inventory(state);
  const hidden=[...records.hidden.values()].map(item=>({...item,color:'hidden',rarity:'Hidden'}));
  const lookup=id=>records.owned.get(id)||hidden.find(c=>c.id===id)||
    (historyMode?window.FLIPCollection.historyCard(state,id):null);
  const selector=historyMode?'#screen [data-history-card],#screen [data-hidden-card]':
    '#screen [data-owned-card]';
  const nodes=[...document.querySelectorAll(selector)];
  const ids=[];
  for(const node of nodes){
    if(node.hidden||node.closest('[hidden]'))continue;
    const id=node.dataset.ownedCard||node.dataset.historyCard||node.dataset.hiddenCard;
    if(id&&!ids.includes(id))ids.push(id);
  }
  const visible=ids.map(lookup).filter(Boolean);
  if(historyMode)return visible.length?visible:[...records.owned.values(),...hidden];
  if(hiddenOnly)return hidden;
  // Gallery reflects active search/filter/sort. Hidden is an independent
  // secret archive, added only when viewing the whole personal collection.
  const selectedRarity=document.querySelector('#screen [data-collection-gallery-filter][aria-pressed="true"]')
    ?.dataset.collectionGalleryFilter||'all';
  if(current==='collection'&&selectedRarity==='all')visible.push(...hidden);
  if(visible.length)return visible;
  return [...records.owned.values(),...hidden];
}
function showCatalogCard(artistId,release,rarity){
  const card=catalog.getCard(artistId,release,rarity);
  if(!card)return;
  const all=catalog.artists.flatMap(artist=>
    artist.releases.flatMap(item=>catalog.rarities.map(r=>catalog.getCard(artist.id,item.id,r))))
    .filter(Boolean);
  if(window.FLIPCardViewer?.open(card,{mode:'catalog',cards:all}))return;
  modal('<h3>'+escapeHtml(card.title)+'</h3><div class="catalog-modal-image">'+sq(card)+'</div>'+
    '<p>Каталог · '+escapeHtml(card.style)+'</p><button class="bigbtn" id="closeReveal">ЗАКРЫТЬ</button>');
}
function showOwnedCard(cardId,historyMode=false){
  const entry=historyMode?window.FLIPCollection.historyCard(state,cardId):
    window.FLIPCollection.cardInfo(state,cardId);
  if(!entry)return;
  if(window.FLIPCardViewer?.open(entry,{
    mode:historyMode?'history':'owned',
    cards:collectionViewerCards(historyMode),
    count:entry.count,testCount:entry.testCount
  }))return;
  modal('<h3>'+escapeHtml(entry.title)+'</h3><div class="col-detail-art">'+sq(entry)+'</div>'+
    '<p>'+escapeHtml(entry.artist)+' · '+escapeHtml(entry.rarity)+'</p>'+
    '<button class="bigbtn" id="closeReveal">ЗАКРЫТЬ</button>');
}
function showHiddenCard(cardId){
  const hidden=window.FLIPCollection.inventory(state).hidden.get(cardId);
  if(!hidden)return;
  const card={...hidden,color:'hidden',rarity:'Hidden'};
  const historyMode=current==='collectionHistory';
  if(window.FLIPCardViewer?.open(card,{
    mode:historyMode?'history':'owned',
    cards:historyMode?collectionViewerCards(true):collectionViewerCards(false,true)
  }))return;
  modal('<h3>'+escapeHtml(card.title||'HIDDEN')+'</h3><p>HIDDEN · '+card.count+
    ' экз.</p><button class="bigbtn" id="closeReveal">ЗАКРЫТЬ</button>');
}
function updateCollectionGallery(){
  const host=document.querySelector('#screen [data-collection-gallery]');
  if(!host)return;
  const search=document.querySelector('#screen [data-collection-gallery-search]');
  const q=(search?.value||'').toLocaleLowerCase('ru-RU').trim();
  const filter=document.querySelector('#screen [data-collection-gallery-filter][aria-pressed="true"]')?.dataset.collectionGalleryFilter||'all';
  const sort=document.querySelector('#screen [data-collection-gallery-sort]')?.value||'rarity';
  const rarityOrder={common:0,rare:1,epic:2,legendary:3,mythic:4,hidden:5};
  const tiles=[...host.querySelectorAll('[data-gallery-item]')];
  // Recount independently for every rarity. A search may narrow these counts,
  // but switching the selected rarity must never copy the global total.
  const filteredBySearch=tiles.filter(tile=>!q||
    String(tile.dataset.filterable||'').toLocaleLowerCase('ru-RU').includes(q));
  const counts=Object.create(null);
  for(const tile of filteredBySearch){
    const rarity=tile.dataset.galleryRarity;
    counts[rarity]=(counts[rarity]||0)+1;
  }
  for(const button of document.querySelectorAll('#screen [data-collection-gallery-filter]')){
    const rarity=button.dataset.collectionGalleryFilter;
    const node=button.querySelector('[data-gallery-filter-count]');
    if(node)node.textContent=String(rarity==='all'?filteredBySearch.length:(counts[rarity]||0));
  }
  tiles.sort((a,b)=>{
    if(sort==='quantity')return Number(b.dataset.galleryCount||0)-Number(a.dataset.galleryCount||0)||
      (a.dataset.galleryName||'').localeCompare(b.dataset.galleryName||'','ru');
    if(sort==='title')return (a.dataset.galleryName||'').localeCompare(b.dataset.galleryName||'','ru');
    return (rarityOrder[b.dataset.galleryRarity]??-1)-(rarityOrder[a.dataset.galleryRarity]??-1)||
      (a.dataset.galleryName||'').localeCompare(b.dataset.galleryName||'','ru');
  });
  let visible=0;
  for(const tile of tiles){
    const matched=(!q||String(tile.dataset.filterable||'').toLocaleLowerCase('ru-RU').includes(q))&&
      (filter==='all'||tile.dataset.galleryRarity===filter);
    tile.hidden=!matched;
    if(matched)visible++;
    host.appendChild(tile);
  }
  const empty=document.querySelector('#screen [data-collection-gallery-empty]');
  if(empty)empty.hidden=visible>0;
  const status=document.querySelector('#screen [data-collection-gallery-status]');
  if(status)status.textContent='ПОКАЗАНО '+visible+' ИЗ '+tiles.length;
}
function applyCollectionSearch(value){
  const query=String(value||'').toLocaleLowerCase('ru-RU').trim();
  const rows=[...document.querySelectorAll('#screen [data-filterable]')];
  let found=0;
  for(const row of rows){row.hidden=!!query&&!String(row.dataset.filterable||'').toLocaleLowerCase('ru-RU').includes(query);if(!row.hidden)found++;}
  const empty=document.querySelector('#screen .col-no-matches');if(empty)empty.hidden=found!==0;
}
document.addEventListener('input',e=>{
  if(e.target.matches('[data-collection-search]'))applyCollectionSearch(e.target.value);
  if(e.target.matches('[data-collection-gallery-search]'))updateCollectionGallery();
});
document.addEventListener('change',e=>{
  if(e.target.matches('[data-collection-gallery-sort]'))updateCollectionGallery();
});
// touch-action: manipulation is the main iOS fix; this is a second guard for WebViews
// that still emit dblclick on static regions. No viewport zoom lock: pinch zoom remains allowed.
document.addEventListener('dblclick',e=>{if(e.target.closest('.phone'))e.preventDefault()},{passive:false});
async function handleGameTask(button){
 if(!live()||serverBusy)return;
 const scope=button.dataset.taskScope,slot=Number(button.dataset.taskSlot);
 const task=bridge?.tasks?.[scope]?.find(t=>t.slot===slot);
 if(!task||task.claimed)return;
 if(button.dataset.taskAction==='open'){
   if(task.type==='subscription'&&/^https:\/\/t\.me\/[A-Za-z0-9_+-]+$/.test(task.url||'')){
     const tg=window.Telegram?.WebApp;
     if(tg?.openTelegramLink)tg.openTelegramLink(task.url);
     else window.open(task.url,'_blank','noopener,noreferrer');
   }return;
 }
 serverBusy=true;button.disabled=true;
 try{
   if(button.dataset.taskAction==='reroll'){
     if(task.type!=='default'||!task.rerollable)return;
     await bridge.rerollTask(scope,slot);
     toast('Задание заменено бесплатно');
     render(current);
   }else{
     const result=await bridge.claimTask(scope,slot,task.version);
     applyServerState(result.state);
     bridge.refreshAchievements?.().catch(()=>{});
     toast('Получено +'+result.earned_f+' F и +'+result.earned_xp+' XP');
     render(current);
   }
 }catch(error){
   const messages={TASK_NOT_SUBSCRIBED:'Подписка не найдена. Подпишись и повтори.',
     TELEGRAM_CHECK_FAILED:'Ошибка Telegram. Проверь подписку позже.',
     TASK_INCOMPLETE:'Задание ещё не выполнено.',TASK_CHANGED:'Задание изменилось.',
     TASK_ALREADY_CLAIMED:'Награда уже получена.',TASK_NOT_VERIFIED:'Подписка не подтверждена.',
     TASK_REROLL_USED:'Бесплатная замена уже использована.',
     TASK_REROLL_FORBIDDEN:'Это задание нельзя заменить.',
     TASK_REROLL_UNAVAILABLE:'Сейчас нет другого подходящего задания.',
     STREAK_NOT_READY:'Награда за серию ещё недоступна.'};
   toast(messages[error.message]||serverError(error));
   try{await bridge.refreshTasks();render(current);}catch{}
 }finally{serverBusy=false;}
}
async function claimActivityStreak(){
 if(!live()||serverBusy||Number(bridge?.tasks?.streak?.unclaimed||0)<1)return;
 serverBusy=true;
 const btn=document.querySelector('[data-streak-claim]');if(btn)btn.disabled=true;
 try{
   const result=await bridge.claimStreak();
   applyServerState(result.state);
   bridge.refreshAchievements?.().catch(()=>{});
   toast('Серия активности: +100 F получено!');
   render(current);
 }catch(error){
   toast(error.message==='STREAK_NOT_READY'?'Награда за серию уже получена.':serverError(error));
   try{await bridge.refreshTasks();render(current);}catch{}
 }finally{serverBusy=false;}
}
async function claimAchievement(button){
 if(!live()||serverBusy)return;
 const code=String(button.dataset.achievementClaim||'');
 const stage=Number(button.dataset.achievementStage);
 const available=bridge?.achievements?.items?.find(a=>a.code===code);
 if(!available||!available.claimable||available.stage!==stage)return;
 serverBusy=true;button.disabled=true;
 try{
   const result=await bridge.claimAchievement(code,stage);
   applyServerState(result.state);
    refreshHub({rerender:true});
   toast('Достижение: +'+result.earned_f+' F'+(result.badge?' · значок открыт!':''));
   render('achievements');
 }catch(error){
   const messages={
     ACHIEVEMENT_ALREADY_CLAIMED:'Награда уже получена.',
     ACHIEVEMENT_NOT_READY:'Условие достижения пока не выполнено.',
     ACHIEVEMENT_STAGE_ORDER:'Забери предыдущий этап.',
     BAD_ACHIEVEMENT:'Достижение недоступно.'
   };
   toast(messages[error.message]||serverError(error));
   try{
     await bridge.refreshAchievements();
     if(current==='achievements')render('achievements');
   }catch{}
 }finally{serverBusy=false;}
}
function handleTask(i){if(state.claimedTasks.includes(i))return;modal(`<span class="eyebrow">DAILY TASK</span><h3>${taskDefs[i].title}</h3><p>Тестовое задание · без награды.</p><button class="bigbtn" id="closeReveal">ПОНЯТНО</button>`)}
document.addEventListener('click',e=>{
   const readAll=e.target.closest('[data-event-read-all]');
   if(readAll){markNotification(null);return;}
   const jump=e.target.closest('[data-event-route]');
   if(jump){
     const route=jump.dataset.eventRoute;
     if(!jump.hasAttribute('data-event-read')){
       document.querySelector('#notifications')?.classList.remove('show');
       if(route==='achievements')render('achievements');
       else if(route==='activity')openActivity();
       return;
     }
     const value=Number(jump.dataset.eventRead);
     const id=Number.isSafeInteger(value)&&value>0?value:null;
     if(id!==null)markNotification(id,route);
     return;
   }
   const shopTabButton=e.target.closest('[data-shop-tab]');
   if(shopTabButton){
     if(!['packs','history'].includes(shopTabButton.dataset.shopTab))return;
     shopTab=shopTabButton.dataset.shopTab;
     render('store');return;
   }
   const shopBuy=e.target.closest('[data-shop-buy]');
   if(shopBuy){if(!shopBuy.disabled)doPack(shopBuy.dataset.shopBuy);return;}
   const shopInspect=e.target.closest('[data-shop-inspect]');
   if(shopInspect){
     const card=window.FLIPStore?.cardFromId(shopInspect.dataset.shopInspect);
     if(card)window.FLIPCardViewer?.open(card,{mode:'catalog',cards:[card]});
     return;
   }
   // One click path for every leaderboard player. Works after async list updates
   // and doesn't depend on a CustomEvent dispatched from another script.
   const player=e.target.closest('[data-player-profile]');
   if(player){
     e.preventDefault();
     openPlayerProfile(player.dataset.playerProfile);
     return;
   }
   const profileOpen=e.target.closest('[data-open-my-profile]');
   if(profileOpen){openPlayerProfile(bridge?.showcase?.public_id);return;}
   const slot=e.target.closest('[data-showcase-slot]');
   if(slot){showcaseEditingSlot=Math.min(3,Math.max(1,Number(slot.dataset.showcaseSlot)||1));render('showcaseEdit');return;}
   const pick=e.target.closest('[data-showcase-pick]');
   if(pick){updateShowcase(showcaseEditingSlot,pick.dataset.showcasePick);return;}
   const remove=e.target.closest('[data-showcase-clear]');
   if(remove){updateShowcase(Number(remove.dataset.showcaseClear),null);return;}
   const viewCard=e.target.closest('[data-showcase-view-card]');
   if(viewCard){
     const card=window.FLIPShowcase?.cardFromId(viewCard.dataset.showcaseViewCard);
     if(card)window.FLIPCardViewer?.open(card,{mode:'catalog',cards:[card]});
     return;
   }
   const achFilter=e.target.closest('[data-ach-filter]');
   if(achFilter){
     window.FLIPAchievements?.filter(achFilter.dataset.achFilter);
     render('achievements');return;
   }
   const achClaim=e.target.closest('[data-achievement-claim]');
   if(achClaim){claimAchievement(achClaim);return;}
   if(e.target.closest('[data-streak-claim]')){claimActivityStreak();return;}
  const taskAction=e.target.closest('[data-task-action]');
  if(taskAction){handleGameTask(taskAction);return;}
  const galleryFilter=e.target.closest('[data-collection-gallery-filter]');
  if(galleryFilter){
    document.querySelectorAll('#screen [data-collection-gallery-filter]').forEach(button=>
      button.setAttribute('aria-pressed',String(button===galleryFilter)));
    updateCollectionGallery();return;
  }
  const collectionArtistTarget=e.target.closest('[data-collection-artist]');
  if(collectionArtistTarget){collectionArtistId=collectionArtistTarget.dataset.collectionArtist;collectionReleaseId=null;render('collectionArtist');return}
  const releaseTarget=e.target.closest('[data-collection-release]');
  if(releaseTarget){collectionReleaseId=releaseTarget.dataset.collectionRelease;render('collectionRelease');return}
  const historyTarget=e.target.closest('[data-collection-history]');
  if(historyTarget){render('collectionHistory');return}
  const backTarget=e.target.closest('[data-collection-back]');
  if(backTarget){render(backTarget.dataset.collectionBack==='artist'?'collectionArtist':'collection');return}
  const ownedTarget=e.target.closest('[data-owned-card]');
  if(ownedTarget){showOwnedCard(ownedTarget.dataset.ownedCard);return}
  const historyCardTarget=e.target.closest('[data-history-card]');
  if(historyCardTarget){showOwnedCard(historyCardTarget.dataset.historyCard,true);return}
  const hiddenTarget=e.target.closest('[data-hidden-card]');
  if(hiddenTarget){showHiddenCard(hiddenTarget.dataset.hiddenCard);return;}
  const tab=e.target.closest('[data-tab]');if(tab){if(tab.dataset.tab==='store')openStore();else render(tab.dataset.tab);return}const action=e.target.closest('[data-action]');if(action){let a=action.dataset.action;if(a==='admin'&&bridge?.isAdmin&&live())render('admin');else if(['home','collection','catalog','trades','store','profile','leaderboard','tasks','achievements','showcaseEdit','activity'].includes(a)){if(a==='store')openStore();else if(a==='activity')openActivity();else render(a);if(a==='tasks'&&live())bridge.refreshTasks?.().then(()=>{if(current==='tasks')render('tasks')}).catch(()=>{});if(a==='achievements'&&live())bridge.refreshAchievements?.().then(()=>{if(current==='achievements')render('achievements')}).catch(()=>{});}else if(a==='tradeDemo')modal('<span class="eyebrow">TRADES</span><h3>ДЕМО ОБМЕНА</h3><p>Открой FLIP через Telegram.</p><button class="bigbtn" id="closeReveal">ЗАКРЫТЬ</button>');else modal('<span class="eyebrow">COMING SOON</span><h3>СКОРО В FLIP</h3><p>Раздел пока недоступен.</p><button class="bigbtn" id="closeReveal">ЗАКРЫТЬ</button>');return}if(e.target.closest('[data-catalog-release]')){const b=e.target.closest('[data-catalog-release]');showCatalogCard(b.dataset.catalogArtist||'carti',b.dataset.catalogRelease,b.dataset.catalogRarity);return}if(e.target.closest('#dropBtn'))doDrop();if(e.target.closest('#dropPreviewBtn')&&live()&&bridge?.isAdmin===true)previewRoulette();if(e.target.closest('#buyPackBtn'))doPack('standard');if(e.target.closest('#closeReveal'))closeModal();if(e.target.closest('#balanceBtn'))openStore();if(e.target.closest('#bellBtn')){
 const panel=$('#notifications');panel.classList.toggle('show');
 if(panel.classList.contains('show'))refreshHub();
 updateInbox();
}if(e.target.closest('#closeNotifications'))$('#notifications').classList.remove('show');if(e.target.closest('#resetBtn')){if(live()||blocked())return;localStorage.removeItem('flip_demo');localStorage.removeItem('flip20_demo');Object.assign(state,{...initial,dropReadyAt:Date.now(),received:[],discovered:[],claimedTasks:[]});save();render('profile');toast('Демо сброшено — бесплатный дроп доступен')};const t=e.target.closest('[data-task]');if(t)handleTask(+t.dataset.task);if(e.target.closest('#levelQuick'))render('profile')});
$('#overlay').addEventListener('click',e=>{if(e.target===$('#overlay'))closeModal()});document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeModal();$('#notifications').classList.remove('show')}});document.addEventListener('input',e=>{
  const input=e.target.closest('[data-showcase-search]');
  if(!input)return;
  const needle=input.value.trim().toLocaleLowerCase('ru');
  for(const node of document.querySelectorAll('[data-showcase-filter]')){
    node.hidden=!String(node.dataset.showcaseFilter||'').toLocaleLowerCase('ru').includes(needle);
  }
});
window.addEventListener('flip-trade-changed',()=>{refreshHub({rerender:true});});
window.addEventListener('flip-trade-completed',async()=>{
  if(!live())return;
  try{
    const snapshot=await bridge.connect();
    if(snapshot){Object.assign(state,snapshot);render(current);}
    refreshHub({rerender:true});
  }catch(_){toast('Обмен выполнен, но не удалось обновить коллекцию. Перезапусти FLIP.');}
});
window.addEventListener('flip-admin-self-changed',async()=>{
  if(!live())return;
  try{
    const snapshot=await bridge.connect();
    if(snapshot){
      Object.assign(state,snapshot);
      $('#balance').textContent=money(state.balance);
      refreshHub({rerender:true});
    }
  }catch(_){/* balance refresh happens on next Telegram launch */}
});
// Update rotating assignments if a player keeps the Mini App open past midnight MSC.
const mskDay=()=>new Intl.DateTimeFormat('en-CA',{
 timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'
}).format(new Date());
let questDay=mskDay();
setInterval(()=>{
 const next=mskDay();
 if(next===questDay||!live()||document.visibilityState==='hidden')return;
 questDay=next;
 bridge.refreshTasks?.().then(()=>render(current)).catch(()=>{});
},60000);
setInterval(updateTimer,1000);
// Sender-side fast delivery check while an outbound trade is waiting.
// Reuse the signed hub and the existing hubLoading guard; no overlapping requests.
setInterval(()=>{
 if(live()&&document.visibilityState!=='hidden'&&
    window.FLIPTrades?.hasPendingOutgoing?.())refreshHub({rerender:true});
},12000);
setInterval(()=>{
 if(live()&&document.visibilityState!=='hidden')refreshHub({rerender:true});
},45000);
document.addEventListener('visibilitychange',()=>{
 if(document.visibilityState==='visible'&&live())refreshHub({rerender:true});
});
render();updateServerDot();updateInbox();window.FLIPIcons?.render($('#notifications'));
bridge?.connect().then(snapshot=>{
  if(snapshot){applyServerState(snapshot);refreshHub({rerender:true});}
  else if(bridge.mode==='demo')applyLocalDemoState();
  else render(current);
  if(bridge.mode==='blocked') toast(bridge.error==='NO_TELEGRAM_AUTH'?'Открой FLIP через своего Telegram-бота':'Сервер недоступен: '+(bridge.error||'ошибка'));
});
})();
