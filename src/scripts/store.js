/* FLIP v0.9.5 — premium shop storefront. All prices and eligibility come from the server. */
(()=>{
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
 }[c]));
 const fmt=n=>Number(n||0).toLocaleString('ru-RU');
 const specs={
  standard:{name:'STANDARD',type:'CORE DROP',tone:'lime',caption:'Все доступные релизы'},
  archive:{name:'ARCHIVE',type:'BEFORE 2020',tone:'ice',caption:'Релизы до 2020 года'},
  'new-era':{name:'NEW ERA',type:'2020 AND BEYOND',tone:'violet',caption:'Релизы с 2020 года'}
 };
 const rarityRu={
  common:'COMMON',rare:'RARE',epic:'EPIC',legendary:'LEGENDARY',
  mythic:'MYTHIC',hidden:'HIDDEN'
 };
 function cardFromId(id){
  if(typeof id!=='string'||id.length>180)return null;
  if(id==='demo/hidden/archive-001')return {id,artist:'FLIP // SECRET',
   title:'ARCHIVE 001',rarity:'Hidden',color:'hidden',art:''};
  const p=id.split('/');
  if(p.length!==3)return null;
  return window.FLIPCatalog?.getCard(p[0],p[1],p[2])||null;
 }
 function cover(id){
  const card=cardFromId(id);
  if(!card)return '<span class="flip-shop-cover-placeholder">FLIP.</span>';
  return card.art?
   '<img src="'+esc(card.art)+'" alt="'+esc(card.title)+
     '" loading="lazy" draggable="false" decoding="async">':
   '<span class="flip-shop-cover-placeholder">'+esc(card.title)+'</span>';
 }
 function packBack(tone,variant='hero'){
  return '<div class="flip-pack-art '+esc(tone)+' '+esc(variant)+'" aria-hidden="true">'+
    '<div class="flip-pack-art-line"></div>'+
    '<strong>FLIP<span>.</span></strong>'+
    '<div class="flip-pack-art-bottom"><span>COLLECT<br>TRADE</span><b>∷ 03</b></div>'+
    '</div>';
 }
 function packsFallback(){
  return [
   {id:'standard',name:'STANDARD PACK',description:'Любые доступные релизы',
    price:200,available:true,collection_size:null,previews:[]},
   {id:'archive',name:'ARCHIVE PACK',description:'Релизы до 2020 года',
    price:250,available:false,collection_size:0,previews:[]},
   {id:'new-era',name:'NEW ERA PACK',description:'Релизы с 2020 года',
    price:250,available:false,collection_size:0,previews:[]}
  ];
 }
 function paymentButton(pack,{online,demo=false,busy,balance,remaining,unlimited}){
  const available=pack.available!==false;
  const enough=balance>=Number(pack.price);
  const limit=!unlimited&&remaining<=0;
  const previewDemo=!online&&demo&&pack.id==='standard';
  const disabled=busy||(!online&&!previewDemo)||!available||!enough||limit;
  const copy=!online?(previewDemo?'ОТКРЫТЬ ДЕМО':'ДОСТУПНО В TELEGRAM'):!available?'СКОРО':
   !enough?'НЕДОСТАТОЧНО F':limit?'ЛИМИТ НА СЕГОДНЯ':busy?'ОБРАБОТКА…':'ОТКРЫТЬ ПАК';
  return '<button type="button" class="flip-shop-buy" data-shop-buy="'+esc(pack.id)+
    '"'+(disabled?' disabled':'')+' aria-label="'+esc(copy)+' '+esc(pack.name)+'">'+
    '<span>'+esc(copy)+'</span><span class="flip-shop-buy-arrow">↗</span></button>';
 }
 function hero(pack,context){
  const price=Number(pack?.price)||200;
  return '<section class="flip-shop-hero">'+
   '<div class="flip-shop-hero-head"><span>THE ORIGINAL / PACK 001</span>'+
   '<span class="flip-shop-hero-pill">FLIP EXCLUSIVE</span></div>'+
   '<div class="flip-shop-hero-title"><div><p>EVERY DROP COUNTS</p>'+
    '<h3>STANDARD<br>PACK<span>.</span></h3>'+
    '<p class="flip-shop-intro">3 карточки из всех релизов FLIP.'+
    '</p></div>'+
    '<div class="flip-shop-hero-stack">'+
      '<div class="flip-shop-stack-card is-back"></div>'+
      '<div class="flip-shop-stack-card is-middle"></div>'+
      packBack('lime')+'</div></div>'+
   '<div class="flip-shop-feature-row"><span>3 КАРТОЧКИ</span>'+
    '<span>≥ 1 RARE+</span></div>'+
   '<div class="flip-shop-hero-bottom"><div>'+
      '<small>ЦЕНА НАБОРА</small><strong>'+fmt(price)+' <i>F</i></strong></div>'+
      paymentButton(pack,{...context})+
   '</div></section>';
 }
 function previews(pack){
  const previews=Array.isArray(pack.previews)?pack.previews.slice(0,3):[];
  if(!previews.length)return packBack(specs[pack.id]?.tone||'lime','mini');
  return '<div class="flip-shop-cover-stack" aria-hidden="true">'+previews.map((id,i)=>
   '<div class="flip-shop-cover sample-'+i+'">'+cover(id)+'</div>').join('')+'</div>';
 }
 function themeCard(pack,context){
  const spec=specs[pack.id];
  return '<section class="flip-shop-theme '+spec.tone+'">'+
   '<div class="flip-shop-theme-eyebrow"><span>CURATED / '+esc(spec.type)+'</span>'+
   '<span>✦</span></div>'+
   previews(pack)+
   '<h3>'+esc(spec.name)+'<span>.</span></h3>'+
   '<p>'+esc(spec.caption)+'</p>'+
   '<div class="flip-shop-theme-meta"><span>3 КАРТЫ · ≥ RARE+</span>'+
    '<strong>'+fmt(pack.price)+' F</strong></div>'+
   '<small class="flip-shop-release-count">'+
     (Number.isFinite(Number(pack.collection_size))?fmt(pack.collection_size)+' релизов':'Разные релизы')+
   '</small>'+
   paymentButton(pack,context)+
   '</section>';
 }
 function rates(shop){
  const list=[['COMMON',65],['RARE',25],['EPIC',8],['LEGENDARY',1.8],['MYTHIC',0.2]];
  return '<details class="flip-shop-odds"><summary>'+
    '<span>ВЕРОЯТНОСТИ И ПРАВИЛА ПАКОВ</span><span class="flip-shop-chevron">⌄</span>'+
    '</summary><div class="flip-shop-odds-inner"><p>Шансы одинаковы для всех наборов.'+
    '</p>'+
    '<div class="flip-shop-odds-grid">'+list.map(([name,value])=>
      '<div><span>'+name+'</span><strong>'+value+'%</strong></div>').join('')+'</div>'+
    '<p>В каждом паке 3 разные карточки, минимум одна — Rare+.'+
    ''+
    '</p>'+
    '</div></details>';
 }
 function purchaseHistory(history){
  const entries=Array.isArray(history)?history:[];
  if(!entries.length)return '<div class="flip-shop-history-empty">'+
    '<strong>ПОКА НИ ОДНОЙ ПОКУПКИ.</strong>'+
    '<p>Первый набор появится здесь.</p></div>';
  return '<div class="flip-shop-history-list">'+entries.slice(0,40).map((item,i)=>{
    const spec=specs[item.pack_type]||specs.standard;
    const when=new Date(item.date);
    const date=Number.isNaN(when.valueOf())?'—':when.toLocaleString('ru-RU',{
      day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',
      timeZone:'Europe/Moscow'
    });
    const ids=Array.isArray(item.card_ids)?item.card_ids.slice(0,3):[];
    return '<details class="flip-shop-history-item"><summary>'+
      '<div class="flip-shop-history-icon '+spec.tone+'">03</div>'+
      '<div><strong>'+esc(spec.name)+' PACK</strong><small>'+esc(date)+' · МСК</small></div>'+
      '<span class="flip-shop-history-spend">−'+fmt(item.price)+' F</span>'+
      '</summary><div class="flip-shop-history-cards">'+ids.map(id=>{
        const c=cardFromId(id),rarity=String(c?.color||'common').toLowerCase();
        return '<button type="button" class="flip-shop-history-cover '+esc(rarity)+
          '" data-shop-inspect="'+esc(id)+'" aria-label="Посмотреть карточку">'+
           cover(id)+'<span>'+esc(rarityRu[rarity]||rarity)+'</span></button>';
      }).join('')+'</div>'+
      '</details>';
   }).join('')+'</div>';
 }
 function page({shop,cosmetics,profile,cosmeticPreview,state,live=false,demo=false,busy=false,tab='packs',loading=false,error='' }={}){
  const packs=Array.isArray(shop?.packs)?shop.packs: packsFallback();
  const byId=id=>packs.find(x=>x.id===id)||packsFallback().find(x=>x.id===id);
  const used=Math.max(0,Number(shop?.packs_today??state?.packsToday)||0);
  const max=Math.max(1,Number(shop?.daily_limit)||10);
  const unlimited=live&&(shop?.unlimited===true||state?.unlimitedPacks===true);
  const remaining=Math.max(0,max-used);
  const context={online:live,demo,balance:Number(state?.balance||0),busy,unlimited,remaining};
  return '<div class="panel flip-shop">'+
    
    '<div class="flip-shop-heading"><h2>МАГАЗИН<span>.</span></h2>'+
     '<p>ТВОЯ СЛЕДУЮЩАЯ<br>РЕДКАЯ НАХОДКА.</p></div>'+
    '<div class="flip-shop-topbar"><span><i>F</i> '+fmt(state?.balance)+' НА БАЛАНСЕ</span>'+
     '<span>'+(unlimited?'∞ БЕЗ ЛИМИТА':
       live?'ОСТАЛОСЬ '+fmt(remaining)+' / '+fmt(max):
       'ЛОКАЛЬНОЕ ДЕМО')+'</span></div>'+
    '<div class="flip-shop-tabs"><button type="button" data-shop-tab="packs" '+
      (tab==='packs'?'aria-current="page"':'')+'>НАБОРЫ</button>'+
      '<button type="button" data-shop-tab="history" '+
      (tab==='history'?'aria-current="page"':'')+'>ИСТОРИЯ</button>'+
      '<button type="button" data-shop-tab="cosmetics" '+
      (tab==='cosmetics'?'aria-current="page"':'')+'>КОСМЕТИКА</button></div>'+
    (tab==='cosmetics'?(window.FLIPProfileCosmetics?.shop({shop:cosmetics,profile,player:state,online:live,busy,previewId:cosmeticPreview})||''):
     tab==='history'?
      '<section class="flip-shop-history"><h3>ТВОИ ПОКУПКИ<span>.</span></h3>'+
      
      (!live?'<div class="flip-shop-history-empty">История доступна после входа через Telegram.</div>':
       loading?'<div class="flip-shop-history-empty">ЗАГРУЖАЕМ ИСТОРИЮ…</div>':
       error?'<div class="flip-shop-history-empty">Не удалось загрузить историю. Открой раздел ещё раз.</div>':
       purchaseHistory(shop?.history))+'</section>':
      hero(byId('standard'),context)+
      '<div class="flip-shop-section-label"><h3>ТЕМАТИЧЕСКИЕ НАБОРЫ</h3>'+
        '</div>'+
      '<div class="flip-shop-themes">'+
        themeCard(byId('archive'),context)+
        themeCard(byId('new-era'),context)+'</div>'+
      rates(shop)+
      '<p class="flip-shop-legal">Общий лимит обновляется в 00:00 МСК.'+
      '</p>')+
    '</div>';
 }
 window.FLIPStore={page,cardFromId,packBack,cardCount:3};
})();
