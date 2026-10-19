const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Editor,matchingSequenceIds}=require('../frontend/motion-input.js');
const frames=[{id:'a',kind:'image',contentFingerprint:'A'},{id:'b',kind:'image',contentFingerprint:'B'},{id:'a2',kind:'image',contentFingerprint:'A'},{id:'unknown',kind:'image'},{id:'video',kind:'video',contentFingerprint:'A'}];
assert.deepEqual(matchingSequenceIds(frames,'a'),['a','a2']);assert.deepEqual(matchingSequenceIds(frames,'a2'),['a','a2']);assert.deepEqual(matchingSequenceIds(frames,'b'),['b']);assert.deepEqual(matchingSequenceIds(frames,'unknown'),['unknown']);assert.deepEqual(matchingSequenceIds(frames,null),[]);assert.deepEqual(matchingSequenceIds(frames,'video'),['video']);
const cards=frames.map(f=>({dataset:{frameId:f.id},classes:new Set(f.id==='a'||f.id==='b'?['selected']:[]),classList:{toggle(name,on){const set=cards.find(c=>c.classList===this).classes;if(on)set.add(name);else set.delete(name)}}}));
const editor=Object.create(Editor.prototype);Object.assign(editor,{frames,selected:'a',selectionIds:['a','b'],q:()=>({children:cards})});const before=JSON.stringify(frames);
editor.highlightSameFrames('a2');assert.deepEqual(cards.filter(c=>c.classes.has('same-content-hover')).map(c=>c.dataset.frameId),['a','a2']);assert.deepEqual(editor.selectionIds,['a','b']);assert.equal(editor.selected,'a');assert.equal(JSON.stringify(frames),before);
editor.highlightSameFrames('b');assert.deepEqual(cards.filter(c=>c.classes.has('same-content-hover')).map(c=>c.dataset.frameId),['b']);editor.highlightSameFrames(null);assert.ok(cards.every(c=>!c.classes.has('same-content-hover')));assert.deepEqual(cards.filter(c=>c.classes.has('selected')).map(c=>c.dataset.frameId),['a','b']);
const js=fs.readFileSync(path.join(__dirname,'../frontend/motion-input.js'),'utf8'),css=fs.readFileSync(path.join(__dirname,'../frontend/controls.css'),'utf8');
assert.match(js,/card.onpointerenter=\(\)=>this.highlightSameFrames\(f.id\)/);assert.match(js,/card.onpointerleave=\(\)=>this.highlightSameFrames\(null\)/);
assert.match(css,/\.studio-source-stage \.mi-image-stage\{[^}]*position:relative;[^}]*flex:1 1 0;[^}]*min-height:0/);
assert.match(css,/\.studio-source-stage \.mi-image-stage>img\{[^}]*position:absolute;[^}]*width:100%;height:100%;[^}]*object-fit:contain;object-position:center/);
assert.match(css,/\[data-mi=image-section\]>\.mi-time-row\{flex:none\}/);
// CSS containment is deliberately responsive: no hard-coded sprite dimensions,
// frame-by-frame transform resets, or browser zoom writes.
const fitCSS=css.slice(css.indexOf('/* Keep sequence images inside'),css.indexOf('/* Hover is an ephemeral group hint'));
assert.ok(!/transform:|zoom:|80px|110px|113px|180px/.test(fitCSS));
console.log(JSON.stringify({passed:true,coverage:['hover_global_identical_group','hover_exit_and_group_switch','unknown_and_video_not_grouped','selection_focus_metadata_unchanged','event_wiring','contain_viewport_css_contract','no_zoom_reset'],visualLayout:'requires browser verification'}));
