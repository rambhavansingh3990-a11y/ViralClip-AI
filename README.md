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


## Deploy as one web service

A Dockerfile and Render Blueprint are included. The container installs FFmpeg, builds the Vite frontend, and serves the frontend and API from one Node service.

1. Push this repository to GitHub (already done).
2. In Render, create a new Blueprint and connect this repository.
3. Review the `viralclip-ai` web service and deploy.
4. Open the service URL and check `/api/health`.

For local development, copy `.env.example` to `.env`, install FFmpeg locally, run `npm install`, then start the API with `npm run server` and the frontend with `npm run dev`.

**Deployment caveats:** Render's free service may sleep when idle, and its local filesystem is ephemeral. Uploaded videos and generated clips may be lost after a restart/redeploy. Use persistent object storage and a durable job queue before relying on this for regular production use.
