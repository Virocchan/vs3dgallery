import type { ArtworkSpec, FrameStyle, Wall } from './artworks';
import {
  cloneExhibition,
  createDefaultExhibition,
  parseExhibitionFile,
  type Exhibition,
} from './store';

interface EditorOptions {
  getExhibition: () => Exhibition;
  getPreview: (art: ArtworkSpec) => string;
  onApply: (exhibition: Exhibition) => void;
  onClose: () => void;
}

type Selection = 'exhibition' | string;

interface PreparedImage {
  dataUrl: string;
  width: number;
  height: number;
  bytes: number;
}

const FRAMES: FrameStyle[] = ['walnut', 'black', 'brass', 'ivory'];
const COUNT_WORDS = [
  'Zero',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
  'Twenty',
];

function query<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element: #${id}`);
  return element as T;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not decode image'));
    };
    image.src = url;
  });
}

async function prepareImage(file: File): Promise<PreparedImage> {
  const image = await loadImage(file);
  const maxEdge = 1600;
  const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas unavailable');
  context.fillStyle = '#0e0c0a';
  context.fillRect(0, 0, width, height);
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, width, height);

  const dataUrl = canvas.toDataURL('image/jpeg', 0.86);
  return {
    dataUrl,
    width: image.naturalWidth,
    height: image.naturalHeight,
    bytes: Math.round((dataUrl.length * 3) / 4),
  };
}

export class Editor {
  private readonly options: EditorOptions;
  private readonly root = query<HTMLElement>('editor');
  private readonly shell = this.root.querySelector<HTMLElement>('.editor-shell')!;
  private readonly works = query<HTMLElement>('editor-works');
  private readonly count = query<HTMLElement>('editor-count');
  private readonly addButton = query<HTMLButtonElement>('editor-add');
  private readonly closeButton = query<HTMLButtonElement>('editor-close');
  private readonly applyButton = query<HTMLButtonElement>('editor-apply');
  private readonly exportButton = query<HTMLButtonElement>('editor-export');
  private readonly importButton = query<HTMLButtonElement>('editor-import');
  private readonly importFile = query<HTMLInputElement>('editor-import-file');
  private readonly resetButton = query<HTMLButtonElement>('editor-reset');

  private readonly exhibitionForm = query<HTMLElement>('editor-exhibition-form');
  private readonly artworkForm = query<HTMLElement>('editor-artwork-form');
  private readonly exTitle = query<HTMLInputElement>('ex-title');
  private readonly exArtist = query<HTMLInputElement>('ex-artist');
  private readonly exHall = query<HTMLInputElement>('ex-hall');
  private readonly exYear = query<HTMLInputElement>('ex-year');
  private readonly exIntro = query<HTMLTextAreaElement>('ex-intro');

  private readonly drop = query<HTMLElement>('editor-drop');
  private readonly image = query<HTMLImageElement>('editor-image');
  private readonly imageMeta = query<HTMLElement>('editor-image-meta');
  private readonly fileInput = query<HTMLInputElement>('editor-file');
  private readonly replaceButton = query<HTMLButtonElement>('editor-replace');
  private readonly removeImageButton = query<HTMLButtonElement>('editor-remove-image');

  private readonly titleInput = query<HTMLInputElement>('f-title');
  private readonly artistInput = query<HTMLInputElement>('f-artist');
  private readonly yearInput = query<HTMLInputElement>('f-year');
  private readonly mediumInput = query<HTMLInputElement>('f-medium');
  private readonly dimensionsInput = query<HTMLInputElement>('f-dimensions');
  private readonly descriptionInput = query<HTMLTextAreaElement>('f-description');
  private readonly wallSelect = query<HTMLSelectElement>('f-wall');
  private readonly atInput = query<HTMLInputElement>('f-at');
  private readonly atLabel = query<HTMLElement>('editor-at-label');
  private readonly widthInput = query<HTMLInputElement>('f-width');
  private readonly heightInput = query<HTMLInputElement>('f-height');
  private readonly frameSelect = query<HTMLSelectElement>('f-frame');
  private readonly deleteButton = query<HTMLButtonElement>('editor-delete');
  private readonly status = query<HTMLElement>('editor-status');

