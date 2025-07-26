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

let isDragging = false;
let startX = 0;
let offsetX = 0;
let maxDrag = 0;
let isLocked = false; // 🔒 Добавлено: блокировка после свайпа

function getSelectedAmount() {
  const selectedCard = document.querySelector('.topup-card.active');
  const manualValue = parseInt(customAmountInput.value);

  if (!selectedCard && (isNaN(manualValue) || manualValue <= 0)) {
    return null;
  }

  if (selectedCard && (!manualValue || manualValue <= 0)) {
    // Выбрана карточка, но не введено вручную — берём её цену
    const price = selectedCard.querySelector('.topup-price')?.textContent?.replace('₽', '')?.trim();
    return parseInt(price);
  }

  if (manualValue > 0) {
    // Введена ручная сумма — она в приоритете
    return manualValue;
  }

  return null;
}


slider.addEventListener('mousedown', startDrag);
slider.addEventListener('touchstart', startDrag, { passive: false }); // ❗ отключаем scroll

function startDrag(e) {
  if (isLocked) return; // 🔒 блокируем повторный свайп

  isDragging = true;
  e.preventDefault(); // ⛔ отключаем скролл страницы

  startX = e.touches ? e.touches[0].clientX : e.clientX;

  const buttonRect = button.getBoundingClientRect();
  const sliderRect = slider.getBoundingClientRect();
  const iconRect = icon.getBoundingClientRect();

  maxDrag = buttonRect.width - sliderRect.width - 6 /* слева */ - 6 /* справа */;

  document.addEventListener('mousemove', onDrag);
  document.addEventListener('touchmove', onDrag, { passive: false }); // ❗ отключаем scroll
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

  if (offsetX >= maxDrag) {
  const selectedAmount = getSelectedAmount();
  if (!selectedAmount) {
    // ⛔ Ошибка — сразу сброс, без "ГОТОВО"
    alert('Пожалуйста, выберите сумму или введите её вручную.');
    resetSwipe(true); // передаём флаг ошибки
    return;
  }

  // ✅ Успешный свайп
  slider.style.transform = `translateX(${maxDrag}px)`;
  slider.style.background = '#9EFF44';
  icon.style.opacity = '0';
  text.textContent = 'ГОТОВО';
  text.style.color = '#9EFF44';
  isLocked = true;
  if (window.navigator.vibrate) window.navigator.vibrate(100);

  const yooUrl = `https://yoomoney.ru/quickpay/shop-widget?writer=seller&targets=Пополнение+баланса&default-sum=${selectedAmount}&button-text=11&payment-type-choice=on&account=ВАШ_YOOMONEY_ID&successURL=https://ваш-сайт.рф/спасибо`;
  window.open(yooUrl, '_blank');

  setTimeout(() => resetSwipe(), 2000);

} else {
  resetSwipe();
}

  document.removeEventListener('mousemove', onDrag);
  document.removeEventListener('touchmove', onDrag);
  document.removeEventListener('mouseup', stopDrag);
  document.removeEventListener('touchend', stopDrag);
}

function resetSwipe(error = false) {
  slider.style.transform = 'translateX(0)';
  slider.style.background = '#D9D9D9';
  text.textContent = 'ПОПОЛНИТЬ';
  text.style.color = 'gray';
  icon.style.opacity = '1';
  isLocked = false;

  if (error && window.navigator.vibrate) {
    window.navigator.vibrate([30, 30]); // короткая вибрация на ошибку
  }
}


  
});
