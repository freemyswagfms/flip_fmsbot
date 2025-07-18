// flip_app_main.js

document.addEventListener('DOMContentLoaded', () => {
  // === Telegram WebApp Init ===
  if (window.Telegram.WebApp) {
    Telegram.WebApp.ready();
    Telegram.WebApp.expand();
  }

  // === Тема (светлая/тёмная) ===
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'light') {
    document.body.classList.add('light');
  }

  // === DOM Элементы ===
  const splash = document.getElementById('splash');
  // === Страница достижений ===
  const achievementsBtn = document.getElementById('achievements');
  const achievementsPage = document.getElementById('achievements-page');
  const backBtn = achievementsPage?.querySelector('.back-btn');
  const mainApp = document.getElementById('main-app');
  const navMenu = document.querySelector('.nav-menu');
  const navBtns = Array.from(document.querySelectorAll('.nav-btn'));
  const navBg = document.querySelector('.nav-bg');
  const pages = document.querySelectorAll('.page');
  const fill = document.querySelector('.progress-bar-fill');
  const tabs = document.querySelectorAll('.tab');
  const user = window.Telegram.WebApp.initDataUnsafe?.user;

  // === Переход на страницу "Мой счёт" по кнопке уровня ===
    // === Анимация потягивания плашки уровня ===
  const statusBar = document.getElementById('statusBar');
  let startY = 0;
  let currentY = 0;
  let dragging = false;

  if (statusBar) {
    statusBar.addEventListener('touchstart', (e) => {
      startY = e.touches[0].clientY;
      dragging = true;
    });

    statusBar.addEventListener('touchmove', (e) => {
      if (!dragging) return;
      currentY = e.touches[0].clientY;
      const diff = startY - currentY;

      const maxLift = 60;
      const translateY = Math.max(Math.min(diff, maxLift), 0);

      statusBar.style.transform = `translateY(-${translateY}px)`;
    });

    statusBar.addEventListener('touchend', () => {
      dragging = false;
      statusBar.style.transform = `translateY(0)`;
    });
  }

const levelBtn = document.getElementById('level');
const balancePage = document.getElementById('balance-page');

if (levelBtn && balancePage) {
  levelBtn.addEventListener('click', () => {
    pages.forEach(p => {
      p.style.display = 'none';
      p.classList.remove('active');
    });
    navMenu.style.display = 'none';
    balancePage.style.display = 'block';
    balancePage.classList.add('active');
  });

  const balanceBackBtn = balancePage.querySelector('.back-btn');
  if (balanceBackBtn) {
    balanceBackBtn.addEventListener('click', () => {
      balancePage.style.display = 'none';
      balancePage.classList.remove('active');

      const profilePage = document.getElementById('profile');
      profilePage.style.display = '';
      profilePage.classList.add('active');

      navMenu.style.display = '';
      const profileIdx = navBtns.findIndex(b => b.classList.contains('profile-icon'));
      moveBgToActive(profileIdx);
    });
  }
}


  // === Достижения: кнопка "забрать" ===
document.querySelectorAll('.achievement-card[data-status="ready-to-claim"] .claim').forEach(button => {
  button.addEventListener('click', (e) => {
    const card = e.target.closest('.achievement-card');
    if (!card) return;

    // Меняем статус
    card.setAttribute('data-status', 'completed');

    // Заменяем кнопку
    const btn = document.createElement('div');
    btn.className = 'achievement-btn collected';
    btn.textContent = 'выполнено';
    button.replaceWith(btn);

    // Добавляем чекмарку
    if (!card.querySelector('.status-icon')) {
      const icon = document.createElement('div');
      icon.className = 'status-icon checkmark';
      card.appendChild(icon);
    }
  });
});

  // === Анимация загрузки ===
  splash.style.display = 'flex';
  mainApp.style.display = 'none';
  if (fill) setTimeout(() => { fill.style.width = '100%'; }, 200);

  // === Анимация заднего фона под активной иконкой ===
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

  // === Коррекция отступа сверху (для fullscreen) ===
  function adjustTopPadding() {
    const isFullscreen = window.innerHeight === screen.height;
    mainApp.style.paddingTop = (isFullscreen ? 60 : 1) + 'px';
  }

  // === Переход от splash к main ===
  setTimeout(() => {
    splash.style.opacity = '0';
    setTimeout(() => {
      splash.style.display = 'none';
      mainApp.style.display = 'block';
      adjustTopPadding();
      moveBgToActive(activeIndex);
    }, 500);
  }, 1400);

  if (achievementsBtn && achievementsPage && backBtn) {
  achievementsBtn.addEventListener('click', () => {


    // Скрываем все обычные страницы
    pages.forEach(p => {
      p.style.display = 'none';
      p.classList.remove('active');
    });

    // Скрываем нижнее меню
    navMenu.style.display = 'none';

    // Показываем страницу достижений
        achievementsPage.style.display = 'block';
    achievementsPage.classList.add('active');

    animateAchievementProgress();

  });


  backBtn.addEventListener('click', () => {
    // Скрываем страницу достижений
    achievementsPage.style.display = 'none';
    achievementsPage.classList.remove('active');

    // Возвращаем профиль
    const profilePage = document.getElementById('profile');
    if (profilePage) {
      profilePage.style.display = '';
      profilePage.classList.add('active');
    }

    // Показываем нижнее меню обратно
    navMenu.style.display = '';

    // Перемещаем фоновый кружок под иконку профиля
    const profileIdx = navBtns.findIndex(b => b.classList.contains('profile-icon'));
    moveBgToActive(profileIdx);
  });
}

  // === Навигация между страницами ===
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
          if (targetPage === 'profile') animateLevelPercent();
        } else {
          page.style.display = 'none';
          page.classList.remove('active');
        }
      });
      adjustTopPadding();
    });
  });

  // === Фильтрация карточек по табам ===
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

  // === FAB-поисковик с разворачиванием ===
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

  // === Отображение профиля ===
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

  // === Анимация процентов уровня ===
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
        if (current < finalValue) {
          requestAnimationFrame(step);
        }
      };
      percentEl.textContent = `0%`;
      requestAnimationFrame(step);
    }
  }

  // === Оверлеи: настройки и внешний вид ===
  const settingItems = document.querySelectorAll('.setting-item');
  const balanceOverlay = document.getElementById('balance-overlay');
  const themeOverlay = document.getElementById('theme-overlay');

  if (settingItems.length) {
    settingItems.forEach((item) => {
      const text = item.innerHTML.replace(/<br\s*\/?>(\s*)?/gi, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
      if (text.includes('пополнение баланса') && balanceOverlay) {
        item.addEventListener('click', (e) => {
          e.preventDefault();
          balanceOverlay.classList.add('show');
          balanceOverlay.scrollTo(0, 0);
        });
      }
      if (text.includes('внешний вид') && themeOverlay) {
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

  // === Оверлей подписки по кнопке старта ===
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

  // === Переход в магазин и скролл к новой коллекции ===
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

  // === Оверлей заданий ===
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
});

function animateAchievementProgress() {
  const cards = document.querySelectorAll('.achievement-card.in-progress');

  cards.forEach(card => {
    const valueText = card.querySelector('.progress-text')?.textContent.trim();
    if (!valueText) return;

    const [current, total] = valueText.split('/').map(Number);
    if (isNaN(current) || isNaN(total) || total === 0) return;

    const progress = current / total;
    const circle = card.querySelector('.ring-blue');
    if (!circle) return;

    const radius = parseFloat(circle.getAttribute('r'));
    const circumference = 2 * Math.PI * radius;

    // Устанавливаем полную длину круга
    circle.style.strokeDasharray = `${circumference}`;
    circle.style.strokeDashoffset = `${circumference}`;

    // Триггерим анимацию
    setTimeout(() => {
      circle.style.strokeDashoffset = `${circumference * (1 - progress)}`;
    }, 100);
  });
}

