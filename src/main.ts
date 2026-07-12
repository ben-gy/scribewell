/**
 * Scribewell entry point.
 *
 * Wires the app shell: model picker + drop zone → decode → local Whisper
 * transcription in a worker → timestamped transcript with .txt/.srt/.vtt
 * export. Everything runs on-device; the only network call is the one-time
 * model-weight download.
 */

import './styles/main.css';
import { decodeToPcm } from './audio';
import { Transcriber } from './transcriber';
import { MODELS, DEFAULT_MODEL_ID, modelById, detectEngine } from './models';
import { buildExport, baseName, formatClock, type ExportFormat } from './formats';
import type { Engine, Segment, TranscriptResult } from './types';
import {
  clear,
  formatBytes,
  h,
  icon,
  initModalTriggers,
  mount,
  toast,
} from './ui';
import { emit as logEvent, mountEventDrawer } from './eventlog';
import { initGlossary } from './glossary';

const ACCEPTED =
  'audio/*,video/*,.mp3,.m4a,.wav,.ogg,.oga,.opus,.flac,.aac,.mp4,.webm,.mov,.mkv';
const MODEL_KEY = 'scribewell.model';

const app = mount();
mountEventDrawer(document.getElementById('event-drawer')!);
initModalTriggers();
initGlossary();

let transcriber: Transcriber | null = null;
let engine: Engine = 'wasm';
let busy = false;

logEvent('system', 'ok', 'Scribewell ready', { backend: 'none', uploads: 'never' });

detectEngine().then((e) => {
  engine = e;
  setEngineLabel(e);
  logEvent('system', 'info', `inference engine: ${e}`, {
    accel: e === 'webgpu' ? 'gpu' : 'cpu',
  });
});

function getTranscriber(): Transcriber {
  if (!transcriber) transcriber = new Transcriber();
  return transcriber;
}

function savedModelId(): string {
  try {
    const id = localStorage.getItem(MODEL_KEY);
    if (id && MODELS.some((m) => m.id === id)) return id;
  } catch {
    /* ignore */
  }
  return DEFAULT_MODEL_ID;
}

// ---------- status bar ----------

function setStatus(state: 'idle' | 'busy' | 'good' | 'bad', label: string): void {
  const dot = document.getElementById('sb-status-dot');
  const lab = document.getElementById('sb-status-label');
  if (dot) dot.className = 'dot-mini ' + (state === 'idle' ? 'idle' : state === 'bad' ? 'bad' : state === 'good' ? 'good' : 'busy');
  if (lab) lab.textContent = label;
}
function setEngineLabel(e: Engine): void {
  const el = document.getElementById('sb-engine');
  if (el) el.innerHTML = `<span class="sb-key">engine</span> ${e === 'webgpu' ? 'webgpu' : 'wasm'}`;
}
function setProgressLabel(txt: string): void {
  const el = document.getElementById('sb-progress');
  if (el) el.innerHTML = `<span class="sb-key">progress</span> ${txt}`;
}
function setSpeedLabel(txt: string): void {
  const el = document.getElementById('sb-speed');
  if (el) el.innerHTML = `<span class="sb-key">speed</span> ${txt}`;
}

// ====================================================================
//  IDLE
// ====================================================================

let selectedModelId = savedModelId();

