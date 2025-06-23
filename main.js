window.addEventListener('DOMContentLoaded', () => {
  // Splash-анимация
  const fill = document.querySelector('.progress-bar-fill');
  if (fill) {
    setTimeout(() => {
      fill.style.width = '100%';
    }, 200);

    setTimeout(() => {
      document.getElementById('splash').style.opacity = '0';
      setTimeout(() => {
        document.getElementById('splash').style.display = 'none';
        document.getElementById('main-app').style.display = '';
      }, 500);
    }, 1400);
  }
});

window.addEventListener('DOMContentLoaded', () => {
  if (window.Telegram && Telegram.WebApp && typeof Telegram.WebApp.requestFullscreen === 'function') {
    Telegram.WebApp.requestFullscreen();
  }
});
if (window.Telegram && Telegram.WebApp && typeof Telegram.WebApp.exitFullscreen === 'function') {
  Telegram.WebApp.exitFullscreen();
}
document.addEventListener('DOMContentLoaded', () => {
  const navMenu = document.querySelector('.nav-menu');
  const navBtns = Array.from(document.querySelectorAll('.nav-btn'));
  const navBg = document.querySelector('.nav-bg');

  function moveBgToActive(index) {
    const btn = navBtns[index];
    const menuRect = navMenu.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    const offsetLeft = btnRect.left - menuRect.left;
    navBg.style.left = offsetLeft + "px";
  }

  let activeIndex = navBtns.findIndex(btn => btn.classList.contains('active'));
  if (activeIndex === -1) activeIndex = 0;
  moveBgToActive(activeIndex);

  navBtns.forEach((btn, idx) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      navBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      moveBgToActive(idx);
    });
  });
});
