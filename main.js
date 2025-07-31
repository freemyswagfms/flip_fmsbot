// flip_app_main.js

document.addEventListener('DOMContentLoaded', () => {
  // === Telegram WebApp Init ===
  if (window.Telegram && window.Telegram.WebApp) {
    Telegram.WebApp.ready();
    Telegram.WebApp.expand();
  }


  // === Карточки коллекции ===
  
  const cardCollection = [
  {
    id: 'pinktape',
    title: 'Pink Tape',
    artist: 'Lil Uzi Vert',
    category: 'album',
    rarity: 'Mythic',
    artistRarity: 'Legendary',
    skin: 'Cyberpunk',
    skinRarity: 'Legendary',
    image: '/assets/nft albums/uzi-pinktape-cyberpunk.png',
    xp: 45,
    drop: 'Дроп',
    date: '23.07.2025',
    duplicates: 0
  },
  {
    id: 'jeans',
    title: 'jeans',
    artist: '2hollis',
    category: 'single',
    rarity: 'Epic',
    artistRarity: 'Rare',
    skin: 'GTA',
    skinRarity: 'Mythic',
    image: '/assets/nft albums/2hollis-jeans-gta.png',
    xp: 30,
    drop: 'Дроп',
    date: '22.07.2025',
    duplicates: 1
  },
  {
    id: 'brokeboi',
    title: 'Broke Boi',
    artist: 'Playboi Carti',
    category: 'single',
    rarity: 'Legendary',
    artistRarity: 'Legendary',
    skin: 'Pixel',
    skinRarity: 'Common',
    image: '/assets/nft albums/carti-brokeboi-pixel.png',
    xp: 80,
    drop: 'Квест',
    date: '21.07.2025',
    duplicates: 2
  },
  {
    id: 'graduation',
    title: 'Graduation',
    artist: 'Kanye West',
    category: 'album',
    rarity: 'Legendary',
    artistRarity: 'Legendary',
    skin: 'Minecraft',
    skinRarity: 'Chromatic',
    image: '/assets/nft albums/kanye-graduation-minecraft.png',
    xp: 100,
    drop: 'Дроп',
    date: '20.07.2025',
    duplicates: 0
  },
  {
    id: 'somuchfun',
    title: 'So Much Fun',
    artist: 'Young Thug',
    category: 'album',
    rarity: 'Legendary',
    artistRarity: 'Legendary',
    skin: 'Spider-Verse',
    skinRarity: 'Epic',
    image: '/assets/nft albums/thug-somuchfun-spiderverse.png',
    xp: 70,
    drop: 'Дроп',
    date: '19.07.2025',
    duplicates: 1
  },
  {
    id: 'astroworld',
    title: 'Astroworld',
    artist: 'Travis Scott',
    category: 'album',
    rarity: 'Legendary',
    artistRarity: 'Legendary',
    skin: 'Simpsons',
    skinRarity: 'Rare',
    image: '/assets/nft albums/travis-astroworld-simpsons.png',
    xp: 120,
    drop: 'Квест',
    date: '18.07.2025',
    duplicates: 0
  },
  {
    id: 'wlr',
    title: 'Whole Lotta Red',
    artist: 'Playboi Carti',
    category: 'album',
    rarity: 'Legendary',
    artistRarity: 'Legendary',
    skin: 'Cyberpunk',
    skinRarity: 'Legendary',
    image: '/assets/nft albums/carti-wlr-cyberpunk.png',
    xp: 110,
    drop: 'Дроп',
    date: '17.07.2025',
    duplicates: 3
  },
  {
    id: 'projectx',
    title: 'Project X',
    artist: 'Ken Carson',
    category: 'album',
    rarity: 'Epic',
    artistRarity: 'Epic',
    skin: 'Pixel',
    skinRarity: 'Common',
    image: '/assets/nft albums/ken-projectx-pixel.png',
    xp: 55,
    drop: 'Дроп',
    date: '16.07.2025',
    duplicates: 0
  }
];


  // === Тема (светлая/тёмная) ===
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'light') document.body.classList.add('light');

  // === DOM Элементы ===
  const splash = document.getElementById('splash');
  const mainApp = document.getElementById('main-app');
  const fill = document.querySelector('.progress-bar-fill');
  const navMenu = document.querySelector('.nav-menu');
  const navBtns = Array.from(document.querySelectorAll('.nav-btn'));
  const navBg = document.querySelector('.nav-bg');
  const pages = document.querySelectorAll('.page');
  const tabs = document.querySelectorAll('.tab');
  const user = window.Telegram?.WebApp?.initDataUnsafe?.user;
  

  // === Открывает страницу с информацией о карточке ===
  function openCardInfo(card) {
  const page = document.getElementById('card-detail-page');

  // Подставляем текст: название, артист, картинку, редкость
  page.querySelector('.card-title').textContent = card.title;
  page.querySelector('.card-artist').textContent = card.artist;
  page.querySelector('.card-image').src = card.image;
  page.querySelector('.card-rarity').textContent = `${card.skin.toUpperCase()} · ${card.skinRarity.toUpperCase()}`;

  // Подставляем строки с редкостями
page.querySelector('.card-rarity-details').innerHTML = `
  <div class="card-rarity-row">
    <div class="card-rarity-label">${card.artist}</div>
    <div class="card-rarity-value">${card.artistRarity}</div>
  </div>
  <div class="card-rarity-row">
    <div class="card-rarity-label">${card.title}</div>
    <div class="card-rarity-value">${card.rarity}</div>
  </div>
  <div class="card-rarity-row">
    <div class="card-rarity-label">${card.skin}</div>
    <div class="card-rarity-value">${card.skinRarity}</div>
  </div>
`;


  // Подставляем статистику
  page.querySelector('.card-duplicate').textContent = card.duplicates;
  page.querySelector('.card-drop').textContent = card.drop;
  page.querySelector('.card-xp').textContent = `${card.xp}XP`;
  page.querySelector('.card-date').textContent = card.date;

  // Скрываем все страницы
  document.querySelectorAll('.page').forEach(p => {
    p.style.display = 'none';
    p.classList.remove('active');
  });

  // Показываем страницу карточки
  page.style.display = 'flex';
  page.classList.add('active');

  // Скрываем нижнее меню
  document.querySelector('.nav-menu').style.display = 'none';

  // Показываем Telegram кнопку назад
  Telegram.WebApp.BackButton.show();

  setTimeout(() => {
  window.scrollTo({ top: 0, behavior: 'auto' });
}, 0);


}

// === Обработчик Telegram Back Button ===
Telegram.WebApp.BackButton.onClick(() => {
  // Скрываем все .page
  document.querySelectorAll('.page').forEach(p => {
    p.style.display = 'none';
    p.classList.remove('active');
  });

  // Показываем main-app
  document.getElementById('main-app').style.display = 'block';

  // Показываем коллекцию
  const collectionPage = document.getElementById('collection');
  collectionPage.style.display = 'block';
  collectionPage.classList.add('active');

  // Показываем нижнее меню
  document.querySelector('.nav-menu').style.display = 'flex';

  // Скрываем Telegram BackButton
  Telegram.WebApp.BackButton.hide();
});


// === Генерация карточек коллекции из массива cardCollection ===
function renderCards(filterValue = null) {
  const grid = document.querySelector('.collection-grid');
  grid.innerHTML = '';

  const filteredFirst = [];
  const rest = [];

  cardCollection.forEach(card => {
    const category = card.category.toLowerCase();
    const rarity = card.rarity.toLowerCase();
    const value = filterValue?.toLowerCase();

    if (value && (category === value || rarity === value)) {
      filteredFirst.push(card);
    } else {
      rest.push(card);
    }
  });

  const orderedCards = [...filteredFirst, ...rest];

  orderedCards.forEach(card => {
    const el = document.createElement('div');
    el.className = 'collection-card';
    el.dataset.category = card.category;
    el.dataset.rarity = card.rarity.toLowerCase();

    el.innerHTML = `
      <div class="card-inner">
        <img src="${card.image}" alt="${card.title}" class="card-img" />
        <div class="card-label">${card.title}</div>
      </div>
    `;

    el.addEventListener('click', () => {
      openCardInfo(card);
    });

    grid.appendChild(el);
  });
}

// При загрузке — показываем карточки по умолчанию (альбомы)
renderCards('album');


  // === Отображение "МОЕЙ ПОЗИЦИИ" в таблице лидеров ===
  const myLeaderboardCard = document.querySelector('.leader-card.my-position');

  if (user && myLeaderboardCard) {
    const nameEl = myLeaderboardCard.querySelector('.leader-name');
    const avatarEl = myLeaderboardCard.querySelector('.leader-avatar');

      if (nameEl) {
        nameEl.textContent = user.username || user.first_name || `Вы`;
      }

      if (avatarEl && user.username) {
      avatarEl.style.backgroundImage = `url("https://t.me/i/userpic/320/${user.username}.jpg")`;
      }
  }

  // === Переход между основными страницами через нижнее меню ===
  let activeIndex = navBtns.findIndex(btn => btn.classList.contains('active'));
  if (activeIndex === -1) activeIndex = 0;

  function moveBgToActive(index) {
    const btn = navBtns[index];
    const menuRect = navMenu.getBoundingClientRect();
    requestAnimationFrame(() => {
      const btnRect = btn.getBoundingClientRect();
      const bgWidth = parseFloat(getComputedStyle(navBg).width);
      const centerX = btnRect.left + btnRect.width / 2 - menuRect.left;
      navBg.style.left = `${centerX - bgWidth / 2}px`;
    });
  }

  navBtns.forEach((btn, idx) => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      navBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      moveBgToActive(idx);

      window.scrollTo(0, 0);
      const targetPage = btn.getAttribute('data-page');
      pages.forEach(page => {
        if (page.id === targetPage) {
          page.style.display = '';
          page.classList.add('active');
          if (targetPage === 'profile') animateLevelPercent();
        } else {
          page.style.display = 'none';
          page.classList.remove('active');
        }
      });
      adjustTopPadding();
    });
  });

  // === Splash Screen (загрузка) ===
  splash.style.display = 'flex';
  mainApp.style.display = 'none';
  if (fill) setTimeout(() => { fill.style.width = '100%'; }, 200);

  setTimeout(() => {
    splash.style.opacity = '0';
      setTimeout(() => {
        splash.style.display = 'none';
        mainApp.style.display = 'block';
        adjustTopPadding();
        moveBgToActive(activeIndex);
      }, 500);
  }, 1400);

  // === Коррекция отступа сверху (для fullscreen) ===
  function adjustTopPadding() {
    const isFullscreen = window.innerHeight === screen.height;
    mainApp.style.paddingTop = (isFullscreen ? 60 : 1) + 'px';
  }

  // === Переходы по профилю ===
