/* FLIP v0.6 — temporary static content catalog. Replace image files by path; no artwork in JS. */
(() => {
  'use strict';
  const rarityStyles = Object.freeze({
    common: 'Печатная текстура',
    rare: 'Нитки / вышивка',
    epic: 'Мозаика / витраж',
    legendary: 'Масляные краски',
    mythic: 'Многослойная бумага'
  });
  const rarityLabels = Object.freeze({
    common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary', mythic: 'Mythic'
  });
  const rarities = Object.freeze(Object.keys(rarityStyles));
  const artists = [
    {
      id: 'carti',
      name: 'Playboi Carti',
      releases: [
        {id:'playboi-carti',title:'Playboi Carti',year:2017},
        {id:'die-lit',title:'Die Lit',year:2018},
        {id:'whole-lotta-red',title:'Whole Lotta Red',year:2020},
        {id:'music',title:'MUSIC',year:2025},
        {id:'in-abundance',title:'In Abundance',year:null, note:'Загружено из пользовательского набора; статус релиза уточним позже'}
      ]
    }
  ];
  function makeCard(artist, release, rarity) {
    if (!artist || !release || !rarityLabels[rarity]) return null;
    return {
      id: `${artist.id}/${release.id}/${rarity}`,
      artistId: artist.id,
      releaseId: release.id,
      artist: artist.name,
      title: release.title,
      year: release.year,
      rarity: rarityLabels[rarity],
      color: rarity,
      style: rarityStyles[rarity],
      art: `./src/assets/${artist.id}/${release.id}/${rarity}.webp`
    };
  }
  function getCard(artistId, releaseId, rarity) {
    const artist=artists.find(a=>a.id===artistId);
    const release=artist?.releases.find(r=>r.id===releaseId);
    return makeCard(artist,release,rarity);
  }
  function getRandomCard(rarity) {
    if (!artists.length) return null;
    const artist=artists[Math.floor(Math.random()*artists.length)];
    const release=artist.releases[Math.floor(Math.random()*artist.releases.length)];
    return makeCard(artist,release,rarity);
  }
  window.FLIPCatalog={artists,rarities,rarityStyles,rarityLabels,getCard,getRandomCard,version:'0.6.0'};
})();
