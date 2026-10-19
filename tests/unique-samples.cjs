const assert=require('node:assert/strict');
global.MotionTimeline=require('../frontend/timeline.js');global.VideoFrameRate=require('../frontend/video-frame-rate.js');
const {Editor,SerialQueue}=require('../frontend/motion-input.js');
function fixture(){
 const ed=Object.create(Editor.prototype),fields={'batch-mode':{value:'step'},'batch-value':{value:.001},'video-status':{}};
 Object.assign(ed,{kind:'video',epoch:1,duration:2,timelineFps:30,cursor:1,frames:[],selectionIds:[],selected:null,pending:0,queue:new SerialQueue(),serial:0,rasterCount:0,messages:[],released:[],video:{readyState:2,pause(){},videoWidth:100,videoHeight:100},q:n=>fields[n],updateControls(){},renderTime(){},renderFrames(){this.sortVideoFrames();},changed(){},action(){},setCursor(t){this.cursor=t;},select(id){this.selected=id;this.selectionIds=[id];},message(t){this.messages.push(t);},release(url){this.released.push(url);},seek:async()=>{},raster:async function(){return {url:'blob:'+ ++this.rasterCount,width:100,height:100};}});return ed;
}
async function main(){
 const e=fixture();let release,started;const began=new Promise(r=>started=r);
 e.raster=()=>{e.rasterCount++;started();return new Promise(r=>release=()=>r({url:'blob:one',width:100,height:100}));};
 const one=e.capture(1);await began;const two=e.capture(1.00001),three=e.capture(1);release();await Promise.all([one,two,three]);assert.equal(e.frames.length,1);assert.equal(e.rasterCount,1);assert.equal(e.selected,e.frames[0].id);
 const batch=fixture();batch.batchRange={start:0,end:.1};await batch.batchAdd();assert.equal(batch.frames.length,3);const ids=batch.frames.map(f=>f.id);await batch.batchAdd();assert.deepEqual(batch.frames.map(f=>f.id),ids,'repeated batch adds no duplicates');
 const v=fixture();v.sourceFrameTimes=[0,.04,.1,.24];await v.capture(.041);await v.capture(.045);assert.equal(v.frames.length,1);await v.capture(.1);assert.equal(v.frames.length,2,'different source frames remain distinct');
 const before=v.frames.map(f=>f.time);v.retime(v.frames[1].id,.04);assert.deepEqual(v.frames.map(f=>f.time),before,'retiming into occupied frame is rejected');
 const race=fixture();let finishRaster;const rasterStarted=new Promise(r=>started=r);race.raster=()=>{started();return new Promise(r=>finishRaster=r);};
 const pending=race.capture(.5);await rasterStarted;race.frames.push({id:'moved-in',kind:'video',time:.5,url:'blob:keep',redraw:true,prompt:'keep'});finishRaster({url:'blob:discard',width:1,height:1});await pending;
 assert.equal(race.frames.length,1);assert.ok(race.released.includes('blob:discard'));assert.equal(race.frames[0].prompt,'keep');
 console.log(JSON.stringify({passed:true,checks:['rapid_capture_same_frame_only_once','batch_quantization_and_repeat_skip_existing','vfr_identity_not_decimal_string','retime_rejects_overlap','post_decode_collision_recheck']}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
