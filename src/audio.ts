/**
 * Audio decoding + resampling.
 *
 * The heavy `decodeAudioData` call is native and non-blocking; the mixdown
 * and resample helpers below are pure and unit-tested. Whisper wants 16 kHz
 * mono PCM in [-1, 1].
 */

import type { DecodedAudio } from './types';

export const TARGET_SAMPLE_RATE = 16_000;

/** Average N channels into a single mono channel. */
export function mixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 0) return new Float32Array(0);
  if (channels.length === 1) return channels[0];
  const length = channels[0].length;
  const out = new Float32Array(length);
  const n = channels.length;
  for (let c = 0; c < n; c++) {
    const ch = channels[c];
    for (let i = 0; i < length; i++) out[i] += ch[i];
  }
  for (let i = 0; i < length; i++) out[i] /= n;
  return out;
}

/**
 * Linear-interpolation resampler. Good enough for speech recognition and
 * dependency-free (no OfflineAudioContext, so it runs anywhere and is testable).
 */
export function resampleLinear(
  input: Float32Array,
  inputRate: number,
  outputRate: number,
): Float32Array {
  if (inputRate === outputRate || input.length === 0) return input;
  const ratio = inputRate / outputRate;
  const outLength = Math.max(1, Math.round(input.length / ratio));
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const srcPos = i * ratio;
    const i0 = Math.floor(srcPos);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = srcPos - i0;
    out[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return out;
}

let sharedCtx: AudioContext | null = null;

function getContext(): AudioContext {
  if (!sharedCtx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) throw new Error('Web Audio API is not available in this browser.');
    sharedCtx = new Ctor();
  }
  return sharedCtx;
}

/**
 * Decode any browser-supported audio/video container to 16 kHz mono PCM.
 * Video files work too — `decodeAudioData` reads the audio track.
 */
export async function decodeToPcm(file: File): Promise<DecodedAudio> {
  const arrayBuffer = await file.arrayBuffer();
  const ctx = getContext();
  let audioBuffer: AudioBuffer;
  try {
    // decodeAudioData copies the buffer; some browsers detach it, so clone.
    audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
  } catch {
    throw new Error(
      'Could not decode audio from this file. Your browser may not support its codec — try MP3, WAV, M4A, or MP4.',
    );
  }

  const channels: Float32Array[] = [];
  for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
    channels.push(audioBuffer.getChannelData(c));
  }
  const mono = mixToMono(channels);
  const samples = resampleLinear(mono, audioBuffer.sampleRate, TARGET_SAMPLE_RATE);
  return { samples, durationSec: audioBuffer.duration };
}
