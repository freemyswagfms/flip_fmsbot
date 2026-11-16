/* FLIP v0.9.6.4 — searchable visual catalog + bulk grant basket.
   Presentation only: the server validates every requested card and quantity. */
(()=>{
 'use strict';
 const E=x=>String(x??'').replace(/[&<>"']/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
 }[c]));
 const rarityLabel={common:'COMMON',rare:'RARE',epic:'EPIC',
  legendary:'LEGENDARY',mythic:'MYTHIC',hidden:'HIDDEN'};
 const rarityOrder=['','common','rare','epic','legendary','mythic','hidden'];
 function cardInfo(card){
   const id=typeof card==='string'?card:card?.id;
   if(typeof id!=='string'||!/^[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9-]+$/i.test(id))
     return null;
   if(id==='demo/hidden/archive-001')return {id,artist:'FLIP // SECRET',
      title:'ARCHIVE 001',rarity:'hidden',art:'',label:'FLIP SECRET — ARCHIVE 001'};
   const p=id.split('/');
   const c=window.FLIPCatalog?.getCard?.(...p);
   return {id,artist:c?.artist||card?.artist||'FLIP',
     title:c?.title||card?.release||'SECRET CARD',
     art:c?.art||'',rarity:p[2],
     label:card?.label||(c?.artist||p[0])+' — '+(c?.title||p[1])};
 }
 function cover(card){
   const c=cardInfo(card);
   if(!c)return '<span class="flip-admin-card-fallback">FLIP.</span>';
   return c.art?
     '<img src="'+E(c.art)+'" loading="lazy" decoding="async" alt="'+E(c.title)+'" draggable="false" onerror="this.hidden=true">':
     '<span class="flip-admin-card-fallback">FLIP.</span>';
 }
 function grid(items,basket,total,offset){
   const chosen=new Map((basket||[]).map(x=>[x.id,x.quantity]));
   if(!items?.length)return '<p class="flip-admin-hint">Карточек с такими условиями не найдено.</p>';
   return '<div class="flip-admin-card-grid">'+items.map(item=>{
     const info=cardInfo(item);
     if(!info)return '';
     const selected=chosen.get(info.id)||0;
     return '<article class="flip-admin-card-tile '+E(info.rarity)+
       (selected?' is-selected':'')+'">'+
       '<button type="button" class="flip-admin-card-preview" data-admin-preview-card="'+E(info.id)+
         '" aria-label="Увеличить '+E(info.label)+'">'+cover(info)+'<span class="flip-admin-card-zoom">'+
         '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5"/></svg></span></button>'+
       '<div class="flip-admin-card-tile-info"><small>'+E(info.artist)+'</small>'+
         '<strong>'+E(info.title)+'</strong>'+
         '<span class="flip-admin-rarity '+E(info.rarity)+'">'+E(rarityLabel[info.rarity]||info.rarity.toUpperCase())+'</span></div>'+
       '<button type="button" class="flip-admin-card-add" data-admin-add-card="'+E(info.id)+
         '" '+(selected?'aria-label="Добавить ещё '+E(info.title)+'"':'')+
         '>'+ (selected?'В КОРЗИНЕ ×'+selected+' · +1':'+ ДОБАВИТЬ')+'</button>'+
     '</article>';
   }).join('')+'</div>'+
   (offset<total?'<button type="button" class="outlinebtn flip-admin-more" data-admin-more>'+
     'ПОКАЗАТЬ ЕЩЁ <span>('+Math.max(0,total-offset)+' ОСТАЛОСЬ)</span></button>':'');
 }
 function cart(items){
   const sum=items.reduce((v,x)=>v+x.quantity,0);
   if(!items.length)return '<div class="flip-admin-cart-empty">Выбери карточки выше. Здесь появится корзина выдачи.</div>';
   return '<div class="flip-admin-cart-list">'+items.map(item=>{
     const info=cardInfo(item)||{id:item.id,rarity:'common',artist:'FLIP',title:item.id};
     return '<div class="flip-admin-cart-line">'+
       '<div class="flip-admin-cart-thumb">'+cover(item)+'</div>'+
       '<div class="flip-admin-cart-label"><strong>'+E(info.title)+'</strong>'+
         '<small>'+E(info.artist)+' · '+E(rarityLabel[info.rarity]||info.rarity)+'</small></div>'+
       '<div class="flip-admin-cart-stepper"><button type="button" data-admin-cart-minus="'+E(item.id)+
         '" aria-label="Уменьшить количество">−</button>'+
         '<output>'+item.quantity+'</output>'+
         '<button type="button" data-admin-cart-plus="'+E(item.id)+
         '" aria-label="Увеличить количество" '+(sum>=20?'disabled':'')+'>+</button></div>'+
       '<button type="button" class="flip-admin-cart-remove" data-admin-cart-remove="'+E(item.id)+
          '" aria-label="Удалить '+E(info.title)+'">×</button>'+
     '</div>';
   }).join('')+'</div>';
 }
 window.FLIPAdminVisual={grid,cart,cardInfo,cover,rarities:rarityOrder,rarityLabel};
})();
