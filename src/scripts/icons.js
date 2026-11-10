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
    '›': '<path d="m9 5 7 7-7 7"/>',
    '←': '<path d="m12 5-7 7 7 7M5 12h15"/>',
    '✕': '<path d="M5 5 19 19M19 5 5 19"/>',
    '◉': '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/>'
  };
  const pattern = /[✳↗◷◎✦◈☆◆✓↔›←✕◉]/g;
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
  window.FLIPIcons = { render };
})();
