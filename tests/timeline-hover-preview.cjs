const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');const {Editor}=require('../frontend/motion-input.js');
const previous=global.document;
function element(){return {style:{},dataset:{},children:[],classes:new Set(),hidden:false,classList:{toggle(key,on){const set=this.owner.classes;if(on)set.add(key);else set.delete(key)}},append(...children){this.children.push(...children)},setAttribute(k,v){this[k]=v},remove(){this.removed=true}}}
function node(){const e=element();e.classList.owner=e;return e}
const body=node();global.document={body,createElement:node};
try{
 const frames=[{id:'a',kind:'image',url:'A.png',contentFingerprint:'same',time:0},{id:'b',kind:'image',url:'B.png',contentFingerprint:'other',time:.1},{id:'a2',kind:'image',url:'A2.png',contentFingerprint:'same',time:.2}];
 const list=node(),points=node();for(const f of frames){const card=node(),marker=node();card.dataset.frameId=f.id;marker.dataset.marker=f.id;for(const n of [card,marker])if(f.id!=='a2')n.classes.add('selected');list.append(card);points.append(marker)}
 const ed=Object.create(Editor.prototype);Object.assign(ed,{frames,selected:'a',selectionIds:['a','b'],q:name=>name==='frames'?list:points});const original=JSON.stringify({frames,selection:ed.selectionIds,primary:ed.selected});
 const anchor={getBoundingClientRect:()=>({left:500,top:400,width:24,bottom:424})};ed.highlightSameFrames('a2',anchor);
 assert.equal(body.children.length,1);const tip=body.children[0];assert.equal(tip.role,'tooltip');assert.equal(tip.children[0].src,'A2.png');assert.match(tip.children[1].textContent,/第 3 帧/);assert.match(tip.children[1].textContent,/0:00.200/);assert.ok(!tip.hidden);assert.ok(points.classes.has('hover-group-active'));assert.deepEqual(points.children.filter(n=>n.classes.has('same-content-hover')).map(n=>n.dataset.marker),['a','a2']);assert.ok(points.children[1].classes.has('selected'),'unrelated selection class must not be removed');
 assert.equal(JSON.stringify({frames,selection:ed.selectionIds,primary:ed.selected}),original);
 ed.highlightSameFrames('b',anchor);assert.equal(body.children.length,1,'reuse tooltip');assert.equal(tip.children[0].src,'B.png');assert.deepEqual(points.children.filter(n=>n.classes.has('same-content-hover')).map(n=>n.dataset.marker),['b']);
 ed.highlightSameFrames(null);assert.ok(tip.hidden);assert.ok(!list.classes.has('hover-group-active'));assert.ok(!points.classes.has('hover-group-active'));assert.deepEqual(ed.selectionIds,['a','b']);assert.ok(points.children.every(n=>!n.classes.has('same-content-hover')));
 const css=fs.readFileSync(path.join(__dirname,'../frontend/controls.css'),'utf8');assert.match(css,/\.hover-group-active \.mi-marker:not\(\.same-content-hover\)\{[^}]*background:/);assert.match(css,/\.hover-group-active \.mi-frame:not\(\.same-content-hover\)/);assert.match(css,/\.mi-frame-hover-preview img\{[^}]*object-fit:contain/);
}finally{global.document=previous}
console.log(JSON.stringify({passed:true,coverage:['timeline_marker_thumbnail_tooltip','index_and_time','exclusive_group_visual_mode_without_selection_mutation','group_switch','leave_restores_selection_visuals','uncropped_thumbnail','single_reused_popup']}));
