const assert=require('node:assert/strict');require('../frontend/task-panel.js');
const summary=globalThis.WorkbenchTasks.summary;
assert.deepEqual(summary({status:'running',items:[{status:'completed'},{status:'running'},{status:'queued'}]}),{total:3,finished:1,succeeded:1,failed:0,active:true});
assert.deepEqual(summary({status:'partial',items:[{status:'completed'},{status:'failed'},{status:'cancelled'}]}),{total:3,finished:3,succeeded:1,failed:1,active:false});
assert.equal(summary({status:'cancelling',items:[]}).active,true);
assert.equal(summary({status:'cancelled',items:[]}).active,false);
console.log('Task progress states passed');
