export type ArtStyle =
  | 'colorfield'
  | 'orbits'
  | 'strokes'
  | 'blocks'
  | 'waves'
  | 'speckle';

export type FrameStyle = 'walnut' | 'black' | 'brass' | 'ivory';
export type Wall = 'left' | 'right' | 'back';

export interface ArtworkSpec {
  id: string;
  title: string;
  artist: string;
  year: number;
  medium: string;
  dimensions: string;
  description: string;
  style: ArtStyle;
  palette: string[];
  bg: string;
  seed: number;
  width: number;
  height: number;
  wall: Wall;
  at: number;
  frame: FrameStyle;
  image?: string;
}

type Rng = () => number;

function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function range(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}

function pick<T>(rng: Rng, items: T[]): T {
  return items[Math.floor(rng() * items.length) % items.length];
}

function rgba(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value;
  const num = parseInt(full, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

let grainTile: HTMLCanvasElement | null = null;

function getGrainTile(): HTMLCanvasElement {
  if (grainTile) return grainTile;
  const tile = document.createElement('canvas');
  tile.width = 180;
  tile.height = 180;
  const ctx = tile.getContext('2d')!;
  const image = ctx.createImageData(tile.width, tile.height);
  for (let i = 0; i < image.data.length; i += 4) {
    const v = Math.floor(Math.random() * 255);
    image.data[i] = v;
    image.data[i + 1] = v;
    image.data[i + 2] = v;
    image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  grainTile = tile;
  return tile;
}

function finish(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const vignette = ctx.createRadialGradient(
    w / 2,
    h / 2,
    Math.min(w, h) * 0.18,
    w / 2,
    h / 2,
    Math.max(w, h) * 0.78,
  );
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.34)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);

  const pattern = ctx.createPattern(getGrainTile(), 'repeat');
  if (pattern) {
    ctx.save();
    ctx.globalAlpha = 0.055;
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}

function drawColorField(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  rng: Rng,
  palette: string[],
  bg: string,
): void {
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const bands = 4 + Math.floor(rng() * 3);
  const bandHeight = h / bands;

  for (let i = 0; i < bands; i += 1) {
    const y = i * bandHeight;
    const top = pick(rng, palette);
    const bottom = pick(rng, palette);
    const gradient = ctx.createLinearGradient(0, y, 0, y + bandHeight);
    gradient.addColorStop(0, rgba(top, 0));
    gradient.addColorStop(0.16, rgba(top, 0.82));
    gradient.addColorStop(0.52, rgba(bottom, 0.9));
    gradient.addColorStop(0.86, rgba(bottom, 0.78));
    gradient.addColorStop(1, rgba(bottom, 0));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, y - bandHeight * 0.08, w, bandHeight * 1.16);
  }

  for (let i = 0; i < 9; i += 1) {
    const x = range(rng, 0, w);
    const y = range(rng, 0, h);
    const r = range(rng, w * 0.08, w * 0.34);
    const color = pick(rng, palette);
    const glow = ctx.createRadialGradient(x, y, 0, x, y, r);
    glow.addColorStop(0, rgba(color, range(rng, 0.2, 0.5)));
    glow.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  const horizon = range(rng, h * 0.35, h * 0.65);
  const line = ctx.createLinearGradient(0, horizon, w, horizon);
  line.addColorStop(0, 'rgba(255,255,255,0)');
  line.addColorStop(0.5, 'rgba(255,255,255,0.22)');
  line.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.strokeStyle = line;
  ctx.lineWidth = range(rng, 1, 2.5);
  ctx.beginPath();
  ctx.moveTo(0, horizon);
  ctx.lineTo(w, horizon);
  ctx.stroke();
}

function drawOrbits(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  rng: Rng,
  palette: string[],
  bg: string,
): void {
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const cx = w * range(rng, 0.4, 0.6);
  const cy = h * range(rng, 0.4, 0.6);
  const drift = w * 0.06;

  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * 0.55);
  core.addColorStop(0, rgba(palette[0], 0.55));
  core.addColorStop(0.35, rgba(palette[1] ?? palette[0], 0.18));
  core.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = core;
  ctx.fillRect(0, 0, w, h);

  const rings = 38;
  for (let i = 0; i < rings; i += 1) {
    const radius = (i / rings) * Math.min(w, h) * 0.78 + 8;
    const ox = Math.sin(i * 0.55 + rng() * 0.4) * drift;
    const oy = Math.cos(i * 0.42) * drift * 0.7;
    const color = pick(rng, palette);
    ctx.beginPath();
    const start = range(rng, -Math.PI, Math.PI);
    const sweep = range(rng, Math.PI * 0.8, Math.PI * 2);
    ctx.arc(cx + ox, cy + oy, radius, start, start + sweep);
    ctx.strokeStyle = rgba(color, range(rng, 0.08, 0.55));
    ctx.lineWidth = range(rng, 0.7, 4.5);
    ctx.stroke();
  }

  for (let i = 0; i < 140; i += 1) {
    const angle = rng() * Math.PI * 2;
    const radius = Math.pow(rng(), 0.6) * Math.min(w, h) * 0.5;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    ctx.beginPath();
    ctx.arc(x, y, range(rng, 0.5, 2.6), 0, Math.PI * 2);
    ctx.fillStyle = rgba(pick(rng, palette), range(rng, 0.25, 0.9));
    ctx.fill();
  }

  ctx.beginPath();
  ctx.arc(cx, cy, Math.min(w, h) * 0.055, 0, Math.PI * 2);
  ctx.fillStyle = rgba(palette[palette.length - 1], 0.92);
  ctx.fill();
}

function drawStrokes(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  rng: Rng,
  palette: string[],
  bg: string,
): void {
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const warm = palette.filter((_, index) => index % 2 === 0);
  const cool = palette.filter((_, index) => index % 2 === 1);

  for (let i = 0; i < 120; i += 1) {
    const fromLeft = rng() > 0.35;
    const x0 = fromLeft ? range(rng, -w * 0.1, w * 0.4) : range(rng, w * 0.6, w * 1.1);
    const y0 = range(rng, 0, h);
    const x1 = range(rng, w * 0.2, w * 1.05);
    const y1 = range(rng, 0, h);
    const cx = range(rng, 0, w);
    const cy = range(rng, 0, h);
    const color = pick(rng, i % 3 === 0 ? warm : cool.length > 0 ? cool : palette);

    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.bezierCurveTo(cx, cy, x1, y1, range(rng, 0, w), range(rng, 0, h));
    ctx.strokeStyle = rgba(color, range(rng, 0.08, 0.42));
    ctx.lineWidth = range(rng, 1.5, 20);
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  for (let i = 0; i < 180; i += 1) {
    ctx.beginPath();
    ctx.arc(range(rng, 0, w), range(rng, 0, h), range(rng, 0.4, 3.4), 0, Math.PI * 2);
    ctx.fillStyle = rgba(pick(rng, palette), range(rng, 0.1, 0.6));
    ctx.fill();
  }

  const wash = ctx.createLinearGradient(0, 0, w, h);
  wash.addColorStop(0, rgba(palette[0], 0.22));
  wash.addColorStop(1, rgba(palette[palette.length - 1], 0.08));
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, w, h);
}

function drawBlocks(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  rng: Rng,
  palette: string[],
  bg: string,
): void {
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const margin = Math.min(w, h) * 0.09;
  const cols = 4 + Math.floor(rng() * 3);
  const rows = 5 + Math.floor(rng() * 3);
  const cellW = (w - margin * 2) / cols;
  const cellH = (h - margin * 2) / rows;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (rng() > 0.62) {
        ctx.fillStyle = rgba(pick(rng, palette), range(rng, 0.75, 1));
        const inset = range(rng, 0, Math.min(cellW, cellH) * 0.12);
        ctx.fillRect(
          margin + col * cellW + inset,
          margin + row * cellH + inset,
          cellW - inset * 2,
          cellH - inset * 2,
        );
      }
    }
  }

  ctx.strokeStyle = 'rgba(20, 18, 16, 0.35)';
  ctx.lineWidth = Math.max(1, w * 0.003);
  const lineCount = 4 + Math.floor(rng() * 4);
  for (let i = 0; i < lineCount; i += 1) {
    const horizontal = rng() > 0.5;
    const pos = range(rng, margin, (horizontal ? h : w) - margin);
    ctx.beginPath();
    if (horizontal) {
      ctx.moveTo(margin, pos);
      ctx.lineTo(w - margin, pos);
    } else {
      ctx.moveTo(pos, margin);
      ctx.lineTo(pos, h - margin);
    }
    ctx.stroke();
  }

  for (let i = 0; i < 4; i += 1) {
    const x = range(rng, margin, w - margin);
    const y = range(rng, margin, h - margin);
    const r = range(rng, Math.min(w, h) * 0.02, Math.min(w, h) * 0.12);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = rgba(pick(rng, palette), 0.9);
    ctx.fill();
  }
}

