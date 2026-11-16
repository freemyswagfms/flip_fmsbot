/* FLIP v0.9.8.7 — curated, server-owned profile cosmetics.
 * Artwork is CSS/SVG only. The browser never grants entitlements or F.
 */
(()=>{
 'use strict';
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=n=>Number(n||0).toLocaleString('ru-RU',{maximumFractionDigits:2});
 const types=['background','avatar_frame','showcase_skin','title'];
 const cosmeticNames={
  'acid-signal':'ACID SIGNAL','midnight-grid':'MIDNIGHT GRID','redline':'REDLINE',
  'neon-ring':'NEON RING','liquid-chrome':'LIQUID CHROME','pulse':'PULSE',
  'glass-cabinet':'GLASS CABINET','black-chrome':'BLACK CHROME','red-velvet':'RED VELVET',
  'archive-hunter':'ARCHIVE HUNTER','no-skips':'NO SKIPS','day-one':'DAY ONE'
 };
 const allowedKinds={
  background:new Set(['acid-signal','midnight-grid','redline']),
  avatar_frame:new Set(['neon-ring','liquid-chrome','pulse']),
  showcase_skin:new Set(['glass-cabinet','black-chrome','red-velvet']),
  title:new Set(['archive-hunter','no-skips','day-one'])
 };
 const kinds={
  background:'ФОНЫ ПРОФИЛЯ',avatar_frame:'РАМКИ АВАТАРА',
  showcase_skin:'ОФОРМЛЕНИЯ ВИТРИНЫ',title:'ТИТУЛЫ ИГРОКА'
 };
 const kindTag={background:'BG',avatar_frame:'FRAME',showcase_skin:'SHOWCASE',title:'TITLE'};
 const safe=(kind,id)=>allowedKinds[kind]?.has(id)?id:null;
 const classes=(profile,override=null)=>{
  const p=profile?.appearance||{};
  const o=override&&allowedKinds[override.kind]?.has(override.id)?
    {...p,[override.kind]:override.id}:p;
  return ['flip-profile-themed',
   o.background?'flip-bg-'+safe('background',o.background):'flip-bg-default',
   o.avatar_frame?'flip-frame-'+safe('avatar_frame',o.avatar_frame):'flip-frame-default',
   o.showcase_skin?'flip-scene-'+safe('showcase_skin',o.showcase_skin):'flip-scene-default'].join(' ');
 };
 function identity({profile,name,handle,avatar,level,xp=0,xpToNext=100,publicMode=false,override=null}){
  const item=override&&override.kind==='title'?override.id:profile?.appearance?.title;
  const title=safe('title',item)?cosmeticNames[item]:null;
  const artist=profile?.favorite_artist?.name||'';
  const progress=Math.min(100,Math.max(0,100*Number(xp||0)/Math.max(1,Number(xpToNext)||100)));
  return '<section class="flip-identity '+esc(classes(profile,override))+'">'+
   '<div class="flip-identity-art" aria-hidden="true"><i></i><i></i><i></i></div>'+
   '<div class="flip-identity-top"><span>FLIP / COLLECTOR</span>'+
   (publicMode?'<span>PLAYER PROFILE</span>':'<span>YOUR IDENTITY</span>')+'</div>'+
   '<div class="flip-identity-row"><div class="flip-identity-avatar">'+avatar+'</div>'+
   '<div class="flip-identity-meta"><strong>'+esc(name||'FLIP PLAYER')+'</strong>'+
   '<small class="flip-identity-handle">'+esc(handle||'')+'</small>'+
   (title?'<span class="flip-identity-title">'+esc(title)+'</span>':'')+
   '<div class="flip-identity-level"><span>LVL '+fmt(level)+'</span>'+
   '<span>'+fmt(profile?.cp)+' CP</span></div></div></div>'+
   (artist?'<div class="flip-identity-favorite"><span>♪</span> '+esc(artist)+'</div>':'')+
   (!publicMode?'<div class="flip-identity-progress"><div style="width:'+progress+
    '%"></div></div><div class="flip-identity-progress-caption"><span>'+
    fmt(xp)+' / '+fmt(xpToNext)+' XP</span><span>СЛЕДУЮЩИЙ УРОВЕНЬ · +30 F</span></div>':'')+
   '</section>';
 }
 function profileSettings(profile,artists,{online=false}={}){
  if(!online)return '';
  const all=Array.isArray(artists)?artists.filter(a=>a.active!==false).slice(0,150):[];
  const favorite=profile?.favorite_artist?.id||'';
  const badges=Array.isArray(profile?.badges)?profile.badges:[];
  const pinned=profile?.pinned_badges||[];
  const select=(slot)=>{
   const value=pinned.find(x=>Number(x.slot)===slot)?.code||'';
   return '<label class="flip-profile-pin-select"><span>ЗНАЧОК '+slot+'</span>'+
     '<select data-profile-pin="'+slot+'"><option value="">НЕ ЗАКРЕПЛЁН</option>'+
     badges.map(b=>'<option value="'+esc(b.code)+'" '+(b.code===value?'selected':'')+'>'+
       esc(b.title)+'</option>').join('')+'</select></label>';
  };
  return '<section class="content-card flip-profile-settings">'+
    '<div class="flip-profile-heading"><h3>МОЙ СТИЛЬ</h3>'+
      '<button type="button" data-profile-open-cosmetics>КОСМЕТИКА ↗</button></div>'+
    '<label class="flip-profile-favorite-select"><span>ЛЮБИМЫЙ АРТИСТ</span>'+
    '<select data-profile-favorite><option value="">НЕ ВЫБРАН</option>'+
    all.map(a=>'<option value="'+esc(a.id)+'" '+(a.id===favorite?'selected':'')+'>'+
      esc(a.name)+'</option>').join('')+'</select></label>'+
    '<div class="flip-profile-pin-grid">'+[1,2,3].map(select).join('')+'</div>'+
    '</section>';
 }
 function featuredBadges(profile){
  const badges=Array.isArray(profile?.pinned_badges)?profile.pinned_badges:[];
  if(!badges.length)return '';
  return '<section class="flip-profile-featured"><div class="flip-profile-heading">'+
   '<h3>ЗНАКИ ОТЛИЧИЯ</h3><span>'+badges.length+' / 3</span></div>'+
   '<div class="flip-profile-featured-grid">'+badges.map(b=>
    '<div class="flip-profile-featured-badge"><b>'+esc(b.symbol||'✦')+'</b>'+
    '<span>'+esc(b.title)+'</span></div>').join('')+'</div></section>';
 }
 function shop({shop,profile,online=false,busy=false,previewId=null}={}){
  const items=(Array.isArray(shop?.items)?shop.items:[]).filter(item=>safe(item.kind,item.id));
  const owned=new Set(Array.isArray(shop?.owned)?shop.owned:[]);
  const equipped=profile?.appearance||{};
  const groups=types.map(type=>{
   const list=items.filter(item=>item.kind===type);
   return '<section class="flip-cosmetic-category"><div class="flip-cosmetic-category-head">'+
    '<h4>'+kinds[type]+'</h4><span>'+list.length+' ПРЕДМЕТА</span></div>'+
    '<div class="flip-cosmetic-grid">'+list.map(item=>{
      const selected=previewId===item.id,has=owned.has(item.id);
      const active=equipped[type]===item.id;
      return '<article class="flip-cosmetic-item '+(selected?'is-previewing ':'')+
       (active?'is-equipped':'')+'"><button type="button" class="flip-cosmetic-preview-btn" '+
        'data-cosmetic-preview="'+esc(item.id)+'" aria-label="Примерить '+esc(item.name)+'">'+
        '<span class="flip-cosmetic-sample flip-sample-'+esc(item.id)+'">'+
        '<span class="flip-cosmetic-sample-mark">F<span>.</span></span></span>'+
        '<span class="flip-cosmetic-name">'+esc(item.name)+'</span>'+
        '<small>'+esc(kindTag[type])+'</small></button>'+
        (active?'<span class="flip-cosmetic-owned is-equipped">ПРИМЕНЕНО ✓</span>':
        has?'<button type="button" class="flip-cosmetic-equip" data-cosmetic-equip="'+
          esc(item.id)+'" '+(busy?'disabled':'')+'>ПРИМЕНИТЬ ↗</button>':
        '<button type="button" class="flip-cosmetic-buy" data-cosmetic-buy="'+
        esc(item.id)+'" '+(!online||busy?'disabled':'')+'>'+fmt(item.price)+' F · КУПИТЬ</button>')+
        '</article>';
   }).join('')+'</div></section>';
  }).join('');
  const trial=items.find(i=>i.id===previewId)||null;
  const balance=shop?.balance??0;
  return '<div class="flip-cosmetic-store">'+
   '<section class="flip-cosmetic-hero '+esc(classes(profile,trial))+'">'+
    '<div class="flip-cosmetic-hero-head"><span>FLIP / IDENTITY</span>'+
    '<span>COLLECT YOUR LOOK</span></div>'+
    '<div class="flip-cosmetic-hero-preview"><span class="flip-cosmetic-preview-avatar">F<span>.</span></span>'+
    '<div><small>ПРИМЕРКА</small><strong>'+esc(trial?.name||'ТВОЙ СТИЛЬ')+'</strong>'+
    '<span>'+fmt(balance)+' F НА БАЛАНСЕ</span></div></div>'+
    '<div class="flip-cosmetic-hero-bottom"><span>12 ОБЪЕКТОВ · 4 КАТЕГОРИИ</span>'+
    (trial?'<button type="button" data-cosmetic-clear-preview>СБРОСИТЬ ПРИМЕРКУ ✕</button>':'')+
    '</div></section>'+
    '<section class="flip-cosmetic-slot-panel"><div class="flip-cosmetic-slot-icon">▦</div>'+
    '<div class="flip-cosmetic-slot-copy"><strong>РАСШИРЬ ВИТРИНУ</strong>'+
    '<small>'+Math.max(3,Number(shop?.slot_count)||3)+' / 6 МЕСТ ОТКРЫТО</small></div>'+
    (Number(shop?.slot_count)<6?'<button data-cosmetic-buy-slot type="button" '+
      (!online||busy?'disabled':'')+'>'+fmt(shop?.next_slot_price)+' F ↗</button>':
      '<span class="flip-cosmetic-slot-max">МАКСИМУМ ✓</span>')+'</section>'+
    groups+'</div>';
 }
 window.FLIPProfileCosmetics={identity,profileSettings,featuredBadges,shop,
  safe,classes,cosmeticNames};
})();
