/**
 * Plugin: Music Box (Музыкальная шкатулка)
 * @name Музыкальная шкатулка
 * @description Плавающий плеер для управления системной музыкой
 * @author Ethernet
 * @version 1.5.0
 * @icon <svg width="100%" height="100%" viewBox="0 0 200 200" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" style="fill-rule:evenodd;clip-rule:evenodd;stroke-linejoin:round;stroke-miterlimit:2;"><defs><linearGradient id="musicbox-plug-grad" x1="0" y1="0" x2="1" y2="0" gradientUnits="userSpaceOnUse" gradientTransform="matrix(200,0,0,200,0,100)"><stop offset="0" style="stop-color:rgb(213,255,0);stop-opacity:1"/><stop offset="1" style="stop-color:rgb(170,204,0);stop-opacity:1"/></linearGradient></defs><g transform="matrix(0,1,-1,0,200,0)"><path d="M200,61.765L200,138.235C200,172.324 172.324,200 138.235,200L61.765,200C27.676,200 0,172.324 0,138.235L0,61.765C0,27.676 27.676,0 61.765,0L138.235,0C172.324,0 200,27.676 200,61.765Z" fill="url(#musicbox-plug-grad)"/></g><g transform="matrix(1.73022,0,0,1.73022,100,100)"><g transform="matrix(1,0,0,1,-50,-50)"><g transform="matrix(4.166667,0,0,4.166667,0,0)"><path d="M21.719,6.279L21.719,7.449C21.719,8.429 21.329,9.269 20.639,9.759C20.209,10.079 19.679,10.229 19.129,10.229C18.789,10.229 18.449,10.179 18.099,10.059L12.719,8.269L12.719,17.999C12.719,20.619 10.589,22.749 7.969,22.749C5.349,22.749 3.219,20.619 3.219,17.999C3.219,15.379 5.349,13.249 7.969,13.249C9.229,13.249 10.369,13.749 11.219,14.549L11.219,3.999C11.219,3.029 11.619,2.189 12.309,1.689C12.999,1.199 13.919,1.089 14.839,1.389L19.259,2.869C20.619,3.319 21.719,4.849 21.719,6.279" fill="#ffffff" fill-rule="nonzero"/></g></g></g></svg>
 * @permissions dom.style, telegram.store, storage.local, desktop.ipc
 */