setupPageNavigation('achievements', 'achievements-page');
setupPageNavigation('stat', 'stat-page');
setupPageNavigation('leaderboard', 'leaderboard-page');
setupPageNavigation('level', 'balance-page', true);
// === Переходы на страницу квестов ===
setupPageNavigation('quests', 'quests-page');         // из профиля
setupPageNavigation('go-to-quests', 'quests-page');   // с главной
// === Переходы на страницу пополнение баланса ===
setupPageNavigation('topup-btn', 'topup-page');       // с магазина
setupPageNavigation('go-topup', 'topup-page'); // с профиля



  function setupPageNavigation(btnId, pageId, scrollToLevel = false) {
    const btn = document.getElementById(btnId);
    const page = document.getElementById(pageId);
    if (!btn || !page) return;
    btn.addEventListener('click', () => {
      pages.forEach(p => { p.style.display = 'none'; p.classList.remove('active'); });
      navMenu.style.display = 'none';
      page.style.display = 'block';
      page.classList.add('active');
      window.scrollTo(0, 0);
      if (scrollToLevel) {
        setTimeout(() => {
          const currentLevelEl = page.querySelector('.level.current');
          if (currentLevelEl) currentLevelEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      }
      if (pageId === 'achievements-page') animateAchievementProgress();
    });

    const backBtn = page.querySelector('.back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        page.style.display = 'none';
        page.classList.remove('active');
        const profilePage = document.getElementById('profile');
        profilePage.style.display = '';
        profilePage.classList.add('active');
        navMenu.style.display = '';
        moveBgToActive(navBtns.findIndex(b => b.classList.contains('profile-icon')));
      });
    }
  }

  // === Анимация полосы прогресса уровня ===
  function animateLevelPercent() {
    const percentEl = document.querySelector('.level-percent');
    if (percentEl) {
      const raw = percentEl.dataset.percent || percentEl.textContent;
      const finalValue = parseInt(raw);
      if (isNaN(finalValue)) return;
      let current = 0;
      const step = () => {
        current++;
        percentEl.textContent = `${current}%`;
        if (current < finalValue) requestAnimationFrame(step);
      };
      percentEl.textContent = `0%`;
      requestAnimationFrame(step);
    }
  }

  // === Персонализация профиля ===
  const nicknameEl = document.querySelector('.nickname');
  const avatarEl = document.querySelector('.avatar.big');
  if (nicknameEl && avatarEl) {
    if (user) {
      nicknameEl.textContent = user.username || user.first_name || `id${user.id}`;
      if (user.username) avatarEl.style.backgroundImage = `url('https://t.me/i/userpic/320/${user.username}.jpg')`;
      else avatarEl.style.backgroundColor = '#ccc';
    } else {
      nicknameEl.textContent = 'Гость';
      avatarEl.style.backgroundColor = '#ccc';
    }
  }


  // === FAB-поиск в коллекции ===
