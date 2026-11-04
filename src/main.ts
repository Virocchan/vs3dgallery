import './style.css';
import { Gallery } from './gallery';
import { renderArtwork, type ArtworkSpec } from './artworks';
import { loadExhibition, saveExhibition, type Exhibition } from './store';
import { Editor, countLabel } from './editor';

function query<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}

const canvas = query<HTMLCanvasElement>('#scene');
const minimap = query<HTMLCanvasElement>('#minimap');
const start = query<HTMLElement>('#start');
const enterButton = query<HTMLButtonElement>('#enter-btn');
const enterLabel = query<HTMLElement>('#enter-label');
const hud = query<HTMLElement>('#hud');
const hint = query<HTMLElement>('#hud-hint');
const minimapWrap = query<HTMLElement>('#minimap-wrap');
const toast = query<HTMLElement>('#toast');
const tooltip = query<HTMLElement>('#tooltip');
const tooltipTitle = query<HTMLElement>('#tooltip-title');
const tooltipArtist = query<HTMLElement>('#tooltip-artist');

const panel = query<HTMLElement>('#panel');
const panelClose = query<HTMLButtonElement>('#panel-close');
const panelImage = query<HTMLImageElement>('#panel-image');
const panelIndex = query<HTMLElement>('#panel-index');
const panelTitle = query<HTMLElement>('#panel-title');
const panelArtist = query<HTMLElement>('#panel-artist');
const panelYear = query<HTMLElement>('#panel-year');
const panelMedium = query<HTMLElement>('#panel-medium');
const panelDims = query<HTMLElement>('#panel-dims');
const panelDesc = query<HTMLElement>('#panel-desc');
const prevButton = query<HTMLButtonElement>('#prev-btn');
const nextButton = query<HTMLButtonElement>('#next-btn');

const help = query<HTMLElement>('#help');
const helpButton = query<HTMLButtonElement>('#help-btn');
const helpClose = query<HTMLButtonElement>('#help-close');
const helpEyebrow = query<HTMLElement>('#help-eyebrow');
const helpTitle = query<HTMLElement>('#help-title');
const helpLede = query<HTMLElement>('#help-lede');
const fullscreenButton = query<HTMLButtonElement>('#fs-btn');
const joystick = query<HTMLElement>('#joystick');
const stick = query<HTMLElement>('#stick');

const hudTitle = query<HTMLElement>('#hud-title');
const hudMeta = query<HTMLElement>('#hud-meta');
const startMeta = query<HTMLElement>('#start-meta');
const startTitleMain = query<HTMLElement>('#start-title-main');
const startTitleAccent = query<HTMLElement>('#start-title-accent');
const startTitleBreak = query<HTMLElement>('#start-title-break');
const startArtist = query<HTMLElement>('#start-artist');
const startIntro = query<HTMLElement>('#start-intro');
const startYear = query<HTMLElement>('#start-year');
const startWorks = query<HTMLElement>('#start-works');
const startEdit = query<HTMLButtonElement>('#start-edit');
const editButton = query<HTMLButtonElement>('#edit-btn');

let exhibition: Exhibition = loadExhibition();
let gallery: Gallery | null = null;
let entered = false;
let panelOpen = false;
let helpOpen = false;
let currentIndex = 0;
let toastTimer: number | undefined;
const imageCache = new Map<string, string>();

function artworkImage(art: ArtworkSpec): string {
  if (art.image) return art.image;
  const key = `${art.id}:${art.width.toFixed(2)}:${art.height.toFixed(2)}`;
  const cached = imageCache.get(key);
  if (cached) return cached;
  const url = renderArtwork(art).toDataURL('image/jpeg', 0.92);
  imageCache.set(key, url);
  return url;
}

function applyChrome(next: Exhibition): void {
  const settings = next.settings;
  const title = settings.title.trim() || 'Untitled exhibition';
  const artist = settings.artist.trim() || 'Unknown artist';
  const hall = settings.hall.trim() || 'Hall';

  hudTitle.textContent = title;
  hudMeta.textContent = `${artist} · ${hall}`;
  startMeta.textContent = `Virtual Gallery · ${hall}`;
  startArtist.textContent = artist;
  startYear.textContent = settings.year;
  startWorks.textContent = countLabel(next.artworks.length);
  helpEyebrow.textContent = `SuVi Virtual Gallery · ${hall}`;
  helpTitle.textContent = title;
  helpLede.textContent = settings.intro;

  const words = title.split(/\s+/);
  if (words.length > 1) {
    startTitleMain.textContent = words.slice(0, -1).join(' ');
    startTitleAccent.textContent = words[words.length - 1];
    startTitleAccent.hidden = false;
    startTitleBreak.hidden = false;
  } else {
    startTitleMain.textContent = title;
    startTitleAccent.textContent = '';
    startTitleAccent.hidden = true;
    startTitleBreak.hidden = true;
  }

  startIntro.textContent = settings.intro;
  startIntro.hidden = settings.intro.trim().length === 0;
  helpLede.hidden = settings.intro.trim().length === 0;

  document.title = `${title} — SuVi Virtual Gallery`;
  const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (description) {
    description.content = `${title}, a virtual exhibition by ${artist}. Walk through the gallery, look closely, and stay a while.`;
  }
}

