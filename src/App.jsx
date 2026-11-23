import { useState } from "react";
import { Sparkles, Upload, Link2, Scissors, Video, Radio, Download, Languages, Zap, LoaderCircle } from "lucide-react";

const API = import.meta.env.VITE_API_URL ?? "";
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

export default function App() {
  const [mode, setMode] = useState("video");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState(null);
  const [language, setLanguage] = useState("Hindi");
  const [duration, setDuration] = useState("30");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [clips, setClips] = useState([]);

  async function submit(e) {
    e.preventDefault();
    setClips([]);
    if (mode === "live") {
      setStatus("Live-stream clipping is not available yet. Switch to Video mode and upload a recording.");
      return;
    }
    if (!file) {
      setStatus("Please choose a video file to continue. URL processing is coming soon.");
      return;
    }
    if (file.size > 500 * 1024 * 1024) {
      setStatus("This file is larger than the current 500 MB upload limit.");
      return;
    }

    setBusy(true);
    setStatus("Uploading video…");
    try {
      const body = new FormData();
      body.append("mode", "video");
      body.append("sourceUrl", url);
      body.append("language", language);
      body.append("clipDuration", duration);
      body.append("video", file);

      const response = await fetch(API + "/api/jobs", { method: "POST", body });
      const job = await response.json();
      if (!response.ok) throw Error(job.error || "Could not create job.");

      setStatus("Video uploaded. Finding high-energy moments…");
      for (let attempt = 0; attempt < 180; attempt++) {
        await wait(2000);
        const poll = await fetch(API + "/api/jobs/" + job.jobId);
        const data = await poll.json();
        if (!poll.ok) throw Error(data.error || "Could not check job status.");
        if (data.status === "completed") {
          setClips(data.clips || []);
          setStatus(data.subtitleStatus === "ready" ? "Finished! Hindi/English subtitles have been added to clips." : data.subtitleStatus === "not_configured" ? "Clips are ready. Add OPENAI_API_KEY in Render to enable automatic subtitles." : data.subtitleStatus === "audio_too_long" ? "Clips are ready, but the source audio is too long for one transcription request." : data.subtitleStatus === "failed" ? "Clips are ready, but transcription failed: " + (data.subtitleMessage || "check API key and try again.") : "Clips are ready. No speech was detected for subtitles.");
          return;
        }
        if (data.status === "failed") throw Error(data.error || "Clip processing failed.");
        setStatus(data.status === "processing"
          ? "Analyzing audio and rendering vertical clips…"
          : "Waiting for processing…");
      }
      setStatus("Processing is taking longer than expected. Please try again later.");
    } catch (err) {
      setStatus(err.message === "Failed to fetch"
        ? "Cannot reach the API server. Please check the deployment and try again."
        : err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <nav className="nav">
        <a className="brand"><span className="brandIcon"><Scissors /></span>ViralClip<span>AI</span></a>
        <span className="tag">● CREATOR STUDIO</span>
      </nav>
      <header className="hero">
        <div className="eyebrow"><Sparkles size={14} /> AUTOMATED VIDEO CLIP GENERATION</div>
        <h1>One long video.<br /><em>Many shareable moments.</em></h1>
        <p>Find high-energy moments and turn them into vertical short clips.</p>
      </header>

      <section className="panel">
        <div className="switch">
          <button type="button" className={mode === "video" ? "active" : ""} onClick={() => { setMode("video"); setStatus(""); }}><Video /> Video mode</button>
          <button type="button" className={mode === "live" ? "active" : ""} onClick={() => { setMode("live"); setStatus(""); setClips([]); }}><Radio /> Live mode</button>
        </div>

        {mode === "live" ? (
          <div className="liveNotice">
            <Radio />
            <b>Live-stream clipping is coming soon</b>
            <p>This version processes uploaded video recordings. Live capture is not connected yet. Switch to Video mode to create clips from a recording.</p>
            <button type="button" className="submit" onClick={() => { setMode("video"); setStatus(""); }}>Switch to Video mode</button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <label className="upload">
              <input type="file" accept="video/*" onChange={e => { setFile(e.target.files?.[0] || null); setStatus(""); }} />
              <Upload />
              <b>{file ? file.name : "Choose a video to upload"}</b>
              <small>MP4, MOV, WEBM · Maximum 500 MB</small>
            </label>
            <label className="field">
              <span><Link2 /> Source URL · Coming soon</span>
              <input value={url} onChange={e => setUrl(e.target.value)} placeholder="Direct video URL processing is not enabled" disabled />
            </label>
            <div className="options">
              <label><span><Languages /> Subtitle language</span>
                <select value={language} onChange={e => setLanguage(e.target.value)}>
                  {["Hindi", "English", "Hinglish", "Auto detect"].map(x => <option key={x}>{x}</option>)}
                </select>
              </label>
              <label><span><Zap /> Clip duration</span>
                <select value={duration} onChange={e => setDuration(e.target.value)}>
                  {["15", "30", "45", "60"].map(x => <option value={x} key={x}>{x} seconds</option>)}
                </select>
              </label>
            </div>
            <p className="subtitleHint">Auto captions need an OPENAI_API_KEY set in Render Environment. Keep the key private.</p>
            <button className="submit" disabled={busy}>
              {busy ? <><LoaderCircle className="spin" /> Processing…</> : <><Sparkles /> Find highlight moments</>}
            </button>
            {status && <p className="status" role="status">{status}</p>}
          </form>
        )}

        {clips.length > 0 && (
          <div className="results">
            <h3><Sparkles size={17} /> Generated clips</h3>
            {clips.map((clip, i) => (
              <a className="clip" key={clip.name} href={API + clip.url} target="_blank" rel="noreferrer">
                <span><Video /> Clip {i + 1} · {clip.durationSeconds}s {clip.subtitles ? "· Subtitles on" : "· No subtitles"}</span>
                <small>Starts at {clip.startSeconds}s</small>
                <b><Download size={16} /> Download MP4</b>
              </a>
            ))}
          </div>
        )}
      </section>

      <section className="features">
        <div><Scissors /><b>Audio energy scan</b><small>Finds louder moments</small></div>
        <div><Video /><b>Vertical 9:16</b><small>Blurred-fill framing</small></div>
        <div><Download /><b>MP4 export</b><small>Download your clips</small></div>
      </section>
      <p className="note">Highlight ranking currently uses audio energy, not semantic AI. Automatic subtitles require OPENAI_API_KEY in Render. Live capture is not available yet. Only process content you own or are authorized to use.</p>
    </main>
  );
}
