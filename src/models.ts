// ── Model catalogue + settings persistence ──

import type { ModelId, ModelOption, TranscribeSettings } from './types';

export const MODELS: ModelOption[] = [
  {
    id: 'Xenova/whisper-tiny.en',
    label: 'Tiny (English)',
    size: '~40 MB',
    multilingual: false,
    note: 'Fastest. Best for clear English speech.',
  },
  {
    id: 'Xenova/whisper-base.en',
    label: 'Base (English)',
    size: '~80 MB',
    multilingual: false,
    note: 'More accurate English. A little slower.',
  },
  {
    id: 'Xenova/whisper-tiny',
    label: 'Tiny (Multilingual)',
    size: '~40 MB',
    multilingual: true,
    note: 'Fast. Handles 90+ languages & translate-to-English.',
  },
  {
    id: 'Xenova/whisper-base',
    label: 'Base (Multilingual)',
    size: '~80 MB',
    multilingual: true,
    note: 'Best all-rounder for non-English audio.',
  },
];

export function modelById(id: ModelId): ModelOption {
  return MODELS.find((m) => m.id === id) ?? MODELS[0];
}

/** Common languages for the multilingual picker (Whisper supports many more). */
export const LANGUAGES: Array<{ code: string; name: string }> = [
  { code: 'auto', name: 'Auto-detect' },
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'nl', name: 'Dutch' },
  { code: 'ru', name: 'Russian' },
  { code: 'pl', name: 'Polish' },
  { code: 'uk', name: 'Ukrainian' },
  { code: 'ar', name: 'Arabic' },
  { code: 'hi', name: 'Hindi' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'zh', name: 'Chinese' },
  { code: 'tr', name: 'Turkish' },
  { code: 'sv', name: 'Swedish' },
  { code: 'id', name: 'Indonesian' },
  { code: 'vi', name: 'Vietnamese' },
];

const SETTINGS_KEY = 'scribewell.settings.v1';

export const DEFAULT_SETTINGS: TranscribeSettings = {
  // Tiny.en is the lightest, fastest checkpoint and is transcribed at full
  // fp32 precision on WebGPU — a small, correct first-run default. Users who
  // need more accuracy or other languages can switch to a Base/multilingual
  // model in one click.
  model: 'Xenova/whisper-tiny.en',
  language: 'auto',
  task: 'transcribe',
};

export function loadSettings(): TranscribeSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<TranscribeSettings>;
    const model = MODELS.some((m) => m.id === parsed.model)
      ? (parsed.model as ModelId)
      : DEFAULT_SETTINGS.model;
    return {
      model,
      language: typeof parsed.language === 'string' ? parsed.language : DEFAULT_SETTINGS.language,
      task: parsed.task === 'translate' ? 'translate' : 'transcribe',
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: TranscribeSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* storage may be unavailable (private mode); non-fatal */
  }
}

const THEME_KEY = 'scribewell.theme.v1';
export type Theme = 'light' | 'dark' | 'system';

export function loadTheme(): Theme {
  const t = (() => {
    try {
      return localStorage.getItem(THEME_KEY);
    } catch {
      return null;
    }
  })();
  return t === 'light' || t === 'dark' ? t : 'system';
}

export function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* non-fatal */
  }
}
