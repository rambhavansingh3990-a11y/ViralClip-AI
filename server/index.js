import express from "express";
import cors from "cors";
import multer from "multer";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { processVideo } from "./processor.js";

const app=express(),port=Number(process.env.PORT||8787);
const uploadDir=path.resolve("uploads"),outputDir=path.resolve("outputs");
fs.mkdirSync(uploadDir,{recursive:true});fs.mkdirSync(outputDir,{recursive:true});
app.use(cors());app.use(express.json());app.use("/outputs",express.static(outputDir));
app.use(express.static(path.resolve("dist")));
const jobs=new Map();
const upload=multer({dest:uploadDir,limits:{fileSize:Number(process.env.MAX_UPLOAD_MB||500)*1024*1024},fileFilter:(_r,f,cb)=>f.mimetype.startsWith("video/")?cb(null,true):cb(new Error("Upload a valid video file."))});

app.get("/api/health",(_r,res)=>res.json({ok:true,service:"ViralClip AI API",ffmpegRequired:true,transcriptionConfigured:Boolean(process.env.OPENAI_API_KEY),features:{videoUpload:true,audioHighlightScan:true,verticalExport:true,burnedInSubtitles:Boolean(process.env.OPENAI_API_KEY),liveCapture:false,urlIngestion:false}}));
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
app.get("/api/jobs/:id",(req,res)=>{
  const job=jobs.get(req.params.id);
  if(!job)return res.status(404).json({error:"Job not found. Jobs are stored in memory and reset when the server restarts."});
  res.json(job);
});
app.get("*",(req,res,next)=>{if(req.path.startsWith("/api/")||req.path.startsWith("/outputs/"))return next();res.sendFile(path.resolve("dist/index.html"));});
app.use((err,_req,res,_next)=>res.status(400).json({error:err.message||"Request failed."}));
app.listen(port,()=>console.log(`ViralClip AI API listening on ${port}`));
