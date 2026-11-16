/* FLIP v0.8.4 — private in-app admin controls. API verifies Telegram ID on every call. */
(() => {
  'use strict';
  const E=x=>String(x??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const tg=window.Telegram?.WebApp;
  const raw=tg?.initData||'';
  let root=null,stamp=0,cardTimer=null,cardSeq=0;
  const s={players:[],cards:[],history:[],rewards:[],leaders:[],q:'',recipient:'',card:'',cardQuery:'',
    rewardKind:'card',amount:'',mode:'test',note:'',busy:false,message:'',error:false,retryId:null,retryPayload:null,
    cooldowns:null,cooldownBusy:false,cooldownMessage:'',cooldownError:false,cooldownRetry:null,
    cardRarity:'',cardTotal:0,cardOffset:0,basket:[],
    modeTarget:'',targetCooldowns:null,targetLabel:'',targetLogs:[],
    targetBusy:false,targetMessage:'',targetError:false};
  function selfId(){
    try{const p=JSON.parse(new URLSearchParams(raw).get('user')||'null');
      return Number.isSafeInteger(p?.id)&&p.id>0?String(p.id):'';}
    catch{return ''}
  }
  async function call(view,payload){
    const url=new URL('/api/admin',location.origin);
    if(!payload){url.searchParams.set('view',view);if(view==='players'&&s.q.trim())url.searchParams.set('q',s.q.trim().replace(/^@/,''));
      if(view==='cards'&&s.cardQuery.trim())url.searchParams.set('q',s.cardQuery.trim());
      if(view==='cards_browser'){
        if(s.cardQuery.trim())url.searchParams.set('q',s.cardQuery.trim());
        if(s.cardRarity)url.searchParams.set('rarity',s.cardRarity);
        url.searchParams.set('offset',String(s.cardOffset));
      }
      if(view==='player_modes')url.searchParams.set('recipientId',s.modeTarget);}
    const options={method:payload?'POST':'GET',cache:'no-store',headers:{'x-telegram-init-data':raw}};
    if(payload){options.headers['content-type']='application/json';options.body=JSON.stringify(payload);}
    const res=await fetch(url,options);
    let result;try{result=await res.json()}catch{result={error:'INVALID_RESPONSE'}}
    if(!res.ok)throw new Error(result.error||'ADMIN_SERVER_ERROR');
    return result;
  }
  const playerName=p=>p.username?'@'+p.username:(p.first_name||'FLIP PLAYER')+' · '+p.telegram_id;
  function players(){
    return s.players.length?s.players.map(p=>'<button type="button" class="flip-admin-player '+(s.recipient===p.telegram_id?'selected':'')+
      '" data-admin-user="'+E(p.telegram_id)+'"><strong>'+E(playerName(p))+'</strong><small>LVL '+E(p.level)+
      ' · Всего '+E(p.total_cards)+' · Рейтинговых '+E(p.ranked_cards)+'</small></button>').join(''):
      '<p class="flip-admin-hint">Нет игроков по этому запросу.</p>';
  }
  function history(){
    return s.history.length?s.history.slice(0,12).map(a=>
      '<div class="flip-admin-history-row"><span class="flip-admin-mode '+E(a.grant_mode)+'">'+
      (a.grant_mode==='test'?'ТЕСТ':'РЕЙТИНГ')+'</span><strong>'+E(a.card_id)+
      '</strong><small>Получатель ID '+E(a.recipient_telegram_id)+' · '+E(new Date(a.created_at).toLocaleDateString('ru-RU'))+
      '</small>'+(a.note?'<small>'+E(a.note)+'</small>':'')+'</div>').join(''):
      '<p class="flip-admin-hint">Выдач пока нет.</p>';
  }
  function rewardHistory(){
    return s.rewards.length?s.rewards.slice(0,12).map(a=>
      '<div class="flip-admin-history-row"><span class="flip-admin-mode ranked">'+
      (a.kind==='xp'?'XP':'F')+' +'+E(a.amount)+'</span><strong>Получатель ID '+E(a.recipient_telegram_id)+
      '</strong><small>'+E(new Date(a.created_at).toLocaleDateString('ru-RU'))+'</small>'+
      (a.note?'<small>'+E(a.note)+'</small>':'')+'</div>').join(''):
      '<p class="flip-admin-hint">Начислений пока нет.</p>';
  }
  const visual=()=>window.FLIPAdminVisual;
  const basketCount=()=>s.basket.reduce((total,item)=>total+item.quantity,0);
  function cardGrid(){
    return visual()?.grid(s.cards,s.basket,s.cardTotal,s.cardOffset)||
      '<p class="flip-admin-hint">Загрузка карточек…</p>';
  }
  function basket(){
    return visual()?.cart(s.basket)||'<p class="flip-admin-hint">Корзина пуста.</p>';
  }
  function cardHint(){
    return 'Найдено вариантов: '+s.cardTotal+
      ' · показано '+s.cards.length+' · максимум 20 карточек за выдачу';
  }
  function updateCardResults(){
    if(!root)return;
    const results=root.querySelector('#flip-admin-card-results');
    if(results)results.innerHTML=cardGrid();
    const hint=root.querySelector('#flip-admin-card-hint');
    if(hint)hint.textContent=cardHint();
    const cart=root.querySelector('#flip-admin-basket');
    if(cart)cart.innerHTML=basket();
    const count=root.querySelector('#flip-admin-basket-count');
    if(count)count.textContent=basketCount()+' / 20';
    const button=root.querySelector('[data-admin-grant]');
    if(button){
      button.disabled=s.busy||(s.rewardKind==='card'&&basketCount()===0);
      button.textContent=s.busy?'СОХРАНЕНИЕ…':
        s.rewardKind==='card'?'ВЫДАТЬ '+basketCount()+' КАРТОЧЕК ↗':
          'НАЧИСЛИТЬ '+s.rewardKind.toUpperCase()+' ↗';
    }
    window.FLIPIcons?.render(results);
    window.FLIPIcons?.render(cart);
  }
  async function searchCards(append=false){
    const job=stamp,seq=++cardSeq,old=append?s.cards.slice():[];
    if(!append)s.cardOffset=0;
    const nextOffset=append?s.cards.length:0;
    try{
      const r=await call('cards_browser');
      if(job!==stamp||seq!==cardSeq)return;
      // Keep already visible items while extending a server-paginated page.
      s.cards=append?old.concat((r.cards||[]).filter(x=>!old.some(o=>o.id===x.id))):r.cards||[];
      s.cardTotal=Number(r.total)||0;s.cardOffset=s.cards.length;
      updateCardResults();
    }catch(e){
      if(job!==stamp||seq!==cardSeq)return;
      s.cardOffset=nextOffset;
      const hint=root?.querySelector('#flip-admin-card-hint');
      if(hint)hint.textContent='Ошибка поиска: '+e.message;
    }
  }

  function ranking(){
    return s.leaders.length?s.leaders.slice(0,10).map((p,i)=>'<div class="flip-admin-leader"><span>'+
      E(p.place||i+1)+'.</span><strong>'+E(p.username?'@'+p.username:(p.first_name||'FLIP PLAYER'))+
      '</strong><small>'+E(Number(p.cp||0).toLocaleString('ru-RU',{maximumFractionDigits:2}))+' CP · '+E(p.ranked_cards)+' карт.</small></div>').join(''):
      '<p class="flip-admin-hint">Рейтинговых карточек пока нет.</p>';
  }
  function cooldownPanel(){
    const target=s.modeTarget||selfId();
    const own=target===selfId();
    const cd=own?s.cooldowns:s.targetCooldowns;
    const label=own?'ТВОЙ АККАУНТ':(s.targetLabel||'Игрок ID '+target);
    const dropUnlimited=cd?.drop_unlimited===true;
    const packUnlimited=cd?.pack_unlimited===true;
    const dropReady=cd?.drop_ready===true;
    const dropAt=cd?.drop_ready_at?new Date(cd.drop_ready_at):null;
    const dropTime=dropAt&&!Number.isNaN(dropAt.valueOf())?
      dropAt.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit',
        timeZone:'Europe/Moscow'}):'—';
    const used=Math.min(10,Math.max(0,Number(cd?.packs_today)||0));
    const logs=own?(Array.isArray(cd?.history)?cd.history:[]):s.targetLogs;
    const clock=when=>{
      const value=new Date(when);
      return Number.isNaN(value.valueOf())?'—':
        value.toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',
          hour:'2-digit',minute:'2-digit',timeZone:'Europe/Moscow'});
    };
    const entry=a=>{
      const label=a.kind==='drop'?'Бесплатный дроп':'Наборы';
      const verb=a.enabled===true?'Включено без ограничений':
                 a.enabled===false?'Обычный режим':'Разовый сброс';
      return '<div class="flip-admin-history-row"><strong>'+E(label)+
        ' · '+E(verb)+'</strong><small>'+E(clock(a.created_at))+' МСК'+(a.admin_id?' · Администратор ID '+E(a.admin_id):'')+'</small></div>';
    };
    return [
      '<section class="flip-admin-section flip-admin-cooldowns">',
      '<div class="flip-admin-section-heading"><h3>РЕЖИМЫ РАЗРАБОТЧИКА</h3>',
      '<span class="flip-admin-private-badge">ТОЛЬКО СОЗДАТЕЛЬ</span></div>',
      '<p class="flip-admin-hint">Выбирай, кому убрать ожидание дропа или дневной лимит наборов. Управление доступно только тебе.</p>',
      '<div class="flip-admin-mode-target"><span>НАСТРАИВАЕМЫЙ АККАУНТ</span><strong>',E(label),'</strong><small>ID ',E(target),'</small></div>',
      '<div class="flip-admin-mode-target-actions">',
      '<button type="button" class="outlinebtn" data-admin-modes-recipient ',s.targetBusy?'disabled':'','>РЕЖИМЫ ВЫБРАННОГО ИГРОКА</button>',
      '<button type="button" class="outlinebtn" data-admin-modes-self ',s.targetBusy?'disabled':'','>МОИ РЕЖИМЫ</button>',
      '</div>',
      '<div class="flip-admin-cooldown-grid">',
      '<div class="flip-admin-cooldown-box',dropUnlimited?' is-unlimited':'','">',
      '<span>БЕСПЛАТНЫЙ ДРОП</span>',
      '<strong>',cd?(dropUnlimited?'∞ БЕЗ КД':dropReady?'ГОТОВ':dropTime+' МСК'):'ЗАГРУЗКА…','</strong>',
      '<button type="button" class="outlinebtn" data-admin-set-unlimited="drop" ',
      'aria-pressed="',String(dropUnlimited),'" ',
      (!cd||s.cooldownBusy||s.busy?'disabled':''),
      '>',dropUnlimited?'ВЫКЛЮЧИТЬ БЕЗ КД':'ВКЛЮЧИТЬ БЕЗ КД','</button></div>',
      '<div class="flip-admin-cooldown-box',packUnlimited?' is-unlimited':'','">',
      '<span>СТАНДАРТНЫЕ НАБОРЫ</span>',
      '<strong>',cd?(packUnlimited?'∞ БЕЗ ЛИМИТА':used+' / 10'):'ЗАГРУЗКА…','</strong>',
      '<button type="button" class="outlinebtn" data-admin-set-unlimited="pack" ',
      'aria-pressed="',String(packUnlimited),'" ',
      (!cd||s.cooldownBusy||s.busy?'disabled':''),
      '>',packUnlimited?'ВЕРНУТЬ ЛИМИТ':'УБРАТЬ ЛИМИТ','</button></div>',
      '</div>',
      s.cooldownMessage?'<div role="status" class="flip-admin-message '+
        (s.cooldownError?'failed':'ok')+'">'+E(s.cooldownMessage)+'</div>':'',
      s.targetMessage?'<div role="status" class="flip-admin-message '+(s.targetError?'failed':'ok')+'">'+E(s.targetMessage)+'</div>':'',
      '<p class="flip-admin-hint">Без КД: дропы без ожидания. Без лимита: любое количество наборов с обычной оплатой в F. Шансы и награды не меняются.</p>',
      '<details class="flip-admin-cooldown-history"><summary>ИСТОРИЯ РЕЖИМОВ (',
      logs.length,')</summary>',
      logs.length?logs.map(entry).join(''):
        '<p class="flip-admin-hint">Переключений пока не было.</p>',
      '</details></section>'
    ].join('');
  }
  function draw(){
    if(!root||!root.isConnected)return;
    const isCard=s.rewardKind==='card';
    root.innerHTML=[
      '<section class="flip-admin-section flip-admin-studio-link"><div class="flip-admin-section-heading"><h3>FLIP STUDIO</h3></div>',
      '<p class="flip-admin-hint">Отдельный редактор музыки и обложек. Выдача карточек, XP и F остаётся здесь.</p>',
      '<button class="bigbtn" type="button" data-admin-studio-login>ВОЙТИ В STUDIO БЕЗ ПОЧТЫ ↗</button>',
      '<button class="outlinebtn" type="button" data-admin-studio-login-copy>КОПИРОВАТЬ ССЫЛКУ ВХОДА</button>',
      '<p class="flip-admin-hint">Вход без письма работает только для владельца. Ссылка одноразовая — никому её не передавай.</p>',
      '<button class="outlinebtn" type="button" data-admin-studio>ОТКРЫТЬ FLIP STUDIO ↗</button>',
      '<button class="outlinebtn" type="button" data-admin-studio-code>КОПИРОВАТЬ КОД ВЛАДЕЛЬЦА</button></section>',
      cooldownPanel(),
      '<section class="flip-admin-section"><div class="flip-admin-section-heading"><h3>01 / ПОЛУЧАТЕЛЬ</h3>',
      '<button type="button" class="outlinebtn" data-admin-self>СЕБЕ</button></div>',
      '<div class="flip-admin-search"><input id="flip-admin-search" maxlength="64" placeholder="Имя, @username или ID" value="',E(s.q),
      '"><button type="button" class="outlinebtn" data-admin-search>НАЙТИ</button></div>',
      '<div class="flip-admin-users">',players(),'</div>',
      '<label class="flip-admin-field-label" for="flip-admin-recipient">Telegram ID получателя</label>',
      '<input class="flip-admin-input" id="flip-admin-recipient" inputmode="numeric" maxlength="16" placeholder="Выбери игрока" value="',E(s.recipient),'"></section>',
      '<section class="flip-admin-section"><h3>02 / ЧТО ВЫДАТЬ</h3>',
      '<div class="flip-admin-kind-tabs">',
      [['card','КАРТОЧКА'],['xp','XP'],['f','F']].map(([key,label])=>
        '<button type="button" class="flip-admin-kind '+(s.rewardKind===key?'active':'')+
        '" data-admin-kind="'+key+'">'+label+'</button>').join(''),
      '</div>',
      isCard?[
        '<label class="flip-admin-field-label" for="flip-admin-card-search">Поиск карточки</label>',
        '<input class="flip-admin-input" id="flip-admin-card-search" type="search" maxlength="80" autocomplete="off" placeholder="Артист, альбом, редкость или ID" value="',E(s.cardQuery),'">',
        '<p class="flip-admin-hint" id="flip-admin-card-hint">',
          s.cards.length===50?'Показаны первые 50 вариантов. Уточни поиск.':'Найдено вариантов: '+s.cards.length,
        '</p>',
        '<select class="flip-admin-input" id="flip-admin-card" ',s.cards.length?'':'disabled','>',
          cardOptions(),'</select>',
        '<h3 class="flip-admin-small-heading">03 / ТИП ВЫДАЧИ</h3>',
        '<label class="flip-admin-mode-choice '+(s.mode==='test'?'chosen':'')+'">',
        '<input type="radio" name="flip-admin-mode" value="test" '+(s.mode==='test'?'checked':'')+'>',
        '<span><strong>Тестовая / административная</strong><small>Пометка «ТЕСТ» в коллекции. В топе не учитывается.</small></span></label>',
        '<label class="flip-admin-mode-choice '+(s.mode==='ranked'?'chosen':'')+'">',
        '<input type="radio" name="flip-admin-mode" value="ranked" '+(s.mode==='ranked'?'checked':'')+'>',
        '<span><strong>Рейтинговая / обычная</strong><small>Учитывается в CP наравне с карточками из дропов и паков. Источник сохраняется в журнале.</small></span></label>'
      ].join(''):[
        '<label class="flip-admin-field-label" for="flip-admin-amount">Сколько ',s.rewardKind==='xp'?'XP':'F',' начислить</label>',
        '<input class="flip-admin-input" id="flip-admin-amount" inputmode="numeric" type="number" min="1" max="1000000" step="1" placeholder="От 1 до 1 000 000" value="',E(s.amount),'">',
        '<p class="flip-admin-hint">',s.rewardKind==='xp'?
          'XP повышает уровень по обычным правилам, включая положенные награды уровня.':
          'F поступают сразу на баланс игрока.',
          ' Награда административная, в будущие CP не входит напрямую.</p>'
      ].join(''),
      '<label class="flip-admin-field-label" for="flip-admin-note">Причина (необязательно)</label>',
      '<input class="flip-admin-input" id="flip-admin-note" maxlength="200" placeholder="Например, компенсация или тест" value="',E(s.note),'">',
      s.message?'<div role="status" class="flip-admin-message '+(s.error?'failed':'ok')+'">'+E(s.message)+'</div>':'',
      '<button type="button" class="bigbtn" data-admin-grant '+(s.busy||(isCard&&!s.card)?'disabled':'')+'>',
      s.busy?'СОХРАНЕНИЕ…':isCard?'ВЫДАТЬ КАРТОЧКУ ↗':'НАЧИСЛИТЬ '+s.rewardKind.toUpperCase()+' ↗',
      '</button></section>',
      '<section class="flip-admin-section"><h3>ЖУРНАЛ КАРТОЧЕК</h3>',history(),'</section>',
      '<section class="flip-admin-section"><h3>ЖУРНАЛ XP И F</h3>',rewardHistory(),'</section>',
      '<section class="flip-admin-section"><h3>ПРЕДВАРИТЕЛЬНЫЙ ТОП</h3>',
      '<p class="flip-admin-hint">CP учитывают все рейтинговые экземпляры, включая админ-выдачи и обмены. Тестовые исключены.</p>',ranking(),'</section>'
    ].join('');
    window.FLIPIcons?.render(root); // admin markup is injected after the app's global icon pass
  }
  async function load(part='all'){
    const job=stamp;
    if(part==='cards'){await searchCards();return;}
    try{
      if(part==='all'){
        const [u,c,h,r,l,cd]=await Promise.all([
          call('players'),call('cards'),call('history'),call('rewards'),call('ranked'),
          call('cooldowns').catch(()=>({cooldowns:null}))
        ]);
        if(job!==stamp)return;
        s.players=u.players||[];s.cards=c.cards||[];s.history=h.history||[];
        s.rewards=r.rewards||[];s.leaders=l.leaders||[];s.cooldowns=cd.cooldowns||null;
        if(!s.cards.some(x=>x.id===s.card))s.card=s.cards[0]?.id||'';
      }else if(part==='players'){
        const r=await call('players');if(job!==stamp)return;s.players=r.players||[];
      }else{
        const [u,h,r,l,cd]=await Promise.all([
          call('players'),call('history'),call('rewards'),call('ranked'),
          call('cooldowns').catch(()=>({cooldowns:null}))
        ]);
        if(job!==stamp)return;
        s.players=u.players||[];s.history=h.history||[];
        s.rewards=r.rewards||[];s.leaders=l.leaders||[];s.cooldowns=cd.cooldowns||null;
      }
      draw();
    }catch(e){if(job!==stamp)return;s.error=true;s.message='Ошибка запроса: '+e.message;draw();}
  }
  async function grant(){
    if(s.busy)return;
    const payload={action:s.rewardKind==='card'?'grant_card':'grant_resource',
      recipientId:s.recipient.trim(),note:s.note.trim()};
    if(!/^[1-9]\d{0,15}$/.test(payload.recipientId)){
      s.error=true;s.message='Выбери получателя.';draw();return;
    }
    let subject;
    if(s.rewardKind==='card'){
      payload.cardId=s.card;payload.mode=s.mode;
      if(!payload.cardId){s.error=true;s.message='Выбери карточку.';draw();return;}
      const card=s.cards.find(x=>x.id===payload.cardId);
      subject=(card?.label||payload.cardId)+' / '+(payload.mode==='test'?'ТЕСТ':'РЕЙТИНГОВАЯ');
    }else{
      if(!/^[1-9]\d{0,6}$/.test(s.amount)||Number(s.amount)>1000000){
        s.error=true;s.message='Укажи целое положительное число от 1 до 1 000 000.';draw();return;
      }
      payload.kind=s.rewardKind;payload.amount=Number(s.amount);
      subject='+'+payload.amount+' '+payload.kind.toUpperCase();
    }
    if(!window.confirm('Начислить '+subject+' игроку ID '+payload.recipientId+'?'))return;
    const marker=JSON.stringify(payload);
    if(s.retryPayload!==marker){s.retryId=crypto.randomUUID();s.retryPayload=marker;}
    s.busy=true;s.message='';draw();
    try{
      const result=await call('',{...payload,requestId:s.retryId});
      s.retryId=null;s.retryPayload=null;s.busy=false;s.error=false;
      s.message=s.rewardKind==='card'?
        'Карточка выдана. '+(result.mode==='test'?'Не учитывается в топе.':'Учитывается в топе.'):
        'Начислено '+payload.amount+' '+payload.kind.toUpperCase()+
        '. Уровень: '+result.level+'; баланс: '+result.balance+' F.';
      if(s.recipient===selfId())window.dispatchEvent(new Event('flip-admin-self-changed'));
      await load('refresh');
    }catch(e){
      s.busy=false;s.error=true;
      s.message='Не удалось начислить: '+e.message+'. Если связь оборвалась, повтори с той же формой.';
      draw();
    }
  }
  async function setUnlimited(kind){
    if(s.cooldownBusy||s.busy||!['drop','pack'].includes(kind)||!s.cooldowns)return;
    const old=kind==='drop'?s.cooldowns.drop_unlimited===true:
      s.cooldowns.pack_unlimited===true;
    const enabled=!old;
    const subject=kind==='drop'?'КД бесплатного дропа':'дневной лимит наборов';
    if(!window.confirm((enabled?'Убрать ':'Вернуть ')+subject+
      ' для своего аккаунта? Режим сохранится до следующего переключения.'))return;
    const retry=s.cooldownRetry;
    const id=retry?.kind===kind&&retry?.enabled===enabled?
      retry.id:crypto.randomUUID();
    s.cooldownRetry={kind,enabled,id};
    s.cooldownBusy=true;s.cooldownMessage='';s.cooldownError=false;draw();
    try{
      const result=await call('',{action:'set_unlimited',kind,enabled,requestId:id});
      s.cooldownRetry=null;
      s.cooldowns=result.cooldowns||s.cooldowns;
      s.cooldownMessage=kind==='drop'?
        (enabled?'Режим без КД включён. Дроп доступен без ожидания.':
                 'Обычный КД бесплатного дропа восстановлен.'):
        (enabled?'Дневной лимит наборов отключён. Цена: 200 F за набор.':
                 'Дневной лимит 10 наборов восстановлен.');
      s.cooldownError=false;
      window.dispatchEvent(new Event('flip-admin-self-changed'));
    }catch(error){
      s.cooldownError=true;
      s.cooldownMessage='Не удалось изменить режим: '+error.message+
        '. Повтори нажатие, чтобы проверить тот же запрос.';
    }finally{
      s.cooldownBusy=false;draw();
    }
  }
  async function click(e){
    const b=e.target.closest('button');if(!b||!root.contains(b))return;
    if(b.hasAttribute('data-admin-set-unlimited')){
      setUnlimited(b.dataset.adminSetUnlimited);return;
    }
    if(b.hasAttribute('data-admin-studio-login')||
       b.hasAttribute('data-admin-studio-login-copy')){
      if(s.busy)return;
      s.busy=true;
      const button=b;button.disabled=true;
      const previous=button.textContent;button.textContent='СОЗДАЁМ ССЫЛКУ…';
      try{
        const result=await call('studio_login',{action:'studio_login'});
        if(!result?.url)throw new Error('STUDIO_LOGIN_UNAVAILABLE');
        if(b.hasAttribute('data-admin-studio-login-copy')){
          if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(result.url);
          else window.prompt('Скопируй одноразовую ссылку входа (никому не передавай):',result.url);
          s.error=false;s.message='Одноразовая ссылка входа создана. Вставь её в браузер на компьютере.';
          draw();
        }else if(tg?.openLink)tg.openLink(result.url);
        else window.open(result.url,'_blank','noopener,noreferrer');
      }catch(error){
        s.error=true;s.message='Не удалось создать ссылку без email: '+error.message;
        draw();
      }finally{
        s.busy=false;
        if(button.isConnected){button.disabled=false;button.textContent=previous;}
      }
      return;
    }
    if(b.hasAttribute('data-admin-studio-code')){
      try{
        const r=await call('studio_ticket');
        if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(r.ticket);
        else window.prompt('Скопируй код для FLIP STUDIO:',r.ticket);
        s.error=false;s.message='Код входа владельца готов. Действует 5 минут.';draw();
      }catch(e){s.error=true;s.message='Не удалось скопировать код: '+e.message;draw()}
      return;
    }
    if(b.hasAttribute('data-admin-studio')){
      try{
        const r=await call('studio_ticket');
        if(tg?.openLink)tg.openLink(r.url);
        else window.open(r.url,'_blank','noopener,noreferrer');
      }catch(e){s.error=true;s.message='Не удалось открыть FLIP STUDIO: '+e.message;draw()}
      return;
    }
    if(b.hasAttribute('data-admin-self')){s.recipient=selfId();s.message='';draw();return;}
    if(b.hasAttribute('data-admin-user')){s.recipient=b.dataset.adminUser;s.message='';draw();return;}
    if(b.hasAttribute('data-admin-search')){s.message='';load('players');return;}
    if(b.hasAttribute('data-admin-kind')){s.rewardKind=b.dataset.adminKind;s.message='';draw();return;}
    if(b.hasAttribute('data-admin-grant'))grant();
  }
  function input(e){
    if(e.target.id==='flip-admin-search')s.q=e.target.value;
    if(e.target.id==='flip-admin-recipient')s.recipient=e.target.value;
    if(e.target.id==='flip-admin-note')s.note=e.target.value;
    if(e.target.id==='flip-admin-amount')s.amount=e.target.value;
    if(e.target.id==='flip-admin-card-search'){
      s.cardQuery=e.target.value;
      if(cardTimer)clearTimeout(cardTimer);
      cardTimer=setTimeout(()=>searchCards(),250);
    }
  }
  function change(e){
    if(e.target.id==='flip-admin-card')s.card=e.target.value;
    if(e.target.name==='flip-admin-mode'){s.mode=e.target.value;draw();}
  }
  window.FLIPAdmin={
    mount(el){
      if(!el||window.FLIPServer?.isAdmin!==true)return;
      if(root===el)return;
      root=el;stamp++;cardSeq++;if(cardTimer)clearTimeout(cardTimer);
      s.message='';s.error=false;s.cooldownMessage='';s.cooldownError=false;
      el.addEventListener('click',click);
      el.addEventListener('input',input);
      el.addEventListener('change',change);
      el.innerHTML='<p class="flip-admin-hint">Загружаем данные…</p>';
      load();
    }
  };
})();
