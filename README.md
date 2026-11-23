# ViralClip AI

A web app for turning videos you own or are authorized to edit into vertical short clips.

## Current features

- Upload video files up to 500 MB.
- Analyze audio energy to find up to three candidate moments.
- Render vertical 1080×1920 MP4 clips with blurred-fill framing.
- Optional Whisper transcription with Hindi, English, Hinglish (Hindi transcription mode), or automatic language detection.
- Burn recognized speech captions into each generated clip when transcription is configured.
- Job status API and downloadable MP4 outputs.

## Not implemented yet

- Live-stream capture.
- Direct video URL ingestion.
- Semantic AI understanding of jokes, topics, emotion, or context.
- Persistent job queue or permanent object storage.

The highlight ranking is currently an audio-energy heuristic. It is not semantic AI and may select loud music or noise rather than the most meaningful moment.

## Enable automatic subtitles on Render

1. Open the Render dashboard and select the `viralclip-ai` web service.
2. Open **Environment**.
3. Add an environment variable named `OPENAI_API_KEY` and set its value to your own OpenAI API key.
4. Save the change and redeploy the service if Render does not redeploy automatically.

Never put the API key in GitHub source code, the frontend, or a public chat. Transcription uses the OpenAI audio transcription API and may incur API charges. If the key is not configured, clips are still generated without burned-in subtitles. The current single-request audio limit is 24 MB after compression; longer audio is processed without captions and the app reports that status.

## API

- `GET /api/health`: reports service status and which features are configured.
- `POST /api/jobs`: multipart form upload with `video`, optional `clipDuration`, and `language`.
- `GET /api/jobs/:id`: poll job status and retrieve clip URLs.
- Generated files are served under `/outputs/`.

Supported subtitle language values: `Hindi`, `English`, `Hinglish`, and `Auto detect`.

## Run locally

Requires Node.js 20+ and FFmpeg with the subtitles/libass filter.

```bash
npm install
npm run dev
```

In another terminal:

```bash
npm run server
```

For local transcription, set `OPENAI_API_KEY` in the server process environment. Do not commit a `.env` file containing secrets.

## Render deployment

The Dockerfile installs FFmpeg and Noto fonts for Hindi caption rendering. The Render Blueprint uses `/api/health` as its health check.

Render free-service instances may sleep while idle, and their local filesystem is ephemeral. Jobs are stored in memory and generated outputs on local disk, so restarts or redeploys can clear job status and files. Add a durable queue and persistent object storage before using this for production workloads.

## Responsible use

Only process content you own or have permission to use. Do not bypass DRM, authentication, paywalls, or platform restrictions.
