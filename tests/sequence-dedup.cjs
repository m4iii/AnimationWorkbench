const assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
global.crypto=webcrypto;
const M=require('../frontend/motion-input.js');
global.FrameSelection=require('../frontend/frame-selection.js');
(async()=>{
 const a=new Uint8ClampedArray([255,0,0,255,0,0,0,0]),b=new Uint8ClampedArray(a);b[0]=254;
 const ha=await M.pixelFingerprint(2,1,a),hb=await M.pixelFingerprint(2,1,b);
 assert.equal(ha,await M.pixelFingerprint(2,1,new Uint8ClampedArray(a)));
 assert.notEqual(ha,hb,'a one-channel difference must remain unique');
 assert.notEqual(ha,await M.pixelFingerprint(1,2,a),'dimensions are part of identity');
 const alpha=new Uint8ClampedArray(a);alpha[3]=254;
 assert.notEqual(ha,await M.pixelFingerprint(2,1,alpha),'alpha is compared');
 const frames=[{id:'a',name:'one.png',kind:'image',contentFingerprint:ha,time:0},{id:'b',name:'one.png',kind:'image',contentFingerprint:hb,time:1},{id:'a2',name:'different-name.png',kind:'image',contentFingerprint:ha,time:2},{id:'a3',kind:'image',contentFingerprint:ha,time:3},{id:'unchecked',kind:'image'}];
 assert.deepEqual(M.uniqueSequenceSelection(frames),['a','b','unchecked']);
 assert.deepEqual(frames.map(f=>f.id),['a','b','a2','a3','unchecked']);
 assert.equal(frames[2].duplicateOf,'a');assert.equal(frames[3].duplicateOf,'a');
 assert.deepEqual(frames.slice(0,4).map(f=>f.time),[0,1,2,3]);
 const saved=M.cleanMetadata({kind:'sequence',frames});
 assert.equal(saved.frames.length,5);assert.equal(saved.frames[2].contentFingerprint,ha);assert.equal(saved.frames[2].duplicateOf,'a');
 const override=FrameSelection.choose(frames,'a',['a','b','unchecked'],'a2',{toggle:true});
 assert.deepEqual(override.selectedIds,['a','b','a2','unchecked']);
 assert.deepEqual(FrameSelection.reconcile(saved.frames,override.primaryId,override.selectedIds),override,'workspace selection survives reconciliation');
 assert.deepEqual(M.uniqueSequenceSelection([{id:'v1',kind:'video',contentFingerprint:ha},{id:'v2',kind:'video',contentFingerprint:ha}]),['v1','v2'],'video must not be deduplicated');
 const ed=Object.create(M.Editor.prototype),nodes={'image-preview':{},'preview-title':{},'sequence-fps':{value:12}};
 Object.assign(ed,{frames:frames.slice(0,4).map(f=>({...f,url:f.id})),selected:'a',selectionIds:['a','b'],host:{querySelector:()=>({})},q:k=>nodes[k],renderFrames(){}});
 const realSet=global.setInterval,realClear=global.clearInterval;let tick,delay;
 global.setInterval=(fn,ms)=>{tick=fn;delay=ms;return 1};global.clearInterval=()=>{};
 try{ed.playSequence();assert.equal(delay,1000/12);tick();assert.equal(nodes['image-preview'].src,'b');tick();assert.equal(nodes['image-preview'].src,'a2');tick();assert.equal(nodes['image-preview'].src,'a3');assert.deepEqual(ed.selectionIds,['a','b']);assert.equal(ed.selected,'a');}finally{global.setInterval=realSet;global.clearInterval=realClear;}
 // Exercise the actual asynchronous import pipeline with decoded image pixels.
 const filePixels=new Map([['frame_01.png',a],['frame_02.png',b],['frame_03.png',a]]);
 const oldImage=global.Image,oldDocument=global.document;
 global.Image=class {set src(value){this.naturalWidth=2;this.naturalHeight=1;this.pixels=filePixels.get(value);queueMicrotask(()=>this.onload());}};
 global.document={createElement:()=>({width:0,height:0,getContext(){let source;return {drawImage(im){source=im},getImageData(){return {data:source.pixels}}}}})};
 const imported=Object.create(M.Editor.prototype);let serial=0;
 Object.assign(imported,{pending:0,epoch:0,reset(){this.epoch++;this.frames=[]},own:file=>file.name,release(){},raster:async()=>({url:'thumbnail',width:2,height:1}),registerSource:file=>file.name,newId:()=>String(++serial),render(){},changed(){},action(){},message(text){this.lastMessage=text},updateControls(){}});
 try{await imported.importImages([...filePixels.keys()].reverse().map(name=>({name})));assert.equal(imported.pending,0);assert.deepEqual(imported.frames.map(f=>f.name),['frame_01.png','frame_02.png','frame_03.png']);assert.deepEqual(imported.selectionIds,['1','2']);assert.equal(imported.frames[2].duplicateOf,'1');assert.equal(imported.selected,'1');assert.match(imported.lastMessage,/已保留 3 帧/);
 global.document.createElement=()=>{throw Error('canvas unavailable')};await imported.importImages([{name:'frame_01.png'},{name:'frame_03.png'}]);assert.equal(imported.selectionIds.length,2,'comparison failure never silently removes or deselects frames');assert.match(imported.lastMessage,/未能比较/);
 }finally{global.Image=oldImage;global.document=oldDocument;}
 console.log(JSON.stringify({passed:true,coverage:['real_import_pipeline_and_compare_failure','global_A_B_A_selection','exact_RGBA_and_dimensions','all_frames_and_timing_preserved','manual_override','metadata_and_workspace_selection_roundtrip','video_unchanged','playback_visits_duplicates_without_selection_mutation']}));
})().catch(e=>{console.error(e);process.exit(1)});
