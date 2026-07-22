// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
// ── DOM rendering, dropzone, progress, modals, results ──

import { EventLog, type LogEntry } from './eventlog';
import { MODELS, LANGUAGES, modelById } from './models';
import { term } from './glossary';
import { formatBytes, formatDuration, formatPercent } from './format';
import { normalizeChunks } from './subtitles';
import type {
  Transcript,
  TranscribeSettings,
  ExportFormat,
  ModelId,
} from './types';

export interface UIHandlers {
  onFiles: (files: FileList | File[]) => void;
  onStart: () => void;
  onCancel: () => void;
  onReset: () => void;
  onCopy: () => void;
  onShare: () => void;
  onDownload: (format: ExportFormat) => void;
  onSettingsChange: (settings: TranscribeSettings) => void;
  onToggleTheme: () => void;
}

const ACCEPT =
  'audio/*,video/*,.mp3,.m4a,.wav,.ogg,.oga,.opus,.flac,.aac,.webm,.mp4,.mov,.mkv,.avi';

export class AppUI {
  readonly log = new EventLog();
  private root: HTMLElement;
  private handlers: UIHandlers;
  private settings: TranscribeSettings;
  private currentTranscript: Transcript | null = null;

  constructor(root: HTMLElement, settings: TranscribeSettings, handlers: UIHandlers) {
    this.root = root;
    this.settings = settings;
    this.handlers = handlers;
    this.render();
    this.wire();
  }