function renderIdle(): void {
  clear(app);
  app.classList.remove('scrollable');
  busy = false;
  setStatus('idle', 'ready');
  setProgressLabel('—');
  setSpeedLabel('—');

  const hero = h(
    'div',
    { class: 'hero' },
    h('h1', {}, 'Transcribe without uploading'),
    h(
      'p',
      { class: 'tagline' },
      'Audio & video to text and subtitles — powered by ',
      glossary('Whisper', 'whisper'),
      ' running entirely in your browser.',
    ),
  );

  // ----- model picker -----
  const picker = h('div', { class: 'model-picker', role: 'radiogroup', 'aria-label': 'Model' });
  for (const m of MODELS) {
    const card = h(
      'button',
      {
        type: 'button',
        class: 'model-card' + (m.id === selectedModelId ? ' selected' : ''),
        role: 'radio',
        'aria-checked': m.id === selectedModelId ? 'true' : 'false',
        'data-model': m.id,
      },
      h('span', { class: 'model-name' }, m.label),
      h('span', { class: 'model-size' }, m.size),
      h('span', { class: 'model-blurb' }, m.blurb),
    );
    card.addEventListener('click', () => {
      selectedModelId = m.id;
      try {
        localStorage.setItem(MODEL_KEY, m.id);
      } catch {
        /* ignore */
      }
      picker.querySelectorAll('.model-card').forEach((c) => {
        const on = (c as HTMLElement).dataset.model === m.id;
        c.classList.toggle('selected', on);
        c.setAttribute('aria-checked', on ? 'true' : 'false');
      });
      logEvent('ui', 'info', `model selected: ${m.label}`);
    });
    picker.appendChild(card);
  }

  // ----- dropzone -----
  const input = h('input', {
    type: 'file',
    id: 'file-input',
    accept: ACCEPTED,
    'aria-label': 'Choose an audio or video file',
  }) as HTMLInputElement;

  const dropzone = h(
    'div',
    {
      class: 'dropzone',
      role: 'button',
      tabindex: '0',
      'aria-label': 'Drop an audio or video file here, or click to browse',
    },
    icon('upload', 'dropzone-icon'),
    h('h2', {}, 'Drop audio or video'),
    h('p', {}, 'or click to choose a file · MP3 · WAV · M4A · MP4 · WEBM · and more'),
    h('span', { class: 'browse' }, 'Choose file'),
    input,
  );

  dropzone.addEventListener('click', (e) => {
    if (e.target === input) return;
    input.click();
  });
  dropzone.addEventListener('keydown', (e) => {
    const ke = e as KeyboardEvent;
    if (ke.key === 'Enter' || ke.key === ' ') {
      e.preventDefault();
      input.click();
    }
  });
  input.addEventListener('change', () => {
    const f = input.files?.[0];
    if (f) void handleFile(f);
  });

  window.addEventListener('dragover', onDragOver);
  window.addEventListener('dragleave', onDragLeave);
  window.addEventListener('drop', onDrop);
  function onDragOver(e: DragEvent) {
    e.preventDefault();
    dropzone.classList.add('is-dragging');
  }
  function onDragLeave(e: DragEvent) {
    e.preventDefault();
    if (e.target === dropzone) dropzone.classList.remove('is-dragging');
  }
  function onDrop(e: DragEvent) {
    e.preventDefault();
    dropzone.classList.remove('is-dragging');
    const f = e.dataTransfer?.files?.[0];
    if (f) void handleFile(f);
  }

  const trust = h(
    'div',
    { class: 'trust-row' },
    trustPill('Nothing is uploaded'),
    trustPill('Works offline once loaded'),
    trustPill('No account · no tracking'),
  );

  app.appendChild(h('div', { class: 'idle-shell' }, hero, picker, dropzone, trust));
}

function trustPill(label: string): HTMLElement {
  return h('span', { class: 'trust-pill' }, h('span', { class: 'tick' }, '✓'), label);
}

function glossary(label: string, term: string): HTMLElement {
  return h('span', { class: 'glossary-link', 'data-term': term, tabindex: '0', role: 'button' }, label);
}

// ====================================================================
//  PROCESSING
// ====================================================================

