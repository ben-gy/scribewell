// ── Audio decoding + resampling to Whisper's required 16 kHz mono ──
//
// Whisper expects a mono Float32Array sampled at 16 kHz. Browsers can decode
// virtually any audio/video container via the Web Audio API, then we downmix
// and resample. The pure math (downmix, linear resample) is unit-tested; the
// Web-Audio wrapper is exercised at runtime.

export const WHISPER_SAMPLE_RATE = 16000;

/** Average all channels into a single mono track. */
export function downmixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 0) return new Float32Array(0);
  if (channels.length === 1) return channels[0];
  const length = channels[0].length;
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (let c = 0; c < channels.length; c++) sum += channels[c][i] ?? 0;
    out[i] = sum / channels.length;
  }
  return out;
}

/**
 * Linear-interpolation resampler. Fast, dependency-free, and more than good
 * enough for speech recognition (Whisper is robust to mild resampling error).
 */
export function resampleLinear(
  input: Float32Array,
  inputRate: number,
  outputRate: number,
): Float32Array {
  if (inputRate === outputRate) return input;
  if (input.length === 0 || inputRate <= 0 || outputRate <= 0) return new Float32Array(0);
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

/**
 * Decode an audio/video file into a 16 kHz mono Float32Array using the Web
 * Audio API. Uses an OfflineAudioContext for a high-quality resample when
 * available, falling back to a manual linear resample.
 */
export async function decodeToMono16k(file: Blob): Promise<Float32Array> {
  const arrayBuffer = await file.arrayBuffer();

  const AC: typeof AudioContext =
    (globalThis as unknown as { AudioContext?: typeof AudioContext }).AudioContext ??
    (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext!;
  if (!AC) throw new Error('Web Audio API is not available in this browser.');

  const decodeCtx = new AC();
  let audioBuffer: AudioBuffer;
  try {
    audioBuffer = await decodeCtx.decodeAudioData(arrayBuffer.slice(0));
  } catch {
    throw new Error(
      'Could not decode this file. Make sure it is a supported audio or video format.',
    );
  } finally {
    void decodeCtx.close();
  }

  const channels: Float32Array[] = [];
  for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
    channels.push(audioBuffer.getChannelData(c));
  }
  const mono = downmixToMono(channels);

  if (audioBuffer.sampleRate === WHISPER_SAMPLE_RATE) return mono;

  // Prefer the browser's high-quality resampler via OfflineAudioContext.
  const OAC: typeof OfflineAudioContext | undefined =
    (globalThis as unknown as { OfflineAudioContext?: typeof OfflineAudioContext })
      .OfflineAudioContext ??
    (globalThis as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext })
      .webkitOfflineAudioContext;

  if (OAC) {
    try {
      const targetLength = Math.ceil(
        (mono.length * WHISPER_SAMPLE_RATE) / audioBuffer.sampleRate,
      );
      const offline = new OAC(1, targetLength, WHISPER_SAMPLE_RATE);
      const monoBuffer = offline.createBuffer(1, mono.length, audioBuffer.sampleRate);
      // Copy into a freshly-allocated (non-shared) buffer so the typed-array
      // element type matches copyToChannel's signature exactly.
      monoBuffer.copyToChannel(new Float32Array(mono), 0);
      const src = offline.createBufferSource();
      src.buffer = monoBuffer;
      src.connect(offline.destination);
      src.start();
      const rendered = await offline.startRendering();
      return rendered.getChannelData(0);
    } catch {
      // fall through to manual resample
    }
  }

  return resampleLinear(mono, audioBuffer.sampleRate, WHISPER_SAMPLE_RATE);
}

/** Human-friendly source duration in seconds for a decoded mono buffer. */
export function durationSeconds(samples: Float32Array, sampleRate = WHISPER_SAMPLE_RATE): number {
  return samples.length / sampleRate;
}