  // ── Template ──
  private render(): void {
    this.root.innerHTML = `
      <a class="skip-link" href="#main">Skip to content</a>
      <header class="site-header">
        <div class="brand">
          <img src="/favicon.svg" alt="" class="brand-mark" width="32" height="32" />
          <div class="brand-text">
            <h1>Scribewell</h1>
            <p class="tagline">Private audio &amp; video transcription</p>
          </div>
        </div>
        <div class="header-actions">
          <button class="btn-icon" id="btn-theme" title="Toggle theme" aria-label="Toggle theme">◐</button>
          <button class="btn-ghost" id="btn-log" aria-expanded="false">Activity</button>
        </div>
      </header>

      <button class="trust-badge" id="trust-badge" type="button">
        <span class="dot"></span>
        Runs entirely in your browser — the file never leaves your device.
        <span class="trust-more">Threat model →</span>
      </button>

      <main class="main-content" id="main">
        <!-- Input stage -->
        <section class="stage" id="stage-input">
          <div class="dropzone" id="dropzone" tabindex="0" role="button"
               aria-label="Choose an audio or video file, or drop one here">
            <div class="dropzone-inner">
              <div class="dz-icon" aria-hidden="true">
                <svg viewBox="0 0 48 48" width="52" height="52" fill="none"
                     stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M24 6v22"/><path d="M15 21l9 9 9-9"/>
                  <path d="M8 34v4a4 4 0 0 0 4 4h24a4 4 0 0 0 4-4v-4"/>
                </svg>
              </div>
              <p class="dz-title">Drop audio or video here</p>
              <p class="dz-sub">or <span class="dz-link">browse your files</span> — MP3, M4A, WAV, MP4, MOV and more</p>
              <p class="dz-note">${term('Whisper')} runs locally. Nothing is uploaded.</p>
            </div>
            <input type="file" id="file-input" accept="${ACCEPT}" hidden multiple />
          </div>

          <div class="settings" id="settings">
            <div class="setting">
              <label for="sel-model">Model</label>
              <select id="sel-model">
                ${MODELS.map(
                  (m) =>
                    `<option value="${m.id}" ${m.id === this.settings.model ? 'selected' : ''}>${m.label} · ${m.size}</option>`,
                ).join('')}
              </select>
              <p class="setting-note" id="model-note">${modelById(this.settings.model).note}</p>
            </div>
            <div class="setting" id="setting-language">
              <label for="sel-language">Language</label>
              <select id="sel-language">
                ${LANGUAGES.map(
                  (l) =>
                    `<option value="${l.code}" ${l.code === this.settings.language ? 'selected' : ''}>${l.name}</option>`,
                ).join('')}
              </select>
              <p class="setting-note">Auto-detect works well for most files.</p>
            </div>
            <div class="setting" id="setting-task">
              <label for="sel-task">Task</label>
              <select id="sel-task">
                <option value="transcribe" ${this.settings.task === 'transcribe' ? 'selected' : ''}>Transcribe (same language)</option>
                <option value="translate" ${this.settings.task === 'translate' ? 'selected' : ''}>Translate to English</option>
              </select>
              <p class="setting-note">Translate is available on multilingual models.</p>
            </div>
          </div>
        </section>

        <!-- Working stage -->
        <section class="stage" id="stage-working" hidden>
          <div class="work-head">
            <p class="work-file" id="work-file"></p>
            <button class="btn-ghost" id="btn-cancel">Cancel</button>
          </div>
          <div class="progress" id="progress-block">
            <div class="progress-label">
              <span id="progress-title">Preparing…</span>
              <span id="progress-pct" class="progress-pct"></span>
            </div>
            <div class="progress-track"><div class="progress-fill" id="progress-fill"></div></div>
            <p class="progress-sub" id="progress-sub"></p>
          </div>
          <div class="partial" id="partial" hidden>
            <p class="partial-label">Live transcript</p>
            <p class="partial-text" id="partial-text"></p>
          </div>
        </section>

        <!-- Results stage -->
        <section class="stage" id="stage-result" hidden>
          <div class="result-head">
            <div>
              <p class="result-file" id="result-file"></p>
              <p class="result-meta" id="result-meta"></p>
            </div>
            <button class="btn-secondary" id="btn-new">Transcribe another</button>
          </div>

          <div class="toolbar">
            <div class="segmented" id="view-toggle" role="tablist" aria-label="Transcript view">
              <button class="seg-btn active" data-view="timestamped" role="tab" aria-selected="true">Timestamped</button>
              <button class="seg-btn" data-view="plain" role="tab" aria-selected="false">Plain text</button>
            </div>
            <div class="toolbar-spacer"></div>
            <button class="btn-ghost" id="btn-copy">Copy</button>
            <button class="btn-ghost" id="btn-share" hidden>Share</button>
            <div class="download-group">
              <select id="sel-format" aria-label="Download format">
                <option value="txt">Text (.txt)</option>
                <option value="srt">Subtitles (.srt)</option>
                <option value="vtt">Subtitles (.vtt)</option>
                <option value="json">JSON (.json)</option>
              </select>
              <button class="btn-primary" id="btn-download">Download</button>
            </div>
          </div>

          <div class="transcript" id="transcript" tabindex="0"></div>
        </section>

        <!-- Error stage -->
        <section class="stage stage-error" id="stage-error" hidden>
          <div class="error-card">
            <p class="error-title">Something went wrong</p>
            <p class="error-msg" id="error-msg"></p>
            <div class="error-actions">
              <button class="btn-secondary" id="btn-error-reset">Start over</button>
            </div>
          </div>
        </section>

        <div class="info-links">
          <button class="link-btn" data-modal="how">How it works</button>
          <button class="link-btn" data-modal="threat">Threat model</button>
          <button class="link-btn" data-modal="about">About</button>
        </div>
      </main>

      <aside class="log-drawer" id="log-drawer" aria-hidden="true">
        <div class="log-drawer-head">
          <span>Activity log</span>
          <div>
            <button class="btn-ghost btn-sm" id="btn-log-copy">Copy</button>
            <button class="btn-ghost btn-sm" id="btn-log-close">Close</button>
          </div>
        </div>
        <div class="log-list" id="log-list" role="log" aria-live="polite"></div>
      </aside>

      <footer class="site-footer">
        <span>Built by <a href="https://benrichardson.dev/" target="_blank" rel="noopener">benrichardson.dev</a> · <a href="https://hub.benrichardson.dev" target="_blank" rel="noopener">more tools &amp; sites</a></span>
        <span class="footer-sep">·</span>
        <span id="device-tag" class="device-tag"></span>
      </footer>

      ${this.modalTemplate('how', 'How Scribewell works', this.howContent())}
      ${this.modalTemplate('threat', 'Threat model', this.threatContent())}
      ${this.modalTemplate('about', 'About Scribewell', this.aboutContent())}
    `;

    // Subscribe log rendering.
    const list = this.$('#log-list');
    this.log.subscribe((entries) => this.renderLog(list, entries));
  }

