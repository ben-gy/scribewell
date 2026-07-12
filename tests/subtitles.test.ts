import { describe, expect, it } from 'vitest';
import {
  formatTimestamp,
  normalizeChunks,
  toPlainText,
  toSRT,
  toVTT,
  toJSON,
  serialize,
  exportFilename,
} from '../src/subtitles';
import type { Transcript } from '../src/types';

const sample: Transcript = {
  text: 'Hello world. This is a test.',
  chunks: [
    { timestamp: [0, 1.5], text: ' Hello world.' },
    { timestamp: [1.5, 3.25], text: ' This is a test.' },
  ],
};

describe('formatTimestamp', () => {
  it('formats seconds with comma separator (SRT)', () => {
    expect(formatTimestamp(0, ',')).toBe('00:00:00,000');
    expect(formatTimestamp(1.5, ',')).toBe('00:00:01,500');
    expect(formatTimestamp(3661.234, ',')).toBe('01:01:01,234');
  });

  it('formats seconds with dot separator (VTT)', () => {
    expect(formatTimestamp(62.5, '.')).toBe('00:01:02.500');
  });

  it('clamps negatives and non-finite to zero', () => {
    expect(formatTimestamp(-5)).toBe('00:00:00,000');
    expect(formatTimestamp(NaN)).toBe('00:00:00,000');
  });

  it('rounds milliseconds correctly', () => {
    expect(formatTimestamp(0.9999, ',')).toBe('00:00:01,000');
  });
});

describe('normalizeChunks', () => {
  it('closes a null end against the next chunk start', () => {
    const segs = normalizeChunks([
      { timestamp: [0, null], text: 'a' },
      { timestamp: [2, 4], text: 'b' },
    ]);
    expect(segs[0]).toEqual({ start: 0, end: 2, text: 'a' });
  });

  it('pads a trailing null end when there is no next chunk', () => {
    const segs = normalizeChunks([{ timestamp: [5, null], text: 'end' }]);
    expect(segs[0].start).toBe(5);
    expect(segs[0].end).toBe(7);
  });

  it('drops empty/whitespace-only chunks', () => {
    const segs = normalizeChunks([
      { timestamp: [0, 1], text: '   ' },
      { timestamp: [1, 2], text: 'kept' },
    ]);
    expect(segs).toHaveLength(1);
    expect(segs[0].text).toBe('kept');
  });

  it('fixes end <= start', () => {
    const segs = normalizeChunks([{ timestamp: [3, 3], text: 'x' }]);
    expect(segs[0].end).toBeGreaterThan(segs[0].start);
  });

  it('clamps negative start to zero', () => {
    const segs = normalizeChunks([{ timestamp: [-1, 2], text: 'y' }]);
    expect(segs[0].start).toBe(0);
  });
});

describe('toPlainText', () => {
  it('joins and collapses whitespace', () => {
    expect(toPlainText(sample)).toBe('Hello world. This is a test.');
  });

  it('falls back to transcript.text when no chunks', () => {
    expect(toPlainText({ text: 'fallback', chunks: [] })).toBe('fallback');
  });
});

describe('toSRT', () => {
  it('produces numbered, timestamped blocks', () => {
    const srt = toSRT(sample);
    expect(srt).toContain('1\n00:00:00,000 --> 00:00:01,500\nHello world.');
    expect(srt).toContain('2\n00:00:01,500 --> 00:00:03,250\nThis is a test.');
  });

  it('returns empty string for no chunks', () => {
    expect(toSRT({ text: '', chunks: [] })).toBe('');
  });
});

describe('toVTT', () => {
  it('starts with the WEBVTT header and uses dot separators', () => {
    const vtt = toVTT(sample);
    expect(vtt.startsWith('WEBVTT\n\n')).toBe(true);
    expect(vtt).toContain('00:00:00.000 --> 00:00:01.500');
  });
});

describe('toJSON', () => {
  it('is valid JSON with text and segments', () => {
    const parsed = JSON.parse(toJSON(sample));
    expect(parsed.text).toBe('Hello world. This is a test.');
    expect(parsed.segments).toHaveLength(2);
    expect(parsed.segments[0]).toHaveProperty('start', 0);
  });
});

describe('serialize', () => {
  it('dispatches to the right format', () => {
    expect(serialize(sample, 'txt')).toBe(toPlainText(sample));
    expect(serialize(sample, 'srt')).toBe(toSRT(sample));
    expect(serialize(sample, 'vtt')).toBe(toVTT(sample));
    expect(serialize(sample, 'json')).toBe(toJSON(sample));
  });
});

describe('exportFilename', () => {
  it('swaps the extension', () => {
    expect(exportFilename('meeting.mp3', 'srt')).toBe('meeting.srt');
    expect(exportFilename('clip.final.mov', 'txt')).toBe('clip.final.txt');
  });

  it('falls back to transcript for empty names', () => {
    expect(exportFilename('', 'vtt')).toBe('transcript.vtt');
  });
});
