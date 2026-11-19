import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chooseGradientPhase, GRADIENT_CYCLE_MS, INTRO_HOLD_MS} from './dist/hero-gradient.js';
import {createLiquidFrame} from './dist/liquid-field.js';

assert.equal(INTRO_HOLD_MS, 2_000);
assert.equal(GRADIENT_CYCLE_MS, 30_000);

const phases = [0, 1, 2, 3, 4, 5];
for (const previous of [null, ...phases]) {
  const seen = new Set();
  for (let step = 0; step < 100; step++) {
    seen.add(chooseGradientPhase(previous, () => step / 100));
  }
  assert.deepEqual(seen, new Set(phases.filter(phase => phase !== previous)),
    'Launch can select every phase except the last one shown');
}

const dist = new URL('./dist/', import.meta.url);
const read = path => readFile(new URL(path, dist), 'utf8');
const scripts = ['app.js', 'hero-gradient.js', 'liquid-field.js'];
const [page, ...modules] = await Promise.all(['index.html', ...scripts].map(read));
const styleTags = [...page.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*>/g)];
const stylesheets = styleTags.map(([tag]) => tag.match(/\bhref="([^"]+)"/)[1]);
assert(stylesheets.includes('hero-gradient.css'), 'The home page must load the gradient styles');
assert.match(modules[0], /\bfrom\s*['"]\.\/hero-gradient\.js['"]/);

// Retired images can remain in the project for later use. Even an old CSS
// fallback in the active page could inadvertently start fetching them again.
const styles = await Promise.all(stylesheets.map(read));
const names = ['index.html', ...scripts, ...stylesheets];
const oldPhotoAsset = /backgrounds(?:-november)?\.json|hero-nov-\d+\.webp|hero-contrast\.js|(?:i\.)?pinimg\.com/i;
for (const [index, source] of [page, ...modules, ...styles].entries()) {
  assert(!oldPhotoAsset.test(source), names[index] + ' still refers to the photo library');
}

// Label the connected portions of the light material in a rendered frame.
// Tiny tips at the crop edge do not by themselves establish a visible merge.
function lightRegions(pixels, width, height, threshold) {
  const labels = new Int32Array(width * height);
  for (let i = 0; i < labels.length; i++) {
    const offset = i * 4;
    const light = .2126 * pixels[offset] + .7152 * pixels[offset + 1] + .0722 * pixels[offset + 2];
    if (light >= threshold) labels[i] = -1;
  }
  const sizes = [0];
  const queue = new Int32Array(labels.length);
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] !== -1) continue;
    const id = sizes.length;
    let head = 0, tail = 1;
    queue[0] = i;
    labels[i] = id;
    const visit = j => {
      if (labels[j] !== -1) return;
      labels[j] = id;
      queue[tail++] = j;
    };
    while (head < tail) {
      const j = queue[head++];
      if (j % width > 0) visit(j - 1);
      if ((j + 1) % width > 0) visit(j + 1);
      if (j >= width) visit(j - width);
      if (j + width < labels.length) visit(j + width);
    }
    sizes.push(tail);
  }
  return {labels, sizes};
}

// A genuine connection retains material on both sides of the new bridge.
// A changing count alone could also be caused by a shape leaving the screen.
function hasMerge(before, after, minArea) {
  const overlaps = after.sizes.map(() => new Map());
  for (let i = 0; i < before.labels.length; i++) {
    const a = before.labels[i], b = after.labels[i];
    if (before.sizes[a] < minArea || after.sizes[b] < minArea) continue;
    const contributors = overlaps[b];
    contributors.set(a, (contributors.get(a) || 0) + 1);
  }
  return overlaps.some(contributors =>
    [...contributors].filter(([id, area]) => area >= before.sizes[id] * .3).length >= 2);
}

for (const [width, height] of [[120, 80], [224, 64]]) {
  const frame = createLiquidFrame(width, height);
  frame.render(0);
  const first = frame.pixels.slice();
  frame.render(.25);
  assert.notDeepEqual(frame.pixels, first, 'The material should flow within a cycle.');
  frame.render(1);
  assert.deepEqual(frame.pixels, first, 'The last and first frame should coincide at the loop seam.');

  const minArea = Math.ceil(width * height * .006);
  const componentCounts = new Set();
  let previous, merged = false, split = false;
  for (let step = 0; step <= 48; step++) {
    frame.render(step / 48);
    // A midtone boundary separates the violet material from the dark channels.
    const current = lightRegions(frame.pixels, width, height, 100);
    componentCounts.add(current.sizes.filter(area => area >= minArea).length);
    if (previous) {
      merged ||= hasMerge(previous, current, minArea);
      split ||= hasMerge(current, previous, minArea);
    }
    previous = current;
  }
  assert(merged && split && componentCounts.size > 1,
    `Light streams must both join and separate at ${width} × ${height}.`);
}

console.log('Hero checks passed: startup timing, changing phases, seamless liquid mergers and splits, and disconnected photo library.');
