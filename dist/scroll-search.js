const DOCK_AFTER_HERO = 64;
const COLLAPSE_DISTANCE = 204;
const DOCK_BLEND_DISTANCE = 80;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const ease = value => value * value * (3 - 2 * value);

export function searchScrollState(scrollTop, heroBottom) {
  const end = Math.max(1, heroBottom - 16);
  const start = Math.max(0, end - COLLAPSE_DISTANCE);
  const progress = clamp((scrollTop - start) / (end - start), 0, 1);
  const handoff = clamp((scrollTop - heroBottom - DOCK_AFTER_HERO) / DOCK_BLEND_DISTANCE + .5, 0, 1);
  return {progress, handoff, collapsed: progress === 1, docked: handoff >= .5};
}

export function createScrollSearch({dialog, applyQuery}) {
  const shell = document.querySelector('#search-shell');
  const hero = document.querySelector('#hero');
  const controls = document.querySelector('#bottom-controls');
  const field = document.querySelector('#search');
  const trigger = document.querySelector('#search-button');
  const dock = document.querySelector('#search-dock');
  const close = document.querySelector('#search-close');
  let heroBottom;
  let queryTimer;
  let frame = 0;
  let expanded = false;
  let docked = false;
  let lastBlur;
  let lastProgress;
  let lastHandoff;
  let fieldHidden = false;

  function update() {
    frame = 0;
    const {progress, handoff, collapsed, docked: nextDocked} = searchScrollState(scrollY, heroBottom);
    const active = document.activeElement;
    const moveFocus = !expanded && docked !== nextDocked && active === (docked ? dock : trigger);
    docked = nextDocked;
    shell.classList.toggle('collapsed', collapsed);
    shell.classList.toggle('expanded', expanded);
    controls.classList.toggle('search-docked', docked);
    if (progress !== lastProgress) {
      shell.style.setProperty('--search-collapse', ease(progress).toFixed(4));
      lastProgress = progress;
    }
    if (handoff !== lastHandoff) {
      const blend = ease(handoff).toFixed(4);
      shell.style.setProperty('--search-handoff', blend);
      controls.style.setProperty('--search-handoff', blend);
      lastHandoff = handoff;
    }
    const hideField = !expanded && progress >= .84;
    if (fieldHidden !== hideField) {
      fieldHidden = hideField;
      field.tabIndex = fieldHidden ? -1 : 0;
      field.setAttribute('aria-hidden', String(fieldHidden));
    }
    if (shell.inert !== (docked && !expanded)) shell.inert = docked && !expanded;
    if (dock.inert === docked) dock.inert = !docked;
    trigger.setAttribute('aria-expanded', String(expanded));
    dock.setAttribute('aria-expanded', String(expanded));
    if (moveFocus) (docked ? dock : trigger).focus({preventScroll: true});
    const blur = (12 * clamp(scrollY / 190, 0, 1)).toFixed(1);
    if (blur !== lastBlur) {
      hero.style.setProperty('--hero-scroll-blur', blur + 'px');
      lastBlur = blur;
    }
  }

  function measure() {
    heroBottom = hero.getBoundingClientRect().bottom + scrollY;
    if (frame) cancelAnimationFrame(frame);
    update();
  }

  function openSearch() {
    shell.classList.add('manual');
    expanded = true;
    if (frame) cancelAnimationFrame(frame);
    update();
    field.focus({preventScroll: true});
  }

  function collapseSearch(returnFocus) {
    if (!expanded) return;
    shell.classList.add('manual');
    expanded = false;
    if (document.activeElement === field) field.blur();
    if (frame) cancelAnimationFrame(frame);
    update();
    if (returnFocus) (docked ? dock : trigger).focus({preventScroll: true});
  }

  field.addEventListener('input', () => {
    clearTimeout(queryTimer);
    queryTimer = setTimeout(() => applyQuery(field.value.trim()), 90);
  });
  field.addEventListener('focus', () => {
    if (!expanded) openSearch();
  });
  trigger.addEventListener('click', openSearch);
  dock.addEventListener('click', () => {
    if (expanded) collapseSearch(true);
    else openSearch();
  });
  close.addEventListener('click', () => {
    clearTimeout(queryTimer);
    if (!field.value) {
      collapseSearch(true);
      return;
    }
    field.value = '';
    applyQuery('');
    openSearch();
  });

  document.addEventListener('pointerdown', event => {
    if (expanded && !shell.contains(event.target) && !dock.contains(event.target)) collapseSearch(false);
  });
  document.addEventListener('keydown', event => {
    if (dialog.open || event.defaultPrevented) return;
    if (event.key === 'Escape' && expanded) {
      event.preventDefault();
      collapseSearch(true);
    } else if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey &&
      !document.activeElement?.closest('input, textarea, select, [contenteditable="true"]')) {
      event.preventDefault();
      openSearch();
    }
  });
  addEventListener('scroll', () => {
    shell.classList.remove('manual');
    if (!frame) frame = requestAnimationFrame(update);
  }, {passive: true});
  addEventListener('resize', measure, {passive: true});
  addEventListener('pageshow', measure);
  if ('ResizeObserver' in window) new ResizeObserver(measure).observe(hero);
  const touchScreen = matchMedia('(pointer: coarse)');
  for (const type of ['gesturestart', 'gesturechange']) {
    document.addEventListener(type, event => {
      if (touchScreen.matches) event.preventDefault();
    }, {passive: false});
  }
  measure();
}
