// ── App bootstrap: wires UI, audio decode, and the Whisper worker ──

// feedback:begin (managed by hub/scripts/feedback/backfill.mjs)
import { mountFeedback } from './feedback';
mountFeedback();
// feedback:end

import './styles/main.css';
import { AppUI } from './ui';
import { initGlossary } from './glossary';
import { decodeToMono16k, durationSeconds } from './audio';
import { serialize, MIME_BY_FORMAT, exportFilename } from './subtitles';
import {
  loadSettings,
  saveSettings,
  loadTheme,
  saveTheme,
  type Theme,
} from './models';
import { formatBytes } from './format';
import type {
  Transcript,
  TranscribeSettings,
  ExportFormat,
  WorkerToMain,
  MainToWorker,
} from './types';

const appRoot = document.getElementById('app');
if (!appRoot) throw new Error('#app not found');

// ── Theme ──
let theme: Theme = loadTheme();
function applyTheme(t: Theme): void {
  const root = document.documentElement;
  if (t === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', t);
}
applyTheme(theme);

// ── State ──
let settings: TranscribeSettings = loadSettings();
let currentFile: File | null = null;
let currentTranscript: Transcript | null = null;
let currentDurationSec = 0;
let worker: Worker | null = null;
let busy = false;
const downloadTotals = new Map<string, number>();
const downloadLoaded = new Map<string, number>();

const ui = new AppUI(appRoot, settings, {
  onFiles: (files) => handleFiles(files),
  onStart: () => {},
  onCancel: () => cancel(),
  onReset: () => reset(),
  onCopy: () => copyTranscript(),
  onShare: () => shareTranscript(),
  onDownload: (fmt) => downloadTranscript(fmt),
  onSettingsChange: (s) => {
    settings = s;
    saveSettings(s);
    ui.log.add(`Settings: ${s.model.split('/')[1]}, ${s.language}, ${s.task}`, 'info');
  },
  onToggleTheme: () => {
    theme = theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark';
    applyTheme(theme);
    saveTheme(theme);
    ui.log.add(`Theme: ${theme}`, 'info');
  },
});

initGlossary(document.body);
ui.log.add('Scribewell ready. Audio stays on your device.', 'good');

// ── Worker lifecycle ──
function ensureWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  worker.addEventListener('message', (e: MessageEvent<WorkerToMain>) => onWorkerMessage(e.data));
  worker.addEventListener('error', (e) => {
    ui.log.add(`Worker error: ${e.message}`, 'bad');
    if (busy) {
      busy = false;
      ui.showError(`The transcription engine crashed: ${e.message}`);
    }
  });
  return worker;
}

function post(msg: MainToWorker, transfer?: Transferable[]): void {
  ensureWorker().postMessage(msg, transfer ?? []);
}

// ── File handling ──
async function handleFiles(files: FileList | File[]): Promise<void> {
  const list = Array.from(files);
  const file = list.find((f) => /^(audio|video)\//.test(f.type)) ?? list[0];
  if (!file) return;
  if (busy) {
    ui.log.add('Busy — finish or cancel the current job first.', 'warn');
    return;
  }
  currentFile = file;
  currentTranscript = null;
  busy = true;

  ui.showStage('working');
  ui.setWorkingFile(file.name, file.size);
  ui.setPartial('');
  ui.log.add(`Loaded ${file.name} (${formatBytes(file.size)})`, 'info');

  // 1) Decode audio on the main thread (Web Audio needs the document context).
  ui.setProgress('Decoding audio…', null, 'Reading and resampling to 16 kHz mono');
  let audio: Float32Array;
  try {
    audio = await decodeToMono16k(file);
  } catch (err) {
    busy = false;
    const msg = err instanceof Error ? err.message : String(err);
    ui.log.add(`Decode failed: ${msg}`, 'bad');
    ui.showError(msg);
    return;
  }
  currentDurationSec = durationSeconds(audio);
  ui.log.add(`Decoded ${currentDurationSec.toFixed(1)}s of audio`, 'good');

  // 2) Hand off to the worker for model load + inference.
  ui.setProgress('Loading model…', 0, 'First run downloads the model, then it is cached');
  downloadTotals.clear();
  downloadLoaded.clear();
  post(
    {
      type: 'transcribe',
      audio,
      model: settings.model,
      language: settings.language,
      task: settings.task,
    },
    [audio.buffer],
  );
}

function onWorkerMessage(msg: WorkerToMain): void {
  switch (msg.type) {
    case 'device':
      ui.setDevice(msg.device);
      ui.log.add(
        msg.device === 'webgpu' ? 'Using WebGPU acceleration' : 'Using WebAssembly (CPU)',
        'info',
      );
      break;
    case 'download': {
      downloadTotals.set(msg.file, msg.total);
      downloadLoaded.set(msg.file, msg.loaded);
      let loaded = 0;
      let total = 0;
      for (const v of downloadLoaded.values()) loaded += v;
      for (const v of downloadTotals.values()) total += v;
      const frac = total > 0 ? loaded / total : msg.progress;
      ui.setProgress(
        'Downloading model…',
        frac,
        `${formatBytes(loaded)} of ${formatBytes(total)} · cached after first run`,
      );
      break;
    }
    case 'download-done':
      ui.log.add(`Fetched ${msg.file}`, 'info');
      break;
    case 'ready':
      ui.setProgress('Transcribing…', null, 'Running Whisper on your device');
      ui.log.add('Model ready — transcribing', 'good');
      break;
    case 'partial':
      ui.setProgress('Transcribing…', null, 'Running Whisper on your device');
      ui.setPartial(msg.text);
      break;
    case 'complete':
      busy = false;
      currentTranscript = msg.result;
      ui.log.add('Transcription complete', 'good');
      ui.showResult(msg.result, currentFile?.name ?? 'audio', currentDurationSec);
      break;
    case 'error':
      busy = false;
      ui.log.add(`Error: ${msg.message}`, 'bad');
      ui.showError(msg.message);
      break;
  }
}

function cancel(): void {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  busy = false;
  ui.log.add('Cancelled', 'warn');
  reset();
}

function reset(): void {
  currentFile = null;
  currentTranscript = null;
  ui.setPartial('');
  ui.showStage('input');
}

// ── Output actions ──
async function copyTranscript(): Promise<void> {
  if (!currentTranscript) return;
  const text = serialize(currentTranscript, 'txt');
  try {
    await navigator.clipboard.writeText(text);
    ui.flashButton('#btn-copy', 'Copied ✓');
    ui.log.add('Copied transcript to clipboard', 'good');
  } catch {
    ui.log.add('Clipboard blocked by the browser', 'warn');
  }
}

async function shareTranscript(): Promise<void> {
  if (!currentTranscript || typeof navigator.share !== 'function') return;
  const text = serialize(currentTranscript, 'txt');
  try {
    await navigator.share({ title: currentFile?.name ?? 'Transcript', text });
    ui.log.add('Shared transcript', 'good');
  } catch {
    /* user dismissed the share sheet — not an error */
  }
}

function downloadTranscript(format: ExportFormat): void {
  if (!currentTranscript) return;
  const content = serialize(currentTranscript, format);
  const blob = new Blob([content], { type: MIME_BY_FORMAT[format] });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = exportFilename(currentFile?.name ?? 'transcript', format);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  ui.log.add(`Downloaded ${a.download}`, 'good');
}

// ── Service worker (offline) ──
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* offline support is a nice-to-have */
    });
  });
}
