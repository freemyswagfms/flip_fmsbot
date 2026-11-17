/* FLIP v0.9.0 — dynamic catalog from authenticated server bootstrap.
   Keeps the five original Carti releases available in offline/demo mode. */
(() => {
 'use strict';
 const rarityStyles=Object.freeze({
   common:'Мраморный барельеф',rare:'Вышивка / гобелен',
   epic:'Витраж',legendary:'Масляная живопись',mythic:'Многослойная бумажная скульптура',
   hidden:'Секретный вариант'
 });
 const rarityLabels=Object.freeze({common:'Common',rare:'Rare',epic:'Epic',
   legendary:'Legendary',mythic:'Mythic',hidden:'Hidden'});
 const rarities=Object.freeze(['common','rare','epic','legendary','mythic']);
 const artists=[{id:'carti',name:'Playboi Carti',active:true,releases:[
  {id:'playboi-carti',title:'Playboi Carti',year:2017,active:true},
  {id:'die-lit',title:'Die Lit',year:2018,active:true},
  {id:'whole-lotta-red',title:'Whole Lotta Red',year:2020,active:true},
  {id:'music',title:'MUSIC',year:2025,active:true},
  {id:'in-abundance',title:'In Abundance',year:null,active:true,
    note:'Загружено из пользовательского набора; статус релиза уточним позже'}
 ]}];
 const cards=new Map();
 const validSlug=value=>typeof value==='string'&&/^[a-z0-9][a-z0-9-]{1,64}$/.test(value);
 const safeArtworkUrl=value=>{
   if(typeof value!=='string'||value.length>700)return '';
   if(/^\.\/src\/assets\/[a-z0-9/_-]+\.webp$/.test(value))return value;
   try{
     const url=new URL(value);
     return url.protocol==='https:'&&url.hostname==='sodhvekjhlmbhnrkmkzb.supabase.co'&&
       /^\/storage\/v1\/object\/public\/flip-artwork\/[a-z0-9/_-]+\.webp$/.test(url.pathname)&&
       !url.search&&!url.hash&&!url.username&&!url.password?url.href:'';
   }catch{return ''}
 };
 function makeCard(artist,release,rarity){
   if(!artist||!release||!rarityLabels[rarity])return null;
   const id=artist.id+'/'+release.id+'/'+rarity;
   const meta=cards.get(id);
   return {id,artistId:artist.id,releaseId:release.id,artist:artist.name,
     title:release.title,year:release.year,rarity:rarityLabels[rarity],color:rarity,
     style:rarityStyles[rarity],active:meta?.active??release.active??true,
     art:meta?.art||'./src/assets/'+id+'.webp'};
 }
 function getCard(artistId,releaseId,rarity){
   const a=artists.find(x=>x.id===artistId);
   const r=a?.releases.find(x=>x.id===releaseId);
   return makeCard(a,r,String(rarity||'').toLowerCase());
 }
 function getRandomCard(rarity){
   const available=artists.filter(a=>a.active!==false&&a.releases.some(r=>r.active!==false));
   if(!available.length)return null;
   const a=available[Math.floor(Math.random()*available.length)];
   const choices=a.releases.filter(r=>r.active!==false);
   return makeCard(a,choices[Math.floor(Math.random()*choices.length)],rarity);
 }
 function importServerCatalog(payload){
   if(!payload||!Array.isArray(payload.artists)||!Array.isArray(payload.releases)||
      !Array.isArray(payload.cards))return false;
   const list=payload.artists.filter(a=>validSlug(a.id)&&typeof a.name==='string'&&
     a.name.length>0&&a.name.length<=180).map(a=>({id:a.id,name:a.name,
     active:a.active!==false,releases:[]}));
   if(!list.length)return false;
   const map=new Map(list.map(x=>[x.id,x]));
   for(const r of payload.releases){
     const owner=map.get(r.artist_id);
     if(!owner||!validSlug(r.id)||typeof r.title!=='string'||r.title.length>250)continue;
     owner.releases.push({id:r.id,title:r.title,year:Number.isInteger(r.year)?r.year:null,
       active:r.active!==false});
   }
   const next=new Map();
   for(const c of payload.cards){
     if(!map.has(c.artist_id)||!validSlug(c.release_id)||!rarityLabels[c.rarity])continue;
     const id=c.artist_id+'/'+c.release_id+'/'+c.rarity;
     next.set(id,{art:safeArtworkUrl(c.art_url)||'./src/assets/'+id+'.webp',
       active:c.active!==false});
   }
   // Replace current catalog only once it is fully validated.
   if(!list.some(a=>a.releases.length))return false;
   artists.splice(0,artists.length,...list);
   cards.clear();for(const [id,detail] of next)cards.set(id,detail);
   return true;
 }
 window.FLIPCatalog={artists,rarities,rarityStyles,rarityLabels,getCard,getRandomCard,
   importServerCatalog,version:'0.9.0'};
})();
