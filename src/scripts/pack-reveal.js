/* FLIP v0.9.5 — three-card pack reveal.
 * Purely visual. Cards have already been awarded transactionally by the server.
 */
(()=>{
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39'
 }[c]));
 const names={standard:'STANDARD',archive:'ARCHIVE','new-era':'NEW ERA'};
 const rarityNames={common:'COMMON',rare:'RARE',epic:'EPIC',
   legendary:'LEGENDARY',mythic:'MYTHIC',hidden:'HIDDEN'};
 let active=false,timers=[],cards=[];
 let modal,overlay;
 const clear=()=>{for(const id of timers)clearTimeout(id);timers=[]};
 function close(){
  clear();active=false;cards=[];
  if(overlay)overlay.classList.remove('flip-pack-modal-active','show');
  if(modal)modal.classList.remove('flip-pack-presentation');
  if(overlay)overlay.removeAttribute('aria-label');
 }
 function open(received,{type='standard',price=200}={}){
  if(!Array.isArray(received)||received.length!==3||!received.every(Boolean))
    return false;
  overlay=document.getElementById('overlay');
  modal=document.getElementById('modal');
  if(!overlay||!modal)return false;
  if(active)close();
  active=true;cards=received;
  const title=names[type]||names.standard;
  const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches===true;
  modal.classList.add('flip-pack-presentation');
  overlay.classList.add('show','flip-pack-modal-active');
  overlay.setAttribute('aria-label','Открытие '+title+' пака');
  modal.innerHTML='<div class="flip-pack-scene">'+
    '<div class="flip-pack-top"><span>FLIP<span class="flip-pack-dot">.</span></span>'+
      '</div>'+
    
    '<h2>'+esc(title)+'<span>.</span></h2>'+
    
    '<div class="flip-pack-cards">'+cards.map((c,i)=>{
      const rarity=String(c.color||'common').toLowerCase();
      const art=c.art?'<img src="'+esc(c.art)+'" alt="'+esc(c.title)+
        '" decoding="async" draggable="false">':
        '<span class="flip-pack-unknown">FLIP</span>';
      return '<div class="flip-pack-slot '+esc(rarity)+'" data-pack-index="'+i+'">'+
        '<div class="flip-pack-flip">'+
          '<div class="flip-pack-face flip-pack-back">'+
            '<span class="flip-pack-back-mark">FLIP<b>.</b></span>'+
            '<small>COLLECT / TRADE</small><em>0'+(i+1)+'</em>'+
          '</div>'+
          '<div class="flip-pack-face flip-pack-front">'+art+
            '<span class="flip-pack-card-rarity">'+
              esc(rarityNames[rarity]||rarity.toUpperCase())+'</span>'+
          '</div>'+
        '</div></div>';
    }).join('')+'</div>'+
    '<div class="flip-pack-found" aria-live="polite">'+
      '<div class="flip-pack-found-titles">'+
      cards.map(c=>'<span>'+esc(c.title)+'</span>').join('')+'</div></div>'+
    '<div class="flip-pack-bottom"><span>−'+esc(Number(price)||200)+
      ' F · +30 XP</span></div>'+
    '<button type="button" class="flip-pack-action" data-flip-pack-skip>'+
      '<span>ПОКАЗАТЬ ВСЁ</span><span>↗</span></button>'+
    
    '</div>';
  // Pack opening bypasses the regular app renderer, so convert its controls
  // before displaying them instead of letting iOS render the arrow as emoji.
  window.FLIPIcons?.render(modal);
  overlay.scrollTop=0;
  if(reduced)revealAll();
  else [350,850,1350].forEach((delay,i)=>
    timers.push(setTimeout(()=>reveal(i),delay)));
  return true;
 }
 function reveal(i){
  if(!active||!modal)return;
  modal.querySelector('[data-pack-index="'+i+'"]')?.classList.add('is-revealed');
  if(modal.querySelectorAll('.flip-pack-slot.is-revealed').length===cards.length){
    finished();
  }
 }
 function finished(){
  if(!active||!modal)return;
  clear();
  modal.querySelector('.flip-pack-scene')?.classList.add('is-finished');
  const b=modal.querySelector('[data-flip-pack-skip]');
  if(b){
    b.dataset.flipPackSkip='done';
    b.innerHTML='<span>ЗАБРАТЬ КАРТОЧКИ</span><span>↗</span>';
    window.FLIPIcons?.render(b);
    b.focus({preventScroll:true});
  }
 }
 function revealAll(){
  if(!active)return;
  clear();
  for(let i=0;i<cards.length;i++)reveal(i);
  finished();
 }
 document.addEventListener('click',event=>{
  const button=event.target.closest('[data-flip-pack-skip]');
  if(!button||!active)return;
  event.preventDefault();
  event.stopPropagation();
  if(button.dataset.flipPackSkip==='done')close();
  else revealAll();
 });
 window.FLIPPackReveal={open,close,isOpen:()=>active,revealAll};
})();
