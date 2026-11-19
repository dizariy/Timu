import {createLiquidFrame} from './liquid-field.js';

export const INTRO_HOLD_MS = 2_000;
export const GRADIENT_CYCLE_MS = 30_000;
const PHASE_COUNT = 6;

export function chooseGradientPhase(previous, random = Math.random) {
  const hasPrevious = Number.isInteger(previous) && previous >= 0 && previous < PHASE_COUNT;
  const count = hasPrevious ? PHASE_COUNT - 1 : PHASE_COUNT;
  const pick = Math.floor(random() * count);
  return hasPrevious && pick >= previous ? pick + 1 : pick;
}

export function createLiquidBanner(hero) {
  const canvas = hero.querySelector('.hero-liquid');
  const context = canvas.getContext('2d', {alpha: false});
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let revealed = false;
  let onScreen = true;
  let field, image;
  let elapsed = 0, started = null, lastPaint = 0, request = 0;

  function sizeSurface() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    // The light has soft edges. Full device resolution is reserved for the
    // wordmark and fine grain, which sit on their own layers above the canvas.
    const scale = Math.min(1, Math.sqrt(32000 / (w * h)));
    const width = Math.max(1, Math.round(w * scale));
    const height = Math.max(1, Math.round(h * scale));
    if (field && width === canvas.width && height === canvas.height) return;
    canvas.width = width;
    canvas.height = height;
    field = createLiquidFrame(width, height);
    image = new ImageData(field.pixels, width, height);
  }

  function paint(time) {
    if (!field) return;
    field.render(time / GRADIENT_CYCLE_MS);
    context.putImageData(image, 0, 0);
  }

  function tick(now) {
    const frameMs = 1000 / 30;
    const delta = now - lastPaint;
    if (delta >= frameMs) {
      paint(elapsed + now - started);
      lastPaint = now - delta % frameMs;
    }
    request = requestAnimationFrame(tick);
  }

  function pause(now) {
    cancelAnimationFrame(request);
    request = 0;
    if (started !== null) elapsed = (elapsed + now - started) % GRADIENT_CYCLE_MS;
    started = null;
  }

  function sync() {
    const now = performance.now();
    const visible = onScreen && !document.hidden;
    hero.classList.toggle('gradient-paused', !visible || reduced.matches);
    if (!revealed || !visible || !context) {
      pause(now);
      return;
    }
    sizeSurface();
    if (reduced.matches) {
      pause(now);
      paint(elapsed);
      return;
    }
    if (started === null) started = now;
    paint(elapsed + now - started);
    lastPaint = now;
    if (!request) request = requestAnimationFrame(tick);
  }

  if (!context) hero.classList.add('liquid-still');
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      sync();
    }).observe(hero);
  }
  document.addEventListener('visibilitychange', sync);
  reduced.addEventListener('change', sync);
  if ('ResizeObserver' in window) new ResizeObserver(sync).observe(hero);
  else window.addEventListener('resize', sync);

  return {
    reset(phase) {
      revealed = false;
      pause(performance.now());
      elapsed = phase * GRADIENT_CYCLE_MS / PHASE_COUNT;
      hero.dataset.gradientPhase = String(phase);
    },
    reveal() {
      revealed = true;
      sync();
    }
  };
}

