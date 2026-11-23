import{useState}from"react";import{Sparkles,Upload,Link2,Scissors,Video,Radio,Download,Languages,Zap,LoaderCircle}from"lucide-react";
const API=import.meta.env.VITE_API_URL??"";
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export default function App(){
 const[mode,setMode]=useState("video"),[url,setUrl]=useState(""),[file,setFile]=useState(null),[language,setLanguage]=useState("Hindi"),[duration,setDuration]=useState("30"),[status,setStatus]=useState(""),[busy,setBusy]=useState(false),[clips,setClips]=useState([]);
 async function submit(e){
  e.preventDefault();setClips([]);
  if(mode==="video"&&!file&&!url.trim())return setStatus("Choose a video file first.");
  if(mode==="live")return setStatus("Live capture is not enabled yet. Use Video mode to upload a recorded video.");
  if(!file)return setStatus("URL processing is not enabled yet. Please upload the video file directly.");
  setBusy(true);setStatus("Uploading video…");
  try{
   const body=new FormData();body.append("mode",mode);body.append("sourceUrl",url);body.append("language",language);body.append("clipDuration",duration);body.append("video",file);
   const response=await fetch(API+"/api/jobs",{method:"POST",body});const job=await response.json();if(!response.ok)throw Error(job.error||"Could not create job.");
   setStatus("Video uploaded. Finding highlight moments…");
   for(let attempt=0;attempt<180;attempt++){
    await wait(2000);const poll=await fetch(API+"/api/jobs/"+job.jobId);const data=await poll.json();if(!poll.ok)throw Error(data.error||"Could not check job status.");
    if(data.status==="completed"){setClips(data.clips||[]);setStatus("Finished! Your vertical clips are ready.");return;}
    if(data.status==="failed")throw Error(data.error||"Clip processing failed.");
    setStatus(data.status==="processing"?"Analyzing audio and rendering vertical clips…":"Waiting for processing…");
   }
   setStatus("Processing is taking longer than expected. Check the job again later.");
  }catch(err){setStatus(err.message==="Failed to fetch"?"Cannot reach the API server. Deploy it and set VITE_API_URL, or run npm run server locally.":err.message);}
  finally{setBusy(false);}
 }
 return <main className="shell"><nav className="nav"><a className="brand"><span className="brandIcon"><Scissors/></span>ViralClip<span>AI</span></a><span className="tag">● CREATOR STUDIO</span></nav>
 <header className="hero"><div className="eyebrow"><Sparkles size={14}/> AI-POWERED VIDEO REPURPOSING</div><h1>One long video.<br/><em>Many viral moments.</em></h1><p>Find moments worth sharing and turn them into vertical shorts.</p></header>
 <section className="panel"><div className="switch"><button className={mode==="video"?"active":""} onClick={()=>setMode("video")}><Video/> Video mode</button><button className={mode==="live"?"active":""} onClick={()=>setMode("live")}><Radio/> Live mode</button></div>
 <form onSubmit={submit}><label className="upload"><input type="file" accept="video/*" onChange={e=>setFile(e.target.files?.[0]||null)}/><Upload/><b>{file?file.name:"Choose a video to upload"}</b><small>MP4, MOV, WEBM · Direct upload supported</small></label>
 <label className="field"><span><Link2/> Source URL (coming soon)</span><input value={url} onChange={e=>setUrl(e.target.value)} placeholder="URL ingestion is not enabled yet" disabled/></label>
 <div className="options"><label><span><Languages/> Subtitle language</span><select value={language} onChange={e=>setLanguage(e.target.value)}>{["Hindi","English","Hinglish","Auto detect"].map(x=><option key={x}>{x}</option>)}</select></label><label><span><Zap/> Clip duration</span><select value={duration} onChange={e=>setDuration(e.target.value)}>{["15","30","45","60"].map(x=><option value={x} key={x}>{x} seconds</option>)}</select></label></div>
 <button className="submit" disabled={busy}>{busy?<><LoaderCircle className="spin"/> Processing…</>:<><Sparkles/> Find viral moments</>}</button>{status&&<p className="status">{status}</p>}</form>
 {clips.length>0&&<div className="results"><h3><Sparkles size={17}/> Generated clips</h3>{clips.map((clip,i)=><a className="clip" key={clip.name} href={API+clip.url} target="_blank" rel="noreferrer"><span><Video/> Clip {i+1} · {clip.durationSeconds}s</span><small>Starts at {clip.startSeconds}s</small><b><Download size={16}/> Download MP4</b></a>)}</div>}
 </section>
 <section className="features"><div><Scissors/><b>Audio highlight scan</b><small>Ranks energetic moments</small></div><div><Video/><b>Vertical 9:16</b><small>Blurred-fill framing</small></div><div><Download/><b>MP4 export</b><small>Download generated clips</small></div></section><p className="note">First version ranks audio energy, not meaning. Only process content you own or are authorized to use.</p></main>;
}