function drawWaves(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  rng: Rng,
  palette: string[],
  bg: string,
): void {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, bg);
  sky.addColorStop(1, rgba(palette[0], 0.55));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  const sunX = w * range(rng, 0.25, 0.75);
  const sunY = h * range(rng, 0.18, 0.4);
  const sunR = Math.min(w, h) * range(rng, 0.08, 0.18);
  const sun = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR * 2.4);
  sun.addColorStop(0, rgba(palette[2] ?? palette[0], 0.95));
  sun.addColorStop(0.42, rgba(palette[2] ?? palette[0], 0.35));
  sun.addColorStop(1, rgba(palette[2] ?? palette[0], 0));
  ctx.fillStyle = sun;
  ctx.fillRect(sunX - sunR * 2.4, sunY - sunR * 2.4, sunR * 4.8, sunR * 4.8);

  const layers = 20;
  for (let i = 0; i < layers; i += 1) {
    const t = i / (layers - 1);
    const baseY = h * (0.32 + t * 0.68);
    const amplitude = h * range(rng, 0.012, 0.05) * (1 - t * 0.4);
    const phase = rng() * Math.PI * 2;
    const frequency = range(rng, 1.2, 3.4);

    ctx.beginPath();
    ctx.moveTo(0, baseY);
    for (let x = 0; x <= w; x += 8) {
      const y =
        baseY +
        Math.sin((x / w) * Math.PI * frequency * 2 + phase) * amplitude +
        Math.sin((x / w) * Math.PI * frequency * 5 + phase * 0.5) * amplitude * 0.24;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();

    const color = pick(rng, palette);
    const gradient = ctx.createLinearGradient(0, baseY, 0, h);
    gradient.addColorStop(0, rgba(color, range(rng, 0.35, 0.75)));
    gradient.addColorStop(1, rgba(color, 0.06));
    ctx.fillStyle = gradient;
    ctx.fill();
  }

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  const glintY = h * range(rng, 0.45, 0.7);
  for (let x = 0; x <= w; x += 10) {
    const y = glintY + Math.sin((x / w) * Math.PI * 4) * h * 0.03;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function drawSpeckle(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  rng: Rng,
  palette: string[],
  bg: string,
): void {
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  for (let i = 0; i < 7; i += 1) {
    const x = range(rng, 0, w);
    const y = range(rng, 0, h);
    const r = range(rng, w * 0.12, w * 0.42);
    const color = pick(rng, palette);
    const blob = ctx.createRadialGradient(x, y, 0, x, y, r);
    blob.addColorStop(0, rgba(color, range(rng, 0.12, 0.32)));
    blob.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = blob;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  const focusX = w * range(rng, 0.35, 0.65);
  const focusY = h * range(rng, 0.35, 0.65);
  const count = 16000;
  for (let i = 0; i < count; i += 1) {
    const spread = rng() > 0.3 ? 0.55 : 1;
    const x = focusX + (rng() - 0.5) * w * spread + (rng() - 0.5) * w * 0.4;
    const y = focusY + (rng() - 0.5) * h * spread + (rng() - 0.5) * h * 0.4;
    if (x < 0 || x > w || y < 0 || y > h) continue;
    ctx.beginPath();
    ctx.arc(x, y, Math.pow(rng(), 2.2) * 2.8 + 0.4, 0, Math.PI * 2);
    ctx.fillStyle = rgba(pick(rng, palette), range(rng, 0.3, 0.95));
    ctx.fill();
  }
}

export function renderArtwork(spec: ArtworkSpec): HTMLCanvasElement {
  const max = 1024;
  const aspect = spec.width / spec.height;
  const cw = aspect >= 1 ? max : Math.round(max * aspect);
  const ch = aspect >= 1 ? Math.round(max / aspect) : max;

  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d')!;
  const rng = mulberry32(spec.seed);
  const { palette, bg } = spec;

  switch (spec.style) {
    case 'colorfield':
      drawColorField(ctx, cw, ch, rng, palette, bg);
      break;
    case 'orbits':
      drawOrbits(ctx, cw, ch, rng, palette, bg);
      break;
    case 'strokes':
      drawStrokes(ctx, cw, ch, rng, palette, bg);
      break;
    case 'blocks':
      drawBlocks(ctx, cw, ch, rng, palette, bg);
      break;
    case 'waves':
      drawWaves(ctx, cw, ch, rng, palette, bg);
      break;
    case 'speckle':
      drawSpeckle(ctx, cw, ch, rng, palette, bg);
      break;
  }

  finish(ctx, cw, ch);
  return canvas;
}

const specs: Array<Omit<ArtworkSpec, 'artist'>> = [
  {
    id: 'tidal-memory',
    title: 'Tidal Memory',
    year: 2025,
    medium: 'Pigment on linen',
    dimensions: '160 × 210 cm',
    description:
      'A slow study of the shoreline at dusk, built from overlapping washes that never settle into a single horizon. The painting rewards stillness: colour surfaces rise, recede, and return.',
    style: 'waves',
    palette: ['#0d3b45', '#1f6f78', '#a8d5cd', '#e7dcc3', '#c96f4a'],
    bg: '#0b2730',
    seed: 11,
    width: 1.6,
    height: 2.1,
    wall: 'left',
    at: -9,
    frame: 'walnut',
  },
  {
    id: 'field-notes-i',
    title: 'Field Notes I',
    year: 2024,
    medium: 'Acrylic and charcoal on canvas',
    dimensions: '240 × 160 cm',
    description:
      'The first panel of a three-part meditation on walking. Fragments of maps, grasses, and weather notes are pressed into wide bands of ochre and sage.',
    style: 'colorfield',
    palette: ['#b07d3d', '#87937a', '#3f3f36', '#e8e0cd', '#c9b493'],
    bg: '#ddd3bf',
    seed: 12,
    width: 2.4,
    height: 1.6,
    wall: 'left',
    at: -4.5,
    frame: 'black',
  },
  {
    id: 'ember-choir',
    title: 'Ember Choir',
    year: 2026,
    medium: 'Oil on panel',
    dimensions: '130 × 180 cm',
    description:
      'A dense chorus of warm gestures, made in one long sitting. The surface keeps the speed of the hand — each stroke arriving before the last has fully dried.',
    style: 'strokes',
    palette: ['#e4572e', '#f2a341', '#8c2f17', '#f6ddc4', '#3a1810'],
    bg: '#190d09',
    seed: 13,
    width: 1.3,
    height: 1.8,
    wall: 'left',
    at: 0,
    frame: 'brass',
  },
  {
    id: 'quiet-geometry',
    title: 'Quiet Geometry',
    year: 2024,
    medium: 'Acrylic on canvas',
    dimensions: '220 × 150 cm',
    description:
      'An architecture of calm: a handful of forms, repeated with small deviations, until the grid begins to breathe. Painted with a ruler in one hand and a rag in the other.',
    style: 'blocks',
    palette: ['#1f2a36', '#b4552f', '#42546b', '#d8c8a6', '#7a8b7a'],
    bg: '#e9e2d5',
    seed: 14,
    width: 2.2,
    height: 1.5,
    wall: 'left',
    at: 4.5,
    frame: 'black',
  },
  {
    id: 'afterimage',
    title: 'Afterimage',
    year: 2025,
    medium: 'Mixed media on linen',
    dimensions: '170 × 170 cm',
    description:
      'What remains when you close your eyes after looking at something bright. Thousands of coloured marks gather into a field that flickers between figure and atmosphere.',
    style: 'speckle',
    palette: ['#e04b8a', '#37b5c9', '#b7d94b', '#f3ede0', '#7654a8'],
    bg: '#0d0d10',
    seed: 15,
    width: 1.7,
    height: 1.7,
    wall: 'left',
    at: 9,
    frame: 'walnut',
  },
  {
    id: 'violet-hours',
    title: 'Violet Hours',
    year: 2023,
    medium: 'Oil on canvas',
    dimensions: '170 × 220 cm',
    description:
      'The half-hour after sunset, when colour becomes a form of memory. Painted in thin veils so that earlier decisions remain visible beneath the final surface.',
    style: 'colorfield',
    palette: ['#5b3f7a', '#8d5a8c', '#c4869b', '#d7b06a', '#2a1c3d'],
    bg: '#211630',
    seed: 16,
    width: 1.7,
    height: 2.2,
    wall: 'right',
    at: -9,
    frame: 'ivory',
  },
  {
    id: 'salt-and-signal',
    title: 'Salt & Signal',
    year: 2025,
    medium: 'Pigment and wax on panel',
    dimensions: '230 × 150 cm',
    description:
      'A coastal transmission interrupted by weather. Layers of wax hold the salt bloom in place while thin lines of colour carry the message just out of reach.',
    style: 'waves',
    palette: ['#155e63', '#c96f4a', '#f0e6d2', '#2f5da8', '#7fb3a7'],
    bg: '#c4d3cf',
    seed: 17,
    width: 2.3,
    height: 1.5,
    wall: 'right',
    at: -4.5,
    frame: 'brass',
  },
  {
    id: 'nocturne-no-4',
    title: 'Nocturne No. 4',
    year: 2026,
    medium: 'Oil on linen',
    dimensions: '150 × 190 cm',
    description:
      'The fourth in a series of paintings made only at night. Rings of warm light orbit a cool centre, like a streetlamp remembered from a moving car.',
    style: 'orbits',
    palette: ['#d8a24a', '#b45f3c', '#3f6fa8', '#e9e0cc', '#1a2438'],
    bg: '#070a12',
    seed: 18,
    width: 1.5,
    height: 1.9,
    wall: 'right',
    at: 0,
    frame: 'black',
  },
  {
    id: 'slow-sun',
    title: 'Slow Sun',
    year: 2024,
    medium: 'Acrylic on canvas',
    dimensions: '240 × 160 cm',
    description:
      'A horizon held for as long as possible. Warm bands accumulate at the centre of the canvas until the light feels almost physical.',
    style: 'colorfield',
    palette: ['#e8836b', '#f2b279', '#d95f7a', '#f7ead6', '#b24a3f'],
    bg: '#ead8bd',
    seed: 19,
    width: 2.4,
    height: 1.6,
    wall: 'right',
    at: 4.5,
    frame: 'walnut',
  },
  {
    id: 'meridian',
    title: 'Meridian',
    year: 2025,
    medium: 'Mixed media on board',
    dimensions: '160 × 160 cm',
    description:
      'A meeting point rather than a map. Hard edges and brass tones divide the square into territories that refuse to stay separate for long.',
    style: 'blocks',
    palette: ['#2f4a3c', '#a9823f', '#20242a', '#ddd3bd', '#7c8f7c'],
    bg: '#d8d0bf',
    seed: 20,
    width: 1.6,
    height: 1.6,
    wall: 'right',
    at: 9,
    frame: 'ivory',
  },
  {
    id: 'cartography-of-air',
    title: 'Cartography of Air',
    year: 2023,
    medium: 'Ink and gouache on paper',
    dimensions: '200 × 140 cm',
    description:
      'An attempt to chart something with no edges. Ink lines drift across a pale ground, gathering briefly into weather systems before dissolving again.',
    style: 'strokes',
    palette: ['#24313f', '#3d5a80', '#5f8f8a', '#b48a4a', '#e8e1d2'],
    bg: '#e9e3d6',
    seed: 21,
    width: 2,
    height: 1.4,
    wall: 'back',
    at: -4.2,
    frame: 'black',
  },
  {
    id: 'chromatic-drift',
    title: 'Chromatic Drift',
    year: 2026,
    medium: 'Oil and pigment on linen',
    dimensions: '220 × 280 cm',
    description:
      'The centre of the exhibition and the last painting completed for it. Colour is treated as a tide: amber and crimson push against deep teal, leaving a luminous seam where they meet.',
    style: 'colorfield',
    palette: ['#c8833f', '#9e2f2f', '#1f5b5e', '#e8ddc8', '#5a2a35'],
    bg: '#14100e',
    seed: 22,
    width: 2.2,
    height: 2.8,
    wall: 'back',
    at: 0,
    frame: 'brass',
  },
  {
    id: 'the-long-note',
    title: 'The Long Note',
    year: 2024,
    medium: 'Acrylic on canvas',
    dimensions: '200 × 140 cm',
    description:
      'A single tone extended until it becomes a landscape. Jade and gold bands overlap in slow intervals, holding the eye at the point of almost-resolution.',
    style: 'waves',
    palette: ['#2e6f5e', '#c9a45c', '#d16f57', '#c7d6cb', '#0e2a26'],
    bg: '#0b1d1a',
    seed: 23,
    width: 2,
    height: 1.4,
    wall: 'back',
    at: 4.2,
    frame: 'walnut',
  },
];

export const defaultArtworks: ArtworkSpec[] = specs.map((spec) => ({
  ...spec,
  artist: 'Mara Voss',
}));
