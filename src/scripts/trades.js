/* FLIP v0.9.10 — gallery-first trades; original signed transactions unchanged. */
(() => {
'use strict';
const E=x=>String(x??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const initData=window.Telegram?.WebApp?.initData||'';
const ownId=(()=>{try{return String(JSON.parse(new URLSearchParams(initData).get('user')||'{}').id||'');}catch{return''}})();
const s={q:'',players:[],targetId:'',targetLabel:'',their:[],give:[],take:[],
  mode:'cards',currencySide:'sell',amount:'',gifts:[],
  counterOf:'',trades:[],error:'',message:'',busy:false,loading:false,searching:false,inspectId:'',inspection:null,
  syncError:'',lastChecked:0,
  cardQuery:{give:'',take:''},rarityFilter:{give:'all',take:'all'}};
let root=null,serial=0,searchSeq=0,searchTimer=null,requestSeq=0,inFlight=null,lastHubTrades=null;
let freshIncoming=new Set();
const LIVE_TRADE_REFRESH_MS=15000;
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
const safeId=id=>typeof id==='string'&&id.length<=160&&
  /^[a-z0-9-]+\/[a-z0-9-]+\/(?:common|rare|epic|legendary|mythic|hidden)$/.test(id);
const rarityLabels={common:'COMMON',rare:'RARE',epic:'EPIC',
  legendary:'LEGENDARY',mythic:'MYTHIC',hidden:'HIDDEN'};
const rarityName=rarityLabels;
function artUrl(src,id){
  if(typeof src==='string'&&
     /^\.\/src\/assets\/[a-zA-Z0-9/_-]+\.webp$/.test(src))return src;
  if(typeof src==='string'&&
     /^https:\/\/sodhvekjhlmbhnrkmkzb\.supabase\.co\/storage\/v1\/object\/public\/flip-artwork\/[a-zA-Z0-9/_-]+\.webp$/.test(src))return src;
  return safeId(id)?'./src/assets/'+id+'.webp':'';
}
function card(id){
  if(!id)return{id:'',artist:'FLIP',name:'—',title:'—',rarity:'common',art:''};
  if(id==='demo/hidden/archive-001')return{id,artist:'FLIP',name:'ARCHIVE 001',
    title:'ARCHIVE 001',rarity:'hidden',art:''};
  const parts=String(id).split('/');
  let data=null;
  try{if(parts.length===3)data=window.FLIPCatalog?.getCard(...parts);}catch{}
  const rarity=String(data?.color||data?.rarity||parts[2]||'common').toLowerCase();
  const artist=String(data?.artist||parts[0]||'FLIP');
  const name=String(data?.title||parts[1]||'Карточка');
  const title=data?artist+' · '+name+' · '+String(data.rarity||rarity):String(id);
  return {id,artist,name,title,rarity,style:String(data?.style||''),
    art:artUrl(data?.art,id)};
}
function artMarkup(detail){
  return '<span class="flip-trade-art" data-rarity="'+E(detail.rarity)+'">'+
    (detail.art?'<img loading="lazy" decoding="async" src="'+E(detail.art)+
      '" alt="'+E(detail.artist+' — '+detail.name)+'">':'')+
    '<span class="flip-trade-art-fallback" aria-hidden="true">F<span>.</span></span>'+
    '</span>';
}
function previewCard(id,variant='mini'){
  const c=card(id);
  return '<button type="button" class="flip-trade-preview-card '+E(variant)+
    '" data-trade-preview-card="'+E(id)+'" aria-label="Просмотреть '+E(c.artist+' — '+c.name)+
    '">'+artMarkup(c)+'<span class="flip-trade-preview-caption">'+
    '<strong>'+E(c.name)+'</strong><small>'+E(c.artist)+'</small></span></button>';
}
function summarySide(ids,amount,label){
  return '<div class="flip-trade-summary-side"><div class="flip-trade-side-top">'+
    '<small>'+E(label)+'</small><b>'+((ids.length||amount>0)?(ids.length?
      ids.length+' КАРТ.':'')+(ids.length&&amount>0?' + ':'')+
      (amount>0?fmt(amount)+' F':''):'0')+'</b></div>'+
    '<div class="flip-trade-summary-items">'+
    (ids.length?ids.map(id=>previewCard(id,'small')).join(''):'')+
    (amount>0?'<span class="flip-trade-currency-token"><b>'+fmt(amount)+'</b><span>F</span></span>':'')+
    (!ids.length&&amount<=0?'<span class="flip-trade-summary-empty">—</span>':'')+
    '</div></div>';
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
function matchingCards(inventory,side){
  const q=String(s.cardQuery[side]||'').trim().toLocaleLowerCase('ru-RU');
  const rarity=s.rarityFilter[side]||'all';
  return inventory.filter(item=>{
    const c=card(item.id);
    return (rarity==='all'||c.rarity===rarity)&&
      (!q||(c.artist+' '+c.name+' '+c.rarity+' '+item.id)
        .toLocaleLowerCase('ru-RU').includes(q));
  });
}
function cardSelector(inventory,selected,side,limit=5){
  if(!inventory.length)return '<div class="flip-trade-tiles-empty">Нет доступных карточек</div>';
  const matched=matchingCards(inventory,side);
  const reached=selected.length>=limit;
  // Preserve tile positions after a tap; selected cards are already visible in the review strip.
  const shown=matched;
  if(!shown.length)return '<div class="flip-trade-tiles-empty">Ничего не найдено</div>';
  return '<div class="flip-trade-card-choices" data-trade-choices="'+side+'">'+
    shown.map((item,i)=>{
      const c=card(item.id),checked=selected.includes(item.id),disabled=reached&&!checked;
      return '<div class="flip-trade-card-choice '+(checked?'chosen ':'')+
        (disabled?'at-limit ':'')+'" style="--tile-order:'+Math.min(i,9)+'" data-rarity="'+
        E(c.rarity)+'">'+
        '<button type="button" class="flip-trade-choice-art" data-trade-preview-card="'+
        E(item.id)+'" aria-label="Просмотреть '+E(c.artist+' — '+c.name)+'">'+
        artMarkup(c)+'<span class="flip-trade-choice-zoom" aria-hidden="true">↗</span></button>'+
        '<label class="flip-trade-choice-select">'+
        '<input type="checkbox" data-trade-toggle="'+side+'" value="'+E(item.id)+'" '+
        (checked?'checked ':'')+(disabled?'disabled ':'')+'>'+
        '<span class="flip-trade-choice-name"><strong>'+E(c.name)+
        '</strong><small>'+E(c.artist)+'</small></span>'+
        '<span class="flip-trade-choice-check" aria-hidden="true">'+(checked?'✓':'+')+'</span>'+
        '</label><div class="flip-trade-choice-bottom"><span class="flip-trade-rarity" data-rarity="'+
        E(c.rarity)+'">'+E(rarityName[c.rarity]||c.rarity.toUpperCase())+
        '</span><small>×'+Math.max(0,Number(item.ranked_count)||0)+'</small></div>'+
        '</div>';
    }).join('')+'</div>';
}
function cardPicker(inventory,selected,side,title,limit=5){
  const rarity=s.rarityFilter[side]||'all';
  const opts=[['all','ВСЕ'],['common','C'],['rare','R'],['epic','E'],
    ['legendary','L'],['mythic','M'],['hidden','H']];
  const available=new Set(inventory.map(item=>card(item.id).rarity));
  return '<div class="flip-trade-picker" data-picker="'+side+'">'+
   '<div class="flip-trade-picker-heading"><div><small>'+E(title)+'</small>'+
   '<strong>'+selected.length+' <span>/ '+limit+'</span></strong></div>'+
   '<span class="flip-trade-picker-total" data-trade-choice-count="'+side+'">'+
     matchingCards(inventory,side).length+' в списке</span></div>'+
   '<div class="flip-trade-filter-bar"><label class="flip-trade-card-search-wrap">'+
    '<span aria-hidden="true">⌕</span><input type="search" data-trade-card-search="'+side+
    '" class="flip-trade-card-search" placeholder="Артист или релиз" aria-label="Поиск карточек" '+
    'autocomplete="off" value="'+E(s.cardQuery[side]||'')+'"></label>'+
    '<div class="flip-trade-rarity-filter" role="group" aria-label="Редкость">'+
    opts.filter(([id])=>id==='all'||available.has(id)).map(([id,label])=>
      '<button type="button" data-trade-rarity-side="'+side+'" data-trade-rarity="'+id+
      '" class="'+(rarity===id?'active':'')+'" aria-pressed="'+(rarity===id)+'" title="'+
      E(rarityName[id]||'Все редкости')+'">'+label+'</button>').join('')+'</div></div>'+
   '<div class="flip-trade-choice-viewport" data-trade-viewport="'+side+'">'+
     cardSelector(inventory,selected,side,limit)+'</div></div>';
}
function draft(){
  const mine=groups(),theirs=s.their,locked=!!s.counterOf;
  const mode=locked?'cards':s.mode;
  const good=validSelection(mine,theirs);
  const giving=mode==='currency'&&s.currencySide==='buy'?[]:s.give;
  const taking=mode==='gift'||(mode==='currency'&&s.currencySide==='sell')?[]:s.take;
  const sum=mode==='currency'?giftAmount():0;
  const givingF=mode==='currency'&&s.currencySide==='buy'?sum:0;
  const takingF=mode==='currency'&&s.currencySide==='sell'?sum:0;
  const heading=locked?'Встречное предложение':
    mode==='gift'?'Отправить подарок':
    mode==='currency'?'Карточки за F':'Новый обмен';
  const out=['<section class="flip-social-panel flip-trade-compose" id="flip-trade-compose">',
    '<div class="flip-trade-compose-head"><div><span class="flip-trade-kicker">01 / НОВАЯ СДЕЛКА</span>'+
    '<h3>'+heading+'</h3></div><span class="flip-trade-compose-mark" aria-hidden="true">↗</span></div>'];
  if(!locked){
    out.push('<div class="flip-trade-modes" role="group" aria-label="Тип операции">');
    for(const [id,label] of [['cards','КАРТОЧКИ'],['currency','ЗА F'],['gift','ПОДАРОК']]){
      out.push('<button type="button" data-trade-mode="'+id+'" class="'+
        (mode===id?'active':'')+'" aria-pressed="'+(mode===id)+'">'+label+'</button>');
    }
    out.push('</div>');
  }else{
    out.push('<div class="flip-social-selected flip-trade-counter-banner">Встречное предложение'+
      '<button type="button" data-trade-reset-counter>ОТМЕНИТЬ</button></div>');
  }
  out.push('<label class="flip-social-label" for="flip-trade-user-search">КОМУ</label>',
    '<div class="flip-social-search flip-trade-player-search"><input class="flip-social-input" id="flip-trade-user-search" '+
    'maxlength="64" placeholder="@username или имя" autocomplete="off" '+
    'value="'+E(s.q)+'" '+(locked?'disabled':'')+'>'+
    '<button type="button" class="outlinebtn" data-trade-find '+(locked?'disabled':'')+
    '>НАЙТИ</button></div>',
    '<div id="flip-trade-player-results">'+(locked?'':playerResults())+'</div>');
  if(s.targetId){
    out.push('<div class="flip-social-selected flip-trade-picked-player"><div>'+
      '<small>ВЫБРАН ИГРОК</small><strong>'+E(s.targetLabel)+'</strong></div> '+
      (locked?'':'<button type="button" data-trade-clear>ИЗМЕНИТЬ</button>')+'</div>');
    if(mode==='currency'){
      out.push('<div class="flip-trade-modes flip-trade-direction" role="group" aria-label="Направление F">');
      for(const [id,label] of [['sell','ПРОДАЮ КАРТОЧКИ'],['buy','ПОКУПАЮ КАРТОЧКИ']]){
        out.push('<button type="button" data-trade-currency-side="'+id+'" class="'+
          (s.currencySide===id?'active':'')+'" aria-pressed="'+(s.currencySide===id)+'">'+label+'</button>');
      }
      out.push('</div>');
    }
    const offerMine=mode==='cards'||mode==='gift'||(mode==='currency'&&s.currencySide==='sell');
    const offerTheirs=mode==='cards'||(mode==='currency'&&s.currencySide==='buy');
    if(offerMine||offerTheirs){
      out.push('<div class="flip-trade-pickers">'+
        (offerMine?cardPicker(mine,s.give,'give','ТЫ ОТДАЁШЬ',mode==='gift'?1:5):'')+
        (offerMine&&offerTheirs?'<div class="flip-trade-exchange-direction" aria-hidden="true"><span>⇄</span></div>':'')+
        (offerTheirs?cardPicker(theirs,s.take,'take','ТЫ ПОЛУЧАЕШЬ',5):'')+
      '</div>');
    }
    if(mode==='currency'){
      out.push('<div class="flip-trade-amount-box"><label class="flip-social-label" for="flip-trade-amount">'+
        (s.currencySide==='sell'?'ПОЛУЧИШЬ F':'ОТДАШЬ F')+'</label>',
        '<div class="flip-trade-amount-input"><input id="flip-trade-amount" class="flip-social-input" '+
        'type="number" inputmode="numeric" min="1" max="10000" step="1" '+
        'placeholder="0" value="'+E(s.amount)+'"><strong>F</strong></div></div>');
    }
    out.push('<div class="flip-trade-review"><div class="flip-trade-review-head">'+
      '<span>УСЛОВИЯ СДЕЛКИ</span><span class="flip-trade-review-arrow" aria-hidden="true">↔</span></div>'+
      '<div class="flip-trade-review-grid">'+
      summarySide(giving,givingF,'ОТДАЁШЬ')+
      summarySide(taking,takingF,'ПОЛУЧАЕШЬ')+'</div></div>');
    if(good){
      const myDelta=delta(mine,giving,taking),theirDelta=delta(theirs,taking,giving);
      out.push('<div class="flip-social-preview flip-trade-cp-impact"><div><small>ТВОЙ CP</small><strong class="'+
        (myDelta>=0?'positive':'negative')+'">'+signed(myDelta)+'</strong></div>',
        '<div><small>CP ПАРТНЁРА</small><strong class="'+
        (theirDelta>=0?'positive':'negative')+'">'+signed(theirDelta)+'</strong></div></div>');
    }
    const label=mode==='gift'?'ПОДАРИТЬ КАРТОЧКУ':mode==='currency'?
      'ПРЕДЛОЖИТЬ СДЕЛКУ ЗА F':locked?'ОТПРАВИТЬ ВСТРЕЧНОЕ':
      'ОТПРАВИТЬ ПРЕДЛОЖЕНИЕ';
    out.push('<button type="button" class="bigbtn flip-trade-send" data-trade-create '+
      (!good||s.busy?'disabled':'')+'>'+label+' <span aria-hidden="true">↗</span></button>');
  }
  const rules=mode==='gift'?
    'Подарок передаётся сразу. До 10 подарков за 24 часа. Защита новых карточек — 24 часа.':
    mode==='currency'?
      'Предложение действует 72 часа. Карточки и F переходят при принятии, без резервирования. Защита новых карточек — 24 часа. XP за сделки с F не начисляется.':
      'Предложение действует 72 часа. Карточки не резервируются.';
  out.push('<details class="flip-trade-rules"><summary>ПРАВИЛА</summary><p>'+rules+'</p></details></section>');
  return out.join('');
}
function playerResults(){
  if(s.searching)return '<p class="flip-social-muted">Ищем игроков…</p>';
  return s.players.length?s.players.map(p=>'<button type="button" class="flip-trade-player" data-trade-select="'+
    E(p.id)+'"><strong>'+E(p.name)+'</strong><small>LVL '+E(p.level)+' · '+fmt(p.cp)+' CP</small></button>').join(''):
    '';
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
  const profileId=typeof t.partner_public_id==='string'&&
    /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(t.partner_public_id)?
      t.partner_public_id:null;
  const offerSide=(ids,f,label)=>'<div class="flip-trade-offer-side">'+
    '<div class="flip-trade-side-top"><small>'+label+'</small>'+
    '<b>'+(ids.length?ids.length+' КАРТ.':'')+(ids.length&&f>0?' + ':'')+
      (f>0?fmt(f)+' F':'')+(!ids.length&&!f?'—':'')+'</b></div>'+
    '<div class="flip-trade-offer-strip">'+ids.map(id=>previewCard(id,'offer')).join('')+
    (f>0?'<span class="flip-trade-currency-token"><b>'+fmt(f)+'</b><span>F</span></span>':'')+
    (!ids.length&&!f?'<span class="flip-trade-summary-empty">—</span>':'')+'</div></div>';
  return '<article class="flip-trade-offer '+(freshIncoming.has(t.id)?'is-fresh':'')+'">'+
    '<div class="flip-social-heading flip-trade-offer-heading">'+
    '<div class="flip-trade-partner"><strong>'+E(partner)+'</strong>'+
    (currency?'<small class="flip-trade-kind">КАРТОЧКИ ↔ F</small>':'')+
    (profileId?'<button type="button" class="flip-trade-profile-link" data-player-profile="'+
      E(profileId)+'">ПРОФИЛЬ ↗</button>':'')+'</div>'+
    '<span class="flip-trade-status '+E(t.status)+'">'+E(statusNames[t.status]||t.status)+'</span></div>'+
    '<div class="flip-trade-cards">'+offerSide(give,giveF,'ОТДАЁШЬ')+
      '<span class="flip-trade-offer-transfer" aria-hidden="true">⇄</span>'+
      offerSide(take,takeF,'ПОЛУЧАЕШЬ')+'</div>'+
    '<div class="flip-trade-offer-footer"><small>'+
    E(new Date(t.created_at).toLocaleDateString('ru-RU'))+' · №'+E(t.id.slice(0,8))+
    (t.parent_trade_id?' · ВСТРЕЧНОЕ':'')+'</small></div>'+
    (t.status==='pending'?'<div class="flip-trade-actions">'+
      '<button type="button" class="outlinebtn" data-trade-inspect="'+E(t.id)+'">ПРОВЕРИТЬ УСЛОВИЯ</button>'+
      (mine?'<button type="button" class="outlinebtn" data-trade-verb="cancel" data-trade-id="'+E(t.id)+'">ОТМЕНИТЬ</button>':
       '<button type="button" class="outlinebtn" data-trade-verb="decline" data-trade-id="'+E(t.id)+'">ОТКЛОНИТЬ</button>'+
       (currency?'':'<button type="button" class="outlinebtn" data-trade-counter="'+E(t.id)+'">ВСТРЕЧНОЕ</button>')+
       '<button type="button" class="bigbtn" data-trade-verb="accept" data-trade-id="'+E(t.id)+'">ПРИНЯТЬ</button>')+
    '</div>':'')+
    (s.inspectId===t.id&&s.inspection?'<div class="flip-social-preview flip-trade-inspection">'+
      '<div><small>ТВОЙ CP</small><strong>'+signed(mine?s.inspection.sender_delta:s.inspection.recipient_delta)+'</strong></div>'+
      '<div><small>CP ПАРТНЁРА</small><strong>'+signed(mine?s.inspection.recipient_delta:s.inspection.sender_delta)+'</strong></div></div>'+
      (s.inspection.available?'':'<p class="flip-social-error">Недостаточно доступных карточек/F или предложение уже закрыто.</p>'):'')+
    '</article>';
}
function giftHistory(){
  const list=s.gifts||[];
  if(!list.length)return '';
  return '<section class="flip-social-panel flip-trade-feed-panel"><div class="flip-trade-feed-head">'+
    '<h3>ПОДАРКИ</h3><span>'+list.length+'</span></div>'+
    list.slice(0,20).map(g=>'<div class="flip-trade-gift-row">'+
      '<span class="flip-trade-gift-icon">'+(g.mine?'↗':'↙')+'</span>'+
      previewCard(g.card_id,'gift')+
      '<div><strong>'+E(g.mine?'ОТПРАВЛЕНО':'ПОЛУЧЕНО')+'</strong>'+
      '<small>'+E(g.partner_label)+' · '+
      E(new Date(g.created_at).toLocaleDateString('ru-RU'))+'</small></div></div>').join('')+
  '</section>';
}
function section(title,items){
  return '<section class="flip-social-panel flip-trade-feed-panel">'+
    '<div class="flip-trade-feed-head"><h3>'+title+'</h3>'+
    '<span>'+items.length+'</span></div>'+
    (items.length?items.map(rowTrade).join(''):
      '<div class="flip-trade-empty-state" aria-label="Нет предложений">—</div>')+'</section>';
}
function liveStatus(){
  if(s.syncError)return '<div class="flip-trade-sync is-error" role="alert">'+
    '<i aria-hidden="true"></i><span>НЕТ СОЕДИНЕНИЯ · НАЖМИ «ОБНОВИТЬ»</span></div>';
  const clock=s.lastChecked?new Date(s.lastChecked).toLocaleTimeString('ru-RU',{
    hour:'2-digit',minute:'2-digit'}):null;
  return '<div class="flip-trade-sync is-live" aria-label="Автообновление обменов">'+
    '<i aria-hidden="true"></i><span>'+(clock?'ОБНОВЛЕНО '+clock+' · ':'')+
    'АВТО · 15 С</span></div>';
}
function feedMarkup(){
  const trades=visibleTrades();
  const incoming=trades.filter(t=>t.status==='pending'&&!t.mine);
  const outgoing=trades.filter(t=>t.status==='pending'&&t.mine);
  const history=trades.filter(t=>t.status!=='pending');
  return liveStatus()+
    '<section class="flip-trade-feed-header"><div>'+
    '<span class="flip-trade-kicker">02 / ИСТОРИЯ СДЕЛОК</span>'+
    '<h3>Предложения</h3></div>'+
    '<button class="outlinebtn" type="button" data-trade-refresh '+(s.busy?'disabled':'')+
    '>ОБНОВИТЬ ↻</button></section>'+
    section('ВХОДЯЩИЕ',incoming)+
    section('ИСХОДЯЩИЕ',outgoing)+
    section('ИСТОРИЯ',history)+giftHistory();
}
function hero(){
  const incoming=s.trades.filter(t=>!t.mine&&statusOf(t)==='pending').length;
  return '<header class="flip-trade-hero"><div class="flip-trade-hero-grain" aria-hidden="true"></div>'+
    '<div class="flip-trade-hero-top"><span>FLIP / SOCIAL</span>'+
    '<span class="flip-trade-hero-star" aria-hidden="true">✳</span></div>'+
    '<h2>ОБМЕНЫ<span>.</span></h2>'+
    '<div class="flip-trade-hero-bottom"><span>ТВОЯ КОЛЛЕКЦИЯ. ТВОИ СДЕЛКИ.</span>'+
    '<span class="flip-trade-hero-ring" aria-hidden="true">⇄</span></div>'+
    '<div class="flip-trade-shortcuts" role="group" aria-label="Разделы обменов">'+
    '<button type="button" data-trade-jump="flip-trade-compose">+ СОЗДАТЬ</button>'+
    '<button type="button" data-trade-jump="flip-trade-live-feed">ПРЕДЛОЖЕНИЯ'+
    '<b data-trade-incoming-count>'+incoming+'</b></button></div></header>';
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
  const heroCount=root?.querySelector('[data-trade-incoming-count]');
  if(heroCount)heroCount.textContent=String(s.trades.filter(t=>!t.mine&&statusOf(t)==='pending').length);
}
function draw(){
  if(!root||!root.isConnected)return;
  root.innerHTML=[
    hero(),
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
      s.loading=false;s.syncError='NO_CONNECTION';
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
  const interval=active?LIVE_TRADE_REFRESH_MS:300000;
  if(!s.lastChecked||changed||Date.now()-s.lastChecked>=interval)
    loadTrades({force:changed});
  else updateBadge();
}
function tickVisible(){
  if(!initData||s.busy||document.visibilityState==='hidden'||!root?.isConnected)return null;
  if(s.lastChecked&&Date.now()-s.lastChecked<LIVE_TRADE_REFRESH_MS)return null;
  // loadTrades coalesces overlapping hub, manual and foreground reads.
  return loadTrades();
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
    // A counteroffer is always a card/card proposal, regardless of the
    // previously selected gift or F-trade composer mode.
    s.mode='cards';s.counterOf=preset.tradeId;
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
  }catch(e){if(stamp!==serial)return;s.error='Не удалось загрузить карточки игрока.';draw();}
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
function tradeError(code){
 const errors={
  BAD_TRADE:'Проверь условия обмена.',
  BAD_GIFT:'Проверь выбранную карточку.',
  TRADE_CARD_UNAVAILABLE:'Карточка недоступна или действует защита после выпадения.',
  TRADE_EXPIRED:'Срок предложения истёк.',
  TRADE_NOT_FOUND:'Предложение не найдено.',
  TRADE_ALREADY_CLOSED:'Предложение уже закрыто.',
  PLAYER_NOT_FOUND:'Игрок не найден.',
  TRADE_FORBIDDEN:'Это действие недоступно.',
  TRADE_PENDING_LIMIT:'Достигнут лимит открытых предложений.',
  INSUFFICIENT_FUNDS:'Недостаточно F.',
  GIFT_DAILY_LIMIT:'Достигнут лимит подарков.',
  DUPLICATE_TRADE_REQUEST:'Этот запрос уже использован.',
  CARD_NOT_FOUND:'Карточка не найдена.',
  BAD_REQUEST:'Проверь введённые данные.'
 };
 return errors[code]||'Не удалось выполнить действие. Попробуй ещё раз.';
}
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
      ['decline','decline_f'].includes(payload.action)?'Предложение отклонено.':'Предложение отменено.';
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
    s.busy=false;s.error=tradeError(e.message);
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
  }catch(e){s.error='Не удалось проверить условия сделки.';draw();}
}
async function act(verb,id){
  if(s.busy)return;
  const t=s.trades.find(x=>x.id===id);
  if(!t||statusOf(t)!=='pending')return;
  const currency=t.type==='currency';
  if(verb==='accept'){
    let preview;
    try{preview=(await api(currency?'currency_preview':'preview',{tradeId:id})).preview;}
    catch(e){s.error='Не удалось проверить обмен.';draw();return;}
    if(!preview?.available){s.error='Недоступно: нет карточек, баланса F или ещё действует защита 24 часа.';draw();return;}
    const extra=currency?'\nТвои F: '+(preview.recipient_f_delta>=0?'+':'')+
        fmt(preview.recipient_f_delta)+' F':'';
    if(!confirm('Принять обмен?\nТвой CP: '+signed(preview.recipient_delta)+
      '\nCP другого игрока: '+signed(preview.sender_delta)+extra+
      '\nКарточки и F будут переданы сразу.'))return;
  }else if(!confirm(verb==='cancel'?'Отменить предложение?':'Отклонить предложение?'))return;
  await submit({action:currency?verb+'_f':verb,tradeId:id});
}

function openCardPreview(id,button){
  if(!safeId(id))return;
  const group=button?.closest?.('.flip-trade-card-choices, .flip-trade-summary-items, .flip-trade-offer-strip, .flip-trade-gift-row');
  const groupIds=group?.querySelectorAll?
    [...group.querySelectorAll('[data-trade-preview-card]')].map(x=>x.dataset.tradePreviewCard):[id];
  const ids=[...new Set([id,...groupIds].filter(safeId))].slice(0,100);
  const collection=ids.map(value=>{
    const c=card(value);
    return {id:c.id,artist:c.artist,title:c.name,color:c.rarity,
      rarity:c.rarity,style:c.style,art:c.art};
  });
  const selected=collection.find(c=>c.id===id);
  if(selected)window.FLIPCardViewer?.open?.(selected,{mode:'catalog',cards:collection});
}
function redrawComposer(){
  const old=root?.querySelector('#flip-trade-compose');
  if(!old||typeof old.outerHTML==='undefined'){draw();return;}
  const previous=[...(old.querySelectorAll?.('[data-trade-viewport]')||[])].map(node=>({
    side:node.dataset.tradeViewport,scrollTop:node.scrollTop
  }));
  old.outerHTML=draft();
  for(const prev of previous){
    const node=root?.querySelector('[data-trade-viewport="'+prev.side+'"]');
    if(node)node.scrollTop=prev.scrollTop;
  }
  window.FLIPIcons?.render(root?.querySelector('#flip-trade-compose')||root);
}
function filterCardGrid(side){
  const inventory=side==='give'?groups():s.their;
  const selected=side==='give'?s.give:s.take;
  const max=s.mode==='gift'&&side==='give'?1:5;
  const list=root?.querySelector('[data-trade-viewport="'+side+'"]');
  if(list)list.innerHTML=cardSelector(inventory,selected,side,max);
  const count=root?.querySelector('[data-trade-choice-count="'+side+'"]');
  if(count)count.textContent=matchingCards(inventory,side).length+' в списке';
}
function click(e){
  const target=e.target.closest('button');
  if(!target||!root?.contains(target))return;
  if(target.hasAttribute('data-trade-preview-card')){
    openCardPreview(target.dataset.tradePreviewCard,target);return;
  }
  if(target.hasAttribute('data-trade-jump')){
    const section=root?.querySelector('#'+target.dataset.tradeJump);
    section?.scrollIntoView?.({behavior:'smooth',block:'start'});
    return;
  }
  if(target.hasAttribute('data-trade-rarity')){
    const side=target.dataset.tradeRaritySide,rarity=target.dataset.tradeRarity;
    if(!['give','take'].includes(side)||!['all','common','rare','epic','legendary','mythic','hidden'].includes(rarity))return;
    s.rarityFilter[side]=rarity;redrawComposer();return;
  }
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
  const side=e.target.dataset?.tradeCardSearch;
  if(['give','take'].includes(side)){
    s.cardQuery[side]=String(e.target.value||'').slice(0,80);
    filterCardGrid(side);
    return;
  }
  if(e.target.id==='flip-trade-amount'){
    s.amount=String(e.target.value).slice(0,6);
    const can=validSelection(groups(),s.their);
    const button=root?.querySelector('[data-trade-create]');
    if(button)button.disabled=!can||s.busy;
    const give=s.currencySide==='buy'?[]:s.give;
    const take=s.currencySide==='sell'?[]:s.take;
    const sum=giftAmount();
    const grid=root?.querySelector('.flip-trade-review-grid');
    if(grid)grid.innerHTML=
      summarySide(give,s.currencySide==='buy'?sum:0,'ОТДАЁШЬ')+
      summarySide(take,s.currencySide==='sell'?sum:0,'ПОЛУЧАЕШЬ');
    const impact=root?.querySelector('.flip-trade-cp-impact');
    if(impact)impact.hidden=!can;
    else if(can){
      const mine=delta(groups(),give,take),theirs=delta(s.their,take,give);
      root?.querySelector('.flip-trade-review')?.insertAdjacentHTML?.('afterend',
        '<div class="flip-social-preview flip-trade-cp-impact">'+
        '<div><small>ТВОЙ CP</small><strong class="'+(mine>=0?'positive':'negative')+
        '">'+signed(mine)+'</strong></div>'+
        '<div><small>CP ПАРТНЁРА</small><strong class="'+(theirs>=0?'positive':'negative')+
        '">'+signed(theirs)+'</strong></div></div>');
    }
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
  redrawComposer();
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
    el.addEventListener('error',event=>{
      const image=event.target;
      if(image?.matches?.('.flip-trade-art img'))
        image.parentElement?.classList?.add('is-missing');
    },true);
    s.give=[];s.take=[];s.counterOf='';
    s.error='';s.message='';s.loading=!s.lastChecked;draw();
    if(!s.lastChecked||Date.now()-s.lastChecked>10000)loadTrades();
  },
  syncHub,tickVisible,
  // Sender-only foreground receipt checks continue until an outgoing trade closes.
  hasPendingOutgoing(){return !!initData&&s.trades.some(t=>t.mine&&statusOf(t)==='pending');}
};
})();
