# Tool Plan: Scribewell

## Overview
- **Name:** Scribewell
- **Repo name:** scribewell
- **Tagline:** Private in-browser transcription — turn audio & video into text, subtitles, and searchable transcripts without uploading a thing.

## Problem It Solves
A journalist has a one-hour recorded interview with a confidential source. A student has a lecture recording. A podcaster has an episode that needs a transcript for SEO and accessibility. The obvious tools (Otter, Rev, Descript, dozens of "free online transcription" sites) all require uploading the audio to a server — which is a non-starter when the recording is sensitive, under embargo, or simply private. People Google "transcribe audio without uploading" and "offline transcription tool" precisely because the upload step is the dealbreaker. Scribewell runs OpenAI's Whisper speech-recognition model **entirely in the browser** via WebAssembly / WebGPU, so the audio never leaves the device.

## Why This Must Be Client-Side
- **Privacy / sensitive-data handling** — interviews with sources, medical dictation, legal recordings, therapy notes. Uploading is the whole problem; local inference removes it.
- **No-account friction** — no signup, no credits, no per-minute billing. Drop a file, get a transcript.
- **Offline** — once the model is cached, transcription works on a plane or in a SCIF with no network at all.

## Browser APIs / Libraries Used
| API / Library | What it does for us | Fallback if unsupported |
|---------------|----------------------|-------------------------|
| @huggingface/transformers (Whisper ONNX) | Speech-to-text inference in-browser | N/A — hard requirement |
| WebGPU | GPU-accelerated inference (fast) | Falls back to WASM (CPU) automatically |
| WebAssembly (onnxruntime-web) | Runs the model when WebGPU absent | N/A — the floor |
| Web Audio API (decodeAudioData) | Decode any browser-supported audio/video container to PCM | Error surfaced if codec unsupported |
| Web Workers | Run decode + inference off the main thread | N/A — required for responsive UI |
| Cache API / IndexedDB (via transformers.js) | Cache the model after first download | Re-download each session |
| Web Share API | Share the transcript on mobile | Hidden if unsupported; copy/download remain |
| Clipboard API | Copy transcript text | execCommand fallback |
| Service Worker | Offline app shell | App still works online without it |

## Workflow (input → process → output)
1. User drops an audio or video file (mp3, m4a, wav, ogg, flac, mp4, webm, mov…) or picks the model size.
2. The file is decoded to 16 kHz mono PCM (Web Audio), then Whisper transcribes it in a worker with live progress (model download %, then audio %).
3. User receives a timestamped transcript they can read, copy, download as **.txt / .srt / .vtt**, or share.

## Non-Goals
- No speaker diarisation v1 (who-said-what labelling).
- No live microphone / real-time streaming v1 — file-in, transcript-out.
- No translation v1 (Whisper can, but keep scope to transcription).
- No cloud sync, no accounts, ever.

## Target Audience
A journalist at 9pm transcribing a sensitive source interview on their laptop — cannot upload it to a US SaaS for legal and ethical reasons, needs a clean transcript and .srt for the video cut, and needs to trust that the file never left the machine. Also: students, researchers, podcasters, accessibility captioners.

## Style Direction
**Tone:** professional, calm, editorial — a serious writing tool, not a hacker toy.
**Colour palette:** warm off-white paper background, ink-dark text, a confident indigo/violet accent. Reads like a well-made writing app; signals trust for a privacy-sensitive audience.
**UI density:** balanced — spacious input, dense transcript reader.
**Dark/light theme:** light (consumer/editorial audience), with a dark event-log drawer for the "under the hood" feel.
**Reference tools for feel:** Descript's calm editorial surface, iA Writer's typographic restraint.

## Technical Architecture
- **Stack:** Vanilla TypeScript + Vite. No React — single-view workflow with a couple of state transitions.
- **Key libraries:** @huggingface/transformers (Whisper), no other runtime deps.
- **Worker strategy:** single dedicated Web Worker hosts the Whisper pipeline; audio decode happens on the main thread (native, non-blocking), PCM is transferred to the worker.
- **Storage:** none for user data. transformers.js caches the model in the browser Cache; localStorage stores only UI prefs (chosen model).

## Privacy & Trust Model
**Protected**
- The audio/video file and its contents — decoded and transcribed locally; never uploaded.
- The transcript text — generated on-device, only ever downloaded or copied by the user.

**Not protected**
- The **first** load fetches the Whisper model weights from the Hugging Face CDN (huggingface.co / cdn-lfs). This is model data, not user data — no audio is ever sent. After first load it is cached and works offline.
- GitHub Pages / its CDN logs the initial page request (standard static-hosting access log).

**Trust surface**
- The static site bundle served by GitHub Pages (hash-pinned by the deploy).
- The TLS chain between the user and GitHub Pages, and (first load only) Hugging Face's CDN for the model weights.
- The @huggingface/transformers + onnxruntime-web code that runs the model.

## UX Required Surfaces
- Drop zone (drag-drop, tap-to-pick, file input) with accepted-formats caption.
- Model picker (Tiny / Base) with size + speed guidance.
- Determinate progress: model-download % then transcription % with throughput (× realtime).
- Transcript reader with clickable timestamps.
- Event log drawer (Dropwell pattern).
- How-It-Works modal (steps).
- Threat Model modal (protected / not / trust).
- About modal with benrichardson.dev attribution + repo link.
- Output: copy, download .txt/.srt/.vtt, Web Share.
- Keyboard shortcuts: Escape closes modals, Cmd/Ctrl+C copies transcript when focused.
- Sticky footer "Built by benrichardson.dev".
