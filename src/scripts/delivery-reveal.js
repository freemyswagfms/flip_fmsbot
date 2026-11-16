/* FLIP v0.9.7.1 — live trade receipts and Telegram-safe presentation.
 * Display only: all cards were already transferred atomically in Supabase.
 */
(()=>{
 'use strict';
 const E=v=>String(v??'').replace(/[&<>"']/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
 }[c]));
 const rarityLabels={common:'COMMON',rare:'RARE',epic:'EPIC',
  legendary:'LEGENDARY',mythic:'MYTHIC',hidden:'HIDDEN'};
 const rarityColors={common:'#c4d6c5',rare:'#70baff',epic:'#bb90ff',
  legendary:'#ffd28a',mythic:'#ff617b',hidden:'#c4fff3'};
 const arrow='<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>';
 const cross='<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';
 const cards=new Map();
 const postponed=new Set();
 let root=null,active=null,acknowledge=null,refresh=null;
 let frames=[],index=0,flipped=false,working=false,openedAt=0;
 let showTimer=null,animationTimer=null,closing=false;

 function clearTimer(){
  if(showTimer!==null){clearTimeout(showTimer);showTimer=null;}
  if(animationTimer!==null){clearTimeout(animationTimer);animationTimer=null;}
 }
 function catalogCard(id){
  if(id==='demo/hidden/archive-001')return {
    id,artist:'FLIP // SECRET',title:'ARCHIVE 001',color:'hidden',art:''
  };
  if(typeof id!=='string'||!/^[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9-]+$/i.test(id))
    return null;
  const parts=id.split('/');
  return window.FLIPCatalog?.getCard?.(...parts)||null;
 }
 function normalize(raw){
  if(!raw||!Number.isSafeInteger(raw.id)||raw.id<=0||
    !['admin','trade','gift'].includes(raw.source)||
    !Array.isArray(raw.card_ids)||raw.card_ids.length<1||raw.card_ids.length>5)
    return null;
  if(!raw.card_ids.every(x=>typeof x==='string'&&x.length<=160))return null;
  return {
    id:raw.id,source:raw.source,
    from:typeof raw.from==='string'?raw.from.slice(0,75):'FLIP PLAYER',
    card_ids:raw.card_ids.slice(0,5)
  };
 }
 function safeBusy(){
  if(document.visibilityState==='hidden')return true;
  if(window.FLIPReveal?.isOpen?.()||window.FLIPPackReveal?.isOpen?.())return true;
  if(document.getElementById('overlay')?.classList.contains('show'))return true;
  if(document.querySelector('.flip-card-viewer.is-active, .flip-card-viewer.show'))return true;
  return false;
 }
 function ensureRoot(){
  if(root&&root.isConnected)return root;
  const phone=document.querySelector('.phone');
  if(!phone)return null;
  root=document.createElement('div');
  root.id='flip-card-delivery';
  root.className='flip-delivery-overlay';
  root.setAttribute('role','dialog');
  root.setAttribute('aria-modal','true');
  root.setAttribute('aria-label','Новые карточки FLIP');
  root.hidden=true;
  phone.append(root);
  return root;
 }
 function enqueue(list,{onAcknowledge,onRefresh}={}){
  if(typeof onAcknowledge==='function')acknowledge=onAcknowledge;
  if(typeof onRefresh==='function')refresh=onRefresh;
  if(!Array.isArray(list)||!list.length)return false;
  let added=0;
  for(const raw of list){
    const receipt=normalize(raw);
    if(!receipt||postponed.has(receipt.id)||cards.has(receipt.id))continue;
    cards.set(receipt.id,receipt);added++;
  }
  if(cards.size>0&&!active)schedule();
  return added>0;
 }
 function schedule(){
  if(active||showTimer!==null||cards.size===0)return;
  showTimer=setTimeout(()=>{
    showTimer=null;
    if(active||cards.size===0)return;
    if(safeBusy()||!ensureRoot()){schedule();return;}
    open();
  },450);
 }
 function getFrames(receipts){
  const result=[];
  for(const receipt of receipts){
    for(const id of receipt.card_ids){
      const card=catalogCard(id);
      const rarity=String(card?.color||card?.rarity||'common').toLowerCase();
      result.push({
        id,
        title:card?.title||'НОВАЯ КАРТОЧКА',
        artist:card?.artist||'FLIP COLLECTION',
        art:card?.art||'',
        rarity:Object.hasOwn(rarityLabels,rarity)?rarity:'common',
        source:receipt.source,from:receipt.from
      });
    }
  }
  return result;
 }
 function open(){
  if(active||closing)return false;
  const el=ensureRoot();
  if(!el||!cards.size||safeBusy())return false;
  active=[...cards.values()].slice(0,20);
  frames=getFrames(active);index=0;flipped=false;working=false;
  if(!frames.length){active=null;return false;}
  el.hidden=false;
  el.classList.remove('is-leaving');
  el.classList.add('is-visible');
  el.setAttribute('aria-label','Получено '+frames.length+' новых карточек');
  render();
  openedAt=Date.now();
  try{document.querySelector('.phone .scroll')?.setAttribute('inert','');}catch{}
  return true;
 }
 function textOf(frame){
  return frame.source==='admin'?'ПОДАРОК ОТ АДМИНИСТРАЦИИ':
    frame.source==='gift'?'ПОДАРОК ОТ ИГРОКА':'ПОЛУЧЕНО В ОБМЕНЕ';
 }
 function render(){
  if(!active||!root)return;
  const frame=frames[index],colour=rarityColors[frame.rarity];
  root.style.setProperty('--delivery-accent',colour);
  root.dataset.rarity=frame.rarity;
  const total=frames.length,many=total>1;
  const headline=frame.source==='trade'?'ОБМЕН ЗАВЕРШЁН':'ТЕБЕ ПОДАРИЛИ';
  const art=frame.art?'<img class="flip-delivery-art-image" src="'+E(frame.art)+
    '" alt="'+E(frame.title)+'" draggable="false" decoding="async">':
    '<div class="flip-delivery-art-fallback">FLIP<span>.</span></div>';
  root.innerHTML='<div class="flip-delivery-background" aria-hidden="true">'+
    '<div class="flip-delivery-halo"></div><div class="flip-delivery-orbit one"></div>'+
    '<div class="flip-delivery-orbit two"></div><div class="flip-delivery-noise"></div></div>'+
    '<div class="flip-delivery-inner">'+
    '<header class="flip-delivery-header">'+
    '<button type="button" class="flip-delivery-later" data-delivery-later aria-label="Посмотреть позже">'+cross+'</button></header>'+
    '<main class="flip-delivery-center">'+
    '<p class="flip-delivery-kicker">'+E(textOf(frame))+'</p>'+
    '<h2>'+E(headline)+'<span>.</span></h2>'+
    '<div class="flip-delivery-stage"><div class="flip-delivery-particles" aria-hidden="true">'+
    Array.from({length:12},(_,i)=>'<i style="--i:'+i+'"></i>').join('')+'</div>'+
    '<div class="flip-delivery-card-shell"><div class="flip-delivery-card">'+
    '<div class="flip-delivery-face flip-delivery-back">'+
     '<div class="flip-delivery-back-outline"></div>'+
     '<div class="flip-delivery-back-brand">FLIP<span>.</span></div>'+

    '</div>'+
    '<div class="flip-delivery-face flip-delivery-front">'+art+
     '<span class="flip-delivery-rarity-sticker">'+E(rarityLabels[frame.rarity])+'</span>'+
    '</div></div></div></div>'+
    '<div class="flip-delivery-meta"><span class="flip-delivery-rarity">'+
       E(rarityLabels[frame.rarity])+'</span>'+
     '<h3>'+E(frame.title)+'</h3><p>'+E(frame.artist)+'</p>'+
     (frame.source==='trade'||frame.source==='gift'?
       '<span class="flip-delivery-sender">ОТ ИГРОКА '+E(frame.from)+'</span>':'')+
    '</div></main>'+
    '<footer class="flip-delivery-footer">'+
    (many?'<div class="flip-delivery-progress" aria-label="'+(index+1)+' из '+total+'">'+
      frames.map((_,i)=>'<i class="'+(i===index?'active':i<index?'seen':'')+'"></i>').join('')+
      '</div>':'')+
    '<button type="button" class="flip-delivery-primary" data-delivery-next><span>'+
      'РАСКРЫТЬ КАРТОЧКУ'+'</span>'+arrow+'</button>'+
    (many?'<button type="button" class="flip-delivery-all" data-delivery-all>'+
      'ЗАБРАТЬ ВСЁ ('+total+')</button>':'')+
    '<div class="flip-delivery-loading" role="status" aria-live="polite"></div>'+
    '</footer></div>';
  // The animation is decorative; do not depend on iOS Unicode emoji fonts.
  window.FLIPIcons?.render(root);
  const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches===true;
  const delay=reduced?0:650;
  animationTimer=setTimeout(()=>{
    animationTimer=null;
    reveal();
  },delay);
 }
 function reveal(){
  if(!active||flipped)return;
  flipped=true;
  root.classList.add('is-revealed');
  root.querySelector('.flip-delivery-card-shell')?.classList.add('is-revealed');
  root.querySelector('.flip-delivery-meta')?.classList.add('is-revealed');
  const label=root.querySelector('[data-delivery-next] span');
  if(label)label.textContent=index===frames.length-1?'ЗАБРАТЬ КАРТОЧКИ':'СЛЕДУЮЩАЯ КАРТОЧКА';
 }
 async function finish(){
  if(!active||working)return;
  working=true;
  const button=root.querySelector('[data-delivery-next]');
  const all=root.querySelector('[data-delivery-all]');
  if(button)button.disabled=true;if(all)all.disabled=true;
  const status=root.querySelector('.flip-delivery-loading');
  if(status){status.textContent='';status.classList?.add?.('is-working');}
  const ids=active.map(x=>x.id);
  try{
    if(typeof acknowledge!=='function')throw new Error('OFFLINE');
    await acknowledge(ids);
    for(const id of ids)cards.delete(id);
    close(false);
    try{await refresh?.();}catch{}
    if(cards.size)schedule();
  }catch{
    working=false;
    if(button)button.disabled=false;if(all)all.disabled=false;
    if(status){status.classList?.remove?.('is-working');status.textContent='Не удалось подтвердить. Повтори попытку.';}
  }
 }
 function next(){
  if(!active||working)return;
  if(!flipped){reveal();return;}
  if(index>=frames.length-1){finish();return;}
  if(animationTimer!==null){clearTimeout(animationTimer);animationTimer=null;}
  index++;
  flipped=false;
  root.classList.remove('is-revealed');
  render();
 }
 function close(postpone){
  clearTimer();
  if(!active)return;
  if(postpone)for(const item of active){postponed.add(item.id);cards.delete(item.id);}
  closing=true;
  if(root){
    root.classList.remove('is-visible','is-revealed');
    root.classList.add('is-leaving');
    root.hidden=true;
  }
  document.querySelector('.phone .scroll')?.removeAttribute('inert');
  active=null;frames=[];working=false;flipped=false;
  closing=false;
  if(cards.size)schedule();
 }
 document.addEventListener('click',e=>{
  if(!active)return;
  if(e.target.closest('[data-delivery-later]')){close(true);return;}
  if(e.target.closest('[data-delivery-all]')){finish();return;}
  if(e.target.closest('[data-delivery-next]')){next();return;}
  if(e.target.closest('.flip-delivery-card-shell'))reveal();
 });
 document.addEventListener('keydown',e=>{
  if(!active)return;
  if(e.key==='Escape'){e.preventDefault();close(true);}
 });
 document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible'&&!active&&cards.size)schedule();
 });
 window.FLIPDelivery={enqueue,isOpen:()=>!!active,showPending:schedule,
   dismiss:()=>close(true)};
})();
