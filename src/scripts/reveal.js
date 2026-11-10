/* FLIP v0.5.2 • Longer cinematic drop reveal. Animation ONLY; game state is awarded by app.js. */
(() => {
  'use strict';
  const root = document.querySelector('#dropReveal');
  if (!root) return;
  const defs = {
    common:    {label:'COMMON',ru:'Обычная',hex:'#A7B7AC'},
    rare:      {label:'RARE',ru:'Редкая',hex:'#BFFF56'},
    epic:      {label:'EPIC',ru:'Эпическая',hex:'#BD82FF'},
    legendary: {label:'LEGENDARY',ru:'Легендарная',hex:'#FFD36A'},
    mythic:    {label:'MYTHIC',ru:'Мифическая',hex:'#FF626C'},
    hidden:    {label:'HIDDEN',ru:'Скрытая',hex:'#FAFFFE'}
  };
  const order = ['intro','spin','settle','flip','result'];
  // The full reveal now lasts about 8.9 seconds without skipping.
  // Tune only these durations; the chosen card and reward logic do not change.
  const timings = { intro:800, spin:5500, reel:5300, settle:1200, flip:1400 };
  const target = 13;
  let session = null;
  let timeoutId = null;
  let animationFrame = 0;
  let lockScroll = '';
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const plain = text => String(text ?? '').replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
  function clearTimers(){clearTimeout(timeoutId);cancelAnimationFrame(animationFrame);timeoutId=null;animationFrame=0}
  function schedule(next, ms){clearTimeout(timeoutId);timeoutId=setTimeout(()=>advanceTo(next),ms)}
  function backMarkup(){return `<div class="flip-rb-outer"><div class="flip-rb-inner"><span class="flip-rb-logo">FLIP</span><span class="flip-rb-tag">+ COLLECT /<br>TRADE +</span></div></div>`}
  function tileMarkup(i){return `<div class="flip-roulette-tile${i===target?' is-target':''}" aria-hidden="true"><div class="flip-roulette-card">${backMarkup()}</div></div>`}
  function layout(){
    const r=session;
    const winner=defs[r.rarity];
    const label=plain(r.card.title||'UNKNOWN SIGNAL');
    const artist=plain(r.card.artist||'FLIP DEMO');
    const isPreview=!!r.preview;
    root.innerHTML=`
      <div class="flip-reveal-aura" aria-hidden="true"></div>
      <div class="flip-reveal-head"><span class="flip-reveal-logo">FLIP<span>.</span></span><span class="flip-reveal-headnote">${isPreview?'PREVIEW':'FREE DROP'} <span class="flip-reveal-dot"></span> DEMO</span></div>
      <div class="flip-reveal-content">
        <div class="flip-reveal-eyebrow">${isPreview?'ANIMATION / PREVIEW':'DROP / REVEAL'}</div>
        <h2 class="flip-reveal-title" id="flipRevealTitle">ТВОЙ ДРОП<span>.</span></h2>
        <p class="flip-reveal-subtitle" id="flipRevealSubtitle">Что скрывается за карточкой?</p>
        <div class="flip-roulette-wrap" id="flipRouletteWrap" aria-hidden="true">
          <div class="flip-roulette-pip"></div>
          <div class="flip-roulette-window" id="flipRouletteWindow"><div class="flip-roulette-track" id="flipRouletteTrack">${Array.from({length:17},(_,i)=>tileMarkup(i)).join('')}</div></div>
          <div class="flip-roulette-baseline"></div>
        </div>
        <div class="flip-face-wrap" id="flipFaceWrap" aria-hidden="true">
          <div class="flip-face-card" id="flipFaceCard">
            <div class="flip-face flip-face-back">${backMarkup()}</div>
            <div class="flip-face flip-face-front">
              <div class="flip-face-art flip-art-${r.rarity}">
                <div class="flip-art-noise"></div><div class="flip-art-orbit orbit-one"></div><div class="flip-art-orbit orbit-two"></div>
                <div class="flip-art-emblem">${r.rarity==='hidden'?'?':'✳'}</div>
                <div class="flip-art-artist">${artist}</div>
                <div class="flip-art-title">${label}</div>
                <div class="flip-art-foot">FLIP / DEMO ARTWORK</div>
              </div>
            </div>
          </div>
        </div>
        <div class="flip-reveal-outcome" id="flipRevealOutcome" aria-live="polite">
          <span class="flip-rarity-chip">${winner.label} <span class="flip-rarity-dot"></span></span>
          <h3>${label}</h3>
          <p>${artist}</p>
          <span class="flip-reveal-added">${isPreview?'ДЕМО · БЕЗ НАГРАДЫ':'✓ ДОБАВЛЕНО В КОЛЛЕКЦИЮ'}</span>
          <button type="button" class="flip-reveal-continue" id="flipRevealContinue">ПРОДОЛЖИТЬ <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 19 19 5M8 5h11v11"/></svg></button>
        </div>
      </div>
      <div class="flip-reveal-bottom"><span id="flipRevealHint">НАЖМИ, ЧТОБЫ ПРОПУСТИТЬ <span class="flip-hint-symbol">›</span></span></div>
    `;
    window.FLIPIcons?.render(root); // avoid native iOS emoji for decorative glyphs
  }
  function setPosition(toEnd, immediate=true){
    const track=root.querySelector('#flipRouletteTrack');
    const win=root.querySelector('#flipRouletteWindow');
    const t=track?.querySelector('.flip-roulette-tile');
    if(!track||!t||!win)return;
    const tileWidth=t.getBoundingClientRect().width;
    const gap=parseFloat(getComputedStyle(track).gap)||0;
    const index=toEnd?target:1;
    const offset=(win.clientWidth-tileWidth)/2-index*(tileWidth+gap);
    if(immediate){track.style.transition='none';track.style.transform=`translate3d(${offset}px,0,0)`;void track.offsetHeight}
    else {track.style.transition=`transform ${timings.reel}ms cubic-bezier(.13,.72,.14,1)`;track.style.transform=`translate3d(${offset}px,0,0)`}
  }
  function advanceTo(phase){
    if(!session) return;
    clearTimers();
    session.phase=phase;
    root.dataset.phase=phase;
    const title=root.querySelector('#flipRevealTitle');
    const subtitle=root.querySelector('#flipRevealSubtitle');
    const hint=root.querySelector('#flipRevealHint');
    const face=root.querySelector('#flipFaceCard');
    const outcome=root.querySelector('#flipRevealOutcome');
    const continueBtn=root.querySelector('#flipRevealContinue');
    if(outcome)outcome.setAttribute('aria-hidden',String(phase!=='result'));
    if(continueBtn)continueBtn.disabled=phase!=='result';
    if(phase==='intro'){
      title.innerHTML=session.preview?'ТЕСТ РУЛЕТКИ<span>.</span>':'ТВОЙ ДРОП<span>.</span>';
      subtitle.textContent=session.preview?'Просмотр анимации без изменения коллекции.':'Что скрывается за карточкой?';
      setPosition(false);
      schedule('spin', reducedMotion?100:timings.intro);
    }else if(phase==='spin'){
      title.innerHTML='ПОЙМАЙ МОМЕНТ<span>.</span>';
      subtitle.textContent='Карточка уже выбрана. Раскрываем результат.';
      setPosition(false);
      animationFrame=requestAnimationFrame(()=>{
        animationFrame=requestAnimationFrame(()=>{
          if(session?.phase==='spin')setPosition(true,false);
        });
      });
      schedule('settle',reducedMotion?120:timings.spin);
    }else if(phase==='settle'){
      setPosition(true);
      title.innerHTML='ЭТО ОНА<span>.</span>';
      subtitle.textContent='Редкость найдена';
      schedule('flip',reducedMotion?120:timings.settle);
    }else if(phase==='flip'){
      title.innerHTML='РАСКРЫВАЕМ<span>.</span>';
      subtitle.textContent='';
      if(face){face.classList.remove('is-flipped','is-instant');void face.offsetHeight;}
      animationFrame=requestAnimationFrame(()=>{
        animationFrame=requestAnimationFrame(()=>{
          if(session?.phase==='flip')face?.classList.add('is-flipped');
        });
      });
      schedule('result',reducedMotion?80:timings.flip);
    }else if(phase==='result'){
      title.innerHTML=session.preview?'РЕЗУЛЬТАТ ДЕМО<span>.</span>':'ТВОЯ КАРТОЧКА<span>.</span>';
      subtitle.textContent='';
      if(face){face.classList.add('is-instant','is-flipped')}
      hint.textContent='НАЖМИ, ЧТОБЫ ЗАКРЫТЬ';
      try{root.querySelector('#flipRevealContinue')?.focus({preventScroll:true})}catch{}
    }
  }
  function open(card,options={}){
    if(session) return;
    const rarity=String(card?.rarity||'common').toLowerCase();
    session={card:{...card},rarity:defs[rarity]?rarity:'common',phase:'intro',preview:options.preview===true};
    root.style.setProperty('--flip-rarity',defs[session.rarity].hex);
    root.dataset.rarity=session.rarity;
    root.setAttribute('aria-hidden','false');
    root.removeAttribute('inert');
    root.classList.add('is-active');
    // Keep the scroll position on the underlying home page while the reveal is open.
    lockScroll=document.querySelector('.phone .scroll')?.style.overflow||'';
    const scroll=document.querySelector('.phone .scroll');
    if(scroll)scroll.style.overflow='hidden';
    layout();
    advanceTo('intro');
    if(reducedMotion)advanceTo('result');
  }
  function close(){
    if(!session)return;
    clearTimers();
    session=null;
    root.classList.remove('is-active');
    root.dataset.phase='';
    root.setAttribute('aria-hidden','true');
    root.setAttribute('inert','');
    const scroll=document.querySelector('.phone .scroll');if(scroll)scroll.style.overflow=lockScroll;
    root.innerHTML='';
    try{document.querySelector('.phone .topbar .brand')?.focus?.({preventScroll:true})}catch{}
  }
  function skip(){
    if(!session)return;
    const i=order.indexOf(session.phase);
    if(i===-1)return;
    if(i===order.length-1)close();else advanceTo(order[i+1]);
  }
  root.addEventListener('click',event=>{
    if(event.target.closest('#flipRevealContinue')){event.stopPropagation();close();return}
    skip();
  });
  document.addEventListener('keydown',event=>{
    if(!session)return;
    if(event.key==='Escape'){event.preventDefault();if(session.phase==='result')close();else advanceTo('result')}
    else if(event.key==='Enter'||event.key===' '){if(event.target.closest('#flipRevealContinue'))return;event.preventDefault();skip()}
  });
  window.addEventListener('resize',()=>{if(session&&['intro','spin','settle'].includes(session.phase)){setPosition(session.phase==='settle')}});
  window.FLIPReveal={open,close,skip,isOpen:()=>!!session};
})();
