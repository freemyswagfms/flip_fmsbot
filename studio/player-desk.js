/* FLIP STUDIO — Owner player directory view only.
 * Real authorization and every write live in the signed server API. */
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=n=>Number(n||0).toLocaleString('ru-RU');
const date=value=>value?new Date(value).toLocaleDateString('ru-RU'):'—';
const label=p=>p.username?'@'+p.username:p.first_name||'Игрок';
const stat=(key,value)=>'<div class="stat"><div class="stat-label">'+
 esc(key)+'</div><div class="stat-value">'+num(value)+'</div></div>';
const pager=(offset,total,size,prefix)=>'<div class="player-pager">'+
 '<button class="button sm ghost" data-action="'+prefix+'-prev" '+(offset<=0?'disabled':'')+'>← Назад</button>'+
 '<span>'+(total?num(offset+1):'0')+'–'+num(Math.min(total,offset+size))+
 ' из '+num(total)+'</span>'+
 '<button class="button sm ghost" data-action="'+prefix+'-next" '+
 (offset+size>=total?'disabled':'')+'>Далее →</button></div>';

export function playerRows(state){
 const list=state.playerList||[];
 return (list.length?list.map(p=>
  '<div class="player-list-row"><div class="player-list-main"><strong>'+esc(label(p))+
  '</strong><small>ID '+esc(p.id)+' · LVL '+num(p.level)+
  ' · '+num(p.balance)+' F</small></div>'+
  '<span class="tag '+(p.banned?'archived':'published')+'">'+
  (p.banned?'ЗАБЛОКИРОВАН':'АКТИВЕН')+'</span>'+
  '<button class="button sm" data-player-open="'+esc(p.id)+'">Открыть →</button></div>'
 ).join(''):'<div class="empty"><strong>Игроки не найдены</strong></div>')+
 pager(state.playerOffset,state.playerTotal,25,'players');
}

export function playerListPage(state){
 return '<div class="heading-row"><div><div class="page-kicker">PLAYER SUPPORT / OWNER</div>'+
  '<h1 class="page-title">Игроки FLIP</h1>'+
  '<p class="page-desc">Полный список игроков, поиск и управление аккаунтами.</p></div></div>'+
  '<section class="panel"><div class="player-search">'+
  '<input class="input" id="studio-player-search" maxlength="80" autocomplete="off" '+
  'placeholder="@username, имя или Telegram ID" value="'+esc(state.playerQuery)+'">'+
  '<button class="button primary" data-action="players-search">Поиск</button>'+
  '<button class="button ghost" data-action="players-reset">Сбросить</button></div>'+
  '<div class="panel-title" style="margin-top:20px"><h3 id="players-total">Игроков: '+
  num(state.playerTotal)+'</h3><button class="button sm ghost" data-action="players-refresh">Обновить</button></div>'+
  '<div id="studio-player-list">'+(state.playerListLoaded?
    playerRows(state):'<div class="empty">Загружаем игроков…</div>')+'</div></section>';
}

export function playerDetailPage(state,publicCatalog){
 const d=state.playerDetail,p=d?.player;
 let html='<div class="heading-row"><div><div class="page-kicker">PLAYER SUPPORT / OWNER</div>'+
  '<h1 class="page-title">Профиль игрока</h1></div>'+
  '<button class="button ghost" data-action="players-back">← Все игроки</button></div>';
 if(!p)return html+'<div class="empty">Загружаем профиль…</div>';
 html+='<section class="panel player-owner-head"><div><h2>'+esc(label(p))+'</h2>'+
  '<p class="hint">Telegram ID: '+esc(p.id)+' · С нами с '+date(p.created_at)+'</p>'+
  '<small>Последнее изменение: '+date(p.updated_at)+'</small></div>'+
  '<span class="tag '+(p.banned?'archived':'published')+'">'+
   (p.banned?'ЗАБЛОКИРОВАН':'АКТИВЕН')+'</span></section>'+
  '<div class="stats-grid">'+stat('Баланс F',p.balance)+stat('Уровень',p.level)+
   stat('XP',p.xp)+stat('CP',p.cp)+'</div>'+
  '<section class="panel"><div class="panel-title"><h3>Управление аккаунтом</h3>'+
   '<small>ТОЛЬКО OWNER</small></div>'+
   (p.banned?'<p class="hint">Причина: '+esc(p.ban_reason||'Не указана')+'</p>':'')+
   '<button class="button '+(p.banned?'primary':'danger')+'" data-player-ban="'+
   (p.banned?'unban':'ban')+'">'+(p.banned?'Разблокировать':'Заблокировать игрока')+
   '</button><p class="hint">При бане игрок теряет доступ к операциям FLIP. '+
   'Все ожидающие обмены отменяются.</p></section>'+
  '<section class="panel"><div class="panel-title"><h3>Коллекция ('+
   num(d.cards_total)+')</h3>'+
   '<button class="button sm ghost" data-action="player-refresh">Обновить</button></div>'+
   '<p class="hint">Можно удалить обычные или тестовые экземпляры отдельно. '+
   'История открытий при этом сохраняется.</p>'+
   '<div class="player-cards">'+((d.cards||[]).map(c=>{
     const match=(publicCatalog?.cards||[]).find(x=>x.id===c.card_id);
     const art=match?.art_url||('https://flip-fmsbot.vercel.app/src/assets/'+c.card_id+'.webp');
     return '<div class="player-card"><img loading="lazy" src="'+esc(art)+
       '" alt="'+esc(c.title)+'"><div class="player-card-info"><strong>'+
       esc(c.artist)+' — '+esc(c.title)+'</strong>'+
       '<span>'+esc(String(c.rarity).toUpperCase())+' · Всего '+num(c.quantity)+'</span>'+
       '<small>Обычных: '+num(c.ranked_quantity)+' · Тестовых: '+num(c.test_quantity)+'</small>'+
       '<div class="player-card-actions">'+
       (c.ranked_quantity>0?'<button class="button sm ghost" data-player-remove="'+
         esc(c.card_id)+'" data-kind="ranked" data-max="'+Number(c.ranked_quantity)+
         '">Удалить обычные</button>':'')+
       (c.test_quantity>0?'<button class="button sm ghost" data-player-remove="'+
         esc(c.card_id)+'" data-kind="test" data-max="'+Number(c.test_quantity)+
         '">Удалить тестовые</button>':'')+
       '</div></div></div>';
   }).join('')||'<div class="empty">В коллекции пока нет карточек.</div>')+
   '</div>'+pager(state.playerCardsOffset,d.cards_total||0,50,'player-cards')+'</section>'+
  '<section class="panel"><div class="panel-title"><h3>История административных действий</h3></div>'+
  ((d.actions||[]).map(a=>'<div class="player-action-row"><strong>'+
   esc({ban:'Блокировка',unban:'Разблокировка',remove_card:'Удаление карточек'}[a.action]||a.action)+
   '</strong><small>'+date(a.created_at)+'</small><p>'+esc(a.reason)+
   (a.card_id?' · '+esc(a.card_id):'')+
   (a.quantity?' · '+num(a.quantity)+' шт.':'')+'</p></div>').join('')||
   '<div class="empty">Действий пока нет.</div>')+'</section>';
 return html;
}