const searchFab = document.getElementById('searchFab');
const searchInput = searchFab?.querySelector('.search-input');
let isSearchOpen = false;

if (searchFab && searchInput) {
  searchFab.addEventListener('click', (e) => {
    if (isSearchOpen && e.target.closest('.search-icon')) {
      searchFab.classList.remove('open');
      searchInput.value = '';
      isSearchOpen = false;
      // ✅ показываем все карточки обратно
      document.querySelectorAll('.collection-card').forEach(card => card.style.display = '');
    } else if (!isSearchOpen) {
      searchFab.classList.add('open');
      isSearchOpen = true;
      setTimeout(() => searchInput.focus(), 100);
    }
    e.stopPropagation();
  });

  document.addEventListener('click', (e) => {
    if (isSearchOpen && !searchFab.contains(e.target)) {
      searchFab.classList.remove('open');
      searchInput.value = '';
      isSearchOpen = false;
      // ✅ показываем все карточки обратно
      document.querySelectorAll('.collection-card').forEach(card => card.style.display = '');
    }
  });

  searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim().toLowerCase();
    // ✅ фильтруем по заголовку
    document.querySelectorAll('.collection-card').forEach(card => {
      const text = card.textContent.toLowerCase();
      card.style.display = text.includes(query) ? '' : 'none';
    });
  });
}


