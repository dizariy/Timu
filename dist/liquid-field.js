// A single continuous density field lets neighbouring streams share an edge.
// Warp both axes before sampling it so that narrow channels can open and close.
const TABLE_SIZE = 8192;
const sineTable = Float32Array.from({length: TABLE_SIZE}, (_, i) => Math.sin(i / TABLE_SIZE * 2 * Math.PI));
const wave = turns => sineTable[Math.floor(turns * TABLE_SIZE) & (TABLE_SIZE - 1)];

const stops = [
  [-1.4, 14, 10, 21],
  [-.48, 20, 13, 31],
  [-.26, 38, 22, 56],
  [-.12, 77, 43, 111],
  [.02, 133, 92, 174],
  [.17, 184, 150, 213],
  [.38, 211, 188, 232],
  [.85, 232, 216, 245],
  [1.4, 241, 229, 250]
];

// ImageData stores RGBA bytes in native memory order. Build the lookup in
// those same bytes so a whole pixel can be copied with one assignment.
const palette = new Uint32Array(1024);
const channels = new Uint8ClampedArray(palette.buffer);
let stop = 0;
for (let i = 0; i < palette.length; i++) {
  const density = -1.4 + i * 2.8 / (palette.length - 1);
  while (stop < stops.length - 2 && density > stops[stop + 1][0]) stop++;
  const left = stops[stop], right = stops[stop + 1];
  const amount = (density - left[0]) / (right[0] - left[0]);
  for (let c = 0; c < 3; c++) channels[i * 4 + c] = left[c + 1] + amount * (right[c + 1] - left[c + 1]);
  channels[i * 4 + 3] = 255;
}

export function createLiquidFrame(width, height) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  const colors = new Uint32Array(pixels.buffer);
  const spanX = Math.min(5.6, 1.15 + 1.38 * width / height);
  const xs = Float32Array.from({length: width}, (_, x) => ((x + .5) / width - .5) * spanX);
  const ys = Float32Array.from({length: height}, (_, y) => ((y + .5) / height - .5) * 2.25);

  function render(phase) {
    const t = phase - Math.floor(phase);
    const drift = wave(t), tide = wave(t + .25);
    let index = 0;
    for (const y of ys) {
      const bend = .31 * y + t;
      for (let col = 0; col < width; col++) {
        const x = xs[col];
        const u = x + .41 * wave(bend - .10 * x) + .16 * wave(.37 * x + .28 * y - t);
        const v = y + .48 * wave(.32 * x + .19 * y - t + .17) + .13 * wave(.51 * x - .24 * y + t);
        const fold = .21 * wave(.42 * u - .21 * v + .11 + .08 * tide);
        let density = .84 * wave(.31 * u + .56 * v + fold + .065 * drift)
          + .56 * wave(.44 * u - .27 * v + .12 + .17 * drift)
          + .27 * wave(.51 * u + .42 * v - .16 - .15 * tide) - .08;
        // A fold can enclose a dark sliver inside the same stream. It tapers
        // away along the contour, avoiding a uniform outline on every edge.
        const ridge = (density - .5 + .16 * wave(.26 * u - .21 * v + .05 * drift)) / .42;
        const interior = Math.max(0, 1 - ridge * ridge);
        const pocket = Math.max(0, wave(.25 * u - .23 * v + .47 + .08 * tide));
        density -= 1.04 * interior * interior * pocket * pocket;
        const color = Math.max(0, Math.min(1023, Math.round((density + 1.4) * (1023 / 2.8))));
        colors[index++] = palette[color];
      }
    }
  }

  return {pixels, render};
}
