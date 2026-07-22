// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
// ── Transcript → export formats. Pure functions, heavily unit-tested. ──

import type { Transcript, TranscriptChunk, ExportFormat } from './types';

/**
 * Format a time in seconds as a subtitle timestamp.
 * SRT uses a comma before milliseconds ("00:01:02,500"); VTT uses a dot.
 */
export function formatTimestamp(seconds: number, msSeparator: ',' | '.' = ','): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const totalMs = Math.round(seconds * 1000);
  const ms = totalMs % 1000;
  const totalSec = (totalMs - ms) / 1000;
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60) % 60;
  const h = Math.floor(totalSec / 3600);
  const pad = (n: number, w = 2) => n.toString().padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}${msSeparator}${pad(ms, 3)}`;
}

/**
 * Ensure every chunk has a usable [start, end] pair. Whisper sometimes leaves a
 * trailing chunk with a null end; we close it against the next chunk's start,
 * the previous end, or a small fixed padding so exports never contain nulls.
 */
export function normalizeChunks(chunks: TranscriptChunk[]): Array<{
  start: number;
  end: number;
  text: string;
}> {
  const out: Array<{ start: number; end: number; text: string }> = [];
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    const text = c.text.trim();
    if (!text) continue;
    const start = Math.max(0, c.timestamp[0] ?? 0);
    let end = c.timestamp[1];
    if (end == null || end <= start) {
      const next = chunks[i + 1];
      const nextStart = next?.timestamp[0];
      end = nextStart != null && nextStart > start ? nextStart : start + 2;
    }
    out.push({ start, end, text });
  }
  return out;
}

/** Concatenate chunk text into a single readable paragraph string. */
export function toPlainText(transcript: Transcript): string {
  const joined = transcript.chunks
    .map((c) => c.text.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return joined || transcript.text.trim();
}

/** Build a SubRip (.srt) document. */
export function toSRT(transcript: Transcript): string {
  const segs = normalizeChunks(transcript.chunks);
  return segs
    .map((seg, i) => {
      const from = formatTimestamp(seg.start, ',');
      const to = formatTimestamp(seg.end, ',');
      return `${i + 1}\n${from} --> ${to}\n${seg.text}`;
    })
    .join('\n\n')
    .concat(segs.length ? '\n' : '');
}

/** Build a WebVTT (.vtt) document. */
export function toVTT(transcript: Transcript): string {
  const segs = normalizeChunks(transcript.chunks);
  const body = segs
    .map((seg) => {
      const from = formatTimestamp(seg.start, '.');
      const to = formatTimestamp(seg.end, '.');
      return `${from} --> ${to}\n${seg.text}`;
    })
    .join('\n\n');
  return `WEBVTT\n\n${body}${segs.length ? '\n' : ''}`;
}

/** Build a pretty JSON document with timestamped chunks. */
export function toJSON(transcript: Transcript): string {
  const segs = normalizeChunks(transcript.chunks);
  return JSON.stringify(
    {
      text: toPlainText(transcript),
      segments: segs,
    },
    null,
    2,
  );
}

export function serialize(transcript: Transcript, format: ExportFormat): string {
  switch (format) {
    case 'txt':
      return toPlainText(transcript);
    case 'srt':
      return toSRT(transcript);
    case 'vtt':
      return toVTT(transcript);
    case 'json':
      return toJSON(transcript);
  }
}

export const MIME_BY_FORMAT: Record<ExportFormat, string> = {
  txt: 'text/plain',
  srt: 'application/x-subrip',
  vtt: 'text/vtt',
  json: 'application/json',
};

/** Derive a download filename from the source name and target format. */
export function exportFilename(sourceName: string, format: ExportFormat): string {
  const base = sourceName.replace(/\.[^./\\]+$/, '').trim() || 'transcript';
  return `${base}.${format}`;
}
