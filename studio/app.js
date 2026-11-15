import './styles.css';
import {createClient} from '@supabase/supabase-js';

/* FLIP STUDIO v0.9.0 — creative workspace. All privileged writes use RLS or
   authenticated server functions; no secret/service-role keys in this bundle. */
const $=selector=>document.querySelector(selector);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const short=s=>String(s||'').slice(0,16);
const date=s=>s?new Date(s).toLocaleDateString('ru-RU',{day:'numeric',month:'short',year:'numeric'}):'—';
const slug=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
 .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,58)||'release';
const generateSlug=s=>{const base=slug(s);return base.length>1?base:base+'-art';};
const rarities=[
 {id:'common',label:'Common',desc:'Цветной мраморный барельеф'},
 {id:'rare',label:'Rare',desc:'Вышивка и ткань'},
 {id:'epic',label:'Epic',desc:'Витраж и стекло'},
 {id:'legendary',label:'Legendary',desc:'Живопись маслом'},
 {id:'mythic',label:'Mythic',desc:'Многослойная бумага'},
 {id:'hidden',label:'Hidden',desc:'Секретная редкость · необязательно'}
];
const mainRarities=rarities.filter(r=>r.id!=='hidden').map(r=>r.id);
const iPaths={
 'layout-dashboard':'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
 'users':'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
 'disc':'<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="2"/><path d="M7 12h1"/>',
 'search':'<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>',
 'image':'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
 'file-clock':'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h6"/><path d="M14 2v6h6M14 2l6 6"/><circle cx="17" cy="17" r="5"/><path d="M17 14v3l2 1"/>',
 'shield':'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/>',
 'history':'<path d="M3 12a9 9 0 1 1 2.5 6.2M3 16v-4h4"/><path d="M12 7v5l3 2"/>',
 'plus':'<path d="M12 5v14M5 12h14"/>',
 'arrow-right':'<path d="M5 12h14m-6-6 6 6-6 6"/>',
 'upload':'<path d="M12 16V3m-5 5 5-5 5 5"/><path d="M5 15v5h14v-5"/>',
 'check':'<path d="m5 12 4 4L19 6"/>',
 'sparkles':'<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3ZM19 17l.8 2.2L22 20l-2.2.8L19 23l-.8-2.2L16 20l2.2-.8L19 17Z"/>',
 'chevron-right':'<path d="m9 18 6-6-6-6"/>',
 'chevron-left':'<path d="m15 18-6-6 6-6"/>',
 'lock':'<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 1 1 8 0v4"/>',
 'loader':'<circle cx="12" cy="12" r="9" stroke-dasharray="20 35"/>',
 'log-out':'<path d="M10 17l5-5-5-5M15 12H3M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/>',
 'circle':'<circle cx="12" cy="12" r="9"/>',
 'copy':'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
 'info':'<circle cx="12" cy="12" r="10"/><path d="M12 11v6m0-10h.01"/>',
 'x':'<path d="M18 6 6 18M6 6l12 12"/>'
};
const ico=(name,size=18)=>'<svg width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" aria-hidden="true">'+(iPaths[name]||iPaths.circle)+'</svg>';
const nav=[
 ['dashboard','layout-dashboard','Обзор'],['artists','users','Артисты'],
 ['releases','disc','Релизы'],['import','search','Music Importer'],
 ['editor','image','Artwork Studio'],['team','shield','Команда'],
 ['activity','history','История']
];
const s={db:null,user:null,member:null,artists:[],releases:[],variants:[],audit:[],
 current:'dashboard',selectedRelease:null,q:'',filter:'all',busy:false,
 importQ:'',importArtists:[],importArtist:null,importReleases:[],importSelected:new Set(),
 importPage:0,importCount:0,importError:'',crop:null,
 thumbs:new Map(),ownerTicket:(()=>{try{return localStorage.getItem('flip_studio_claim')||''}catch{return ''}})()};
let toastTimer=null;
let inviteCodePending=false;
let emailRequestPending=false,emailCooldownUntil=0,emailUnlockTimer=null;
const app=$('#app');

function notice(message,error=false){
 const el=$('#toast');if(!el)return;
 el.className=(error?'error ':'')+'show';el.textContent=String(message||'');
 clearTimeout(toastTimer);toastTimer=setTimeout(()=>{el.className=''},5200);
}
function formatError(e){
 const msg=String(e?.message||e?.error_description||e||'Ошибка');
 const codes={
  'MISSING_ARTWORK':'Сначала загрузи пять основных обложек.',
  'UNAUTHORIZED':'Войди в FLIP STUDIO заново.',
  'FORBIDDEN':'Недостаточно прав для этого действия.',
  'INVALID_RELEASE_STATUS':'Этот релиз нельзя публиковать повторно.',
  'STUDIO_OWNER_EXISTS':'Владелец STUDIO уже активирован.',
  'INVALID_OWNER_TICKET':'Ссылка активации истекла. Получи новую в FLIP.',
  'ALREADY_CLAIMED':'Ссылка уже использована. Получи новую в FLIP.',
  'STUDIO_CONFIG_MISSING':'Сайт ещё не настроен. Требуется подключение Supabase.',
  'EMAIL_DELIVERY_UNAVAILABLE':'Встроенная отправка почты ограничена. Используй код приглашения.',
 'INVITE_LINK_UNAVAILABLE':'Не удалось создать код приглашения. Проверь доступ и попробуй ещё раз.'
 };
 if(/only request this after|rate limit|too many requests/i.test(msg))
  return 'Слишком частая отправка. Подожди немного и проверь, не пришло ли первое письмо.';
 return codes[msg]||msg;
}
async function invoke(path,body=null){
 const {data:{session}}=await s.db.auth.getSession();
 if(!session)throw new Error('UNAUTHORIZED');
 const [route,query='']=path.split('?');
 const target='https://flip-fmsbot.vercel.app/api/studio?route='+encodeURIComponent(route)+(query?'&'+query:'');
 const res=await fetch(target,{
  method:body?'POST':'GET',headers:{Authorization:'Bearer '+session.access_token,
    ...(body?{'content-type':'application/json'}:{})},cache:'no-store',
  body:body?JSON.stringify(body):undefined
 });
 const result=await res.json().catch(()=>({error:'INVALID_RESPONSE'}));
 if(!res.ok)throw new Error(result.error||'SERVER_ERROR');
 return result;
}
function activeReleases(){return s.releases.filter(r=>s.artists.some(a=>a.id===r.artist_id))}
function artistName(id){return s.artists.find(a=>a.id===id)?.name||'Неизвестный артист'}
function releaseVariants(id){return s.variants.filter(v=>v.release_id===id)}
function releaseProgress(id){return mainRarities.filter(r=>s.variants.some(v=>v.release_id===id&&v.rarity===r)).length}
function tag(status){return '<span class="tag '+esc(status||'draft')+'">'+
 ({published:'ОПУБЛИКОВАН',draft:'ЧЕРНОВИК',ready:'ГОТОВ',archived:'АРХИВ'}[status]||'ЧЕРНОВИК')+'</span>'}
function loadingMarkup(label='Загружаем данные…'){
 return '<div class="empty">'+ico('loader',25)+'<strong>'+esc(label)+'</strong></div>'}
function pageHead(kicker,title,desc,action=''){
 return '<div class="heading-row"><div><div class="page-kicker">'+esc(kicker)+'</div>'+
 '<h1 class="page-title">'+esc(title)+'</h1><p class="page-desc">'+esc(desc)+'</p></div>'+action+'</div>'}
function button(label,act,primary=false){
 return '<button type="button" class="button '+(primary?'primary':'')+'" data-action="'+esc(act)+'">'+label+'</button>'}
