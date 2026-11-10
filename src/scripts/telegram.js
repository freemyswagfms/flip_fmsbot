/* Telegram Mini App bridge and splash screen — FLIP 0.3 */
(() => {
  'use strict';
  const root = document.documentElement;
  const tg = window.Telegram && window.Telegram.WebApp;
  const isTelegram = !!(tg && ((tg.platform && tg.platform !== 'unknown') || tg.initData));
  const isIOS = !!(isTelegram && (tg.platform === 'ios' || /iPhone|iPad|iPod/i.test(navigator.userAgent)));
  const inset = v => Math.max(0, Math.min(220, Number(v) || 0));
  function applySafeArea() {
    if (!isTelegram) return;
    const safe = tg.safeAreaInset || {};
    const content = tg.contentSafeAreaInset || {};
    // Telegram's native buttons overlay web content on some iOS versions.
    // Inset comes from the Telegram API; 88px is a conservative iOS fallback
    // for clients which report 0 before the layout has settled.
    const top = Math.max(isIOS ? 88 : 0, inset(safe.top) + inset(content.top));
    const bottom = Math.max(inset(safe.bottom), inset(content.bottom));
    root.style.setProperty('--flip-top-space', `${top}px`);
    root.style.setProperty('--flip-bottom-space', `${bottom}px`);
    root.classList.add('flip-in-telegram');
    root.classList.toggle('flip-telegram-ios', isIOS);
  }
  if (isTelegram) {
    applySafeArea();
    try { tg.ready(); } catch (_) {}
    try { tg.expand(); } catch (_) {}
    try { tg.setHeaderColor('#090c0a'); tg.setBackgroundColor('#090c0a'); } catch (_) {}
    for (const event of ['safeAreaChanged', 'contentSafeAreaChanged', 'viewportChanged', 'fullscreenChanged']) {
      try { tg.onEvent(event, applySafeArea); } catch (_) {}
    }
    // Native iOS insets may arrive after first render.
    requestAnimationFrame(applySafeArea);
    window.addEventListener('pageshow', applySafeArea);
  }
  // Keep the splash on-screen briefly; do not block forever on slow fonts/network.
  const started = performance.now();
  const minDuration = 1400;
  const maxDuration = 2900;
  const fonts = document.fonts ? document.fonts.ready.catch(() => {}) : Promise.resolve();
  const page = new Promise(resolve => {
    if (document.readyState === 'complete') resolve();
    else window.addEventListener('load', resolve, { once: true });
  });
  function finish() {
    const splash = document.getElementById('flip-splash');
    if (!splash || splash.classList.contains('is-hidden')) return;
    splash.classList.add('is-hidden');
    splash.setAttribute('aria-hidden', 'true');
    setTimeout(() => splash.remove(), 500);
  }
  const ready = Promise.all([page, fonts]);
  const timeout = new Promise(resolve => setTimeout(resolve, maxDuration));
  Promise.race([ready, timeout]).then(() => {
    setTimeout(finish, Math.max(0, minDuration - (performance.now() - started)));
  });
})();
