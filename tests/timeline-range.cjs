const assert=require('node:assert/strict');
global.MotionTimeline=require('../frontend/timeline.js');
global.FrameSelection=require('../frontend/frame-selection.js');
const {Editor}=require('../frontend/motion-input.js');
function fixture(){
 const listeners={},fields={};
 const rail={clientWidth:1000,getBoundingClientRect:()=>({left:0,top:0,width:1000,height:92}),addEventListener:(name,fn)=>listeners[name]=fn,focus(){},setPointerCapture(){},hasPointerCapture:()=>true,releasePointerCapture(){}};
 fields.markers=rail;fields.ticks={clientHeight:27};fields.points={children:[]};fields.frames={children:[]};
 fields['batch-range-highlight']={style:{}};fields['batch-range-label']={};fields['batch-mode']={value:'step'};fields['batch-value']={value:.09};fields['video-status']={};
 const ed=Object.create(Editor.prototype);Object.assign(ed,{epoch:1,kind:'video',duration:10,timelineFps:30,cursor:1,selected:'a',selectionIds:['a'],frames:[{id:'a',kind:'video',time:2,redraw:true,prompt:'unchanged'}],video:{readyState:2,pause(){},videoWidth:100,videoHeight:100},q:name=>fields[name],updates:0,requests:[],positions:[],renderFrames(){},renderTime(){},renderMarkers(){},updateInspector(){},updateControls(){},changed(){this.updates++;},action(id,data){this.requests.push({id,data});},setCursor(time){this.cursor=this.snapTime(time);},seek:async function(time){this.positions.push(time);},raster:async()=>({url:'test-image',width:100,height:100}),newId(){return 'new-'+this.frames.length;},enqueue(fn){return Promise.resolve(fn(this.epoch));},message(msg){this.lastMessage=msg;}});
 ed.bindMarkers();const event=(x,extra={})=>({pointerId:1,button:0,clientX:x,clientY:process.env.TIMELINE_TRACK_TEST?65:10,target:{closest:()=>null},preventDefault(){},...extra});
 return {ed,listeners,event,fields};
}
async function main(){
 const f=fixture(),old=JSON.stringify(f.ed.frames);
 f.listeners.pointerdown(f.event(200));f.listeners.pointermove(f.event(500));
 assert.deepEqual(f.ed.batchRange,{start:2,end:5});assert.equal(f.fields['batch-range-highlight'].style.left,'20%');assert.equal(f.fields['batch-range-highlight'].style.width,'30%');assert.equal(f.ed.updates,0);
 f.listeners.pointerup(f.event(500));assert.equal(f.ed.updates,1);assert.deepEqual(f.ed.selectionIds,['a']);assert.equal(JSON.stringify(f.ed.frames),old);
 f.listeners.pointerdown(f.event(800));f.listeners.pointermove(f.event(300));f.listeners.pointerup(f.event(300));assert.deepEqual(f.ed.batchRange,{start:3,end:8});
 f.listeners.pointerdown(f.event(400));f.listeners.pointerup(f.event(402));assert.deepEqual(f.ed.batchRange,{start:3,end:8},'click/jitter does not replace selected range');
 f.listeners.pointerdown(f.event(100));f.listeners.pointermove(f.event(200));f.listeners.keydown({key:'Escape',preventDefault(){}});assert.deepEqual(f.ed.batchRange,{start:3,end:8});
 f.listeners.pointerdown(f.event(1000));f.listeners.pointerup(f.event(0));assert.deepEqual(f.ed.batchRange,{start:0,end:10},'full duration endpoint is representable');
 f.ed.setBatchRange(4,6);f.ed.click('batch-full');assert.deepEqual(f.ed.batchRange,{start:0,end:10});
 const b=fixture();b.ed.setBatchRange(.1,.2);await b.ed.batchAdd();assert.equal(b.ed.positions.length,2);assert.ok(b.ed.positions.every(t=>t>=.1&&t<.2),'batch sampling respects selected range after frame snapping');assert.equal(b.ed.frames[0].prompt,'unchanged');
 const r=fixture();r.ed.frames=[{id:'before',kind:'video',time:1},{id:'start',kind:'video',time:2},{id:'inside',kind:'video',time:4},{id:'end',kind:'video',time:5},{id:'after',kind:'video',time:8}];r.ed.selected='before';r.ed.selectionIds=['before'];
 const nodes=r.ed.frames.map(frame=>({dataset:{marker:frame.id,frameId:frame.id},classes:{},attrs:{},classList:{toggle(name,value){this.owner.classes[name]=value;}},setAttribute(name,value){this.attrs[name]=value;}}));for(const node of nodes)node.classList.owner=node;r.fields.points.children=nodes;r.fields.frames.children=nodes;
 const original=JSON.stringify(r.ed.frames);
 r.listeners.pointerdown(r.event(200));r.listeners.pointermove(r.event(500));assert.deepEqual(r.ed.selectionIds,['before','start','inside'],'live selection includes start and excludes end');assert.equal(nodes[1].classes.selected,true);assert.equal(nodes[3].attrs['aria-selected'],'false');r.listeners.pointerup(r.event(500));
 r.listeners.pointerdown(r.event(800,{ctrlKey:true}));r.listeners.pointerup(r.event(500));assert.deepEqual(r.ed.selectionIds,['before','start','inside','end'],'reverse additive range retains prior selection');
 const prior=[...r.ed.selectionIds],range={...r.ed.batchRange},cursor=r.ed.cursor;
 r.listeners.pointerdown(r.event(600));r.listeners.pointermove(r.event(700));assert.deepEqual(r.ed.selectionIds,prior);assert.equal(r.ed.selected,'before');r.listeners.keydown({key:'Escape',preventDefault(){}});assert.deepEqual(r.ed.selectionIds,prior);assert.deepEqual(r.ed.batchRange,range);assert.equal(r.ed.cursor,cursor);
 r.listeners.pointerdown(r.event(600));r.listeners.pointerup(r.event(602));assert.deepEqual(r.ed.selectionIds,prior,'click does not change selection');
 r.ed.click('batch-full');assert.deepEqual(r.ed.selectionIds,r.ed.frames.map(frame=>frame.id));assert.equal(JSON.stringify(r.ed.frames),original,'selection does not mutate samples');
 const c=Editor.prototype;assert.equal(typeof c.getBatchRange,'function');
 console.log(JSON.stringify({passed:true,checks:['ruler_drag_sets_range_and_selects_samples_without_mutation','reverse_and_final_pointerup_range','click_preserves_range','escape_restores_range','full_duration_and_full_button','batch_sampling_uses_selected_exclusive_range']}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
