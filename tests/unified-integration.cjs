const assert=require('node:assert/strict');
global.FrameSelection=require('../frontend/frame-selection.js');
const {Editor}=require('../frontend/motion-input.js');

function fixture(){
  const editor=Object.create(Editor.prototype);
  Object.assign(editor,{
    kind:'video',duration:10,epoch:1,selected:'c',selectionIds:['b','c'],pending:0,
    frames:['a','b','c'].map((id,i)=>({id,kind:'video',time:i+1,url:'blob:'+id,redraw:false,prompt:'prompt '+id})),
    video:{pause(){},videoWidth:100,videoHeight:200},released:[],changes:[],actions:[],
    release(url){this.released.push(url);},renderTime(){},updateInspector(){},
    renderFrames(){this.sortVideoFrames();this.reconcileSelection();this.updateInspector();},
    changed(){this.changes.push(this.frames.map(f=>({id:f.id,time:f.time,redraw:f.redraw})));},
    action(id,payload){this.actions.push({id,payload});},stopSequence(){this.playTimer=null;},
    seek:async()=>{},raster:async()=>({url:'blob:recapture',width:100,height:200}),
    enqueue(fn){this.job=Promise.resolve().then(()=>fn(this.epoch));return this.job;}
  });
  return editor;
}

async function main(){
  const ed=fixture();
  ed.markSelected(true);
  assert.deepEqual(ed.frames.filter(f=>f.redraw).map(f=>f.id),['b','c']);
  ed.select('a');
  assert.deepEqual(ed.selectionIds,['a']);
  assert.deepEqual(ed.frames.filter(f=>f.redraw).map(f=>f.id),['b','c'],
    'changing the current selection must not change the redraw plan');
  await ed.job;
  ed.select('c');await ed.job;
  ed.retime('c',.5);await ed.job;
  assert.deepEqual(ed.frames.map(f=>f.id),['c','a','b']);
  assert.equal(ed.selected,'c');assert.deepEqual(ed.selectionIds,['c']);
  assert.equal(ed.frames[0].redraw,true);assert.equal(ed.frames[0].prompt,'prompt c');
  assert.deepEqual(ed.released,['blob:c']);

  const pending=fixture();
  let resolveRaster,started;
  const rasterStarted=new Promise(resolve=>started=resolve);
  pending.raster=()=>{started();return new Promise(resolve=>resolveRaster=resolve);};
  pending.retime('c',.5);await rasterStarted;
  pending.removeSelected();
  resolveRaster({url:'blob:late',width:100,height:200});await pending.job;
  assert.deepEqual(pending.frames.map(f=>f.id),['a'],
    'completed async recapture must not resurrect a deleted selected frame');
  assert.equal(pending.selected,'a');assert.deepEqual(pending.selectionIds,['a']);
  assert.ok(pending.released.includes('blob:late'),'discarded async raster must be revoked');

  const noSelection=fixture();
  noSelection.selected=null;noSelection.selectionIds=[];
  noSelection.renderFrames();noSelection.markSelected(true);
  assert.equal(noSelection.selected,null);assert.deepEqual(noSelection.selectionIds,[]);
  assert.ok(noSelection.frames.every(f=>!f.redraw),'empty selection must never mark a fallback frame');

  console.log(JSON.stringify({passed:3,checks:[
    'select_mark_retime_keep_frame_identity_and_prompt',
    'delete_during_async_retime_never_restores_deleted_frame',
    'empty_selection_remains_empty_through_editor_render'
  ]}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
