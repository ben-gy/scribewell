import { describe, expect, it, beforeEach } from 'vitest';
import {
  MODELS,
  modelById,
  LANGUAGES,
  loadSettings,
  saveSettings,
  DEFAULT_SETTINGS,
  loadTheme,
  saveTheme,
} from '../src/models';

beforeEach(() => {
  localStorage.clear();
});

describe('model catalogue', () => {
  it('has english and multilingual variants', () => {
    expect(MODELS.some((m) => !m.multilingual)).toBe(true);
    expect(MODELS.some((m) => m.multilingual)).toBe(true);
  });

  it('modelById returns a known model and falls back safely', () => {
    expect(modelById('Xenova/whisper-tiny.en').id).toBe('Xenova/whisper-tiny.en');
    // @ts-expect-error deliberately invalid id
    expect(modelById('nope').id).toBe(MODELS[0].id);
  });

  it('language list starts with auto-detect', () => {
    expect(LANGUAGES[0].code).toBe('auto');
  });
});

describe('settings persistence', () => {
  it('returns defaults when nothing stored', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips saved settings', () => {
    saveSettings({ model: 'Xenova/whisper-base', language: 'fr', task: 'translate' });
    const loaded = loadSettings();
    expect(loaded.model).toBe('Xenova/whisper-base');
    expect(loaded.language).toBe('fr');
    expect(loaded.task).toBe('translate');
  });

  it('sanitises an unknown model back to default', () => {
    localStorage.setItem(
      'scribewell.settings.v1',
      JSON.stringify({ model: 'evil/model', language: 'en', task: 'transcribe' }),
    );
    expect(loadSettings().model).toBe(DEFAULT_SETTINGS.model);
  });

  it('sanitises an invalid task', () => {
    localStorage.setItem(
      'scribewell.settings.v1',
      JSON.stringify({ model: 'Xenova/whisper-tiny', language: 'en', task: 'hack' }),
    );
    expect(loadSettings().task).toBe('transcribe');
  });

  it('survives malformed JSON', () => {
    localStorage.setItem('scribewell.settings.v1', '{not json');
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});

describe('theme persistence', () => {
  it('defaults to system', () => {
    expect(loadTheme()).toBe('system');
  });

  it('round-trips a theme', () => {
    saveTheme('dark');
    expect(loadTheme()).toBe('dark');
  });

  it('ignores an invalid stored theme', () => {
    localStorage.setItem('scribewell.theme.v1', 'rainbow');
    expect(loadTheme()).toBe('system');
  });
});
