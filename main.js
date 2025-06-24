document.addEventListener('DOMContentLoaded', () => {
  const splash = document.getElementById('splash');
  const mainApp = document.getElementById('main-app');
  const navMenu = document.querySelector('.nav-menu');
  const navBtns = Array.from(document.querySelectorAll('.nav-btn'));
  const navBg = document.querySelector('.nav-bg');
  const pages = document.querySelectorAll('.page');
  const fill = document.querySelector('.progress-bar-fill');
  const tabs = document.querySelectorAll('.tab');

  // Загрузка
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
    const paddingTop = isFullscreen ? 70 : 5;
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

      const appHeight = Math.max(window.innerHeight, mainApp.scrollHeight);
      mainApp.style.minHeight = appHeight + 'px';
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

  // 👇 ДОБАВЛЕННЫЙ БЛОК: обработка оверлея пополнения баланса
  const balanceSetting = document.querySelector('.setting-item'); // первая кнопка "Пополнение баланса"
  const balanceOverlay = document.getElementById('balance-overlay');

  if (balanceSetting && balanceOverlay) {
    balanceSetting.addEventListener('click', (e) => {
      e.preventDefault();
      balanceOverlay.style.display = 'flex';
    });

    // Клик по фону — закрывает
    balanceOverlay.addEventListener('click', (e) => {
      if (e.target === balanceOverlay) {
        balanceOverlay.style.display = 'none';
      }
    });
  }
});