  private modalTemplate(id: string, title: string, body: string): string {
    return `
      <div class="modal-overlay" id="modal-${id}" hidden>
        <div class="modal" role="dialog" aria-modal="true" aria-label="${title}">
          <div class="modal-head">
            <h2>${title}</h2>
            <button class="btn-icon" data-close-modal aria-label="Close">✕</button>
          </div>
          <div class="modal-body">${body}</div>
        </div>
      </div>`;
  }

  private howContent(): string {
    return `
      <ol class="steps">
        <li><strong>You pick a file.</strong> Audio or video, dragged in or chosen from disk. It stays in the page — no upload happens.</li>
        <li><strong>Scribewell decodes the audio</strong> using the browser's Web Audio engine and resamples it to ${term('16 kHz', '16 kHz')} mono, the format ${term('Whisper')} expects.</li>
        <li><strong>The model loads once.</strong> ${term('Whisper')}'s ${term('quantized')} weights (${term('ONNX')} format) download from Hugging Face the first time, then are cached for offline use.</li>
        <li><strong>Transcription runs on your device</strong> — on your GPU via ${term('WebGPU')} when available, otherwise on the CPU via ${term('WASM')}. A live transcript streams as it works.</li>
        <li><strong>You export.</strong> Copy the text, or download it as plain text, ${term('SRT')} / ${term('VTT')} subtitles, or timestamped JSON.</li>
      </ol>
      <p class="modal-foot-note">Everything above happens inside this browser tab. Close it and nothing remains on any server — because nothing was ever sent to one.</p>`;
  }

  private threatContent(): string {
    return `
      <div class="threat-grid">
        <section>
          <h3 class="good">Protected</h3>
          <ul>
            <li>Your audio and video files are decoded and transcribed <strong>entirely in your browser</strong>. They are never uploaded.</li>
            <li>The transcript is generated on-device and only leaves your machine if <em>you</em> copy, share, or download it.</li>
            <li>No account, no cookies, no fingerprinting, no third-party fonts. The only analytics is Cloudflare Web Analytics — anonymous, cookie-less page-view counts; no personal data, no cross-site tracking.</li>
            <li>After the model is cached, the tool works fully <strong>offline</strong>.</li>
          </ul>
        </section>
        <section>
          <h3 class="warn">Not protected</h3>
          <ul>
            <li>The first time you use a model, its weights are downloaded from the Hugging Face CDN. That request reveals <em>which model</em> you fetched (never your audio) to Hugging Face and your network.</li>
            <li>Transcription accuracy varies with audio quality, accents, and background noise. Always proofread safety-critical transcripts.</li>
            <li>Anything you choose to export is your responsibility once it leaves the tool.</li>
          </ul>
        </section>
        <section>
          <h3>Trust surface</h3>
          <ul>
            <li>The static site bundle, served over TLS by GitHub Pages.</li>
            <li>The Hugging Face CDN, for the one-time model download.</li>
            <li>The <code>@huggingface/transformers</code> library and the Whisper model weights.</li>
          </ul>
        </section>
      </div>`;
  }

  private aboutContent(): string {
    return `
      <p>Scribewell turns speech into text without sending your recordings anywhere. It exists because the obvious way to transcribe a sensitive interview, therapy session, medical note, or confidential meeting — uploading it to some website — is exactly the thing you shouldn't do.</p>
      <p>It runs OpenAI's ${term('Whisper')} model directly in your browser using WebGPU / WebAssembly, so the audio never leaves your device.</p>
      <p>Built by <a href="https://benrichardson.dev/" target="_blank" rel="noopener">benrichardson.dev</a>. Source on <a href="https://github.com/ben-gy/scribewell" target="_blank" rel="noopener">GitHub</a>.</p>
      <p class="modal-foot-note">Model: Whisper (tiny / base) via @huggingface/transformers.</p>`;
  }

