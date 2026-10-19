const assert=require('node:assert/strict');
const Selection=require('../frontend/frame-selection.js');
const frames=['a','b','c','d'].map((id,index)=>({id,time:index,redraw:false,url:'blob:'+id}));
const snapshot=JSON.stringify(frames);

// Sorting changes display positions while the same frame stays primary.
const sorted=[frames[2],frames[0],frames[1],frames[3]];
assert.deepEqual(Selection.reconcile(sorted,'c',['a','c','missing','c']),{
  primaryId:'c',selectedIds:['c','a']
});
assert.deepEqual(Selection.reconcile(frames,'b',[]),{primaryId:'b',selectedIds:['b']});

// Removing the primary frame picks the first remaining frame and prunes dead IDs.
assert.deepEqual(Selection.reconcile(frames.slice(1),'a',['a','c']),{
  primaryId:'b',selectedIds:['b','c']
});
assert.deepEqual(Selection.reconcile([],'a',['a']),{primaryId:null,selectedIds:[]});

// A deliberate empty selection must survive repeated render/reconcile passes.
const empty=Selection.choose(frames,'a',['a'],'a',{toggle:true});
assert.deepEqual(empty,{primaryId:null,selectedIds:[]});
assert.deepEqual(Selection.reconcile(frames,empty.primaryId,empty.selectedIds),empty);
assert.deepEqual(Selection.choose(frames,null,[],'c'),{primaryId:'c',selectedIds:['c']});

// Ctrl toggles exact identities; removing an active member retains the others.
assert.deepEqual(Selection.choose(frames,'a',['a'],'c',{toggle:true}),{
  primaryId:'c',selectedIds:['a','c']
});
assert.deepEqual(Selection.choose(frames,'c',['a','c'],'c',{toggle:true}),{
  primaryId:'a',selectedIds:['a']
});
assert.deepEqual(Selection.choose(frames,'c',['a','c'],'a',{toggle:true}),{
  primaryId:'c',selectedIds:['c']
});
assert.deepEqual(Selection.choose(frames,'c',['a','c'],'b'),{
  primaryId:'b',selectedIds:['b']
});

// Shift ranges use the currently visible chronological order, in both directions.
assert.deepEqual(Selection.choose(sorted,'c',['c'],'b',{range:true}),{
  primaryId:'b',selectedIds:['c','a','b']
});
assert.deepEqual(Selection.choose(sorted,'b',['b'],'c',{range:true}),{
  primaryId:'c',selectedIds:['c','a','b']
});
assert.deepEqual(Selection.choose(frames,null,[],'c',{range:true}),{
  primaryId:'c',selectedIds:['c']
});
assert.deepEqual(Selection.choose(frames,'b',['b'],'unknown'),{
  primaryId:'b',selectedIds:['b']
});
assert.equal(JSON.stringify(frames),snapshot,'selection never changes frame data or order');

// Redraw marks are a persistent plan, independent of temporary UI selection.
assert.equal(Selection.mark(frames,['c','a','c','unknown'],true),2);
assert.deepEqual(frames.filter(f=>f.redraw).map(f=>f.id),['a','c']);
const selected=Selection.choose(frames,'a',['a'],'d');
assert.deepEqual(selected,{primaryId:'d',selectedIds:['d']});
assert.deepEqual(sorted.filter(f=>f.redraw).map(f=>f.id),['c','a'],'marks follow identity after reorder');
assert.equal(Selection.mark(frames,['a'],false),1);
assert.deepEqual(frames.filter(f=>f.redraw).map(f=>f.id),['c']);
assert.equal(Selection.mark(frames,[],true),0);
assert.deepEqual(frames.map(({redraw,...rest})=>rest),JSON.parse(snapshot).map(({redraw,...rest})=>rest),
  'marking changes only redraw flags, preserving media, timing and order');

console.log(JSON.stringify({passed:true,coverage:[
  'selection_identity_after_reorder','primary_removal_and_pruning','intentional_empty_selection',
  'plain_and_modifier_selection','shift_range_in_display_order','selection_does_not_mutate_frames',
  'redraw_marks_independent_of_selection','marks_preserve_frame_media_and_timing'
]}));
