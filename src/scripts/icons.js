/* Platform-independent inline SVG icon set; replaces Unicode glyphs rendered as emoji on iOS. */
(() => {
  'use strict';
  const shapes = {
    '✳': '<path d="M12 1.5v21M1.5 12h21M4.6 4.6l14.8 14.8M19.4 4.6 4.6 19.4"/>',
    '↗': '<path d="M5 19 19 5M8 5h11v11"/>',
    '◷': '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
    '◎': '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>',
    '✦': '<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z"/>',
    '◈': '<path d="m12 2 10 10-10 10L2 12 12 2Z"/><path d="M12 6v12M6 12h12"/>',
    '☆': '<path d="m12 2 3.1 6.4 7.1 1-5.1 5 1.2 7-6.3-3.3-6.3 3.3 1.2-7-5.1-5 7.1-1L12 2Z"/>',
    '◆': '<path d="m12 2 10 10-10 10L2 12 12 2Z"/>',
    '✓': '<path d="m4 12 5.1 5.1L20 6"/>',
    '↔': '<path d="M3 8h18M7 4 3 8l4 4M21 16H3m14-4 4 4-4 4"/>',
    '⇄': '<path d="M3 7h17m-4-4 4 4-4 4M21 17H4m4-4-4 4 4 4"/>',
    '×': '<path d="m5 5 14 14M19 5 5 19"/>',
    '▣': '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><rect x="7.5" y="7.5" width="9" height="9" rx="1.5"/>',
    '◇': '<path d="m12 2 9.5 10-9.5 10L2.5 12 12 2Z"/>',
    '›': '<path d="m9 5 7 7-7 7"/>',
    '←': '<path d="m12 5-7 7 7 7M5 12h15"/>',
    '✕': '<path d="M5 5 19 19M19 5 5 19"/>',
    '◉': '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/>',
    '✧': '<path d="M12 2.5 14.6 9.4 21.5 12l-6.9 2.6L12 21.5l-2.6-6.9L2.5 12l6.9-2.6L12 2.5Z"/>',
    '⌄': '<path d="m5 9 7 7 7-7"/>',
    '∞': '<path d="M12 12c-2.6-3.2-4.1-4.3-6-4.3a4.3 4.3 0 1 0 0 8.6c1.9 0 3.4-1.1 6-4.3Zm0 0c2.6-3.2 4.1-4.3 6-4.3a4.3 4.3 0 1 1 0 8.6c-1.9 0-3.4-1.1-6-4.3Z"/>',
    '∷': '<circle cx="8" cy="7" r="1.6" fill="currentColor" stroke="none"/><circle cx="16" cy="7" r="1.6" fill="currentColor" stroke="none"/><circle cx="8" cy="17" r="1.6" fill="currentColor" stroke="none"/><circle cx="16" cy="17" r="1.6" fill="currentColor" stroke="none"/>',
    '●': '<circle cx="12" cy="12" r="5" fill="currentColor" stroke="none"/>'
  };
  const pattern = /[✳↗◷◎✦✧◈☆◆✓↔⇄×▣◇›←✕◉⌄∞∷●]/g;
  const ns = 'http://www.w3.org/2000/svg';
  function make(glyph) {
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox','0 0 24 24');
    svg.setAttribute('class','flip-svg');
    svg.setAttribute('fill','none');
    svg.setAttribute('stroke','currentColor');
    svg.setAttribute('stroke-width','1.9');
    svg.setAttribute('stroke-linecap','round');
    svg.setAttribute('stroke-linejoin','round');
    svg.setAttribute('aria-hidden','true');
    svg.setAttribute('focusable','false');
    svg.innerHTML = shapes[glyph];
    return svg;
  }
  function render(element) {
    if (!element) return;
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        pattern.lastIndex = 0;
        if (!pattern.test(node.nodeValue || '')) return NodeFilter.FILTER_REJECT;
        pattern.lastIndex = 0;
        const parent = node.parentElement;
        return parent && !parent.closest('svg,script,style,pre,code,noscript') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    const targets = [];
    while (walker.nextNode()) targets.push(walker.currentNode);
    for (const node of targets) {
      const frag = document.createDocumentFragment();
      const text = node.nodeValue;
      let start = 0;
      pattern.lastIndex = 0;
      for (const match of text.matchAll(pattern)) {
        if (match.index > start) frag.append(document.createTextNode(text.slice(start, match.index)));
        frag.append(make(match[0]));
        start = match.index + match[0].length;
      }
      if (start < text.length) frag.append(document.createTextNode(text.slice(start)));
      node.replaceWith(frag);
    }
  }
  // Game screens are often replaced after their initial render. Keep the
  // icon system active for modals, traded-card lists, history, rewards and
  // dynamically re-rendered panels, without relying on emoji-capable fonts.
  function watch() {
    if (!document.body) return;
    render(document.body);
    if (typeof MutationObserver !== 'function') return;
    const observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'characterData') {
          if (record.target.parentElement) render(record.target.parentElement);
          continue;
        }
        for (const node of record.addedNodes) {
          if (node.nodeType === 1) render(node);
          else if (node.nodeType === 3 && node.parentElement) render(node.parentElement);
        }
      }
    });
    observer.observe(document.body,{childList:true,characterData:true,subtree:true});
  }
  window.FLIPIcons = { render };
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded',watch,{once:true});
  else watch();
})();
