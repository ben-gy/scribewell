# Scribewell — Build Review

This file exists only to create a reviewable PR. All code is already deployed on `main`.

**Merge this PR to acknowledge the build.** Closing without merging is also fine.

## Links

- **GitHub Pages:** https://ben-gy.github.io/scribewell/ *(redirects to custom domain once DNS + cert are live)*
- **Custom domain:** https://scribewell.benrichardson.dev

## What it is

Private, in-browser transcription: drop an audio or video file and get a timestamped
transcript plus `.srt` / `.vtt` subtitles. OpenAI's Whisper model runs **locally** via
transformers.js (WebGPU with automatic WASM fallback) — the recording never leaves the
device. No account, no uploads, no per-minute fees.

## DNS setup (already applied)

| Type | Name | Target | Proxy |
|------|------|--------|-------|
| CNAME | `scribewell` | `ben-gy.github.io` | DNS only (grey cloud) |

If the cert ever needs re-triggering:
```bash
gh api repos/ben-gy/scribewell/pages -X PUT -f cname=""
sleep 3
gh api repos/ben-gy/scribewell/pages -X PUT -f cname="scribewell.benrichardson.dev"
```
