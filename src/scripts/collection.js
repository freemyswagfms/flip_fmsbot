/* FLIP v0.7 — personal collection, separate from the public demo art catalog.
   This reads local prototype inventory only; ownership must be checked server-side in production. */
(() => {
  'use strict';
  const catalog = window.FLIPCatalog;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const rarityRank = Object.fromEntries(catalog.rarities.map((id,i)=>[id,i]));
  const slug = card => card && typeof card.id === 'string' ? card.id : '';
  const asCard = card => {
    if (!card || !card.artistId || !card.releaseId || !card.color) return null;
    return catalog.getCard(card.artistId, card.releaseId, String(card.color).toLowerCase());
  };
  function inventory(state) {
    const owned = new Map();
    const unknown = [];
    const hidden = new Map();
    for (const original of (Array.isArray(state.received) ? state.received : [])) {
      const reference = asCard(original);
      if (!reference) {
        if (String(original?.rarity||'').toLowerCase()==='hidden' && original?.id) {
          const h=hidden.get(original.id);
          if(h){h.count++;if(original.isTestCopy)h.testCount=(h.testCount||0)+1;}else hidden.set(original.id,{...original,count:1,testCount:original.isTestCopy?1:0});
        } else if(original) unknown.push(original);
        continue;
      }
      const item = owned.get(reference.id);
      if (item) {item.count += 1;if(original.isTestCopy)item.testCount=(item.testCount||0)+1;}
      else owned.set(reference.id, {...reference, count:1,testCount:original.isTestCopy?1:0});
    }
    const history = Array.isArray(state.discovered) ? state.discovered.filter(id=>typeof id==='string') : [];
    const discovered = new Set(history);
    owned.forEach(c=>discovered.add(c.id));
    return {owned, unknown, hidden, discovered, history};
  }
  function art(card) {
    return `<img src="${esc(card.art)}" alt="${esc(card.title)} · ${esc(card.rarity)}" loading="lazy" decoding="async">`;
  }
  function stageHeader(kicker,title,desc,back) {
    return `${back ? `<button type="button" class="col-back" data-collection-back="${esc(back)}">← НАЗАД</button>` : ''}
    <div class="col-title-group"><span class="eyebrow">${esc(kicker)}</span><h2>${esc(title)}<span class="col-dot">.</span></h2><p class="desc">${esc(desc)}</p></div>`;
  }
  function formatCounts(n) {
    return `${n} ${n%10===1&&n%100!==11?'карточка':n%10>1&&n%10<5&&(n%100<11||n%100>14)?'карточки':'карточек'}`;
  }
  function formatDate(ms) {return ms ? new Date(ms).toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'}) : 'Ранее';}
  function cardThumb(card, size='normal') {
    const testBadge=card.testCount>0?'<span class="flip-test-marker">ТЕСТ ×'+card.testCount+'</span>':'';
    return `<span class="col-thumb ${size==='large'?'col-thumb-large':''} col-${esc(card.color)}">${art(card)}<span class="col-thumb-rarity"></span>${testBadge}${card.count>1?`<span class="col-qty">×${card.count}</span>`:''}</span>`;
  }
  function coverCard(card, title, meta, action, attrs='') {
    return `<button type="button" class="col-release-row" ${action} ${attrs} data-filterable="${esc(title+' '+meta)}">
       ${cardThumb(card)}<span class="col-release-main"><strong>${esc(title)}</strong><small>${esc(meta)}</small></span>
       <span class="col-chevron">↗</span></button>`;
  }
  function getArtistCards(owned, artistId) {return [...owned.values()].filter(c=>c.artistId===artistId);}
  // Each card variant appears once in the gallery; quantity and test status
  // remain visible without creating duplicates in the layout.
  function galleryTile(card,action='owned'){
    const owned=action==='owned',qty=Number(card.count||0),test=Number(card.testCount||0);
    const rarity=String(card.color||card.rarity||'common').toLowerCase();
    const tag=rarity==='hidden'?'HIDDEN':(catalog.rarityLabels[rarity]||rarity).toUpperCase();
    const artMarkup=card.art?art(card):'<span class="col-secret-symbol">?</span>';
    return '<button type="button" class="col-gallery-tile col-'+esc(rarity)+
      (owned?'':' col-gallery-discovered')+'" data-'+(owned?'owned':'history')+
      '-card="'+esc(card.id)+'" data-gallery-item data-filterable="'+
      esc(card.artist+' '+card.title+' '+card.rarity)+'" data-gallery-rarity="'+esc(rarity)+
      '" data-gallery-name="'+esc(card.title)+'" data-gallery-count="'+qty+
      '" aria-label="'+esc('Рассмотреть '+card.title+', '+card.rarity)+
      '"><span class="col-gallery-cover">'+artMarkup+
      '<span class="col-gallery-edition">'+esc(tag)+'</span>'+
      (qty>1?'<span class="col-gallery-quantity">×'+qty+'</span>':'')+
      (test>0?'<span class="col-gallery-test">ТЕСТ '+test+'</span>':'')+
      (!owned?'<span class="col-gallery-past">БЫЛА В КОЛЛЕКЦИИ</span>':'')+
      '<span class="col-gallery-zoom" aria-hidden="true">↗</span></span>'+
      '<span class="col-gallery-caption"><strong>'+esc(card.title)+'</strong>'+
      '<small>'+esc(card.artist)+'</small></span></button>';
  }
  function home(state) {
    const data=inventory(state),all=[...data.owned.values()];
    const total=catalog.artists.reduce((count,a)=>count+a.releases.length*catalog.rarities.length,0);
    const releases=new Set(all.map(c=>c.artistId+'/'+c.releaseId));
    const active=catalog.artists.filter(a=>all.some(c=>c.artistId===a.id));
    const pct=total?Math.round(100*all.length/total):0;
    const showcase=all.slice().sort((a,b)=>
      (rarityRank[b.color]??-1)-(rarityRank[a.color]??-1)||a.title.localeCompare(b.title,'ru'));
    // Each rarity has its own distinct VARIANT count, not the overall inventory size.
    const galleryRarityCounts=Object.create(null);
    for(const card of showcase){
      const key=String(card.color||card.rarity||'').toLowerCase();
      galleryRarityCounts[key]=(galleryRarityCounts[key]||0)+1;
    }
    return '<div class="panel col-page col-v087">'+
      stageHeader('THE ARCHIVE / 087','МОЯ КОЛЛЕКЦИЯ','Личная галерея музыкальных обложек. Каждая находка — часть твоей истории.')+
      '<div class="col-statboard col-statboard-v087"><div class="col-stat-main">'+
      '<span class="col-micro">УНИКАЛЬНЫХ КАРТОЧЕК</span><strong>'+all.length+
      '<em> / '+total+'</em></strong><div class="col-progress" role="progressbar" aria-valuenow="'+
      all.length+'" aria-valuemin="0" aria-valuemax="'+total+'"><i style="width:'+pct+'%"></i></div>'+
      '<small class="col-stat-percent">'+pct+'% доступной коллекции</small></div>'+
      '<div class="col-stat-side"><span><b>'+releases.size+'</b><small>релизов</small></span>'+
      '<span><b>'+Number(state.received?.length||0)+'</b><small>экземпляров</small></span></div></div>'+
      (showcase.length?'<div class="col-section-head col-gallery-title"><div><span class="col-micro">'+
      'ARTWORK GALLERY</span><h3>ТВОЯ ГАЛЕРЕЯ</h3></div><span class="col-count">'+showcase.length+
      ' ШТ.</span></div>'+
      '<p class="col-gallery-intro">Нажми на обложку, чтобы рассмотреть её вблизи и наклонить пальцем.</p>'+
      '<div class="col-gallery-tools"><label class="col-search-label col-gallery-search"><span aria-hidden="true">⌕</span>'+
      '<input type="search" data-collection-gallery-search placeholder="Название или артист" aria-label="Поиск по коллекции" autocomplete="off"></label>'+
      '<label class="col-gallery-sort-wrap"><span>СОРТИРОВКА</span>'+
      '<select aria-label="Сортировка карточек" data-collection-gallery-sort>'+
      '<option value="rarity">По редкости</option><option value="title">По названию</option>'+
      '<option value="quantity">По количеству</option></select></label></div>'+
      '<div class="col-gallery-filters" role="group" aria-label="Фильтр по редкости">'+
      ['all',...catalog.rarities].map(r=>'<button type="button" class="col-gallery-filter" data-collection-gallery-filter="'+r+
      '" aria-pressed="'+(r==='all'?'true':'false')+'">'+
      '<span class="col-gallery-filter-label">'+esc(r==='all'?'ВСЕ':(catalog.rarityLabels[r]||r).toUpperCase())+'</span>'+
      '<span class="col-gallery-filter-count" data-gallery-filter-count="'+r+'">'+
      (r==='all'?showcase.length:(galleryRarityCounts[r]||0))+'</span></button>').join('')+'</div>'+
      '<p class="col-gallery-result" data-collection-gallery-status aria-live="polite">'+
      formatCounts(showcase.length)+'</p><div class="col-showcase-grid" data-collection-gallery>'+
      showcase.map(c=>galleryTile(c)).join('')+'</div>'+
      '<div class="col-gallery-empty" hidden data-collection-gallery-empty>По этому запросу карточек нет. Попробуй другой фильтр.</div>'
      :'<div class="col-empty"><div class="col-empty-symbol">✳</div><strong>ТВОЯ ИСТОРИЯ НАЧИНАЕТСЯ</strong>'+
      '<p>У тебя пока нет карточек. Открой первый дроп — здесь появятся твои находки.</p>'+
      '<button class="outlinebtn" data-action="home">К ДРОПУ ↗</button></div>')+
      '<div class="col-section-head col-gallery-artists"><div><span class="col-micro">YOUR ARTISTS</span>'+
      '<h3>АРТИСТЫ</h3></div><span class="col-count">'+active.length+'</span></div>'+
      (active.length?'<div class="col-artist-list">'+active.map(a=>{
        const cards=getArtistCards(data.owned,a.id);
        const cover=cards.slice().sort((x,y)=>(rarityRank[y.color]??-1)-(rarityRank[x.color]??-1))[0];
        const numReleases=new Set(cards.map(c=>c.releaseId)).size;
        return '<button class="col-artist-card" type="button" data-collection-artist="'+esc(a.id)+'">'+
        '<span class="col-artist-art">'+art(cover)+'<span>FLIP / ARTIST</span></span>'+
        '<span class="col-artist-copy"><span class="col-micro">DISCOVERED ARTIST</span>'+
        '<strong>'+esc(a.name)+'</strong><small>'+numReleases+' '+(numReleases===1?'релиз':'релизов')+
        ' · '+formatCounts(cards.length)+'</small><span class="col-tag">ОТКРЫТЬ РЕЛИЗЫ ↗</span></span></button>';
      }).join('')+'</div>':'<p class="col-gallery-intro">Открой первый дроп, чтобы найти артиста.</p>')+
      (data.hidden.size?'<div class="col-section-head"><div><span class="col-micro">SECRET ARCHIVE</span>'+
      '<h3>СКРЫТЫЕ НАХОДКИ</h3></div><span class="col-count">'+data.hidden.size+'</span></div>'+
      '<div class="col-release-list">'+[...data.hidden.values()].map(c=>
        '<button type="button" class="col-release-row" data-hidden-card="'+esc(c.id)+'">'+
        '<span class="col-thumb col-secret-thumb"><span class="col-secret-symbol">?</span></span>'+
        '<span class="col-release-main"><strong>HIDDEN · '+esc(c.title||'SECRET')+'</strong>'+
        '<small>Секретная карточка · ×'+c.count+'</small></span><span class="col-chevron">↗</span></button>').join('')+'</div>':'')+
      '<div class="col-shortcuts"><button type="button" data-collection-history="1">'+
      '<span class="col-shortcut-symbol">◷</span><span><strong>ИСТОРИЯ НАХОДОК</strong>'+
      '<small>Все ранее открытые карточки</small></span><span>↗</span></button>'+
      '<button type="button" data-action="catalog"><span class="col-shortcut-symbol">◈</span>'+
      '<span><strong>КАТАЛОГ ОФОРМЛЕНИЙ</strong><small>Сравнить все доступные стили</small></span>'+
      '<span>↗</span></button></div>'+
      '<p class="note">Просмотр и фильтры не меняют баланс, количество копий или редкость карточек.</p></div>';
  }
  function artist(state, artistId) {
    const a=catalog.artists.find(a=>a.id===artistId);
    if (!a) return home(state);
    const data=inventory(state), mine=getArtistCards(data.owned,a.id);
    const releases=a.releases.map(release=>({release,cards:mine.filter(c=>c.releaseId===release.id)})).filter(item=>item.cards.length);
    return `<div class="panel col-page">${stageHeader('ARTIST COLLECTION',a.name,'Только релизы, которые ты действительно открыл. Неизвестные обложки пока скрыты.','collection')}
      <div class="col-stats-line"><span><b>${releases.length}</b> релизов</span><span><b>${mine.length}</b> разновидностей</span><span><b>${mine.reduce((n,c)=>n+c.count,0)}</b> экземпляров</span></div>
      <div class="col-section-head"><div><span class="col-micro">RELEASE ARCHIVE</span><h3>ОТКРЫТЫЕ РЕЛИЗЫ</h3></div></div>
      <label class="col-search-label"><span>⌕</span><input type="search" autocomplete="off" placeholder="Найти релиз" aria-label="Поиск по полученным релизам" data-collection-search></label>
      <div class="col-release-list">${releases.map(({release,cards})=>{
        const featured=cards.slice().sort((x,y)=>rarityRank[y.color]-rarityRank[x.color])[0];
        const rarityIcons=catalog.rarities.map(r=>`<i class="col-rdot ${cards.some(c=>c.color===r)?'unlocked':''} col-${r}" title="${esc(catalog.rarityLabels[r])}"></i>`).join('');
        return `<button type="button" class="col-release-row" data-collection-release="${esc(release.id)}" data-filterable="${esc(release.title)}">
          ${cardThumb(featured)}<span class="col-release-main"><strong>${esc(release.title)}</strong><small>${release.year||'АРХИВ'} · ${cards.length}/5 редкостей</small><span class="col-rarity-dots">${rarityIcons}</span></span><span class="col-chevron">↗</span></button>`;
      }).join('')}</div><p class="col-no-matches" hidden>Ничего не найдено среди твоих релизов.</p>
      <p class="note">Новые релизы появляются здесь только после выпадения соответствующей карточки.</p></div>`;
  }
  function release(state, artistId, releaseId) {
    const a=catalog.artists.find(a=>a.id===artistId), r=a?.releases.find(r=>r.id===releaseId);
    if (!a || !r) return artist(state, artistId);
    const data=inventory(state), mine=catalog.rarities.map(rarity=>catalog.getCard(artistId,releaseId,rarity)).filter(Boolean);
    const visible=mine.filter(c=>data.owned.has(c.id));
    if(!visible.length) return artist(state,artistId);
    const featured=data.owned.get(visible[0].id);
    return `<div class="panel col-page">${stageHeader('RELEASE COLLECTION',r.title,`${a.name} · ${r.year || 'Архив'} · ${visible.length} из 5 редкостей`,'artist')}
      <div class="col-release-hero"><button type="button" class="col-release-hero-image col-release-hero-open" data-owned-card="${esc(featured.id)}" aria-label="Рассмотреть ${esc(r.title)}">${art(featured)}</button><div class="col-release-hero-copy"><span class="col-micro">ALBUM ARTWORK</span><strong>${esc(r.title)}</strong><span>${esc(a.name)}</span><small>${visible.length}/5 СОБРАНО</small></div></div>
      <div class="col-section-head"><div><span class="col-micro">RARITY VARIANTS</span><h3>ПЯТЬ РЕДКОСТЕЙ</h3></div><span class="col-count">${visible.length}/5</span></div>
      <div class="col-rarity-grid">${mine.map(c=>{
        const mineCard=data.owned.get(c.id),owned=!!mineCard;
        return `<button type="button" class="col-rarity-tile ${owned?'':'col-locked'} col-${esc(c.color)}" ${owned?`data-owned-card="${esc(c.id)}"`:'disabled aria-disabled="true"'} aria-label="${owned?`Открыть ${esc(c.rarity)}, ${mineCard.count} экземпляров`:`${esc(c.rarity)} пока не найден`}">
          <span class="col-rarity-picture">${owned?art(c):'<span class="col-lock-mark">?</span>'}${owned&&mineCard.testCount>0?'<span class="flip-test-marker">ТЕСТ ×'+mineCard.testCount+'</span>':''}${owned&&mineCard.count>1?`<span class="col-qty">×${mineCard.count}</span>`:''}</span>
          <span class="col-rarity-caption"><b>${esc(c.rarity)}</b><small>${owned?`${mineCard.count} ${mineCard.count===1?'экземпляр':'экз.'}`:'НЕ НАЙДЕНО'}</small></span></button>`;
      }).join('')}</div>
      <p class="col-info-hint">Нажми на открытую карточку, чтобы приблизить обложку и повернуть её пальцем. Неоткрытые варианты скрыты.</p>
      ${r.note?`<p class="note">${esc(r.note)}</p>`:''}</div>`;
  }
  function history(state) {
    const data=inventory(state), list=[];
    const seen=new Set();
    for(const id of [...data.history].reverse()) {
      if (seen.has(id))continue;
      seen.add(id);
      const parts=id.split('/');
      const card = parts.length===3 ? catalog.getCard(parts[0],parts[1],parts[2]) : null;
      if(card)list.push(card);
    }
    data.owned.forEach(c=>{if(!seen.has(c.id)){list.unshift(c);seen.add(c.id)}});
    data.hidden.forEach(c=>{if(!seen.has(c.id)){list.unshift(c);seen.add(c.id)}});
    return `<div class="panel col-page">${stageHeader('DISCOVERIES / ARCHIVE','ИСТОРИЯ НАХОДОК','Все разновидности, которые когда-либо попадали в твою коллекцию. Сохраняются даже после будущих обменов.','collection')}
      <div class="col-stats-line"><span><b>${list.length}</b> открыто</span><span><b>${data.owned.size}</b> сейчас в коллекции</span></div>
      ${list.length?`<label class="col-search-label"><span>⌕</span><input type="search" placeholder="Найти находку" autocomplete="off" aria-label="Поиск по истории находок" data-collection-search></label>
      <div class="col-release-list">${list.map(c=>{
         const owned=data.owned.get(c.id);
         if(String(c.rarity).toLowerCase()==='hidden')return `<button type="button" class="col-release-row" data-hidden-card="${esc(c.id)}" data-filterable="${esc(c.title||'Hidden')} Hidden"><span class="col-thumb col-secret-thumb"><span class="col-secret-symbol">?</span></span><span class="col-release-main"><strong>${esc(c.title||'Секретная карточка')}</strong><small>HIDDEN · ×${c.count}</small></span><span class="col-chevron">↗</span></button>`;
         return coverCard(c,c.title,`${c.artist} · ${c.rarity} · ${owned?`×${owned.count}`:'Больше нет'}`,`data-history-card="${esc(c.id)}"`);
      }).join('')}</div><p class="col-no-matches" hidden>Ничего не найдено.</p>`:`<div class="col-empty"><div class="col-empty-symbol">✳</div><strong>ИСТОРИЯ ПОКА ПУСТА</strong><p>Здесь будут сохраняться твои первые открытия.</p></div>`}
      <p class="note">История открытий сохраняется вместе с игровым прогрессом при входе через Telegram.</p></div>`;
  }
  function cardInfo(state, id) {
    const data=inventory(state), item=data.owned.get(id);
    if (!item) return null;
    return item;
  }
  function historyCard(state,id){
    const item=cardInfo(state,id);if(item)return item;
    const parts=id.split('/');
    if(parts.length===3){const c=catalog.getCard(parts[0],parts[1],parts[2]);if(c)return {...c,count:0};}
    return null;
  }
  window.FLIPCollection={inventory,home,artist,release,history,cardInfo,historyCard,formatDate};
})();
