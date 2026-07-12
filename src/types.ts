// ── Shared types across main thread, worker, and modules ──

/** A single timestamped transcript segment produced by Whisper. */
export interface TranscriptChunk {
  /** [startSeconds, endSeconds]. `end` may be null while a chunk is still open. */
  timestamp: [number, number | null];
  /** The text for this segment (already trimmed of leading space by us). */
  text: string;
}

/** The whole transcription result. */
export interface Transcript {
  /** Full concatenated text. */
  text: string;
  /** Timestamped chunks. */
  chunks: TranscriptChunk[];
}

export type ModelId =
  | 'Xenova/whisper-tiny.en'
  | 'Xenova/whisper-base.en'
  | 'Xenova/whisper-tiny'
  | 'Xenova/whisper-base';

export interface ModelOption {
  id: ModelId;
  label: string;
  size: string;
  multilingual: boolean;
  note: string;
}

/** Whisper task: plain transcription or translate-to-English. */
export type WhisperTask = 'transcribe' | 'translate';

export interface TranscribeSettings {
  model: ModelId;
  /** Two-letter language code, or 'auto' for detection (multilingual models only). */
  language: string;
  task: WhisperTask;
}

// ── Worker message protocol ──

export type MainToWorker =
  | { type: 'load'; model: ModelId }
  | {
      type: 'transcribe';
      audio: Float32Array;
      model: ModelId;
      language: string | null;
      task: WhisperTask;
    };

export type WorkerToMain =
  | { type: 'device'; device: 'webgpu' | 'wasm' }
  | { type: 'download'; file: string; progress: number; loaded: number; total: number }
  | { type: 'download-done'; file: string }
  | { type: 'ready' }
  | { type: 'partial'; text: string }
  | { type: 'complete'; result: Transcript }
  | { type: 'error'; message: string };

export type ExportFormat = 'txt' | 'srt' | 'vtt' | 'json';
