// flip_app_main.js

document.addEventListener('DOMContentLoaded', () => {
  // === Telegram WebApp Init ===
  if (window.Telegram && window.Telegram.WebApp) {
    Telegram.WebApp.ready();
    Telegram.WebApp.expand();
  }

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

  // === Переходы по профилю: достижения, статистика, лидеры, мой счёт, квесты ===
  setupPageNavigation('achievements', 'achievements-page');
  setupPageNavigation('stat', 'stat-page');
  setupPageNavigation('leaderboard', 'leaderboard-page');
  setupPageNavigation('quests', 'quests-page');
  setupPageNavigation('level', 'balance-page', true);

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
  const balanceEl = document.querySelector('.balance-nick');
  const avatarEl = document.querySelector('.avatar');
  if (nicknameEl && balanceEl && avatarEl) {
    if (user) {
      nicknameEl.textContent = user.username || `id${user.id}`;
      balanceEl.textContent = 'баланс';
      if (user.username) avatarEl.style.backgroundImage = `url('https://t.me/i/userpic/320/${user.username}.jpg')`;
      else avatarEl.style.backgroundColor = '#ccc';
    } else {
      nicknameEl.textContent = 'гость';
      balanceEl.textContent = 'баланс';
      avatarEl.style.backgroundColor = '#ccc';
    }
  }

  // === Фильтрация коллекции по табам ===
  const tabMap = {
    'все': 'all',
    'альбомы': 'album',
    'синглы': 'single',
    'артисты': 'artist'
  };
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const selected = tab.textContent.trim().toLowerCase();
      const filterType = tabMap[selected];
      document.querySelectorAll('.card-placeholder').forEach(card => {
        const cat = card.dataset.category;
        if (filterType === 'all' || filterType === undefined) card.style.display = '';
        else card.style.display = cat === filterType ? '' : 'none';
      });
    });
  });

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
        document.querySelectorAll('.card-placeholder').forEach(card => card.style.display = '');
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
        document.querySelectorAll('.card-placeholder').forEach(card => card.style.display = '');
      }
    });
    searchInput.addEventListener('input', () => {
      const query = searchInput.value.trim().toLowerCase();
      document.querySelectorAll('.card-placeholder').forEach(card => {
        const text = card.textContent.toLowerCase();
        card.style.display = text.includes(query) ? '' : 'none';
      });
    });
  }

  // === Кнопки настроек: пополнение и тема ===
  const settingItems = document.querySelectorAll('.setting-item');
  const balanceOverlay = document.getElementById('balance-overlay');
  const themeOverlay = document.getElementById('theme-overlay');
  if (settingItems.length) {
    settingItems.forEach(item => {
      const text = item.innerText.toLowerCase();
      if (text.includes('пополнение') && balanceOverlay) {
        item.addEventListener('click', e => {
          e.preventDefault();
          balanceOverlay.classList.add('show');
        });
      }
      if (text.includes('внешний вид') && themeOverlay) {
        item.addEventListener('click', e => {
          e.preventDefault();
          themeOverlay.classList.add('show');
        });
      }
    });
  }
  [balanceOverlay, themeOverlay].forEach(overlay => {
    if (overlay) overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.classList.remove('show');
    });
  });

  // === Переключение темы ===
  const themeBtn = document.querySelector('.theme-toggle-btn');
  if (themeBtn) {
    themeBtn.textContent = document.body.classList.contains('light') ? 'ВЫКЛЮЧИТЬ' : 'ВКЛЮЧИТЬ';
    themeBtn.addEventListener('click', () => {
      document.body.classList.toggle('light');
      const isLight = document.body.classList.contains('light');
      themeBtn.textContent = isLight ? 'ВЫКЛЮЧИТЬ' : 'ВКЛЮЧИТЬ';
      localStorage.setItem('theme', isLight ? 'light' : 'dark');
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
});
