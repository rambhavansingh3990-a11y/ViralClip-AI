import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
const execFileAsync=promisify(execFile);

function runPcm(ffmpeg,input){
  return new Promise((resolve,reject)=>{
    const child=spawn(ffmpeg,["-v","error","-i",input,"-vn","-ac","1","-ar","8000","-f","s16le","pipe:1"]);
    const chunks=[];let error="";
    child.stdout.on("data",c=>chunks.push(c));
    child.stderr.on("data",c=>error+=c.toString());
    child.on("error",reject);
    child.on("close",code=>code===0?resolve(Buffer.concat(chunks)):reject(new Error(error||"Audio analysis failed. Check FFmpeg installation.")));
  });
}
function rankMoments(pcm,clipSeconds,duration){
  const bytesPerSecond=16000;
  const seconds=Math.floor(pcm.length/bytesPerSecond);
  const rms=[];
  for(let s=0;s<seconds;s++){
    const start=s*bytesPerSecond,end=Math.min(start+bytesPerSecond,pcm.length);
    let sum=0,count=0;
    for(let i=start;i+1<end;i+=2){const n=pcm.readInt16LE(i);sum+=n*n;count++;}
    rms.push(count?Math.sqrt(sum/count):0);
  }
  const length=Math.max(1,Math.min(clipSeconds,seconds));
  const step=Math.max(1,Math.floor(length/3));
  const candidates=[];
  for(let start=0;start+length<=seconds;start+=step){
    const segment=rms.slice(start,start+length);
    const score=segment.reduce((a,b)=>a+b,0)/segment.length;
    candidates.push({start,duration:length,score});
  }
  if(!candidates.length)candidates.push({start:0,duration:Math.max(1,Math.min(length,duration)),score:0});
  candidates.sort((a,b)=>b.score-a.score);
  const chosen=[];
  for(const c of candidates){
    if(chosen.every(x=>c.start+c.duration<=x.start||c.start>=x.start+x.duration))chosen.push(c);
    if(chosen.length===3)break;
  }
  return chosen.sort((a,b)=>a.start-b.start);
}
async function renderClip(ffmpeg,input,output,start,duration){
  const filter="[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=22:10[bg];[0:v]scale=1080:1920:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1[v]";
  await execFileAsync(ffmpeg,["-y","-ss",String(start),"-i",input,"-t",String(duration),"-filter_complex",filter,"-map","[v]","-map","0:a?","-c:v","libx264","-preset","veryfast","-crf","23","-c:a","aac","-b:a","128k","-movflags","+faststart",output],{maxBuffer:10*1024*1024});
}
export async function processVideo({input,outputDir,clipSeconds,ffmpeg="ffmpeg",ffprobe="ffprobe"}){
  await fs.mkdir(outputDir,{recursive:true});
  const {stdout}=await execFileAsync(ffprobe,["-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1",input]);
  const duration=Number.parseFloat(stdout.trim());
  if(!Number.isFinite(duration)||duration<=0)throw new Error("Could not read video duration.");
  const pcm=await runPcm(ffmpeg,input);
  if(!pcm.length)throw new Error("No audio track found. This first version ranks clips using audio energy; upload a video with audio.");
  const moments=rankMoments(pcm,Math.min(60,Math.max(5,clipSeconds)),duration);
  const clips=[];
  for(let i=0;i<moments.length;i++){
    const m=moments[i],name=`clip-${String(i+1).padStart(2,"0")}.mp4`,file=path.join(outputDir,name);
    await renderClip(ffmpeg,input,file,m.start,m.duration);
    clips.push({name,url:`/outputs/${path.basename(outputDir)}/${name}`,startSeconds:m.start,durationSeconds:m.duration,score:Math.round(m.score)});
  }
  return {durationSeconds:duration,method:"audio-energy heuristic (not semantic AI)",clips};
}
