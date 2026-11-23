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

## Automatic clip generation (first processing milestone)

The API now accepts an uploaded video, ranks candidate moments using one-second audio RMS energy windows, and renders up to three vertical 1080x1920 MP4 clips with a blurred-fill background.

This is a signal-based heuristic, not semantic AI: it does not yet understand speech, jokes, context, or emotions. It requires `ffmpeg` and `ffprobe` installed on the server.

- `POST /api/jobs`: multipart upload with fields `video` and optional `clipDuration`
- `GET /api/jobs/:id`: poll job status and retrieve clip URLs
- Generated files are served under `/outputs/`

Current limitations: jobs are in-memory (restart clears status), outputs are local to the server, direct URL ingestion, live capture, transcription, subtitles, and semantic highlight ranking are not implemented yet.
