import { describe, expect, it } from 'vitest';
import { MODELS, DEFAULT_MODEL_ID, modelById, detectEngine } from '../src/models';

describe('model catalogue', () => {
  it('exposes at least two models', () => {
    expect(MODELS.length).toBeGreaterThanOrEqual(2);
  });
  it('default id is a real model', () => {
    expect(MODELS.some((m) => m.id === DEFAULT_MODEL_ID)).toBe(true);
  });
  it('has one English-only and one multilingual option', () => {
    expect(MODELS.some((m) => m.englishOnly)).toBe(true);
    expect(MODELS.some((m) => !m.englishOnly)).toBe(true);
  });
});

describe('modelById', () => {
  it('returns the matching model', () => {
    expect(modelById('Xenova/whisper-base').label).toContain('Base');
  });
  it('falls back to the first model for unknown ids', () => {
    expect(modelById('nope/does-not-exist')).toBe(MODELS[0]);
  });
});

describe('detectEngine', () => {
  it('falls back to wasm when WebGPU is absent', async () => {
    // jsdom has no navigator.gpu
    expect(await detectEngine()).toBe('wasm');
  });
});
