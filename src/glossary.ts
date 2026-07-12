/**
 * Glossary — jargon → plain-English definitions, plus a tiny click-to-define
 * tooltip. Any element with `.glossary-link[data-term]` becomes clickable.
 */

export const GLOSSARY: Record<string, string> = {
  whisper:
    'An open speech-recognition model from OpenAI. Scribewell runs it locally in your browser — no audio is uploaded.',
  webgpu:
    'A browser API that lets code use your graphics card. When available, it makes transcription several times faster.',
  wasm:
    'WebAssembly — a way to run near-native compiled code in the browser. It runs the model on your CPU when WebGPU is unavailable.',
  pcm:
    'Raw uncompressed audio samples. Scribewell decodes your file to 16 kHz mono PCM, the format the model expects.',
  srt:
    'SubRip — the most common subtitle file format, with numbered cues and start/end times. Works in most video editors and players.',
  vtt:
    'WebVTT — the web-native subtitle format used by HTML5 <video>. Similar to SRT with slightly different timestamps.',
  'model weights':
    'The trained parameters that make the model work. Downloaded once from a CDN, then cached so future runs are offline.',
  timestamp:
    'The start and end time of a spoken segment, so you can jump to that moment or build subtitles.',
};

let tooltipEl: HTMLElement | null = null;

function ensureTooltip(): HTMLElement {
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'glossary-tooltip';
    tooltipEl.setAttribute('role', 'tooltip');
    document.body.appendChild(tooltipEl);
  }
  return tooltipEl;
}

function hide(): void {
  tooltipEl?.classList.remove('visible');
}

/** Wire click-to-define behaviour for the whole document. Call once. */
export function initGlossary(): void {
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const link = target.closest<HTMLElement>('.glossary-link[data-term]');
    if (!link) {
      hide();
      return;
    }
    e.preventDefault();
    const term = (link.dataset.term ?? '').toLowerCase();
    const def = GLOSSARY[term];
    if (!def) return;
    const tip = ensureTooltip();
    tip.textContent = def;
    const rect = link.getBoundingClientRect();
    tip.style.left = `${Math.min(rect.left, window.innerWidth - 320)}px`;
    tip.style.top = `${rect.bottom + 8}px`;
    tip.classList.add('visible');
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide();
  });
  window.addEventListener('scroll', hide, true);
}
