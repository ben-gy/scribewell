/**
 * Main-thread wrapper around the transcription worker.
 *
 * Promise-based RPC with streaming callbacks for download + inference
 * progress. Keeps the worker lifecycle and message routing out of the UI.
 */

import type { Engine, Segment, TranscriptResult, WorkerToMain } from './types';

export interface TranscribeCallbacks {
  onDownload?: (progress: number, file: string) => void;
  onModelReady?: () => void;
  onEngine?: (engine: Engine) => void;
  onChunk?: (segments: Segment[]) => void;
  onProgress?: (processedSec: number, totalSec: number) => void;
}

export class Transcriber {
  private worker: Worker;
  private cbs: TranscribeCallbacks = {};
  private settle: {
    resolve: (r: TranscriptResult) => void;
    reject: (e: Error) => void;
  } | null = null;
  private modelWaiter: { resolve: () => void; reject: (e: Error) => void } | null = null;

  constructor() {
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<WorkerToMain>) => this.route(e.data);
    this.worker.onerror = (e) => {
      const err = new Error(e.message || 'Worker crashed.');
      this.settle?.reject(err);
      this.modelWaiter?.reject(err);
      this.settle = null;
      this.modelWaiter = null;
    };
  }

  private route(msg: WorkerToMain): void {
    switch (msg.type) {
      case 'download':
        this.cbs.onDownload?.(msg.progress, msg.file);
        break;
      case 'ready':
        this.cbs.onEngine?.(msg.engine);
        break;
      case 'model-ready':
        this.cbs.onModelReady?.();
        this.modelWaiter?.resolve();
        this.modelWaiter = null;
        break;
      case 'chunk':
        this.cbs.onChunk?.(msg.segments);
        break;
      case 'progress':
        this.cbs.onProgress?.(msg.processedSec, msg.totalSec);
        break;
      case 'done':
        this.settle?.resolve(msg.result);
        this.settle = null;
        break;
      case 'error': {
        const err = new Error(msg.message);
        this.settle?.reject(err);
        this.modelWaiter?.reject(err);
        this.settle = null;
        this.modelWaiter = null;
        break;
      }
    }
  }

  setCallbacks(cbs: TranscribeCallbacks): void {
    this.cbs = { ...this.cbs, ...cbs };
  }

  /** Load (or reuse) a model. Resolves when weights are ready. */
  load(modelId: string, engine: Engine): Promise<void> {
    return new Promise((resolve, reject) => {
      this.modelWaiter = { resolve, reject };
      this.worker.postMessage({ type: 'load', modelId, engine });
    });
  }

  /** Transcribe 16 kHz mono PCM. Transfers the buffer to the worker. */
  transcribe(samples: Float32Array, englishOnly: boolean): Promise<TranscriptResult> {
    return new Promise((resolve, reject) => {
      this.settle = { resolve, reject };
      // Copy so the caller keeps its Float32Array usable; transfer the copy.
      const copy = samples.slice();
      this.worker.postMessage(
        { type: 'transcribe', samples: copy, englishOnly },
        [copy.buffer],
      );
    });
  }

  dispose(): void {
    this.worker.terminate();
  }
}
