import express from "express";
import cors from "cors";
import multer from "multer";
import crypto from "node:crypto";
import dns from "node:dns/promises";
import net from "node:net";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import fs from "node:fs";
import path from "node:path";
import { processVideo } from "./processor.js";

const app=express(),port=Number(process.env.PORT||8787);
const uploadDir=path.resolve("uploads"),outputDir=path.resolve("outputs");
fs.mkdirSync(uploadDir,{recursive:true});fs.mkdirSync(outputDir,{recursive:true});
app.use(cors());app.use(express.json());app.use("/outputs",express.static(outputDir));
app.use(express.static(path.resolve("dist")));
const jobs=new Map();
const MAX_SOURCE_BYTES=Number(process.env.MAX_SOURCE_MB||500)*1024*1024;

function isPrivateAddress(address){
  const v=address.toLowerCase().replace(/^::ffff:/,"");
  if(net.isIP(v)===4){const p=v.split(".").map(Number);return p[0]===10||p[0]===127||p[0]===0||p[0]===169&&p[1]===254||p[0]===172&&p[1]>=16&&p[1]<=31||p[0]===192&&p[1]===168||p[0]>=224;}
  return v==="::1"||v==="::"||v.startsWith("fc")||v.startsWith("fd")||v.startsWith("fe80:");
}
async function validatePublicUrl(value){
  let u;try{u=new URL(value);}catch{throw Error("Enter a valid direct video URL.");}
  if(!["http:","https:"].includes(u.protocol)||u.username||u.password)throw Error("Only public HTTP or HTTPS video links are supported.");
  if(u.hostname==="localhost"||u.hostname.endsWith(".localhost"))throw Error("Private or local URLs are not allowed.");
  const addresses=net.isIP(u.hostname)?[{address:u.hostname}]:await dns.lookup(u.hostname,{all:true,verbatim:true});
  if(!addresses.length||addresses.some(x=>isPrivateAddress(x.address)))throw Error("This URL does not point to a public internet host.");
  return u;
}
async function downloadDirectVideo(value,destination){
  let current=value,response;
  for(let hop=0;hop<4;hop++){
    const u=await validatePublicUrl(current);
    response=await fetch(u,{redirect:"manual",signal:AbortSignal.timeout(120000)});
    if([301,302,303,307,308].includes(response.status)){const location=response.headers.get("location");if(!location)throw Error("Video host returned an invalid redirect.");current=new URL(location,u).toString();continue;}
    break;
  }
  if(!response||!response.ok)throw Error("Could not fetch the video. Check that the direct file link is public and working.");
  const type=(response.headers.get("content-type")||"").split(";")[0].toLowerCase();
  const ext=new URL(current).pathname.toLowerCase().match(/\\.(mp4|mov|webm)$/)?.[1];
  const allowed=type.startsWith("video/")||["application/octet-stream","binary/octet-stream"].includes(type);
  if(!allowed||(!ext&&!type.startsWith("video/")))throw Error("This is not a direct video file. Use a public MP4, MOV, or WEBM link; normal YouTube links are not supported.");
  const length=Number(response.headers.get("content-length")||0);if(length>MAX_SOURCE_BYTES)throw Error("The source video exceeds the configured 500 MB limit.");
  if(!response.body)throw Error("The video host returned an empty file.");
  let bytes=0;const limiter=new Transform({transform(chunk,_enc,cb){bytes+=chunk.length;if(bytes>MAX_SOURCE_BYTES)cb(Error("The source video exceeds the configured 500 MB limit."));else cb(null,chunk);}});
  await pipeline(Readable.fromWeb(response.body),limiter,fs.createWriteStream(destination,{flags:"wx"}));
  if(bytes===0)throw Error("The video file is empty.");
}
const upload=multer({dest:uploadDir,limits:{fileSize:Number(process.env.MAX_UPLOAD_MB||500)*1024*1024},fileFilter:(_r,f,cb)=>f.mimetype.startsWith("video/")?cb(null,true):cb(new Error("Upload a valid video file."))});

app.get("/api/health",(_r,res)=>res.json({ok:true,service:"ViralClip AI API",ffmpegRequired:true,transcriptionConfigured:Boolean(process.env.OPENAI_API_KEY),features:{videoUpload:true,audioHighlightScan:true,verticalExport:true,burnedInSubtitles:Boolean(process.env.OPENAI_API_KEY),liveCapture:false,urlIngestion:true,directVideoUrlOnly:true}}));
app.post("/api/jobs",upload.single("video"),(req,res)=>{
  const {mode,sourceUrl,language,clipDuration}=req.body;
  if(!req.file){
    return res.status(400).json({error:mode==="live"?"Live-stream capture is not enabled in this starter yet.":"For now, upload a video file directly. URL ingestion is not enabled yet."});
  }
  const jobId=crypto.randomUUID();
  const job={jobId,status:"queued",mode:"video",language:language||"Auto detect",clipDuration:Number(clipDuration||30),clips:[],createdAt:new Date().toISOString()};
  jobs.set(jobId,job);
  res.status(202).json({jobId,status:job.status,statusUrl:`/api/jobs/${jobId}`});
  setImmediate(async()=>{
    job.status="processing";
    try{
      const result=await processVideo({input:req.file.path,outputDir:path.join(outputDir,jobId),clipSeconds:job.clipDuration,language:job.language});
      Object.assign(job,result,{status:"completed",completedAt:new Date().toISOString()});
    }catch(error){job.status="failed";job.error=error.message;}
    finally{try{await fs.promises.unlink(req.file.path);}catch{}}
  });
});
app.post("/api/jobs/from-url",async(req,res)=>{
  const {sourceUrl,language,clipDuration}=req.body||{};
  if(typeof sourceUrl!=="string"||!sourceUrl.trim())return res.status(400).json({error:"Paste a direct public video file URL."});
  const jobId=crypto.randomUUID(),input=path.join(uploadDir,jobId+".source");
  const job={jobId,status:"queued",mode:"url",language:language||"Auto detect",clipDuration:Number(clipDuration||30),clips:[],createdAt:new Date().toISOString()};jobs.set(jobId,job);
  res.status(202).json({jobId,status:job.status,statusUrl:`/api/jobs/${jobId}`});
  setImmediate(async()=>{
    try{job.status="downloading";await downloadDirectVideo(sourceUrl.trim(),input);job.status="processing";const result=await processVideo({input,outputDir:path.join(outputDir,jobId),clipSeconds:job.clipDuration,language:job.language});Object.assign(job,result,{status:"completed",completedAt:new Date().toISOString()});}
    catch(error){job.status="failed";job.error=error.message;}
    finally{try{await fs.promises.unlink(input);}catch{}}
  });
});
app.get("/api/jobs/:id",(req,res)=>{
  const job=jobs.get(req.params.id);
  if(!job)return res.status(404).json({error:"Job not found. Jobs are stored in memory and reset when the server restarts."});
  res.json(job);
});
app.get("*",(req,res,next)=>{if(req.path.startsWith("/api/")||req.path.startsWith("/outputs/"))return next();res.sendFile(path.resolve("dist/index.html"));});
app.use((err,_req,res,_next)=>res.status(400).json({error:err.message||"Request failed."}));
app.listen(port,()=>console.log(`ViralClip AI API listening on ${port}`));