async function handleFile(file: File): Promise<void> {
  if (busy) {
    toast('Already transcribing — please wait');
    return;
  }
  busy = true;
  const model = modelById(selectedModelId);
  let transcribeStart = 0;
  logEvent('ui', 'info', 'file received', { name: file.name, size: file.size });

  const bar = h('div', { class: 'progress-fill' });
  const barWrap = h('div', { class: 'progress' }, bar);
  const stageEl = h('div', { class: 'stage-label' }, 'Preparing…');
  const subEl = h('div', { class: 'stage-sub' }, model.label + ' · ' + (engine === 'webgpu' ? 'GPU' : 'CPU'));
  const previewEl = h('div', { class: 'live-preview' });

  clear(app);
  app.classList.add('scrollable');
  setStatus('busy', 'working');
  app.appendChild(
    h(
      'div',
      { class: 'processing' },
      h(
        'div',
        { class: 'proc-head' },
        icon('wave', 'proc-icon'),
        h('div', {}, h('div', { class: 'proc-name' }, file.name), h('div', { class: 'proc-meta' }, formatBytes(file.size))),
      ),
      stageEl,
      barWrap,
      subEl,
      h('div', { class: 'preview-label' }, 'Live preview'),
      previewEl,
    ),
  );

  const setBar = (pct: number) => {
    bar.style.width = `${Math.max(0, Math.min(100, pct)).toFixed(1)}%`;
  };

  try {
    // ---- decode ----
    stageEl.textContent = 'Decoding audio…';
    barWrap.classList.add('indeterminate');
    logEvent('audio', 'info', 'decoding to 16 kHz mono pcm');
    const t0 = performance.now();
    const audio = await decodeToPcm(file);
    barWrap.classList.remove('indeterminate');
    logEvent('audio', 'ok', 'decoded', {
      duration: `${audio.durationSec.toFixed(1)}s`,
      samples: audio.samples.length,
      ms: Math.round(performance.now() - t0),
    });
    if (audio.samples.length === 0) {
      throw new Error('No audio found in this file. If it is a video, it may have no audio track.');
    }

    // ---- load model ----
    const tr = getTranscriber();
    tr.setCallbacks({
      onEngine: (e) => {
        engine = e;
        setEngineLabel(e);
        subEl.textContent = model.label + ' · ' + (e === 'webgpu' ? 'GPU' : 'CPU');
      },
      onDownload: (progress, fname) => {
        stageEl.textContent = 'Downloading model (first run only)…';
        setBar(progress);
        setProgressLabel(`model ${progress.toFixed(0)}%`);
        if (fname) subEl.textContent = `${model.label} · ${fname}`;
      },
      onModelReady: () => {
        logEvent('model', 'ok', 'model ready', { id: model.id, engine });
      },
      onChunk: (segs) => {
        previewEl.textContent = segs.map((s) => s.text).join(' ');
        previewEl.scrollTop = previewEl.scrollHeight;
      },
      onProgress: (processed, total) => {
        const pct = total > 0 ? (processed / total) * 100 : 0;
        setBar(pct);
        stageEl.textContent = 'Transcribing…';
        setProgressLabel(`${pct.toFixed(0)}%`);
        const elapsed = (performance.now() - transcribeStart) / 1000;
        if (elapsed > 0.5 && processed > 0) {
          setSpeedLabel(`${(processed / elapsed).toFixed(1)}× realtime`);
        }
      },
    });

    stageEl.textContent = 'Loading model…';
    barWrap.classList.add('indeterminate');
    logEvent('model', 'info', 'loading whisper', { id: model.id, engine });
    await tr.load(model.id, engine);
    barWrap.classList.remove('indeterminate');
    setProgressLabel('0%');

    // ---- transcribe ----
    stageEl.textContent = 'Transcribing…';
    logEvent('asr', 'info', 'transcription started', { audio: `${audio.durationSec.toFixed(1)}s` });
    transcribeStart = performance.now();
    const result = await tr.transcribe(audio.samples, model.englishOnly);
    const took = (performance.now() - transcribeStart) / 1000;
    logEvent('asr', 'ok', 'transcription complete', {
      segments: result.segments.length,
      chars: result.text.length,
      took: `${took.toFixed(1)}s`,
    });
    setBar(100);
    renderResult(file, result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logEvent('asr', 'err', message);
    renderError(file, message);
  } finally {
    busy = false;
  }
}

// ====================================================================
//  RESULT
// ====================================================================

function renderResult(file: File, result: TranscriptResult): void {
  clear(app);
  app.classList.add('scrollable');
  setStatus('good', 'done');
  setProgressLabel('100%');

  const stem = baseName(file.name);

  if (result.segments.length === 0) {
    app.appendChild(
      h(
        'div',
        { class: 'result' },
        h('div', { class: 'result-head' }, h('h2', {}, 'No speech detected'),
          h('p', { class: 'result-sub' }, 'The model did not find any spoken words in this file.')),
        h(
          'div',
          { class: 'btn-row' },
          newButton(),
        ),
      ),
    );
    return;
  }

  // ----- toolbar -----
  const copyBtn = h('button', { class: 'btn primary' }, icon('copy', 'bi'), 'Copy text');
  copyBtn.addEventListener('click', async () => {
    await copyText(buildExport(result.segments, 'txt').content);
  });

  const dlTxt = exportButton('Download .txt', result.segments, 'txt', stem);
  const dlSrt = exportButton('.srt', result.segments, 'srt', stem);
  const dlVtt = exportButton('.vtt', result.segments, 'vtt', stem);

  const toolbar = h(
    'div',
    { class: 'toolbar' },
    copyBtn,
    dlTxt,
    dlSrt,
    dlVtt,
  );

  if (typeof navigator.share === 'function') {
    const shareBtn = h('button', { class: 'btn' }, icon('share', 'bi'), 'Share');
    shareBtn.addEventListener('click', async () => {
      try {
        await navigator.share({
          title: stem,
          text: buildExport(result.segments, 'txt').content,
        });
        logEvent('ui', 'ok', 'shared transcript');
      } catch {
        /* user cancelled */
      }
    });
    toolbar.appendChild(shareBtn);
  }
  toolbar.appendChild(newButton());

  // ----- meta strip -----
  const words = result.text.split(/\s+/).filter(Boolean).length;
  const meta = h(
    'div',
    { class: 'result-meta' },
    metaCell('duration', formatClock(result.durationSec)),
    metaCell('segments', String(result.segments.length)),
    metaCell('words', String(words)),
    metaCell('processed', 'on-device'),
  );

  // ----- transcript reader -----
  const reader = h('div', { class: 'transcript', tabindex: '0', 'aria-label': 'Transcript' });
  for (const seg of result.segments) {
    reader.appendChild(segmentRow(seg));
  }

  app.appendChild(
    h(
      'div',
      { class: 'result' },
      h(
        'div',
        { class: 'result-head' },
        h('h2', {}, 'Transcript ready'),
        h('p', { class: 'result-sub' }, file.name),
      ),
      meta,
      toolbar,
      reader,
    ),
  );

  logEvent('ui', 'ok', 'transcript rendered', { segments: result.segments.length, words });
}

function segmentRow(seg: Segment): HTMLElement {
  return h(
    'div',
    { class: 'seg' },
    h('span', { class: 'seg-time' }, formatClock(seg.start)),
    h('span', { class: 'seg-text' }, seg.text),
  );
}

function metaCell(label: string, value: string): HTMLElement {
  return h('div', { class: 'meta-cell' }, h('div', { class: 'm-label' }, label), h('div', { class: 'm-value' }, value));
}

function exportButton(
  label: string,
  segments: Segment[],
  format: ExportFormat,
  stem: string,
): HTMLElement {
  const btn = h('button', { class: 'btn' }, icon('download', 'bi'), label);
  btn.addEventListener('click', () => {
    const bundle = buildExport(segments, format);
    const blob = new Blob([bundle.content], { type: bundle.mime });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: `${stem}.${bundle.extension}` }) as HTMLAnchorElement;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    logEvent('ui', 'ok', `downloaded .${bundle.extension}`, { bytes: bundle.content.length });
    toast(`Saved .${bundle.extension}`);
  });
  return btn;
}