function layout(content){
 const role=s.member?.role||'editor';
 const visibleNav=nav.filter(x=>x[0]!=='team'||role==='owner');
 const item=nav.find(x=>x[0]===s.current);
 const buttons=visibleNav.map(([id,icon,label])=>
  '<button type="button" class="nav-btn '+(s.current===id?'active':'')+
  '" data-nav="'+id+'">'+ico(icon)+esc(label)+(id==='releases'?'<small class="nav-badge">'+s.releases.length+'</small>':'')+'</button>').join('');
 return '<div class="shell"><aside class="sidebar"><div class="brand-head">'+
  '<div class="wordmark">FLIP<span>.</span></div><span class="brand-sub">STUDIO / CONTENT OS</span>'+
  '</div><div class="side-label">WORKSPACE</div><nav class="nav-links">'+buttons+'</nav>'+
  '<div class="side-bottom"><div class="side-status"><span class="online-dot"></span> WORKSPACE CONNECTED</div>'+
  '<small>FLIP STUDIO 0.9.0<br>Редакционный контент и публикации</small></div></aside>'+
  '<div class="main"><header class="topbar"><div class="crumbs"><span>STUDIO</span> / <b>'+
  esc(item?.[2]||'Обзор')+'</b></div><div class="top-right"><span class="role-pill">'+role.toUpperCase()+
  '</span><div class="avatar">'+esc((s.user.email||'F').slice(0,1).toUpperCase())+
  '</div><button class="button sm ghost" data-action="logout" title="Выйти">'+ico('log-out')+'</button></div></header>'+
  '<main class="canvas view-enter">'+content+
  '<div class="footer-note">FLIP STUDIO © 2026 · CONTENT OPERATIONS · YOUR COLLECTION, YOUR RULES</div></main></div>'+
  '</div><nav class="mobile-menu" aria-label="Навигация">'+
  visibleNav.filter(x=>['dashboard','releases','import','editor','team'].includes(x[0]))
    .map(([id,icon,label])=>'<button data-nav="'+id+'" class="'+(s.current===id?'active':'')+'">'+
      ico(icon)+'<span>'+esc(label.replace('Music ','').replace('Artwork ',''))+'</span></button>').join('')+
  '</nav>';
}
function dashboard(){
 const published=s.releases.filter(r=>r.status==='published').length;
 const drafts=s.releases.filter(r=>r.status==='draft'||r.status==='ready').length;
 const count=s.variants.filter(v=>v.processed_path).length;
 const dash=pageHead('CONTROL CENTER / 001','Твой музыкальный архив',
  'Управляй музыкой, командами и обложками в одном месте. Новые публикации автоматически становятся частью FLIP.',
  button(ico('plus')+' Импортировать музыку','nav-import',true));
 const nums=[['Артисты',s.artists.length,'В редакционной базе',''],['Релизы',s.releases.length,
  published+' опубликовано','green'],['Обложки',count,'Готовых файлов',''],['Черновики',drafts,'Ожидают завершения','']];
 const stats='<div class="stats-grid">'+nums.map(([label,value,foot,cl])=>'<div class="stat '+cl+
  '"><div class="stat-label">'+label+'</div><div class="stat-value">'+value.toLocaleString('ru-RU')+
  '</div><div class="stat-foot">'+foot+'</div></div>').join('')+'</div>';
 const recent=s.releases.filter(r=>r.status!=='published').slice(0,5);
 return dash+stats+'<section class="panel accent-panel feature-hero">'+
  '<div><span class="page-kicker">ONE SEARCH · WHOLE DISCOGRAPHY</span>'+
  '<h2>От артиста до коллекции<br>за несколько действий.</h2>'+
  '<p>Находи релизы в MusicBrainz, готовь обложки и публикуй целые коллекционные наборы. SoundCloud не используется.</p></div>'+
  button(ico('search')+' Music Importer','nav-import',true)+'</section>'+
  '<div class="grid-2" style="margin-top:17px"><section class="panel"><div class="panel-title"><h3>Быстрые действия</h3>'+
  '<small>WORKFLOW</small></div><div class="grid-2">'+
  [['users','Добавить артиста','Новый музыкант в базе','create-artist'],
   ['disc','Создать релиз','Альбом, EP, сингл','create-release'],
   ['image','Загрузить обложки','1024 × 1024 WebP','nav-editor'],
   ['shield','Редакция','Управление доступами','nav-team']]
   .filter(x=>x[3]!=='nav-team'||s.member.role==='owner')
   .map(([ic,title,sub,act])=>'<button class="quick-action" data-action="'+act+'">'+
   '<span class="quick-icon">'+ico(ic)+'</span><span><strong>'+title+'</strong><small>'+sub+'</small></span></button>').join('')+
   '</div></section><section class="panel"><div class="panel-title"><h3>Продолжить работу</h3>'+
   '<small>'+recent.length+' IN PROGRESS</small></div>'+
   (recent.length?'<div class="release-list">'+recent.map(r=>releaseRow(r)).join('')+'</div>':
   '<div class="empty">'+ico('check')+'<strong>Всё опубликовано</strong><p>Новых черновиков пока нет.</p></div>')+
   '</section></div>';
}
function artistGrid(){
 const rows=s.artists.filter(a=>!s.q||a.name.toLowerCase().includes(s.q.toLowerCase()));
 return pageHead('LIBRARY / 002','Артисты',
  'Исполнители, чьи релизы готовятся или уже опубликованы в FLIP.',
  button(ico('plus')+' Добавить','create-artist',true))+
  '<section class="panel"><div class="toolbar"><div class="search-wrap">'+ico('search')+
  '<input class="input search" id="global-search" value="'+esc(s.q)+'" placeholder="Найти артиста…" autocomplete="off"></div>'+
  button(ico('search')+' Music Importer','nav-import')+'</div>'+
  (rows.length?'<div class="table-wrap"><table class="data-table"><thead><tr>'+
  '<th>ИСПОЛНИТЕЛЬ</th><th>РЕЛИЗОВ</th><th>ИСТОЧНИК</th><th>ДОБАВЛЕН</th></tr></thead><tbody>'+
  rows.map(a=>'<tr data-artist-view="'+esc(a.id)+'"><td><strong>'+esc(a.name)+'</strong>'+
    '<small>'+esc(a.slug)+'</small></td><td>'+
    s.releases.filter(r=>r.artist_id===a.id).length+'</td><td>'+
    (a.mbid?'MusicBrainz':'Вручную')+'</td><td>'+date(a.created_at)+'</td></tr>').join('')+
  '</tbody></table></div>':'<div class="empty">'+ico('users')+'<strong>Ничего не найдено</strong>'+
  '<p>Добавь артиста вручную или импортируй из MusicBrainz.</p></div>')+'</section>';
}
function releaseRow(r){
 const total=releaseProgress(r.id),a=artistName(r.artist_id);
 return '<button class="release-item" type="button" data-edit-release="'+esc(r.id)+'">'+
  '<span class="release-icon">'+ico('disc')+'</span><span class="release-copy"><strong>'+
  esc(r.title)+'</strong><small>'+esc(a)+' · '+esc(r.release_type.toUpperCase())+
  ' · '+total+'/5 обложек</small></span>'+tag(r.status)+ico('chevron-right')+'</button>';
}
function releaseGrid(){
 const rows=s.releases.filter(r=>(s.filter==='all'||r.status===s.filter) &&
  (!s.q||[r.title,artistName(r.artist_id)].join(' ').toLowerCase().includes(s.q.toLowerCase())));
 return pageHead('LIBRARY / 003','Релизы',
  'Управляй альбомами, EP, микстейпами и синглами. Публикуются только полностью готовые наборы.',
  button(ico('plus')+' Новый релиз','create-release',true))+
  '<section class="panel"><div class="toolbar"><div class="search-wrap">'+ico('search')+
  '<input class="input search" id="global-search" value="'+esc(s.q)+'" placeholder="Артист или название…" autocomplete="off"></div>'+
  '<select class="input small-input" id="release-status"><option value="all">Все статусы</option>'+
  ['draft','ready','published','archived'].map(t=>'<option value="'+t+'" '+(s.filter===t?'selected':'')+'>'+
  ({draft:'Черновики',ready:'Готовые',published:'Опубликованные',archived:'Архив'}[t])+'</option>').join('')+'</select></div>'+
  (rows.length?'<div class="release-list">'+rows.map(releaseRow).join('')+'</div>':
  '<div class="empty">'+ico('disc')+'<strong>Релизы не найдены</strong><p>Измени фильтр либо импортируй дискографию.</p></div>')+'</section>';
}
function importStage(n){
 return '<div class="import-stage">'+[['ПОИСК',0],['ДИСКОГРАФИЯ',1],['ИМПОРТ',2]].map(([label,i],index)=>
  (index?'<span class="stage-sep">—</span>':'')+
  '<span class="stage-step '+(n>=i?'active':'')+'"><b>'+(i+1)+'</b>'+label+'</span>').join('')+'</div>';
}
function importer(){
 const stage=s.importArtist?(s.importReleases.length?1:0):0;
 let results='';
 if(s.importArtist){
  results='<div class="import-toolbar"><div><div class="page-kicker">SELECTED ARTIST</div>'+
   '<h3 style="margin:8px 0 4px;font:800 21px Space Grotesk">'+esc(s.importArtist.name)+'</h3>'+
   '<p class="hint">'+esc(s.importArtist.country||s.importArtist.disambiguation||'MusicBrainz')+
   ' · '+s.importCount+' найденных записей</p></div>'+
   '<button class="button sm ghost" data-action="import-reset">'+ico('chevron-left')+' Выбрать другого</button></div>'+
   (s.importReleases.length?'<div class="import-toolbar"><div class="hint">Выбрано: <b>'+
   s.importSelected.size+'</b> / '+s.importReleases.length+'</div>'+
   '<div style="display:flex;gap:8px">'+
   '<button class="button sm ghost" data-action="import-all">Выбрать все</button>'+
   '<button class="button sm ghost" data-action="import-clear">Снять выбор</button></div></div>'+
   '<div class="importer-card" style="max-height:430px;overflow:auto">'+
   s.importReleases.map(item=>'<label class="check-row"><input type="checkbox" data-import-id="'+
   esc(item.id)+'" '+(s.importSelected.has(item.id)?'checked':'')+'>'+
   '<span style="flex:1;min-width:0"><strong>'+esc(item.title)+'</strong><small>'+
   esc(item.date||'Дата неизвестна')+' · '+esc(item.type.toUpperCase())+'</small></span>'+
   '<span class="tag">'+esc(item.type.toUpperCase())+'</span></label>').join('')+'</div>'+
   '<div class="import-toolbar" style="margin-top:17px"><div>'+
   (s.importReleases.length>=100?button('Показать больше','import-more'):'')+'</div>'+
   '<button class="button primary" data-action="import-selected" '+(!s.importSelected.size||s.busy?'disabled':'')+'>'+
   ico('upload')+' Импортировать ('+s.importSelected.size+')</button></div>':
   '<div class="empty">Найденных релизов пока нет. Попробуй обновить поиск.</div>');
 }else if(s.importArtists.length){
  results='<div class="panel-title"><h3>Выбери исполнителя</h3><small>'+
   s.importArtists.length+' RESULTS</small></div>'+
   s.importArtists.map(a=>'<button class="import-artist" data-import-artist="'+esc(a.id)+'">'+
    '<span class="artist-initial">'+esc(a.name.slice(0,1))+'</span><span style="flex:1">'+
    '<strong>'+esc(a.name)+'</strong><small>'+esc([a.country,a.disambiguation].filter(Boolean).join(' · ')||'Исполнитель')+
    '</small></span><span class="tag">'+(a.score||'—')+'% MATCH</span>'+
    ico('chevron-right')+'</button>').join('');
 }else results='<div class="empty">'+ico('search')+'<strong>Найди артиста</strong>'+
 '<p>Поиск по MusicBrainz. SoundCloud полностью исключён.<br>После выбора загружаем дискографию для пакетного импорта.</p></div>';
 return pageHead('DISCOVERY / 004','Music Importer',
  'Импортируй названия, типы и даты релизов из музыкальных каталогов, без ручного набора. Ты решаешь, что публиковать.')+
  importStage(stage)+'<section class="panel"><div class="import-search">'+
  '<div class="search-wrap">'+ico('search')+
  '<input class="input search" id="music-search" value="'+esc(s.importQ)+
  '" placeholder="Например, Playboi Carti" autocomplete="off"></div>'+
  '<button class="button primary" data-action="import-find" '+(s.busy?'disabled':'')+'>'+
  ico('search')+' Найти</button></div>'+
  (s.importError?'<p style="color:var(--danger)">'+esc(s.importError)+'</p>':'')+
  results+'</section><p class="hint" style="margin-top:18px">'+ico('info',14)+
  ' Редкие и альтернативные издания иногда отсутствуют в MusicBrainz. Их можно добавить вручную.'+
  ' Система никогда не импортирует аудиофайлы.</p>';
}
async function variantPreview(v){
 if(v.public_url)return v.public_url;
 const cached=s.thumbs.get(v.thumbnail_path);
 if(cached)return cached;
 const {data,error}=await s.db.storage.from('flip-studio-drafts').createSignedUrl(v.thumbnail_path,3600);
 if(error||!data?.signedUrl)return '';
 s.thumbs.set(v.thumbnail_path,data.signedUrl);
 return data.signedUrl;
}
function editor(){
 const release=s.releases.find(r=>r.id===s.selectedRelease)||
  s.releases.find(r=>r.status!=='published')||s.releases[0];
 if(!release)return pageHead('ARTWORK / 005','Artwork Studio','Подготовка коллекционных обложек.')+
 '<div class="empty">'+ico('image')+'<strong>Пока нет релизов</strong><p>Сначала добавь релиз, затем загрузи обложки.</p>'+
 button('Music Importer','nav-import',true)+'</div>';
 s.selectedRelease=release.id;
 const own=releaseVariants(release.id);
 const count=releaseProgress(release.id),complete=count===5;
 const art=rarities.map(r=>{
  const v=own.find(x=>x.rarity===r.id);
  const image=v?(v.public_url||s.thumbs.get(v.thumbnail_path)):'';
  return '<div class="art-slot '+(v?'has-art':'')+'"><div class="art-preview">'+
    (image?'<img src="'+esc(image)+'" loading="lazy" alt="'+esc(r.label)+'">':
     ico(v?'loader':'image',35))+
    (v?'<span class="tag published">✓ WEBP</span>':'')+
    '</div><div class="art-slot-name">'+esc(r.label)+'</div>'+
    '<div class="art-slot-note">'+esc(r.desc)+'</div>'+
    (release.status==='published'?
      '<button type="button" class="button ghost" disabled>Опубликовано</button>':
      '<button type="button" class="button" data-upload-rarity="'+r.id+'">'+
      ico(v?'image':'upload')+(v?' Заменить':' Загрузить')+'</button>')+'</div>';
 }).join('');
 const right='<aside class="panel editor-side"><div class="panel-title"><h3>Данные релиза</h3>'+tag(release.status)+'</div>'+
   '<div class="field"><label>Исполнитель</label><input class="input" readonly value="'+
     esc(artistName(release.artist_id))+'"></div>'+
   '<div class="field"><label>Название</label><input class="input" id="edit-title" value="'+esc(release.title)+'" '+
     (release.status==='published'?'readonly':'')+'></div>'+
   '<div class="field"><label>Тип</label><select class="input" id="edit-type" '+(release.status==='published'?'disabled':'')+'>'+
   ['album','ep','mixtape','single','compilation','collaboration','other'].map(t=>
     '<option value="'+t+'" '+(release.release_type===t?'selected':'')+'>'+t.toUpperCase()+'</option>').join('')+
     '</select></div>'+
   '<div class="field"><label>Дата релиза</label><input class="input" id="edit-date" type="date" value="'+
     esc(release.release_date||'')+'" '+(release.status==='published'?'readonly':'')+'></div>'+
   '<div class="field"><label>Издание</label><input class="input" id="edit-edition" value="'+
     esc(release.edition||'Original')+'" '+(release.status==='published'?'readonly':'')+'></div>'+
   '<div class="field"><label>Заметки редакции</label><textarea class="input" id="edit-notes" '+
     (release.status==='published'?'readonly':'')+'>'+esc(release.notes||'')+'</textarea></div>'+
   (release.status!=='published'?
     '<button class="button full" data-action="editor-save">'+ico('check')+' Сохранить изменения</button>':'')+
   '<div class="progress-row"><span>ЗАПОЛНЕНИЕ КАРТОЧЕК</span><b>'+count+' / 5</b></div>'+
   '<div class="progress-track"><i style="width:'+(count*20)+'%"></i></div>'+
   '<p class="hint">Для публикации нужны все 5 редкостей. Hidden необязателен.</p>'+
   (release.status!=='published'&&s.member.role!=='editor'?
    '<button class="button full primary" data-action="editor-publish" '+(!complete||s.busy?'disabled':'')+'>'+
      ico('sparkles')+' Опубликовать набор</button>':'')+
   (s.member.role==='editor'?'<p class="hint">Editor готовит контент; публикацию подтверждает Admin или Owner.</p>':'')+
   '</aside>';
 return pageHead('ARTWORK / 005','Artwork Studio',
  'Один релиз — пять оформлений. Загружай изображения, кадрируй до 1024 × 1024 и просматривай перед публикацией.')+
  '<div class="toolbar"><select class="input" id="editor-release" style="max-width:min(620px,100%)">'+
  s.releases.map(r=>'<option value="'+esc(r.id)+'" '+(release.id===r.id?'selected':'')+'>'+
    esc(artistName(r.artist_id)+' — '+r.title)+'</option>').join('')+'</select>'+
  (release.status!=='published'?'<button class="button" data-action="bulk-start">'+ico('upload')+
    ' Пакетная загрузка 5 файлов</button>':'')+'</div>'+
  '<div class="editor-cols"><section class="panel"><div class="panel-title"><h3>'+
  esc(release.title)+'</h3><small>'+count+'/5 READY</small></div>'+
  '<div class="editor-options">'+art+'</div>'+
  '<p class="hint" style="margin-top:16px">'+ico('info',14)+
  ' Кадрирование, оптимизация и формирование WebP происходят до загрузки. Исходник сохраняется отдельно.</p></section>'+
  right+'</div>';
}
function team(){
 if(s.member.role!=='owner')return dashboard();
 return pageHead('ACCESS / 006','Команда',
  'Приглашай сотрудников и назначай права. Публикация и управление доступами защищены сервером.')+
  '<div class="grid-2"><section class="panel"><div class="panel-title"><h3>Пригласить участника</h3>'+
    '<small>OWNER ONLY</small></div>'+
    '<div class="field"><label>Email сотрудника</label>'+
    '<input class="input" id="invite-email" type="email" placeholder="editor@example.com"></div>'+
    '<div class="field" style="margin-top:13px"><label>Роль</label>'+
    '<select class="input" id="invite-role"><option value="editor">Editor — черновики и изображения</option>'+
    '<option value="admin">Admin — также публикация</option></select></div>'+
    '<button class="button primary full" data-action="invite-send" style="margin-top:17px">'+
    ico('plus')+' Создать код приглашения</button>'+
    '<p class="hint">SMTP не нужен. Код выдаётся только владельцу и используется сотрудником на экране входа. Любой, кто получит код, сможет войти под этим аккаунтом: отправляй его лично. Роль Owner не выдаётся.</p></section>'+
    '<section class="panel"><div class="panel-title"><h3>Участники</h3>'+
    '<button class="button sm ghost" data-action="team-refresh">Обновить</button></div>'+
    '<div id="team-members">'+loadingMarkup('Загружаем список команды…')+'</div></section></div>';
}
function activity(){
 return pageHead('HISTORY / 007','История действий',
 'Здесь сохраняются важные действия команды: активация владельца, приглашения и публикации.')+
 '<section class="panel"><div class="activity-list">'+
 (s.audit.length?s.audit.map(a=>'<div class="activity-row"><span class="quick-icon">'+
 ico('history')+'</span><div style="flex:1;min-width:0"><strong>'+
 esc({publish:'Релиз опубликован',owner_activated:'Владелец активирован',
 invite_or_change_role:'Изменены права сотрудника'}[a.action]||a.action)+'</strong><p class="hint">'+
 esc(a.entity)+' · '+esc(JSON.stringify(a.detail||{}).slice(0,175))+'</p></div>'+
 '<span class="time">'+date(a.created_at)+'</span></div>').join(''):
 '<div class="empty">'+ico('history')+'<strong>История пока пустая</strong>'+
 '<p>Опубликованные релизы и приглашения будут здесь.</p></div>')+'</div></section>';
}
function render(){
 if(!s.user){authScreen();return;}
 if(!s.member){awaitingAccess();return;}
 const pages={dashboard,artists:artistGrid,releases:releaseGrid,import:importer,editor,
  team,activity};
 app.innerHTML=layout((pages[s.current]||dashboard)());
 if(s.current==='editor')populateThumbnails();
 if(s.current==='team')refreshTeam();
}
function authScreen(message=''){
 app.innerHTML='<div class="auth-layout"><div class="auth-left">'+
  '<div class="wordmark">FLIP<span>.</span><span class="brand-sub">STUDIO / CONTENT OPERATIONS</span></div>'+
  '<div><div class="page-kicker">CREATE THE ARCHIVE</div>'+
  '<h1>Музыкальные коллекции.<br><span>На твоих условиях.</span></h1>'+
  '<p>Профессиональное пространство для поиска релизов, обработки обложек и командной публикации в FLIP.</p></div>'+
  '<div class="hint">PRIVATE WORKSPACE · SUPABASE AUTH · VERCEL</div></div>'+
  '<div class="auth-right"><div class="auth-box"><div class="page-kicker">SECURE ACCESS</div>'+
  '<h2>Вход в FLIP STUDIO</h2>'+
  '<p>Если тебя пригласили в команду, вставь код, полученный от владельца. Письмо и SMTP для этого не нужны.</p>'+
  '<label class="field"><span class="hint">EMAIL</span><input id="auth-email" class="input" type="email" autocomplete="email" placeholder="you@example.com"></label>'+
  '<button class="button primary full" data-action="auth-email" '+(!s.db||emailRequestPending||Date.now()<emailCooldownUntil?'disabled':'')+'>'+ico('arrow-right')+
  (emailRequestPending?' Отправляем письмо…':Date.now()<emailCooldownUntil?' Письмо запрошено':' Продолжить с email')+'</button>'+
  (message?'<p style="color:var(--warning)">'+esc(message)+'</p>':'')+
  (!s.db?'<button class="button full ghost" data-action="boot-retry" style="margin-top:10px">'+
  ico('history')+' Повторить подключение</button>':'')+
  '<div style="border-top:1px solid #3b513d;margin-top:22px;padding-top:20px" class="field">'+
  '<label>КОД ПРИГЛАШЕНИЯ</label><input id="studio-invite-code" type="password" class="input" autocomplete="off" '+
  'placeholder="Вставь код от владельца FLIP STUDIO">'+
  '<button class="button full" data-action="auth-invite-code" '+(!s.db||inviteCodePending?'disabled':'')+'>'+
  ico('shield')+' Войти по приглашению</button>'+
  '<p class="hint">Не нажимай «Продолжить с email», если получил код. Код одноразовый и заменяет письмо.</p></div>'+
  '<p class="hint" style="margin-top:19px">Доступ разрешён только участникам с активной ролью. Игровой администратор FLIP остаётся отдельным.</p>'+
  '</div></div></div>';
}
function awaitingAccess(){
 app.innerHTML='<div class="auth-layout"><div class="auth-left">'+
 '<div class="wordmark">FLIP<span>.</span><span class="brand-sub">STUDIO / AUTHENTICATION</span></div>'+
 '<div><h1>Аккаунт подтверждён.<br><span>Проверяем доступ.</span></h1>'+
 '<p>Ты вошёл как '+esc(s.user.email||'пользователь')+'. Для доступа нужна роль сотрудника или подтверждение владельца через FLIP.</p></div></div>'+
 '<div class="auth-right"><div class="auth-box"><div class="page-kicker">ACCESS MANAGEMENT</div>'+
 '<h2>'+ (s.ownerTicket?'Привязать владельца':'Ожидается приглашение')+'</h2>'+
 (s.ownerTicket?'<p>Ты перешёл из защищённой админки FLIP. Нажми кнопку, чтобы подтвердить права владельца.</p>'+
   '<button class="button primary full" data-action="claim-owner">'+ico('shield')+' Подтвердить владельца</button>':
   '<p>Попроси владельца пригласить тебя в разделе «Команда». Если это твоя первая настройка STUDIO, открой игровую админку FLIP и нажми «Открыть STUDIO».</p>')+
 '<div class="field" style="margin-top:14px"><label>КОД ВЛАДЕЛЬЦА (если входишь из другого браузера)</label>'+
 '<input id="owner-claim-code" class="input" type="password" autocomplete="off" placeholder="Вставь код из FLIP"></div>'+
 '<button class="button primary full" data-action="claim-owner" style="margin-top:10px">'+ico('shield')+' Активировать с кодом</button>'+
 '<button class="button full ghost" style="margin-top:12px" data-action="access-refresh">'+ico('history')+' Проверить доступ</button>'+
 '<button class="button full ghost" data-action="logout" style="margin-top:8px">Выйти</button>'+
 '</div></div></div>';
}
async function loadData(){
 const queries=await Promise.all([
  s.db.from('flip_studio_artists').select('*').order('name').limit(1000),
  s.db.from('flip_studio_releases').select('*').order('updated_at',{ascending:false}).limit(1500),
  s.db.from('flip_studio_variants').select('*').limit(3000),
  s.db.from('flip_studio_audit').select('*').order('created_at',{ascending:false}).limit(70)
 ]);
 for(const q of queries)if(q.error)throw q.error;
 [s.artists,s.releases,s.variants,s.audit]=queries.map(q=>q.data||[]);
}
async function refreshIdentity(){
 const {data:{user}}=await s.db.auth.getUser();
 s.user=user||null;
 if(!user){s.member=null;render();return;}
 const {data,error}=await s.db.from('flip_studio_members').select('*').eq('user_id',user.id).maybeSingle();
 if(error)throw error;
 s.member=data?.active?data:null;
 if(s.member)await loadData();
 render();
}
async function signIn(){
 // Lock synchronously before awaiting Supabase to prevent a duplicate OTP.
 if(emailRequestPending)return;
 if(Date.now()<emailCooldownUntil){
  notice('Повторная отправка пока недоступна. Проверь почту и «Спам».');
  return;
 }
 const email=String($('#auth-email')?.value||'').trim();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
   return notice('Укажи корректный email.',true);
 if(!s.db)return notice('Подключение ещё не готово. Попробуй повторить запуск.',true);
 emailRequestPending=true;
 const button=$('[data-action="auth-email"]');
 if(button){button.disabled=true;button.textContent='Отправляем письмо…'}
 let feedback='';
 try{
  const {error}=await s.db.auth.signInWithOtp({email,options:{
    emailRedirectTo:window.location.origin,shouldCreateUser:true
  }});
  if(error)throw error;
  emailCooldownUntil=Date.now()+30000;
  feedback='Запрос принят. Проверь входящие, «Спам» и «Промоакции». Новое письмо пока запрашивать не нужно.';
  notice('Письмо для входа запрошено. Проверь почту.');
 }catch(e){
  const message=String(e?.message||'');
  if(/only request this after|rate limit|too many requests/i.test(message)){
   // Previous OTP can still be valid. Never label it a failed delivery.
   emailCooldownUntil=Date.now()+30000;
   feedback='Supabase временно ограничил повторную отправку. Возможно, первое письмо уже пришло. Проверь почту.';
   notice('Слишком частые запросы: проверь первое письмо или повтори позже.',true);
  }else{
   feedback='Не удалось запросить письмо: '+formatError(e);
   notice(feedback,true);
  }
 }finally{
  // Reset state BEFORE rebuilding the form; otherwise the button remains in
  // an infinite "Отправляем письмо…" state even after Supabase responds.
  emailRequestPending=false;
  if(!s.user){
   authScreen(feedback);
   const input=$('#auth-email');
   if(input)input.value=email;
   clearTimeout(emailUnlockTimer);
   const remaining=Math.max(0,emailCooldownUntil-Date.now());
   if(remaining>0){
    emailUnlockTimer=setTimeout(()=>{
     if(s.user||emailRequestPending)return;
     const retryButton=$('[data-action="auth-email"]');
     if(retryButton){
      retryButton.disabled=false;
      retryButton.innerHTML=ico('arrow-right')+' Отправить ещё раз';
     }
    },remaining+100);
   }
  }
 }
}

