// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
// ── Glossary: click-to-define tooltips for jargon in the UI ──

export const GLOSSARY: Record<string, string> = {
  Whisper:
    "OpenAI's open speech-recognition model. Scribewell runs it entirely inside your browser tab — the audio is never uploaded.",
  WebGPU:
    'A browser API that runs computation on your graphics card. When available, Scribewell uses it to transcribe several times faster than on the CPU.',
  WASM:
    'WebAssembly — a fast, low-level format that lets the model run at near-native speed inside the browser when WebGPU is unavailable.',
  ONNX:
    'Open Neural Network Exchange — the portable model format the Whisper weights are packaged in so they can run in the browser.',
  '16 kHz':
    'Whisper expects audio sampled 16,000 times per second in mono. Scribewell decodes and resamples your file to this before transcribing.',
  SRT: 'SubRip — the most common subtitle file format, with numbered, timestamped caption blocks. Works in most video players and editors.',
  VTT: 'WebVTT — the subtitle format used by HTML5 `<track>` captions on the web.',
  quantized:
    'A smaller, compressed version of the model (8-bit weights) that downloads faster and uses less memory, with negligible accuracy loss for speech.',
};

let tooltipEl: HTMLElement | null = null;

function ensureTooltip(): HTMLElement {
  if (tooltipEl) return tooltipEl;
  const el = document.createElement('div');
  el.className = 'glossary-tooltip';
  el.setAttribute('role', 'tooltip');
  el.hidden = true;
  document.body.appendChild(el);
  tooltipEl = el;
  return el;
}

function hide(): void {
  if (tooltipEl) tooltipEl.hidden = true;
}

/** Wrap a term in a clickable glossary span (returns an HTML string). */
export function term(name: string, label = name): string {
  const safeLabel = label.replace(/</g, '&lt;');
  return `<span class="glossary-link" data-term="${name}" tabindex="0" role="button" aria-label="Define ${name}">${safeLabel}</span>`;
}

/** Install a single delegated listener for all glossary links. */
export function initGlossary(root: HTMLElement = document.body): void {
  const show = (target: HTMLElement) => {
    const name = target.dataset.term;
    if (!name) return;
    const def = GLOSSARY[name];
    if (!def) return;
    const tip = ensureTooltip();
    tip.textContent = def;
    tip.hidden = false;
    const rect = target.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - tipRect.width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));
    let top = rect.bottom + 8;
    if (top + tipRect.height > window.innerHeight - 8) top = rect.top - tipRect.height - 8;
    tip.style.left = `${left}px`;
    tip.style.top = `${Math.max(8, top)}px`;
  };

  root.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest('.glossary-link') as HTMLElement | null;
    if (target) {
      e.stopPropagation();
      const tip = ensureTooltip();
      if (!tip.hidden && tip.textContent === GLOSSARY[target.dataset.term ?? '']) hide();
      else show(target);
    } else if (!(e.target as HTMLElement).closest('.glossary-tooltip')) {
      hide();
    }
  });

  root.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement;
    if (target.classList?.contains('glossary-link') && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      show(target);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide();
  });
  window.addEventListener('scroll', hide, true);
  window.addEventListener('resize', hide);
}
