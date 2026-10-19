const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
global.WebmFrameRate=require('../frontend/webm-frame-rate.js');
const V=require('../frontend/video-frame-rate.js');
global.VideoFrameRate=V;
const {Editor}=require('../frontend/motion-input.js');
function u32(n){const b=Buffer.alloc(4);b.writeUInt32BE(n>>>0);return b;}
const full=Buffer.alloc(4);
const box=(type,...parts)=>{const body=Buffer.concat(parts);return Buffer.concat([u32(body.length+8),Buffer.from(type),body]);};
function track({handler='vide',scale=30000,runs=[[60,1001]],offsets=null,edit=null,enabled=true,version=0}={}){
 const mdhd=box('mdhd',version===1?Buffer.concat([Buffer.from([1,0,0,0]),Buffer.alloc(16),u32(scale),Buffer.alloc(12)]):Buffer.concat([full,Buffer.alloc(8),u32(scale),Buffer.alloc(8)]));
 const stts=box('stts',full,u32(runs.length),...runs.map(([count,delta])=>Buffer.concat([u32(count),u32(delta)])));
 const ctts=offsets?box('ctts',full,u32(offsets.length),...offsets.map(([count,offset])=>Buffer.concat([u32(count),u32(offset)]))):Buffer.alloc(0);
 const edits=edit?box('edts',box('elst',full,u32(1),u32(edit.duration),u32(edit.start),Buffer.from([0,1,0,0]))):Buffer.alloc(0);
 return box('trak',box('tkhd',u32(enabled?1:0)),edits,box('mdia',mdhd,box('hdlr',full,u32(0),Buffer.from(handler)),box('minf',box('stbl',stts,ctts))));
}
function movie(tracks){return box('moov',box('mvhd',full,Buffer.alloc(8),u32(1000),Buffer.alloc(8)),...tracks);}
const file=(tracks)=>new Blob([box('ftyp',Buffer.from('isom')),box('mdat',Buffer.alloc(100)),movie(tracks)]);
function editorFixture(){const fields=new Map();const q=name=>{if(!fields.has(name))fields.set(name,{value:''});return fields.get(name);};const ed=Object.create(Editor.prototype);Object.assign(ed,{epoch:1,rateGeneration:0,timelineFps:30,sourceFrameTimes:null,sourceVideoBlob:{},frames:[],duration:2,q,events:[],renderRateStatus(){},updateControls(){},renderFrames(){},renderTime(){},changed(){},action(id,payload){this.events.push({id,payload});}});return ed;}
async function main(){
 let result=await V.detect(file([track()]));assert.equal(result.status,'detected');assert.equal(result.fps,30000/1001);assert.equal(result.sampleCount,60);assert.equal(result.variable,false);assert.ok(Math.abs(result.frameTimes[1]-1001/30000)<1e-12);
 result=await V.detect(file([track({handler:'soun',scale:48000,runs:[[100,1024]]}),track({scale:24000,runs:[[48,1000]],version:1})]));assert.equal(result.fps,24);
 result=await V.detect(file([track({scale:1000,runs:[[2,40],[2,100]]})]));assert.equal(result.variable,true);assert.deepEqual(result.frameTimes,[0,.04,.08,.18]);
 assert.equal(V.nearestIndex(result.frameTimes,.16,1),3);assert.equal(V.nearestIndex(result.frameTimes,100,.17),2);assert.equal(V.nearestIndex([],0,1),-1);
 result=await V.detect(file([track({scale:1000,runs:[[3,40]],offsets:[[3,80]],edit:{start:80,duration:120}})]));assert.deepEqual(result.frameTimes,[0,.04,.08]);
 result=await V.detect(file([track({scale:1000,runs:[[3,40]],offsets:[[1,80],[1,0],[1,0]]})]));assert.equal(result.status,'unknown','duplicate presentation times are not safe to snap');
 assert.equal((await V.detect(file([track(),track()]))).status,'unknown');
 assert.equal((await V.detect(file([track({enabled:false}),track({scale:1000,runs:[[30,40]]})]))).fps,25);
 assert.equal((await V.detect(new Blob([u32(99),Buffer.from('moov')]))).status,'unknown');
 assert.equal((await V.detect(file([track()]),{isCancelled:()=>true})).status,'unknown');
 assert.equal((await V.detect(file([track({runs:[]})]))).status,'unknown');
 const original=V.detect,pending=[];V.detect=()=>new Promise(resolve=>pending.push(resolve));
 const ed=editorFixture(),first=ed.detectFrameRate({});ed.epoch++;const second=ed.detectFrameRate({});pending[0]({status:'detected',fps:60,frameTimes:[0,1/60]});await first;assert.equal(ed.autoFpsPending,true);pending[1]({status:'detected',fps:24,frameTimes:[0,1/24]});await second;assert.equal(ed.timelineFps,24);
 const manual=ed.detectFrameRate({});ed.rateGeneration++;ed.timelineFps=25;ed.fpsInfo={status:'manual'};ed.rateBlocked=false;ed.autoFpsPending=false;pending[2]({status:'detected',fps:60});await manual;assert.equal(ed.timelineFps,25,'late detection never overrides a manual edit');
 const failure=ed.detectFrameRate({});pending[3]({status:'unknown',reason:'no metadata'});await failure;assert.equal(ed.rateBlocked,true);assert.equal(ed.fpsInfo.status,'unknown');
 V.detect=original;
 ed.sourceFrameTimes=[0,.04,.08,.18];ed.duration=.3;assert.equal(ed.snapTime(.16),.18);assert.equal(ed.stepTime(.08,1),.18);assert.equal(ed.stepTime(.18,-1),.08);
 const sample=path.resolve(__dirname,'./fixtures/geometric-motion.mp4');
 const real=await V.detect(new Blob([fs.readFileSync(sample)]));assert.equal(real.status,'detected');assert.equal(real.fps,30);assert.equal(real.sampleCount,192);
 console.log(JSON.stringify({passed:true,checks:['fractional_cfr_full_precision','video_track_not_audio','mdhd_v1','vfr_presentation_timestamps','composition_offsets_and_edit','malformed_or_ambiguous_fallback','source_change_and_manual_race','unknown_blocks_unverified_snap','vfr_adjacent_frame_step','real_embedded_mp4_30fps_192frames']}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