async function acceptInviteCode(){
 if(inviteCodePending||!s.db)return;
 const secret=String($('#studio-invite-code')?.value||'').trim();
 const match=/^(invite|magiclink)\.([a-zA-Z0-9_-]{32,256})$/.exec(secret);
 if(!match)return notice('Вставь полный код приглашения, полученный от владельца.',true);
 inviteCodePending=true;
 const btn=$('[data-action="auth-invite-code"]');
 if(btn){btn.disabled=true;btn.textContent='Проверяем код…'}
 try{
   // verifyOtp redeems the hashed token directly, with no SMTP or GET link
   // that could be prematurely consumed by Telegram previews.
   const {data,error}=await s.db.auth.verifyOtp({token_hash:match[2],type:match[1]});
   if(error)throw error;
   if(!data?.session)throw new Error('Сессия не создана. Запроси новый код у владельца.');
   const field=$('#studio-invite-code');if(field)field.value='';
   await refreshIdentity();
   notice('Успешный вход в FLIP STUDIO.');
 }catch(e){
   const msg=String(e?.message||'');
   const meaningful=/expired|invalid|used|not found|otp/i.test(msg)?
     'Код устарел или уже использован. Попроси владельца создать новый.':
     'Не удалось войти по коду: '+formatError(e);
   notice(meaningful,true);
 }finally{
   inviteCodePending=false;
   if(btn?.isConnected){btn.disabled=false;btn.innerHTML=ico('shield')+' Войти по приглашению'}
 }
}
async function claimOwner(){
 const ticket=String($('#owner-claim-code')?.value||'').trim()||s.ownerTicket;
 if(!ticket)return notice('Вставь код владельца из админки FLIP.',true);
 try{
  const r=await invoke('owner',{ticket});
  if(!r.ok)throw new Error('INVALID_OWNER_TICKET');
  localStorage.removeItem('flip_studio_claim');s.ownerTicket='';
  notice('Владелец FLIP STUDIO подтверждён.');
  await refreshIdentity();
 }catch(e){notice(formatError(e),true)}
}
function go(page){
 if(!nav.some(x=>x[0]===page))return;
 if(page==='team'&&s.member?.role!=='owner')return;
 s.q='';s.filter='all';s.current=page;
 render();
 window.scrollTo({top:0,behavior:'instant'});
}
function modal(title,body,footer=''){
 const old=$('#studio-modal');if(old)old.remove();
 const node=document.createElement('div');node.id='studio-modal';node.className='crop-overlay';
 node.innerHTML='<section class="crop-dialog" style="max-width:520px" role="dialog" aria-modal="true">'+
 '<div class="panel-title"><h3>'+esc(title)+'</h3>'+
 '<button class="button sm ghost" data-action="modal-close">'+ico('x')+'</button></div>'+
 body+'<div class="crop-actions">'+
 '<button class="button ghost" data-action="modal-close">Отмена</button>'+footer+'</div></section>';
 document.body.append(node);
}
function openCreateArtist(){
 modal('Новый артист','<div class="field"><label>Имя артиста</label>'+
 '<input id="new-artist-name" class="input" placeholder="Например, Nettspend"></div>'+
 '<p class="hint">Название и постоянный ID генерируются автоматически. MusicBrainz ID можно связать позже.</p>',
 '<button class="button primary" data-action="create-artist-save">Добавить артиста</button>');
}
function openCreateRelease(){
 if(!s.artists.length)return notice('Сначала добавь артиста.',true);
 modal('Новый релиз','<div class="field"><label>Артист</label><select class="input" id="new-release-artist">'+
  s.artists.map(a=>'<option value="'+esc(a.id)+'">'+esc(a.name)+'</option>').join('')+'</select></div>'+
  '<div class="field" style="margin-top:13px"><label>Название релиза</label>'+
  '<input class="input" id="new-release-title" placeholder="Название альбома или сингла"></div>'+
  '<div class="field" style="margin-top:13px"><label>Тип</label><select class="input" id="new-release-type">'+
  ['album','ep','mixtape','single','compilation','collaboration','other'].map(t=>
  '<option value="'+t+'">'+t.toUpperCase()+'</option>').join('')+'</select></div>',
  '<button class="button primary" data-action="create-release-save">Создать черновик</button>');
}
function closeModal(){const n=$('#studio-modal');if(n)n.remove()}
async function createArtist(){
 const name=String($('#new-artist-name')?.value||'').trim();
 if(name.length<2)return notice('Введите имя артиста.',true);
 const id=s.user.id;let base=generateSlug(name),attempt=0;
 try{
  while(attempt<12){
   const artistSlug=attempt?base+'-'+(attempt+1):base;
   const {data,error}=await s.db.from('flip_studio_artists').insert({
    name,slug:artistSlug,created_by:id
   }).select().single();
   if(!error){closeModal();await loadData();go('artists');notice('Артист добавлен.');return}
   if(error.code!=='23505')throw error;
   attempt++;
  }
  throw new Error('Слишком много совпадающих названий.');
 }catch(e){notice(formatError(e),true)}
}
async function createRelease(){
 const artist_id=$('#new-release-artist')?.value;
 const title=String($('#new-release-title')?.value||'').trim();
 const release_type=$('#new-release-type')?.value||'album';
 if(!artist_id||title.length<1)return notice('Укажи артиста и название.',true);
 try{
  const base=generateSlug(title);
  for(let attempt=0;attempt<12;attempt++){
   const next=attempt?base+'-'+(attempt+1):base;
   const {data,error}=await s.db.from('flip_studio_releases').insert({
    artist_id,title,release_type,slug:next,status:'draft',created_by:s.user.id
   }).select().single();
   if(!error){
    closeModal();await loadData();s.selectedRelease=data.id;go('editor');
    notice('Релиз создан как черновик.');return;
   }
   if(error.code!=='23505')throw error;
  }
  throw new Error('Не удалось создать уникальный ID');
 }catch(e){notice(formatError(e),true)}
}
async function findArtists(){
 if(s.importQ.trim().length<2)return notice('Введите хотя бы две буквы.',true);
 s.busy=true;s.importError='';
 try{
  const {artists}=await invoke('music?kind=artists&q='+encodeURIComponent(s.importQ.trim()));
  s.importArtists=artists||[];s.importArtist=null;s.importReleases=[];s.importSelected.clear();
 }catch(e){s.importError=formatError(e);notice(s.importError,true)}
 s.busy=false;render();
}
async function selectMusicArtist(id){
 const artist=s.importArtists.find(a=>a.id===id);if(!artist)return;
 s.importArtist=artist;s.importReleases=[];s.importSelected.clear();s.importPage=0;
 render();await fetchReleases();
}
async function fetchReleases(more=false){
 if(!s.importArtist)return;
 s.busy=true;s.importError='';
 try{
  const result=await invoke('music?kind=releases&id='+encodeURIComponent(s.importArtist.id)+
    '&page='+s.importPage);
  const seen=new Set(s.importReleases.map(x=>x.id));
  s.importReleases.push(...(result.releases||[]).filter(x=>!seen.has(x.id)));
  s.importCount=result.count||s.importReleases.length;
  s.importPage++;
 }catch(e){s.importError=formatError(e);notice(s.importError,true)}
 s.busy=false;render();
}
async function importSelected(){
 if(s.busy||!s.importArtist||!s.importSelected.size)return;
 const artist=s.importArtist,items=s.importReleases.filter(x=>s.importSelected.has(x.id));
 if(!window.confirm('Импортировать '+items.length+' релизов артиста '+artist.name+
  ' в черновики? Дубликаты будут пропущены.'))return;
 s.busy=true;render();
 try{
  let created=0,skipped=0,failed=0;
  let record=s.artists.find(a=>a.mbid===artist.id);
  if(!record){
   const base=generateSlug(artist.name);let error;
   for(let attempt=0;attempt<12;attempt++){
    const slugged=attempt?base+'-'+(attempt+1):base;
    const result=await s.db.from('flip_studio_artists').insert({
      name:artist.name,slug:slugged,mbid:artist.id,created_by:s.user.id
    }).select().single();
    if(!result.error){record=result.data;break}
    error=result.error;
    if(error.code==='23505'){
      const same=await s.db.from('flip_studio_artists').select('*').eq('mbid',artist.id).maybeSingle();
      if(same.data){record=same.data;break}
    }else throw error;
   }
   if(!record)throw error||new Error('Не удалось импортировать артиста');
  }
  const other=s.releases.filter(r=>r.artist_id===record.id);
  for(const item of items){
   if(other.some(r=>r.mbid===item.id)){skipped++;continue}
   const base=generateSlug(item.title);
   let saved=false;
   for(let suffix=0;suffix<10;suffix++){
    const releaseSlug=suffix?base+'-'+(suffix+1):base;
    const res=await s.db.from('flip_studio_releases').insert({
      artist_id:record.id,slug:releaseSlug,title:item.title,release_type:item.type,
      release_date:/^\d{4}-\d{2}-\d{2}$/.test(item.date)?item.date:null,
      mbid:item.id,edition:'Original',created_by:s.user.id,status:'draft'
    });
    if(!res.error){created++;saved=true;break}
    if(res.error.code==='23505'){
      const existing=await s.db.from('flip_studio_releases').select('id').eq('mbid',item.id).maybeSingle();
      if(existing.data){skipped++;saved=true;break}
    }else{failed++;saved=true;break}
   }
   if(!saved)failed++;
  }
  await loadData();s.importSelected.clear();
  notice('Импорт готов: '+created+' новых, '+skipped+' пропущено, '+failed+' ошибок.',
    failed>0);
  go('releases');
 }catch(e){notice(formatError(e),true)}
 finally{s.busy=false}
}
async function saveRelease(){
 const r=s.releases.find(x=>x.id===s.selectedRelease);
 if(!r||r.status==='published')return;
 const title=String($('#edit-title')?.value||'').trim();
 const release_type=$('#edit-type')?.value,release_date=$('#edit-date')?.value||null;
 const edition=String($('#edit-edition')?.value||'').trim();
 const notes=String($('#edit-notes')?.value||'').trim();
 if(!title||!edition)return notice('Название и издание обязательны.',true);
 try{
  const change={title,release_type,release_date,edition,notes,revision:r.revision+1,
   updated_at:new Date().toISOString()};
  const {data,error}=await s.db.from('flip_studio_releases').update(change)
   .eq('id',r.id).eq('revision',r.revision).select('id');
  if(error)throw error;
  if(!data?.length)throw new Error('Этот релиз уже изменил другой редактор. Обнови страницу.');
  await loadData();render();notice('Изменения сохранены.');
 }catch(e){notice(formatError(e),true)}
}
async function publishRelease(){
 const r=s.releases.find(x=>x.id===s.selectedRelease);
 if(!r||s.member.role==='editor')return;
 if(releaseProgress(r.id)!==5)return notice('Сначала подготовь все 5 основных обложек.',true);
 if(!window.confirm('Опубликовать «'+r.title+'»? После публикации все 5 карточек попадут в доступный каталог FLIP.'))return;
 s.busy=true;render();
 try{
  const result=await invoke('manage',{action:'publish',releaseId:r.id});
  if(!result.ok)throw new Error('PUBLISH_FAILED');
  await loadData();render();notice('Релиз опубликован в FLIP!');
 }catch(e){notice(formatError(e),true)}
 finally{s.busy=false;render()}
}
async function populateThumbnails(){
 const id=s.selectedRelease;
 const current=releaseVariants(id).filter(v=>!v.public_url&&!s.thumbs.has(v.thumbnail_path));
 await Promise.all(current.map(async v=>{try{await variantPreview(v)}catch{}}));
 if(s.current==='editor'&&s.selectedRelease===id)renderThumbnailDOM(id);
}
function renderThumbnailDOM(id){
 for(const v of releaseVariants(id)){
  const src=v.public_url||s.thumbs.get(v.thumbnail_path);
  if(!src)continue;
  const button=$('[data-upload-rarity="'+v.rarity+'"]');
  const slot=button?.closest('.art-slot')||
   Array.from(document.querySelectorAll('.art-slot')).find(el=>el.querySelector('.art-slot-name')?.textContent.toLowerCase()===v.rarity);
  const preview=slot?.querySelector('.art-preview');
  if(preview&& !preview.querySelector('img'))preview.innerHTML='<img src="'+esc(src)+
   '" alt="'+esc(v.rarity)+'" loading="lazy"><span class="tag published">✓ WEBP</span>';
 }
}
let imageBitmap=null,uploadRarity=null,uploadFile=null,crop={zoom:1,x:0,y:0};
async function imageToBitmap(file){
 if(typeof createImageBitmap==='function')return createImageBitmap(file);
 const url=URL.createObjectURL(file);
 try{
  const img=new Image();
  await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=url});
  return img;
 }finally{URL.revokeObjectURL(url)}
}
function croppingCanvas(size=1024){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
 const ctx=canvas.getContext('2d',{alpha:false});
 if(!ctx||!imageBitmap)throw new Error('Canvas недоступен');
 const w=imageBitmap.width,h=imageBitmap.height;
 const source=Math.min(w,h)/crop.zoom;
 const sx=(w-source)*clamp01(.5+crop.x/200);
 const sy=(h-source)*clamp01(.5+crop.y/200);
 ctx.drawImage(imageBitmap,sx,sy,source,source,0,0,size,size);
 return canvas;
}
const clamp01=n=>Math.max(0,Math.min(1,n));
function paintCrop(){
 const display=$('#crop-preview');
 if(!display||!imageBitmap)return;
 const sample=croppingCanvas(420),ctx=display.getContext('2d');
 ctx.clearRect(0,0,420,420);ctx.drawImage(sample,0,0);
}
function openCrop(file,rarity){
 if(!file||!['image/png','image/jpeg','image/webp'].includes(file.type))
  return notice('Разрешены только PNG, JPG, WebP.',true);
 if(file.size>15*1024*1024)return notice('Максимальный исходный файл — 15 МБ.',true);
 uploadFile=file;uploadRarity=rarity;crop={zoom:1,x:0,y:0};
 const overlay=document.createElement('div');
 overlay.className='crop-overlay';overlay.id='crop-overlay';
 overlay.innerHTML='<div class="crop-dialog"><div class="panel-title"><div><div class="page-kicker">'+
  'ARTWORK PIPELINE / 1024</div><h2 style="margin-top:8px">Кадрирование · '+esc(rarity)+
  '</h2></div><button class="button sm ghost" data-action="crop-cancel">'+ico('x')+'</button></div>'+
  '<div class="crop-body"><div class="crop-frame" id="crop-frame"><canvas id="crop-preview" width="420" height="420"></canvas></div>'+
  '<div class="crop-control"><div class="field"><label>Масштаб</label>'+
  '<input type="range" id="crop-zoom" min="1" max="3" step=".02" value="1"></div>'+
  '<div class="field"><label>Положение X</label>'+
  '<input type="range" id="crop-x" min="-100" max="100" value="0"></div>'+
  '<div class="field"><label>Положение Y</label>'+
  '<input type="range" id="crop-y" min="-100" max="100" value="0"></div>'+
  '<p class="hint">Перетащи изображение в квадрате. Готовый файл: 1024 × 1024 WebP. Оригинал тоже сохранится.</p>'+
  '<div class="tag">SOURCE · '+esc(file.name)+' · '+Math.round(file.size/1024)+' KB</div></div></div>'+
  '<div class="crop-actions"><button class="button ghost" data-action="crop-cancel">Отмена</button>'+
  '<button class="button primary" id="crop-save" data-action="crop-save">'+
  ico('upload')+' Обработать и загрузить</button></div></div>';
 document.body.append(overlay);
 imageToBitmap(file).then(bitmap=>{imageBitmap=bitmap;paintCrop()}).catch(e=>{
  notice('Не удалось открыть изображение: '+formatError(e),true);cancelCrop()
 });
 let start=null;
 const frame=overlay.querySelector('#crop-frame');
 frame.addEventListener('pointerdown',e=>{
  start={x:e.clientX,y:e.clientY,panX:crop.x,panY:crop.y,id:e.pointerId};
  frame.setPointerCapture?.(e.pointerId);
 });
 frame.addEventListener('pointermove',e=>{
  if(!start||start.id!==e.pointerId)return;
  const size=frame.clientWidth||420;
  crop.x=Math.max(-100,Math.min(100,start.panX-(e.clientX-start.x)/size*200));
  crop.y=Math.max(-100,Math.min(100,start.panY-(e.clientY-start.y)/size*200));
  $('#crop-x').value=String(crop.x);$('#crop-y').value=String(crop.y);
  paintCrop();
 });
 const end=()=>{start=null};
 frame.addEventListener('pointerup',end);frame.addEventListener('pointercancel',end);
}
function cancelCrop(){
 $('#crop-overlay')?.remove();
 imageBitmap?.close?.();imageBitmap=null;uploadFile=null;uploadRarity=null;
}
async function canvasBlob(canvas,quality=.9){
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',quality));
 if(!blob||blob.type!=='image/webp')throw new Error('Этот браузер не поддерживает WebP. Обнови Safari/Chrome.');
 return blob;
}
async function uploadImage(file,rarity,opts={zoom:1,x:0,y:0}){
 if(!s.selectedRelease)throw new Error('Выбери релиз');
 const r=s.releases.find(x=>x.id===s.selectedRelease);
 if(!r||r.status==='published')throw new Error('Опубликованный релиз недоступен для замены');
 if(!imageBitmap)imageBitmap=await imageToBitmap(file);
 crop=opts;
 const processed=await canvasBlob(croppingCanvas(1024),.91);
 const thumb=await canvasBlob(croppingCanvas(384),.77);
 const folder=s.user.id+'/'+r.id+'/'+rarity+'/'+crypto.randomUUID();
 const originalExt=file.type==='image/png'?'png':file.type==='image/jpeg'?'jpg':'webp';
 const parts=[
  {path:folder+'-original.'+originalExt,data:file,contentType:file.type},
  {path:folder+'-1024.webp',data:processed,contentType:'image/webp'},
  {path:folder+'-thumb.webp',data:thumb,contentType:'image/webp'}
 ];
 for(const obj of parts){
  const {error}=await s.db.storage.from('flip-studio-drafts').upload(obj.path,obj.data,{
   contentType:obj.contentType,cacheControl:'3600',upsert:false
  });
  if(error)throw error;
 }
 const {error:saveError}=await s.db.from('flip_studio_variants').upsert({
  release_id:r.id,rarity,original_path:parts[0].path,
  processed_path:parts[1].path,thumbnail_path:parts[2].path,
  public_url:null,uploaded_by:s.user.id,updated_at:new Date().toISOString()
 },{onConflict:'release_id,rarity'});
 if(saveError)throw saveError;
 s.thumbs.delete(parts[2].path);
}
async function saveCrop(){
 if(!uploadFile||!uploadRarity||s.busy)return;
 const file=uploadFile,rarity=uploadRarity;
 const options={...crop};
 s.busy=true;
 const btn=$('#crop-save');if(btn){btn.disabled=true;btn.textContent='Сохраняем файлы…'}
 try{
  await uploadImage(file,rarity,options);
  cancelCrop();await loadData();render();notice('Обложка '+rarity+' сохранена в 1024 × 1024.');
 }catch(e){notice('Ошибка загрузки: '+formatError(e),true)}
 finally{s.busy=false}
}
async function bulkUpload(files){
 if(files.length<2)return notice('Для пакетной загрузки выбери 2–5 изображений.',true);
 if(files.length>5)return notice('Пакетная загрузка поддерживает до 5 файлов.',true);
 const list=mainRarities.slice(0,files.length);
 if(!window.confirm('Файлы будут загружены по порядку: '+list.join(' → ')+
   '. Неквадратные изображения обрежутся по центру. Продолжить?'))return;
 s.busy=true;render();
 let done=0;
 try{
  for(let n=0;n<files.length;n++){
   const f=files[n];
   if(!['image/png','image/jpeg','image/webp'].includes(f.type)||f.size>15*1024*1024)
    throw new Error('Неподдерживаемый файл: '+f.name);
   imageBitmap=await imageToBitmap(f);
   await uploadImage(f,list[n]);
   imageBitmap?.close?.();imageBitmap=null;
   done++;
   notice('Загружено '+done+' / '+files.length+' обложек');
  }
  await loadData();render();notice('Пакетная загрузка завершена.');
 }catch(e){notice('Загружено '+done+' файлов. Ошибка: '+formatError(e),true)}
 finally{imageBitmap?.close?.();imageBitmap=null;s.busy=false;render()}
}
async function inviteMember(){
 const email=String($('#invite-email')?.value||'').trim(),role=$('#invite-role')?.value||'editor';
 if(!email||!window.confirm('Создать одноразовый код входа для '+email+' с ролью '+role+'?'))return;
 const btn=$('[data-action="invite-send"]');
 if(btn){btn.disabled=true;btn.textContent='Создаём код…'}
 try{
  const result=await invoke('manage',{action:'invite',email,role});
  if(!result?.inviteCode||result.delivery!=='copy_code')throw new Error('INVITE_LINK_UNAVAILABLE');
  // A credential, not a permanent invite ID. Display only in a transient
  // dialog; never save to storage, browser history or any database column.
  modal('Код приглашения',
   '<p class="hint">Код создан для <strong>'+esc(result.email)+
   '</strong> с ролью <strong>'+esc(result.role.toUpperCase())+
   '</strong>. Отправь его лично этому человеку, не публикуй в группах.</p>'+
   '<div class="field"><label>ОДНОРАЗОВЫЙ КОД</label>'+
   '<input id="studio-team-invite-code" class="input" type="password" readonly value="'+
   esc(result.inviteCode)+'"></div>'+
   '<p class="hint">Сотрудник открывает FLIP STUDIO, вставляет этот код в поле «Код приглашения»'+
   ' и нажимает «Войти по приглашению». Почта и SMTP не используются. Код сгорает после входа.</p>',
   '<button class="button primary" data-action="invite-copy">'+ico('copy')+' Скопировать код</button>');
  notice('Код создан. Отправь его сотруднику.');
  refreshTeam();
 }catch(e){notice('Не удалось создать код: '+formatError(e),true)}
 finally{if(btn?.isConnected){btn.disabled=false;btn.innerHTML=ico('plus')+' Создать код приглашения'}}
}
async function copyInviteLink(){
 const field=$('#studio-team-invite-code');if(!field?.value)return;
 try{
  await navigator.clipboard.writeText(field.value);
  notice('Код скопирован. Отправь его лично приглашённому сотруднику.');
 }catch(e){
  field.type='text';field.select();
  notice('Автокопирование недоступно. Скопируй выделенный код вручную.');
 }
}
async function refreshTeam(){
 if(s.member?.role!=='owner')return;
 try{
  const {members}=await invoke('manage');
  const node=$('#team-members');if(!node)return;
  node.innerHTML=(members?.length?members.map(m=>
   '<div class="member-row"><div><strong>'+esc(m.email)+'</strong><small>'+
   date(m.created_at)+'</small></div><span class="tag">'+esc(m.role.toUpperCase())+
   '</span><span class="tag '+(m.active?'published':'archived')+'">'+(m.active?'ACTIVE':'INACTIVE')+
   '</span></div>').join(''):
   '<div class="empty">Сотрудники ещё не приглашены.</div>');
 }catch(e){notice('Не удалось загрузить команду: '+formatError(e),true)}
}
document.addEventListener('click',async event=>{
 const navTarget=event.target.closest('[data-nav]');
 if(navTarget){go(navTarget.dataset.nav);return;}
 const artist=event.target.closest('[data-artist-view]');
 if(artist){
  s.q='';s.current='releases';s.releases=s.releases.sort((a,b)=>
   (a.artist_id===artist.dataset.artistView?0:1)-(b.artist_id===artist.dataset.artistView?0:1));
  render();return;
 }
 const release=event.target.closest('[data-edit-release]');
 if(release){s.selectedRelease=release.dataset.editRelease;go('editor');return;}
 const upload=event.target.closest('[data-upload-rarity]');
 if(upload){
  uploadRarity=upload.dataset.uploadRarity;
  $('#single-upload').value='';$('#single-upload').click();return;
 }
 const act=event.target.closest('[data-action]')?.dataset.action;
 if(!act)return;
 if(act.startsWith('nav-'))return go(act.slice(4));
 switch(act){
  case 'auth-email':await signIn();break;
  case 'auth-invite-code':await acceptInviteCode();break;
  case 'boot-retry':await boot();break;
  case 'claim-owner':await claimOwner();break;
  case 'access-refresh':try{await refreshIdentity();notice('Права обновлены.')}catch(e){notice(formatError(e),true)}break;
  case 'logout':await s.db?.auth.signOut();s.user=null;s.member=null;render();break;
  case 'create-artist':openCreateArtist();break;
  case 'create-release':openCreateRelease();break;
  case 'create-artist-save':await createArtist();break;
  case 'create-release-save':await createRelease();break;
  case 'modal-close':closeModal();break;
  case 'import-find':await findArtists();break;
  case 'import-reset':s.importArtist=null;s.importReleases=[];s.importSelected.clear();render();break;
  case 'import-all':s.importSelected=new Set(s.importReleases.map(x=>x.id));render();break;
  case 'import-clear':s.importSelected.clear();render();break;
  case 'import-more':await fetchReleases(true);break;
  case 'import-selected':await importSelected();break;
  case 'editor-save':await saveRelease();break;
  case 'editor-publish':await publishRelease();break;
  case 'bulk-start':$('#bulk-upload').value='';$('#bulk-upload').click();break;
  case 'crop-cancel':cancelCrop();break;
  case 'crop-save':await saveCrop();break;
  case 'invite-send':await inviteMember();break;
  case 'invite-copy':await copyInviteLink();break;
  case 'team-refresh':await refreshTeam();break;
 }
});
document.addEventListener('change',event=>{
 const el=event.target;
 if(el.id==='release-status'){s.filter=el.value;render()}
 if(el.id==='editor-release'){s.selectedRelease=el.value;render()}
 if(el.hasAttribute('data-import-id')){
  if(el.checked)s.importSelected.add(el.dataset.importId);
  else s.importSelected.delete(el.dataset.importId);
  // Update count without resetting focus/scroll inside the checkbox list.
  const b=$('[data-action="import-selected"]');
  if(b){b.disabled=!s.importSelected.size;b.innerHTML=ico('upload')+
    ' Импортировать ('+s.importSelected.size+')'}
 }
 if(el.id==='single-upload'&&el.files?.length)openCrop(el.files[0],uploadRarity);
 if(el.id==='bulk-upload'&&el.files?.length)bulkUpload(Array.from(el.files));
});
document.addEventListener('input',event=>{
 const el=event.target;
 if(el.id==='global-search'){
  s.q=el.value;
  const pos=el.selectionStart;
  render();
  const input=$('#global-search');
  if(input){input.focus();input.setSelectionRange(pos,pos)}
 }
 if(el.id==='music-search')s.importQ=el.value;
 if(['crop-zoom','crop-x','crop-y'].includes(el.id)){
  crop.zoom=Number($('#crop-zoom').value);
  crop.x=Number($('#crop-x').value);crop.y=Number($('#crop-y').value);
  paintCrop();
 }
});
document.addEventListener('keydown',event=>{
 if(event.key==='Enter'&&event.target.id==='music-search'){event.preventDefault();findArtists()}
 if(event.key==='Enter'&&event.target.id==='auth-email'){event.preventDefault();signIn()}
 if(event.key==='Enter'&&event.target.id==='studio-invite-code'){event.preventDefault();acceptInviteCode()}
 if(event.key==='Escape'&&$('#crop-overlay')){cancelCrop()}
 else if(event.key==='Escape'&&$('#studio-modal'))closeModal();
});
async function boot(){
 app.innerHTML='<div class="boot"><span class="boot-logo">FLIP<span>.</span></span>'+
 '<p>ПОДКЛЮЧАЕМ STUDIO</p><span class="boot-spinner"></span></div>';
 const url=new URL(location.href),ticket=url.searchParams.get('claim');
 if(ticket&&ticket.length<1024){
  s.ownerTicket=ticket;
  try{localStorage.setItem('flip_studio_claim',ticket)}catch{}
 }
 if(ticket){url.searchParams.delete('claim');history.replaceState(null,'',url.pathname+url.search+url.hash)}
 try{
  const res=await fetch('/api/config',{cache:'no-store',
   signal:AbortSignal.timeout(10000)}),data=await res.json();
  if(!res.ok)throw new Error(data.error||'STUDIO_CONFIG_MISSING');
  s.db=createClient(data.supabaseUrl,data.publishableKey,{
   auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
  });
  const {data:sessionData}=await Promise.race([
   s.db.auth.getSession(),
   new Promise((_,reject)=>setTimeout(()=>reject(new Error('SESSION_TIMEOUT')),10000))
  ]);
  if(sessionData.session){await refreshIdentity()}else authScreen();
  s.db.auth.onAuthStateChange((event,session)=>{
   if(event==='SIGNED_IN'&&session)queueMicrotask(()=>refreshIdentity().catch(e=>notice(formatError(e),true)));
   if(event==='SIGNED_OUT'){s.user=null;s.member=null;render()}
  });
 }catch(e){
   s.db=null;
   const details=(e?.name==='TimeoutError'||e?.name==='AbortError'||e?.message==='SESSION_TIMEOUT')?
     'Сервер не отвечает. Попробуй повторить подключение.':
     'Не удалось запустить STUDIO: '+formatError(e);
   authScreen(details);
 }
}
boot();