function showTooltip(art: ArtworkSpec, x: number, y: number): void {
  tooltipTitle.textContent = art.title;
  tooltipArtist.textContent = art.artist || exhibition.settings.artist;
  tooltip.classList.add('is-visible');

  const width = tooltip.offsetWidth;
  const height = tooltip.offsetHeight;
  let left = x + 20;
  let top = y + 20;

  if (left + width > window.innerWidth - 16) left = x - width - 20;
  if (top + height > window.innerHeight - 16) top = y - height - 20;

  tooltip.style.transform = `translate3d(${Math.max(12, left)}px, ${Math.max(12, top)}px, 0)`;
}

function hideTooltip(): void {
  tooltip.classList.remove('is-visible');
}

function showToast(message: string, duration = 4200): void {
  toast.textContent = message;
  toast.classList.add('is-visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.classList.remove('is-visible');
  }, duration);
}

function updatePanel(art: ArtworkSpec): void {
  currentIndex = exhibition.artworks.findIndex((item) => item.id === art.id);
  const humanIndex = String(currentIndex + 1).padStart(2, '0');
  const total = String(exhibition.artworks.length).padStart(2, '0');

  panelImage.src = artworkImage(art);
  panelImage.alt = `${art.title}, ${art.medium} by ${art.artist}`;
  panelIndex.textContent = `${humanIndex} / ${total}`;
  panelTitle.textContent = art.title;
  panelArtist.textContent = art.artist;
  panelYear.textContent = String(art.year);
  panelMedium.textContent = art.medium;
  panelDims.textContent = art.dimensions;
  panelDesc.textContent = art.description;
}

function openArtwork(art: ArtworkSpec): void {
  if (!gallery) return;
  updatePanel(art);
  panelOpen = true;
  panel.classList.add('is-open');
  panel.setAttribute('aria-hidden', 'false');
  hideTooltip();
  gallery.focus(art.id);
  gallery.disable();
}

function closePanel(): void {
  if (!panelOpen) return;
  panelOpen = false;
  panel.classList.remove('is-open');
  panel.setAttribute('aria-hidden', 'true');
  gallery?.unfocus();
  if (entered && !helpOpen) gallery?.enable();
}

function switchArtwork(offset: number): void {
  const total = exhibition.artworks.length;
  if (total === 0) return;
  const next = (currentIndex + offset + total) % total;
  openArtwork(exhibition.artworks[next]);
}

function setHelp(open: boolean): void {
  helpOpen = open;
  help.classList.toggle('is-open', open);
  help.setAttribute('aria-hidden', String(!open));
  if (open) {
    gallery?.disable();
  } else if (entered && !panelOpen) {
    gallery?.enable();
  }
}

function openEditor(): void {
  if (editor.isOpen()) return;
  if (helpOpen) setHelp(false);
  if (panelOpen) closePanel();
  hideTooltip();
  document.body.classList.add('editor-open');
  gallery?.disable();
  editor.open();
}

const editor = new Editor({
  getExhibition: () => exhibition,
  getPreview: artworkImage,
  onApply: (next) => {
    exhibition = next;
    imageCache.clear();
    applyChrome(exhibition);
    try {
      saveExhibition(exhibition);
      showToast('Exhibition saved in this browser.');
    } catch (error) {
      console.error(error);
      showToast(
        'Changes applied, but this browser is out of storage. Export a JSON backup from curator mode.',
        7000,
      );
    }
    gallery?.setExhibition(exhibition);
  },
  onClose: () => {
    document.body.classList.remove('editor-open');
    if (entered && !panelOpen && !helpOpen) gallery?.enable();
  },
});

