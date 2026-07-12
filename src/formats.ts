/**
 * Transcript export formats — pure functions, fully unit-tested.
 *
 * Turns an array of timestamped segments into plain text, SubRip (.srt),
 * and WebVTT (.vtt). All string-building, no DOM, no I/O.
 */

import type { Segment } from './types';

/**
 * Format a time in seconds as `HH:MM:SS<sep>mmm`.
 * SRT uses a comma before milliseconds; VTT uses a dot.
 */
export function formatTimestamp(totalSeconds: number, msSep: ',' | '.' = ','): string {
  const t = Number.isFinite(totalSeconds) && totalSeconds > 0 ? totalSeconds : 0;
  const ms = Math.round(t * 1000);
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  const millis = ms % 1000;
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}${msSep}${pad(millis, 3)}`;
}

/** Compact `M:SS` / `H:MM:SS` label for the in-app reader. */
export function formatClock(totalSeconds: number): string {
  const t = Number.isFinite(totalSeconds) && totalSeconds > 0 ? Math.floor(totalSeconds) : 0;
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Trim surrounding whitespace and collapse internal runs. */
function clean(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Plain text — one paragraph per segment, blank-line separated. */
export function toPlainText(segments: Segment[]): string {
  return segments
    .map((s) => clean(s.text))
    .filter((s) => s.length > 0)
    .join('\n\n');
}

/** SubRip (.srt). */
export function toSRT(segments: Segment[]): string {
  const usable = segments.filter((s) => clean(s.text).length > 0);
  return (
    usable
      .map((s, i) => {
        const start = formatTimestamp(s.start, ',');
        const end = formatTimestamp(Math.max(s.end, s.start), ',');
        return `${i + 1}\n${start} --> ${end}\n${clean(s.text)}`;
      })
      .join('\n\n') + (usable.length ? '\n' : '')
  );
}

/** WebVTT (.vtt). */
export function toVTT(segments: Segment[]): string {
  const usable = segments.filter((s) => clean(s.text).length > 0);
  const cues = usable
    .map((s) => {
      const start = formatTimestamp(s.start, '.');
      const end = formatTimestamp(Math.max(s.end, s.start), '.');
      return `${start} --> ${end}\n${clean(s.text)}`;
    })
    .join('\n\n');
  return `WEBVTT\n\n${cues}${cues ? '\n' : ''}`;
}

export type ExportFormat = 'txt' | 'srt' | 'vtt';

export interface ExportBundle {
  content: string;
  mime: string;
  extension: string;
}

export function buildExport(segments: Segment[], format: ExportFormat): ExportBundle {
  switch (format) {
    case 'srt':
      return { content: toSRT(segments), mime: 'application/x-subrip', extension: 'srt' };
    case 'vtt':
      return { content: toVTT(segments), mime: 'text/vtt', extension: 'vtt' };
    case 'txt':
    default:
      return { content: toPlainText(segments), mime: 'text/plain', extension: 'txt' };
  }
}

/** Derive a safe output filename stem from the source filename. */
export function baseName(fileName: string): string {
  const stem = fileName.replace(/\.[^./\\]+$/, '').replace(/[/\\]/g, '_');
  const safe = stem.replace(/[^\w.\- ]+/g, '').trim();
  return safe.length ? safe : 'transcript';
}
