document.addEventListener('DOMContentLoaded', () => {
  if (window.Telegram.WebApp) {
    Telegram.WebApp.ready();         
    Telegram.WebApp.expand();        
  }

  // === Применение сохранённой темы ===
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'light') {
    document.body.classList.add('light');
  }

  const splash = document.getElementById('splash');
  const mainApp = document.getElementById('main-app');
  const navMenu = document.querySelector('.nav-menu');
  const navBtns = Array.from(document.querySelectorAll('.nav-btn'));
  const navBg = document.querySelector('.nav-bg');
  const pages = document.querySelectorAll('.page');
  const fill = document.querySelector('.progress-bar-fill');
  const tabs = document.querySelectorAll('.tab');

  splash.style.display = 'flex';
  mainApp.style.display = 'none';

  if (fill) {
    setTimeout(() => {
      fill.style.width = '100%';
    }, 200);
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
    const paddingTop = isFullscreen ? 60 : 1;
    mainApp.style.paddingTop = paddingTop + 'px';
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

      requestAnimationFrame(() => {
        setTimeout(() => moveBgToActive(idx), 10);
      });

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

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
    });
  });

  const user = window.Telegram.WebApp.initDataUnsafe?.user;
  const nicknameEl = document.querySelector('.nickname');
  const balanceEl = document.querySelector('.balance-nick');
  const avatarEl = document.querySelector('.avatar');

  if (nicknameEl && balanceEl && avatarEl) {
    if (user) {
      nicknameEl.textContent = user.username || `id${user.id}`;
      balanceEl.textContent = 'Баланс: 0 руб.';

      if (user.username) {
        avatarEl.style.backgroundImage = `url('https://t.me/i/userpic/320/${user.username}.jpg')`;
      } else {
        avatarEl.style.backgroundColor = '#ccc';
      }
    } else {
      nicknameEl.textContent = 'Гость';
      balanceEl.textContent = 'Баланс: 0 руб.';
      avatarEl.style.backgroundColor = '#ccc';
    }
  }

  // ========================
  // Работа с оверлеями
  // ========================
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
          console.log("Оверлей баланса открыт");
        });
      }

      if (text.includes('Внешний вид') && themeOverlay) {
        item.addEventListener('click', (e) => {
          e.preventDefault();
          themeOverlay.classList.add('show');
          themeOverlay.scrollTo(0, 0);
          console.log("Оверлей внешнего вида открыт");
        });
      }
    });
  }

  if (balanceOverlay) {
    balanceOverlay.addEventListener('click', (e) => {
      if (e.target === balanceOverlay) {
        balanceOverlay.classList.remove('show');
        console.log("Оверлей баланса закрыт");
      }
    });
  }

  if (themeOverlay) {
    themeOverlay.addEventListener('click', (e) => {
      if (e.target === themeOverlay) {
        themeOverlay.classList.remove('show');
        console.log("Оверлей внешнего вида закрыт");
      }
    });
  }

  // ========================
  // Переключение темы (с сохранением в localStorage)
  // ========================
  const themeBtn = document.querySelector('.theme-toggle-btn');

  if (themeBtn) {
    // Установить текст кнопки при загрузке
    themeBtn.textContent = document.body.classList.contains('light') ? 'ВЫКЛЮЧИТЬ' : 'ВКЛЮЧИТЬ';

    themeBtn.addEventListener('click', () => {
      document.body.classList.toggle('light');

      if (document.body.classList.contains('light')) {
        themeBtn.textContent = 'ВЫКЛЮЧИТЬ';
        localStorage.setItem('theme', 'light');
      } else {
        themeBtn.textContent = 'ВКЛЮЧИТЬ';
        localStorage.setItem('theme', 'dark');
      }
    });
  }
});
