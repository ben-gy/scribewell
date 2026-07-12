/**
 * Shared types for Scribewell.
 */

/** A single transcribed segment with start/end times in seconds. */
export interface Segment {
  start: number;
  end: number;
  text: string;
}

/** The full result of a transcription run. */
export interface TranscriptResult {
  segments: Segment[];
  text: string;
  durationSec: number;
}

/** Which Whisper model to run. */
export interface ModelChoice {
  id: string;
  label: string;
  /** English-only models are faster and slightly better on English audio. */
  englishOnly: boolean;
  /** Approximate on-disk download size, human readable. */
  size: string;
  /** One-line guidance shown in the picker. */
  blurb: string;
}

export type Engine = 'webgpu' | 'wasm';

/** Decoded audio ready for the model. */
export interface DecodedAudio {
  /** 16 kHz mono PCM in [-1, 1]. */
  samples: Float32Array;
  durationSec: number;
}

// ---- Worker RPC message contracts ----

export type MainToWorker =
  | { type: 'load'; modelId: string; engine: Engine }
  | { type: 'transcribe'; samples: Float32Array; englishOnly: boolean };

export type WorkerToMain =
  | { type: 'ready'; engine: Engine }
  | { type: 'download'; progress: number; file: string }
  | { type: 'model-ready' }
  | { type: 'chunk'; segments: Segment[] }
  | { type: 'progress'; processedSec: number; totalSec: number }
  | { type: 'done'; result: TranscriptResult }
  | { type: 'error'; message: string };