// === Оверлей соцсетей (НАШИ СОЦСЕТИ) ===
  const socialOverlay = document.getElementById('social-overlay');
  const socialBtn = document.getElementById('setting-social');

  if (socialBtn && socialOverlay) {
    socialBtn.addEventListener('click', e => {
      e.preventDefault();
      socialOverlay.classList.add('show');
    });

    socialOverlay.addEventListener('click', e => {
      if (e.target === socialOverlay) {
        socialOverlay.classList.remove('show');
      }
    });
  }

  const expandBtn = document.querySelector('.social-expand-btn');
  const hiddenList = document.querySelector('.social-hidden-list');

  if (expandBtn && hiddenList) {
    expandBtn.addEventListener('click', () => {
      const isVisible = hiddenList.style.display === 'block';
      hiddenList.style.display = isVisible ? 'none' : 'block';
    });
  }

  // === Кнопки настроек: пополнение и тема ===
  const themeOverlay = document.getElementById('theme-overlay');
  const themeBtn = document.getElementById('setting-theme');

  if (themeBtn && themeOverlay) {
    themeBtn.addEventListener('click', e => {
      e.preventDefault();
      themeOverlay.classList.add('show');
    });

    themeOverlay.addEventListener('click', e => {
      if (e.target === themeOverlay) {
        themeOverlay.classList.remove('show');
      }
    });
  }

// === ОВЕРЛЕЙ "Связь с нами" ===
const contactOverlay = document.getElementById('contact-overlay');
const contactBtn = document.getElementById('setting-contact');

if (contactBtn && contactOverlay) {
  contactBtn.addEventListener('click', e => {
    e.preventDefault();
    contactOverlay.classList.add('show');
  });

  contactOverlay.addEventListener('click', e => {
    if (e.target === contactOverlay) {
      contactOverlay.classList.remove('show');
    }
  });
}


 // === Переключение темы (исправленный вариант) ===
const themeToggleCheckbox = document.getElementById('theme-toggle-checkbox');