  // ── Wiring ──
  private wire(): void {
    const dropzone = this.$('#dropzone');
    const fileInput = this.$<HTMLInputElement>('#file-input');

    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('keydown', (e) => {
      const ke = e as KeyboardEvent;
      if (ke.key === 'Enter' || ke.key === ' ') {
        e.preventDefault();
        fileInput.click();
      }
    });
    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files.length) this.handlers.onFiles(fileInput.files);
      fileInput.value = '';
    });

    // Drag & drop on the whole window for generosity, highlight the dropzone.
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    };
    const onDragLeave = (e: DragEvent) => {
      if (e.target === dropzone) dropzone.classList.remove('dragover');
    };
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      const files = e.dataTransfer?.files;
      if (files && files.length) this.handlers.onFiles(files);
    });

    // Settings.
    const selModel = this.$<HTMLSelectElement>('#sel-model');
    const selLang = this.$<HTMLSelectElement>('#sel-language');
    const selTask = this.$<HTMLSelectElement>('#sel-task');
    const syncSettings = () => {
      this.settings = {
        model: selModel.value as ModelId,
        language: selLang.value,
        task: selTask.value === 'translate' ? 'translate' : 'transcribe',
      };
      this.$('#model-note').textContent = modelById(this.settings.model).note;
      this.updateSettingAvailability();
      this.handlers.onSettingsChange(this.settings);
    };
    selModel.addEventListener('change', syncSettings);
    selLang.addEventListener('change', syncSettings);
    selTask.addEventListener('change', syncSettings);
    this.updateSettingAvailability();

    // Buttons.
    this.$('#btn-cancel').addEventListener('click', () => this.handlers.onCancel());
    this.$('#btn-new').addEventListener('click', () => this.handlers.onReset());
    this.$('#btn-error-reset').addEventListener('click', () => this.handlers.onReset());
    this.$('#btn-copy').addEventListener('click', () => this.handlers.onCopy());
    this.$('#btn-share').addEventListener('click', () => this.handlers.onShare());
    this.$('#btn-download').addEventListener('click', () => {
      const fmt = this.$<HTMLSelectElement>('#sel-format').value as ExportFormat;
      this.handlers.onDownload(fmt);
    });
    this.$('#btn-theme').addEventListener('click', () => this.handlers.onToggleTheme());

    // View toggle.
    this.root.querySelectorAll('.seg-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.root.querySelectorAll('.seg-btn').forEach((b) => {
          b.classList.remove('active');
          b.setAttribute('aria-selected', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
        const view = (btn as HTMLElement).dataset.view as 'timestamped' | 'plain';
        this.renderTranscript(view);
      });
    });

    // Modals.
    this.root.querySelectorAll('[data-modal]').forEach((btn) => {
      btn.addEventListener('click', () =>
        this.openModal((btn as HTMLElement).dataset.modal as string),
      );
    });
    this.$('#trust-badge').addEventListener('click', () => this.openModal('threat'));
    this.root.querySelectorAll('.modal-overlay').forEach((overlay) => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay || (e.target as HTMLElement).closest('[data-close-modal]'))
          this.closeModals();
      });
    });

    // Log drawer.
    this.$('#btn-log').addEventListener('click', () => this.toggleLog());
    this.$('#btn-log-close').addEventListener('click', () => this.toggleLog(false));
    this.$('#btn-log-copy').addEventListener('click', () => {
      void navigator.clipboard?.writeText(this.log.toText());
    });

    // Keyboard.
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeModals();
        this.toggleLog(false);
      }
    });
  }

  private updateSettingAvailability(): void {
    const multilingual = !this.settings.model.endsWith('.en');
    const langSetting = this.$('#setting-language');
    const taskSetting = this.$('#setting-task');
    langSetting.classList.toggle('disabled', !multilingual);
    taskSetting.classList.toggle('disabled', !multilingual);
    this.$<HTMLSelectElement>('#sel-language').disabled = !multilingual;
    this.$<HTMLSelectElement>('#sel-task').disabled = !multilingual;
  }

  // ── Public API used by main.ts ──
  getSettings(): TranscribeSettings {
    return this.settings;
  }

  showStage(stage: 'input' | 'working' | 'result' | 'error'): void {
    for (const s of ['input', 'working', 'result', 'error']) {
      this.$(`#stage-${s}`).hidden = s !== stage;
    }
  }

  setWorkingFile(name: string, size: number): void {
    this.$('#work-file').textContent = `${name} · ${formatBytes(size)}`;
  }

  setProgress(title: string, fraction: number | null, sub = ''): void {
    this.$('#progress-title').textContent = title;
    const fill = this.$('#progress-fill');
    const pct = this.$('#progress-pct');
    if (fraction == null) {
      fill.classList.add('indeterminate');
      fill.style.width = '40%';
      pct.textContent = '';
    } else {
      fill.classList.remove('indeterminate');
      fill.style.width = formatPercent(fraction);
      pct.textContent = formatPercent(fraction);
    }
    this.$('#progress-sub').textContent = sub;
  }

  setPartial(text: string): void {
    const wrap = this.$('#partial');
    if (!text.trim()) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    this.$('#partial-text').textContent = text;
  }

  setDevice(device: 'webgpu' | 'wasm'): void {
    const tag = this.$('#device-tag');
    tag.textContent = device === 'webgpu' ? 'GPU-accelerated (WebGPU)' : 'CPU (WebAssembly)';
  }

  showResult(transcript: Transcript, sourceName: string, durationSec: number): void {
    this.currentTranscript = transcript;
    this.$('#result-file').textContent = sourceName;
    const words = transcript.text.split(/\s+/).filter(Boolean).length;
    const segs = normalizeChunks(transcript.chunks).length;
    this.$('#result-meta').textContent =
      `${formatDuration(durationSec)} · ${words.toLocaleString()} words · ${segs} segments`;
    const shareBtn = this.$<HTMLButtonElement>('#btn-share');
    shareBtn.hidden = typeof navigator.share !== 'function';
    this.renderTranscript('timestamped');
    this.showStage('result');
  }

  private renderTranscript(view: 'timestamped' | 'plain'): void {
    if (!this.currentTranscript) return;
    const container = this.$('#transcript');
    const segCount = normalizeChunks(this.currentTranscript.chunks).length;
    if (segCount === 0 && !this.currentTranscript.text.trim()) {
      container.classList.remove('plain');
      container.innerHTML =
        '<p class="transcript-empty">No speech was detected in this file. If you expected words, try a different model or check that the recording actually contains speech.</p>';
      return;
    }
    if (view === 'plain') {
      container.classList.add('plain');
      container.innerHTML = `<p class="plain-para">${escapeHtml(
        this.currentTranscript.chunks.map((c) => c.text.trim()).join(' ').replace(/\s+/g, ' ').trim() ||
          this.currentTranscript.text,
      )}</p>`;
      return;
    }
    container.classList.remove('plain');
    const segs = normalizeChunks(this.currentTranscript.chunks);
    container.innerHTML = segs
      .map(
        (s) =>
          `<div class="seg"><span class="seg-time">${formatDuration(s.start)}</span><span class="seg-text">${escapeHtml(s.text)}</span></div>`,
      )
      .join('');
  }

  showError(message: string): void {
    this.$('#error-msg').textContent = message;
    this.showStage('error');
  }

  flashButton(id: string, label: string): void {
    const btn = this.$<HTMLButtonElement>(id);
    const original = btn.dataset.label ?? btn.textContent ?? '';
    if (!btn.dataset.label) btn.dataset.label = original;
    btn.textContent = label;
    window.setTimeout(() => {
      btn.textContent = btn.dataset.label ?? original;
    }, 1400);
  }

  private openModal(id: string): void {
    this.closeModals();
    const modal = this.root.querySelector(`#modal-${id}`) as HTMLElement | null;
    if (modal) modal.hidden = false;
  }

  private closeModals(): void {
    this.root.querySelectorAll('.modal-overlay').forEach((m) => ((m as HTMLElement).hidden = true));
  }

  private toggleLog(force?: boolean): void {
    const drawer = this.$('#log-drawer');
    const open = force ?? drawer.getAttribute('aria-hidden') === 'true';
    drawer.setAttribute('aria-hidden', open ? 'false' : 'true');
    drawer.classList.toggle('open', open);
    this.$('#btn-log').setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  private renderLog(list: HTMLElement, entries: LogEntry[]): void {
    list.innerHTML = entries
      .map(
        (e) =>
          `<div class="log-entry log-${e.level}"><span class="log-time">${e.time}</span><span class="log-msg">${escapeHtml(e.message)}</span></div>`,
      )
      .join('');
    list.scrollTop = list.scrollHeight;
  }

  private $<T extends HTMLElement = HTMLElement>(sel: string): T {
    const el = this.root.querySelector(sel) as T | null;
    if (!el) throw new Error(`Missing element: ${sel}`);
    return el;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