function newButton(): HTMLElement {
  const btn = h('button', { class: 'btn ghost' }, icon('redo', 'bi'), 'New file');
  btn.addEventListener('click', () => renderIdle());
  return btn;
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast('Transcript copied');
    logEvent('ui', 'ok', 'transcript copied to clipboard');
  } catch {
    const ta = h('textarea', {}) as HTMLTextAreaElement;
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      toast('Transcript copied');
    } catch {
      toast('Copy failed — select and copy manually');
    }
    ta.remove();
  }
}

// ====================================================================
//  ERROR
// ====================================================================

function renderError(file: File, message: string): void {
  clear(app);
  app.classList.add('scrollable');
  setStatus('bad', 'error');
  setProgressLabel('—');
  setSpeedLabel('—');

  const retry = h('button', { class: 'btn primary' }, icon('redo', 'bi'), 'Try again');
  retry.addEventListener('click', () => void handleFile(file));

  app.appendChild(
    h(
      'div',
      { class: 'result' },
      h('div', { class: 'alert alert-error' }, icon('warn', 'bi'), h('p', {}, h('strong', {}, 'Couldn’t transcribe. '), message)),
      h(
        'p',
        { class: 'error-hints' },
        '// common causes: unsupported codec · a video with no audio track · WebGPU driver issue (Scribewell falls back to CPU automatically)',
      ),
      h('div', { class: 'btn-row' }, retry, newButton()),
    ),
  );
}

// ---------- keyboard ----------

window.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') {
    const sel = window.getSelection()?.toString();
    if (sel) return; // let native copy of a real selection happen
    const reader = document.querySelector('.transcript');
    if (reader) {
      e.preventDefault();
      const segs = Array.from(reader.querySelectorAll('.seg-text')).map((n) => n.textContent ?? '');
      void copyText(segs.join('\n\n'));
    }
  }
});

// ---------- offline app shell ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then(() => logEvent('system', 'ok', 'offline app shell registered'))
      .catch(() => logEvent('system', 'warn', 'service worker registration failed'));
  });
}

// ---------- go ----------
renderIdle();
