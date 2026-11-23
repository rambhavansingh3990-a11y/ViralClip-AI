import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";

const execFileAsync = promisify(execFile);

function runPcm(ffmpeg, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, ["-v", "error", "-i", input, "-vn", "-ac", "1", "-ar", "8000", "-f", "s16le", "pipe:1"]);
    const chunks = [];
    let error = "";
    child.stdout.on("data", chunk => chunks.push(chunk));
    child.stderr.on("data", chunk => error += chunk.toString());
    child.on("error", reject);
    child.on("close", code => code === 0
      ? resolve(Buffer.concat(chunks))
      : reject(new Error(error || "Audio analysis failed. Check FFmpeg installation.")));
  });
}

function rankMoments(pcm, clipSeconds, duration) {
  const bytesPerSecond = 16000;
  const seconds = Math.floor(pcm.length / bytesPerSecond);
  const rms = [];
  for (let s = 0; s < seconds; s++) {
    const start = s * bytesPerSecond;
    const end = Math.min(start + bytesPerSecond, pcm.length);
    let sum = 0, count = 0;
    for (let i = start; i + 1 < end; i += 2) {
      const sample = pcm.readInt16LE(i);
      sum += sample * sample;
      count++;
    }
    rms.push(count ? Math.sqrt(sum / count) : 0);
  }
  const length = Math.max(1, Math.min(clipSeconds, seconds));
  const step = Math.max(1, Math.floor(length / 3));
  const candidates = [];
  for (let start = 0; start + length <= seconds; start += step) {
    const segment = rms.slice(start, start + length);
    candidates.push({ start, duration: length, score: segment.reduce((a, b) => a + b, 0) / segment.length });
  }
  if (!candidates.length) candidates.push({ start: 0, duration: Math.max(1, Math.min(length, duration)), score: 0 });
  candidates.sort((a, b) => b.score - a.score);
  const chosen = [];
  for (const candidate of candidates) {
    if (chosen.every(item => candidate.start + candidate.duration <= item.start || candidate.start >= item.start + item.duration)) chosen.push(candidate);
    if (chosen.length === 3) break;
  }
  return chosen.sort((a, b) => a.start - b.start);
}

function formatSrtTime(seconds) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  const millis = ms % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
}

async function transcribeVideo({ input, tempDir, language }) {
  if (!process.env.OPENAI_API_KEY) return { segments: [], status: "not_configured" };
  const audioPath = path.join(tempDir, "transcription.mp3");
  try {
    await execFileAsync("ffmpeg", ["-y", "-v", "error", "-i", input, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k", audioPath]);
    const audio = await fs.readFile(audioPath);
    if (audio.length > 24 * 1024 * 1024) {
      return { segments: [], status: "audio_too_long" };
    }
    const form = new FormData();
    form.append("file", new Blob([audio], { type: "audio/mpeg" }), "audio.mp3");
    form.append("model", "whisper-1");
    form.append("response_format", "verbose_json");
    form.append("timestamp_granularities[]", "segment");
    const normalizedLanguage = language === "Hindi" || language === "Hinglish" ? "hi" : language === "English" ? "en" : "";
    if (normalizedLanguage) form.append("language", normalizedLanguage);
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "Transcription service request failed.");
    const segments = Array.isArray(data.segments) ? data.segments
      .filter(segment => Number.isFinite(segment.start) && Number.isFinite(segment.end) && segment.text?.trim())
      .map(segment => ({ start: segment.start, end: segment.end, text: segment.text.trim() })) : [];
    return { segments, status: segments.length ? "ready" : "no_speech" };
  } finally {
    await fs.rm(audioPath, { force: true }).catch(() => {});
  }
}

function makeSrt(segments, clipStart, clipDuration) {
  const selected = segments.filter(segment => segment.end > clipStart && segment.start < clipStart + clipDuration);
  return selected.map((segment, index) => {
    const start = Math.max(0, segment.start - clipStart);
    const end = Math.min(clipDuration, segment.end - clipStart);
    return `${index + 1}\n${formatSrtTime(start)} --> ${formatSrtTime(end)}\n${segment.text}\n`;
  }).join("\n");
}

async function renderClip(ffmpeg, input, output, start, duration, subtitleFile) {
  const base = "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=22:10[bg];[0:v]scale=1080:1920:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1";
  const filter = subtitleFile
    ? `${base},subtitles='${subtitleFile.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'")}':force_style='FontName=Noto Sans Devanagari,FontSize=30,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=1,Alignment=2,MarginV=120'[v]`
    : `${base}[v]`;
  await execFileAsync(ffmpeg, [
    "-y", "-ss", String(start), "-i", input, "-t", String(duration),
    "-filter_complex", filter, "-map", "[v]", "-map", "0:a?",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
    "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", output
  ], { maxBuffer: 10 * 1024 * 1024 });
}

export async function processVideo({ input, outputDir, clipSeconds, language = "Auto detect", ffmpeg = "ffmpeg", ffprobe = "ffprobe" }) {
  await fs.mkdir(outputDir, { recursive: true });
  const { stdout } = await execFileAsync(ffprobe, ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", input]);
  const duration = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("Could not read video duration.");

  const pcm = await runPcm(ffmpeg, input);
  if (!pcm.length) throw new Error("No audio track found. Upload a video with audio.");
  const moments = rankMoments(pcm, Math.min(60, Math.max(5, clipSeconds)), duration);

  let transcription = { segments: [], status: "not_configured" };
  try {
    transcription = await transcribeVideo({ input, tempDir: outputDir, language });
  } catch (error) {
    transcription = { segments: [], status: "failed", message: error.message };
  }

  const clips = [];
  for (let i = 0; i < moments.length; i++) {
    const moment = moments[i];
    const name = `clip-${String(i + 1).padStart(2, "0")}.mp4`;
    const file = path.join(outputDir, name);
    let subtitleFile;
    if (transcription.segments.length) {
      const srt = makeSrt(transcription.segments, moment.start, moment.duration);
      if (srt.trim()) {
        subtitleFile = path.join(outputDir, `clip-${String(i + 1).padStart(2, "0")}.srt`);
        await fs.writeFile(subtitleFile, srt, "utf8");
      }
    }
    await renderClip(ffmpeg, input, file, moment.start, moment.duration, subtitleFile);
    clips.push({
      name,
      url: `/outputs/${path.basename(outputDir)}/${name}`,
      startSeconds: moment.start,
      durationSeconds: moment.duration,
      score: Math.round(moment.score),
      subtitles: Boolean(subtitleFile)
    });
  }
  return {
    durationSeconds: duration,
    method: "audio-energy heuristic (not semantic AI)",
    subtitleStatus: transcription.status,
    subtitleMessage: transcription.message,
    clips
  };
}
