(function(root){
 'use strict';
 const MAX_META=16*1024*1024,MAX_FRAMES=500000;
 const unknown=reason=>({status:'unknown',reason});
 const tag=(v,p)=>String.fromCharCode(...new Uint8Array(v.buffer,v.byteOffset+p,4));
 function uint64(v,p){const value=v.getUint32(p)*4294967296+v.getUint32(p+4);if(!Number.isSafeInteger(value))throw Error('时间值过大');return value;}
 function int64(v,p){return v.getInt32(p)*4294967296+v.getUint32(p+4);}
 function boxes(v,start=0,end=v.byteLength){const result=[];let p=start;while(p<end){if(p+8>end)throw Error('视频元数据不完整');let size=v.getUint32(p),header=8;if(size===1){if(p+16>end)throw Error('扩展头不完整');size=uint64(v,p+8);header=16;}if(size===0)size=end-p;if(size<header||p+size>end)throw Error('视频元数据长度无效');result.push({type:tag(v,p+4),data:p+header,end:p+size});p+=size;}return result;}
 const children=(v,box)=>boxes(v,box.data,box.end);
 const find=(v,box,name)=>children(v,box).find(b=>b.type===name);
 function requireBytes(box,start,length){if(!box||start+length>box.end)throw Error('视频元数据字段不完整');}
 function timeScale(v,box){if(!box)throw Error('缺少时间基准');const offset=box.data+(v.getUint8(box.data)===1?20:12);requireBytes(box,offset,4);const scale=v.getUint32(offset);if(!scale)throw Error('视频时间基准无效');return scale;}
 function parseMoov(buffer){
  const v=new DataView(buffer),moov=boxes(v).find(b=>b.type==='moov');if(!moov)return unknown('未找到视频轨道信息');
  const tracks=children(v,moov).filter(b=>b.type==='trak').map(trak=>{const mdia=find(v,trak,'mdia'),tkhd=find(v,trak,'tkhd');if(!mdia)return null;const h=find(v,mdia,'hdlr');if(!h||h.data+12>h.end||tag(v,h.data+8)!=='vide')return null;return {trak,mdia,enabled:!tkhd||!!(v.getUint32(tkhd.data)&1)};}).filter(Boolean);
  const enabled=tracks.filter(t=>t.enabled),candidates=enabled.length?enabled:tracks;
  if(candidates.length!==1)return unknown(candidates.length?'视频包含多个画面轨道，需手动设置':'未找到视频轨道');
  const {trak,mdia}=candidates[0],scale=timeScale(v,find(v,mdia,'mdhd')),minf=find(v,mdia,'minf'),stbl=minf&&find(v,minf,'stbl'),stts=stbl&&find(v,stbl,'stts');
  if(!stts)return unknown('缺少帧时间表（可能是分片视频）');
  requireBytes(stts,stts.data,8);const count=v.getUint32(stts.data+4);requireBytes(stts,stts.data+8,count*8);
  const runs=[];let sampleCount=0,totalTicks=0;
  for(let i=0;i<count;i++){const p=stts.data+8+i*8,n=v.getUint32(p),delta=v.getUint32(p+4);if(!n)continue;if(!delta)throw Error('不支持零时长帧');sampleCount+=n;totalTicks+=n*delta;runs.push({count:n,delta});}
  if(!sampleCount||!totalTicks)return unknown('缺少完整帧时间表（可能是分片视频）');
  const fps=sampleCount*scale/totalTicks;if(!Number.isFinite(fps)||fps<1||fps>240)return unknown('识别帧率超出当前支持范围（1–240 fps）');
  if(sampleCount>MAX_FRAMES)return unknown('帧数超出本地时间表解析上限');
  const times=new Float64Array(sampleCount);let index=0,ticks=0;
  for(const run of runs)for(let i=0;i<run.count;i++){times[index++]=ticks;ticks+=run.delta;}
  const ctts=find(v,stbl,'ctts');
  if(ctts){requireBytes(ctts,ctts.data,8);const signed=v.getUint8(ctts.data)===1,n=v.getUint32(ctts.data+4);requireBytes(ctts,ctts.data+8,n*8);index=0;for(let i=0;i<n;i++){const p=ctts.data+8+i*8,repeat=v.getUint32(p),offset=signed?v.getInt32(p+4):v.getUint32(p+4);if(index+repeat>sampleCount)throw Error('帧显示时间表无效');for(let j=0;j<repeat;j++)times[index++]+=offset;}if(index!==sampleCount)throw Error('帧显示时间表不完整');}
  // Apply a normal playback edit (optional empty lead-in + one media segment).
  let mediaStart=0,lead=0,mediaEnd=Infinity;const edts=find(v,trak,'edts'),elst=edts&&find(v,edts,'elst');
  if(elst){const movieScale=timeScale(v,find(v,moov,'mvhd'));requireBytes(elst,elst.data,8);const large=v.getUint8(elst.data)===1,entries=v.getUint32(elst.data+4),size=large?20:12;requireBytes(elst,elst.data+8,entries*size);let seen=false;
   for(let i=0;i<entries;i++){const p=elst.data+8+i*size,duration=large?uint64(v,p):v.getUint32(p),media=large?int64(v,p+8):v.getInt32(p+4),ratePos=p+(large?16:8);if(v.getInt16(ratePos)!==1||v.getInt16(ratePos+2)!==0)return unknown('视频含变速剪辑，需手动设置');if(media===-1&&!seen){lead+=duration/movieScale;continue;}if(seen||media<0)return unknown('视频含多段编辑，需手动设置');seen=true;mediaStart=media;mediaEnd=duration?mediaStart+duration/movieScale*scale:Infinity;}
  }
  const frameTimes=Array.from(times).filter(t=>t>=mediaStart&&t<mediaEnd).map(t=>lead+(t-mediaStart)/scale).sort((a,b)=>a-b);
  if(!frameTimes.length)return unknown('没有可用的显示帧');
  if(frameTimes.some((time,i)=>i&&time<=frameTimes[i-1]))return unknown('存在重合的显示时间，需手动设置');
  let min=Infinity,max=0;for(let i=1;i<frameTimes.length;i++){const delta=frameTimes[i]-frameTimes[i-1];min=Math.min(min,delta);max=Math.max(max,delta);}
  let minDuration=Infinity,maxDuration=0;for(const run of runs){minDuration=Math.min(minDuration,run.delta);maxDuration=Math.max(maxDuration,run.delta);}
  const variable=maxDuration-minDuration>1||(frameTimes.length>1&&max-min>1/scale+1e-8);
  return {status:'detected',fps,variable,source:'MP4/MOV 视频时间表',sampleCount:frameTimes.length,frameTimes};
 }
 async function detect(blob,{isCancelled=()=>false}={}){
  try{
   if(!blob||blob.size<8)return unknown('文件过小，无法识别');
   const head=new DataView(await blob.slice(0,16).arrayBuffer());
   if(head.getUint32(0)===0x1a45dfa3){if(root.WebmFrameRate)return root.WebmFrameRate.detect(blob,{isCancelled});return unknown('此WebM缺少可用的帧率解析器');}
   let p=0,checked=0;
   while(p+8<=blob.size&&checked++<4096){if(isCancelled())return unknown('已取消');const v=new DataView(await blob.slice(p,p+16).arrayBuffer());let size=v.getUint32(0),header=8;if(size===1){if(v.byteLength<16)throw Error('不完整的视频头');size=uint64(v,8);header=16;}if(size===0)size=blob.size-p;if(size<header||p+size>blob.size)return unknown('文件格式或视频头无效');if(tag(v,4)==='moov'){if(size>MAX_META)return unknown('视频元数据超过本地解析上限');const data=await blob.slice(p,p+size).arrayBuffer();if(isCancelled())return unknown('已取消');return parseMoov(data);}p+=size;}
   return unknown('未找到支持的帧率信息，请手动设置');
  }catch(e){return unknown('无法识别帧率：'+e.message);}
 }
 function nearestIndex(times,value,duration=Infinity){
  let lo=0,hi=times.length;while(lo<hi){const mid=(lo+hi)>>>1;if(times[mid]<duration)lo=mid+1;else hi=mid;}const count=lo;if(!count)return -1;
  lo=0;hi=count;while(lo<hi){const mid=(lo+hi)>>>1;if(times[mid]<value)lo=mid+1;else hi=mid;}
  if(lo===0)return 0;if(lo===count)return count-1;return value-times[lo-1]<times[lo]-value?lo-1:lo;
 }
 const api={detect,parseMoov,nearestIndex};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.VideoFrameRate=api;
})(typeof window!=='undefined'?window:globalThis);