if (themeToggleCheckbox) {
  const savedTheme = localStorage.getItem('theme');
  const isLight = savedTheme === 'light';
  document.body.classList.toggle('light', isLight);
  themeToggleCheckbox.checked = isLight;

  themeToggleCheckbox.addEventListener('change', () => {
    if (themeToggleCheckbox.checked) {
      document.body.classList.add('light');
      localStorage.setItem('theme', 'light');
    } else {
      document.body.classList.remove('light');
      localStorage.setItem('theme', 'dark');
    }
  });
}

  // === Таймер дропа ===
  function startDropTimer(hours, minutes) {
    const display = document.querySelector('.drop-timer');
    if (!display) return;
    let totalSeconds = hours * 3600 + minutes * 60;
    function updateTimer() {
      const h = Math.floor(totalSeconds / 3600);
      const m = Math.floor((totalSeconds % 3600) / 60);
      display.textContent = `следующий дроп через: ${h}ч ${m}м`;
      if (totalSeconds > 0) totalSeconds--;
      else clearInterval(timer);
    }
    updateTimer();
    const timer = setInterval(updateTimer, 60000);
  }
  startDropTimer(3, 59);

  // === Оверлей подписки по кнопке старта ===
  const startBtn = document.querySelector('.start-btn');
  const subscribeOverlay = document.getElementById('subscribe-overlay');
  if (startBtn && subscribeOverlay) {
    startBtn.addEventListener('click', e => {
      e.preventDefault();
      subscribeOverlay.classList.add('show');
    });
    subscribeOverlay.addEventListener('click', e => {
      if (e.target === subscribeOverlay) subscribeOverlay.classList.remove('show');
    });
  }

  // === Переход в магазин по кнопке "в магазин" ===
  const shopBtn = document.getElementById('go-to-shop');
  if (shopBtn) {
    shopBtn.addEventListener('click', e => {
      e.preventDefault();
      navBtns.forEach(b => b.classList.remove('active'));
      document.querySelector('.shop-icon')?.classList.add('active');
      pages.forEach(p => {
        if (p.id === 'shop') {
          p.style.display = '';
          p.classList.add('active');
        } else {
          p.style.display = 'none';
          p.classList.remove('active');
        }
      });
      setTimeout(() => {
        document.getElementById('new-collection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
      moveBgToActive(navBtns.findIndex(b => b.classList.contains('shop-icon')));
    });
  }

  // === Оверлей заданий (каналы) ===
  function initTaskButtons() {
    const overlay = document.getElementById('task-overlay');
    const channelName = document.getElementById('channel-name');
    const goSubscribe = document.getElementById('go-subscribe');
    const tasks = [
      { name: 'Free My Leaks', url: 'https://t.me/freemyleaks' },
      { name: 'Free My Memes', url: 'https://t.me/freemyswagmemes' },
      { name: 'PBC', url: 'https://t.me/pbccarter' }
    ];
    document.querySelectorAll('.task-btn').forEach((btn, index) => {
      btn.addEventListener('click', () => {
        const task = tasks[index];
        if (!task) return;
        channelName.textContent = task.name;
        goSubscribe.href = task.url;
        overlay.classList.add('show');
      });
    });
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.classList.remove('show');
    });
  }
  initTaskButtons();

  // === Достижения: анимация прогресса кольца ===
  function animateAchievementProgress() {
    document.querySelectorAll('.achievement-card.in-progress').forEach(card => {
      const valueText = card.querySelector('.progress-text')?.textContent.trim();
      if (!valueText) return;
      const [current, total] = valueText.split('/').map(Number);
      if (isNaN(current) || isNaN(total) || total === 0) return;
      const progress = current / total;
      const circle = card.querySelector('.ring-blue');
      if (!circle) return;
      const radius = parseFloat(circle.getAttribute('r'));
      const circumference = 2 * Math.PI * radius;
      circle.style.strokeDasharray = `${circumference}`;
      circle.style.strokeDashoffset = `${circumference}`;
      setTimeout(() => {
        circle.style.strokeDashoffset = `${circumference * (1 - progress)}`;
      }, 100);
    });
  }

 // === СЧЁТЧИК: Автоподсчёт флипов и ₽ с учётом курса карточек ===
const fReceive = document.getElementById('f-receive');
const fPay = document.getElementById('f-pay');
const manualInput = document.getElementById('custom-amount');
const topupCardsAll = document.querySelectorAll('.topup-card');

if (fReceive && fPay && manualInput && topupCardsAll.length) {
  // === Автоматически определяем базовый курс по самой дешёвой карточке ===
  let baseRate = 2; // fallback по умолчанию

  topupCardsAll.forEach(card => {
    const f = parseInt(card.querySelector('.topup-amount')?.textContent?.replace('F', '').trim());
    const r = parseInt(card.querySelector('.topup-price')?.textContent?.replace('₽', '').trim());
    if (!isNaN(f) && !isNaN(r)) {
      const rate = r / f;
      if (rate > baseRate) baseRate = rate; // использовать самый невыгодный (дорогой) курс
    }
  });

  // === При вводе вручную ===
  manualInput.addEventListener('input', () => {
    const value = parseInt(manualInput.value.trim(), 10);
    if (!isNaN(value) && value > 0) {
      const price = Math.ceil(value * baseRate);
      fReceive.textContent = `${value}F`;
      fPay.textContent = `${price}₽`;
    } else {
      fReceive.textContent = `0F`;
      fPay.textContent = `0₽`;
    }
  });

  // === При клике по готовой карточке ===
  topupCardsAll.forEach(card => {
    card.addEventListener('click', () => {
      const fAmount = card.querySelector('.topup-amount')?.textContent?.replace('F', '')?.trim();
      const priceText = card.querySelector('.topup-price')?.textContent?.replace('₽', '')?.trim();

      const flips = parseInt(fAmount);
      const rubles = parseInt(priceText);

      if (!isNaN(flips) && !isNaN(rubles)) {
        fReceive.textContent = `${flips}F`;
        fPay.textContent = `${rubles}₽`;
        manualInput.value = ''; // сброс ввода
      }
    });
  });
}



  // === Кнопка "забрать" достижения ===
  document.querySelectorAll('.achievement-card[data-status="ready-to-claim"] .claim').forEach(button => {
    button.addEventListener('click', e => {
      const card = e.target.closest('.achievement-card');
      if (!card) return;
      card.setAttribute('data-status', 'completed');
      const btn = document.createElement('div');
      btn.className = 'achievement-btn collected';
      btn.textContent = 'выполнено';
      button.replaceWith(btn);
      if (!card.querySelector('.status-icon')) {
        const icon = document.createElement('div');
        icon.className = 'status-icon checkmark';
        card.appendChild(icon);
      }
    });
  });

  // === Квест: пригласи 10 друзей ===
  const inviteBtn = document.getElementById('invite-btn');
  const inviteProgress = document.getElementById('invite-progress');
  if (inviteBtn && inviteProgress && !inviteBtn.classList.contains('completed')) {
    inviteBtn.addEventListener('click', () => {
      inviteProgress.textContent = 'приглашено: 10/10';
      inviteBtn.textContent = 'выполнено';
      inviteBtn.classList.add('completed');
    });
  }

  // === Ежедневная награда ===
  const rewardBtn = document.getElementById('claimReward');
  if (rewardBtn) {
    rewardBtn.addEventListener('click', () => {
      let timeLeft = 24 * 60 * 60;
      const formatTime = (s) => {
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        return `${h}ч ${m}м`;
      };
      rewardBtn.disabled = true;
      rewardBtn.textContent = formatTime(timeLeft);
      const interval = setInterval(() => {
        timeLeft -= 60;
        if (timeLeft <= 0) {
          clearInterval(interval);
          rewardBtn.disabled = false;
          rewardBtn.textContent = 'получить 5f';
        } else {
          rewardBtn.textContent = formatTime(timeLeft);
        }
      }, 60000);
      // Тут можешь добавить начисление валюты
    });
  }

  // === Сделать домашнюю страницу всегда видимой при запуске ===
  pages.forEach(page => {
    if (page.id === 'home') {
      page.style.display = '';
      page.classList.add('active');
    } else {
      page.style.display = 'none';
      page.classList.remove('active');
    }
  });

  // === Раскрытие Telegram-блока ===
const telegramCard = document.querySelector('.social-link:not(.instagram):nth-of-type(1)');
const telegramArrow = telegramCard?.querySelector('.arrow-icon');

if (telegramCard && telegramArrow) {
  telegramCard.addEventListener('click', () => {
    telegramCard.classList.toggle('expanded');
    telegramArrow.classList.toggle('rotated');
    // тут можно вставить доп. поведение при раскрытии, если появится вложенный контент
  });
}

    // === Выбор карточки пополнения (зелёная рамка) ===
  const topupCards = document.querySelectorAll('.topup-card');
  let activeTopupCard = null;

  function clearTopupSelection() {
    if (activeTopupCard) {
      activeTopupCard.classList.remove('active');
      activeTopupCard = null;
    }
  }

  topupCards.forEach(card => {
    card.addEventListener('click', (e) => {
      e.stopPropagation();
      clearTopupSelection();
      card.classList.add('active');
      activeTopupCard = card;
    });
  });

  document.addEventListener('click', (e) => {
    if (![...topupCards].some(card => card.contains(e.target))) {
      clearTopupSelection();
    }
  });

  pages.forEach(page => {
    page.addEventListener('hide', clearTopupSelection);
  });

 // === SWIPE-АНИМАЦИЯ ДЛЯ КНОПКИ ПОПОЛНЕНИЯ ===
const slider = document.getElementById('slider-circle');
const button = document.getElementById('pay-button');
const text = document.getElementById('slider-text');
const icon = document.getElementById('confirm-icon');
const customAmountInput = document.getElementById('custom-amount');

let isDragging = false;
let startX = 0;
let offsetX = 0;
let maxDrag = 0;
let isLocked = false;

// === Получение суммы пополнения ===
function getSelectedAmount() {
  const selectedCard = document.querySelector('.topup-card.active');
  const manualValue = parseInt(customAmountInput.value);

  if (!selectedCard && (isNaN(manualValue) || manualValue <= 0)) {
    return null;
  }

  if (selectedCard && (!manualValue || manualValue <= 0)) {
    const price = selectedCard.querySelector('.topup-price')?.textContent?.replace('₽', '')?.trim();
    return parseInt(price);
  }

  if (manualValue > 0) {
    return manualValue;
  }

  return null;
}

// === Обновление суммы и количества флипов ===
function updateTotalInfo(price) {
  const flipsEl = document.getElementById('f-receive');
  const rublesEl = document.getElementById('f-pay');


  if (price && !isNaN(price)) {
    rublesEl.textContent = `${price}₽`;
    flipsEl.textContent = `${Math.floor(price / 2)}F`; // 🧠 Модифицируй под нужную формулу
  } else {
    rublesEl.textContent = '—';
    flipsEl.textContent = '—';
  }
}

// === Swipe: Start Drag ===
slider.addEventListener('mousedown', startDrag);
slider.addEventListener('touchstart', startDrag, { passive: false });

function startDrag(e) {
  if (isLocked) return;
  isDragging = true;
  e.preventDefault();

  startX = e.touches ? e.touches[0].clientX : e.clientX;

  const buttonRect = button.getBoundingClientRect();
  const sliderRect = slider.getBoundingClientRect();
  maxDrag = buttonRect.width - sliderRect.width - 6 - 6;

  document.addEventListener('mousemove', onDrag);
  document.addEventListener('touchmove', onDrag, { passive: false });
  document.addEventListener('mouseup', stopDrag);
  document.addEventListener('touchend', stopDrag);
}

function onDrag(e) {
  if (!isDragging || isLocked) return;

  const x = e.touches ? e.touches[0].clientX : e.clientX;
  offsetX = Math.min(Math.max(0, x - startX), maxDrag);

  slider.style.transform = `translateX(${offsetX}px)`;

  const progress = offsetX / maxDrag;
  const r = Math.round(217 + (158 - 217) * progress);
  const g = Math.round(217 + (255 - 217) * progress);
  const b = Math.round(217 + (68  - 217) * progress);
  slider.style.background = `rgb(${r}, ${g}, ${b})`;
}

function stopDrag() {
  if (!isDragging) return;
  isDragging = false;

  document.removeEventListener('mousemove', onDrag);
  document.removeEventListener('touchmove', onDrag);
  document.removeEventListener('mouseup', stopDrag);
  document.removeEventListener('touchend', stopDrag);

  if (offsetX >= maxDrag) {
    const selectedAmount = getSelectedAmount();
    if (!selectedAmount) {
      alert('Пожалуйста, выберите сумму или введите её вручную.');
      resetSwipe(true);
      return;
    }

    slider.style.transform = `translateX(${maxDrag}px)`;
    slider.style.background = '#9EFF44';
    icon.style.opacity = '0';
    text.textContent = 'ГОТОВО';
    text.style.color = '#9EFF44';
    isLocked = true;

  if (window.navigator.vibrate) {
    window.navigator.vibrate(100); // Вибрация при подтверждении
  }


    if (window.navigator.vibrate) window.navigator.vibrate(100);

    const yooUrl = `https://yoomoney.ru/quickpay/shop-widget?writer=seller&targets=Пополнение+баланса&default-sum=${selectedAmount}&button-text=11&payment-type-choice=on&account=41001XXXXXXXX&successURL=https://ваш-сайт.рф/спасибо`;

    window.location.href = yooUrl;

    setTimeout(() => resetSwipe(), 2000);
  } else {
    resetSwipe();
  }
}

// === Сброс свайпа (включая при ошибке) ===
function resetSwipe(error = false) {
  slider.style.transform = 'translateX(0)';
  slider.style.background = '#D9D9D9';
  text.textContent = 'ПОПОЛНИТЬ';
  text.style.color = 'gray';
  icon.style.opacity = '1';
  isLocked = false;

  if (error) {
    if (window.navigator.vibrate) {
      window.navigator.vibrate([30, 30]); // Вибрация при ошибке
    }

    // ⛔ Красная обводка на карточках и поле
    document.querySelectorAll('.topup-card').forEach(card => {
      card.style.border = '2px solid red';
    });
    customAmountInput.style.border = '2px solid red';

    // 🔄 Через 1.5 секунды сбросить обводку
    setTimeout(() => {
      document.querySelectorAll('.topup-card').forEach(card => {
        card.style.border = '';
      });
      customAmountInput.style.border = '';
    }, 700);
  }
}


// === СБРОС ВЫБОРА, ЕСЛИ КЛИКНУТЬ ВНЕ КАРТОЧКИ И ПОЛЯ ВВОДА ===
document.addEventListener('click', (e) => {
  const isCard = e.target.closest('.topup-card');
  const isInput = e.target.closest('#custom-amount');

  if (!isCard && !isInput) {
    // Удаляем активную карточку
    const activeCard = document.querySelector('.topup-card.active');
    if (activeCard) activeCard.classList.remove('active');

    // Сбрасываем счётчики
    const flipsEl = document.querySelector('.summary-flips') || document.getElementById('f-receive');
    const rublesEl = document.querySelector('.summary-rubles') || document.getElementById('f-pay');
    if (flipsEl) flipsEl.textContent = '0F';
    if (rublesEl) rublesEl.textContent = '0₽';
  }
});


// === Обработка кликов по карточкам и вне ===
document.addEventListener('click', (e) => {
  const clickedCard = e.target.closest('.topup-card');
  const activeCard = document.querySelector('.topup-card.active');

  if (clickedCard) {
    if (clickedCard === activeCard) {
      clickedCard.classList.remove('active');
      updateTotalInfo(null);
    } else {
      document.querySelectorAll('.topup-card').forEach(card => card.classList.remove('active'));
      clickedCard.classList.add('active');
      const price = clickedCard.querySelector('.topup-price')?.textContent?.replace('₽', '')?.trim();
      updateTotalInfo(parseInt(price));
    }
  } else if (activeCard && !e.target.closest('#custom-amount')) {
    activeCard.classList.remove('active');
    updateTotalInfo(null);
  }
});

// === Раскрытие сортировки по коллекции ===
const sortToggle = document.getElementById('sortToggle');
const sortMenu = document.getElementById('sortMenu');
const sortOptions = document.querySelectorAll('.sort-option');


// Открытие / закрытие меню
sortToggle.addEventListener('click', () => {
  sortMenu.style.display = (sortMenu.style.display === 'block') ? 'none' : 'block';
});

// Закрытие при клике вне меню
document.addEventListener('click', (e) => {
  if (!sortToggle.contains(e.target) && !sortMenu.contains(e.target)) {
    sortMenu.style.display = 'none';
  }
});

// Обработка выбора сортировки
sortOptions.forEach(option => {
  option.addEventListener('click', () => {
    // Убираем старую активность
    sortOptions.forEach(o => o.classList.remove('active'));
    option.classList.add('active');

    // Значение фильтра
    const selected = option.dataset.value;

    // Обновляем текст сортировки
    const sortText = option.textContent.toLowerCase();
    sortToggle.innerHTML = `Сначала ${sortText} <img src="/assets/icons/sort-arrow.svg" alt="↓" class="sort-icon" />`;

    // Скрываем меню
    sortMenu.style.display = 'none';

    // 🔥 Вместо фильтрации — просто перерисовываем
    renderCards(selected); // ← вот ключевая строка
  });
});


// === ОВЕРЛЕЙ: ПОДТВЕРЖДЕНИЕ УДАЛЕНИЯ ===
const deleteOverlay = document.getElementById('delete-confirm-overlay');
const deleteCancelBtn = document.getElementById('delete-cancel-btn');
const deleteConfirmBtn = document.getElementById('delete-confirm-btn');

// 1. Показывать оверлей при клике на .card-delete
document.addEventListener('click', function(e) {
  if (e.target && e.target.classList.contains('card-delete')) {
    deleteOverlay.classList.add('active');
  }
});

// 2. Скрывать оверлей по кнопке "Отмена"
if (deleteCancelBtn) {
  deleteCancelBtn.addEventListener('click', function() {
    deleteOverlay.classList.remove('active');
  });
}

// 3. Скрывать оверлей по кнопке "Удалить" (сюда вставишь свою логику удаления)
if (deleteConfirmBtn) {
  deleteConfirmBtn.addEventListener('click', function() {
    deleteOverlay.classList.remove('active');
    // TODO: логика удаления карточки, если нужно
  });
}

// 4. Клик вне окна — тоже закрывает
deleteOverlay.addEventListener('click', function(e) {
  if (e.target === deleteOverlay) {
    deleteOverlay.classList.remove('active');
  }
});

});
