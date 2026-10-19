const assert=require('node:assert/strict');const {frameIdentityMap,Editor}=require('../frontend/motion-input.js');
for(const kind of ['image','sheet']){
 const frames=['A','B','A','C','B'].map((key,i)=>({id:'f'+i,kind,contentFingerprint:key,time:i/10,url:key}));
 const original=JSON.stringify(frames),map=frameIdentityMap(frames);assert.deepEqual(frames.map(f=>map.get(f.id).number),[1,2,1,3,2]);assert.deepEqual(frames.map(f=>map.get(f.id).sourceOrdinal),[1,2,3,4,5]);assert.equal(map.get('f2').referenceId,'f0');assert.equal(map.get('f4').referenceId,'f1');assert.equal(JSON.stringify(frames),original);
 const ed=Object.create(Editor.prototype);ed.frames=frames;ed.selectionIds=['f2'];assert.equal(ed.frameLabel(frames[2]),'编号 1 · 原始第 3 帧');ed.selectionIds=['f0','f1','f3'];assert.deepEqual(frames.map(f=>frameIdentityMap(frames).get(f.id).number),[1,2,1,3,2]);
}
const video=['A','B','A'].map((contentFingerprint,i)=>({id:String(i),kind:'video',contentFingerprint}));assert.deepEqual(video.map(f=>frameIdentityMap(video).get(f.id).number),[1,2,3]);
const unknown=[{id:'x',kind:'image'},{id:'y',kind:'image'}];assert.deepEqual(unknown.map(f=>frameIdentityMap(unknown).get(f.id).number),[1,2]);
console.log(JSON.stringify({passed:true,coverage:['A_B_A_C_B_compact_reference_numbers','sequence_and_sheet','original_ordinals_time_order_unchanged','selection_does_not_change_identity','no_video_dedup','unknown_images_keep_unique_numbers']}));
