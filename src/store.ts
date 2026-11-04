import {
  defaultArtworks,
  type ArtworkSpec,
  type ArtStyle,
  type FrameStyle,
  type Wall,
} from './artworks';

export interface ExhibitionSettings {
  title: string;
  artist: string;
  hall: string;
  year: string;
  intro: string;
}

export interface Exhibition {
  version: 1;
  settings: ExhibitionSettings;
  artworks: ArtworkSpec[];
}

const STORAGE_KEY = 'lumen.exhibition.v1';

export const DEFAULT_SETTINGS: ExhibitionSettings = {
  title: 'Chromatic Drift',
  artist: 'Mara Voss',
  hall: 'Hall 01',
  year: '2026',
  intro:
    'Thirteen paintings about light, weather, and the places colour goes when you look away. Walk the hall, look closely, stay a while.',
};

const STYLES: ArtStyle[] = ['colorfield', 'orbits', 'strokes', 'blocks', 'waves', 'speckle'];
const FRAMES: FrameStyle[] = ['walnut', 'black', 'brass', 'ivory'];
const WALLS: Wall[] = ['left', 'right', 'back'];

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function safeImage(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  if (value.startsWith('data:image/')) return value;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  if (value.startsWith('./')) return value;
  if (value.startsWith('https://')) return value;
  return undefined;
}

function normalizeArtwork(raw: unknown, index: number): ArtworkSpec | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const fallback = defaultArtworks[index % defaultArtworks.length];
  const palette =
    Array.isArray(record.palette) && record.palette.every((c) => typeof c === 'string')
      ? (record.palette as string[]).slice(0, 8)
      : [...fallback.palette];

  return {
    id: asString(record.id, `artwork-${index + 1}`),
    title: asString(record.title, fallback.title).trim() || 'Untitled',
    artist: asString(record.artist, DEFAULT_SETTINGS.artist).trim() || DEFAULT_SETTINGS.artist,
    year: Math.round(clamp(asNumber(record.year, fallback.year), 1000, 2100)),
    medium: asString(record.medium, fallback.medium),
    dimensions: asString(record.dimensions, fallback.dimensions),
    description: asString(record.description, fallback.description),
    style: STYLES.includes(record.style as ArtStyle) ? (record.style as ArtStyle) : fallback.style,
    palette,
    bg: asString(record.bg, fallback.bg),
    seed: Math.floor(asNumber(record.seed, fallback.seed)),
    width: clamp(asNumber(record.width, fallback.width), 0.5, 4),
    height: clamp(asNumber(record.height, fallback.height), 0.5, 3.6),
    wall: WALLS.includes(record.wall as Wall) ? (record.wall as Wall) : fallback.wall,
    at: clamp(asNumber(record.at, fallback.at), -13, 13),
    frame: FRAMES.includes(record.frame as FrameStyle)
      ? (record.frame as FrameStyle)
      : fallback.frame,
    image: safeImage(record.image),
  };
}

export function normalizeExhibition(value: unknown): Exhibition {
  const fallback = createDefaultExhibition();
  if (!value || typeof value !== 'object') return fallback;

  const raw = value as Record<string, unknown>;
  const rawSettings =
    raw.settings && typeof raw.settings === 'object'
      ? (raw.settings as Record<string, unknown>)
      : {};

  const settings: ExhibitionSettings = {
    title: asString(rawSettings.title, DEFAULT_SETTINGS.title).trim() || DEFAULT_SETTINGS.title,
    artist:
      asString(rawSettings.artist, DEFAULT_SETTINGS.artist).trim() || DEFAULT_SETTINGS.artist,
    hall: asString(rawSettings.hall, DEFAULT_SETTINGS.hall),
    year: asString(rawSettings.year, DEFAULT_SETTINGS.year),
    intro: asString(rawSettings.intro, DEFAULT_SETTINGS.intro),
  };

  const rawArtworks = Array.isArray(raw.artworks) ? raw.artworks : [];
  const normalized = rawArtworks
    .map((item, index) => normalizeArtwork(item, index))
    .filter((item): item is ArtworkSpec => item !== null);

  const seen = new Set<string>();
  const artworks: ArtworkSpec[] = [];
  for (const art of normalized.length > 0 ? normalized : fallback.artworks) {
    let id = art.id;
    let suffix = 2;
    while (seen.has(id)) {
      id = `${art.id}-${suffix}`;
      suffix += 1;
    }
    seen.add(id);
    artworks.push({ ...art, id });
  }

  return { version: 1, settings, artworks };
}

export function createDefaultExhibition(): Exhibition {
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS },
    artworks: defaultArtworks.map((art) => ({ ...art, palette: [...art.palette] })),
  };
}

export function cloneExhibition(exhibition: Exhibition): Exhibition {
  return JSON.parse(JSON.stringify(exhibition)) as Exhibition;
}

export function loadExhibition(): Exhibition {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultExhibition();
    return normalizeExhibition(JSON.parse(raw));
  } catch {
    return createDefaultExhibition();
  }
}

export function saveExhibition(exhibition: Exhibition): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(exhibition));
}

export function resetStoredExhibition(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}

export function parseExhibitionFile(text: string): Exhibition {
  return normalizeExhibition(JSON.parse(text));
}

export function totalImageBytes(exhibition: Exhibition): number {
  return exhibition.artworks.reduce(
    (sum, art) => sum + (art.image ? Math.round((art.image.length * 3) / 4) : 0),
    0,
  );
}
