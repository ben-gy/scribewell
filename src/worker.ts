// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
// ── Web Worker: hosts the Whisper model and runs inference off the main thread ──

import {
  pipeline,
  env,
  WhisperTextStreamer,
  type AutomaticSpeechRecognitionPipeline,
} from '@huggingface/transformers';
import type { MainToWorker, WorkerToMain, ModelId, Transcript, WhisperTask } from './types';

// Never look for models on the local origin — always the HF hub (cached after first load).
env.allowLocalModels = false;

// Whisper full language names keyed by the ISO codes we surface in the UI.
const LANGUAGE_NAMES: Record<string, string> = {
  en: 'english',
  es: 'spanish',
  fr: 'french',
  de: 'german',
  it: 'italian',
  pt: 'portuguese',
  nl: 'dutch',
  ru: 'russian',
  pl: 'polish',
  uk: 'ukrainian',
  ar: 'arabic',
  hi: 'hindi',
  ja: 'japanese',
  ko: 'korean',
  zh: 'chinese',
  tr: 'turkish',
  sv: 'swedish',
  id: 'indonesian',
  vi: 'vietnamese',
};

const post = (msg: WorkerToMain) => (self as unknown as Worker).postMessage(msg);

function detectDevice(): 'webgpu' | 'wasm' {
  return typeof (navigator as unknown as { gpu?: unknown }).gpu !== 'undefined'
    ? 'webgpu'
    : 'wasm';
}

let transcriber: AutomaticSpeechRecognitionPipeline | null = null;
let loadedModel: ModelId | null = null;

async function getTranscriber(model: ModelId): Promise<AutomaticSpeechRecognitionPipeline> {
  if (transcriber && loadedModel === model) return transcriber;

  // Switching models — free the previous one.
  if (transcriber) {
    try {
      await transcriber.dispose();
    } catch {
      /* ignore */
    }
    transcriber = null;
    loadedModel = null;
  }

  const device = detectDevice();
  post({ type: 'device', device });

  // `pipeline` infers a huge union across every task; call through `any` to
  // avoid "union type too complex", then narrow to the ASR pipeline.
  const build = pipeline as unknown as (
    task: string,
    model: string,
    opts: Record<string, unknown>,
  ) => Promise<AutomaticSpeechRecognitionPipeline>;
  transcriber = await build('automatic-speech-recognition', model, {
    device,
    // fp32 on WebGPU: fp16 Whisper decoding is numerically unstable on many
    // GPUs and degenerates into repeated punctuation ("​ ​ ​…"). fp32 is the
    // reference precision and transcribes correctly; q8 keeps the CPU path light.
    dtype: device === 'webgpu' ? 'fp32' : 'q8',
    progress_callback: (p: {
      status: string;
      file?: string;
      progress?: number;
      loaded?: number;
      total?: number;
    }) => {
      if (p.status === 'progress' && p.file) {
        post({
          type: 'download',
          file: p.file,
          progress: (p.progress ?? 0) / 100,
          loaded: p.loaded ?? 0,
          total: p.total ?? 0,
        });
      } else if (p.status === 'done' && p.file) {
        post({ type: 'download-done', file: p.file });
      }
    },
  });

  loadedModel = model;
  return transcriber;
}

function timePrecisionOf(t: AutomaticSpeechRecognitionPipeline): number {
  try {
    const anyT = t as unknown as {
      processor: { feature_extractor: { config: { chunk_length: number } } };
      model: { config: { max_source_positions: number } };
    };
    const chunkLength = anyT.processor.feature_extractor.config.chunk_length;
    const maxPos = anyT.model.config.max_source_positions;
    if (chunkLength && maxPos) return chunkLength / maxPos;
  } catch {
    /* fall through */
  }
  return 0.02; // Whisper default: 20 ms per position.
}

async function runTranscription(
  audio: Float32Array,
  model: ModelId,
  language: string | null,
  task: WhisperTask,
): Promise<void> {
  const t = await getTranscriber(model);
  post({ type: 'ready' });

  const isMultilingual = !model.endsWith('.en');
  const options: Record<string, unknown> = {
    chunk_length_s: 30,
    stride_length_s: 5,
    return_timestamps: true,
  };
  if (isMultilingual) {
    options.task = task;
    if (language && language !== 'auto' && LANGUAGE_NAMES[language]) {
      options.language = LANGUAGE_NAMES[language];
    }
  }

  // Live partial-text preview via a streamer (best-effort; authoritative
  // timestamps still come from the final output).
  let partial = '';
  try {
    const streamer = new WhisperTextStreamer(t.tokenizer as never, {
      time_precision: timePrecisionOf(t),
      skip_prompt: true,
      callback_function: (text: string) => {
        partial += text;
        post({ type: 'partial', text: partial });
      },
      on_chunk_start: () => {
        if (partial && !partial.endsWith(' ')) partial += ' ';
      },
    });
    options.streamer = streamer;
  } catch {
    /* streaming unavailable — proceed without live preview */
  }

  const output = (await t(audio, options)) as {
    text: string;
    chunks?: Array<{ timestamp: [number, number | null]; text: string }>;
  };

  const result: Transcript = {
    text: (output.text ?? '').trim(),
    chunks: (output.chunks ?? []).map((c) => ({
      timestamp: c.timestamp,
      text: c.text,
    })),
  };
  post({ type: 'complete', result });
}

self.addEventListener('message', (event: MessageEvent<MainToWorker>) => {
  const msg = event.data;
  void (async () => {
    try {
      if (msg.type === 'load') {
        await getTranscriber(msg.model);
        post({ type: 'ready' });
      } else if (msg.type === 'transcribe') {
        await runTranscription(msg.audio, msg.model, msg.language, msg.task);
      }
    } catch (err) {
      post({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  })();
});
