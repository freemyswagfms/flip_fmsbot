/* FLIP v0.8.6 — secure 1-5 card bundle trading and counteroffers, no test copies or F. */
(() => {
'use strict';
const E=x=>String(x??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const initData=window.Telegram?.WebApp?.initData||'';
const ownId=(()=>{try{return String(JSON.parse(new URLSearchParams(initData).get('user')||'{}').id||'');}catch{return''}})();
const s={q:'',players:[],targetId:'',targetLabel:'',their:[],give:[],take:[],
  counterOf:'',trades:[],error:'',message:'',busy:false,loading:false,searching:false,inspectId:'',inspection:null};
let root=null,serial=0,searchSeq=0,searchTimer=null;
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
function validSelection(mine,theirs){
  return !!(s.targetId&&s.give.length>=1&&s.give.length<=5&&s.take.length>=1&&s.take.length<=5
    &&s.give.every(id=>mine.some(x=>x.id===id))
    &&s.take.every(id=>theirs.some(x=>x.id===id))
    &&!s.give.some(id=>s.take.includes(id)));
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
function cardSelector(inventory,selected,side){
  if(!inventory.length)return '<p class="flip-social-muted">Нет карточек, доступных для обмена.</p>';
  const reached=selected.length>=5;
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
  const mine=groups(),theirs=s.their;
  const good=validSelection(mine,theirs);
  const myDelta=good?delta(mine,s.give,s.take):null;
  const theirDelta=good?delta(theirs,s.take,s.give):null;
  return '<section class="flip-social-panel" id="flip-trade-compose">'+
    '<div class="flip-social-heading"><h3>'+(s.counterOf?'ВСТРЕЧНОЕ ПРЕДЛОЖЕНИЕ':'НОВОЕ ПРЕДЛОЖЕНИЕ')+
    '</h3><span class="pill">ДО 5 НА 5</span></div>'+
    (s.counterOf?'<div class="flip-social-selected">Ты меняешь условия исходного предложения. После отправки оно будет закрыто. '+
      '<button type="button" data-trade-reset-counter>ОТМЕНИТЬ РЕДАКТИРОВАНИЕ</button></div>':'')+
    '<label class="flip-social-label" for="flip-trade-user-search">Найти игрока</label>'+
    '<div class="flip-social-search"><input class="flip-social-input" id="flip-trade-user-search" '+
      'maxlength="64" placeholder="@username, имя или Telegram ID" autocomplete="off" value="'+E(s.q)+'" '+
      (s.counterOf?'disabled':'')+'>'+
      '<button type="button" class="outlinebtn" data-trade-find '+(s.counterOf?'disabled':'')+'>НАЙТИ</button></div>'+
    '<div id="flip-trade-player-results">'+(s.counterOf?'':playerResults())+'</div>'+
    (s.targetId?'<div class="flip-social-selected">Получатель: <strong>'+E(s.targetLabel)+
      '</strong> '+(s.counterOf?'':'<button type="button" data-trade-clear>ИЗМЕНИТЬ</button>')+'</div>':'')+
    (s.targetId?
      '<label class="flip-social-label">ТЫ ОТДАЁШЬ · '+s.give.length+'/5</label>'+
      cardSelector(mine,s.give,'give')+
      '<label class="flip-social-label">ТЫ ПОЛУЧАЕШЬ · '+s.take.length+'/5</label>'+
      cardSelector(theirs,s.take,'take')+
      (good?'<div class="flip-social-preview"><div><small>ТВОЙ CP</small><strong class="'+
        (myDelta>=0?'positive':'negative')+'">'+signed(myDelta)+'</strong></div>'+
        '<div><small>CP ПОЛУЧАТЕЛЯ</small><strong class="'+(theirDelta>=0?'positive':'negative')+'">'+
        signed(theirDelta)+'</strong></div></div>':
        '<p class="flip-social-muted">Выбери от 1 до 5 различных карточек с каждой стороны. '+
        'Одинаковый вариант с двух сторон одной сделки пока не поддерживается.</p>')+
      '<button type="button" class="bigbtn" data-trade-create '+(!good||s.busy?'disabled':'')+
      '>'+(s.counterOf?'ОТПРАВИТЬ ВСТРЕЧНОЕ ↗':'ОТПРАВИТЬ ПРЕДЛОЖЕНИЕ ↗')+'</button>':'')+
    '<p class="flip-social-muted">Срок предложения — 72 часа. Карточки не резервируются. '+
    'Обе стороны должны выбрать хотя бы одну карточку.</p></section>';
}
function playerResults(){
  if(s.searching)return '<p class="flip-social-muted">Ищем игроков…</p>';
  return s.players.length?s.players.map(p=>'<button type="button" class="flip-trade-player" data-trade-select="'+
    E(p.id)+'"><strong>'+E(p.name)+'</strong><small>LVL '+E(p.level)+' · '+fmt(p.cp)+' CP</small></button>').join(''):
    '<p class="flip-social-muted">Поиск по зарегистрированным игрокам.</p>';
}
function rowTrade(t){
  const mine=t.mine,partner=mine?t.recipient_label:t.sender_label;
  const offer=Array.isArray(t.offer_cards)?t.offer_cards:[t.offer_card_id];
  const want=Array.isArray(t.want_cards)?t.want_cards:[t.want_card_id];
  const give=mine?offer:want,take=mine?want:offer;
  const statusNames={pending:'ОЖИДАЕТ',accepted:'ПРИНЯТ',declined:'ОТКЛОНЁН',
    cancelled:'ОТМЕНЁН',expired:'ИСТЁК',countered:'ВСТРЕЧНОЕ'};
  const itemList=items=>'<ul class="flip-trade-offer-list">'+items.map(id=>'<li>'+E(card(id).title)+'</li>').join('')+'</ul>';
  return '<div class="flip-trade-offer"><div class="flip-social-heading"><strong>'+
    E(partner)+'</strong><span class="flip-trade-status '+E(t.status)+'">'+E(statusNames[t.status]||t.status)+'</span></div>'+
    '<div class="flip-trade-cards"><div><small>ТЫ ОТДАЁШЬ · '+give.length+'</small>'+itemList(give)+'</div>'+
    '<div><small>ТЫ ПОЛУЧАЕШЬ · '+take.length+'</small>'+itemList(take)+'</div></div>'+
    '<small class="flip-social-muted">'+
    E(new Date(t.created_at).toLocaleDateString('ru-RU'))+' · №'+E(t.id.slice(0,8))+
    (t.parent_trade_id?' · ВСТРЕЧНОЕ':'')+'</small>'+
    (t.status==='pending'?'<div class="flip-trade-actions">'+
      '<button type="button" class="outlinebtn" data-trade-inspect="'+E(t.id)+'">ПРОВЕРИТЬ CP</button>'+
      (mine?'<button type="button" class="outlinebtn" data-trade-verb="cancel" data-trade-id="'+E(t.id)+'">ОТМЕНИТЬ</button>':
       '<button type="button" class="outlinebtn" data-trade-verb="decline" data-trade-id="'+E(t.id)+'">ОТКЛОНИТЬ</button>'+
       '<button type="button" class="outlinebtn" data-trade-counter="'+E(t.id)+'">ВСТРЕЧНОЕ</button>'+
       '<button type="button" class="bigbtn" data-trade-verb="accept" data-trade-id="'+E(t.id)+'">ПРИНЯТЬ</button>')+
    '</div>':'')+
    (s.inspectId===t.id&&s.inspection?'<div class="flip-social-preview">'+
      '<div><small>ТВОЙ CP</small><strong>'+signed(mine?s.inspection.sender_delta:s.inspection.recipient_delta)+'</strong></div>'+
      '<div><small>CP ПАРТНЁРА</small><strong>'+signed(mine?s.inspection.recipient_delta:s.inspection.sender_delta)+'</strong></div></div>'+
      (s.inspection.available?'':'<p class="flip-social-error">Карточки больше недоступны или предложение закрыто.</p>'):'')+
    '</div>';
}
function section(title,items){
  return '<section class="flip-social-panel"><h3>'+title+'</h3>'+
    (items.length?items.map(rowTrade).join(''):'<p class="flip-social-muted">Предложений пока нет.</p>')+'</section>';
}
function draw(){
  if(!root||!root.isConnected)return;
  const incoming=s.trades.filter(t=>t.status==='pending'&&!t.mine);
  const outgoing=s.trades.filter(t=>t.status==='pending'&&t.mine);
  const history=s.trades.filter(t=>t.status!=='pending');
  root.innerHTML=[
    s.error?'<p class="flip-social-error">'+E(s.error)+'</p>':'',
    s.message?'<p class="flip-social-success">'+E(s.message)+'</p>':'',
    draft(),
    '<div class="flip-social-heading flip-trade-list-heading"><h3>ТВОИ ОБМЕНЫ</h3>',
    '<button class="outlinebtn" type="button" data-trade-refresh '+(s.busy?'disabled':'')+'>ОБНОВИТЬ ↗</button></div>',
    section('ВХОДЯЩИЕ · '+incoming.length,incoming),
    section('ИСХОДЯЩИЕ · '+outgoing.length,outgoing),
    section('ИСТОРИЯ',history),
    s.loading?'<p class="flip-social-muted">Обновляем предложения…</p>':''
  ].join('');
  const count=document.querySelector('[data-tab="trades"] .count');
  if(count){count.textContent=String(incoming.length);count.hidden=!incoming.length;}
  window.FLIPIcons?.render(root);
}
async function loadTrades(){
  const stamp=serial;
  s.loading=true;draw();
  try{
    const data=await api('trades');
    if(stamp!==serial)return;
    s.trades=data.trades||[];s.error='';s.loading=false;draw();
  }catch(e){if(stamp!==serial)return;s.loading=false;s.error='Не удалось получить обмены: '+e.message;draw();}
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
    s.busy=false;s.message=payload.action==='create'?
      'Предложение отправлено. Оно действует 72 часа.':payload.action==='counter'?
      'Встречное предложение отправлено. Прежнее предложение закрыто.':
      payload.action==='accept'?
      'Обмен завершён. Твой CP: '+signed(result.recipient_cp_delta)+
        (result.recipient_xp?' · +'+result.recipient_xp+' XP':''):
      payload.action==='decline'?'Предложение отклонено.':'Предложение отменено.';
    s.inspectId='';s.inspection=null;
    if(['create','counter'].includes(payload.action)){
      s.counterOf='';s.targetId='';s.targetLabel='';s.their=[];s.give=[];s.take=[];s.players=[];
    }
    await loadTrades();
    if(payload.action==='accept')window.dispatchEvent(new Event('flip-trade-completed'));
  }catch(e){
    s.busy=false;s.error='Ошибка операции: '+e.message+'. Повтор безопасен с теми же параметрами.';
    if(['BAD_TRADE','TRADE_CARD_UNAVAILABLE','TRADE_EXPIRED','TRADE_NOT_FOUND',
      'TRADE_ALREADY_CLOSED','PLAYER_NOT_FOUND','TRADE_FORBIDDEN','TRADE_PENDING_LIMIT'].includes(e.message))
      clearPending();
    draw();
  }
}
async function inspect(id){
  try{
    const result=await api('preview',{tradeId:id});
    s.inspectId=id;s.inspection=result.preview;s.error='';draw();
  }catch(e){s.error='Ошибка проверки CP: '+e.message;draw();}
}
async function act(verb,id){
  if(s.busy)return;
  if(verb==='accept'){
    let preview;
    try{preview=(await api('preview',{tradeId:id})).preview;}
    catch(e){s.error='Не удалось проверить обмен: '+e.message;draw();return;}
    if(!preview?.available){s.error='Обмен больше недоступен: карточки могли быть переданы другим игрокам.';draw();return;}
    if(!confirm('Принять обмен?\nТвой CP: '+signed(preview.recipient_delta)+
      '\nCP другого игрока: '+signed(preview.sender_delta)+'\nКарточки будут переданы сразу.'))return;
  }else if(!confirm(verb==='cancel'?'Отменить предложение?':'Отклонить предложение?'))return;
  await submit({action:verb,tradeId:id});
}
function click(e){
  const target=e.target.closest('button');
  if(!target||!root?.contains(target))return;
  if(target.hasAttribute('data-trade-refresh')){loadTrades();return;}
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
    if(!t||t.mine||t.status!=='pending')return;
    const offer=Array.isArray(t.offer_cards)?t.offer_cards:[t.offer_card_id];
    const want=Array.isArray(t.want_cards)?t.want_cards:[t.want_card_id];
    choosePlayer(t.sender_id,t.sender_label,{tradeId:t.id,give:want,take:offer});
    return;
  }
  if(target.hasAttribute('data-trade-create')){
    const my=groups();
    if(!validSelection(my,s.their))return;
    const mine=delta(my,s.give,s.take),other=delta(s.their,s.take,s.give);
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
    if(!chosen.includes(id)&&chosen.length<5)chosen.push(id);
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
    const mine=groups();
    s.give=[];s.take=[];s.counterOf='';
    s.error='';s.message='';s.loading=true;draw();
    loadTrades();
  }
};
})();
