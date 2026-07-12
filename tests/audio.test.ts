import { describe, expect, it } from 'vitest';
import { downmixToMono, resampleLinear, durationSeconds } from '../src/audio';

describe('downmixToMono', () => {
  it('returns the single channel unchanged', () => {
    const ch = new Float32Array([0.1, 0.2, 0.3]);
    expect(downmixToMono([ch])).toBe(ch);
  });

  it('averages two channels', () => {
    const l = new Float32Array([1, 0, -1]);
    const r = new Float32Array([0, 0, 1]);
    const mono = downmixToMono([l, r]);
    expect(Array.from(mono)).toEqual([0.5, 0, 0]);
  });

  it('returns empty for no channels', () => {
    expect(downmixToMono([]).length).toBe(0);
  });

  it('handles three channels', () => {
    const mono = downmixToMono([
      new Float32Array([3]),
      new Float32Array([3]),
      new Float32Array([3]),
    ]);
    expect(mono[0]).toBeCloseTo(3);
  });
});

describe('resampleLinear', () => {
  it('returns input unchanged when rates match', () => {
    const input = new Float32Array([1, 2, 3]);
    expect(resampleLinear(input, 16000, 16000)).toBe(input);
  });

  it('downsamples by half to roughly half the length', () => {
    const input = new Float32Array([0, 1, 2, 3, 4, 5, 6, 7]);
    const out = resampleLinear(input, 32000, 16000);
    expect(out.length).toBe(4);
    expect(out[0]).toBeCloseTo(0);
    expect(out[1]).toBeCloseTo(2);
  });

  it('upsamples to a longer buffer', () => {
    const input = new Float32Array([0, 1]);
    const out = resampleLinear(input, 8000, 16000);
    expect(out.length).toBe(4);
    expect(out[0]).toBeCloseTo(0);
  });

  it('interpolates between samples', () => {
    const input = new Float32Array([0, 10]);
    const out = resampleLinear(input, 2, 4); // ratio 0.5
    // positions 0, 0.5, 1, 1.5 -> 0, 5, 10, 10
    expect(out[1]).toBeCloseTo(5);
  });

  it('returns empty for empty input', () => {
    expect(resampleLinear(new Float32Array(0), 44100, 16000).length).toBe(0);
  });

  it('guards against invalid rates', () => {
    expect(resampleLinear(new Float32Array([1, 2]), 0, 16000).length).toBe(0);
  });
});

describe('durationSeconds', () => {
  it('computes duration from sample count', () => {
    expect(durationSeconds(new Float32Array(16000))).toBeCloseTo(1);
    expect(durationSeconds(new Float32Array(8000), 16000)).toBeCloseTo(0.5);
  });
});
