/* FLIP v0.9.3 — server-authoritative achievements. Presentation only. */
(()=>{
 'use strict';
 let selected='all';
 const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({
   '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
 }[ch]));
 const clamp=(v,min,max)=>Math.max(min,Math.min(max,Number(v)||0));
 const count=n=>Number(n||0).toLocaleString('ru-RU');
 const labels={all:'ВСЕ',oneoff:'РАЗОВЫЕ',staged:'ЭТАПЫ',secret:'СЕКРЕТНЫЕ'};
 const type=a=>a.category==='hidden'?'secret':a.category;
 const filter=type=>{
   if(!Object.keys(labels).includes(type))return;
   selected=type;
 };
 function badgeRow(list){
   if(!list?.length)return '<div class="flip-ach-no-badges">Значки появятся после получения особых достижений.</div>';
   return '<div class="flip-ach-badge-row">'+list.slice(0,9).map(b=>
     '<span class="flip-ach-badge" title="'+esc(b.title)+'" aria-label="'+esc(b.title)+'">'+
       '<b>'+esc(b.symbol)+'</b><small>'+esc(b.title)+'</small></span>').join('')+'</div>';
 }
 function profile(data,{online=false}={}){
   const completed=Number(data?.completed||0),total=online?Number(data?.total||30):30;
   const ready=online?Number(data?.claimable||0):0;
   return '<section class="content-card flip-ach-profile">'+
     '<div class="flip-ach-profile-title"><h3>ДОСТИЖЕНИЯ</h3>'+
       '<strong>'+completed+' / '+total+'</strong></div>'+
     (online?(ready>0?'<p>'+ready+' наград доступно к получению.</p>':''):
       '<p>Достижения доступны после входа через Telegram.</p>')+
     badgeRow(data?.badges)+
     '<button class="outlinebtn" type="button" data-action="achievements">'+
       'ОТКРЫТЬ ДОСТИЖЕНИЯ ↗</button></section>';
 }
 function achievementCard(a){
   const stages=Number(a.total_stages)||1;
   const stage=Math.max(1,Number(a.stage)||1);
   const claimed=Number(a.claimed_stages)||0;
   const completed=a.completed===true;
   const ready=a.claimable===true;
   const locked=a.secret&&!a.unlocked;
   const current=Math.min(Number(a.progress)||0,Number(a.target)||1);
   const goal=Math.max(1,Number(a.target)||1);
   const percent=completed?100:locked?0:clamp(100*current/goal,0,100);
   const status=completed?'ПОЛУЧЕНО':ready?'ГОТОВО К ПОЛУЧЕНИЮ':
      locked?'СЕКРЕТНОЕ':'В ПРОЦЕССЕ';
   const action=ready?
     '<button type="button" class="flip-ach-claim" data-achievement-claim="'+esc(a.code)+
       '" data-achievement-stage="'+stage+'">ЗАБРАТЬ +'+count(a.reward_f)+' F ↗</button>':
     '<span class="flip-ach-reward '+(completed?'is-claimed':'')+'">'+
       (completed?'✓ ПОЛУЧЕНО':'+'+count(a.reward_f)+' F')+'</span>';
   const progressInfo=locked?'':
     completed?'Все этапы завершены':
       count(current)+' / '+count(goal);
   const extra=stages>1?
      '<div class="flip-ach-stages">'+Array.from({length:stages},(_,i)=>
        '<span class="'+(i<claimed?'is-done':i===stage-1?'is-current':'')+
        '">'+(i<claimed?'✓':i+1)+'</span>').join('')+
      '<small>'+claimed+' / '+stages+' ЭТАПОВ</small></div>':'';
   return '<article class="flip-ach-card '+(ready?'is-ready ':completed?'is-completed ':'')+
      (locked?'is-secret ':'')+'" data-achievement-id="'+esc(a.code)+'">'+
      '<div class="flip-ach-card-top"><div class="flip-ach-symbol" aria-hidden="true">'+
        esc(a.symbol)+'</div><div class="flip-ach-card-copy"><h3>'+esc(a.title)+
        '</h3>'+(locked?'':'<p>'+esc(a.description)+'</p>')+'</div></div>'+ 
      extra+
      '<div class="flip-ach-progress"><div class="flip-ach-progress-track">'+
        '<i style="width:'+percent.toFixed(1)+'%"></i></div>'+
        '<div class="flip-ach-progress-meta"><span>'+esc(status)+'</span>'+
        (progressInfo?'<b>'+esc(progressInfo)+'</b>':'')+'</div></div>'+
      '<div class="flip-ach-card-bottom">'+
        (a.badge&&!locked?'<span class="flip-ach-badge-note">✧ ЗНАЧОК</span>':'')+
        action+'</div></article>';
 }
 function page(data,{online=false}={}){
   const all=(online&&Array.isArray(data?.items)?data.items:[]).filter(a=>a.category!=='hidden'||a.unlocked===true);
   const visible=all.filter(a=>selected==='all'||type(a)===selected);
   const total=online?Number(data.total||30):30;
   const done=online?Number(data.completed||0):0;
   const available=online?Number(data.claimable||0):0;
   const summary='<div class="flip-ach-summary">'+
     '<div><span>ОТКРЫТО</span><strong>'+done+'<i> / '+total+'</i></strong></div>'+
     '<div><span>НАГРАДЫ</span><strong>'+available+'</strong></div>'+
     '<div><span>ЗНАЧКИ</span><strong>'+Number(data?.badges?.length||0)+'</strong></div></div>';
   return '<div class="panel flip-ach-page">'+
     '<button class="link" type="button" data-action="profile">← К ПРОФИЛЮ</button>'+
     
     '<h2>ДОСТИЖЕНИЯ<span style="color:var(--lime)">.</span></h2>'+
     
     summary+
     '<div class="flip-ach-section-heading"><strong>ТВОИ ЗНАЧКИ</strong>'+
       '</div>'+
     badgeRow(data?.badges)+
     '<div class="flip-ach-filters" aria-label="Категории достижений">'+
       Object.entries(labels).map(([key,value])=>
         '<button type="button" data-ach-filter="'+key+'" aria-pressed="'+(selected===key)+
          '">'+value+'</button>').join('')+'</div>'+
     (!online?'<div class="flip-ach-offline">Подключись через Telegram, чтобы посмотреть достижения, '+
       'прогресс и получить награды.</div>':
       visible.length?'<div class="flip-ach-list">'+visible.map(achievementCard).join('')+'</div>':
       '<p class="flip-ach-empty">В этой категории пока ничего нет.</p>')+
     '</div>';
 }
 window.FLIPAchievements={page,profile,filter,getFilter:()=>selected};
})();
