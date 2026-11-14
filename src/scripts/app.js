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
let serverBusy=false;
const bridge=window.FLIPServer;
const live=()=>bridge?.mode==='server';
const blocked=()=>bridge?.mode==='blocked'||bridge?.mode==='loading';
const serverLabel=()=>bridge?.mode==='server'?'● СЕРВЕР · ПРОГРЕСС СОХРАНЁН В АККАУНТЕ':bridge?.mode==='loading'?'◷ ПОДКЛЮЧАЕМ TELEGRAM…':bridge?.mode==='blocked'?'⚠ НЕТ СОЕДИНЕНИЯ С ИГРОВЫМ СЕРВЕРОМ':'◉ ЛОКАЛЬНОЕ ДЕМО · НЕ СИНХРОНИЗИРУЕТСЯ';
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
const catalog=window.FLIPCatalog;
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const artCards=catalog.rarities.map((rarity,i)=>catalog.getCard('carti',catalog.artists[0].releases[i%5].id,rarity));
const hiddenDemoCard={id:'demo/hidden/archive-001',title:'ARCHIVE 001',artist:'FLIP // SECRET',rarity:'Hidden',color:'hidden'};
const save=()=>{if(blocked()||live())return;try{localStorage.setItem('flip_demo',JSON.stringify(state))}catch{}};
const money=n=>n.toLocaleString('ru-RU');
const sq=(c,i=0)=>`<div class="sq-card ${escapeHtml(c.color||'')}" title="${escapeHtml(c.artist||'')} · ${escapeHtml(c.title)} · ${escapeHtml(c.rarity)}">${c.art?`<img class="sq-art-image" src="${escapeHtml(c.art)}" alt="${escapeHtml(c.title)} · ${escapeHtml(c.rarity)}" loading="lazy" decoding="async">`:`<span class="sq-art">${escapeHtml(c.title||'FLIP')}</span>`}<span class="small-badge">${escapeHtml(c.rarity)}${c.count?' ×'+c.count:''}</span></div>`;
function home(){return `<div class="hero-intro">
  <h2>Открой свой дроп.</h2>
  <p class="hero-description">Находи редкие релизы и пополняй коллекцию.</p>
  <div class="hero-progress" id="levelQuick" role="button" tabindex="0" aria-label="Открыть прогресс уровня">
    <span>LVL ${state.level}</span><span class="progress-separator"></span><span>${state.xp}/${state.xpToNext||100} XP</span><span class="hero-progress-arrow">↗</span>
  </div>
</div>
<div class="flip-server-indicator" id="flipServerIndicator">${serverLabel()}</div>
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
  <div class="drop-copy" id="dropCopy" hidden><h3>Открой свою карточку</h3><p id="dropSubtitle">Какая редкость выпадет на этот раз?</p></div>
  <button class="drop-cta" id="dropBtn"><span>ОТКРЫТЬ ДРОП</span><span class="drop-cta-arrow" aria-hidden="true">↗</span></button>
  <div class="drop-footer">
    <button type="button" class="drop-preview-btn" id="dropPreviewBtn" aria-label="Тест рулетки без получения карточки">
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.25 5.56"/><path d="M20 4v7h-7"/></svg>
      <span>ТЕСТ РУЛЕТКИ</span>
    </button>
    <span><span id="timerLabel">Следующий через 4 часа</span> <strong id="timerValue">ГОТОВ</strong></span>
  </div>
</section>
<section class="content-section"><div class="section-head"><span class="section-title"><b>✳</b> НОВАЯ КОЛЛЕКЦИЯ</span><button class="link" data-action="catalog">СМОТРЕТЬ ВСЁ ↗</button></div><div class="feature"><div class="feature-copy"><span class="pill">✦ NEW ARRIVAL</span><h3>PLAYBOI<br>CARTI</h3><p>Первые пять релизов уже в каталоге FLIP. Открой свою находку.</p><button data-action="catalog">СМОТРЕТЬ РЕЛИЗЫ ↗</button></div><div class="artwork second" aria-hidden="true"><img class="feature-cover" src="./src/assets/carti/die-lit/epic.webp" alt=""></div><div class="artwork" aria-hidden="true"><img class="feature-cover" src="./src/assets/carti/whole-lotta-red/mythic.webp" alt=""></div></div></section>
<section class="content-section"><div class="section-head"><span class="section-title"><b>◎</b> ЗАДАНИЯ</span><button class="link" data-action="tasks">СМОТРЕТЬ ВСЕ ↗</button></div><div class="task-list">${taskRow(0,true)}${taskRow(1,true)}${taskRow(2,true)}</div></section>
<div class="quick-nav"><button class="quick" data-action="store"><span>◈</span> ТЕМАТИЧЕСКИЕ НАБОРЫ ↗</button><button class="quick" data-action="profile"><span>☆</span> МОЙ ПРОФИЛЬ ↗</button></div>
<div class="note">FLIP · ${live()?'Серверный тест: карточки и награды привязаны к аккаунту Telegram. Некоторые разделы пока демонстрационные.':'Локальное демо: карточки не переносятся на сервер и не имеют игровой ценности.'}</div>`}
const taskDefs=[{title:'Открой бесплатный дроп',detail:'0 / 1 · Ежедневное задание',reward:'30 F'},{title:'Получи новую карточку',detail:'0 / 1 · Коллекция',reward:'30 F'},{title:'Открой стандартный пак',detail:'0 / 1 · Активность',reward:'30 F'}];
function taskRow(i,compact=false){let t=taskDefs[i],done=state.claimedTasks.includes(i);return `<div class="task"><button class="taskbutton" data-task="${i}" ${done?'disabled':''}><div class="task-check ${done?'completed':''}">${done?'✓':'↗'}</div><div class="task-text"><h4>${t.title}</h4><p>${done?'ВЫПОЛНЕНО':t.detail}</p></div><span class="reward">${done?'✓':t.reward}</span><span class="task-arrow">›</span></button></div>`}
function uniqueKey(c){return c.id||`${c.artist||''}|${c.title||''}|${c.rarity||''}`}
function collection(){return window.FLIPCollection.home(state)}
function collectionArtist(){return window.FLIPCollection.artist(state,collectionArtistId)}
function collectionRelease(){return window.FLIPCollection.release(state,collectionArtistId,collectionReleaseId)}
function collectionHistory(){return window.FLIPCollection.history(state)}
function catalogView(){
  const artist=catalog.artists[0];
  return `<div class="panel"><button class="link" data-action="collection">← К КОЛЛЕКЦИИ</button>
  <span class="eyebrow">CATALOG / FIRST ARTIST</span><h2>PLAYBOI CARTI<span style="color:var(--lime)">.</span></h2>
  <p class="desc">Все 25 вариантов из твоего архива. Здесь можно оценить стили, даже если карточка ещё не выпадала. Просмотр не добавляет карточки в коллекцию.</p>
  <div class="chips"><span class="chip active">5 РЕЛИЗОВ</span><span class="chip">25 ОФОРМЛЕНИЙ</span></div>
  ${artist.releases.map(release=>`<section class="catalog-release"><div class="collection-heading"><h3>${escapeHtml(release.title)}</h3><span>${release.year||'АРХИВ'}</span></div>
    <div class="square-grid catalog-grid">${catalog.rarities.map(rarity=>{
      const card=catalog.getCard(artist.id,release.id,rarity);
      return `<button type="button" class="catalog-tile" data-catalog-release="${escapeHtml(release.id)}" data-catalog-rarity="${rarity}" aria-label="Посмотреть ${escapeHtml(card.title)}, ${escapeHtml(card.rarity)}">${sq(card)}<span class="catalog-tile-label rarity-${rarity}">${escapeHtml(card.rarity)}</span></button>`;
    }).join('')}</div></section>`).join('')}
  <p class="note">In Abundance добавлен из твоего набора изображений. Отнесение к официальным релизам уточним при финальной проверке дискографии.</p></div>`;
}

