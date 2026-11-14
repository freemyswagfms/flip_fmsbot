/* FLIP v0.7 — Telegram viewport, mobile fullscreen and native safe areas. */
(() => {
  'use strict';
  const root = document.documentElement;
  const tg = window.Telegram?.WebApp;
  const isTelegram = !!(tg && ((tg.platform && tg.platform !== 'unknown') || tg.initData));
  const platform = String(tg?.platform || '').toLowerCase();
  const mobileClient = ['ios','android','android_x'].includes(platform);
  const isIOS = platform === 'ios';
  const clamp = value => Math.max(0, Math.min(180, Number(value) || 0));
  const isNewTelegram = !!(tg?.isVersionAtLeast?.('8.0'));
  let requestedFullscreen=false;

  function applySafeArea() {
    if (!isTelegram) return;
    const safe=tg.safeAreaInset || {};
    const content=tg.contentSafeAreaInset || {};
    const full=!!tg.isFullscreen;
    // A collapsed/expanded BottomSheet already has its own native header above
    // the WebView. Using a constant 88px here produced the large blank gap.
    // In true fullscreen, Telegram controls float OVER the WebView: use the
    // API safe-area insets (screen notch + Telegram's own content inset).
    const reportedTop=clamp(safe.top)+clamp(content.top);
    const top=full ? Math.max(12, reportedTop || (isIOS?88:56)) : Math.max(12,reportedTop);
    const bottom=Math.max(clamp(safe.bottom), clamp(content.bottom));
    root.style.setProperty('--flip-top-space', `${Math.min(200,top)}px`);
    root.style.setProperty('--flip-bottom-space', `${bottom}px`);
    root.classList.add('flip-in-telegram');
    root.classList.toggle('flip-telegram-ios', isIOS);
    root.classList.toggle('flip-telegram-fullscreen', full);
  }

  if (isTelegram) {
    try{tg.ready()}catch(_){}
    // Expanding is supported on all clients and has no effect on desktop.
    try{tg.expand()}catch(_){}
    try{tg.setHeaderColor('#090c0a');tg.setBackgroundColor('#090c0a')}catch(_){}
    applySafeArea();

    // True fullscreen is a mobile enhancement; do not ask desktop Telegram to
    // change its own window, and gracefully keep a normal expanded BottomSheet
    // if the client does not support this capability or refuses the request.
    if(mobileClient && isNewTelegram && typeof tg.requestFullscreen === 'function') {
      try { requestedFullscreen=true; tg.requestFullscreen(); }
      catch (_) {requestedFullscreen=false;}
    }
    for(const event of ['safeAreaChanged','contentSafeAreaChanged','viewportChanged','fullscreenChanged','fullscreenFailed']) {
      try{tg.onEvent(event, applySafeArea)}catch(_){}
    }
    requestAnimationFrame(applySafeArea);
    window.addEventListener('pageshow', applySafeArea);
    // Some Telegram versions populate insets only after their first viewport event.
    setTimeout(applySafeArea, 300);
    setTimeout(applySafeArea, 850);
  }
  window.FLIPViewport={isTelegram,mobileClient,requestedFullscreen};

  // Splash animation keeps existing v0.5 behavior (minimum 2 s).
  const started=performance.now();
  const minDuration=2000;
  const maxDuration=3500;
  const fonts=document.fonts ? document.fonts.ready.catch(()=>{}) : Promise.resolve();
  const page=new Promise(resolve=>{
    if(document.readyState==='complete')resolve();
    else window.addEventListener('load',resolve,{once:true});
  });
  function finish(){
    const splash=document.getElementById('flip-splash');
    if(!splash||splash.classList.contains('is-hidden'))return;
    splash.classList.add('is-hidden');
    splash.setAttribute('aria-hidden','true');
    setTimeout(()=>splash.remove(),500);
  }
  Promise.race([Promise.all([page,fonts]),new Promise(resolve=>setTimeout(resolve,maxDuration))]).then(()=>{
    setTimeout(finish,Math.max(0,minDuration-(performance.now()-started)));
  });
})();
