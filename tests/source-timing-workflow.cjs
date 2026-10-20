const assert=require('node:assert/strict'),fs=require('node:fs');
global.MotionTimeline=require('../frontend/timeline.js');
const M=require('../frontend/motion-input.js'),S=require('../frontend/source-manifest.js');
const raw={width:2,height:3,columns:3,rows:1,atlas:'atlas.png',frames:[33,66,99].map((duration_ms,index)=>({index,file:`f${index}.png`,duration_ms,frame:{x:index*2,y:0,w:2,h:3}}))};
const json=value=>({name:'manifest.json',size:100,text:async()=>JSON.stringify(value)});
function editor(){const e=Object.create(M.Editor.prototype),settings={cols:3,rows:1,count:3,'offset-x':0,'offset-y':0,'cell-w':2,'cell-h':3,'gap-x':0,'gap-y':0,'sequence-fps':12};const fields=Object.fromEntries(Object.entries(settings).map(([k,value])=>[k,{value}]));Object.assign(e,{kind:'sheet',frames:[],sources:[],epoch:0,urls:new Set(),q:k=>fields[k]||{},host:{querySelector:()=>({})},render(){},changed(){},action(){},previewGrid(){},message(s){this.error=s;},registerSource(){return 's';},own:()=>'',release(){},newId(){return 'f'+this.frames.length;},raster:async()=>({url:'thumb'}),reset(){this.resets=(this.resets||0)+1;this.epoch++;this.frames=[];this.urls.clear();}});return e;}
(async()=>{
 const e=editor();e.frames=['A','B','A'].map((contentFingerprint,i)=>({id:'f'+i,kind:'sheet',contentFingerprint,sourceDurationMs:raw.frames[i].duration_ms}));
 let timing=M.sourceAdapters.sheet.timing(e);assert.deepEqual(timing.times,[0,.033,.099]);assert.equal(timing.duration,.198);assert.equal(M.frameIdentityMap(e.frames).get('f2').duplicate,true);assert.equal(e.frames.length,3);
 const previousPerformance=global.performance,previousSet=global.setInterval,previousClear=global.clearInterval;let elapsed=0,tick;global.performance={now:()=>elapsed};global.setInterval=fn=>(tick=fn,1);global.clearInterval=()=>{};
 try{e.syncFrameTimeline();e.previewFramesAt=time=>{e.framePreviewId=e.frames[e.timelineModel().indexAt(time)].id;};e.playSequence();elapsed=32;tick();assert.equal(e.framePreviewId,'f0');elapsed=33;tick();assert.equal(e.framePreviewId,'f1');elapsed=98;tick();assert.equal(e.framePreviewId,'f1');elapsed=99;tick();assert.equal(e.framePreviewId,'f2');elapsed=198;tick();assert.equal(e.framePreviewId,'f0');e.stopSequence();}finally{global.performance=previousPerformance;global.setInterval=previousSet;global.clearInterval=previousClear;}
 const clean=M.cleanMetadata(JSON.parse(JSON.stringify(e.metadata())));assert.deepEqual(clean.frames.map(f=>f.sourceDurationMs),[33,66,99]);
 e.frames=clean.frames;assert.equal(M.sourceAdapters.sheet.timing(e).duration,.198);
 e.frames=Array.from({length:60},(_,i)=>({id:'f'+i,sourceDurationMs:33}));assert.equal(M.sourceAdapters.sheet.timing(e).duration,1.98);assert.equal(e.frames.length,60);
 e.frames.forEach(f=>delete f.sourceDurationMs);assert.equal(M.sourceAdapters.sheet.timing(e).duration,5,'bare PNG fallback is not source timing');
 const trim=structuredClone(raw);trim.frames[0].trimmed=true;await assert.rejects(()=>e.prepareImageFiles([{name:'atlas.png'},json(trim)]),/裁边/);
 const oldURL=global.URL,oldImage=global.Image;global.URL={createObjectURL:()=> 'blob:atlas',revokeObjectURL(){}};global.Image=class{naturalWidth=6;naturalHeight=3;set src(v){queueMicrotask(()=>this.onload())}};
 try{
  e.frames=[{id:'keep'}];await e.importSheet([{name:'wrong.png'},json(raw)]);assert.equal(e.resets,undefined);assert.equal(e.frames[0].id,'keep');assert.match(e.error,/不匹配/);
  const irregular=structuredClone(raw);irregular.frames[1].frame.x=1;await e.importSheet([{name:'atlas.png'},json(irregular)]);assert.equal(e.resets,undefined);assert.match(e.error,/不规则/);
  global.Image=class{naturalWidth=1;naturalHeight=1;set src(v){queueMicrotask(()=>this.onload())}};await e.importSheet([{name:'atlas.png'},json(raw)]);assert.equal(e.resets,undefined);assert.match(e.error,/超出/);
  global.Image=oldImage;global.Image=class{naturalWidth=6;naturalHeight=3;set src(v){queueMicrotask(()=>this.onload())}};
  await e.importSheet([{name:'atlas.png'},json(raw)]);assert.equal(e.resets,1);assert.equal(e.frames.length,0);
  const saved=M.cleanMetadata(JSON.parse(JSON.stringify(e.metadata())));assert.ok(saved.sourceManifest,'unsplit atlas keeps source metadata');
  const restored=editor();restored.sourceManifest=saved.sourceManifest;restored.sheetManifest=S.parse(saved.sourceManifest);restored.sheet={naturalWidth:6,naturalHeight:3};restored.restoreSheetSettings(saved.sheetSettings);
  await restored.splitSheet();assert.deepEqual(restored.frames.map(f=>f.sourceDurationMs),[33,66,99]);assert.equal(M.sourceAdapters.sheet.timing(restored).duration,.198);
  restored.sheetManifest=null;await restored.splitSheet();assert.deepEqual(restored.frames.map(f=>f.sourceDurationMs),[33,66,99],'legacy split-frame restore retains timing when re-sliced');
 }finally{global.URL=oldURL;global.Image=oldImage;}
 const source=fs.readFileSync('frontend/motion-input.js','utf8'),css=fs.readFileSync('frontend/controls.css','utf8');
 assert.match(source,/data-mi="sequence-fps"[^>]* hidden/);assert.match(source,/data-mi="sheet-preview"[^>]* hidden/);assert.match(css,/\.frame-source-timeline \.timeline-fps/);
 console.log('source timing workflow: VFR, 60×33ms, A/B/A, fallback, refresh-before-split, re-split, invalid import preservation and UI passed');
})().catch(e=>{console.error(e);process.exitCode=1});
