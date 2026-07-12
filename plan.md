# Tool Plan: Scribewell

## Overview
- **Name:** Scribewell
- **Repo name:** scribewell
- **Tagline:** Transcribe audio and video to text entirely in your browser — no uploads, works offline after first load.

## Problem It Solves
A journalist has a one-hour interview recording with a confidential source. A therapist has a session recording. A lawyer has a deposition. A student has a lecture. They need a text transcript. Every "free" online transcription service requires uploading the audio to a stranger's server, often with terms that grant the service rights to the content, and is a non-starter for anything sensitive or under NDA/privilege. Desktop tools mean installing software and wrestling with Python. Scribewell runs OpenAI's Whisper speech-recognition model *inside the browser tab* — the audio is decoded, resampled, and transcribed locally on the user's own CPU/GPU. The file never leaves the device.

## Why This Must Be Client-Side
- **Privacy / sensitive data:** interviews, therapy sessions, legal depositions, medical notes — content that legally or ethically cannot be uploaded to a third party.
- **No-account friction:** no sign-up, no API key, no quota.
- **Offline:** once the model is cached, transcription works on a plane with no connection.
- **Cost-avoidance:** no per-minute transcription fees.

## Browser APIs / Libraries Used
| API / Library | What it does for us | Fallback if unsupported |
|---------------|----------------------|-------------------------|
| @huggingface/transformers (Whisper ASR, ONNX) | Runs speech-to-text locally | Hard requirement; show unsupported notice |
| WebGPU | GPU-accelerated inference when available | Falls back to WASM (CPU) automatically |
| WebAssembly (ONNX Runtime) | CPU inference path | N/A — bundled with transformers.js |
| Web Audio API (decodeAudioData + OfflineAudioContext) | Decode any audio/video container, resample to 16 kHz mono | Hard requirement for decode |
| Web Workers | Keep model load + inference off the main thread | N/A — required for responsiveness |
| Cache API / IndexedDB | Cache the model weights after first download | Re-downloads each session |
| Service Worker (PWA) | Offline app shell | App still works online-only |
| Clipboard API | Copy transcript | Manual select |
| Web Share API | Share transcript on mobile | Download fallback |

## Workflow (input → process → output)
1. User drops an audio or video file (mp3, m4a, wav, ogg, mp4, mov, webm…) or picks one.
2. Scribewell decodes it with the Web Audio API, downmixes to mono and resamples to 16 kHz, then streams it to a Web Worker running Whisper. A determinate progress bar tracks model download, then transcription chunk-by-chunk with live partial text.
3. User gets a timestamped transcript they can read, copy, share, and download as **TXT**, **SRT**, **VTT**, or **JSON**.

## Non-Goals
- No speaker diarization (who-said-what) in v1.
- No cloud sync, no accounts, ever.
- No real-time microphone live captioning in v1 (file-based only).
- No translation beyond Whisper's built-in translate-to-English task.

## Target Audience
A journalist at home at 9pm transcribing a sensitive recorded interview they are contractually barred from uploading anywhere — careful, privacy-conscious, on a laptop, needs a clean transcript with timestamps to quote from.

## Style Direction
**Tone:** professional, calm, trustworthy.
**Colour palette:** warm light theme with a deep indigo accent — feels like a serious writing/editorial tool, not a hacker console. Reassuring for non-technical professionals.
**UI density:** balanced.
**Dark/light theme:** light default with system-aware dark variant.
**Reference tools for feel:** Otter.ai's clean transcript view, MacWhisper's calm desktop UX.

## Technical Architecture
- **Stack:** Vanilla TypeScript + Vite.
- **Key libraries:** @huggingface/transformers (Whisper ONNX pipeline).
- **Worker strategy:** single dedicated Web Worker hosts the model and runs inference; streams progress + partial transcript via postMessage.
- **Storage:** Cache API (model weights, handled by transformers.js); localStorage for settings (model size, language, task, theme).

## Privacy & Trust Model
**Protected**
- The audio/video file and its decoded samples never leave the browser tab.
- The transcript is generated locally and never transmitted.
- No analytics, no cookies, no third-party fonts.

**Not protected**
- The **first** model download is fetched from the Hugging Face CDN (huggingface.co) — that reveals *which model* you load, never your audio. After caching, even that stops.
- The initial page load is served by GitHub Pages (standard CDN logs: your IP + the page URL).

**Trust surface**
- The static site bundle (hash-pinned via GitHub Pages deploy).
- The TLS chain between the user and GitHub Pages / Hugging Face CDN.
- The Whisper ONNX model weights hosted on Hugging Face.

## UX Required Surfaces
- Drop zone (drag-drop, tap-to-pick) accepting audio + video.
- Determinate progress: model download %, then transcription % with elapsed/throughput.
- Live partial-transcript streaming as chunks complete.
- Event log drawer (Dropwell pattern).
- How-It-Works modal (decode → resample → whisper → format).
- Threat Model modal (protected / not / trust surface).
- About modal with benrichardson.dev attribution + source link.
- Output: copy, Web Share, download TXT/SRT/VTT/JSON.
- Keyboard shortcuts: Escape closes modals, Enter starts transcription, Cmd/Ctrl+C copies transcript.
- Sticky footer "Built by benrichardson.dev".
- Glossary tooltips for jargon (Whisper, WebGPU, SRT, 16 kHz, ONNX).
