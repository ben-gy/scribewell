import { describe, expect, it } from 'vitest';
import { formatBytes, formatDuration, clamp, formatPercent } from '../src/format';

describe('formatBytes', () => {
  it('formats bytes, KB, MB, GB', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1048576)).toBe('1 MB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB');
  });

  it('guards against negatives and NaN', () => {
    expect(formatBytes(-10)).toBe('0 B');
    expect(formatBytes(NaN)).toBe('0 B');
  });
});

describe('formatDuration', () => {
  it('formats minutes and seconds', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(600)).toBe('10:00');
  });

  it('adds hours when needed', () => {
    expect(formatDuration(3661)).toBe('1:01:01');
  });

  it('guards against negatives', () => {
    expect(formatDuration(-3)).toBe('0:00');
  });
});

describe('clamp', () => {
  it('clamps into range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
});

describe('formatPercent', () => {
  it('renders a rounded percentage', () => {
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(0.5)).toBe('50%');
    expect(formatPercent(1)).toBe('100%');
    expect(formatPercent(1.4)).toBe('100%');
    expect(formatPercent(0.333)).toBe('33%');
  });
});
