# Scribewell — Build Review

This file exists only to create a reviewable PR. All code is already deployed on `main`.

**Merge this PR to acknowledge the build.** Closing without merging is also fine.

## What it is

Scribewell transcribes audio and video to text **entirely in the browser** using OpenAI's Whisper model (via `@huggingface/transformers`, WebGPU with a WASM/CPU fallback). The file is decoded with the Web Audio API, resampled to 16 kHz mono, and transcribed in a Web Worker. Nothing is uploaded. Export as TXT / SRT / VTT / JSON.

## Links

- **GitHub Pages:** https://ben-gy.github.io/scribewell/ *(redirects to custom domain)*
- **Custom domain:** https://scribewell.benrichardson.dev

## Verified before shipping

- `npm test` — 47 unit tests pass (subtitle serialisation, timestamp math, audio downmix/resample, settings persistence).
- `npm run build` — clean production build.
- Real end-to-end dry-run in a browser: file dropped → decoded → Whisper model downloaded (~75 MB, then cached) → **WebGPU** inference → timestamped result. Light/dark themes and mobile layout checked.

## DNS setup (already applied)

| Type | Name | Target | Proxy |
|------|------|--------|-------|
| CNAME | `scribewell` | `ben-gy.github.io` | DNS only (grey cloud) |

If the TLS cert ever needs re-triggering:
```bash
gh api repos/ben-gy/scribewell/pages -X PUT -f cname=""
sleep 3
gh api repos/ben-gy/scribewell/pages -X PUT -f cname="scribewell.benrichardson.dev"
```
