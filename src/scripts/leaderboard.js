/* FLIP 0.9.13.3 — lazy Telegram photos with initials as safe fallback. */
(() => {
 'use strict';
 const E=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39'}[c]));
 const raw=window.Telegram?.WebApp?.initData||'';
 const uuid=/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
 const backgrounds=new Set(['acid-signal','midnight-grid','redline','pastel-dream','lunar-haze','prism-shift']);
 const showcases=new Set(['glass-cabinet','black-chrome','red-velvet','blush-gallery','midnight-vault','prism-chamber']);
 const colors=new Set(['green','pink','red','orange','blue','white','violet','cyan','rgb','glitch']);
 const fmt=n=>Number(n||0).toLocaleString('ru-RU',{maximumFractionDigits:2});
 let root=null,serial=0,searchTimer=null,query='';
 const photoCache=new Map();
 const photoRequests=new Map();
 const photoQueue=[];
 let photoActive=0,photoObserver=null;
 const safePhoto=value=>typeof value==='string'&&
   (/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(value)||
    /^https:\/\/[A-Za-z0-9.-]+(?:\/[A-Za-z0-9_./%?&=+-]*)?$/.test(value))?value:null;
 function resolvePhoto(id){
   if(photoCache.has(id))return Promise.resolve(photoCache.get(id));
   if(photoRequests.has(id))return photoRequests.get(id);
   const promise=fetch('/api/flip?avatar='+encodeURIComponent(id),{
     cache:'no-store',headers:{'x-telegram-init-data':raw}
   }).then(async response=>{
     if(!response.ok)return null;
     const data=await response.json();
     return safePhoto(data?.avatar_data);
   }).catch(()=>null).then(data=>{
     photoCache.set(id,data);
     return data;
   }).finally(()=>photoRequests.delete(id));
   photoRequests.set(id,promise);
   return promise;
 }
 function pumpPhotos(){
   // Constrain Telegram lookups when dozens of players appear in a ranking.
   while(photoActive<3&&photoQueue.length){
     const element=photoQueue.shift();
     if(!element?.isConnected)continue;
     const id=element.getAttribute('data-leader-avatar');
     if(!validProfileId(id))continue;
     photoActive++;
     resolvePhoto(id).then(data=>{
       if(!data||!element.isConnected||typeof document==='undefined')return;
       const img=document.createElement('img');
       img.className='flip-leader-photo';
       img.alt='';
       img.loading='lazy';
       img.decoding='async';
       img.referrerPolicy='no-referrer';
       img.addEventListener('error',()=>img.remove(),{once:true});
       img.src=data;
       element.appendChild(img);
     }).finally(()=>{photoActive--;pumpPhotos()});
   }
 }
 function schedulePhoto(element){
   if(!element?.dataset||element.dataset.photoQueued)return;
   element.dataset.photoQueued='1';
   photoQueue.push(element);
   pumpPhotos();
 }
 function hydratePhotos(host){
   photoObserver?.disconnect();
   photoObserver=null;
   const elements=Array.from(host?.querySelectorAll?.('[data-leader-avatar]')||[]);
   if(!elements.length||!raw)return;
   if(typeof window.IntersectionObserver==='function'){
     photoObserver=new window.IntersectionObserver(entries=>{
       for(const entry of entries){
         if(!entry.isIntersecting)continue;
         photoObserver?.unobserve(entry.target);
         schedulePhoto(entry.target);
       }
     },{rootMargin:'160px 0px'});
     elements.forEach(el=>photoObserver.observe(el));
   }else{
     // Old WebViews still get every photo without a parallel request burst.
     elements.forEach(schedulePhoto);
   }
 }

 const initials=name=>{
   const str=String(name||'FLIP').replace(/^@/,'').trim();
   const words=str.split(/\s+/).filter(Boolean);
   return (words.length>=2?words[0].slice(0,1)+words[1].slice(0,1):
     str.slice(0,2)).toLocaleUpperCase('ru-RU')||'F';
 };
 const validProfileId=p=>typeof p==='string'&&uuid.test(p)?p:null;
 const skin=p=>{
   const o=p?.appearance||{};
   const bg=backgrounds.has(o.background)?o.background:'default';
   const scene=showcases.has(o.showcase_skin)?o.showcase_skin:'default';
   const color=colors.has(o.frame_color)?o.frame_color:'green';
   return ' flip-leader-bg-'+bg+' flip-leader-scene-'+scene+' flip-leader-color-'+color;
 };
 function player(p,{featured=false}={}){
   const id=validProfileId(p.profileId);
   const tag=id?'button':'div';
   const number=Number(p.place)||0;
   return '<'+tag+(id?' type="button" data-player-profile="'+E(id)+
     '" aria-label="Открыть профиль '+E(p.name)+'"':'')+
     ' class="flip-leader-player'+skin(p)+(featured?' is-featured':'')+
     (p.isMe?' is-me':'')+'">'+
     '<span class="flip-leader-rank">#'+E(number)+'</span>'+
     '<span class="flip-leader-avatar" aria-hidden="true"'+
       (id?' data-leader-avatar="'+E(id)+'"':'')+'>'+
       E(initials(p.name))+'</span>'+
     '<span class="flip-leader-person"><strong>'+E(p.name||'FLIP PLAYER')+'</strong>'+
     '<small>LVL '+E(p.level)+' · '+E(p.rankedVariants)+' уник. · '+
     E(p.rankedCards)+' карт.</small></span>'+
     '<span class="flip-leader-score">'+fmt(p.cp)+'<small>CP</small></span>'+
     (id?'<span class="flip-leader-arrow" aria-hidden="true">↗</span>':'')+
     '</'+tag+'>';
 }
 function summary(me){
   return '<section class="flip-leader-mine" aria-label="Моя позиция в рейтинге">'+
     '<div class="flip-leader-mine-caption">МОЯ ПОЗИЦИЯ</div>'+
     (me?player({...me,isMe:true},{featured:true}):
       '<p class="flip-social-muted">Позиция пока недоступна.</p>')+
     '</section>';
 }
 function results(data){
   const players=Array.isArray(data?.leaders)?data.leaders:[];
   const matched=Number(data?.matches)||0;
   const search=!!query;
   const label=search?'ИГРОКИ ПО ЗАПРОСУ':'ЛИДЕРЫ КОЛЛЕКЦИИ';
   let body='';
   if(!players.length){
     body='<p class="flip-social-muted flip-leader-empty">'+
       (search?'Игроки не найдены. Попробуй другой ник или имя.':'Пока нет участников.')+'</p>';
   }else if(search){
     body='<div class="flip-leader-list">'+players.map(p=>player(p)).join('')+'</div>';
   }else{
     const first=players.slice(0,1),other=players.slice(1,3),rest=players.slice(3);
     body='<div class="flip-leader-podium">'+
       first.map(p=>player(p,{featured:true})).join('')+
       (other.length?'<div class="flip-leader-runners">'+
         other.map(p=>player(p,{featured:true})).join('')+'</div>':'')+'</div>'+
       (rest.length?'<div class="flip-leader-list">'+rest.map(p=>player(p)).join('')+'</div>':'');
   }
   return summary(data?.me)+'<div class="flip-leader-results-heading">'+
     '<h3>'+label+'</h3><small>'+E(search?matched:data?.players||0)+' ИГРОКОВ</small>'+
     '</div>'+body+'<p class="flip-leader-caption">'+
     (search?'Показаны первые 25 совпадений из всей базы игроков. ':
       'CP отражают текущую коллекцию. ')+
     'Открой профиль игрока из рейтинга.</p>';
 }
 function shell(){
   return '<div class="flip-leader-shell">'+
     '<div class="flip-leader-search">'+
       '<label for="flip-leader-query">НАЙТИ ИГРОКА</label>'+
       '<div class="flip-leader-search-row">'+
         '<input type="search" id="flip-leader-query" class="flip-social-input" '+
          'inputmode="search" autocomplete="off" autocapitalize="none" spellcheck="false" '+
          'placeholder="@username или имя" maxlength="64" value="'+E(query)+'">'+
         '<button type="button" data-leader-clear aria-label="Очистить поиск">✕</button>'+
       '</div>'+
     '</div>'+
     '<div id="flip-leaderboard-results" aria-live="polite">'+
       '<p class="flip-social-muted">Загружаем рейтинг…</p></div>'+
     '<details class="flip-social-panel flip-cp-rules">'+
       '<summary>ПРАВИЛА CP</summary><p>Первая копия 100%, вторая 25%, третья 10%, '+
       'четвёртая и пятая по 5%, шестая–десятая по 1%. После десятой копии CP не растут.</p>'+
       '</details>'+
   '</div>';
 }
 async function load(){
   const el=root?.querySelector?.('#flip-leaderboard-results');
   if(!el)return;
   const job=++serial,q=query;
   if(!raw){
     el.innerHTML='<p class="flip-social-muted">Рейтинг доступен после входа через Telegram.</p>';
     return;
   }
   el.setAttribute?.('aria-busy','true');
   if(!el.dataset?.loaded)el.innerHTML='<p class="flip-social-muted">Загружаем игроков…</p>';
   try{
     const url='/api/social?view=leaderboard_social'+(q?'&q='+encodeURIComponent(q):'');
     const response=await fetch(url,{cache:'no-store',
       headers:{'x-telegram-init-data':raw}});
     const data=await response.json();
     if(!response.ok)throw Error(data.error||'SERVER_ERROR');
     if(job!==serial||q!==query||!root?.isConnected)return;
     el.innerHTML=results(data);
     if(el.dataset)el.dataset.loaded='1';
     window.FLIPIcons?.render(el);
     hydratePhotos(el);
   }catch{
     if(job!==serial||!root?.isConnected)return;
     el.innerHTML='<p class="flip-social-error">Не удалось загрузить игроков.</p>'+
       '<button type="button" class="outlinebtn" data-leader-refresh>ПОВТОРИТЬ</button>';
   }finally{
     if(job===serial)el.setAttribute?.('aria-busy','false');
   }
 }
 window.FLIPLeaderboard={
   mount(el){
     if(!el||root===el)return;
     root=el;serial++;
     el.innerHTML=shell();
     el.addEventListener('click',ev=>{
       if(ev.target.closest('[data-leader-refresh]')){load();return;}
       if(ev.target.closest('[data-leader-clear]')){
         query='';
         const input=root?.querySelector('#flip-leader-query');
         if(input){input.value='';input.focus?.();}
         if(searchTimer)clearTimeout(searchTimer);
         load();
       }
     });
     el.addEventListener('input',ev=>{
       if(ev.target.id!=='flip-leader-query')return;
       query=String(ev.target.value||'').trim().slice(0,64);
       if(searchTimer)clearTimeout(searchTimer);
       searchTimer=setTimeout(load,280);
     });
     el.addEventListener('keydown',ev=>{
       if(ev.target.id==='flip-leader-query'&&ev.key==='Enter'){
         ev.preventDefault?.();if(searchTimer)clearTimeout(searchTimer);load();
       }
     });
     load();
   }
 };
})();
