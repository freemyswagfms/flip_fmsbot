/* FLIP v0.8.5 — public Collection Points ranking; render only trusted server results. */
(() => {
  'use strict';
  const safe=v=>String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
  const raw=window.Telegram?.WebApp?.initData||'';
  let root=null,serial=0;
  const points=n=>Number(n||0).toLocaleString('ru-RU',{maximumFractionDigits:2});
  async function load(el){
    const job=++serial;
    el.innerHTML='<p class="flip-social-muted">Загружаем рейтинг…</p>';
    if(!raw){el.innerHTML='<p class="flip-social-muted">Общий рейтинг доступен при входе через Telegram.</p>';return;}
    try{
      const response=await fetch('/api/social?view=leaderboard',{cache:'no-store',
        headers:{'x-telegram-init-data':raw}});
      const data=await response.json();
      if(!response.ok)throw Error(data.error||'SERVER_ERROR');
      if(job!==serial||el!==root||!el.isConnected)return;
      const me=data.me;
      el.innerHTML=[
        '<section class="flip-social-panel flip-cp-summary">',
        '<div class="flip-social-cp-row"><div><strong>',me?'#'+safe(me.place):'—',
        '</strong><small>Место в общем рейтинге</small></div><div><strong>',
        points(me?.cp),'<span> CP</span></strong><small>Ценность текущей коллекции</small></div></div>',
        '</section>',
        '<section class="flip-social-panel"><div class="flip-social-heading"><h3>ОБЩИЙ ТОП</h3>',
        '<button type="button" class="outlinebtn" data-cp-refresh>ОБНОВИТЬ ↗</button></div>',
        '',
        '<div class="flip-leaderboard-list">',
        (data.leaders||[]).length?data.leaders.map(p=>{
          const profileId=typeof p.profileId==='string'&&
            /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(p.profileId)
            ?p.profileId:null;
          const tag=profileId?'button':'div';
          return '<'+tag+(profileId?' type="button" data-player-profile="'+safe(profileId)+
            '" aria-label="Открыть профиль '+safe(p.name)+'"':'')+
            ' class="flip-cp-player'+(p.place===me?.place?' is-me':'')+
            '"><span class="flip-cp-place">#'+safe(p.place)+
            '</span><div><strong>'+safe(p.name)+'</strong><small>LVL '+safe(p.level)+
            ' · '+safe(p.rankedVariants)+' уник. · '+safe(p.rankedCards)+' карт.</small></div>'+
            '<span class="flip-cp-score">'+points(p.cp)+' CP</span>'+
            (profileId?'<span class="flip-cp-open-icon" aria-hidden="true">↗</span>':'')+
            '</'+tag+'>';
        }).join(''):'<p class="flip-social-muted">Пока нет участников.</p>',
        '</div><p class="flip-social-muted">Игроков: ',
        safe(data.players),'.</p></section>',
        '<details class="flip-social-panel flip-cp-rules"><summary>ПРАВИЛА CP</summary><p>Первая копия 100%, вторая 25%,',
        ' третья 10%, четвёртая и пятая по 5%, шестая–десятая по 1%.',
        ' После десятой копии дополнительные CP не начисляются.</p>',
        '<p>Common — 1 · Rare — 4 · Epic — 12 · Legendary — 35 · Mythic — 90 CP.</p>',
        '</details>'
      ].join('');
      window.FLIPIcons?.render(el);
    }catch(e){
      if(job!==serial||el!==root)return;
      el.innerHTML='<p class="flip-social-error">Не удалось загрузить рейтинг: '+safe(e.message)+
        '</p><button class="outlinebtn" data-cp-refresh>ПОВТОРИТЬ</button>';
    }
  }
  window.FLIPLeaderboard={
    mount(el){
      if(!el)return;
      if(root===el)return;
      root=el;serial++;
      el.addEventListener('click',event=>{
        if(event.target.closest('[data-cp-refresh]')){load(el);return;}
      });
      load(el);
    }
  };
})();
