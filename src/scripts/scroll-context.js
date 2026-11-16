/* FLIP v0.9.8.6 — preserve in-page scroll, visible card position and
 * editor scroll/focus across non-navigation re-renders.
 * Navigation resets to the top unless explicitly marked as "back".
 */
(()=>{
'use strict';
const anchorAttributes=[
 ['data-achievement-id'],
 ['data-task-scope','data-task-slot'],
 // A gallery flag alone is shared by every tile. Pair it with the card ID.
 ['data-owned-card','data-gallery-item'],
 ['data-history-card','data-gallery-item'],
 ['data-collection-artist'],
 ['data-collection-release'],
 ['data-owned-card'],
 ['data-history-card'],
 ['data-hidden-card'],
 ['data-catalog-artist','data-catalog-release','data-catalog-rarity'],
 ['data-shop-inspect'],
 // The same trade card can appear in a composer and an incoming offer;
 // keep numeric scroll rather than attaching to a different copy.
 ['data-showcase-filter'],
 ['data-player-profile']
];
const nestedSelectors=[
 '.flip-ach-filters',
 '[data-trade-viewport]',
 '.flip-trade-summary-items',
 '.flip-trade-offer-strip',
 '.flip-trade-rarity-filter',
 '.flip-trade-choice-viewport',
 '.col-gallery-filters'
];
const controlSelectors=[
 '[data-collection-gallery-search]',
 '[data-collection-gallery-sort]',
 '[data-collection-search]',
 '[data-showcase-search]',
 '[data-trade-card-search]',
 '#flip-trade-user-search',
 '#flip-trade-amount'
];
const anchorSelector=anchorAttributes.map(parts=>parts.map(x=>'['+x+']').join('')).join(',');
function keyFor(element){
 if(!element||typeof element.hasAttribute!=='function')return null;
 for(const attributes of anchorAttributes){
  if(attributes.every(attr=>element.hasAttribute(attr)))
   return attributes.map(attr=>[attr,element.getAttribute(attr)]);
 }
 return null;
}
function sameKey(node,key){
 return !!node&&key.every(([attr,value])=>node.getAttribute?.(attr)===value);
}
function asNumber(value){return Number.isFinite(Number(value))?Number(value):0}
function capture(scroll,screen){
 if(!scroll||!screen)return null;
 const top=asNumber(scroll.scrollTop);
 const rect=typeof scroll.getBoundingClientRect==='function'?
   scroll.getBoundingClientRect():null;
 const stored={top,anchor:null,nested:[],controls:[],filter:null};
 if(rect&&typeof screen.querySelectorAll==='function'){
  const elements=[...screen.querySelectorAll(anchorSelector)];
  let nearest=null,distance=Infinity;
  for(const element of elements){
   const bounds=element.getBoundingClientRect?.();
   if(!bounds||bounds.bottom<=rect.top+2||bounds.top>=rect.bottom-2)continue;
   const key=keyFor(element);
   if(!key)continue;
   const d=Math.abs(bounds.top-rect.top);
   if(d<distance){distance=d;nearest={key,offset:bounds.top-rect.top}}
  }
  stored.anchor=nearest;
 }
 for(const selector of nestedSelectors){
  const nodes=[...(screen.querySelectorAll?.(selector)||[])];
  nodes.forEach((element,index)=>{
   const x=asNumber(element.scrollLeft),y=asNumber(element.scrollTop);
   if(x||y)stored.nested.push({selector,index,x,y});
  });
 }
 for(const selector of controlSelectors){
  const element=screen.querySelector?.(selector);
  if(!element)continue;
  const focused=typeof document!=='undefined'&&document.activeElement===element;
  stored.controls.push({selector,value:element.value,focused,
   start:focused?element.selectionStart:null,end:focused?element.selectionEnd:null});
 }
 const filter=screen.querySelector?.('[data-collection-gallery-filter][aria-pressed="true"]');
 if(filter)stored.filter=filter.getAttribute('data-collection-gallery-filter');
 return stored;
}
function restore(scroll,screen,saved){
 if(!scroll||!screen||!saved)return;
 scroll.scrollTop=asNumber(saved.top);
 // Preserve the same visible card even if badges, counters or earlier cards changed height.
 if(saved.anchor&&typeof scroll.getBoundingClientRect==='function'){
  const node=[...(screen.querySelectorAll?.(anchorSelector)||[])]
    .find(candidate=>sameKey(candidate,saved.anchor.key));
  const bounds=node?.getBoundingClientRect?.();
  if(bounds){
   const scrollTop=scroll.getBoundingClientRect().top;
   const delta=bounds.top-scrollTop-saved.anchor.offset;
   if(Number.isFinite(delta)&&Math.abs(delta)>0.5)
     scroll.scrollTop=asNumber(scroll.scrollTop)+delta;
  }
 }
 for(const item of saved.nested||[]){
  const el=screen.querySelectorAll?.(item.selector)?.[item.index];
  if(el){el.scrollLeft=item.x;el.scrollTop=item.y}
 }
 if(saved.filter!==null&&saved.filter!==undefined){
  for(const btn of screen.querySelectorAll?.('[data-collection-gallery-filter]')||[])
    btn.setAttribute('aria-pressed',String(
      btn.getAttribute('data-collection-gallery-filter')===saved.filter));
 }
 let focus=null;
 for(const control of saved.controls||[]){
  const element=screen.querySelector?.(control.selector);
  if(!element)continue;
  element.value=control.value;
  if(control.focused)focus={element,start:control.start,end:control.end};
 }
 if(focus){
  try{focus.element.focus({preventScroll:true})}catch{}
  if(Number.isInteger(focus.start)&&Number.isInteger(focus.end)){
   try{focus.element.setSelectionRange(focus.start,focus.end)}catch{}
  }
 }
}
window.FLIPScrollContext={capture,restore};
})();
