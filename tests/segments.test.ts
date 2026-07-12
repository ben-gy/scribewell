import { describe, expect, it } from 'vitest';
import {
  normalizeChunks,
  mergeSegments,
  estimateReadSeconds,
  joinText,
  type RawChunk,
} from '../src/segments';

describe('normalizeChunks', () => {
  it('trims text and drops empty chunks', () => {
    const raw: RawChunk[] = [
      { timestamp: [0, 1], text: '  Hello  world ' },
      { timestamp: [1, 2], text: '   ' },
    ];
    const segs = normalizeChunks(raw);
    expect(segs).toHaveLength(1);
    expect(segs[0].text).toBe('Hello world');
  });

  it('fills a null end from the next chunk start', () => {
    const raw: RawChunk[] = [
      { timestamp: [0, null], text: 'one' },
      { timestamp: [3, 4], text: 'two' },
    ];
    const segs = normalizeChunks(raw);
    expect(segs[0].end).toBe(3);
  });

  it('closes a trailing null end with the total duration', () => {
    const raw: RawChunk[] = [{ timestamp: [10, null], text: 'final' }];
    const segs = normalizeChunks(raw, 42);
    expect(segs[0].end).toBe(42);
  });

  it('estimates an end when no duration and no next chunk', () => {
    const raw: RawChunk[] = [{ timestamp: [0, null], text: 'a b c d e f' }];
    const segs = normalizeChunks(raw, 0);
    expect(segs[0].end).toBeGreaterThan(0);
  });

  it('guards against invalid/negative start times', () => {
    const raw: RawChunk[] = [{ timestamp: [-5 as number, 2], text: 'x' }];
    const segs = normalizeChunks(raw);
    expect(segs[0].start).toBe(0);
  });
});

describe('estimateReadSeconds', () => {
  it('is at least one second', () => {
    expect(estimateReadSeconds('hi')).toBe(1);
  });
  it('scales with word count', () => {
    expect(estimateReadSeconds('one two three four five six')).toBeCloseTo(2, 5);
  });
});

describe('mergeSegments', () => {
  it('merges adjacent fragments within the gap', () => {
    const merged = mergeSegments([
      { start: 0, end: 1, text: 'the quick' },
      { start: 1.2, end: 2, text: 'brown fox' },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].text).toBe('the quick brown fox');
    expect(merged[0].end).toBe(2);
  });

  it('does not merge across a large gap', () => {
    const merged = mergeSegments([
      { start: 0, end: 1, text: 'first' },
      { start: 5, end: 6, text: 'second' },
    ]);
    expect(merged).toHaveLength(2);
  });

  it('breaks after sentence-ending punctuation', () => {
    const merged = mergeSegments([
      { start: 0, end: 1, text: 'Done.' },
      { start: 1.1, end: 2, text: 'Next one' },
    ]);
    expect(merged).toHaveLength(2);
  });

  it('respects the max character cap', () => {
    const long = 'word '.repeat(50).trim();
    const merged = mergeSegments(
      [
        { start: 0, end: 1, text: long },
        { start: 1.1, end: 2, text: long },
      ],
      0.6,
      100,
      220,
    );
    expect(merged.length).toBe(2);
  });

  it('handles empty input', () => {
    expect(mergeSegments([])).toEqual([]);
  });
});

describe('joinText', () => {
  it('joins segment texts and normalises whitespace', () => {
    expect(
      joinText([
        { start: 0, end: 1, text: 'a  b' },
        { start: 1, end: 2, text: 'c' },
      ]),
    ).toBe('a b c');
  });
});
