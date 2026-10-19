const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
global.MotionTimeline=require('../frontend/timeline.js');const {Editor}=require('../frontend/motion-input.js');
const oldDocument=global.document;
function node(){return {style:{},dataset:{},children:[],setAttribute(k,v){this[k]=v},append(...items){this.children.push(...items)},replaceChildren(){this.children=[]}}}
global.document={activeElement:null,createElement:node};
try{
 for(const kind of ['video','sequence','sheet']){
  const points=node(),ticks=node(),fields={points,ticks,'visible-time':{},'time-pan':{},'sequence-fps':{value:12}};
  const editor=Object.create(Editor.prototype);Object.assign(editor,{kind,duration:.25,timelineFps:12,frames:[0,1,2].map((n)=>({id:'f'+n,kind:kind==='sequence'?'image':kind,time:n/12,url:'image'+n,duplicateOf:n===2?'f0':null})),selectionIds:['f0','f1'],q:k=>fields[k],renderPlayhead(){},renderBatchRange(){},highlightSameFrames(){}});
  editor.renderMarkers();assert.equal(points.children.length,3);assert.ok(points.children.every(x=>x.className.startsWith('mi-marker')),'all sources use original video marker class');assert.deepEqual(points.children.map(x=>x.children[0].textContent),kind==='video'?['1','2','3']:['1','2','1']);assert.ok(points.children.every(x=>x.children.length===1),'no new thumbnail blocks inside marker track');assert.ok(points.children.every(x=>x.children[0].style.cssText==='display:block;transform:rotate(-45deg)'),'original diamond numbering geometry');assert.ok(points.children[0].className.includes('selected'));assert.ok(!points.children[2].className.includes('selected'));assert.ok(ticks.children.length>0);
 }
 const css=fs.readFileSync(path.join(__dirname,'../frontend/controls.css'),'utf8'),js=fs.readFileSync(path.join(__dirname,'../frontend/motion-input.js'),'utf8');assert.ok(!css.includes('mi-frame-marker'));assert.ok(!js.includes('mi-frame-marker'));assert.ok(!css.includes('.frame-source-timeline .mi-markers{height:112px}'));
}finally{global.document=oldDocument}
console.log(JSON.stringify({passed:true,coverage:['original_video_diamond_renderer_all_three_sources','no_second_thumbnail_track','original_marker_geometry','shared_ticks_and_selection','no_static_track_height_override']}));
