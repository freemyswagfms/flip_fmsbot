// main.js

document.addEventListener('DOMContentLoaded', () => {
  const splash = document.getElementById('splash');
  const mainApp = document.getElementById('main-app');
  const navMenu = document.querySelector('.nav-menu');
  const navBtns = Array.from(document.querySelectorAll('.nav-btn'));
  const navBg = document.querySelector('.nav-bg');
  const pages = document.querySelectorAll('.page');

  // Splash отключён — показываем app
  splash.style.display = 'none';
  mainApp.style.display = 'block';

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

  // Инициализация позиции кружка
  let activeIndex = navBtns.findIndex(btn => btn.classList.contains('active'));
  if (activeIndex === -1) activeIndex = 0;
  moveBgToActive(activeIndex);

  // Переключение страниц и позиция кружка
  navBtns.forEach((btn, idx) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();

      navBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Принудительно стабилизируем layout перед перемещением кружка
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
    });
  });
});
