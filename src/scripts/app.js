// FLIP — клиентский демо-прототип. Реальные игровые операции требуют сервера.
(() => {
'use strict';
const $=s=>document.querySelector(s);
const now=Date.now();
const initial={balance:1250,xp:64,level:8,dropReadyAt:now,received:[],claimedTasks:[],packsToday:0,lastPackDay:'',notices:1};
let saved={};try{saved=JSON.parse(localStorage.getItem('flip_demo')||localStorage.getItem('flip20_demo')||'{}')||{}}catch{}
const state={...initial,...saved};
let current='home';
const artCards=[{title:'NIGHT DRIVE',artist:'NOVA RADIO',rarity:'Common',color:'common'},{title:'BLUE STATIC',artist:'ECHO UNIT',rarity:'Rare',color:'rare'},{title:'AFTER HOURS',artist:'SABLE',rarity:'Epic',color:'epic'},{title:'LOST SIGNAL',artist:'ZERO FREQUENCY',rarity:'Legendary',color:'legendary'},{title:'VOID TAPE',artist:'NOIR.exe',rarity:'Mythic',color:'mythic'}];
const hiddenDemoCard={title:'ARCHIVE 001',artist:'FLIP // SECRET',rarity:'Hidden',color:'hidden'};
const save=()=>{try{localStorage.setItem('flip_demo',JSON.stringify(state))}catch{}};
const money=n=>n.toLocaleString('ru-RU');
const sq=(c,i=0)=>`<div class="sq-card ${c.color||''}" title="${c.title} · ${c.rarity}"><span class="sq-art">${c.title.replace(' ','<br>')}</span><span class="small-badge">${c.rarity}${c.count?' ×'+c.count:''}</span></div>`;
function home(){return `<div class="hero-intro">
  <h2>Открой свой дроп.</h2>
  <p class="hero-description">Находи редкие релизы и пополняй коллекцию.</p>
  <div class="hero-progress" id="levelQuick" role="button" tabindex="0" aria-label="Открыть прогресс уровня">
    <span>LVL ${state.level}</span><span class="progress-separator"></span><span>${state.xp}/100 XP</span><span class="hero-progress-arrow">↗</span>
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
<section class="content-section"><div class="section-head"><span class="section-title"><b>✳</b> НОВАЯ КОЛЛЕКЦИЯ</span><button class="link" data-action="collection">СМОТРЕТЬ ВСЁ ↗</button></div><div class="feature"><div class="feature-copy"><span class="pill">✦ NEW ARRIVAL</span><h3>LOST<br>FREQUENCIES</h3><p>Новые обложки. Пять разных редкостей. Твоя следующая находка.</p><button data-action="collection">В КОЛЛЕКЦИЮ ↗</button></div><div class="artwork second" aria-hidden="true"></div><div class="artwork" aria-hidden="true"></div></div></section>
<section class="content-section"><div class="section-head"><span class="section-title"><b>◎</b> ЗАДАНИЯ</span><button class="link" data-action="tasks">СМОТРЕТЬ ВСЕ ↗</button></div><div class="task-list">${taskRow(0,true)}${taskRow(1,true)}${taskRow(2,true)}</div></section>
<div class="quick-nav"><button class="quick" data-action="store"><span>◈</span> ТЕМАТИЧЕСКИЕ НАБОРЫ ↗</button><button class="quick" data-action="profile"><span>☆</span> МОЙ ПРОФИЛЬ ↗</button></div>
<div class="note">FLIP · Демоверсия интерфейса. Карточки сейчас абстрактные, реальные обложки подключим из каталога.</div>`}
const taskDefs=[{title:'Открой бесплатный дроп',detail:'0 / 1 · Ежедневное задание',reward:'30 F'},{title:'Получи новую карточку',detail:'0 / 1 · Коллекция',reward:'30 F'},{title:'Открой стандартный пак',detail:'0 / 1 · Активность',reward:'30 F'}];
function taskRow(i,compact=false){let t=taskDefs[i],done=state.claimedTasks.includes(i);return `<div class="task"><button class="taskbutton" data-task="${i}" ${done?'disabled':''}><div class="task-check ${done?'completed':''}">${done?'✓':'↗'}</div><div class="task-text"><h4>${t.title}</h4><p>${done?'ВЫПОЛНЕНО':t.detail}</p></div><span class="reward">${done?'✓':t.reward}</span><span class="task-arrow">›</span></button></div>`}
function collection(){return `<div class="panel"><span class="eyebrow">YOUR ARCHIVE / 002</span><h2>КОЛЛЕКЦИЯ<span style="color:var(--lime)">.</span></h2><p class="desc">Твои артисты, релизы и квадратные карточки. Новые артисты появляются только после получения их карточек.</p><div class="chips"><span class="chip active">АРТИСТЫ</span><span class="chip">ОСОБЫЕ КОЛЛЕКЦИИ</span><span class="chip">ИСТОРИЯ</span></div><div class="content-card"><h3>ПОСЛЕДНИЕ НАХОДКИ</h3><div class="square-grid">${(state.received.length?state.received.slice(-6).reverse():artCards.slice(0,3)).map((c,i)=>sq(c,i)).join('')}</div><p class="muted">${state.received.length?'Карточки, полученные в этом демо.':'Это пример отображения карточек. Открой бесплатный дроп, чтобы получить первую демонстрационную находку.'}</p></div><div class="content-card"><h3>ПРОГРЕСС КАТАЛОГА</h3><div class="kpi">${new Set(state.received.map(c=>c.title+'|'+c.rarity)).size}</div><p>Уникальных разновидностей получено в этом прототипе</p><div class="progress" style="--p:${Math.min(state.received.length*10,100)}%"><i></i></div></div></div>`}
function trades(){return `<div class="panel"><span class="eyebrow">PLAYER TO PLAYER / 003</span><h2>ОБМЕНЫ<span style="color:var(--lime)">.</span></h2><p class="desc">Асинхронные предложения, встречные условия и история сделок. F нельзя передавать в обменах.</p><div class="chips"><span class="chip active">ВХОДЯЩИЕ · 1</span><span class="chip">ИСХОДЯЩИЕ</span><span class="chip">ИСТОРИЯ</span></div><div class="content-card"><span class="pill">↔ ПРЕДЛОЖЕНИЕ · ДЕМО</span><h3 style="margin-top:11px">Игрок @lowfreq</h3><p>Предложение обмена карточками · Действует 72 часа</p><div class="square-grid" style="grid-template-columns:1fr 1fr">${sq(artCards[1])}${sq(artCards[2])}</div><div class="modal-actions"><button class="outlinebtn" data-action="tradeDemo">ПОСМОТРЕТЬ</button><button class="outlinebtn" data-action="tradeDemo">ВСТРЕЧНЫЙ</button></div></div><p class="note">Демонстрация интерфейса. Реальные предложения требуют регистрации пользователей и серверных транзакций.</p></div>`}
function store(){return `<div class="panel"><span class="eyebrow">COLLECT MORE / 004</span><h2>МАГАЗИН<span style="color:var(--lime)">.</span></h2><p class="desc">Стандартные паки и особые тематические коллекции. Цены показаны согласно выбранной базовой экономике.</p><div class="content-card"><span class="pill">◆ STANDARD PACK</span><h3 style="font-size:20px;margin-top:9px">3 СЛУЧАЙНЫЕ КАРТОЧКИ</h3><p>Три разные разновидности, гарантированно хотя бы одна Rare+. Без pity.</p><div class="square-grid" style="margin:17px 0">${[0,1,2].map(()=>`<div class="sq-card" style="background:linear-gradient(135deg,#344d2b,#132318)"><span class="sq-art" style="color:var(--lime)">FLIP</span></div>`).join('')}</div><div class="menu-row"><strong>200 F</strong><small id="packCounter">ЛИМИТ: ${state.packsToday}/10 СЕГОДНЯ</small></div><button class="bigbtn" id="buyPackBtn">КУПИТЬ ПАК · 200 F ↗</button></div><div class="content-card"><span class="pill">✦ SPECIAL COLLECTION</span><h3 style="font-size:21px;margin-top:10px">GTA / ALTERNATE</h3><p>Демонстрационная тематическая коллекция · 5 квадратных карточек · набор приобретается целиком.</p><div class="square-grid">${artCards.slice(0,3).map(sq).join('')}</div><div class="menu-row"><strong>5 000 F</strong><small>РОТАЦИЯ: РАЗ В МЕСЯЦ</small></div><button class="outlinebtn" style="margin-top:10px;width:100%" data-action="special">ПОДРОБНОСТИ ↗</button></div></div>`}
function profile(){return `<div class="panel"><span class="eyebrow">PERSONAL SPACE / 005</span><h2>ПРОФИЛЬ<span style="color:var(--lime)">.</span></h2><div class="content-card"><div style="display:flex;align-items:center;gap:13px"><div style="width:57px;height:57px;border-radius:16px;background:#314b25;display:grid;place-items:center;color:var(--lime);font:800 25px 'Space Grotesk'">F</div><div><h3 style="margin:0 0 4px">FLIP PLAYER</h3><span class="pill">LVL ${state.level} · ${state.xp} XP</span></div></div><div class="progress" style="--p:${Math.min(state.xp,100)}%;margin-top:19px"><i></i></div><p>Следующий уровень · базовая награда 30 F</p></div><div class="content-card"><h3>ВИТРИНА КАРТОЧЕК <span style="color:#8fa68d">0/3</span></h3><div class="square-grid">${[0,1,2].map(()=>`<div class="sq-card" style="border-style:dashed;background:#171f18;border-color:#3f5740"><span style="color:#516b55;font-size:24px">+</span></div>`).join('')}</div><p>Сюда можно закреплять до трёх любимых карточек, включая Hidden.</p></div><div class="content-card"><h3>ДОСТИЖЕНИЯ</h3><p>31 достижение · 3 избранных слота · секретные награды</p><button class="outlinebtn" data-action="achievements">ПОСМОТРЕТЬ ↗</button></div><div class="content-card"><h3>НАСТРОЙКИ ДЕМО</h3><p>Очистить состояние прототипа и снова сделать дроп доступным.</p><button class="outlinebtn" id="resetBtn">СБРОСИТЬ ДЕМО</button></div></div>`}
function tasks(){return `<div class="panel"><button class="link" data-action="home">← НА ГЛАВНУЮ</button><h2>ЗАДАНИЯ<span style="color:var(--lime)">.</span></h2><p class="desc">Три ежедневных и три еженедельных испытания. Сброс в 00:00 по Москве.</p><div class="section-head"><span class="section-title">DAILY TASKS</span><span class="section-sub">30 F + 20 XP / КАЖДОЕ</span></div><div class="task-list">${taskRow(0)}${taskRow(1)}${taskRow(2)}</div><div class="content-card"><h3>WEEKLY TASKS</h3>${['Открой 15 бесплатных дропов','Собери 5 новых карточек','Достигни следующего уровня'].map((x,i)=>`<div class="menu-row"><div><strong>${x}</strong><br><small>Еженедельное задание</small></div><span class="reward">100 F</span></div>`).join('')}<p>Бонус за все три: +50 F</p></div></div>`}
const render=(view=current)=>{current=view;$('#screen').innerHTML=({home,collection,trades,store,profile,tasks}[view]||home)();document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.dataset.tab===view));$('#balance').textContent=money(state.balance);$('#scroll').scrollTop=0;updateTimer();window.FLIPIcons?.render($('#screen'))};
let toastTid;const toast=msg=>{const el=$('#toast');el.textContent=msg;el.classList.add('show');clearTimeout(toastTid);toastTid=setTimeout(()=>el.classList.remove('show'),3000)};
const closeModal=()=>$('#overlay').classList.remove('show');
function modal(html){$('#modal').innerHTML=html;window.FLIPIcons?.render($('#modal'));$('#overlay').classList.add('show')}
function updateTimer(){
  if(current!=='home')return;
  const delta=state.dropReadyAt-Date.now(), ready=delta<=0;
  const value=$('#timerValue'), badge=$('#readyBadge'), label=$('#timerLabel'), button=$('#dropBtn'), copy=$('#dropCopy');
  if(!value)return;
  // The descriptive line belongs to the ready state only: keep charging view calm.
  if(copy)copy.hidden=!ready;
  if(ready){
    value.textContent='';
    badge.textContent='● ДРОП ДОСТУПЕН';
    label.textContent='';
    button.disabled=false;
    button.innerHTML='<span>ОТКРЫТЬ ДРОП</span><span class="drop-cta-arrow" aria-hidden="true">↗</span>';
  }else{
    const s=Math.ceil(delta/1000),h=String(Math.floor(s/3600)).padStart(2,'0'),m=String(Math.floor((s%3600)/60)).padStart(2,'0'),sec=String(s%60).padStart(2,'0');
    value.textContent=`${h}:${m}:${sec}`;
    badge.textContent='◷ ДРОП ПЕРЕЗАРЯЖАЕТСЯ';
    label.textContent='До следующего дропа:';
    button.disabled=true;
    button.innerHTML='<span>ДРОП НЕ ГОТОВ</span><span class="drop-cta-arrow" aria-hidden="true">↗</span>';
  }
  window.FLIPIcons?.render(button);
  window.FLIPIcons?.render(badge);
}
function randomCard(){
  // Preview-only override on localhost; NEVER trust a browser RNG for a real economy.
  const forced=(location.hostname==='localhost'||location.hostname==='127.0.0.1')?new URLSearchParams(location.search).get('previewRarity'):null;
  if(forced){const found=artCards.find(c=>c.rarity.toLowerCase()===forced.toLowerCase())||(forced.toLowerCase()==='hidden'?hiddenDemoCard:null);if(found)return {...found}}
  const r=Math.random()*100;
  if(r>=99.995)return {...hiddenDemoCard};
  const idx=r<64.995?0:r<89.995?1:r<97.995?2:r<99.795?3:4;
  return {...artCards[idx]};
}
function gain(card,source){state.received.push(card);state.xp+=source==='drop'?10:0;let first=!state.received.slice(0,-1).some(x=>x.title===card.title&&x.rarity===card.rarity);if(first)state.xp+=10;const finishTask=i=>{if(!state.claimedTasks.includes(i)){state.claimedTasks.push(i);state.balance+=30;state.xp+=20}};if(source==='drop'){state.dropReadyAt=Date.now()+4*3600*1000;finishTask(0);if(first)finishTask(1)}if(source==='pack'){if(first)finishTask(1);finishTask(2)}while(state.xp>=100){state.xp-=100;state.level++;state.balance+=30}save()}
function cardReveal(card,label){modal(`<span class="eyebrow">${label}</span><h3>НОВАЯ КАРТОЧКА!</h3>${sq(card)}<div class="pill">✦ ${card.rarity.toUpperCase()} · +10 XP</div><p>Карточка добавлена в твою демо-коллекцию. Все обложки строго квадратные (1:1).</p><button class="bigbtn" id="closeReveal">ПРОДОЛЖИТЬ ↗</button>`)}
function doDrop(){if(Date.now()<state.dropReadyAt)return;const card=randomCard();gain(card,'drop');render('home');if(window.FLIPReveal)window.FLIPReveal.open(card);else cardReveal(card,'FREE DROP')}
// The roulette preview is intentionally independent from the demo game economy.
// Each tap cycles the six visual treatments so all rarity reveals can be reviewed.
let roulettePreviewIndex=0;
function previewRoulette(){
  if(window.FLIPReveal?.isOpen())return;
  const sequence=[artCards[1],artCards[2],artCards[3],artCards[4],hiddenDemoCard,artCards[0]];
  const card={...sequence[roulettePreviewIndex++%sequence.length]};
  if(window.FLIPReveal)window.FLIPReveal.open(card,{preview:true});
  else toast('Рулетка пока не загрузилась. Попробуй ещё раз.');
}
function doPack(){const day=new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Moscow'});if(state.lastPackDay!==day){state.lastPackDay=day;state.packsToday=0}if(state.packsToday>=10){toast('Дневной лимит 10 стандартных паков исчерпан');return}if(state.balance<200){toast('Не хватает F для покупки стандартного пака');return}state.balance-=200;state.packsToday++;let pack=[];let attempts=0;while(pack.length<3&&attempts++<1000){let c=randomCard();if(!pack.some(k=>k.title===c.title&&k.rarity===c.rarity))pack.push(c)}if(pack.every(x=>x.rarity==='Common'))pack[Math.floor(Math.random()*3)]={...artCards[1]};for(const card of pack)gain(card,'pack');state.xp+=30;while(state.xp>=100){state.xp-=100;state.level++;state.balance+=30}save();render('store');modal(`<span class="eyebrow">STANDARD PACK / OPENED</span><h3>ТВОЙ ПАК</h3><div class="square-grid" style="margin:22px 0">${pack.map(sq).join('')}</div><p>Три разные карточки, минимум одна Rare+. Выдача и вероятности здесь демонстрационные, не серверный генератор.</p><button class="bigbtn" id="closeReveal">ЗАБРАТЬ КАРТОЧКИ ↗</button>`)}
function handleTask(i){if(state.claimedTasks.includes(i))return;modal(`<span class="eyebrow">DAILY TASK</span><h3>${taskDefs[i].title}</h3><p>Это макет задания. В реальной игре выполнение определяется сервером автоматически, без ручного начисления.</p><button class="bigbtn" id="closeReveal">ПОНЯТНО</button>`)}
document.addEventListener('click',e=>{const tab=e.target.closest('[data-tab]');if(tab){render(tab.dataset.tab);return}const action=e.target.closest('[data-action]');if(action){let a=action.dataset.action;if(['home','collection','trades','store','profile','tasks'].includes(a))render(a);else if(a==='tradeDemo')modal('<span class="eyebrow">TRADES</span><h3>ДЕМО ОБМЕНА</h3><p>Приём, отклонение и встречные предложения заработают после подключения серверной части.</p><button class="bigbtn" id="closeReveal">ЗАКРЫТЬ</button>');else modal('<span class="eyebrow">COMING SOON</span><h3>СКОРО В FLIP</h3><p>Это место для следующего экрана, без реальных денежных операций.</p><button class="bigbtn" id="closeReveal">ЗАКРЫТЬ</button>');return}if(e.target.closest('#dropBtn'))doDrop();if(e.target.closest('#dropPreviewBtn'))previewRoulette();if(e.target.closest('#buyPackBtn'))doPack();if(e.target.closest('#closeReveal'))closeModal();if(e.target.closest('#balanceBtn'))render('store');if(e.target.closest('#bellBtn'))$('#notifications').classList.toggle('show');if(e.target.closest('#closeNotifications'))$('#notifications').classList.remove('show');if(e.target.closest('#resetBtn')){localStorage.removeItem('flip_demo');localStorage.removeItem('flip20_demo');Object.assign(state,{...initial,dropReadyAt:Date.now(),received:[],claimedTasks:[]});save();render('profile');toast('Демо сброшено — бесплатный дроп доступен')};const t=e.target.closest('[data-task]');if(t)handleTask(+t.dataset.task);if(e.target.closest('#levelQuick'))render('profile')});
$('#overlay').addEventListener('click',e=>{if(e.target===$('#overlay'))closeModal()});document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeModal();$('#notifications').classList.remove('show')}});setInterval(updateTimer,1000);render();window.FLIPIcons?.render($('#notifications'));
})();
