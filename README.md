# scribewell

**Transcribe audio and video to text entirely in your browser — no uploads, works offline.**

Live: https://scribewell.benrichardson.dev

---

## what it is

Scribewell turns speech into text without sending your recordings anywhere. Drop in an audio or video file and it produces a timestamped transcript you can copy, share, or download as plain text, subtitles (SRT/VTT), or JSON.

It exists because the obvious way to transcribe a sensitive recording — a confidential interview, a therapy session, a legal deposition, a dictated medical note — is to upload it to some transcription website. For anything under NDA, privilege, or a duty of confidentiality, that upload is exactly the thing you must not do. Scribewell runs OpenAI's **Whisper** speech-recognition model directly inside the browser tab using WebGPU or WebAssembly. The audio is decoded, resampled, and transcribed on your own machine. The file never leaves the device.

It's for journalists, lawyers, therapists, doctors, researchers, and anyone who needs a transcript but refuses to hand their audio to a third party.

## how it works

```
file ─▶ Web Audio decode ─▶ downmix to mono + resample to 16 kHz
     ─▶ Web Worker (Whisper via @huggingface/transformers)
     ─▶ WebGPU inference (or WASM/CPU fallback), streaming partial text
     ─▶ timestamped chunks ─▶ TXT / SRT / VTT / JSON
```

1. **Decode.** The Web Audio API decodes essentially any audio or video container the browser can play, then Scribewell downmixes to mono and resamples to 16 kHz — the format Whisper expects. An `OfflineAudioContext` does a high-quality resample when available, with a linear-interpolation fallback.
2. **Load the model.** A dedicated Web Worker loads Whisper's quantized ONNX weights. On first run they download from the Hugging Face CDN (~40–80 MB depending on model) and are then cached by the browser for offline reuse.
3. **Transcribe.** Inference runs in the worker so the UI never freezes — on the GPU via WebGPU where supported, otherwise on the CPU via WebAssembly. A live partial transcript streams as it works.
4. **Export.** The final result is a set of timestamped segments, serialized on demand to plain text, SubRip (`.srt`), WebVTT (`.vtt`), or JSON.

Decoded audio is handed to the worker as a **transferable** `ArrayBuffer`, so there's no copy.

## browser APIs used

- **@huggingface/transformers (Whisper, ONNX)** — in-browser automatic speech recognition
- **WebGPU** — GPU-accelerated inference when the browser supports it
- **WebAssembly (onnxruntime-web)** — CPU inference fallback
- **Web Audio API** — `decodeAudioData` + `OfflineAudioContext` for decode and resample
- **Web Workers** — model load and inference off the main thread
- **Transferable ArrayBuffer** — zero-copy audio handoff to the worker
- **Cache Storage** — model-weight caching for offline use
- **Clipboard API / Web Share API** — copy and share the transcript
- **Service Worker** — offline app shell

## security / privacy model

**Protected**
- Your audio and video files are decoded and transcribed entirely in your browser; they are never uploaded.
- The transcript is produced on-device and only leaves your machine if *you* copy, share, or download it.
- No accounts, cookies, fingerprinting, or third-party fonts. The only analytics is Cloudflare Web Analytics — anonymous, cookie-less page-view counts; no personal data, no cross-site tracking.
- After the model is cached, the tool works fully offline.

**Not protected**
- The first time you use a given model, its weights are fetched from the Hugging Face CDN. That request reveals *which model* you loaded (never your audio) to Hugging Face and your network. After caching, even that stops.
- The initial page load is served by GitHub Pages (standard CDN logs: your IP and the page URL).
- Transcription accuracy varies with audio quality, accents, and background noise — proofread anything safety-critical.

**Trust model**
- The static site bundle, hash-pinned via the GitHub Pages deploy and served over TLS.
- The Hugging Face CDN, for the one-time model download.
- The `@huggingface/transformers` library and the Whisper model weights.

A strict Content-Security-Policy in `index.html` limits network access to `self` and the Hugging Face model host.

## stack

- Vite 6 + vanilla TypeScript
- @huggingface/transformers (Whisper tiny/base, English + multilingual)
- Vitest for unit tests
- GitHub Pages for hosting, deployed via GitHub Actions

No runtime dependencies beyond `@huggingface/transformers`. No cookies, no fingerprinting, no third-party fonts. Anonymous, cookie-less page-view counts via Cloudflare Web Analytics — no personal data, no cross-site tracking.

## local development

```bash
npm install
npm run dev      # vite dev server on :5173
npm test         # run vitest suite
npm run build    # produce dist/ for deploy
npm run preview  # serve dist/ locally
```

> Note: transcription needs cross-origin isolation for some execution paths. The dev and preview servers set the required COOP/COEP headers automatically via `vite.config.ts`.

## deploying

A push to `main` triggers `.github/workflows/deploy.yml`, which runs tests, builds, and deploys `dist/` to GitHub Pages. The custom domain is set via `public/CNAME` — point a `CNAME` DNS record for `scribewell.benrichardson.dev` at `ben-gy.github.io`.

## license

MIT — see [LICENSE](./LICENSE).
