// main.js

document.addEventListener('DOMContentLoaded', () => {
  const splash = document.getElementById('splash');
  const mainApp = document.getElementById('main-app');
  const navMenu = document.querySelector('.nav-menu');
  const navBtns = Array.from(document.querySelectorAll('.nav-btn'));
  const navBg = document.querySelector('.nav-bg');
  const pages = document.querySelectorAll('.page');
  const fill = document.querySelector('.progress-bar-fill');

  // Показываем splash сначала
  splash.style.display = 'flex';
  mainApp.style.display = 'none';

  // Анимация загрузочной полосы
  if (fill) {
    setTimeout(() => {
      fill.style.width = '100%';
    }, 200);
  }

  // Центровка кружка под активной кнопкой
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

  // Splash-анимация и запуск приложения
  setTimeout(() => {
    splash.style.opacity = '0';
    setTimeout(() => {
      splash.style.display = 'none';
      mainApp.style.display = 'block';

      // Пересчёт отступа и кружка после отображения
      adjustTopPadding();
      moveBgToActive(activeIndex);
    }, 500);
  }, 1400);

  // Устанавливаем отступ сверху в зависимости от полноэкранного режима
  function adjustTopPadding() {
    const isFullscreen = window.innerHeight === screen.height;
    const paddingTop = isFullscreen ? 70 : 5;
    mainApp.style.paddingTop = paddingTop + 'px';
  }

  // Показываем только home при загрузке
  pages.forEach(page => {
    if (page.id === "home") {
      page.style.display = '';
      page.classList.add('active');
    } else {
      page.style.display = 'none';
      page.classList.remove('active');
    }
  });

  // Инициализация позиции кружка
  let activeIndex = navBtns.findIndex(btn => btn.classList.contains('active'));
  if (activeIndex === -1) activeIndex = 0;

  // Переключение страниц и позиция кружка
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
});