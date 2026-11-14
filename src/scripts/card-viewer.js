/* FLIP v0.8.7 — immersive square artwork viewer with constrained pointer tilt.
   Visual-only component: never reads, writes or modifies inventory/CP/XP. */
(() => {
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&quot;',"'":'&#39;'
  }[ch]));
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const rarities=Object.freeze({
    common:{label:'COMMON',color:'#b4bdb8',angle:5},
    rare:{label:'RARE',color:'#baff6d',angle:6},
    epic:{label:'EPIC',color:'#b798ff',angle:7},
    legendary:{label:'LEGENDARY',color:'#f8c86a',angle:8},
    mythic:{label:'MYTHIC',color:'#ff818f',angle:9},
    hidden:{label:'HIDDEN',color:'#e2e9e3',angle:9}
  });
  let dialog=null,lastFocused=null,activePointer=null,closingTimer=null;
  const reducedMotion=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches||false;
  function reset(){
    if(!dialog)return;
    const tilt=dialog.querySelector('[data-flip-tilt]');
    if(!tilt)return;
    tilt.classList.remove('is-active');
    tilt.style.setProperty('--flip-rotate-x','0deg');
    tilt.style.setProperty('--flip-rotate-y','0deg');
    tilt.style.setProperty('--flip-shine-x','50%');
    tilt.style.setProperty('--flip-shine-y','50%');
    activePointer=null;
  }
  function changeTilt(event){
    if(!dialog||reducedMotion())return;
    if(event.pointerType!=='mouse' && activePointer!==event.pointerId)return;
    const tilt=dialog.querySelector('[data-flip-tilt]');
    if(!tilt)return;
    const bounds=tilt.getBoundingClientRect();
    if(!bounds.width||!bounds.height)return;
    const x=clamp((event.clientX-bounds.left)/bounds.width,0,1);
    const y=clamp((event.clientY-bounds.top)/bounds.height,0,1);
    const rarity=String(dialog.dataset.rarity||'common').toLowerCase();
    const max=rarities[rarity]?.angle||5;
    tilt.style.setProperty('--flip-rotate-x',((.5-y)*max*2).toFixed(2)+'deg');
    tilt.style.setProperty('--flip-rotate-y',((x-.5)*max*2).toFixed(2)+'deg');
    tilt.style.setProperty('--flip-shine-x',Math.round(x*100)+'%');
    tilt.style.setProperty('--flip-shine-y',Math.round(y*100)+'%');
  }
  function pointerdown(event){
    if(event.button!==0||reducedMotion())return;
    const tilt=event.target.closest('[data-flip-tilt]');
    if(!tilt)return;
    activePointer=event.pointerId;
    tilt.classList.add('is-active');
    if(tilt.setPointerCapture)tilt.setPointerCapture(event.pointerId);
    changeTilt(event);
  }
  function pointerup(event){
    if(activePointer===event.pointerId)reset();
  }
  function keydown(event){
    if(!dialog)return;
    if(event.key==='Escape'){
      event.preventDefault();event.stopPropagation();close();return;
    }
    if(event.key==='Tab'){
      const controls=[...dialog.querySelectorAll('button:not([disabled])')];
      if(controls.length===0){event.preventDefault();dialog.focus();return;}
      const first=controls[0],last=controls[controls.length-1];
      if(event.shiftKey&&(document.activeElement===first||!dialog.contains(document.activeElement))){
        event.preventDefault();last.focus();
      }else if(!event.shiftKey&&(document.activeElement===last||!dialog.contains(document.activeElement))){
        event.preventDefault();first.focus();
      }
    }
  }
  function close(immediate=false){
    if(!dialog)return;
    const old=dialog;
    reset();
    dialog=null;
    const phone=old.closest('.phone');
    phone?.classList.remove('flip-viewer-open');
    document.removeEventListener('keydown',keydown,true);
    if(closingTimer)clearTimeout(closingTimer);
    const done=()=>{old.remove();closingTimer=null};
    if(immediate||reducedMotion())done();
    else{old.classList.add('is-closing');closingTimer=setTimeout(done,220);}
    const target=lastFocused;lastFocused=null;
    if(target?.isConnected && typeof target.focus==='function')target.focus({preventScroll:true});
  }
  function open(card,options={}){
    if(!card||typeof card!=='object')return false;
    const phone=document.querySelector('.phone');
    if(!phone)return false;
    if(dialog)close(true);
    // remove a fading previous dialog if a different card opens before the close animation ends
    phone.querySelectorAll('.flip-viewer').forEach(el=>el.remove());
    const rarity=String(card.color||card.rarity||'common').toLowerCase();
    const look=rarities[rarity]||rarities.common;
    const title=String(card.title||'Неизвестный релиз');
    const artist=String(card.artist||'FLIP');
    const style=String(card.style||'');
    const owned=Number(options.count ?? card.count ?? 0);
    const tests=Number(options.testCount ?? card.testCount ?? 0);
    const mode=options.mode||'owned';
    const subtitle=mode==='catalog'?'КАТАЛОГ · ПРЕДПРОСМОТР':
      mode==='history'?'ИСТОРИЯ НАХОДОК':'ТВОЯ КОЛЛЕКЦИЯ';
    lastFocused=document.activeElement;
    const art=typeof card.art==='string' && card.art.startsWith('./src/assets/') ?
      '<img class="flip-viewer-image" draggable="false" src="'+esc(card.art)+
      '" alt="'+esc(artist+' — '+title+', '+look.label)+'">' :
      '<div class="flip-viewer-placeholder" aria-label="Изображение отсутствует">FLIP<span>?</span></div>';
    const node=document.createElement('div');
    node.className='flip-viewer';
    node.setAttribute('role','dialog');node.setAttribute('aria-modal','true');
    node.setAttribute('aria-label','Просмотр карточки '+title);
    node.setAttribute('tabindex','-1');
    node.dataset.rarity=rarity;
    node.style.setProperty('--flip-viewer-accent',look.color);
    node.innerHTML='<div class="flip-viewer-backdrop" data-flip-viewer-dismiss></div>'+
      '<div class="flip-viewer-content"><header class="flip-viewer-header">'+
      '<div class="flip-viewer-kicker"><span class="flip-viewer-kicker-dot"></span>'+
      '<span>FLIP / CARD INSPECT</span></div>'+
      '<button type="button" class="flip-viewer-close" data-flip-viewer-dismiss aria-label="Закрыть просмотр">'+
      '<span aria-hidden="true">×</span></button></header>'+
      '<div class="flip-viewer-workspace"><div class="flip-viewer-perspective">'+
      '<div class="flip-viewer-tilt" data-flip-tilt>'+
      '<div class="flip-viewer-artwork">'+art+
      '<div class="flip-viewer-glare" aria-hidden="true"></div>'+
      '<div class="flip-viewer-border" aria-hidden="true"></div></div>'+
      '</div></div></div>'+
      '<div class="flip-viewer-foot"><div class="flip-viewer-edition"><span>'+
      esc(subtitle)+'</span><b>'+esc(look.label)+'</b></div>'+
      '<h2>'+esc(title)+'</h2><p class="flip-viewer-artist">'+esc(artist)+
      (style?' · '+esc(style):'')+'</p>'+
      '<div class="flip-viewer-facts"><div><small>РЕДКОСТЬ</small><strong>'+
      esc(look.label)+'</strong></div><div><small>'+esc(mode==='catalog'?'СТАТУС':'В КОЛЛЕКЦИИ')+
      '</small><strong>'+esc(mode==='catalog'?'ПРЕВЬЮ':owned>0?'×'+owned:'НЕТ КОПИЙ')+
      '</strong></div></div>'+
      (tests>0&&mode!=='catalog'?'<p class="flip-viewer-test">Из них тестовых копий: '+esc(tests)+'</p>':'')+
      '<p class="flip-viewer-hint">Проведи пальцем по обложке, чтобы слегка повернуть её</p>'+
      '</div></div>';
    phone.appendChild(node);
    dialog=node;
    phone.classList.add('flip-viewer-open');
    node.addEventListener('click',event=>{
      if(event.target.closest('[data-flip-viewer-dismiss]'))close();
    });
    const tilt=node.querySelector('[data-flip-tilt]');
    tilt.addEventListener('pointerdown',pointerdown);
    tilt.addEventListener('pointermove',event=>{
      if(activePointer===event.pointerId||event.pointerType==='mouse')changeTilt(event);
    });
    tilt.addEventListener('pointerup',pointerup);
    tilt.addEventListener('pointercancel',pointerup);
    tilt.addEventListener('lostpointercapture',pointerup);
    tilt.addEventListener('pointerleave',event=>{
      if(event.pointerType==='mouse'&&activePointer===null)reset();
    });
    document.addEventListener('keydown',keydown,true);
    node.querySelector('.flip-viewer-close')?.focus({preventScroll:true});
    return true;
  }
  window.FLIPCardViewer={open,close,isOpen:()=>!!dialog,rarities};
})();