function trades(){return `<div class="panel"><span class="eyebrow">PLAYER TO PLAYER / 003</span><h2>ОБМЕНЫ<span style="color:var(--lime)">.</span></h2><p class="desc">Асинхронные предложения, встречные условия и история сделок. F нельзя передавать в обменах.</p><div class="chips"><span class="chip active">ВХОДЯЩИЕ · 1</span><span class="chip">ИСХОДЯЩИЕ</span><span class="chip">ИСТОРИЯ</span></div><div class="content-card"><span class="pill">↔ ПРЕДЛОЖЕНИЕ · ДЕМО</span><h3 style="margin-top:11px">Игрок @lowfreq</h3><p>Предложение обмена карточками · Действует 72 часа</p><div class="square-grid" style="grid-template-columns:1fr 1fr">${sq(artCards[1])}${sq(artCards[2])}</div><div class="modal-actions"><button class="outlinebtn" data-action="tradeDemo">ПОСМОТРЕТЬ</button><button class="outlinebtn" data-action="tradeDemo">ВСТРЕЧНЫЙ</button></div></div><p class="note">Демонстрация интерфейса. Реальные предложения требуют регистрации пользователей и серверных транзакций.</p></div>`}
function store(){return `<div class="panel"><span class="eyebrow">COLLECT MORE / 004</span><h2>МАГАЗИН<span style="color:var(--lime)">.</span></h2><p class="desc">Стандартные паки и особые тематические коллекции. Цены показаны согласно выбранной базовой экономике.</p><div class="content-card"><span class="pill">◆ STANDARD PACK</span><h3 style="font-size:20px;margin-top:9px">3 СЛУЧАЙНЫЕ КАРТОЧКИ</h3><p>Три разные разновидности, гарантированно хотя бы одна Rare+. Без pity.</p><div class="square-grid" style="margin:17px 0">${[0,1,2].map(()=>`<div class="sq-card" style="background:linear-gradient(135deg,#344d2b,#132318)"><span class="sq-art" style="color:var(--lime)">FLIP</span></div>`).join('')}</div><div class="menu-row"><strong>200 F</strong><small id="packCounter">ЛИМИТ: ${state.packsToday}/10 СЕГОДНЯ</small></div><button class="bigbtn" id="buyPackBtn">КУПИТЬ ПАК · 200 F ↗</button></div><div class="content-card"><span class="pill">✦ SPECIAL COLLECTION</span><h3 style="font-size:21px;margin-top:10px">GTA / ALTERNATE</h3><p>Демонстрационная тематическая коллекция · 5 квадратных карточек · набор приобретается целиком.</p><div class="square-grid">${artCards.slice(0,3).map(sq).join('')}</div><div class="menu-row"><strong>5 000 F</strong><small>РОТАЦИЯ: РАЗ В МЕСЯЦ</small></div><button class="outlinebtn" style="margin-top:10px;width:100%" data-action="special">ПОДРОБНОСТИ ↗</button></div></div>`}
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
function profile(){return `<div class="panel"><span class="eyebrow">PERSONAL SPACE / 005</span><h2>ПРОФИЛЬ<span style="color:var(--lime)">.</span></h2><div class="content-card"><div class="flip-player-row">${playerAvatar()}<div class="flip-player-meta"><h3>${escapeHtml(live()?(state.telegramName||'FLIP PLAYER'):'FLIP PLAYER')}</h3><p class="flip-player-handle">${escapeHtml(live()?(state.telegramHandle||'FLIP PLAYER'):'FLIP / DEMO')}</p><span class="pill">LVL ${state.level} · ${state.xp} XP</span></div></div><div class="progress" style="--p:${Math.min(100,100*state.xp/(state.xpToNext||100))}%;margin-top:19px"><i></i></div><p>Следующий уровень · базовая награда 30 F</p></div><div class="content-card"><h3>ВИТРИНА КАРТОЧЕК <span style="color:#8fa68d">0/3</span></h3><div class="square-grid">${[0,1,2].map(()=>`<div class="sq-card" style="border-style:dashed;background:#171f18;border-color:#3f5740"><span style="color:#516b55;font-size:24px">+</span></div>`).join('')}</div><p>Сюда можно закреплять до трёх любимых карточек, включая Hidden.</p></div><div class="content-card"><h3>ДОСТИЖЕНИЯ</h3><p>31 достижение · 3 избранных слота · секретные награды</p><button class="outlinebtn" data-action="achievements">ПОСМОТРЕТЬ ↗</button></div><div class="content-card"><h3>${live()?'ПОДКЛЮЧЕНИЕ К TELEGRAM':blocked()?'СЕРВЕР НЕ ПОДКЛЮЧЕН':'НАСТРОЙКИ ДЕМО'}</h3><p>${live()?'Прогресс сохраняется на сервере и не сбрасывается из приложения. Локальные демо-награды не перенесены.':blocked()?'Подключение не установлено. Локальные награды не отображаются и не выдаются.':'Очистить состояние локального прототипа и снова сделать дроп доступным.'}</p>${live()?'<span class="pill">● SERVER CONNECTED</span>':blocked()?'<span class="pill">● OFFLINE</span>':'<button class="outlinebtn" id="resetBtn">СБРОСИТЬ ДЕМО</button>'}</div></div>`}
function tasks(){return `<div class="panel"><button class="link" data-action="home">← НА ГЛАВНУЮ</button><h2>ЗАДАНИЯ<span style="color:var(--lime)">.</span></h2><p class="desc">Три ежедневных и три еженедельных испытания. Сброс в 00:00 по Москве.</p><div class="section-head"><span class="section-title">DAILY TASKS</span><span class="section-sub">30 F + 20 XP / КАЖДОЕ</span></div><div class="task-list">${taskRow(0)}${taskRow(1)}${taskRow(2)}</div><div class="content-card"><h3>WEEKLY TASKS</h3>${['Открой 15 бесплатных дропов','Собери 5 новых карточек','Достигни следующего уровня'].map((x,i)=>`<div class="menu-row"><div><strong>${x}</strong><br><small>Еженедельное задание</small></div><span class="reward">100 F</span></div>`).join('')}<p>Бонус за все три: +50 F</p></div></div>`}
function adminProfile(){
  const id=window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
  const idInfo=live()&&Number.isSafeInteger(id)&&id>0?
    '<div class="content-card"><p>Твой Telegram ID: <strong>'+id+'</strong></p><p class="muted">Используется для настройки административного доступа. Не является паролем.</p></div>':'';
  return profile()+idInfo+(live()&&bridge?.isAdmin?
    '<div class="content-card flip-admin-entry"><button type="button" class="outlinebtn" data-action="admin">◆ ОТКРЫТЬ АДМИН-ПАНЕЛЬ ↗</button></div>':'');
}
function adminPage(){return live()&&bridge?.isAdmin?
  '<div class="panel flip-admin-page"><button class="link" data-action="profile">← НАЗАД В ПРОФИЛЬ</button><span class="eyebrow">FLIP / PRIVATE ACCESS</span><h2>CONTROL CENTER<span style="color:var(--lime)">.</span></h2><p class="desc">Поиск игроков и карточек, выдача карт, XP и F с журналом начислений.</p><div id="flip-admin-root"></div></div>':
  '<div class="panel"><h2>ДОСТУП ЗАКРЫТ</h2></div>';}
