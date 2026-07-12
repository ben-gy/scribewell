/**
 * Normalisation of raw Whisper output into clean, timed segments.
 *
 * transformers.js returns chunks like `{ timestamp: [start, end|null], text }`.
 * End timestamps can be null (especially the final chunk), starts can repeat,
 * and text may be empty or whitespace. These pure helpers make the stream
 * safe to render and export. Fully unit-tested.
 */

import type { Segment } from './types';

export interface RawChunk {
  timestamp: [number, number | null];
  text: string;
}

/**
 * Convert raw Whisper chunks into ordered, gap-filled segments.
 * @param chunks    raw model output
 * @param durationSec total audio length, used to close a trailing null end
 */
export function normalizeChunks(chunks: RawChunk[], durationSec = 0): Segment[] {
  const segments: Segment[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    const text = (c.text ?? '').replace(/\s+/g, ' ').trim();
    if (!text) continue;

    const rawStart = c.timestamp?.[0];
    const start = Number.isFinite(rawStart) && (rawStart as number) >= 0 ? (rawStart as number) : 0;

    let end = c.timestamp?.[1];
    if (!Number.isFinite(end) || (end as number) <= start) {
      // Fall back to the next chunk's start, then the total duration.
      const nextStart = chunks[i + 1]?.timestamp?.[0];
      if (Number.isFinite(nextStart) && (nextStart as number) > start) {
        end = nextStart as number;
      } else if (durationSec > start) {
        end = durationSec;
      } else {
        end = start + estimateReadSeconds(text);
      }
    }

    segments.push({ start, end: end as number, text });
  }
  return segments;
}

/** Rough spoken duration for a piece of text (~3 words/sec), min 1s. */
export function estimateReadSeconds(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, words / 3);
}

/** Collapse many tiny fragments into readable lines, capped by duration/length. */
export function mergeSegments(
  segments: Segment[],
  maxGapSec = 0.6,
  maxDurationSec = 12,
  maxChars = 220,
): Segment[] {
  const merged: Segment[] = [];
  for (const seg of segments) {
    const last = merged[merged.length - 1];
    const endsSentence = last && /[.!?]["')\]]?$/.test(last.text);
    if (
      last &&
      !endsSentence &&
      seg.start - last.end <= maxGapSec &&
      seg.end - last.start <= maxDurationSec &&
      last.text.length + seg.text.length + 1 <= maxChars
    ) {
      last.end = seg.end;
      last.text = `${last.text} ${seg.text}`.replace(/\s+/g, ' ').trim();
    } else {
      merged.push({ ...seg });
    }
  }
  return merged;
}

/** Join segment texts into one transcript string. */
export function joinText(segments: Segment[]): string {
  return segments
    .map((s) => s.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}
