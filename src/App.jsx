import { useState } from "react";
import { Sparkles, Upload, Link2, Scissors, Video, Download, Languages, Zap, LoaderCircle } from "lucide-react";

const API = import.meta.env.VITE_API_URL ?? "";
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

export default function App() {
  const [mode, setMode] = useState("url");
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
    if (mode === "url" && !url.trim()) return setStatus("Paste a direct public video-file URL.");
    if (mode === "url") {
      try {
        const parsed = new URL(url.trim());
        if (["youtube.com", "www.youtube.com", "youtu.be", "m.youtube.com"].includes(parsed.hostname.toLowerCase())) {
          return setStatus("YouTube share links are not direct video files. Use a public direct MP4, MOV, or WEBM URL instead.");
        }
      } catch {
        return setStatus("Enter a valid public video URL.");
      }
    }
    if (mode === "file" && !file) return setStatus("Choose a video file first.");
    if (mode === "file" && file.size > 500 * 1024 * 1024) return setStatus("This file is larger than the 500 MB upload limit.");
    setBusy(true);
    setStatus(mode === "url" ? "Fetching video from link…" : "Uploading video…");
    try {
      let response;
      if (mode === "url") {
        response = await fetch(API + "/api/jobs/from-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceUrl: url.trim(), language, clipDuration: duration }) });
      } else {
        const body = new FormData();
        body.append("language", language);
        body.append("clipDuration", duration);
        body.append("video", file);
        response = await fetch(API + "/api/jobs", { method: "POST", body });
      }
      const readApiResponse = async (res, action) => {
        const contentType = res.headers.get("content-type") || "";
        const raw = await res.text();
        if (!contentType.includes("application/json")) {
          if (raw.trimStart().startsWith("<")) {
            throw Error("The video API returned an HTML page instead of JSON. Render may still be running an older deployment. Open Render and redeploy the latest GitHub commit, then try again.");
          }
          throw Error("The video API returned an unexpected response. Please retry after the server is redeployed.");
        }
        let parsed;
        try { parsed = JSON.parse(raw); } catch { throw Error("The video API returned invalid JSON. Please retry after the server is redeployed."); }
        if (!res.ok) throw Error(parsed.error || action);
        return parsed;
      };
      const job = await readApiResponse(response, "Could not create job.");
      for (let attempt = 0; attempt < 180; attempt++) {
        await wait(2000);
        const poll = await fetch(API + "/api/jobs/" + job.jobId);
        const data = await readApiResponse(poll, "Could not check job status.");
        if (data.status === "completed") {
          setClips(data.clips || []);
          setStatus(data.subtitleStatus === "ready" ? "Done! Captions have been added." : data.subtitleStatus === "not_configured" ? "Clips ready. Add OPENAI_API_KEY in Render to enable captions." : "Clips are ready to download.");
          return;
        }
        if (data.status === "failed") throw Error(data.error || "Clip processing failed.");
        setStatus(data.status === "downloading" ? "Downloading source video securely…" : "Finding highlights and rendering vertical clips…");
      }
      setStatus("Processing is taking longer than expected. Try again later.");
    } catch (err) {
      setStatus(err.message === "Failed to fetch" ? "Cannot reach the API server. Check deployment and try again." : err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <nav className="nav"><a className="brand"><span className="brandIcon"><Scissors /></span>ViralClip<span>AI</span></a><span className="tag">● URL TO CLIP STUDIO</span></nav>
      <header className="hero"><div className="eyebrow"><Sparkles size={14} /> AUTOMATED VIDEO CLIP GENERATION</div><h1>One link.<br /><em>Many shareable clips.</em></h1><p>Paste a direct video link and turn long videos into vertical Shorts.</p></header>
      <section className="panel">
        <div className="switch">
          <button type="button" className={mode === "url" ? "active" : ""} onClick={() => { setMode("url"); setStatus(""); }}><Link2 /> Paste video URL</button>
          <button type="button" className={mode === "file" ? "active" : ""} onClick={() => { setMode("file"); setStatus(""); }}><Upload /> Upload file</button>
        </div>
        <form onSubmit={submit}>
          {mode === "url" ? <label className="field"><span><Link2 /> Public direct video URL</span><input type="url" value={url} onChange={e => { setUrl(e.target.value); setStatus(""); }} placeholder="https://example.com/video.mp4" required /><small>Direct MP4, MOV, or WEBM file link only. YouTube watch/share links and private Drive pages are not supported.</small></label> : <label className="upload"><input type="file" accept="video/*" onChange={e => { setFile(e.target.files?.[0] || null); setStatus(""); }} /><Upload /><b>{file ? file.name : "Choose a video to upload"}</b><small>MP4, MOV, WEBM · Maximum 500 MB</small></label>}
          <div className="options">
            <label><span><Languages /> Subtitle language</span><select value={language} onChange={e => setLanguage(e.target.value)}>{["Hindi", "English", "Hinglish", "Auto detect"].map(x => <option key={x}>{x}</option>)}</select></label>
            <label><span><Zap /> Clip duration</span><select value={duration} onChange={e => setDuration(e.target.value)}>{["15", "30", "45", "60"].map(x => <option value={x} key={x}>{x} seconds</option>)}</select></label>
          </div>
          <p className="subtitleHint">Automatic captions require OPENAI_API_KEY in Render Environment. Never share your key.</p>
          <button className="submit" disabled={busy}>{busy ? <><LoaderCircle className="spin" /> Processing…</> : <><Sparkles /> Generate viral clips</>}</button>
          {status && <p className="status" role="status">{status}</p>}
        </form>
        {clips.length > 0 && <div className="results"><h3><Sparkles size={17} /> Your generated clips</h3>{clips.map((clip, i) => <a className="clip" key={clip.name} href={API + clip.url} target="_blank" rel="noreferrer"><span><Video /> Clip {i + 1} · {clip.durationSeconds}s {clip.subtitles ? "· Subtitles on" : "· No subtitles"}</span><small>Starts at {clip.startSeconds}s</small><b><Download size={16} /> Download MP4</b></a>)}</div>}
      </section>
      <section className="features"><div><Scissors /><b>Highlight scan</b><small>Finds loud / energetic moments</small></div><div><Video /><b>Vertical 9:16</b><small>Shorts & Reels format</small></div><div><Download /><b>MP4 export</b><small>Download your clips</small></div></section>
      <p className="note">Highlight ranking currently uses audio energy, not semantic AI. Only process videos you own or are authorized to use. No DRM, login, or paywall bypass.</p>
    </main>
  );
}