const render=(view=current)=>{current=view;$('#screen').innerHTML=({home,collection,collectionArtist,collectionRelease,collectionHistory,catalog:catalogView,trades,store,profile:adminProfile,admin:adminPage,tasks}[view]||home)();document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.dataset.tab===(['catalog','collectionArtist','collectionRelease','collectionHistory'].includes(view)?'collection':view)));$('#balance').textContent=money(state.balance);$('#scroll').scrollTop=0;updateTimer();window.FLIPIcons?.render($('#screen'));if(view==='admin'&&bridge?.isAdmin)window.FLIPAdmin?.mount($('#flip-admin-root'));const photo=$('#flipPlayerPhoto');if(photo)photo.addEventListener('error',()=>photo.remove(),{once:true})};
let toastTid;const toast=msg=>{const el=$('#toast');el.textContent=msg;el.classList.add('show');clearTimeout(toastTid);toastTid=setTimeout(()=>el.classList.remove('show'),3000)};
const closeModal=()=>$('#overlay').classList.remove('show');
function modal(html){$('#modal').innerHTML=html;window.FLIPIcons?.render($('#modal'));$('#overlay').classList.add('show')}
function updateTimer(){
  if(current!=='home')return;
  const welcome=live()&&Number(state.welcomeRemaining||0)>0;
  const recovering=live()&&bridge?.hasPending?.('drop');
  const delta=state.dropReadyAt-Date.now();
  const ready=recovering||welcome||delta<=0;
  const value=$('#timerValue'), badge=$('#readyBadge'), label=$('#timerLabel'), button=$('#dropBtn'), copy=$('#dropCopy');
  if(!value)return;
  if(copy)copy.hidden=!ready;
  button.disabled=serverBusy||blocked()||!ready;
  if(blocked()){
    value.textContent='—';badge.textContent='◷ ОЖИДАНИЕ СЕРВЕРА';label.textContent='';
    button.innerHTML='<span>ПОДКЛЮЧЕНИЕ…</span><span class="drop-cta-arrow">↗</span>';
  }else if(recovering){
    value.textContent='';label.textContent='';badge.textContent='◷ НЕОКОНЧЕННЫЙ ЗАПРОС';
    button.innerHTML='<span>ВОССТАНОВИТЬ ДРОП</span><span class="drop-cta-arrow">↗</span>';
  }else if(welcome){
    value.textContent='';label.textContent='';
    badge.textContent=`● ПРИВЕТСТВЕННЫЙ ДРОП · ${4-state.welcomeRemaining}/3`;
    button.innerHTML='<span>ОТКРЫТЬ ПРИВЕТСТВЕННЫЙ ДРОП</span><span class="drop-cta-arrow">↗</span>';
  }else if(ready){
    value.textContent='';badge.textContent='● ДРОП ДОСТУПЕН';label.textContent='';
    button.innerHTML='<span>ОТКРЫТЬ ДРОП</span><span class="drop-cta-arrow">↗</span>';
  }else{
    const seconds=Math.ceil(delta/1000),h=String(Math.floor(seconds/3600)).padStart(2,'0'),m=String(Math.floor((seconds%3600)/60)).padStart(2,'0'),sec=String(seconds%60).padStart(2,'0');
    value.textContent=`${h}:${m}:${sec}`;badge.textContent='◷ ДРОП ПЕРЕЗАРЯЖАЕТСЯ';label.textContent='До следующего дропа:';
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
function cardReveal(card,label){modal(`<span class="eyebrow">${escapeHtml(label)}</span><h3>НОВАЯ КАРТОЧКА!</h3>${sq(card)}<div class="pill">✦ ${escapeHtml(card.rarity.toUpperCase())}</div><p>Карточка добавлена в демо-коллекцию.</p><button class="bigbtn" id="closeReveal">ПРОДОЛЖИТЬ ↗</button>`)}
function serverError(error){
  const reasons={DROP_COOLDOWN:'Дроп ещё перезаряжается',INSUFFICIENT_FUNDS:'Недостаточно F',DAILY_PACK_LIMIT:'Лимит: 10 паков за день',EXPIRED_TELEGRAM_SESSION:'Перезапусти FLIP через Telegram',INVALID_TELEGRAM_SESSION:'Ошибка Telegram: перезапусти приложение'};
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
    try{
      const result=await bridge.drop(crypto.randomUUID());
      applyServerState(result.state);
      const card=cardById(result.card_id);
      if(card){if(window.FLIPReveal)window.FLIPReveal.open(card);else cardReveal(card,'FREE DROP');}
    }catch(error){toast(serverError(error));}
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
async function doPack(){
  if(serverBusy)return;
  if(blocked()){toast('Нет подключения к серверу Telegram');return;}
  if(live()){
    serverBusy=true;
    try{
      const result=await bridge.pack(crypto.randomUUID());
      applyServerState(result.state);render('store');
      const pack=(result.card_ids||[]).map(cardById).filter(Boolean);
      modal(`<span class="eyebrow">STANDARD PACK / SERVER</span><h3>ТВОЙ ПАК</h3><div class="square-grid pack-open-grid">${pack.map(sq).join('')}</div><p>Три карточки сохранены на сервере. Минимум одна Rare+.</p><button class="bigbtn" id="closeReveal">ЗАБРАТЬ КАРТОЧКИ ↗</button>`);
    }catch(error){toast(serverError(error));}
    finally{serverBusy=false;}
    return;
  }
  doPackDemo();
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
  modal(`<span class="eyebrow">STANDARD PACK / OPENED</span><h3>ТВОЙ ПАК</h3><div class="square-grid pack-open-grid" aria-label="Три полученные карточки">${pack.map(sq).join('')}</div><p>Три разные карточки, минимум одна Rare+. Награды и вероятности пока демонстрационные, не серверные.</p><button class="bigbtn" id="closeReveal">ЗАБРАТЬ КАРТОЧКИ ↗</button>`);
}
function showCatalogCard(release,rarity){
  const card=catalog.getCard('carti',release,rarity);
  if(!card)return;
  modal(`<span class="eyebrow">CATALOG / ${escapeHtml(card.rarity.toUpperCase())}</span><h3>${escapeHtml(card.title)}</h3><div class="catalog-modal-image">${sq(card)}</div><p>${escapeHtml(card.artist)} · ${escapeHtml(card.style)}</p><p>Предпросмотр оформления. Не добавлено в коллекцию.</p><button class="bigbtn" id="closeReveal">ЗАКРЫТЬ</button>`);
}

function showOwnedCard(cardId, historyMode=false){
  const entry=historyMode?window.FLIPCollection.historyCard(state,cardId):window.FLIPCollection.cardInfo(state,cardId);
  if(!entry)return;
  const owned=entry.count>0;
  const text=owned ? `${entry.count} ${entry.count===1?'экземпляр':'экз.'}` : 'Больше нет в коллекции';
  const testNote=entry.testCount>0?'<p class="col-detail-note">ТЕСТОВЫХ КОПИЙ: '+entry.testCount+' · Они не учитываются в рейтинге.</p>':'';
  modal(`<span class="eyebrow">${owned?'OWNED CARD / COLLECTION':'DISCOVERED CARD / HISTORY'}</span>
    <h3>${escapeHtml(entry.title)}</h3>
    <div class="col-detail-art">${sq(entry)}</div>
    <p>${escapeHtml(entry.artist)} · ${escapeHtml(entry.style||entry.rarity)}</p>
    <div class="col-detail-metas"><span><small>РЕДКОСТЬ</small><b>${escapeHtml(entry.rarity)}</b></span><span><small>В НАЛИЧИИ</small><b>${escapeHtml(text)}</b></span></div>${testNote}
    <p class="col-detail-note">Обмен и продажу дубликатов подключим после серверной системы. Сейчас просмотр не изменяет количество карточек.</p>
    <button type="button" class="bigbtn" id="closeReveal">ЗАКРЫТЬ ↗</button>`);
}
function applyCollectionSearch(value){
  const query=String(value||'').toLocaleLowerCase('ru-RU').trim();
  const rows=[...document.querySelectorAll('#screen [data-filterable]')];
  let found=0;
  for(const row of rows){row.hidden=!!query&&!String(row.dataset.filterable||'').toLocaleLowerCase('ru-RU').includes(query);if(!row.hidden)found++;}
  const empty=document.querySelector('#screen .col-no-matches');if(empty)empty.hidden=found!==0;
}
document.addEventListener('input',e=>{if(e.target.matches('[data-collection-search]'))applyCollectionSearch(e.target.value)});
// touch-action: manipulation is the main iOS fix; this is a second guard for WebViews
// that still emit dblclick on static regions. No viewport zoom lock: pinch zoom remains allowed.
document.addEventListener('dblclick',e=>{if(e.target.closest('.phone'))e.preventDefault()},{passive:false});
function handleTask(i){if(state.claimedTasks.includes(i))return;modal(`<span class="eyebrow">DAILY TASK</span><h3>${taskDefs[i].title}</h3><p>Это макет задания. В реальной игре выполнение определяется сервером автоматически, без ручного начисления.</p><button class="bigbtn" id="closeReveal">ПОНЯТНО</button>`)}
document.addEventListener('click',e=>{
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
  if(hiddenTarget){const hidden=state.received.find(c=>c?.id===hiddenTarget.dataset.hiddenCard);if(hidden){const count=state.received.filter(c=>c?.id===hidden.id).length;modal(`<span class="eyebrow">SECRET / HIDDEN</span><h3>${escapeHtml(hidden.title)}</h3><div class="col-detail-art">${sq(hidden)}</div><p>Секретная карточка · ${count} экз.</p><p>Отдельный художественный стиль Hidden будет разработан позже.</p><button class="bigbtn" id="closeReveal">ЗАКРЫТЬ ↗</button>`);}return}
  const tab=e.target.closest('[data-tab]');if(tab){render(tab.dataset.tab);return}const action=e.target.closest('[data-action]');if(action){let a=action.dataset.action;if(a==='admin'&&bridge?.isAdmin&&live())render('admin');else if(['home','collection','catalog','trades','store','profile','tasks'].includes(a))render(a);else if(a==='tradeDemo')modal('<span class="eyebrow">TRADES</span><h3>ДЕМО ОБМЕНА</h3><p>Приём, отклонение и встречные предложения заработают после подключения серверной части.</p><button class="bigbtn" id="closeReveal">ЗАКРЫТЬ</button>');else modal('<span class="eyebrow">COMING SOON</span><h3>СКОРО В FLIP</h3><p>Это место для следующего экрана, без реальных денежных операций.</p><button class="bigbtn" id="closeReveal">ЗАКРЫТЬ</button>');return}if(e.target.closest('[data-catalog-release]')){const b=e.target.closest('[data-catalog-release]');showCatalogCard(b.dataset.catalogRelease,b.dataset.catalogRarity);return}if(e.target.closest('#dropBtn'))doDrop();if(e.target.closest('#dropPreviewBtn'))previewRoulette();if(e.target.closest('#buyPackBtn'))doPack();if(e.target.closest('#closeReveal'))closeModal();if(e.target.closest('#balanceBtn'))render('store');if(e.target.closest('#bellBtn'))$('#notifications').classList.toggle('show');if(e.target.closest('#closeNotifications'))$('#notifications').classList.remove('show');if(e.target.closest('#resetBtn')){if(live()||blocked())return;localStorage.removeItem('flip_demo');localStorage.removeItem('flip20_demo');Object.assign(state,{...initial,dropReadyAt:Date.now(),received:[],discovered:[],claimedTasks:[]});save();render('profile');toast('Демо сброшено — бесплатный дроп доступен')};const t=e.target.closest('[data-task]');if(t)handleTask(+t.dataset.task);if(e.target.closest('#levelQuick'))render('profile')});
$('#overlay').addEventListener('click',e=>{if(e.target===$('#overlay'))closeModal()});document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeModal();$('#notifications').classList.remove('show')}});window.addEventListener('flip-admin-self-changed',async()=>{
  if(!live())return;
  try{
    const snapshot=await bridge.connect();
    if(snapshot){Object.assign(state,snapshot);$('#balance').textContent=money(state.balance);}
  }catch(_){/* balance refresh happens on next Telegram launch */}
});
setInterval(updateTimer,1000);render();window.FLIPIcons?.render($('#notifications'));
bridge?.connect().then(snapshot=>{
  if(snapshot)applyServerState(snapshot);
  else if(bridge.mode==='demo')applyLocalDemoState();
  else render(current);
  if(bridge.mode==='blocked') toast(bridge.error==='NO_TELEGRAM_AUTH'?'Открой FLIP через своего Telegram-бота':'Сервер недоступен: '+(bridge.error||'ошибка'));
});
})();