  private exhibition: Exhibition = createDefaultExhibition();
  private selection: Selection = 'exhibition';
  private opened = false;
  private busy = false;

  constructor(options: EditorOptions) {
    this.options = options;
    this.root.tabIndex = -1;
    this.bind();
  }

  isOpen(): boolean {
    return this.opened;
  }

  open(): void {
    if (this.opened) return;
    this.opened = true;
    this.exhibition = cloneExhibition(this.options.getExhibition());
    this.selection = this.exhibition.artworks[0]?.id ?? 'exhibition';
    this.ensureSelection();
    this.render();
    this.setStatus('Changes are saved in this browser when you press Done.');
    this.root.classList.add('is-open');
    this.root.setAttribute('aria-hidden', 'false');
    window.setTimeout(() => {
      this.root.focus({ preventScroll: true });
      const selected = this.works.querySelector<HTMLButtonElement>('.editor-work.is-selected');
      selected?.focus({ preventScroll: true });
    }, 40);
  }

  applyAndClose(): void {
    if (!this.opened || this.busy) return;
    this.options.onApply(cloneExhibition(this.exhibition));
    this.hide();
  }

  private hide(): void {
    if (!this.opened) return;
    this.opened = false;
    this.root.classList.remove('is-open');
    this.root.setAttribute('aria-hidden', 'true');
    this.options.onClose();
  }

