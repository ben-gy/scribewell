# scribewell

**Private in-browser transcription — turn audio & video into text, subtitles, and searchable transcripts without uploading a thing.**

Live: https://scribewell.benrichardson.dev

---

## what it is

Scribewell transcribes audio and video files into text and subtitles **entirely in your browser**. It runs OpenAI's Whisper speech-recognition model locally using WebGPU (or WebAssembly on the CPU), so your recording never leaves your device.

It exists because almost every "free online transcription" tool makes you upload your recording to a server first. That's a dealbreaker for a journalist transcribing a confidential source interview, a doctor with dictation notes, a lawyer with a recorded deposition, or anyone who simply doesn't want their private audio sitting on someone else's cloud. Scribewell removes the upload step completely.

Drop a file, pick a model size, and get a timestamped transcript you can read, copy, or export as **.txt**, **.srt**, or **.vtt** subtitles. Once the model is cached after first use, it works fully offline — on a plane, in a locked-down environment, anywhere.

## how it works

```
file (mp3/wav/m4a/mp4/webm/…)
   │  Web Audio API: decodeAudioData
   ▼
16 kHz mono PCM  ──(Float32Array, transferred)──►  Web Worker
                                                     │  transformers.js
                                                     │  Whisper (ONNX)
                                                     │  WebGPU / WASM
                                                     ▼
                                        timestamped segments (streamed)
   ┌──────────────────────────────────────────────────┘
   ▼
transcript reader  +  .txt / .srt / .vtt export
```

1. **Decode** — the file is read with the Web Audio API and resampled to 16 kHz mono PCM (the format Whisper expects). Video files work too; only the audio track is read.
2. **Load** — on first run the Whisper weights are fetched once from the Hugging Face CDN and cached by transformers.js. Subsequent runs are offline.
3. **Transcribe** — inference runs in a Web Worker in 30-second chunks with a 5-second stride and word-level timestamps, streaming partial results to a live preview with a real progress bar.
4. **Export** — segments are normalised (gap-filled, merged into readable lines) and rendered; you copy or download them as plain text or subtitle files.

## browser APIs used

- **@huggingface/transformers (Whisper ONNX)** — on-device speech-to-text
- **WebGPU** — GPU-accelerated inference when available
- **WebAssembly (onnxruntime-web)** — CPU inference fallback
- **Web Audio API** — decode any supported container to PCM
- **Web Workers + Transferable ArrayBuffer** — keep the model off the main thread
- **Cache API / IndexedDB** (via transformers.js) — cache model weights
- **Service Worker** — offline app shell
- **Clipboard API / Web Share API** — copy or share the transcript

## security / privacy model

**Protected**
- Your audio / video file and its contents — decoded and transcribed on-device, never uploaded
- The transcript text — produced locally; only you copy or download it
- No account, no cookies, no analytics, no tracking

**Not protected**
- **First load only:** the Whisper model weights are fetched from the Hugging Face CDN. That is model data — your audio is never part of any request. After caching, the tool works with no network.
- GitHub Pages logs the initial page request, as any static host does

**Trust model**
- The static site bundle served by GitHub Pages (hash-pinned by the deploy)
- The TLS chain to GitHub Pages, and — first load only — Hugging Face's CDN for the weights
- The open-source transformers.js + onnxruntime-web that execute the model

Verify it yourself: load the page once, switch to airplane mode, and transcribe — it keeps working with no connection.

## stack

- Vite 6 + vanilla TypeScript
- @huggingface/transformers (Whisper)
- Vitest for unit tests
- GitHub Pages for hosting, deployed via GitHub Actions

No analytics, no cookies, no third-party fonts, no telemetry. The only network request is the one-time model download.

## local development

```bash
npm install
npm run dev      # vite dev server on :5173
npm test         # run vitest suite
npm run build    # produce dist/ for deploy
npm run preview  # serve dist/ locally
```

## deploying

A push to `main` triggers `.github/workflows/deploy.yml`, which runs tests, builds, and deploys `dist/` to GitHub Pages. The custom domain is set via `public/CNAME` — point a `CNAME` DNS record for `scribewell.benrichardson.dev` at `ben-gy.github.io`.

## license

MIT — see [LICENSE](./LICENSE).
