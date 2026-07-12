/**
 * Model catalogue + engine detection.
 */

import type { Engine, ModelChoice } from './types';

export const MODELS: ModelChoice[] = [
  {
    id: 'Xenova/whisper-tiny.en',
    label: 'Tiny (English)',
    englishOnly: true,
    size: '~40 MB',
    blurb: 'Fastest. Great for clear English speech and quick drafts.',
  },
  {
    id: 'Xenova/whisper-base',
    label: 'Base (multilingual)',
    englishOnly: false,
    size: '~145 MB',
    blurb: 'More accurate, handles other languages and noisier audio.',
  },
];

export const DEFAULT_MODEL_ID = MODELS[0].id;

export function modelById(id: string): ModelChoice {
  return MODELS.find((m) => m.id === id) ?? MODELS[0];
}

/** Detect the best available inference engine. WebGPU when present, else WASM. */
export async function detectEngine(): Promise<Engine> {
  const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (!gpu) return 'wasm';
  try {
    const adapter = await gpu.requestAdapter();
    return adapter ? 'webgpu' : 'wasm';
  } catch {
    return 'wasm';
  }
}
