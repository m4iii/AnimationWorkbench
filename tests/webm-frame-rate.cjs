const assert=require('node:assert/strict');
const W=require('../frontend/webm-frame-rate.js');
const join=(...parts)=>Uint8Array.from(parts.flatMap(p=>Array.from(p)));
const hex=n=>Uint8Array.from(n.toString(16).match(/../g).map(v=>parseInt(v,16)));
function size(n){for(let len=1;len<=8;len++){if(n<2**(7*len)-1){const out=Array(len).fill(0);let value=n;for(let i=len-1;i>=0;i--){out[i]=value%256;value=Math.floor(value/256);}out[0]|=1<<(8-len);return out;}}throw Error('size');}
const el=(id,body)=>join(hex(id),size(body.length),body);
function uint(n){const out=[];do{out.unshift(n%256);n=Math.floor(n/256);}while(n);return out;}
const number=(id,n)=>el(id,uint(n));
const entry=(duration,type=1,enabled=1)=>el(0xAE,join(number(0x83,type),number(0xB9,enabled),duration===null?[]:number(0x23E383,duration)));
const header=el(0x1A45DFA3,el(0x4282,new TextEncoder().encode('webm')));
const movie=(entries,unknownSegment=false)=>new Blob([header,unknownSegment?join(hex(0x18538067),[0x01,255,255,255,255,255,255,255],el(0x1654AE6B,entries)):el(0x18538067,el(0x1654AE6B,entries))]);
async function main(){
  let tests=0;const check=async(name,fn)=>{await fn();tests++;};
  await check('24 fps declared duration',async()=>{const r=await W.detect(movie(entry(41666667)));assert.equal(r.status,'detected');assert.ok(Math.abs(r.fps-24)<1e-6);assert.equal(r.declared,true);assert.equal(r.source,'WebM DefaultDuration');});
  await check('fractional declared rate retained',async()=>{const r=await W.detect(movie(entry(33366667)));assert.ok(Math.abs(r.fps-30000/1001)<1e-6);});
  await check('unknown-sized Segment accepted',async()=>assert.equal((await W.detect(movie(entry(40000000),true))).fps,25));
  await check('audio ignored',async()=>assert.equal((await W.detect(movie(join(entry(20000000,2),entry(40000000))))).fps,25));
  await check('disabled video ignored',async()=>assert.equal((await W.detect(movie(join(entry(20000000,1,0),entry(40000000))))).fps,25));
  await check('multiple video tracks rejected',async()=>assert.equal((await W.detect(movie(join(entry(40000000),entry(40000000))))).reason,'multiple_video_tracks'));
  await check('missing timing does not guess',async()=>assert.equal((await W.detect(movie(entry(null)))).reason,'default_duration_missing'));
  await check('zero duration rejected',async()=>assert.equal((await W.detect(movie(entry(0)))).status,'unknown'));
  await check('audio alone rejected',async()=>assert.equal((await W.detect(movie(entry(40000000,2)))).reason,'no_video_track'));
  await check('zero and truncated VINT handled',async()=>{assert.equal((await W.detect(new Blob([[0]]))).status,'unknown');assert.equal((await W.detect(new Blob([header,hex(0x18538067),[0]]))).status,'unknown');});
  await check('truncated Tracks rejected',async()=>{const b=movie(entry(40000000));assert.equal((await W.detect(b.slice(0,b.size-2))).status,'unknown');});
  await check('unknown-sized Tracks rejected',async()=>{const b=new Blob([header,el(0x18538067,join(hex(0x1654AE6B),[255],entry(40000000)))]);assert.equal((await W.detect(b)).reason,'unknown_element_size');});
  await check('duplicate timing rejected',async()=>{const b=movie(el(0xAE,join(number(0x83,1),number(0x23E383,40000000),number(0x23E383,50000000))));assert.equal((await W.detect(b)).reason,'duplicate_track_metadata');});
  await check('read bounded to 8 MiB',async()=>{let end;const b=movie(entry(40000000));const mock={size:W.MAX_PREFIX*2,slice(start,to){assert.equal(start,0);end=to;return b;}};assert.equal((await W.detect(mock)).status,'detected');assert.equal(end,W.MAX_PREFIX);});
  await check('cancellation before and after read',async()=>{assert.equal((await W.detect(movie(entry(40000000)),{isCancelled:()=>true})).reason,'cancelled');let cancelled=false;const b=movie(entry(40000000));const mock={size:b.size,slice(){cancelled=true;return b;}};assert.equal((await W.detect(mock,{isCancelled:()=>cancelled})).reason,'cancelled');});
  await check('oversized uint rejected',async()=>{const b=movie(el(0xAE,join(number(0x83,1),el(0x23E383,Array(8).fill(255)))));assert.equal((await W.detect(b)).status,'unknown');});
  console.log(JSON.stringify({suite:'webm-frame-rate',passed:tests}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
