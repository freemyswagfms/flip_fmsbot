document.addEventListener('DOMContentLoaded', () => {
  if (window.Telegram.WebApp) {
    Telegram.WebApp.ready();
    Telegram.WebApp.expand();
  }

  // --- Тема
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'light') {
    document.body.classList.add('light');
  }

  // --- DOM
  const splash = document.getElementById('splash');
  const mainApp = document.getElementById('main-app');
  const navMenu = document.querySelector('.nav-menu');
  const navBtns = Array.from(document.querySelectorAll('.nav-btn'));
  const navBg = document.querySelector('.nav-bg');
  const pages = document.querySelectorAll('.page');
  const fill = document.querySelector('.progress-bar-fill');
  const tabs = document.querySelectorAll('.tab');
  const user = window.Telegram.WebApp.initDataUnsafe?.user;

  splash.style.display = 'flex';
  mainApp.style.display = 'none';

  if (fill) {
    setTimeout(() => { fill.style.width = '100%'; }, 200);
  }

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

  function adjustTopPadding() {
    const isFullscreen = window.innerHeight === screen.height;
    mainApp.style.paddingTop = (isFullscreen ? 60 : 1) + 'px';
  }

  setTimeout(() => {
    splash.style.opacity = '0';
    setTimeout(() => {
      splash.style.display = 'none';
      mainApp.style.display = 'block';
      adjustTopPadding();
      moveBgToActive(activeIndex);
    }, 500);
  }, 1400);

  pages.forEach(page => {
    if (page.id === "home") {
      page.style.display = '';
      page.classList.add('active');
    } else {
      page.style.display = 'none';
      page.classList.remove('active');
    }
  });

  let activeIndex = navBtns.findIndex(btn => btn.classList.contains('active'));
  if (activeIndex === -1) activeIndex = 0;

  navBtns.forEach((btn, idx) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      navBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      requestAnimationFrame(() => setTimeout(() => moveBgToActive(idx), 10));

      const targetPage = btn.getAttribute('data-page');
      pages.forEach(page => {
        if (page.id === targetPage) {
          page.style.display = '';
          page.classList.add('active');
        } else {
          page.style.display = 'none';
          page.classList.remove('active');
        }
      });

      adjustTopPadding();
    });
  });

  // --- Фильтрация карточек по табам
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
        if (filterType === 'all' || filterType === undefined) {
          card.style.display = '';
        } else if (cat === filterType) {
          card.style.display = '';
        } else {
          card.style.display = 'none';
        }
      });
    });
  });

  // --- Профиль
  const nicknameEl = document.querySelector('.nickname');
  const balanceEl = document.querySelector('.balance-nick');
  const avatarEl = document.querySelector('.avatar');

  if (nicknameEl && balanceEl && avatarEl) {
    if (user) {
      nicknameEl.textContent = user.username || `id${user.id}`;
      balanceEl.textContent = 'баланс';
      if (user.username) {
        avatarEl.style.backgroundImage = `url('https://t.me/i/userpic/320/${user.username}.jpg')`;
      } else {
        avatarEl.style.backgroundColor = '#ccc';
      }
    } else {
      nicknameEl.textContent = 'гость';
      balanceEl.textContent = 'баланс';
      avatarEl.style.backgroundColor = '#ccc';
    }
  }

  // --- Инициализация Lottie-звезды в балансе
  const starBalance = document.getElementById('star-in-balance');
  if (starBalance && window.lottie) {
    lottie.loadAnimation({
      container: starBalance,
      renderer: 'svg',
      loop: true,
      autoplay: true,
      path: 'assets/icons/star.json'
    });
  }

  // --- Оверлеи: Настройки
  const settingItems = document.querySelectorAll('.setting-item');
  const balanceOverlay = document.getElementById('balance-overlay');
  const themeOverlay = document.getElementById('theme-overlay');

  if (settingItems.length) {
    settingItems.forEach((item) => {
      const text = item.textContent.trim();
      if (text.includes('Пополнение баланса') && balanceOverlay) {
        item.addEventListener('click', (e) => {
          e.preventDefault();
          balanceOverlay.classList.add('show');
          balanceOverlay.scrollTo(0, 0);
        });
      }
      if (text.includes('Внешний вид') && themeOverlay) {
        item.addEventListener('click', (e) => {
          e.preventDefault();
          themeOverlay.classList.add('show');
          themeOverlay.scrollTo(0, 0);
        });
      }
    });
  }

  [balanceOverlay, themeOverlay].forEach(overlay => {
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.classList.remove('show');
      });
    }
  });

  // --- Переключение темы
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

  // --- Таймер дропа
  function startDropTimer(hours, minutes) {
    const display = document.getElementById('drop-countdown');
    if (!display) return;
    let totalSeconds = hours * 3600 + minutes * 60;

    function updateTimer() {
      const h = Math.floor(totalSeconds / 3600);
      const m = Math.floor((totalSeconds % 3600) / 60);
      display.textContent = `${h}ч ${m}м`;
      if (totalSeconds > 0) totalSeconds--;
      else clearInterval(timer);
    }

    updateTimer();
    const timer = setInterval(updateTimer, 60000);
  }

  startDropTimer(3, 59);

  // --- Кнопка старта дропа
  const startBtn = document.querySelector('.start-btn');
  const subscribeOverlay = document.getElementById('subscribe-overlay');

  if (startBtn) {
    startBtn.addEventListener('click', (e) => {
      e.preventDefault();
      subscribeOverlay?.classList.add('show');
    });
  }

  if (subscribeOverlay) {
    subscribeOverlay.addEventListener('click', (e) => {
      if (e.target === subscribeOverlay) {
        subscribeOverlay.classList.remove('show');
      }
    });
  }

  // --- Магазин
  const shopBtn = document.getElementById('go-to-shop');
  if (shopBtn) {
    shopBtn.addEventListener('click', (e) => {
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
        const collectionTitle = document.getElementById('new-collection');
        collectionTitle?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);

      moveBgToActive(navBtns.findIndex(b => b.classList.contains('shop-icon')));
    });
  }

  // --- Задания
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
      channelName.textContent = task.name;
      goSubscribe.href = task.url;
      overlay.classList.add('show');
    });
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.remove('show');
  });

  // --- Анимация нажатия для profile-card
  document.querySelectorAll('.profile-card').forEach(card => {
    card.addEventListener('click', () => {
      card.classList.remove('animate-press');
      void card.offsetWidth; // перезапуск анимации
      card.classList.add('animate-press');
    });
  });
});