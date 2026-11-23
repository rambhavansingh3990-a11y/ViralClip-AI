# ViralClip AI

Starter web app for turning videos you own or are authorized to edit into vertical short clips.

## Included
- Video upload and source URL form
- Video and authorized live-stream modes
- Hindi, English, Hinglish subtitle preference
- 15–60 second clip duration selection
- Express API job intake endpoint
- Responsive creator-studio UI

## Run locally
Requires Node.js 20+.
```bash
npm install
npm run dev
```
In another terminal:
```bash
npm run server
```

The API currently accepts jobs but does not yet run AI highlight detection or render final clips. Production processing requires a worker, FFmpeg, transcription/highlight services, persistent storage, and authorized stream ingestion.

Only process content you own or have permission to use. Do not bypass DRM, authentication, or platform restrictions.