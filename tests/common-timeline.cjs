const assert=require('node:assert/strict');
global.MotionTimeline=require('../frontend/timeline.js');global.FrameSelection=require('../frontend/frame-selection.js');
const T=MotionTimeline,{Editor,sourceAdapters,uniqueSequenceSelection,matchingSequenceIds}=require('../frontend/motion-input.js');
for(const fps of [12,30,60]){const m=T.frameModel({duration:3/fps,fps,count:3});assert.equal(m.count,3);assert.equal(m.interval(2).end,3/fps);assert.equal(m.step(0,1),1/fps);assert.equal(m.step(2/fps,1),2/fps);assert.equal(m.snap(999),2/fps);assert.equal(m.indexAt(.51/fps),1);}
const vfr=T.frameModel({duration:.3,fps:30,times:[0,.04,.08,.18]});assert.deepEqual(vfr.interval(2),{index:2,start:.08,end:.18,duration:.09999999999999999});assert.equal(vfr.step(.08,1),.18);assert.equal(vfr.indexAt(.16),3);assert.equal(vfr.interval(3).end,.3);
assert.equal(sourceAdapters.sheet,sourceAdapters.sequence,'both static inputs share the same source adapter');
function fixture(kind){
 const fields={'sequence-fps':{value:12},'image-preview':{},'preview-title':{},points:{children:[]},frames:{children:[]},ticks:{clientHeight:27}},listeners={};
 const rail={clientWidth:1000,addEventListener:(n,f)=>listeners[n]=f,getBoundingClientRect:()=>({left:0,top:0,width:1000}),setPointerCapture(){},hasPointerCapture:()=>true,releasePointerCapture(){},focus(){}};fields.markers=rail;
 const ed=Object.create(Editor.prototype);Object.assign(ed,{kind,frames:[{id:'a',kind:kind==='sheet'?'sheet':'image',url:'A',contentFingerprint:'A'},{id:'b',kind:kind==='sheet'?'sheet':'image',url:'B',contentFingerprint:'B'},{id:'a2',kind:kind==='sheet'?'sheet':'image',url:'A',contentFingerprint:'A'}],q:k=>fields[k]||{},host:{querySelector:()=>({})},cursor:0,selected:'a',selectionIds:['a','b'],epoch:1,video:{pause(){}},updateInspector(){},renderTime(){},renderFrames(){},renderMarkers(){},renderBatchRange(){},changed(){},action(){}});ed.syncFrameTimeline();ed.bindMarkers();return {ed,fields,listeners,event:(x,target={closest:()=>null})=>({clientX:x,clientY:50,button:0,pointerId:1,preventDefault(){},target})};
}
for(const kind of ['sequence','sheet']){
 const {ed,fields,listeners,event}=fixture(kind);assert.equal(ed.duration,.25);assert.deepEqual(ed.frames.map(f=>f.time),[0,1/12,2/12]);assert.deepEqual(uniqueSequenceSelection(ed.frames),['a','b']);assert.deepEqual(matchingSequenceIds(ed.frames,'a2'),['a','a2']);
 const ids=ed.frames.map(f=>f.id);ed.setCursor(2/12);assert.equal(fields['image-preview'].src,'A');assert.equal(ed.framePreviewId,'a2');assert.equal(ed.selected,'a');assert.deepEqual(ed.selectionIds,['a','b']);ed.stepPreview(-1);assert.equal(ed.framePreviewId,'b');
 const marker={dataset:{marker:'a2'}};listeners.pointerdown(event(700,{closest:s=>s==='[data-marker]'?marker:null}));assert.equal(ed.drag.mode,'selection');assert.deepEqual(ed.selectionIds,['a','b','a2']);listeners.pointermove(event(900));listeners.pointerup(event(900));assert.deepEqual(ed.frames.map(f=>f.id),ids);assert.deepEqual(ed.frames.map(f=>f.time),[0,1/12,2/12],'timeline click/drag never retimes or removes original static frames');
 ed.setBatchRange(0,1/12);ed.selectBatchRange([],false);assert.deepEqual(ed.selectionIds,['a']);ed.setBatchRange(1/12,.25);ed.selectBatchRange([],false);assert.deepEqual(ed.selectionIds,['b','a2']);
 const previousSpan=ed.getView().span;listeners.wheel({...event(500),deltaY:-300});assert.ok(ed.getView().span<previousSpan);const zoom=ed.getView().span;listeners.pointerdown({...event(600),altKey:true});listeners.pointermove(event(400));listeners.pointerup(event(400));assert.equal(ed.getView().span,zoom);
 let captures=0;ed.capture=()=>captures++;listeners.dblclick(event(500));assert.equal(captures,0,'static source double-click seeks without adding frames');
 fields['sequence-fps'].value=24;ed.syncFrameTimeline();assert.equal(ed.duration,.125);assert.deepEqual(ed.frames.map(f=>f.time),[0,1/24,2/24]);assert.deepEqual(ed.frames.map(f=>f.id),ids);
}
// The empty import/reset phase must not leave a zero-length range on new content.
for(const kind of ['sequence','sheet']){
 const {ed}=fixture(kind),frames=ed.frames;ed.frames=[];ed.syncFrameTimeline();assert.equal(ed.duration,0);ed.frames=frames;ed.syncFrameTimeline();assert.deepEqual(ed.batchRange,{start:0,end:.25});ed.duration=0;ed.batchRange={start:1/12,end:2/12};ed.syncFrameTimeline();assert.deepEqual(ed.batchRange,{start:1/12,end:2/12},"saved valid range survives restore into an empty editor");
}
// Either visible FPS field routes through the same setter, with live input support.
for(const kind of ['sequence','sheet']){
 const {ed,fields}=fixture(kind);fields['timeline-fps']={value:12};ed.frames=Array.from({length:75},(_,i)=>({id:'f'+i,kind:kind==='sheet'?'sheet':'image',url:'f'+i}));ed.syncFrameTimeline();ed.setFrameRate(10);assert.equal(ed.duration,7.5);assert.equal(+fields['sequence-fps'].value,10);assert.equal(+fields['timeline-fps'].value,10);ed.setFrameRate(15);assert.equal(ed.duration,5);assert.equal(+fields['sequence-fps'].value,15);
}
// Playback traverses every original static frame, including duplicate images,
// without changing generation selection or rebuilding the whole app per tick.
for(const kind of ['sequence','sheet']){
 const {ed,fields}=fixture(kind);let callback,previewRenders=0,clock=0;const oldPerformance=global.performance;global.performance={now:()=>clock};const oldSet=global.setInterval,oldClear=global.clearInterval;
 ed.options={onSourcePreview(){previewRenders++}};global.setInterval=fn=>{callback=fn;return 1};global.clearInterval=()=>{};
 try{ed.playSequence();clock=1000/12;callback();assert.equal(ed.framePreviewId,'b');clock=2000/12;callback();assert.equal(ed.framePreviewId,'a2');assert.equal(ed.cursor,2/12);clock=250;callback();assert.equal(ed.framePreviewId,'a');assert.deepEqual(ed.selectionIds,['a','b']);assert.equal(previewRenders,0);ed.stopSequence();}finally{global.performance=oldPerformance;global.setInterval=oldSet;global.clearInterval=oldClear;}
}
const app=require('node:fs').readFileSync(require('node:path').join(__dirname,'../frontend/unified-app.js'),'utf8');assert.match(app,/editor.render\(\);editor.setCursor\(Number\(state.cursor\)\|\|0\)/,'all source adapters restore the saved playhead');
const layout=require('node:fs').readFileSync(require('node:path').join(__dirname,'../frontend/editor-layout.js'),'utf8');assert.match(layout,/const viewed=editor.isFrameSource\?\.\(\)\?editor.frames.find\(f=>f.id===editor.framePreviewId\)\|\|frame:frame/,'inspector label follows independent preview frame');
console.log(JSON.stringify({passed:true,coverage:['empty_to_loaded_range_initialization','all_source_playhead_restore','all_static_frames_played_without_selection_change','shared_CFR_VFR_frame_model','explicit_frame_intervals','same_sequence_sheet_adapter','three_source_time_mapping','seek_focus_selection_separation','shared_marker_selection','static_frames_never_retimed','range_start_inclusive_end_exclusive','shared_zoom_pan','no_static_capture','fps_updates_duration_without_dropping_frames']}));
