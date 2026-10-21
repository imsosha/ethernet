/**
 * Plugin: Sakura (Сакура)
 * @name Сакура
 * @description Анимация падающих лепестков сакуры
 * @author Ethernet
 * @version 1.1.0
 * @permissions dom.style, storage.local
 */

(function () {
  'use strict';

  const PLUGIN_ID = 'sakura';
  const CANVAS_ID = 'ethernet-sakura-canvas';
  const STYLE_ID = 'ethernet-sakura-styles';

  const CSS = `
    #${CANVAS_ID} {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      pointer-events: none;
      z-index: 99990;
      display: block;
      contain: strict;
      will-change: transform;
    }
  `;

  // SVG-путь цветка сакуры (viewBox 0 0 64 64)
  const FLOWER_PATH_DATA = 'M58.1 32.2c3.1-2.8 3.8-5.8 3.9-7.8c0-.5-.2-1-.6-1.3s-.9-.4-1.4-.3c-1 .2-2.2-.3-2.6-1.3c-.5-1.1-.2-2.3.6-3.1c.4-.3.6-.8.6-1.3s-.2-.9-.6-1.2c-1-.8-2.1-1.3-3.4-1.6c.1-1.8-.3-3.5-1.1-5c-.2-.4-.7-.8-1.2-.9s-1 .1-1.4.4c-.8.7-2 .8-2.9.2s-1.3-1.9-.9-2.9c.2-.5.1-1-.1-1.4c-.3-.4-.7-.7-1.2-.7c-2-.3-4 .2-6 1.2c-.9-1.2-2-2.2-3.3-2.9c-.4-.2-1-.3-1.4-.1c-.5.2-.8.6-.9 1.1c-.2 1.1-1.1 1.8-2.2 1.8s-2-.8-2.3-1.9c-.1-.5-.5-.9-.9-1.1c-.5-.2-1-.2-1.4.1c-1.3.7-2.4 1.7-3.3 2.9c-1.9-1.1-3.9-1.5-5.9-1.2c-.5.1-.9.3-1.2.8c-.3.3-.4.9-.2 1.3c.4 1.1 0 2.3-.9 2.9c-.8.6-2.1.5-2.9-.2c-.4-.3-.9-.5-1.4-.4q-.75.15-1.2.9c-.8 1.5-1.1 3.2-1.1 5c-1.1.4-2.3.9-3.3 1.7q-.6.45-.6 1.2c0 .75.2.9.6 1.3c.9.7 1.1 2 .6 3.1c-.4.9-1.6 1.5-2.6 1.2c-.5-.1-1 0-1.4.3c-.4.4-.6.9-.6 1.4c.1 2 .8 5 3.9 7.8C2.8 35 2.1 37.9 2 39.9c0 .5.2 1 .6 1.3s.9.4 1.4.3c1-.2 2.2.3 2.6 1.3c.5 1 .2 2.3-.6 3c-.4.3-.6.8-.6 1.3s.2.9.6 1.2c1 .7 2.1 1.3 3.4 1.6c-.2 2 .2 3.8 1 5.5c.2.5.7.8 1.2.9s1-.1 1.4-.4c.8-.7 2-.8 2.9-.2c.9.7 1.3 1.9.9 3c-.2.5-.1 1 .1 1.4c.3.4.7.7 1.2.8c.4 0 .8.1 1.1.1c1.7 0 3.5-.5 5.2-1.5c.8 1 1.8 1.8 2.9 2.4c.4.2 1 .3 1.4.1c.5-.2.8-.6.9-1.1c.3-1.1 1.2-1.9 2.3-1.9s2 .8 2.3 1.9c.1.5.5.9.9 1.1c.2.1.4.1.7.1s.5-.1.8-.2c1.1-.6 2.1-1.4 2.9-2.4c1.7 1 3.4 1.5 5.2 1.5c.4 0 .8 0 1.1-.1c.5-.1.9-.3 1.2-.8c.3-.4.3-.9.1-1.4c-.4-1.1 0-2.3.9-3c.8-.6 2.1-.5 2.9.2c.4.3.9.5 1.4.4q.75-.15 1.2-.9c.8-1.7 1.2-3.5 1-5.5c1.3-.3 2.4-.8 3.4-1.6q.6-.45.6-1.2c0-.75-.2-.9-.6-1.3c-.9-.7-1.1-2-.6-3s1.6-1.5 2.6-1.3h.4c.4 0 .7-.1 1-.4c.4-.3.6-.8.6-1.3c0-1.9-.7-4.8-3.8-7.6M43.8 7.1c0 1.8.9 3.4 2.4 4.5c1.5 1 3.3 1.3 5 .7c.1.5.1 1.1.1 1.7c-2.3.1-4.7.8-7.3 2.1c-.5.3-1.1.6-1.6 1c.1-.7.1-1.3.1-2c0-2.7-.4-5.1-1.1-7.1q1.2-.75 2.4-.9m-31 5.2c1.6.5 3.6.3 5-.7c1.5-1 2.4-2.7 2.4-4.5q1.2.15 2.4.9c-.7 2-1.1 4.4-1.1 7.1c0 .6 0 1.3.1 2c-.5-.4-1.1-.7-1.6-1c-2.6-1.3-5-2-7.3-2.1c0-.6 0-1.2.1-1.7';

  // SVG-путь лепестка
  const PETAL_PATH_DATA = 'M 0 -16 C 9 -12, 13 4, 6 15 C 0 18, -6 15, -13 4 C -9 -12, 0 -16, 0 -16 Z';

  const SAKURA_COLORS = [
    '#ff8c80',
    '#ffa89e',
    '#ff9587',
    '#ffb3aa',
    '#ff796c',
    '#ffd0ca',
  ];

  // Prerendered offscreen sprites for ultra-high GPU performance (0 vector math per frame)
  const flowerSprites = [];
  const petalSprites = [];

  function prerenderSprites() {
    if (flowerSprites.length > 0) return;
    try {
      const flowerPath = new Path2D(FLOWER_PATH_DATA);
      const petalPath = new Path2D(PETAL_PATH_DATA);

      SAKURA_COLORS.forEach((color) => {
        // 1. Flower canvas (64x64)
        const fCanvas = document.createElement('canvas');
        fCanvas.width = 64;
        fCanvas.height = 64;
        const fCtx = fCanvas.getContext('2d');
        if (fCtx) {
          fCtx.fillStyle = color;
          fCtx.fill(flowerPath);
          flowerSprites.push(fCanvas);
        }

        // 2. Petal canvas (32x32)
        const pCanvas = document.createElement('canvas');
        pCanvas.width = 32;
        pCanvas.height = 32;
        const pCtx = pCanvas.getContext('2d');
        if (pCtx) {
          pCtx.translate(16, 16);
          pCtx.fillStyle = color;
          pCtx.fill(petalPath);
          petalSprites.push(pCanvas);
        }
      });
    } catch (e) {
      console.warn('[sakura] Failed to prerender sprites:', e);
    }
  }

  let canvas = null;
  let ctx = null;
  let animationFrameId = null;
  let particles = [];
  let isRunning = false;
  let isPaused = false;
  let lastFrameTime = 0;
  const TARGET_FPS = 36;
  const FRAME_INTERVAL = 1000 / TARGET_FPS;
  const PARTICLE_COUNT = 32;

  let mouse = { x: -1000, y: -1000, vx: 0, vy: 0, lastX: 0, lastY: 0 };

  class SakuraParticle {
    constructor(isInitial = false) {
      this.reset(isInitial);
    }

    reset(isInitial = false) {
      const w = window.innerWidth || 1920;
      const h = window.innerHeight || 1080;

      this.isFlower = Math.random() < 0.25;
      this.sprite = this.isFlower
        ? (flowerSprites.length > 0 ? flowerSprites[Math.floor(Math.random() * flowerSprites.length)] : null)
        : (petalSprites.length > 0 ? petalSprites[Math.floor(Math.random() * petalSprites.length)] : null);

      this.x = Math.random() * (w + 100) - 50;
      this.y = isInitial ? Math.random() * h : -25 - Math.random() * 40;

      this.size = this.isFlower
        ? (14 + Math.random() * 10)
        : (10 + Math.random() * 8);

      this.speedY = 0.75 + Math.random() * 1.25;
      this.speedX = 0.3 + Math.random() * 0.7;
      this.swayAngle = Math.random() * Math.PI * 2;
      this.swaySpeed = 0.015 + Math.random() * 0.02;
      this.swayRadius = 0.8 + Math.random() * 1.4;

      this.rotation = Math.random() * Math.PI * 2;
      this.rotationSpeed = (Math.random() - 0.5) * 0.025;

      this.flutterAngle = Math.random() * Math.PI * 2;
      this.flutterSpeed = 0.02 + Math.random() * 0.035;

      this.opacity = 0.65 + Math.random() * 0.32;
      this.pushVx = 0;
      this.pushVy = 0;
    }

    update(w, h) {
      this.swayAngle += this.swaySpeed;
      this.flutterAngle += this.flutterSpeed;
      this.rotation += this.rotationSpeed;

      const dx = this.x - mouse.x;
      const dy = this.y - mouse.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 120 && dist > 1) {
        const force = (1 - dist / 120) * 1.5;
        this.pushVx += (dx / dist) * force + mouse.vx * 0.15;
        this.pushVy += (dy / dist) * force + mouse.vy * 0.15;
      }

      this.pushVx *= 0.92;
      this.pushVy *= 0.92;

      this.x += this.speedX + Math.sin(this.swayAngle) * this.swayRadius + this.pushVx;
      this.y += this.speedY + this.pushVy;

      if (this.y > h + 30 || this.x > w + 50 || this.x < -50) {
        this.reset(false);
      }
    }

    draw(context) {
      if (!this.sprite) return;
      context.save();
      context.translate(this.x, this.y);
      context.rotate(this.rotation);

      const flutterScale = Math.cos(this.flutterAngle);
      context.scale(1, flutterScale);

      context.globalAlpha = this.opacity;
      const halfSize = this.size / 2;
      context.drawImage(this.sprite, -halfSize, -halfSize, this.size, this.size);
      context.restore();
    }
  }

  function resizeCanvas() {
    if (!canvas) return;
    const w = window.innerWidth || document.documentElement.clientWidth || 1920;
    const h = window.innerHeight || document.documentElement.clientHeight || 1080;
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
  }

  function renderFrame() {
    if (!ctx || !canvas) return;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    mouse.vx *= 0.8;
    mouse.vy *= 0.8;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.update(w, h);
      p.draw(ctx);
    }
  }

  function loop(now) {
    if (!isRunning) return;
    animationFrameId = requestAnimationFrame(loop);

    if (isPaused) return;

    const delta = now - lastFrameTime;
    if (delta < FRAME_INTERVAL) return;
    lastFrameTime = now - (delta % FRAME_INTERVAL);

    renderFrame();
  }

  function onMouseMove(e) {
    mouse.vx = (e.clientX - mouse.lastX) * 0.15;
    mouse.vy = (e.clientY - mouse.lastY) * 0.15;
    mouse.lastX = e.clientX;
    mouse.lastY = e.clientY;
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  }

  function onVisibilityChange() {
    isPaused = document.hidden;
  }

  function onWindowBlur() {
    isPaused = true;
  }

  function onWindowFocus() {
    isPaused = false;
    lastFrameTime = performance.now();
  }

  function init() {
    if (isRunning) return;

    prerenderSprites();

    // 1. Добавляем стили
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      style.dataset.ethernetPlugin = PLUGIN_ID;
      style.textContent = CSS;
      (document.head || document.documentElement).appendChild(style);
    }

    // 2. Создаем канвас
    canvas = document.getElementById(CANVAS_ID);
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = CANVAS_ID;
      canvas.dataset.ethernetPlugin = PLUGIN_ID;
      document.body.appendChild(canvas);
    }

    ctx = canvas.getContext('2d', { alpha: true });
    resizeCanvas();

    // 3. Создаем лепестки
    particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push(new SakuraParticle(true));
    }

    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('mousemove', onMouseMove, { passive: true });
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onWindowBlur);
    window.addEventListener('focus', onWindowFocus);

    isRunning = true;
    isPaused = false;
    lastFrameTime = performance.now();
    animationFrameId = requestAnimationFrame(loop);

    console.log('[sakura] Plugin initialized: falling petals active (optimized)');
  }

  function destroy() {
    isRunning = false;
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    window.removeEventListener('resize', resizeCanvas);
    window.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('blur', onWindowBlur);
    window.removeEventListener('focus', onWindowFocus);

    if (canvas && canvas.parentNode) {
      canvas.width = 0;
      canvas.height = 0;
      canvas.parentNode.removeChild(canvas);
      canvas = null;
    }
    const style = document.getElementById(STYLE_ID);
    if (style && style.parentNode) {
      style.parentNode.removeChild(style);
    }
    particles = [];
    ctx = null;
    console.log('[sakura] Plugin unloaded');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  if (typeof ethernet !== 'undefined' && ethernet.onDestroy) {
    ethernet.onDestroy(destroy);
  } else if (typeof window !== 'undefined' && window.ethernet && window.ethernet.onDestroy) {
    window.ethernet.onDestroy(destroy);
  }
})();
