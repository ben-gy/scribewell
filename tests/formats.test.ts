import { describe, expect, it } from 'vitest';
import {
  formatTimestamp,
  formatClock,
  toPlainText,
  toSRT,
  toVTT,
  buildExport,
  baseName,
} from '../src/formats';
import type { Segment } from '../src/types';

const segs: Segment[] = [
  { start: 0, end: 2.5, text: 'Hello there.' },
  { start: 2.5, end: 5.75, text: '  General   Kenobi.  ' },
  { start: 3661.2, end: 3663, text: 'Late segment.' },
];

describe('formatTimestamp', () => {
  it('formats SRT timestamps with comma', () => {
    expect(formatTimestamp(0, ',')).toBe('00:00:00,000');
    expect(formatTimestamp(2.5, ',')).toBe('00:00:02,500');
    expect(formatTimestamp(3661.2, ',')).toBe('01:01:01,200');
  });
  it('formats VTT timestamps with dot', () => {
    expect(formatTimestamp(5.75, '.')).toBe('00:00:05,750'.replace(',', '.'));
  });
  it('clamps negative and non-finite to zero', () => {
    expect(formatTimestamp(-4)).toBe('00:00:00,000');
    expect(formatTimestamp(NaN)).toBe('00:00:00,000');
  });
});

describe('formatClock', () => {
  it('uses M:SS under an hour', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(65)).toBe('1:05');
  });
  it('uses H:MM:SS at/over an hour', () => {
    expect(formatClock(3661)).toBe('1:01:01');
  });
});

describe('toPlainText', () => {
  it('collapses whitespace and drops empties', () => {
    const out = toPlainText([...segs, { start: 6, end: 7, text: '   ' }]);
    expect(out).toContain('General Kenobi.');
    expect(out.split('\n\n')).toHaveLength(3);
  });
  it('handles empty input', () => {
    expect(toPlainText([])).toBe('');
  });
});

describe('toSRT', () => {
  it('numbers cues from 1 and formats arrows', () => {
    const srt = toSRT(segs);
    expect(srt.startsWith('1\n00:00:00,000 --> 00:00:02,500\nHello there.')).toBe(true);
    expect(srt).toContain('2\n00:00:02,500 --> 00:00:05,750\nGeneral Kenobi.');
  });
  it('renumbers after skipping empty segments', () => {
    const srt = toSRT([segs[0], { start: 3, end: 3, text: '' }, segs[1]]);
    // Only two usable cues → numbered 1 and 2
    expect(srt).toContain('1\n');
    expect(srt).toContain('2\n');
    expect(srt).not.toContain('3\n');
  });
  it('returns empty string with no usable segments', () => {
    expect(toSRT([])).toBe('');
  });
});

describe('toVTT', () => {
  it('starts with the WEBVTT header and dot timestamps', () => {
    const vtt = toVTT(segs);
    expect(vtt.startsWith('WEBVTT\n\n')).toBe(true);
    expect(vtt).toContain('00:00:00.000 --> 00:00:02.500');
  });
});

describe('buildExport', () => {
  it('selects mime/extension per format', () => {
    expect(buildExport(segs, 'txt').extension).toBe('txt');
    expect(buildExport(segs, 'srt').mime).toBe('application/x-subrip');
    expect(buildExport(segs, 'vtt').mime).toBe('text/vtt');
  });
});

describe('baseName', () => {
  it('strips the extension', () => {
    expect(baseName('interview.mp3')).toBe('interview');
    expect(baseName('my.long.name.wav')).toBe('my.long.name');
  });
  it('sanitises path separators and unsafe chars', () => {
    expect(baseName('a/b\\c.mp4')).toBe('a_b_c');
    expect(baseName('re:cording*?.m4a')).toBe('recording');
  });
  it('falls back to transcript for empty stems', () => {
    expect(baseName('.mp3')).toBe('transcript');
    expect(baseName('')).toBe('transcript');
  });
});