(function () {
  'use strict';

  const PLUGIN_ID = 'music-box';
  const ROOT_ID = 'ethernet-music-box-root';
  const STYLE_ID = 'ethernet-music-box-styles';
  const STORAGE_POS_KEY = '_eth_music_box_pos_v2';
  const STORAGE_COLLAPSED_KEY = '_eth_music_box_collapsed_v2';

  const CARD_W = 300;
  const CARD_H = 164;
  const PILL_W = 200;
  const PILL_H = 38;
  const PAD = 8;

  const CSS = `
    #${ROOT_ID} {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 99995;
      user-select: none;
      -webkit-user-select: none;
      font-family: var(--font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif);
      touch-action: none;
      color: var(--color-text, #ffffff);
      background: var(--color-background-secondary, var(--color-background, #212121));
      box-shadow: var(--shadow-pane, 0 8px 24px rgba(0, 0, 0, 0.35));
      backdrop-filter: blur(var(--blur-strength, 16px));
      -webkit-backdrop-filter: blur(var(--blur-strength, 16px));
      box-sizing: border-box;
      overflow: hidden;
      transform-origin: bottom right;
      transition: left 0.3s cubic-bezier(0.2, 0, 0, 1),
                  right 0.3s cubic-bezier(0.2, 0, 0, 1),
                  top 0.3s cubic-bezier(0.2, 0, 0, 1),
                  width 0.3s cubic-bezier(0.2, 0, 0, 1),
                  height 0.3s cubic-bezier(0.2, 0, 0, 1),
                  border-radius 0.3s ease,
                  padding 0.3s ease;
    }

    #${ROOT_ID}.is-dragging {
      transition: none !important;
      transform: none !important;
      cursor: grabbing !important;
    }
    #${ROOT_ID}.is-dragging * {
      cursor: grabbing !important;
      pointer-events: none !important;
    }

    /* Развернутое состояние */
    #${ROOT_ID}.is-expanded {
      width: ${CARD_W}px;
      height: ${CARD_H}px;
      border-radius: var(--border-radius-ui, 14px);
      padding: 10px 14px 12px;
      transform: none !important;
    }

    /* Свернутое состояние (пилюля) */
    #${ROOT_ID}.is-collapsed {
      width: ${PILL_W}px;
      height: ${PILL_H}px;
      border-radius: 19px;
      padding: 0 10px 0 6px;
      cursor: grab;
      transform: none !important;
    }
    #${ROOT_ID}.is-collapsed:hover {
      width: 310px;
      padding: 0 6px 0 6px;
    }
    #${ROOT_ID}.is-collapsed:active {
      cursor: grabbing;
    }

    /* Виды карточки и пилюли */
    .music-box-card-content {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      box-sizing: border-box;
      opacity: 1;
      transition: opacity 0.2s ease 0.05s;
      position: relative;
      cursor: grab;
    }
    .music-box-card-content:active {
      cursor: grabbing;
    }

    .music-box-pill-content {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      gap: 8px;
      box-sizing: border-box;
      opacity: 1;
      transition: opacity 0.2s ease 0.05s;
    }

    #${ROOT_ID}.is-collapsed .music-box-card-content {
      display: none !important;
      opacity: 0;
      pointer-events: none;
    }

    #${ROOT_ID}.is-expanded .music-box-pill-content {
      display: none !important;
      opacity: 0;
      pointer-events: none;
    }

    /* Ряд информации о треке */
    .music-box-track-row {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;
      position: relative;
      width: 100%;
    }

    .music-box-cover {
      width: 44px;
      height: 44px;
      border-radius: var(--border-radius-messages-small, 8px);
      background: var(--color-chat-hover, rgba(255, 255, 255, 0.08));
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      color: var(--color-primary, #ff8c80);
      overflow: hidden;
      position: relative;
    }
    .music-box-cover-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: inherit;
      display: block;
    }

    .music-box-track-text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding-right: 56px;
    }
    .music-box-track-title {
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--color-text, #ffffff);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      line-height: 1.25;
    }
    .music-box-track-artist {
      font-size: 0.75rem;
      color: var(--color-text-secondary, #9da7b7);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      line-height: 1.25;
    }

    /* Кнопки управления окном (свернуть, закрыть) в правом верхнем углу с градиентом */
    .music-box-header-btns {
      position: absolute;
      top: -2px;
      right: -2px;
      display: flex;
      align-items: center;
      gap: 2px;
      flex-shrink: 0;
      z-index: 5;
      padding-left: 28px;
      padding-right: 0px;
      padding-top: 2px;
      padding-bottom: 4px;
      background: linear-gradient(to right, transparent 0%, var(--color-background-secondary, var(--color-background, #212121)) 40%);
      pointer-events: auto;
    }

    .music-box-tool-btn {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      border: none;
      background: transparent;
      color: var(--color-text-secondary, #9da7b7);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      transition: background-color 0.15s ease, color 0.15s ease;
    }
    .music-box-tool-btn:hover {
      background: var(--color-chat-hover, rgba(255, 255, 255, 0.08));
      color: var(--color-text, #ffffff);
    }

    /* Таймлайн */
    .music-box-timeline {
      display: flex;
      flex-direction: column;
      gap: 3px;
      flex-shrink: 0;
    }

    .music-box-slider-wrap {
      position: relative;
      height: 14px;
      display: flex;
      align-items: center;
      cursor: pointer;
      touch-action: none;
    }
    .music-box-slider-track {
      width: 100%;
      height: 4px;
      border-radius: 2px;
      background: var(--color-borders, rgba(255, 255, 255, 0.14));
      position: relative;
      overflow: visible;
    }
    .music-box-slider-fill {
      height: 100%;
      border-radius: 2px;
      background: var(--color-primary, #ff8c80);
      width: 0%;
      position: relative;
      pointer-events: none;
    }
    .music-box-slider-thumb {
      position: absolute;
      right: -5px;
      top: -3px;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--color-primary, #ff8c80);
      transform: scale(0);
      transition: transform 0.15s ease;
      pointer-events: none;
    }
    .music-box-slider-wrap:hover .music-box-slider-thumb,
    .music-box-slider-wrap.dragging .music-box-slider-thumb {
      transform: scale(1);
    }

    .music-box-time-row {
      display: flex;
      justify-content: space-between;
      font-size: 0.6875rem;
      font-variant-numeric: tabular-nums;
      color: var(--color-text-secondary, #9da7b7);
    }

    /* Кнопки управления развернутого плеера */
    .music-box-controls {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 16px;
      padding-top: 2px;
      flex-shrink: 0;
    }

    .music-box-ctrl-btn {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      border: none;
      background: transparent;
      color: var(--color-icon-buttons, var(--color-text-secondary, #9da7b7));
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background-color 0.15s ease, color 0.15s ease, transform 0.1s ease;
      padding: 0;
    }
    .music-box-ctrl-btn:hover {
      background: var(--color-chat-hover, rgba(255, 255, 255, 0.08));
      color: var(--color-text, #ffffff);
    }
    .music-box-ctrl-btn:active {
      transform: scale(0.92);
    }

    .music-box-main-btn {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      border: none;
      background: var(--color-primary, #ff8c80);
      color: var(--color-white, #ffffff);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
      transition: background-color 0.15s ease, transform 0.1s ease;
      padding: 0;
    }
    .music-box-main-btn:hover {
      background: var(--color-primary-shade, var(--color-active, var(--color-primary, #ff8c80)));
    }
    .music-box-main-btn:active {
      transform: scale(0.94);
    }

    /* Пилюля: превью и кнопка раскрытия */
    .music-box-pill-thumb-box {
      position: relative;
      width: 26px;
      height: 26px;
      border-radius: 50%;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .music-box-pill-icon {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      background: var(--color-chat-hover, rgba(255, 255, 255, 0.08));
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-primary, #ff8c80);
      overflow: hidden;
      transition: opacity 0.18s ease, transform 0.18s ease;
    }
    .music-box-pill-cover-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: 50%;
      display: block;
    }

    .music-box-pill-expand-btn {
      position: absolute;
      inset: 0;
      width: 26px;
      height: 26px;
      border-radius: 50%;
      border: none;
      background: var(--color-primary, #ff8c80);
      color: #ffffff;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      pointer-events: none;
      transform: scale(0.7);
      transition: opacity 0.18s ease, transform 0.18s ease, background-color 0.15s ease;
      padding: 0;
    }
    .music-box-pill-expand-btn:hover {
      background: var(--color-primary-shade, var(--color-active, #ff7466));
      transform: scale(1.05);
    }

    /* При наведении: скрываем иконку/превью и показываем кнопку развертывания */
    #${ROOT_ID}.is-collapsed:hover .music-box-pill-icon {
      opacity: 0;
      pointer-events: none;
      transform: scale(0.7);
    }
    #${ROOT_ID}.is-collapsed:hover .music-box-pill-expand-btn {
      opacity: 1;
      pointer-events: auto;
      transform: scale(1);
    }

    .music-box-pill-title {
      font-size: 0.8125rem;
      font-weight: 500;
      color: var(--color-text, #ffffff);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 1;
      min-width: 0;
      line-height: 1.2;
    }

    /* Кнопки навигации в свернутом режиме (появляются ТОЛЬКО при наведении) */
    .music-box-pill-nav {
      display: flex;
      align-items: center;
      gap: 2px;
      flex-shrink: 0;
      opacity: 0;
      max-width: 0;
      overflow: hidden;
      pointer-events: none;
      transition: opacity 0.2s ease, max-width 0.28s cubic-bezier(0.2, 0, 0.2, 1);
    }
    #${ROOT_ID}.is-collapsed:hover .music-box-pill-nav {
      opacity: 1;
      max-width: 90px;
      pointer-events: auto;
    }

    .music-box-pill-btn {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      border: none;
      background: transparent;
      color: var(--color-text-secondary, #9da7b7);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      flex-shrink: 0;
      transition: background-color 0.15s ease, color 0.15s ease, transform 0.1s ease;
    }
    .music-box-pill-btn:hover {
      background: var(--color-chat-hover, rgba(255, 255, 255, 0.08));
      color: var(--color-text, #ffffff);
    }
    .music-box-pill-btn:active {
      transform: scale(0.9);
    }
    .music-box-pill-play {
      color: var(--color-primary, #ff8c80);
    }
    .music-box-pill-play:hover {
      color: var(--color-primary, #ff8c80);
      background: var(--color-chat-hover, rgba(255, 255, 255, 0.08));
    }
  `;

  let pollInterval = null;
  let tickInterval = null;
  let isCollapsed = false;
  let lastStateReceivedTime = Date.now();
  let isDraggingSlider = false;
  let scrubPosition = 0;

  let currentState = {
    active: false,
    title: '',
    artist: '',
    app: '',
    status: 'Closed',
    position: 0,
    duration: 0,
    thumbnail: '',
  };

  function getDesktopApi() {
    if (typeof ethernet !== 'undefined' && ethernet && ethernet.media) {
      return {
        mediaGetSystemState: () => ethernet.media.getSystemState(),
        mediaControlSystem: (action, value) => ethernet.media.controlSystem(action, value),
      };
    }
    return window.ethernetDesktop || window.hermesDesktop || null;
  }

  function formatTime(secs) {
    if (!secs || isNaN(secs) || secs < 0) return '0:00';
    const total = Math.floor(secs);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  function getCalculatedPosition() {
    if (isDraggingSlider) return scrubPosition;
    const dur = currentState.duration || 0;
    let pos = currentState.position || 0;
    if (currentState.status === 'Playing' && dur > 0) {
      const elapsed = (Date.now() - lastStateReceivedTime) / 1000;
      if (elapsed > 0 && elapsed < 86400) {
        pos = Math.min(dur, pos + elapsed);
      }
    }
    return pos;
  }

  function getMinTop() {
    const isHiddenAttr = document.documentElement.getAttribute('data-hide-titlebar') === 'true';
    if (isHiddenAttr) return PAD;

    const tb = document.getElementById('ethernet-titlebar');
    if (tb) {
      const style = window.getComputedStyle(tb);
      if (style.display !== 'none' && style.visibility !== 'hidden') {
        const rect = tb.getBoundingClientRect();
        const bottom = rect.bottom > 0 ? rect.bottom : 26;
        return bottom + PAD;
      }
    }
    return PAD;
  }

  function expandCard() {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;

    const rect = root.getBoundingClientRect();
    const curW = rect.width;
    const curH = rect.height;
    const minTop = getMinTop();

    const isRight = (rect.left + curW / 2) > (window.innerWidth / 2);
    const isBottom = (rect.top + curH / 2) > (window.innerHeight / 2);

    let targetTop = isBottom ? (rect.bottom - CARD_H) : rect.top;
    const maxY = Math.max(minTop, window.innerHeight - CARD_H);
    targetTop = Math.max(minTop, Math.min(maxY, targetTop));

    isCollapsed = false;
    root.classList.remove('is-collapsed');
    root.classList.add('is-expanded');
    root.classList.toggle('anchor-right', isRight);
    root.classList.toggle('anchor-left', !isRight);

    root.style.top = `${targetTop}px`;
    root.style.bottom = 'auto';

    let savedPos;
    if (isRight) {
      const curDistRight = Math.max(0, window.innerWidth - rect.right);
      const maxDistRight = Math.max(0, window.innerWidth - CARD_W);
      const clampedDist = Math.max(0, Math.min(maxDistRight, curDistRight));
      root.style.right = `${clampedDist}px`;
      root.style.left = 'auto';
      savedPos = { anchor: 'right', dist: clampedDist, x: window.innerWidth - clampedDist - CARD_W, y: targetTop };
    } else {
      const maxX = Math.max(0, window.innerWidth - CARD_W);
      const clampedX = Math.max(0, Math.min(maxX, rect.left));
      root.style.left = `${clampedX}px`;
      root.style.right = 'auto';
      savedPos = { anchor: 'left', dist: clampedX, x: clampedX, y: targetTop };
    }

    try {
      localStorage.setItem(STORAGE_COLLAPSED_KEY, 'false');
      localStorage.setItem(STORAGE_POS_KEY, JSON.stringify(savedPos));
    } catch {}

    updateUI();
  }

  function collapseCard() {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;

    const rect = root.getBoundingClientRect();
    const curW = rect.width;
    const curH = rect.height;
    const minTop = getMinTop();

    const isRight = (rect.left + curW / 2) > (window.innerWidth / 2);
    const isBottom = (rect.top + curH / 2) > (window.innerHeight / 2);

    let targetTop = isBottom ? (rect.bottom - PILL_H) : rect.top;
    const maxY = Math.max(minTop, window.innerHeight - PILL_H);
    targetTop = Math.max(minTop, Math.min(maxY, targetTop));

    isCollapsed = true;
    root.classList.remove('is-expanded');
    root.classList.add('is-collapsed');
    root.classList.toggle('anchor-right', isRight);
    root.classList.toggle('anchor-left', !isRight);

    root.style.top = `${targetTop}px`;
    root.style.bottom = 'auto';

    let savedPos;
    if (isRight) {
      const curDistRight = Math.max(0, window.innerWidth - rect.right);
      const maxDistRight = Math.max(0, window.innerWidth - PILL_W);
      const clampedDist = Math.max(0, Math.min(maxDistRight, curDistRight));
      root.style.right = `${clampedDist}px`;
      root.style.left = 'auto';
      savedPos = { anchor: 'right', dist: clampedDist, x: window.innerWidth - clampedDist - PILL_W, y: targetTop };
    } else {
      const maxX = Math.max(0, window.innerWidth - PILL_W);
      const clampedX = Math.max(0, Math.min(maxX, rect.left));
      root.style.left = `${clampedX}px`;
      root.style.right = 'auto';
      savedPos = { anchor: 'left', dist: clampedX, x: clampedX, y: targetTop };
    }

    try {
      localStorage.setItem(STORAGE_COLLAPSED_KEY, 'true');
      localStorage.setItem(STORAGE_POS_KEY, JSON.stringify(savedPos));
    } catch {}

    updateUI();
  }

  async function querySystemMedia() {
    const api = getDesktopApi();
    if (!api || !api.mediaGetSystemState) return;

    try {
      const state = await api.mediaGetSystemState();
      if (state && typeof state.active === 'boolean') {
        currentState = state;
        lastStateReceivedTime = Date.now();
        updateUI();
      }
    } catch (e) {
      // Игнорируем задержки
    }
  }

  function renderCover(container, thumbnail, isSmall) {
    if (!container) return;
    const size = isSmall ? 14 : 22;
    if (thumbnail && typeof thumbnail === 'string' && thumbnail.startsWith('data:image/')) {
      const existingImg = container.querySelector('img');
      if (existingImg && existingImg.getAttribute('data-src') === thumbnail) {
        return;
      }
      const className = isSmall ? 'music-box-pill-cover-img' : 'music-box-cover-img';
      container.innerHTML = `<img class="${className}" src="${thumbnail}" data-src="${thumbnail}" alt="" />`;
      const img = container.querySelector('img');
      if (img) {
        img.onerror = () => {
          container.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>`;
        };
      }
    } else {
      const existingSvg = container.querySelector('svg');
      if (!existingSvg) {
        container.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>`;
      }
    }
  }

  function updateTimelineUI() {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    const timeCur = root.querySelector('.music-box-time-current');
    const timeDur = root.querySelector('.music-box-time-duration');
    const progressFill = root.querySelector('.music-box-slider-fill');

    const pos = getCalculatedPosition();
    const dur = currentState.duration || 0;

    if (timeCur) timeCur.textContent = formatTime(pos);
    if (timeDur) timeDur.textContent = dur > 0 ? formatTime(dur) : '--:--';
    if (progressFill) {
      const pct = dur > 0 ? Math.min(100, Math.max(0, (pos / dur) * 100)) : 0;
      progressFill.style.width = `${pct}%`;
    }
  }

  function updateUI() {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;

    const isPlaying = currentState.status === 'Playing';
    const titleEl = root.querySelector('.music-box-track-title');
    const artistEl = root.querySelector('.music-box-track-artist');
    const playBtn = root.querySelector('.music-box-main-btn');
    const pillPlayBtn = root.querySelector('.music-box-pill-play');
    const pillTitle = root.querySelector('.music-box-pill-title');
    const cardCover = root.querySelector('.music-box-cover');
    const pillIcon = root.querySelector('.music-box-pill-icon');

    const hasTrack = Boolean(currentState.title && currentState.title.trim());
    const displayTitle = hasTrack
      ? currentState.title
      : (currentState.active ? 'Воспроизведение...' : 'Нет активного трека');
    const displayArtist = currentState.artist || (currentState.active ? 'Системное аудио' : 'Запустите музыку в браузере или плеере');

    if (titleEl) titleEl.textContent = displayTitle;
    if (artistEl) artistEl.textContent = displayArtist;
    if (pillTitle) pillTitle.textContent = displayTitle;

    renderCover(cardCover, currentState.thumbnail, false);
    renderCover(pillIcon, currentState.thumbnail, true);

    // Иконка Play / Pause в развернутой карточке
    if (playBtn) {
      playBtn.innerHTML = isPlaying
        ? `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"></rect><rect x="14" y="5" width="4" height="14" rx="1"></rect></svg>`
        : `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5v14l11-7z"></path></svg>`;
      playBtn.title = isPlaying ? 'Пауза' : 'Воспроизведение';
    }

    // Иконка Play / Pause в таблетке
    if (pillPlayBtn) {
      pillPlayBtn.innerHTML = isPlaying
        ? `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"></rect><rect x="14" y="5" width="4" height="14" rx="1"></rect></svg>`
        : `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M8 5v14l11-7z"></path></svg>`;
      pillPlayBtn.title = isPlaying ? 'Пауза' : 'Воспроизведение';
    }

    updateTimelineUI();
  }

  function sendControl(action, value) {
    const api = getDesktopApi();
    if (!api || !api.mediaControlSystem) return;
    api.mediaControlSystem(action, value).then((newState) => {
      if (newState && typeof newState.active === 'boolean') {
        currentState = newState;
        lastStateReceivedTime = Date.now();
        updateUI();
      }
    }).catch(() => {});
  }

  function mountDOM() {
    if (document.getElementById(ROOT_ID)) return;

    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    try {
      isCollapsed = localStorage.getItem(STORAGE_COLLAPSED_KEY) === 'true';
    } catch {}

    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.className = isCollapsed ? 'is-collapsed' : 'is-expanded';

    // Восстанавливаем позицию
    try {
      const savedPos = JSON.parse(localStorage.getItem(STORAGE_POS_KEY) || 'null');
      if (savedPos && typeof savedPos.y === 'number') {
        const curW = isCollapsed ? PILL_W : CARD_W;
        const curH = isCollapsed ? PILL_H : CARD_H;
        const minTop = getMinTop();
        const maxY = Math.max(minTop, window.innerHeight - curH);
        const y = Math.max(minTop, Math.min(maxY, savedPos.y));
        root.style.top = `${y}px`;
        root.style.bottom = 'auto';

        const isRight = savedPos.anchor === 'right' ||
          (savedPos.anchor !== 'left' && typeof savedPos.x === 'number' && (savedPos.x + curW / 2) > (window.innerWidth / 2));

        root.classList.toggle('anchor-right', isRight);
        root.classList.toggle('anchor-left', !isRight);

        if (isRight) {
          let dist;
          if (typeof savedPos.dist === 'number' && savedPos.anchor === 'right') {
            dist = savedPos.dist;
          } else if (typeof savedPos.x === 'number') {
            dist = window.innerWidth - (savedPos.x + curW);
          } else {
            dist = 24;
          }
          const maxDist = Math.max(0, window.innerWidth - curW);
          const clampedDist = Math.max(0, Math.min(maxDist, dist));
          root.style.right = `${clampedDist}px`;
          root.style.left = 'auto';
        } else {
          const x = typeof savedPos.x === 'number' ? savedPos.x : (savedPos.dist || 24);
          const maxX = Math.max(0, window.innerWidth - curW);
          const clampedX = Math.max(0, Math.min(maxX, x));
          root.style.left = `${clampedX}px`;
          root.style.right = 'auto';
        }
      }
    } catch {}

    root.innerHTML = `
      <!-- Развернутый плеер -->
      <div class="music-box-card-content">
        <div class="music-box-track-row">
          <div class="music-box-cover">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
          </div>
          <div class="music-box-track-text">
            <div class="music-box-track-title">Нет активного трека</div>
            <div class="music-box-track-artist">Запустите музыку в браузере или плеере</div>
          </div>
          <div class="music-box-header-btns">
            <button type="button" class="music-box-tool-btn music-box-btn-collapse" title="Свернуть">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 13H5v-2h14v2z"/></svg>
            </button>
            <button type="button" class="music-box-tool-btn music-box-btn-close" title="Закрыть">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            </button>
          </div>
        </div>

        <div class="music-box-timeline">
          <div class="music-box-slider-wrap">
            <div class="music-box-slider-track">
              <div class="music-box-slider-fill">
                <div class="music-box-slider-thumb"></div>
              </div>
            </div>
          </div>
          <div class="music-box-time-row">
            <span class="music-box-time-current">0:00</span>
            <span class="music-box-time-duration">--:--</span>
          </div>
        </div>

        <div class="music-box-controls">
          <button type="button" class="music-box-ctrl-btn music-box-btn-prev" title="Предыдущий">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
          </button>
          <button type="button" class="music-box-main-btn" title="Воспроизведение">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </button>
          <button type="button" class="music-box-ctrl-btn music-box-btn-next" title="Следующий">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
          </button>
        </div>
      </div>

      <!-- Свернутый режим (пилюля) -->
      <div class="music-box-pill-content">
        <div class="music-box-pill-thumb-box">
          <div class="music-box-pill-icon">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
          </div>
          <button type="button" class="music-box-pill-expand-btn" title="Развернуть">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 8l-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14z"/></svg>
          </button>
        </div>
        <span class="music-box-pill-title">Музыка</span>
        <div class="music-box-pill-nav">
          <button type="button" class="music-box-pill-btn music-box-pill-prev" title="Предыдущий">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
          </button>
          <button type="button" class="music-box-pill-btn music-box-pill-play" title="Воспроизведение">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </button>
          <button type="button" class="music-box-pill-btn music-box-pill-next" title="Следующий">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(root);
    setupEvents(root);
  }

  function setupEvents(root) {
    const cardContent = root.querySelector('.music-box-card-content');
    const pillContent = root.querySelector('.music-box-pill-content');
    const btnCollapse = root.querySelector('.music-box-btn-collapse');
    const btnClose = root.querySelector('.music-box-btn-close');
    const btnPlay = root.querySelector('.music-box-main-btn');
    const btnPrev = root.querySelector('.music-box-btn-prev');
    const btnNext = root.querySelector('.music-box-btn-next');
    const sliderWrap = root.querySelector('.music-box-slider-wrap');

    const btnPillExpand = root.querySelector('.music-box-pill-expand-btn');
    const btnPillPrev = root.querySelector('.music-box-pill-prev');
    const btnPillPlay = root.querySelector('.music-box-pill-play');
    const btnPillNext = root.querySelector('.music-box-pill-next');

    pillContent.addEventListener('click', (e) => {
      if (root.dataset.justDragged === 'true') {
        root.dataset.justDragged = 'false';
        return;
      }
      if (e.target.closest('button')) return;
      expandCard();
    });

    if (btnPillExpand) {
      btnPillExpand.addEventListener('click', (e) => {
        e.stopPropagation();
        expandCard();
      });
    }

    if (btnPillPrev) {
      btnPillPrev.addEventListener('click', (e) => {
        e.stopPropagation();
        sendControl('prev');
      });
    }

    if (btnPillPlay) {
      btnPillPlay.addEventListener('click', (e) => {
        e.stopPropagation();
        sendControl('toggle');
      });
    }

    if (btnPillNext) {
      btnPillNext.addEventListener('click', (e) => {
        e.stopPropagation();
        sendControl('next');
      });
    }

    btnCollapse.addEventListener('click', (e) => {
      e.stopPropagation();
      collapseCard();
    });

    btnClose.addEventListener('click', (e) => {
      e.stopPropagation();
      root.style.display = 'none';
    });

    btnPlay.addEventListener('click', (e) => {
      e.stopPropagation();
      sendControl('toggle');
    });

    btnPrev.addEventListener('click', (e) => {
      e.stopPropagation();
      sendControl('prev');
    });

    btnNext.addEventListener('click', (e) => {
      e.stopPropagation();
      sendControl('next');
    });

    // Таймлайн
    if (sliderWrap) {
      function getPosFromEvent(e) {
        if (!currentState.duration || currentState.duration <= 0) return 0;
        const rect = sliderWrap.getBoundingClientRect();
        const clickX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
        const pct = rect.width > 0 ? clickX / rect.width : 0;
        return pct * currentState.duration;
      }

      sliderWrap.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || !currentState.duration || currentState.duration <= 0) return;
        e.preventDefault();
        e.stopPropagation();
        isDraggingSlider = true;
        sliderWrap.classList.add('dragging');
        try { sliderWrap.setPointerCapture(e.pointerId); } catch {}
        scrubPosition = getPosFromEvent(e);
        updateTimelineUI();

        function onPointerMove(ev) {
          if (!isDraggingSlider) return;
          scrubPosition = getPosFromEvent(ev);
          updateTimelineUI();
        }

        function onPointerUp(ev) {
          if (!isDraggingSlider) return;
          isDraggingSlider = false;
          sliderWrap.classList.remove('dragging');
          try { sliderWrap.releasePointerCapture(ev.pointerId); } catch {}
          sliderWrap.removeEventListener('pointermove', onPointerMove);
          sliderWrap.removeEventListener('pointerup', onPointerUp);
          sliderWrap.removeEventListener('pointercancel', onPointerUp);

          const targetSec = getPosFromEvent(ev);
          currentState.position = targetSec;
          lastStateReceivedTime = Date.now();
          sendControl('seek', targetSec);
          updateTimelineUI();
        }

        sliderWrap.addEventListener('pointermove', onPointerMove);
        sliderWrap.addEventListener('pointerup', onPointerUp);
        sliderWrap.addEventListener('pointercancel', onPointerUp);
      });
    }

    // Перетаскивание
    function bindDraggable(handle) {
      handle.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || e.target.closest('button') || e.target.closest('.music-box-slider-wrap')) {
          return;
        }
        e.preventDefault();

        const startX = e.clientX;
        const startY = e.clientY;
        const rect = root.getBoundingClientRect();
        const startLeft = rect.left;
        const startTop = rect.top;
        let moved = false;

        try {
          handle.setPointerCapture(e.pointerId);
        } catch {}

        function onPointerMove(ev) {
          const dx = ev.clientX - startX;
          const dy = ev.clientY - startY;
          if (!moved && Math.hypot(dx, dy) > 4) {
            moved = true;
            root.dataset.justDragged = 'true';
            root.classList.add('is-dragging');
          }

          if (moved) {
            let newX = startLeft + dx;
            let newY = startTop + dy;
            const curW = root.offsetWidth;
            const curH = root.offsetHeight;
            const minTop = getMinTop();
            const maxX = Math.max(0, window.innerWidth - curW);
            const maxY = Math.max(minTop, window.innerHeight - curH);

            newX = Math.max(0, Math.min(maxX, newX));
            newY = Math.max(minTop, Math.min(maxY, newY));

            const isRight = (newX + curW / 2) > (window.innerWidth / 2);
            root.classList.toggle('anchor-right', isRight);
            root.classList.toggle('anchor-left', !isRight);

            if (isRight) {
              const distFromRight = Math.max(0, window.innerWidth - (newX + curW));
              root.style.right = `${distFromRight}px`;
              root.style.left = 'auto';
            } else {
              root.style.left = `${newX}px`;
              root.style.right = 'auto';
            }

            root.style.top = `${newY}px`;
            root.style.bottom = 'auto';
          }
        }

        function onPointerUp(ev) {
          try {
            handle.releasePointerCapture(ev.pointerId);
          } catch {}

          handle.removeEventListener('pointermove', onPointerMove);
          handle.removeEventListener('pointerup', onPointerUp);
          handle.removeEventListener('pointercancel', onPointerUp);

          root.classList.remove('is-dragging');

          if (moved) {
            const r = root.getBoundingClientRect();
            const curW = isCollapsed ? PILL_W : CARD_W;
            const isRight = root.classList.contains('anchor-right');
            let posToSave;
            if (isRight) {
              const distFromRight = Math.max(0, window.innerWidth - r.right);
              posToSave = {
                anchor: 'right',
                dist: distFromRight,
                x: window.innerWidth - distFromRight - curW,
                y: r.top
              };
            } else {
              posToSave = {
                anchor: 'left',
                dist: Math.max(0, r.left),
                x: Math.max(0, r.left),
                y: r.top
              };
            }
            try {
              localStorage.setItem(STORAGE_POS_KEY, JSON.stringify(posToSave));
            } catch {}
            setTimeout(() => {
              root.dataset.justDragged = 'false';
            }, 60);
          }
        }

        handle.addEventListener('pointermove', onPointerMove);
        handle.addEventListener('pointerup', onPointerUp);
        handle.addEventListener('pointercancel', onPointerUp);
      });
    }

    bindDraggable(cardContent);
    bindDraggable(pillContent);

    window.addEventListener('resize', () => {
      const curW = isCollapsed ? PILL_W : CARD_W;
      const curH = isCollapsed ? PILL_H : CARD_H;
      const rect = root.getBoundingClientRect();
      const minTop = getMinTop();
      const isRight = root.classList.contains('anchor-right');
      const maxY = Math.max(minTop, window.innerHeight - curH);
      const newY = Math.max(minTop, Math.min(maxY, rect.top));
      root.style.top = `${newY}px`;

      if (isRight) {
        const maxDist = Math.max(0, window.innerWidth - curW);
        const curDist = Math.max(0, window.innerWidth - rect.right);
        const newDist = Math.max(0, Math.min(maxDist, curDist));
        root.style.right = `${newDist}px`;
        root.style.left = 'auto';
      } else {
        const maxX = Math.max(0, window.innerWidth - curW);
        const newX = Math.max(0, Math.min(maxX, rect.left));
        root.style.left = `${newX}px`;
        root.style.right = 'auto';
      }
    });
  }

  function init() {
    mountDOM();
    querySystemMedia();
    pollInterval = setInterval(querySystemMedia, 1000);
    tickInterval = setInterval(() => {
      if (currentState.status === 'Playing' && !isDraggingSlider) {
        updateTimelineUI();
      }
    }, 250);
  }

  function destroy() {
    if (pollInterval) clearInterval(pollInterval);
    if (tickInterval) clearInterval(tickInterval);
    const root = document.getElementById(ROOT_ID);
    if (root) root.remove();
    const style = document.getElementById(STYLE_ID);
    if (style) style.remove();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  if (window.ethernet && typeof window.ethernet.onDestroy === 'function') {
    window.ethernet.onDestroy(destroy);
  }
})();
