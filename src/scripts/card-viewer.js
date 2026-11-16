/* FLIP v0.8.9 — touch-first card gallery, prismatic Mythic, spectral Hidden.
   Presentation only: this module never writes to inventory, CP, XP or the server. */
(() => {
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const rarities=Object.freeze({
    common:{label:'COMMON',color:'#b4bdb8',angle:5},
    rare:{label:'RARE',color:'#baff6d',angle:6},
    epic:{label:'EPIC',color:'#b798ff',angle:7},
    legendary:{label:'LEGENDARY',color:'#f8c86a',angle:8},
    mythic:{label:'MYTHIC',color:'#ff626c',angle:9},
    hidden:{label:'HIDDEN',color:'#dbe4ff',angle:9}
  });

  let dialog=null,lastFocused=null,activePointer=null,closingTimer=null;
  let activeIndex=0,playlist=[],mode='owned',lockedSiblings=[],gestureStart=null;
  const reducedMotion=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches||false;

  function lockBackground(phone,viewer){
    lockedSiblings=Array.from(phone.children||[])
      .filter(el=>el!==viewer).map(el=>({element:el,inert:!!el.inert}));
    for(const entry of lockedSiblings)entry.element.inert=true;
    document.documentElement?.classList?.add('flip-viewer-active');
    try{window.FLIPViewport?.setViewerInteraction?.(true);}catch(_){}
  }
  function unlockBackground(){
    for(const entry of lockedSiblings)entry.element.inert=entry.inert;
    lockedSiblings=[];
    document.documentElement?.classList?.remove('flip-viewer-active');
    try{window.FLIPViewport?.setViewerInteraction?.(false);}catch(_){}
  }
  function key(card){
    return typeof card?.id==='string'&&card.id?card.id:
      String(card?.artist||'')+'|'+String(card?.title||'')+'|'+String(card?.rarity||card?.color||'');
  }
  function normalizeCards(card,options){
    const list=Array.isArray(options.cards)?options.cards:[];
    const output=[],seen=new Set();
    for(const item of list){
      if(!item||typeof item!=='object')continue;
      const id=key(item);
      if(!id||seen.has(id))continue;
      seen.add(id);output.push(item);
      if(output.length>=500)break;
    }
    const id=key(card);
    if(!seen.has(id))output.unshift(card);
    return output.length?output:[card];
  }
  function artMarkup(card,rarity,look){
    const title=String(card.title||'Неизвестный релиз');
    const artist=String(card.artist||'FLIP');
    const src=card.art;
    const safeLocal=typeof src==='string'&&
      /^\.\/src\/assets\/[a-zA-Z0-9/_-]+\.webp(?:\?[a-zA-Z0-9=&_-]+)?$/.test(src);
    const safePublished=typeof src==='string'&&
      /^https:\/\/sodhvekjhlmbhnrkmkzb\.supabase\.co\/storage\/v1\/object\/public\/flip-artwork\/[a-zA-Z0-9/_-]+\.webp$/.test(src);
    const art=(safeLocal||safePublished)?
      '<img class="flip-viewer-image" draggable="false" src="'+esc(src)+
        '" alt="'+esc(artist+' — '+title+', '+look.label)+'">' :
      '<div class="flip-viewer-placeholder" aria-label="Изображение отсутствует">FLIP<span>?</span></div>';
    const optics=rarity==='mythic'?
      '<div class="flip-viewer-foil" aria-hidden="true"></div>'+
      '<div class="flip-viewer-foil-sheen" aria-hidden="true"></div>':
      rarity==='hidden'?
      '<div class="flip-viewer-anomaly" aria-hidden="true"></div>'+
      '<div class="flip-viewer-anomaly-lines" aria-hidden="true"></div>':'';
    return '<div class="flip-viewer-artwork">'+art+
      '<div class="flip-viewer-wave" aria-hidden="true"></div>'+
      optics+'<div class="flip-viewer-border" aria-hidden="true"></div></div>';
  }
  function renderSlide(direction=0){
    if(!dialog)return;
    const card=playlist[activeIndex];
    const rarity=String(card.color||card.rarity||'common').toLowerCase();
    const look=rarities[rarity]||rarities.common;
    const title=String(card.title||'Неизвестный релиз');
    const artist=String(card.artist||'FLIP');
    const style=String(card.style||'');
    const count=Number(card.count||0);
    const tests=Number(card.testCount||0);
    const label=mode==='catalog'?'ПРЕДПРОСМОТР':
      mode==='history'?'ИСТОРИЯ НАХОДОК':'ТВОЯ КОЛЛЕКЦИЯ';
    const hasPrevious=activeIndex>0,hasNext=activeIndex<playlist.length-1;
    dialog.dataset.rarity=rarity;
    dialog.style.setProperty('--flip-viewer-accent',look.color);
    dialog.setAttribute('aria-label','Просмотр карточки '+title+
      (playlist.length>1?', '+(activeIndex+1)+' из '+playlist.length:''));
    dialog.innerHTML=
      '<div class="flip-viewer-backdrop" data-flip-viewer-dismiss></div>'+
      '<div class="flip-viewer-content"><header class="flip-viewer-header">'+
      '<button type="button" class="flip-viewer-close" data-flip-viewer-dismiss aria-label="Закрыть просмотр">'+
      '<span aria-hidden="true">×</span></button></header>'+
      '<div class="flip-viewer-workspace" data-flip-viewer-workspace>'+
      (playlist.length>1?'<button type="button" class="flip-viewer-step flip-viewer-prev" data-flip-viewer-prev '+
        (hasPrevious?'':'disabled ')+'aria-label="Предыдущая карточка">‹</button>':'')+
      '<div class="flip-viewer-perspective"><div class="flip-viewer-tilt" data-flip-tilt>'+
      artMarkup(card,rarity,look)+'</div></div>'+
      (playlist.length>1?'<button type="button" class="flip-viewer-step flip-viewer-next" data-flip-viewer-next '+
        (hasNext?'':'disabled ')+'aria-label="Следующая карточка">›</button>':'')+
      '</div>'+
      '<div class="flip-viewer-foot">'+
      '<div class="flip-viewer-edition"><span>'+esc(label)+'</span><b>'+
      esc(look.label)+'</b></div>'+
      '<h2>'+esc(title)+'</h2><p class="flip-viewer-artist">'+esc(artist)+
      (style?' · '+esc(style):'')+'</p>'+
      '<div class="flip-viewer-facts"><div><small>РЕДКОСТЬ</small><strong>'+
      esc(look.label)+'</strong></div><div><small>'+esc(mode==='catalog'?'СТАТУС':'В КОЛЛЕКЦИИ')+
      '</small><strong>'+esc(mode==='catalog'?'ПРЕВЬЮ':count>0?'×'+count:'НЕТ КОПИЙ')+
      '</strong></div></div>'+
      
      (playlist.length>1?'<div class="flip-viewer-pagination" aria-live="polite">'+
        '<span>'+String(activeIndex+1).padStart(2,'0')+' / '+String(playlist.length).padStart(2,'0')+'</span>'+
        '</div>':'')+
      '</div></div>';
    dialog.classList.remove('flip-viewer-slide-prev','flip-viewer-slide-next');
    if(direction&& !reducedMotion()) {
      // Small kinetic entrance. Avoid replaying the entire backdrop animation.
      dialog.classList.add(direction>0?'flip-viewer-slide-next':'flip-viewer-slide-prev');
    }
    bindTilt(dialog.querySelector('[data-flip-tilt]'));
  }
  function reset(){
    if(!dialog)return;
    const tilt=dialog.querySelector('[data-flip-tilt]');
    if(!tilt)return;
    tilt.classList.remove('is-active');
    tilt.style.setProperty('--flip-rotate-x','0deg');
    tilt.style.setProperty('--flip-rotate-y','0deg');
    tilt.style.setProperty('--flip-wave-x','0%');
    tilt.style.setProperty('--flip-wave-y','0%');
    tilt.style.setProperty('--flip-foil-x','50%');
    tilt.style.setProperty('--flip-foil-y','50%');
    tilt.style.setProperty('--flip-anomaly-x','0%');
    tilt.style.setProperty('--flip-anomaly-y','0%');
    activePointer=null;
    gestureStart=null;
  }
  function changeTilt(event){
    if(!dialog||reducedMotion())return;
    // Native mousemove does not expose pointerType: use it for stable desktop hover.
    const mouse=event.type==='mousemove'||event.pointerType==='mouse';
    if(!mouse&&activePointer!==event.pointerId)return;
    const tilt=dialog.querySelector('[data-flip-tilt]');
    if(!tilt)return;
    // Measure the stationary perspective plane, not the already-tilted child.
    const bounds=(tilt.parentElement||tilt).getBoundingClientRect();
    if(!bounds.width||!bounds.height)return;
    const x=clamp((event.clientX-bounds.left)/bounds.width,0,1);
    const y=clamp((event.clientY-bounds.top)/bounds.height,0,1);
    const rarity=dialog.dataset.rarity;
    const angle=rarities[rarity]?.angle||5;
    tilt.style.setProperty('--flip-rotate-x',((.5-y)*angle*2).toFixed(2)+'deg');
    tilt.style.setProperty('--flip-rotate-y',((x-.5)*angle*2).toFixed(2)+'deg');
    tilt.style.setProperty('--flip-wave-x',((x-.5)*56).toFixed(1)+'%');
    tilt.style.setProperty('--flip-wave-y',((y-.5)*16).toFixed(1)+'%');
    if(rarity==='mythic'){
      tilt.style.setProperty('--flip-foil-x',Math.round(x*100)+'%');
      tilt.style.setProperty('--flip-foil-y',Math.round(y*100)+'%');
    }else if(rarity==='hidden'){
      tilt.style.setProperty('--flip-anomaly-x',((x-.5)*28).toFixed(1)+'%');
      tilt.style.setProperty('--flip-anomaly-y',((y-.5)*15).toFixed(1)+'%');
    }
  }
  function navigate(step){
    if(!dialog||!Number.isInteger(step))return false;
    const next=activeIndex+step;
    if(next<0||next>=playlist.length)return false;
    reset();
    activeIndex=next;
    renderSlide(step);
    // Stay inside the same modal; background remains inert and native
    // Telegram vertical swipes remain disabled until close.
    dialog.querySelector(step>0?'[data-flip-viewer-next]':'[data-flip-viewer-prev]')?.focus({preventScroll:true});
    return true;
  }
  function pointerdown(event){
    if(event.button!==0||reducedMotion())return;
    const tilt=event.target.closest('[data-flip-tilt]');
    if(!tilt)return;
    if(event.pointerType==='mouse'){
      // Desktop tilt is driven by hover. Never capture the mouse or drag the image.
      event.preventDefault();
      changeTilt(event);
      return;
    }
    activePointer=event.pointerId;
    gestureStart={x:event.clientX,y:event.clientY,id:event.pointerId};
    tilt.classList.add('is-active');
    if(tilt.setPointerCapture)tilt.setPointerCapture(event.pointerId);
    changeTilt(event);
  }
  function pointerup(event){
    if(activePointer!==event.pointerId)return;
    const dx=event.clientX-gestureStart?.x;
    const dy=event.clientY-gestureStart?.y;
    const swipe=playlist.length>1&&Number.isFinite(dx)&&Number.isFinite(dy)&&
      Math.abs(dx)>=105&&Math.abs(dx)>Math.abs(dy)*1.5;
    reset();
    if(swipe)navigate(dx<0?1:-1);
  }
  function bindTilt(tilt){
    if(!tilt)return;
    tilt.addEventListener('pointerdown',pointerdown);
    tilt.addEventListener('dragstart',event=>event.preventDefault());
    tilt.addEventListener('selectstart',event=>event.preventDefault());
    // Desktop mouse input is tracked on the NON-ROTATING perspective wrapper.
    // Tracking the rotated card itself causes pointerleave/re-entry jitter.
    const area=tilt.parentElement||tilt;
    area.addEventListener('mousemove',event=>{
      if(activePointer!==null||reducedMotion())return;
      const bounds=area.getBoundingClientRect();
      // Older webviews and test shims can omit right/bottom.
      const xMax=bounds.right??bounds.left+bounds.width;
      const yMax=bounds.bottom??bounds.top+bounds.height;
      if(event.clientX<bounds.left||event.clientX>xMax||
         event.clientY<bounds.top||event.clientY>yMax){reset();return;}
      tilt.classList.add('is-active');
      changeTilt(event);
    });
    area.addEventListener('mouseleave',()=>{
      if(activePointer===null)reset();
    });
    // Touch and pen keep the original pointer-capture/swipe behavior.
    tilt.addEventListener('pointermove',event=>{
      if(event.pointerType!=='mouse'&&activePointer===event.pointerId)changeTilt(event);
    });
    tilt.addEventListener('pointerup',pointerup);
    tilt.addEventListener('pointercancel',pointerup);
    tilt.addEventListener('lostpointercapture',pointerup);
  }
  function keydown(event){
    if(!dialog)return;
    if(event.key==='Escape'){
      event.preventDefault();event.stopPropagation();close();return;
    }
    if(event.key==='ArrowRight'||event.key==='ArrowLeft'){
      event.preventDefault();event.stopPropagation();navigate(event.key==='ArrowRight'?1:-1);return;
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
    dialog=null;playlist=[];activeIndex=0;
    old.closest('.phone')?.classList.remove('flip-viewer-open');
    unlockBackground();
    document.removeEventListener('keydown',keydown,true);
    if(closingTimer)clearTimeout(closingTimer);
    const done=()=>{old.remove();closingTimer=null};
    if(immediate||reducedMotion())done();
    else{old.classList.add('is-closing');closingTimer=setTimeout(done,220);}
    const target=lastFocused;lastFocused=null;
    if(target?.isConnected&&typeof target.focus==='function')target.focus({preventScroll:true});
  }
  function open(card,options={}){
    if(!card||typeof card!=='object')return false;
    const phone=document.querySelector('.phone');
    if(!phone)return false;
    if(dialog)close(true);
    phone.querySelectorAll('.flip-viewer').forEach(el=>el.remove());
    mode=options.mode||'owned';
    playlist=normalizeCards(card,options);
    activeIndex=Math.max(0,playlist.findIndex(item=>key(item)===key(card)));
    // Preserve explicit details supplied by older callers without mutating the
    // inventory objects used by collection/leaderboard calculations.
    if(options.count!==undefined||options.testCount!==undefined){
      const selected=playlist[activeIndex];
      playlist[activeIndex]={...selected,
        count:options.count??selected.count,
        testCount:options.testCount??selected.testCount};
    }
    lastFocused=document.activeElement;
    const node=document.createElement('div');
    node.className='flip-viewer';
    node.setAttribute('role','dialog');node.setAttribute('aria-modal','true');
    node.setAttribute('tabindex','-1');
    phone.appendChild(node);
    dialog=node;
    phone.classList.add('flip-viewer-open');
    lockBackground(phone,node);
    renderSlide();
    node.addEventListener('click',event=>{
      if(event.target.closest('[data-flip-viewer-dismiss]')){close();return;}
      if(event.target.closest('[data-flip-viewer-prev]')){navigate(-1);return;}
      if(event.target.closest('[data-flip-viewer-next]')){navigate(1);return;}
    });
    node.addEventListener('dragstart',event=>event.preventDefault());
    node.addEventListener('touchmove',event=>{
      if(event.target.closest('[data-flip-viewer-workspace]')&&event.cancelable)event.preventDefault();
    },{passive:false});
    document.addEventListener('keydown',keydown,true);
    node.querySelector('.flip-viewer-close')?.focus({preventScroll:true});
    return true;
  }
  window.FLIPCardViewer={
    open,close,navigate,isOpen:()=>!!dialog,
    current:()=>dialog?{id:key(playlist[activeIndex]),index:activeIndex,total:playlist.length,rarity:dialog.dataset.rarity}:null,
    rarities
  };
})();
