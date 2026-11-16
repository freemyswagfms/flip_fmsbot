/* FLIP v0.9.6 — real notifications, private activity and player statistics. */
(()=>{
 'use strict';
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
 }[c]));
 const fmt=v=>Number(v||0).toLocaleString('ru-RU');
 const when=value=>{
  const d=new Date(value);
  if(!Number.isFinite(d.valueOf()))return '—';
  return d.toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',
   minute:'2-digit',timeZone:'Europe/Moscow'});
 };
 const types={
  trade_offer:{icon:'↔',title:'Новое предложение обмена',route:'trades'},
  trade_counteroffer:{icon:'⇄',title:'Встречное предложение обмена',route:'trades'},
  trade_accepted:{icon:'✓',title:'Обмен успешно завершён',route:'trades'},
  trade_declined:{icon:'×',title:'Предложение отклонено',route:'trades'},
  trade_cancelled:{icon:'×',title:'Предложение отменено',route:'trades'},
  trade_countered:{icon:'⇄',title:'Получено встречное предложение',route:'trades'},
   currency_offer:{icon:'⇄',title:'Новое предложение обмена за F',route:'trades'},
   currency_accepted:{icon:'✓',title:'Обмен карточек за F завершён',route:'trades'},
   currency_declined:{icon:'×',title:'Предложение за F отклонено',route:'trades'},
   currency_cancelled:{icon:'×',title:'Предложение за F отменено',route:'trades'},
   gift_received:{icon:'✦',title:'Тебе подарили карточку',route:'collection'},
   gift_sent:{icon:'✦',title:'Ты подарил карточку',route:'trades'},
  achievement_claim:{icon:'✦',title:'Награда достижения получена',route:'achievements'},
  drop:{icon:'◈',title:'Бесплатный дроп открыт',route:'collection'},
  pack:{icon:'▣',title:'Набор открыт',route:'store'}
 };
 const cardOf=id=>{
  if(typeof id!=='string')return null;
  if(id==='demo/hidden/archive-001')return {title:'ARCHIVE 001',rarity:'Hidden'};
  const p=id.split('/');
  return p.length===3?window.FLIPCatalog?.getCard?.(...p):null;
 };
 function detail(e){
  const d=e?.details||{},item=types[e?.kind];
  const partner=String(e?.partner_name||'Другой игрок');
  if(e?.kind?.startsWith('trade_')||e?.kind?.startsWith('currency_'))return partner;
   if(e?.kind==='gift_received'||e?.kind==='gift_sent'){
     const c=cardOf(d.card_id);
     return (c?(c.artist||'')+' · '+(c.title||'Карточка'):'Карточка')+' · '+partner;
   }
  if(e?.kind==='achievement_claim')return 'Этап '+(Number(d.stage)||1)+
    ' · +'+fmt(d.reward_f)+' F';
  if(e?.kind==='drop'){
   const c=cardOf(d.card_id);
   return c?String(c.artist||'')+' · '+String(c.title||'Карточка'):'Карточка добавлена в коллекцию';
  }
  if(e?.kind==='pack'){
   const id=d.pack_type==='archive'?'ARCHIVE':
    d.pack_type==='new-era'?'NEW ERA':'STANDARD';
   return id+' · 3 карточки в коллекции';
  }
  return item?.title||'Событие FLIP';
 }
 function eventMarkup(e,{compact=false}={}){
  const type=types[e.kind]||{icon:'◈',title:'Событие FLIP',route:'activity'};
  const unread=e.read===false;
  const id=Number(e.id);
  const validId=Number.isSafeInteger(id)&&id>0;
  return '<article class="flip-event '+(unread&&compact?'is-unread':'')+
    '"><span class="flip-event-icon" aria-hidden="true">'+type.icon+'</span>'+
    '<div class="flip-event-copy"><strong>'+esc(type.title)+'</strong>'+
      '<p>'+esc(detail(e))+'</p>'+
      '<small>'+esc(when(e.created_at))+' · МСК</small></div>'+
    (compact?'<button type="button" class="flip-event-open" '+
      'data-event-route="'+esc(type.route)+'"'+
      (validId?' data-event-read="'+id+'"':'')+
      ' aria-label="Открыть: '+esc(type.title)+'">↗</button>':
      ((e.kind?.startsWith('trade_')||e.kind?.startsWith('currency_')||e.kind?.startsWith('gift_'))&&e.partner_public_id?
       '<button type="button" class="flip-event-profile" data-player-profile="'+
        esc(e.partner_public_id)+'">ПРОФИЛЬ ↗</button>':''))+
    '</article>';
 }
 function notifications(hub,{online=false,loading=false}={}){
  const list=Array.isArray(hub?.notifications)?hub.notifications:[];
  const ready=Math.max(0,Number(hub?.rewards_ready)||0);
  if(!online)return '<p class="flip-event-empty">Уведомления доступны после входа через Telegram.</p>';
  if(loading&&!hub)return '<p class="flip-event-empty">Обновляем уведомления…</p>';
  return (ready?'<button type="button" class="flip-event-reward" data-event-route="achievements">'+
    '✦ '+fmt(ready)+' наград доступно в достижениях <span>↗</span></button>':'')+
   (list.length?list.slice(0,25).map(e=>eventMarkup(e,{compact:true})).join(''):
     '<p class="flip-event-empty">Пока нет уведомлений.</p>')+
    '<div class="flip-event-bottom">'+
    '<button type="button" data-event-read-all '+(!list.some(e=>e.read===false)?'disabled':'')+
      '>ПРОЧИТАТЬ ВСЁ</button>'+
    '<button type="button" data-action="activity">ВСЯ АКТИВНОСТЬ ↗</button></div>';
 }
 function statCards(stats,{publicMode=false}={}){
  const items=[
   ['◈','ДРОПЫ',stats?.drops],['▣','НАБОРЫ',stats?.packs],
   ['⇄','ОБМЕНЫ',stats?.trades],['✦','ДОСТИЖЕНИЯ',stats?.achievements],
   ['◇','УНИКАЛЬНЫЕ',stats?.unique_cards],['◉','В КОЛЛЕКЦИИ',stats?.owned_cards]
  ];
  return '<div class="flip-stat-grid">'+items.map(([icon,label,val])=>
    '<div class="flip-stat-tile"><span class="flip-stat-symbol">'+icon+'</span>'+
      '<span class="flip-stat-label">'+label+'</span><strong>'+fmt(val)+'</strong></div>').join('')+
    '</div>';
 }
 function profileStats(stats,{online=false}={}){
  return '<section class="content-card flip-profile-stats"><div class="flip-stat-heading">'+
   '<div><h3>СТАТИСТИКА ИГРОКА</h3></div>'+
   '</div>'+
   (online&&stats?statCards(stats):
     '<p class="flip-event-empty">'+(online?'Загружаем статистику…':
       'Статистика будет доступна при входе через Telegram.')+'</p>')+
   (online?'<button type="button" class="outlinebtn" data-action="activity">'+
    'ИСТОРИЯ АКТИВНОСТИ ↗</button>':'')+
   '</section>';
 }
 function publicStats(stats){
  if(!stats)return '';
  return '<section class="content-card flip-profile-stats">'+
    '<div class="flip-stat-heading"><h3>СТАТИСТИКА ИГРОКА</h3>'+
      '</div>'+
    statCards(stats,{publicMode:true})+'</section>';
 }
 function activityPage(hub,{online=false,loading=false,error=''}={}){
  const events=Array.isArray(hub?.activity)?hub.activity:[];
  return '<div class="panel flip-activity-page">'+
    '<button type="button" class="link" data-action="profile">← К ПРОФИЛЮ</button>'+
    
    '<h2>АКТИВНОСТЬ<span style="color:var(--lime)">.</span></h2>'+
    '<p class="desc">Эту историю видишь только ты.</p>'+
    (online&&hub?.stats?statCards(hub.stats):'')+
    (!online?'<p class="flip-event-empty">История доступна после входа через Telegram.</p>':
     error?'<p class="flip-event-empty">Не удалось загрузить историю. Попробуй ещё раз.</p>':
     loading&&!hub?'<p class="flip-event-empty">Загружаем историю…</p>':
     events.length?'<div class="flip-event-feed">'+events.slice(0,60)
       .map(e=>eventMarkup(e)).join('')+'</div>':
       '<p class="flip-event-empty">Пока нет событий. Твой первый дроп появится здесь.</p>')+
    '</div>';
 }
 window.FLIPActivity={notifications,profileStats,publicStats,activityPage,eventMarkup};
})();
