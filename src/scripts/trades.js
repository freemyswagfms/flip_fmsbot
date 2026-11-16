/* FLIP v0.9.8 — player gifts and card/F trades, plus live existing trades. */
(() => {
'use strict';
const E=x=>String(x??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const initData=window.Telegram?.WebApp?.initData||'';
const ownId=(()=>{try{return String(JSON.parse(new URLSearchParams(initData).get('user')||'{}').id||'');}catch{return''}})();
const s={q:'',players:[],targetId:'',targetLabel:'',their:[],give:[],take:[],
  mode:'cards',currencySide:'sell',amount:'',gifts:[],
  counterOf:'',trades:[],error:'',message:'',busy:false,loading:false,searching:false,inspectId:'',inspection:null,
  syncError:'',lastChecked:0};
let root=null,serial=0,searchSeq=0,searchTimer=null,requestSeq=0,inFlight=null,lastHubTrades=null;
let freshIncoming=new Set();
const fmt=x=>Number(x||0).toLocaleString('ru-RU',{maximumFractionDigits:2});
const signed=x=>(Number(x||0)>0?'+':'')+fmt(x)+' CP';
const groups=()=>{
  const m=new Map();
  for(const c of window.FLIPGame?.state?.received||[]){
    if(!c||c.isTestCopy||!c.id)continue;
    const old=m.get(c.id);
    if(old)old.ranked_count++;
    else m.set(c.id,{id:c.id,rarity:String(c.rarity||'common').toLowerCase(),ranked_count:1});
  }
  return [...m.values()].sort((a,b)=>a.id.localeCompare(b.id));
};
function card(id){
  if(!id)return{id:'',title:'—',rarity:'common'};
  if(id==='demo/hidden/archive-001')return{id,title:'ARCHIVE 001',rarity:'hidden'};
  const parts=String(id).split('/');
  let data=null;
  try{if(parts.length===3)data=window.FLIPCatalog?.getCard(...parts);}catch{}
  return data?{id,title:data.artist+' · '+data.title+' · '+data.rarity,rarity:String(data.rarity).toLowerCase()}:
    {id,title:id,rarity:parts[2]||'common'};
}
const base={common:1,rare:4,epic:12,legendary:35,mythic:90,hidden:250};
function points(rarity,count){
  const n=Math.max(0,Math.floor(Number(count)||0));
  const factors=[1,.25,.10,.05,.05,.01,.01,.01,.01,.01];
  return Math.round((base[String(rarity).toLowerCase()]||0)*factors.slice(0,Math.min(n,10))
    .reduce((a,b)=>a+b,0)*100)/100;
}
function delta(inventory,give,take){
  const gives=Array.isArray(give)?give:[give],takes=Array.isArray(take)?take:[take];
  let total=0;
  for(const id of new Set([...gives,...takes])){
    const current=Number(inventory.find(c=>c.id===id)?.ranked_count||0);
    const after=current-(gives.includes(id)?1:0)+(takes.includes(id)?1:0);
    total+=points(card(id).rarity,after)-points(card(id).rarity,current);
  }
  return Math.round(total*100)/100;
}
function giftAmount(){
  const n=Number(s.amount);
  return /^\d+$/.test(s.amount)&&Number.isSafeInteger(n)&&n>=1&&n<=10000?n:0;
}
function validSelection(mine,theirs){
  if(!s.targetId)return false;
  if(s.mode==='gift')return s.give.length===1&&mine.some(c=>c.id===s.give[0]);
  if(s.mode==='currency'){
    if(!giftAmount())return false;
    if(s.currencySide==='sell')
      return s.give.length>=1&&s.give.length<=5&&s.give.every(id=>mine.some(c=>c.id===id));
    return s.take.length>=1&&s.take.length<=5&&
      s.take.every(id=>theirs.some(c=>c.id===id))&&
      Number(window.FLIPGame?.state?.balance||0)>=giftAmount();
  }
  return s.give.length>=1&&s.give.length<=5&&s.take.length>=1&&s.take.length<=5
    &&s.give.every(id=>mine.some(x=>x.id===id))
    &&s.take.every(id=>theirs.some(x=>x.id===id))
    &&!s.give.some(id=>s.take.includes(id));
}
async function api(view,args={},body){
  const url=new URL('/api/social',location.origin);
  if(!body){url.searchParams.set('view',view);for(const [k,v] of Object.entries(args))url.searchParams.set(k,String(v));}
  const options={method:body?'POST':'GET',cache:'no-store',headers:{'x-telegram-init-data':initData}};
  if(body){options.headers['content-type']='application/json';options.body=JSON.stringify(body);}
  const response=await fetch(url,options);
  let d;try{d=await response.json();}catch{d={error:'INVALID_RESPONSE'}}
  if(!response.ok)throw Error(d.error||'TRADE_REQUEST_FAILED');
  return d;
}
function cardSelector(inventory,selected,side,limit=5){
  if(!inventory.length)return '<p class="flip-social-muted">Нет карточек, доступных для обмена.</p>';
  const reached=selected.length>=limit;
  return '<div class="flip-trade-card-choices">'+inventory.map(item=>{
    const checked=selected.includes(item.id);
    return '<label class="flip-trade-card-choice '+(checked?'chosen':'')+(reached&&!checked?' at-limit':'')+'">'+
      '<input type="checkbox" data-trade-toggle="'+side+'" value="'+E(item.id)+'" '+
        (checked?'checked':'')+' '+(reached&&!checked?'disabled':'')+'>'+
      '<span class="flip-trade-choice-copy"><strong>'+E(card(item.id).title)+'</strong>'+
      '<small>Доступно для обмена: '+E(item.ranked_count)+'</small></span>'+
      '</label>';
  }).join('')+'</div>';
}
function draft(){
  const mine=groups(),theirs=s.their,good=validSelection(mine,theirs);
  const give=s.mode==='currency'&&s.currencySide==='buy'?[]:s.give;
  const take=s.mode==='currency'&&s.currencySide==='sell'||s.mode==='gift'?[]:s.take;
  const myDelta=good?delta(mine,give,take):null;
  const theirDelta=good?delta(theirs,take,give):null;
  const locked=s.counterOf!=='';
  const activeMode=locked?'cards':s.mode;
  const heading=locked?'ВСТРЕЧНОЕ ПРЕДЛОЖЕНИЕ':
    activeMode==='gift'?'ОТПРАВИТЬ ПОДАРОК':
    activeMode==='currency'?'КАРТОЧКИ ЗА F':'НОВОЕ ПРЕДЛОЖЕНИЕ';
  return '<section class="flip-social-panel" id="flip-trade-compose">'+
    '<div class="flip-social-heading"><h3>'+heading+
    '</h3><span class="pill">FLIP / PLAYER</span></div>'+
    (!locked?'<div class="flip-trade-modes" role="group" aria-label="Тип операции">'+
      [['cards','КАРТОЧКИ'],['currency','ЗА F'],['gift','ПОДАРОК']].map(([id,label])=>
        '<button type="button" data-trade-mode="'+id+'" class="'+
        (activeMode===id?'active':'')+'" aria-pressed="'+(activeMode===id)+'">'+label+'</button>').join('')+'</div>':'')+
    (locked?'<div class="flip-social-selected">Изменяешь условия исходного обмена. '+
      '<button type="button" data-trade-reset-counter>ОТМЕНИТЬ</button></div>':'')+
    '<label class="flip-social-label" for="flip-trade-user-search">Найти игрока</label>'+
    '<div class="flip-social-search"><input class="flip-social-input" id="flip-trade-user-search" '+
      'maxlength="64" placeholder="@username, имя или Telegram ID" autocomplete="off" value="'+E(s.q)+'" '+
      (locked?'disabled':'')+'>'+
      '<button type="button" class="outlinebtn" data-trade-find '+(locked?'disabled':'')+'>НАЙТИ</button></div>'+
    '<div id="flip-trade-player-results">'+(locked?'':playerResults())+'</div>'+
    (s.targetId?'<div class="flip-social-selected">Игрок: <strong>'+E(s.targetLabel)+
      '</strong> '+(locked?'':'<button type="button" data-trade-clear>ИЗМЕНИТЬ</button>')+'</div>':'')+
    (s.targetId?(
      activeMode==='currency'?'<div class="flip-trade-modes flip-trade-direction" role="group" aria-label="Направление F">'+
        '<button type="button" data-trade-currency-side="sell" class="'+(s.currencySide==='sell'?'active':'')+
        '" aria-pressed="'+(s.currencySide==='sell')+'">ПРОДАЮ КАРТОЧКИ</button>'+
        '<button type="button" data-trade-currency-side="buy" class="'+(s.currencySide==='buy'?'active':'')+
        '" aria-pressed="'+(s.currencySide==='buy')+'">ПОКУПАЮ КАРТОЧКИ</button></div>':'')+
      ((activeMode==='cards'||activeMode==='gift'||s.currencySide==='sell')?
        '<label class="flip-social-label">ТЫ ОТДАЁШЬ · '+s.give.length+'/'+
          (activeMode==='gift'?'1':'5')+'</label>'+
        cardSelector(mine,s.give,'give',activeMode==='gift'?1:5):'')+
      ((activeMode==='cards'||(activeMode==='currency'&&s.currencySide==='buy'))?
        '<label class="flip-social-label">ТЫ ПОЛУЧАЕШЬ · '+s.take.length+'/5</label>'+
        cardSelector(theirs,s.take,'take'):'')+
      (activeMode==='currency'?'<label class="flip-social-label" for="flip-trade-amount">'+
         (s.currencySide==='sell'?'СКОЛЬКО F ПОЛУЧИШЬ':'СКОЛЬКО F ОТДАШЬ')+'</label>'+
         '<input id="flip-trade-amount" class="flip-social-input" type="number" inputmode="numeric" '+
         'min="1" max="10000" step="1" placeholder="От 1 до 10 000 F" value="'+E(s.amount)+'">'+
         '<p class="flip-social-muted">Обе стороны подтвердят сделку. F и карточки '+
         'списываются вместе при принятии, без резервирования. XP за сделки с F не начисляется.</p>':'')+
      (good?'<div class="flip-social-preview"><div><small>ТВОЙ CP</small><strong class="'+
        (myDelta>=0?'positive':'negative')+'">'+signed(myDelta)+'</strong></div>'+
        '<div><small>CP ДРУГОГО ИГРОКА</small><strong class="'+(theirDelta>=0?'positive':'negative')+'">'+
        signed(theirDelta)+'</strong></div></div>':
        '<p class="flip-social-muted">'+(activeMode==='gift'?'Выбери одну рейтинговую карточку.':
          activeMode==='currency'?'Выбери от 1 до 5 карточек и укажи сумму F.':
          'Выбери от 1 до 5 различных карточек с каждой стороны.')+'</p>')+
      '<button type="button" class="bigbtn" data-trade-create '+(!good||s.busy?'disabled':'')+
      '>'+(activeMode==='gift'?'ПОДАРИТЬ КАРТОЧКУ':
        activeMode==='currency'?'ПРЕДЛОЖИТЬ СДЕЛКУ ЗА F':
        locked?'ОТПРАВИТЬ ВСТРЕЧНОЕ':'ОТПРАВИТЬ ПРЕДЛОЖЕНИЕ')+'</button>'
    ):'')+
    '<p class="flip-social-muted">'+(activeMode==='gift'?
      'Подарок передаётся сразу и не требует принятия. До 10 подарков за 24 часа.':
      'Предложение действует 72 часа. Карточки и F не резервируются.')+
    ' Тестовые карточки недоступны. Новые подарки и сделки с F защищены '+
    '24 часами после выпадения карты.</p></section>';
}
function playerResults(){
  if(s.searching)return '<p class="flip-social-muted">Ищем игроков…</p>';
  return s.players.length?s.players.map(p=>'<button type="button" class="flip-trade-player" data-trade-select="'+
    E(p.id)+'"><strong>'+E(p.name)+'</strong><small>LVL '+E(p.level)+' · '+fmt(p.cp)+' CP</small></button>').join(''):
    '<p class="flip-social-muted">Поиск по зарегистрированным игрокам.</p>';
}
function statusOf(t){
  const expires=Date.parse(t.expires_at);
  return t.status==='pending'&&Number.isFinite(expires)&&expires<=Date.now()?'expired':t.status;
}
function visibleTrades(){
  return s.trades.map(t=>statusOf(t)===t.status?t:{...t,status:'expired'});
}
function rowTrade(t){
  const mine=t.mine,partner=mine?t.recipient_label:t.sender_label;
  const currency=t.type==='currency';
  const offer=Array.isArray(t.offer_cards)?t.offer_cards:[t.offer_card_id].filter(Boolean);
  const want=Array.isArray(t.want_cards)?t.want_cards:[t.want_card_id].filter(Boolean);
  const give=mine?offer:want,take=mine?want:offer;
  const giveF=Number(mine?t.offer_f:t.want_f)||0;
  const takeF=Number(mine?t.want_f:t.offer_f)||0;
  const statusNames={pending:'ОЖИДАЕТ',accepted:'ПРИНЯТ',declined:'ОТКЛОНЁН',
    cancelled:'ОТМЕНЁН',expired:'ИСТЁК',countered:'ВСТРЕЧНОЕ'};
  const itemList=(items,f)=>{
    const content=[...items.map(id=>'<li>'+E(card(id).title)+'</li>')];
    if(f>0)content.push('<li class="flip-trade-money">'+fmt(f)+' F</li>');
    return '<ul class="flip-trade-offer-list">'+content.join('')+'</ul>';
  };
  const profileId=typeof t.partner_public_id==='string'&&
    /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(t.partner_public_id)?
      t.partner_public_id:null;
  return '<div class="flip-trade-offer '+(freshIncoming.has(t.id)?'is-fresh':'')+'"><div class="flip-social-heading">'+
    '<div class="flip-trade-partner"><strong>'+E(partner)+'</strong>'+
    (currency?'<small class="flip-trade-kind">КАРТОЧКИ ↔ F</small>':'')+
    (profileId?'<button type="button" class="flip-trade-profile-link" data-player-profile="'+
      E(profileId)+'">ПРОФИЛЬ ↗</button>':'')+'</div>'+
    '<span class="flip-trade-status '+E(t.status)+'">'+E(statusNames[t.status]||t.status)+'</span></div>'+
    '<div class="flip-trade-cards"><div><small>ТЫ ОТДАЁШЬ</small>'+itemList(give,giveF)+'</div>'+
    '<div><small>ТЫ ПОЛУЧАЕШЬ</small>'+itemList(take,takeF)+'</div></div>'+
    '<small class="flip-social-muted">'+
    E(new Date(t.created_at).toLocaleDateString('ru-RU'))+' · №'+E(t.id.slice(0,8))+
    (t.parent_trade_id?' · ВСТРЕЧНОЕ':'')+'</small>'+
    (t.status==='pending'?'<div class="flip-trade-actions">'+
      '<button type="button" class="outlinebtn" data-trade-inspect="'+E(t.id)+'">ПРОВЕРИТЬ УСЛОВИЯ</button>'+
      (mine?'<button type="button" class="outlinebtn" data-trade-verb="cancel" data-trade-id="'+E(t.id)+'">ОТМЕНИТЬ</button>':
       '<button type="button" class="outlinebtn" data-trade-verb="decline" data-trade-id="'+E(t.id)+'">ОТКЛОНИТЬ</button>'+
       (currency?'':'<button type="button" class="outlinebtn" data-trade-counter="'+E(t.id)+'">ВСТРЕЧНОЕ</button>')+
       '<button type="button" class="bigbtn" data-trade-verb="accept" data-trade-id="'+E(t.id)+'">ПРИНЯТЬ</button>')+
    '</div>':'')+
    (s.inspectId===t.id&&s.inspection?'<div class="flip-social-preview">'+
      '<div><small>ТВОЙ CP</small><strong>'+signed(mine?s.inspection.sender_delta:s.inspection.recipient_delta)+'</strong></div>'+
      '<div><small>CP ПАРТНЁРА</small><strong>'+signed(mine?s.inspection.recipient_delta:s.inspection.sender_delta)+'</strong></div></div>'+
      (s.inspection.available?'':'<p class="flip-social-error">Недостаточно доступных карточек/F или предложение уже закрыто.</p>'):'')+
    '</div>';
}
function giftHistory(){
  const list=s.gifts||[];
  if(!list.length)return '';
  return '<section class="flip-social-panel"><h3>ПОДАРКИ · ПОСЛЕДНИЕ '+list.length+'</h3>'+
    list.slice(0,20).map(g=>'<div class="flip-trade-gift-row"><span class="flip-trade-gift-icon">'+
      (g.mine?'↗':'↙')+'</span><div><strong>'+
      E(g.mine?'ТЫ ПОДАРИЛ':'ТЕБЕ ПОДАРИЛИ')+'</strong><p>'+
      E(card(g.card_id).title)+'</p><small>'+E(g.partner_label)+
      ' · '+E(new Date(g.created_at).toLocaleDateString('ru-RU'))+'</small></div></div>').join('')+
  '</section>';
}
function section(title,items){
  return '<section class="flip-social-panel"><h3>'+title+'</h3>'+
    (items.length?items.map(rowTrade).join(''):'<p class="flip-social-muted">Предложений пока нет.</p>')+'</section>';
}
function liveStatus(){
  const message=s.syncError?'НЕТ СВЯЗИ · ПОПРОБУЙ ОБНОВИТЬ':
    s.loading?'ПРОВЕРЯЕМ ПРЕДЛОЖЕНИЯ':
    s.lastChecked?'СИНХРОНИЗИРОВАНО · '+new Date(s.lastChecked)
      .toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}):
      'ОЖИДАЕМ СИНХРОНИЗАЦИИ';
  return '<div class="flip-trade-sync '+(s.syncError?'is-error':'')+
    '" role="status" aria-live="polite"><i aria-hidden="true"></i><span>'+
    E(message)+'</span><small>~45 С</small></div>';
}
function feedMarkup(){
  const trades=visibleTrades();
  const incoming=trades.filter(t=>t.status==='pending'&&!t.mine);
  const outgoing=trades.filter(t=>t.status==='pending'&&t.mine);
  const history=trades.filter(t=>t.status!=='pending');
  return liveStatus()+
    '<div class="flip-social-heading flip-trade-list-heading"><h3>ТВОИ ОБМЕНЫ</h3>'+
    '<button class="outlinebtn" type="button" data-trade-refresh '+(s.busy?'disabled':'')+
    '>ОБНОВИТЬ ↗</button></div>'+
    section('ВХОДЯЩИЕ · '+incoming.length,incoming)+
    section('ИСХОДЯЩИЕ · '+outgoing.length,outgoing)+
    section('ИСТОРИЯ',history)+giftHistory();
}
function updateBadge(){
  const count=document.querySelector('[data-tab="trades"] .count');
  if(!count)return;
  const incoming=s.trades.filter(t=>!t.mine&&statusOf(t)==='pending').length;
  count.textContent=String(incoming>99?'99+':incoming);
  count.hidden=!incoming;
}
function refreshFeed(){
  const target=root?.isConnected?root.querySelector('#flip-trade-live-feed'):null;
  if(target){
    target.innerHTML=feedMarkup();
    window.FLIPIcons?.render(target);
  }
  updateBadge();
}
function draw(){
  if(!root||!root.isConnected)return;
  root.innerHTML=[
    s.error?'<p class="flip-social-error">'+E(s.error)+'</p>':'',
    s.message?'<p class="flip-social-success">'+E(s.message)+'</p>':'',
    draft(),
    '<div id="flip-trade-live-feed">'+feedMarkup()+'</div>'
  ].join('');
  updateBadge();
  window.FLIPIcons?.render(root);
}
async function loadTrades({force=false,manual=false}={}){
  // Ignore duplicate hub ticks; an explicit post-mutation request supersedes
  // older responses to avoid showing a stale trade after a successful action.
  if(inFlight&&!force)return inFlight;
  const token=++requestSeq;
  if(manual){s.loading=true;refreshFeed();}
  const pending=(async()=>{
    try{
      const data=await api('expanded');
      if(token!==requestSeq)return;
      const next=Array.isArray(data.trades)?data.trades:[];
      const oldIds=new Set(s.trades.filter(t=>!t.mine&&statusOf(t)==='pending').map(t=>t.id));
      freshIncoming=new Set(next.filter(t=>!t.mine&&statusOf(t)==='pending'&&!oldIds.has(t.id)).map(t=>t.id));
      // Initial load is not a new-offer announcement.
      if(!s.lastChecked)freshIncoming.clear();
      s.trades=next;s.gifts=Array.isArray(data.gifts)?data.gifts:[];
      s.syncError='';s.lastChecked=Date.now();s.loading=false;
      refreshFeed();
    }catch(e){
      if(token!==requestSeq)return;
      s.loading=false;s.syncError='Не удалось получить обмены: '+e.message;
      refreshFeed();
    }
  })();
  inFlight=pending;
  try{return await pending;}finally{if(inFlight===pending)inFlight=null;}
}
function syncHub(hub){
  if(!initData||document.visibilityState==='hidden')return;
  const events=Array.isArray(hub?.activity)?hub.activity:[];
  // Only event IDs/kinds matter. Marking notifications as read must not
  // provoke a new trade request.
  const signature=events.filter(e=>/^(trade_|currency_|gift_)/.test(String(e.kind||'')))
    .map(e=>String(e.id)+':'+e.kind).join('|');
  const changed=lastHubTrades!==null&&lastHubTrades!==signature;
  lastHubTrades=signature;
  const active=!!(root&&root.isConnected);
  const interval=active?40000:300000;
  if(!s.lastChecked||changed||Date.now()-s.lastChecked>=interval)
    loadTrades({force:changed});
  else updateBadge();
}
async function searchPlayers(){
  const stamp=serial,seq=++searchSeq;
  if(s.q.trim().length<2){s.players=[];s.searching=false;updateResults();return;}
  s.searching=true;updateResults();
  try{
    const result=await api('players',{q:s.q.trim()});
    if(stamp!==serial||seq!==searchSeq)return;
    s.searching=false;s.players=result.players||[];updateResults();
  }catch(e){if(stamp!==serial||seq!==searchSeq)return;s.searching=false;s.players=[];updateResults();}
}
function updateResults(){
  const node=root?.querySelector('#flip-trade-player-results');
  if(node)node.innerHTML=playerResults();
}
async function choosePlayer(id,label,preset=null){
  s.targetId=id;s.targetLabel=label;s.their=[];s.take=[];s.error='';
  if(preset){
    s.counterOf=preset.tradeId;
    s.give=[...preset.give];
    s.take=[...preset.take];
  }else{
    s.counterOf='';s.give=[];s.take=[];
  }
  draw();
  const stamp=serial;
  try{
    const result=await api('cards',{playerId:id});
    if(stamp!==serial||s.targetId!==id)return;
    s.their=result.cards||[];
    const mine=groups();
    s.give=s.give.filter(key=>mine.some(c=>c.id===key));
    s.take=s.take.filter(key=>s.their.some(c=>c.id===key));
    draw();
    if(preset)root?.querySelector('#flip-trade-compose')?.scrollIntoView({block:'start',behavior:'smooth'});
  }catch(e){if(stamp!==serial)return;s.error='Не удалось загрузить карточки: '+e.message;draw();}
}
const pendingKey='flip_v085_social_'+ownId;
function remember(payload){
  const marker=JSON.stringify(payload);
  let existing=null;
  try{existing=JSON.parse(localStorage.getItem(pendingKey)||'null');}catch{}
  if(existing?.marker===marker&&typeof existing.id==='string')return existing.id;
  const id=crypto.randomUUID();
  try{localStorage.setItem(pendingKey,JSON.stringify({marker,id}));}catch{}
  return id;
}
function clearPending(){try{localStorage.removeItem(pendingKey);}catch{}}
async function submit(payload){
  if(s.busy)return;
  const requestId=remember(payload);
  s.busy=true;s.error='';s.message='';draw();
  try{
    const result=await api('',{}, {...payload,requestId});
    clearPending();
    s.busy=false;s.message=payload.action==='gift'?
      'Подарок отправлен! Карточка уже передана получателю.':
      payload.action==='create_f'?'Предложение за F отправлено на 72 часа.':
      payload.action==='create'?
      'Предложение отправлено. Оно действует 72 часа.':payload.action==='counter'?
      'Встречное предложение отправлено. Прежнее предложение закрыто.':
      ['accept','accept_f'].includes(payload.action)?
      'Обмен завершён. Твой CP: '+signed(result.recipient_cp_delta)+
      (payload.action==='accept_f'?' · '+(Number(result.recipient_f_delta)>=0?'+':'')+
        fmt(result.recipient_f_delta)+' F':'')+
        (result.recipient_xp?' · +'+result.recipient_xp+' XP':''):
      payload.action==='decline'?'Предложение отклонено.':'Предложение отменено.';
    s.inspectId='';s.inspection=null;
    if(['create','counter','create_f','gift'].includes(payload.action)){
      s.counterOf='';s.targetId='';s.targetLabel='';s.their=[];s.give=[];s.take=[];s.players=[];
    }
    await loadTrades({force:true});
    draw();
    window.dispatchEvent(new Event('flip-trade-changed'));
    if(['accept','accept_f','gift'].includes(payload.action))
      window.dispatchEvent(new Event('flip-trade-completed'));
  }catch(e){
    s.busy=false;s.error='Ошибка операции: '+e.message+'. Повтор безопасен с теми же параметрами.';
    if(['BAD_TRADE','BAD_GIFT','TRADE_CARD_UNAVAILABLE','TRADE_EXPIRED','TRADE_NOT_FOUND',
      'TRADE_ALREADY_CLOSED','PLAYER_NOT_FOUND','TRADE_FORBIDDEN','TRADE_PENDING_LIMIT',
      'INSUFFICIENT_FUNDS','GIFT_DAILY_LIMIT'].includes(e.message))
      clearPending();
    draw();
  }
}
async function inspect(id){
  try{
    const selected=s.trades.find(t=>t.id===id);
    const result=await api(selected?.type==='currency'?'currency_preview':'preview',{tradeId:id});
    s.inspectId=id;s.inspection=result.preview;s.error='';draw();
  }catch(e){s.error='Ошибка проверки CP: '+e.message;draw();}
}
async function act(verb,id){
  if(s.busy)return;
  const t=s.trades.find(x=>x.id===id);
  if(!t||statusOf(t)!=='pending')return;
  const currency=t.type==='currency';
  if(verb==='accept'){
    let preview;
    try{preview=(await api(currency?'currency_preview':'preview',{tradeId:id})).preview;}
    catch(e){s.error='Не удалось проверить обмен: '+e.message;draw();return;}
    if(!preview?.available){s.error='Недоступно: нет карточек, баланса F или ещё действует защита 24 часа.';draw();return;}
    const extra=currency?'\nТвои F: '+(preview.recipient_f_delta>=0?'+':'')+
        fmt(preview.recipient_f_delta)+' F':'';
    if(!confirm('Принять обмен?\nТвой CP: '+signed(preview.recipient_delta)+
      '\nCP другого игрока: '+signed(preview.sender_delta)+extra+
      '\nКарточки и F будут переданы сразу.'))return;
  }else if(!confirm(verb==='cancel'?'Отменить предложение?':'Отклонить предложение?'))return;
  await submit({action:currency?verb+'_f':verb,tradeId:id});
}
function click(e){
  const target=e.target.closest('button');
  if(!target||!root?.contains(target))return;
  if(target.hasAttribute('data-trade-mode')){
    s.mode=target.dataset.tradeMode;s.give=[];s.take=[];s.counterOf='';s.error='';s.message='';
    draw();return;
  }
  if(target.hasAttribute('data-trade-currency-side')){
    s.currencySide=target.dataset.tradeCurrencySide;s.give=[];s.take=[];draw();return;
  }
  if(target.hasAttribute('data-trade-refresh')){loadTrades({force:true,manual:true});return;}
  if(target.hasAttribute('data-trade-find')){searchPlayers();return;}
  if(target.hasAttribute('data-trade-reset-counter')){
    s.counterOf='';s.targetId='';s.targetLabel='';s.give=[];s.take=[];s.their=[];draw();return;
  }
  if(target.hasAttribute('data-trade-clear')){
    s.targetId='';s.targetLabel='';s.their=[];s.players=[];s.give=[];s.take=[];draw();return;
  }
  if(target.hasAttribute('data-trade-select')){
    const p=s.players.find(x=>x.id===target.dataset.tradeSelect);
    if(p)choosePlayer(p.id,p.name);return;
  }
  if(target.hasAttribute('data-trade-counter')){
    const t=s.trades.find(t=>t.id===target.dataset.tradeCounter);
    if(!t||t.mine||t.status!=='pending'||t.type==='currency')return;
    const offer=Array.isArray(t.offer_cards)?t.offer_cards:[t.offer_card_id];
    const want=Array.isArray(t.want_cards)?t.want_cards:[t.want_card_id];
    choosePlayer(t.sender_id,t.sender_label,{tradeId:t.id,give:want,take:offer});
    return;
  }
  if(target.hasAttribute('data-trade-create')){
    const my=groups();
    if(!validSelection(my,s.their))return;
    const give=s.mode==='currency'&&s.currencySide==='buy'?[]:s.give;
    const take=s.mode==='gift'||(s.mode==='currency'&&s.currencySide==='sell')?[]:s.take;
    const mine=delta(my,give,take),other=delta(s.their,take,give);
    if(s.mode==='gift'){
      if(!confirm('Подарить '+card(s.give[0]).title+' игроку '+s.targetLabel+
        '?\nПередача моментальная и необратимая.\nТвой CP: '+signed(mine)))return;
      submit({action:'gift',recipientId:s.targetId,cardId:s.give[0]});return;
    }
    if(s.mode==='currency'){
      const sum=giftAmount(),sell=s.currencySide==='sell';
      if(!confirm((sell?'Продать карточки':'Купить карточки')+' у игрока '+s.targetLabel+
        '?\n'+(sell?'Ты отдаёшь '+give.length+' карт. и получаешь '+sum+' F':
          'Ты отдаёшь '+sum+' F и получаешь '+take.length+' карт.')+
        '\nТвой CP: '+signed(mine)+'\nCP другого игрока: '+signed(other)+
        '\nПредложение действует 72 часа.'))return;
      submit({action:'create_f',recipientId:s.targetId,
        offerCards:[...give].sort(),wantCards:[...take].sort(),
        offerF:sell?0:sum,wantF:sell?sum:0});return;
    }
    const action=s.counterOf?'counter':'create';
    if(!confirm((action==='counter'?'Отправить встречное предложение':'Предложить обмен')+
      ' игроку '+s.targetLabel+'?\nТы отдаёшь '+s.give.length+
      ' карт. · Получаешь '+s.take.length+' карт.\nТвой CP: '+signed(mine)+
      '\nCP другого игрока: '+signed(other)+'\nСрок — 72 часа.'))return;
    const offerCards=[...s.give].sort(),wantCards=[...s.take].sort();
    submit({action,recipientId:s.targetId,offerCards,wantCards,
      ...(s.counterOf?{parentTradeId:s.counterOf}:{})});return;
  }
  if(target.hasAttribute('data-trade-inspect')){inspect(target.dataset.tradeInspect);return;}
  if(target.hasAttribute('data-trade-verb'))act(target.dataset.tradeVerb,target.dataset.tradeId);
}
function input(e){
  if(e.target.id==='flip-trade-amount'){
    s.amount=String(e.target.value).slice(0,6);
    const button=root?.querySelector('[data-trade-create]');
    if(button)button.disabled=!validSelection(groups(),s.their)||s.busy;
    return;
  }
  if(e.target.id!=='flip-trade-user-search')return;
  s.q=e.target.value;
  if(searchTimer)clearTimeout(searchTimer);
  searchTimer=setTimeout(searchPlayers,300);
}
function change(e){
  const input=e.target.closest('[data-trade-toggle]');
  if(!input)return;
  const side=input.dataset.tradeToggle,chosen=side==='give'?s.give:s.take;
  const id=input.value;
  if(input.checked){
    if(!chosen.includes(id)&&chosen.length<(s.mode==='gift'?1:5))chosen.push(id);
  }else{
    const at=chosen.indexOf(id);
    if(at>=0)chosen.splice(at,1);
  }
  draw();
}
window.FLIPTrades={
  mount(el){
    if(!el)return;
    if(root===el)return;
    root=el;serial++;searchSeq++;
    if(searchTimer)clearTimeout(searchTimer);
    if(!initData){el.innerHTML='<p class="flip-social-muted">Обмены доступны при входе через Telegram.</p>';return;}
    el.addEventListener('click',click);
    el.addEventListener('input',input);
    el.addEventListener('change',change);
    s.give=[];s.take=[];s.counterOf='';
    s.error='';s.message='';s.loading=!s.lastChecked;draw();
    if(!s.lastChecked||Date.now()-s.lastChecked>10000)loadTrades();
  },
  syncHub,
  // Sender-only foreground receipt checks continue until an outgoing trade closes.
  hasPendingOutgoing(){return !!initData&&s.trades.some(t=>t.mine&&statusOf(t)==='pending');}
};
})();
