/// <reference lib="webworker" />
/**
 * Transcription worker.
 *
 * Hosts the Whisper pipeline (transformers.js) off the main thread. Streams
 * model-download progress, then runs inference with 30s chunking and word
 * timestamps, posting partial segments as they arrive.
 *
 * No user audio ever leaves this worker except as the resulting text — the
 * only network traffic is the one-time model-weight download from the HF CDN.
 */

import {
  pipeline,
  env,
  type AutomaticSpeechRecognitionPipeline,
} from '@huggingface/transformers';
import type { MainToWorker, WorkerToMain, Segment } from './types';
import { normalizeChunks, mergeSegments, joinText, type RawChunk } from './segments';

// We never look for local model files; always resolve from the HF hub + cache.
env.allowLocalModels = false;

let transcriber: AutomaticSpeechRecognitionPipeline | null = null;
let loadedModelId: string | null = null;
let loadedEngine: 'webgpu' | 'wasm' = 'wasm';

function post(msg: WorkerToMain, transfer?: Transferable[]): void {
  (self as unknown as Worker).postMessage(msg, transfer ?? []);
}

async function load(modelId: string, engine: 'webgpu' | 'wasm'): Promise<void> {
  if (transcriber && loadedModelId === modelId && loadedEngine === engine) {
    post({ type: 'model-ready' });
    return;
  }
  // Dispose a previously loaded (different) model.
  if (transcriber) {
    try {
      await transcriber.dispose();
    } catch {
      /* ignore */
    }
    transcriber = null;
  }

  const options: Record<string, unknown> = {
    // q8 keeps the download small and runs well on both WASM and WebGPU.
    dtype: engine === 'webgpu' ? 'fp16' : 'q8',
    device: engine,
    progress_callback: (p: { status: string; file?: string; progress?: number }) => {
      if (p.status === 'progress' && typeof p.progress === 'number') {
        post({ type: 'download', progress: p.progress, file: p.file ?? '' });
      }
    },
  };

  // The `pipeline` overloads produce a union too large for tsc to represent;
  // call through a narrowed signature.
  const loadPipeline = pipeline as unknown as (
    task: string,
    model: string,
    opts: Record<string, unknown>,
  ) => Promise<AutomaticSpeechRecognitionPipeline>;

  try {
    transcriber = await loadPipeline('automatic-speech-recognition', modelId, options);
    loadedEngine = engine;
  } catch (err) {
    // WebGPU can fail on some drivers — fall back to WASM once.
    if (engine === 'webgpu') {
      options.device = 'wasm';
      options.dtype = 'q8';
      transcriber = await loadPipeline('automatic-speech-recognition', modelId, options);
      loadedEngine = 'wasm';
    } else {
      throw err;
    }
  }
  loadedModelId = modelId;
  post({ type: 'ready', engine: loadedEngine });
  post({ type: 'model-ready' });
}

async function transcribe(samples: Float32Array, englishOnly: boolean): Promise<void> {
  if (!transcriber) throw new Error('Model is not loaded.');
  const totalSec = samples.length / 16_000;

  const output = (await transcriber(samples, {
    chunk_length_s: 30,
    stride_length_s: 5,
    return_timestamps: true,
    language: englishOnly ? 'english' : undefined,
    task: 'transcribe',
    // Fires once per completed 30s chunk — drives determinate progress.
    chunk_callback: (chunk: { chunks?: RawChunk[] }) => {
      const raw = chunk?.chunks ?? [];
      if (raw.length) {
        const segs: Segment[] = mergeSegments(normalizeChunks(raw, totalSec));
        post({ type: 'chunk', segments: segs });
        const processed = raw[raw.length - 1]?.timestamp?.[0] ?? 0;
        post({ type: 'progress', processedSec: processed as number, totalSec });
      }
    },
  } as unknown as Record<string, unknown>)) as unknown as {
    text: string;
    chunks?: RawChunk[];
  };

  const segments = mergeSegments(normalizeChunks(output.chunks ?? [], totalSec));
  const text = segments.length ? joinText(segments) : (output.text ?? '').trim();
  post({
    type: 'done',
    result: { segments, text, durationSec: totalSec },
  });
}

self.onmessage = async (e: MessageEvent<MainToWorker>) => {
  const msg = e.data;
  try {
    if (msg.type === 'load') {
      await load(msg.modelId, msg.engine);
    } else if (msg.type === 'transcribe') {
      await transcribe(msg.samples, msg.englishOnly);
    }
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