  private bind(): void {
    this.addButton.addEventListener('click', () => this.addArtwork());
    this.closeButton.addEventListener('click', () => this.applyAndClose());
    this.applyButton.addEventListener('click', () => this.applyAndClose());
    this.exportButton.addEventListener('click', () => this.exportJson());
    this.importButton.addEventListener('click', () => this.importFile.click());
    this.resetButton.addEventListener('click', () => this.resetExhibition());
    this.deleteButton.addEventListener('click', () => this.deleteArtwork());

    this.importFile.addEventListener('change', () => {
      const file = this.importFile.files?.[0];
      this.importFile.value = '';
      if (file) void this.importJson(file);
    });

    this.exTitle.addEventListener('input', () => {
      this.exhibition.settings.title = this.exTitle.value;
      this.setStatus('Exhibition title updated.');
    });
    this.exArtist.addEventListener('input', () => {
      this.exhibition.settings.artist = this.exArtist.value;
      this.setStatus('Exhibition artist updated.');
    });
    this.exHall.addEventListener('input', () => {
      this.exhibition.settings.hall = this.exHall.value;
      this.setStatus('Hall updated.');
    });
    this.exYear.addEventListener('input', () => {
      this.exhibition.settings.year = this.exYear.value;
      this.setStatus('Year updated.');
    });
    this.exIntro.addEventListener('input', () => {
      this.exhibition.settings.intro = this.exIntro.value;
      this.setStatus('Introduction updated.');
    });

    this.titleInput.addEventListener('input', () => {
      this.patchArtwork({ title: this.titleInput.value });
      this.renderList();
      this.setStatus('Artwork title updated.');
    });
    this.artistInput.addEventListener('input', () => {
      this.patchArtwork({ artist: this.artistInput.value });
      this.renderList();
      this.setStatus('Artwork artist updated.');
    });
    this.yearInput.addEventListener('input', () => {
      const value = Number.parseInt(this.yearInput.value, 10);
      if (!Number.isFinite(value)) return;
      this.patchArtwork({ year: clamp(Math.round(value), 1000, 2100) });
      this.renderList();
      this.setStatus('Artwork year updated.');
    });
    this.mediumInput.addEventListener('input', () => {
      this.patchArtwork({ medium: this.mediumInput.value });
      this.setStatus('Medium updated.');
    });
    this.dimensionsInput.addEventListener('input', () => {
      this.patchArtwork({ dimensions: this.dimensionsInput.value });
      this.setStatus('Dimensions updated.');
    });
    this.descriptionInput.addEventListener('input', () => {
      this.patchArtwork({ description: this.descriptionInput.value });
      this.setStatus('Description updated.');
    });
    this.wallSelect.addEventListener('change', () => {
      const wall = this.wallSelect.value as Wall;
      this.patchArtwork({ wall });
      this.syncPlacementLimits();
      this.setStatus('Wall updated.');
    });
    this.atInput.addEventListener('input', () => {
      const value = Number.parseFloat(this.atInput.value);
      if (!Number.isFinite(value)) return;
      const art = this.currentArtwork();
      if (!art) return;
      const limit = art.wall === 'back' ? 7.6 : 12.4;
      this.patchArtwork({ at: round2(clamp(value, -limit, limit)) });
      this.setStatus('Position updated.');
    });
    this.widthInput.addEventListener('input', () => {
      const value = Number.parseFloat(this.widthInput.value);
      if (!Number.isFinite(value)) return;
      this.patchArtwork({ width: round2(clamp(value, 0.5, 4)) });
      this.setStatus('Width updated.');
    });
    this.heightInput.addEventListener('input', () => {
      const value = Number.parseFloat(this.heightInput.value);
      if (!Number.isFinite(value)) return;
      this.patchArtwork({ height: round2(clamp(value, 0.5, 3.6)) });
      this.setStatus('Height updated.');
    });
    this.frameSelect.addEventListener('change', () => {
      const frame = this.frameSelect.value as FrameStyle;
      this.patchArtwork({ frame: FRAMES.includes(frame) ? frame : 'walnut' });
      this.setStatus('Frame updated.');
    });

    this.drop.addEventListener('click', () => this.fileInput.click());
    this.drop.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this.fileInput.click();
      }
    });
    this.replaceButton.addEventListener('click', () => this.fileInput.click());
    this.removeImageButton.addEventListener('click', () => this.removeImage());
    this.fileInput.addEventListener('change', () => {
      const file = this.fileInput.files?.[0];
      this.fileInput.value = '';
      if (file) void this.handleImage(file);
    });

    this.drop.addEventListener('dragover', (event) => {
      event.preventDefault();
      this.drop.classList.add('is-dragging');
    });
    this.drop.addEventListener('dragleave', () => {
      this.drop.classList.remove('is-dragging');
    });
    this.drop.addEventListener('drop', (event) => {
      event.preventDefault();
      this.drop.classList.remove('is-dragging');
      const file = event.dataTransfer?.files[0];
      if (file) void this.handleImage(file);
    });

    this.shell.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      this.applyAndClose();
    });
  }

  private render(): void {
    this.renderList();
    this.renderForm();
  }

  private renderList(): void {
    this.works.replaceChildren();
    this.count.textContent = String(this.exhibition.artworks.length);
    const fragment = document.createDocumentFragment();

    const exhibitionButton = document.createElement('button');
    exhibitionButton.type = 'button';
    exhibitionButton.className = 'editor-work editor-work-exhibition';
    exhibitionButton.classList.toggle('is-selected', this.selection === 'exhibition');
    exhibitionButton.addEventListener('click', () => this.select('exhibition'));

    const exhibitionThumb = document.createElement('span');
    exhibitionThumb.className = 'editor-thumb editor-thumb-exhibition';
    exhibitionThumb.textContent = 'ALL';
    const exhibitionText = document.createElement('span');
    exhibitionText.className = 'editor-work-text';
    const exhibitionTitle = document.createElement('strong');
    exhibitionTitle.textContent = 'Exhibition details';
    const exhibitionMeta = document.createElement('span');
    exhibitionMeta.textContent = `${this.exhibition.settings.title || 'Untitled'} · ${this.exhibition.artworks.length} works`;
    exhibitionText.append(exhibitionTitle, exhibitionMeta);
    exhibitionButton.append(exhibitionThumb, exhibitionText);
    fragment.append(exhibitionButton);

    this.exhibition.artworks.forEach((art, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'editor-work';
      button.classList.toggle('is-selected', this.selection === art.id);
      button.addEventListener('click', () => this.select(art.id));

      const thumb = document.createElement('span');
      thumb.className = 'editor-thumb';
      const image = document.createElement('img');
      image.src = this.imageFor(art);
      image.alt = '';
      image.loading = 'lazy';
      thumb.append(image);

      const text = document.createElement('span');
      text.className = 'editor-work-text';
      const artTitle = document.createElement('strong');
      artTitle.textContent = art.title.trim() || 'Untitled';
      const meta = document.createElement('span');
      meta.textContent = `${String(index + 1).padStart(2, '0')} · ${art.artist || 'Unknown'} · ${art.year}`;
      text.append(artTitle, meta);

      button.append(thumb, text);
      fragment.append(button);
    });

    this.works.append(fragment);
  }

  private renderForm(): void {
    const art = this.currentArtwork();
    const showExhibition = this.selection === 'exhibition';
    this.exhibitionForm.hidden = !showExhibition;
    this.artworkForm.hidden = showExhibition;

    if (showExhibition) {
      const settings = this.exhibition.settings;
      this.exTitle.value = settings.title;
      this.exArtist.value = settings.artist;
      this.exHall.value = settings.hall;
      this.exYear.value = settings.year;
      this.exIntro.value = settings.intro;
      return;
    }

    if (!art) return;

    this.titleInput.value = art.title;
    this.artistInput.value = art.artist;
    this.yearInput.value = String(art.year);
    this.mediumInput.value = art.medium;
    this.dimensionsInput.value = art.dimensions;
    this.descriptionInput.value = art.description;
    this.wallSelect.value = art.wall;
    this.atInput.value = String(art.at);
    this.widthInput.value = String(art.width);
    this.heightInput.value = String(art.height);
    this.frameSelect.value = art.frame;
    this.syncPlacementLimits();

    this.image.src = this.imageFor(art);
    this.image.alt = art.title ? `${art.title} preview` : 'Artwork preview';
    this.drop.classList.toggle('has-image', Boolean(art.image));
    this.removeImageButton.disabled = !art.image;
    this.deleteButton.disabled = this.exhibition.artworks.length <= 1;
    this.imageMeta.textContent = art.image
      ? `Uploaded photograph · ${formatBytes(Math.round((art.image.length * 3) / 4))}`
      : `Generated artwork · ${art.width.toFixed(2)} × ${art.height.toFixed(2)} m`;
  }

  private syncPlacementLimits(): void {
    const art = this.currentArtwork();
    if (!art) return;
    const limit = art.wall === 'back' ? 7.6 : 12.4;
    this.atInput.min = String(-limit);
    this.atInput.max = String(limit);
    this.atLabel.textContent =
      art.wall === 'back' ? 'Position along back wall (m)' : 'Position along side wall (m)';
  }

  private select(selection: Selection): void {
    if (this.selection === selection) return;
    this.selection = selection;
    this.render();
    this.setStatus('Select a work or edit the exhibition details.');
  }

  private ensureSelection(): void {
    if (this.selection === 'exhibition') return;
    if (!this.exhibition.artworks.some((art) => art.id === this.selection)) {
      this.selection = this.exhibition.artworks[0]?.id ?? 'exhibition';
    }
  }

  private currentArtwork(): ArtworkSpec | null {
    if (this.selection === 'exhibition') return null;
    return this.exhibition.artworks.find((art) => art.id === this.selection) ?? null;
  }

  private patchArtwork(patch: Partial<ArtworkSpec>): void {
    const art = this.currentArtwork();
    if (!art) return;
    Object.assign(art, patch);
  }

  private imageFor(art: ArtworkSpec): string {
    return art.image ?? this.options.getPreview(art);
  }

  private setStatus(message: string): void {
    this.status.textContent = message;
  }

  private addArtwork(): void {
    const counts: Record<Wall, number> = { left: 0, right: 0, back: 0 };
    for (const art of this.exhibition.artworks) counts[art.wall] += 1;
    const wall = (Object.keys(counts) as Wall[]).reduce((best, candidate) =>
      counts[candidate] < counts[best] ? candidate : best,
    );
    const limit = wall === 'back' ? 7.6 : 12.4;
    const positions = this.exhibition.artworks
      .filter((art) => art.wall === wall)
      .map((art) => art.at);
    let at = positions.length > 0 ? Math.max(...positions) + 2.4 : 0;
    if (at > limit) at = Math.min(...positions) - 2.4;
    at = clamp(at, -limit, limit);

    const template = this.exhibition.artworks[this.exhibition.artworks.length - 1];
    const art: ArtworkSpec = {
      id: `artwork-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      title: 'Untitled artwork',
      artist: this.exhibition.settings.artist,
      year: new Date().getFullYear(),
      medium: 'Mixed media',
      dimensions: '—',
      description: '',
      style: template?.style ?? 'colorfield',
      palette: template ? [...template.palette] : ['#c9a45c', '#3b6b5a', '#b65f4a', '#e8ddc8'],
      bg: template?.bg ?? '#14100e',
      seed: Math.floor(Math.random() * 100_000),
      width: 1.4,
      height: 1.8,
      wall,
      at,
      frame: template?.frame ?? 'walnut',
    };

    this.exhibition.artworks.push(art);
    this.selection = art.id;
    this.render();
    this.titleInput.focus();
    this.titleInput.select();
    this.setStatus('Artwork added — adjust its wall and position, then press Done.');
  }

  private deleteArtwork(): void {
    const art = this.currentArtwork();
    if (!art) return;
    if (this.exhibition.artworks.length <= 1) {
      this.setStatus('The exhibition must keep at least one work.');
      return;
    }
    if (!window.confirm(`Delete “${art.title || 'Untitled'}”?`)) return;

    const index = this.exhibition.artworks.findIndex((item) => item.id === art.id);
    this.exhibition.artworks.splice(index, 1);
    this.selection =
      this.exhibition.artworks[Math.min(index, this.exhibition.artworks.length - 1)]?.id ??
      'exhibition';
    this.render();
    this.setStatus(`“${art.title || 'Untitled'}” removed — press Done to apply.`);
  }

  private removeImage(): void {
    const art = this.currentArtwork();
    if (!art || !art.image) return;
    delete art.image;
    this.render();
    this.setStatus('Reverted to the generated artwork. Press Done to apply.');
  }

  private async handleImage(file: File): Promise<void> {
    const art = this.currentArtwork();
    if (!art) return;
    if (!file.type.startsWith('image/')) {
      this.setStatus('Choose an image file (JPEG, PNG, or WebP).');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      this.setStatus('That image is larger than 20 MB. Try a smaller file.');
      return;
    }

    this.setStatus('Preparing image…');
    try {
      const prepared = await prepareImage(file);
      if (this.selection !== art.id) return;
      art.image = prepared.dataUrl;

      const aspect = prepared.width / prepared.height;
      let width = 3.4;
      let height = width / aspect;
      if (height > 3.2) {
        height = 3.2;
        width = height * aspect;
      }
      width = clamp(width, 0.6, 4);
      height = clamp(height, 0.5, 3.6);
      art.width = round2(width);
      art.height = round2(height);

      this.render();
      this.setStatus(
        `Image added (${prepared.width} × ${prepared.height}px, ${formatBytes(prepared.bytes)}). Press Done to save.`,
      );
    } catch {
      this.setStatus('That image could not be read. Try a JPEG or PNG.');
    }
  }

  private async importJson(file: File): Promise<void> {
    this.setStatus('Reading exhibition file…');
    try {
      const text = await file.text();
      const imported = parseExhibitionFile(text);
      this.exhibition = imported;
      this.selection = imported.artworks[0]?.id ?? 'exhibition';
      this.render();
      this.setStatus(
        `Imported “${imported.settings.title || 'Untitled'}” with ${imported.artworks.length} works — press Done to apply.`,
      );
    } catch {
      this.setStatus('Could not read that file as an exhibition JSON.');
    }
  }

  private exportJson(): void {
    const slug = (this.exhibition.settings.title || 'exhibition')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const blob = new Blob([JSON.stringify(this.exhibition, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${slug || 'exhibition'}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    this.setStatus('Exhibition exported as JSON.');
  }

  private resetExhibition(): void {
    if (
      !window.confirm(
        'Reset the exhibition to the original works and texts? Your current edits will be replaced when you press Done.',
      )
    ) {
      return;
    }
    this.exhibition = createDefaultExhibition();
    this.selection = this.exhibition.artworks[0]?.id ?? 'exhibition';
    this.render();
    this.setStatus('Reset to the original exhibition — press Done to apply.');
  }
}

export function countLabel(count: number): string {
  const word = COUNT_WORDS[count] ?? String(count);
  return `${word} ${count === 1 ? 'work' : 'works'}`;
}
