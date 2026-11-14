/* FLIP v0.8.3 — private in-app admin controls. API verifies Telegram ID on every call. */
(() => {
  'use strict';
  const E=x=>String(x??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const tg=window.Telegram?.WebApp;
  const raw=tg?.initData||'';
  let root=null,stamp=0;
  const s={players:[],cards:[],history:[],leaders:[],q:'',recipient:'',card:'',
    mode:'test',note:'',busy:false,message:'',error:false,retryId:null,retryPayload:null};
  function selfId(){
    try{const p=JSON.parse(new URLSearchParams(raw).get('user')||'null');
      return Number.isSafeInteger(p?.id)&&p.id>0?String(p.id):'';}
    catch{return ''}
  }
  async function call(view,payload){
    const url=new URL('/api/admin',location.origin);
    if(!payload){url.searchParams.set('view',view);if(view==='players'&&s.q.trim())
      url.searchParams.set('q',s.q.trim().replace(/^@/,''));}
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
  function ranking(){
    return s.leaders.length?s.leaders.slice(0,10).map((p,i)=>'<div class="flip-admin-leader"><span>'+
      (i+1)+'.</span><strong>'+E(p.username?'@'+p.username:(p.first_name||'FLIP PLAYER'))+
      '</strong><small>'+E(p.ranked_cards)+' карт.</small></div>').join(''):
      '<p class="flip-admin-hint">Рейтинговых карточек пока нет.</p>';
  }
  function draw(){
    if(!root||!root.isConnected)return;
    root.innerHTML=[
      '<section class="flip-admin-section"><div class="flip-admin-section-heading"><h3>01 / ПОЛУЧАТЕЛЬ</h3>',
      '<button type="button" class="outlinebtn" data-admin-self>СЕБЕ</button></div>',
      '<div class="flip-admin-search"><input id="flip-admin-search" maxlength="64" placeholder="Имя, @username или ID" value="',E(s.q),
      '"><button type="button" class="outlinebtn" data-admin-search>НАЙТИ</button></div>',
      '<div class="flip-admin-users">',players(),'</div>',
      '<label class="flip-admin-field-label" for="flip-admin-recipient">Telegram ID получателя</label>',
      '<input class="flip-admin-input" id="flip-admin-recipient" inputmode="numeric" maxlength="16" placeholder="Выбери игрока" value="',E(s.recipient),'"></section>',
      '<section class="flip-admin-section"><h3>02 / КАРТОЧКА</h3>',
      '<select class="flip-admin-input" id="flip-admin-card">',
      s.cards.map(c=>'<option value="'+E(c.id)+'" '+(s.card===c.id?'selected':'')+'>'+E(c.label)+'</option>').join(''),
      '</select><h3 class="flip-admin-small-heading">03 / ТИП ВЫДАЧИ</h3>',
      '<label class="flip-admin-mode-choice '+(s.mode==='test'?'chosen':'')+'">',
      '<input type="radio" name="flip-admin-mode" value="test" '+(s.mode==='test'?'checked':'')+'>',
      '<span><strong>Тестовая / административная</strong><small>Пометка «ТЕСТ» в коллекции. В топе не учитывается.</small></span></label>',
      '<label class="flip-admin-mode-choice '+(s.mode==='ranked'?'chosen':'')+'">',
      '<input type="radio" name="flip-admin-mode" value="ranked" '+(s.mode==='ranked'?'checked':'')+'>',
      '<span><strong>Рейтинговая / обычная</strong><small>Учитывается в топе. Источник выдачи сохраняется в журнале администрации.</small></span></label>',
      '<label class="flip-admin-field-label" for="flip-admin-note">Причина (необязательно)</label>',
      '<input class="flip-admin-input" id="flip-admin-note" maxlength="200" placeholder="Например, тест оформления" value="',E(s.note),'">',
      '<p class="flip-admin-hint">Историю выдачи невозможно скрыть из журнала. Тестовые копии исключены из рейтингов.</p>',
      s.message?'<div role="status" class="flip-admin-message '+(s.error?'failed':'ok')+'">'+E(s.message)+'</div>':'',
      '<button type="button" class="bigbtn" data-admin-grant '+(s.busy||!s.cards.length?'disabled':'')+'>',
      s.busy?'СОХРАНЕНИЕ…':'ВЫДАТЬ КАРТОЧКУ ↗','</button></section>',
      '<section class="flip-admin-section"><h3>ЖУРНАЛ ВЫДАЧ</h3>',history(),'</section>',
      '<section class="flip-admin-section"><h3>ПРЕДВАРИТЕЛЬНЫЙ ТОП</h3>',
      '<p class="flip-admin-hint">Включает только рейтинговые экземпляры.</p>',ranking(),'</section>'
    ].join('');
  }
  async function load(part='all'){
    const job=stamp;
    try{
      if(part==='all'){
        const [u,c,h,l]=await Promise.all([call('players'),call('catalog'),call('history'),call('ranked')]);
        if(job!==stamp)return;
        s.players=u.players||[];s.cards=c.cards||[];s.history=h.history||[];s.leaders=l.leaders||[];
        if(!s.cards.some(x=>x.id===s.card))s.card=s.cards[0]?.id||'';
      }else if(part==='players'){
        const r=await call('players');if(job!==stamp)return;s.players=r.players||[];
      }else{
        const [u,h,l]=await Promise.all([call('players'),call('history'),call('ranked')]);
        if(job!==stamp)return;s.players=u.players||[];s.history=h.history||[];s.leaders=l.leaders||[];
      }
      draw();
    }catch(e){if(job!==stamp)return;s.error=true;s.message='Ошибка запроса: '+e.message;draw()}
  }
  async function grant(){
    if(s.busy)return;
    const payload={action:'grant_card',recipientId:s.recipient.trim(),cardId:s.card,mode:s.mode,note:s.note.trim()};
    if(!/^[1-9]\d{0,15}$/.test(payload.recipientId)||!payload.cardId){
      s.error=true;s.message='Сначала выбери получателя и карточку.';draw();return;
    }
    const card=s.cards.find(x=>x.id===payload.cardId);
    if(!window.confirm('Выдать '+(card?.label||payload.cardId)+' игроку ID '+payload.recipientId+
      '?\nРежим: '+(payload.mode==='test'?'ТЕСТ (не учитывается в топе)':'РЕЙТИНГОВАЯ')))return;
    const marker=JSON.stringify(payload);
    if(s.retryPayload!==marker){s.retryId=crypto.randomUUID();s.retryPayload=marker;}
    s.busy=true;s.message='';draw();
    try{
      const result=await call('',{...payload,requestId:s.retryId});
      s.retryId=null;s.retryPayload=null;s.busy=false;s.error=false;
      s.message='Карточка выдана. '+(result.mode==='test'?'Не учитывается в топе.':'Учитывается в топе.');
      await load('refresh');
    }catch(e){
      s.busy=false;s.error=true;
      s.message='Не удалось выдать: '+e.message+'. Если связь оборвалась, повтори с той же формой — это безопасно.';
      draw();
    }
  }
  function click(e){
    const b=e.target.closest('button');if(!b||!root.contains(b))return;
    if(b.hasAttribute('data-admin-self')){s.recipient=selfId();s.message='';draw();return;}
    if(b.hasAttribute('data-admin-user')){s.recipient=b.dataset.adminUser;s.message='';draw();return;}
    if(b.hasAttribute('data-admin-search')){s.message='';load('players');return;}
    if(b.hasAttribute('data-admin-grant'))grant();
  }
  function input(e){
    if(e.target.id==='flip-admin-search')s.q=e.target.value;
    if(e.target.id==='flip-admin-recipient')s.recipient=e.target.value;
    if(e.target.id==='flip-admin-note')s.note=e.target.value;
  }
  function change(e){
    if(e.target.id==='flip-admin-card')s.card=e.target.value;
    if(e.target.name==='flip-admin-mode'){s.mode=e.target.value;draw();}
  }
  window.FLIPAdmin={
    mount(el){
      if(!el||window.FLIPServer?.isAdmin!==true)return;
      if(root===el)return;
      root=el;stamp++;s.message='';s.error=false;
      el.addEventListener('click',click);
      el.addEventListener('input',input);
      el.addEventListener('change',change);
      el.innerHTML='<p class="flip-admin-hint">Загружаем данные…</p>';
      load();
    }
  };
})();
