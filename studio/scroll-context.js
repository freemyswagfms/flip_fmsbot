/* FLIP STUDIO v0.9.8.6 — stable scroll context for editorial workflows.
 * All state is in memory: no player data or search text enters storage.
 * DOM-based positions supplement numeric offsets when rows above the viewport change.
 */
const anchorKeys=[
 'data-edit-release','data-import-artist','data-artist-view',
 'data-import-id','data-player-open','data-task-edit',
 'data-art-slot','data-player-remove'
];
const anchorSelector=anchorKeys.map(key=>'['+key+']').join(',');
const scrollSelector='[data-studio-scroll-key]';

function visible(rect,viewport){
 return !!rect && rect.bottom>viewport.top+2 && rect.top<viewport.bottom-2;
}
function stableAnchor(root,viewport,{scroller=null}={}){
 if(!root?.querySelectorAll)return null;
 let best=null,closest=Infinity;
 for(const node of root.querySelectorAll(anchorSelector)){
  const parent=node.closest?.(scrollSelector);
  if(scroller?parent!==scroller:!!parent)continue;
  const bounds=node.getBoundingClientRect?.();
  if(!visible(bounds,viewport))continue;
  const value=anchorKeys.map(key=>node.hasAttribute?.(key)?[key,node.getAttribute(key)]:null)
    .find(Boolean);
  if(!value)continue;
  const distance=Math.abs(bounds.top-viewport.top);
  if(distance<closest){closest=distance;best={key:value[0],value:value[1],
    offset:bounds.top-viewport.top}}
 }
 return best;
}
function findAnchor(root,anchor){
 if(!anchor||!root?.querySelectorAll)return null;
 return [...root.querySelectorAll(anchorSelector)].find(node=>
  node.getAttribute(anchor.key)===anchor.value)||null;
}
function windowTop(win){
 return Number(win.scrollY ?? win.document?.documentElement?.scrollTop ?? 0)||0;
}
function windowLeft(win){return Number(win.scrollX)||0}
function moveWindow(win,x,y){
 if(!win?.scrollTo)return;
 const horizontal=Math.max(0,Number(x)||0),vertical=Math.max(0,Number(y)||0);
 try{win.scrollTo({top:vertical,left:horizontal,behavior:'instant'})}
 catch{try{win.scrollTo(horizontal,vertical)}catch{}}
}
export function captureStudioPosition(root,win=window,doc=document){
 if(!root)return null;
 const height=Math.max(1,Number(win.innerHeight)||700);
 const viewport={top:0,bottom:height};
 const state={x:windowLeft(win),y:windowTop(win),
  anchor:stableAnchor(root,viewport),scrollers:[],focus:null};
 for(const el of root.querySelectorAll?.(scrollSelector)||[]){
  const key=el.getAttribute('data-studio-scroll-key');
  if(!key)continue;
  const rect=el.getBoundingClientRect?.();
  const bounded=rect?{top:rect.top,bottom:rect.bottom}:viewport;
  state.scrollers.push({key,x:Number(el.scrollLeft)||0,y:Number(el.scrollTop)||0,
   anchor:stableAnchor(root,bounded,{scroller:el})});
 }
 const active=doc?.activeElement;
 if(active&&root.contains?.(active) && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName||'') &&
   typeof active.id==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(active.id)){
  let from=null,to=null;
  try{from=active.selectionStart;to=active.selectionEnd}catch{}
  state.focus={id:active.id,from,to};
 }
 return state;
}
export function restoreStudioPosition(root,state,win=window){
 if(!root||!state)return;
 moveWindow(win,state.x,state.y);
 for(const item of state.scrollers||[]){
  const scroller=[...(root.querySelectorAll?.(scrollSelector)||[])].find(el=>
   el.getAttribute('data-studio-scroll-key')===item.key);
  if(!scroller)continue;
  scroller.scrollTop=item.y;
  scroller.scrollLeft=item.x;
  const anchor=findAnchor(root,item.anchor);
  const rect=scroller.getBoundingClientRect?.(),itemRect=anchor?.getBoundingClientRect?.();
  if(rect&&itemRect&&item.anchor){
   const offset=itemRect.top-rect.top-item.anchor.offset;
   if(Number.isFinite(offset)&&Math.abs(offset)>0.5)scroller.scrollTop+=offset;
  }
 }
 const anchor=findAnchor(root,state.anchor);
 if(anchor&&state.anchor){
  const rect=anchor.getBoundingClientRect?.();
  if(rect){
   const delta=rect.top-state.anchor.offset;
   if(Number.isFinite(delta)&&Math.abs(delta)>0.5)
    moveWindow(win,state.x,windowTop(win)+delta);
  }
 }
 if(state.focus){
  const focused=[...(root.querySelectorAll?.('input[id],textarea[id],select[id]')||[])]
   .find(el=>el.id===state.focus.id);
  if(focused){
   try{focused.focus({preventScroll:true})}catch{}
   if(Number.isInteger(state.focus.from)&&Number.isInteger(state.focus.to))
    try{focused.setSelectionRange(state.focus.from,state.focus.to)}catch{}
  }
 }
}