function enterGallery(): void {
  if (!gallery || entered) return;
  entered = true;
  start.classList.add('is-hidden');
  start.setAttribute('aria-hidden', 'true');
  hud.classList.remove('hidden');
  hud.setAttribute('aria-hidden', 'false');
  hint.classList.remove('hidden');
  hint.setAttribute('aria-hidden', 'false');
  minimapWrap.classList.remove('hidden');
  minimapWrap.setAttribute('aria-hidden', 'false');
  gallery.enable();
  window.setTimeout(() => {
    start.style.display = 'none';
  }, 1100);
  showToast('Drag to look around · walk with WASD');
}

function toggleFullscreen(): void {
  if (document.fullscreenElement) {
    void document.exitFullscreen();
  } else {
    void document.documentElement.requestFullscreen().catch(() => undefined);
  }
}

function setupJoystick(): void {
  const radius = 56;
  let activePointer: number | null = null;

  const update = (event: PointerEvent): void => {
    const rect = joystick.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    let dx = event.clientX - centerX;
    let dy = event.clientY - centerY;
    const distance = Math.hypot(dx, dy);
    if (distance > radius) {
      dx = (dx / distance) * radius;
      dy = (dy / distance) * radius;
    }
    stick.style.transform = `translate(${dx}px, ${dy}px)`;
    gallery?.setMoveInput(dx / radius, -dy / radius);
  };

  joystick.addEventListener('pointerdown', (event) => {
    activePointer = event.pointerId;
    joystick.setPointerCapture(event.pointerId);
    joystick.classList.add('is-active');
    update(event);
    event.preventDefault();
    event.stopPropagation();
  });

  joystick.addEventListener('pointermove', (event) => {
    if (event.pointerId !== activePointer) return;
    update(event);
    event.preventDefault();
    event.stopPropagation();
  });

  const release = (event: PointerEvent): void => {
    if (event.pointerId !== activePointer) return;
    activePointer = null;
    joystick.classList.remove('is-active');
    stick.style.transform = 'translate(0, 0)';
    gallery?.setMoveInput(0, 0);
    event.stopPropagation();
  };

  joystick.addEventListener('pointerup', release);
  joystick.addEventListener('pointercancel', release);
}

applyChrome(exhibition);

enterButton.addEventListener('click', enterGallery);
panelClose.addEventListener('click', closePanel);
prevButton.addEventListener('click', () => switchArtwork(-1));
nextButton.addEventListener('click', () => switchArtwork(1));
helpButton.addEventListener('click', () => setHelp(true));
helpClose.addEventListener('click', () => setHelp(false));
help.addEventListener('click', (event) => {
  if (event.target === help) setHelp(false);
});
fullscreenButton.addEventListener('click', toggleFullscreen);
startEdit.addEventListener('click', openEditor);
editButton.addEventListener('click', openEditor);

window.addEventListener('keydown', (event) => {
  if (editor.isOpen()) {
    if (event.key === 'Escape') {
      event.preventDefault();
      editor.applyAndClose();
    }
    return;
  }
  if (event.key === 'Escape') {
    if (helpOpen) {
      setHelp(false);
    } else if (panelOpen) {
      closePanel();
    }
    return;
  }
  if (!entered) return;
  if (event.key === 'h' || event.key === 'H') {
    if (!panelOpen) setHelp(!helpOpen);
  }
  if (event.key === 'f' || event.key === 'F') {
    toggleFullscreen();
  }
  if (event.key === 'e' || event.key === 'E') {
    if (!panelOpen) openEditor();
  }
});

canvas.addEventListener('contextmenu', (event) => event.preventDefault());

const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
if (coarsePointer) {
  const startHint = document.querySelector<HTMLElement>('.start-hint');
  if (startHint) startHint.textContent = 'Drag to look · joystick to walk · tap a work';
}

setupJoystick();

async function boot(): Promise<void> {
  await Promise.race([
    document.fonts.ready,
    new Promise((resolve) => window.setTimeout(resolve, 2600)),
  ]);

  try {
    gallery = new Gallery({
      canvas,
      minimap,
      exhibition,
      onHover: (art, x, y) => {
        if (!art) {
          hideTooltip();
          return;
        }
        showTooltip(art, x, y);
      },
      onSelect: (art) => openArtwork(art),
    });
    enterLabel.textContent = 'Enter exhibition';
    enterButton.disabled = false;
    enterButton.focus({ preventScroll: true });
  } catch (error) {
    console.error(error);
    enterLabel.textContent = 'This browser could not start WebGL';
    enterButton.disabled = true;
  }
}

void boot();
