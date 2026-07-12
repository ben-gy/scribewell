import { describe, expect, it } from 'vitest';
import { mixToMono, resampleLinear, TARGET_SAMPLE_RATE } from '../src/audio';

describe('mixToMono', () => {
  it('returns the single channel unchanged', () => {
    const ch = new Float32Array([0.1, 0.2, 0.3]);
    expect(mixToMono([ch])).toBe(ch);
  });
  it('averages multiple channels', () => {
    const l = new Float32Array([1, 0, -1]);
    const r = new Float32Array([0, 1, 1]);
    const mono = mixToMono([l, r]);
    expect(Array.from(mono)).toEqual([0.5, 0.5, 0]);
  });
  it('handles empty input', () => {
    expect(mixToMono([]).length).toBe(0);
  });
});

describe('resampleLinear', () => {
  it('returns input unchanged when rates match', () => {
    const x = new Float32Array([1, 2, 3]);
    expect(resampleLinear(x, 16000, 16000)).toBe(x);
  });
  it('downsamples length by the rate ratio', () => {
    const x = new Float32Array(48000).fill(0.5);
    const out = resampleLinear(x, 48000, TARGET_SAMPLE_RATE);
    expect(out.length).toBe(16000);
    expect(out[0]).toBeCloseTo(0.5, 5);
    expect(out[out.length - 1]).toBeCloseTo(0.5, 5);
  });
  it('upsamples length up by the rate ratio', () => {
    const x = new Float32Array([0, 1]);
    const out = resampleLinear(x, 8000, 16000);
    expect(out.length).toBe(4);
    // linear interpolation between 0 and 1
    expect(out[0]).toBeCloseTo(0, 5);
  });
  it('interpolates linearly between samples', () => {
    const x = new Float32Array([0, 10]);
    const out = resampleLinear(x, 2, 4); // ratio 0.5 → 4 samples
    expect(out[0]).toBeCloseTo(0, 5);
    expect(out[1]).toBeCloseTo(5, 5);
  });
  it('handles empty input', () => {
    expect(resampleLinear(new Float32Array(0), 44100, 16000).length).toBe(0);
  });
});
