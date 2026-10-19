const assert=require('node:assert/strict');require('../frontend/workspace-store.js');
(async()=>{
 let saved=null,revision=0,value='initial',restored=null;
 const client={request:async(path,body)=>({json:async()=>{if(path==='/workspace-cache'){if(!body)return {revision,snapshot:saved};assert.equal(body.revision,revision);saved=body.snapshot;return {revision:++revision};}if(path==='/workspaces/save')return {name:body.name};if(path==='/workspaces/open')return {snapshot:{value:'named'}};}})};
 const store=new globalThis.WorkbenchWorkspace.Store(client,async()=>({value}),async x=>{restored=x;value=x.value;},()=>{});
 store.changed();assert.equal(store.dirty,false);
 await store.init();store.changed();await store.flush();assert.equal(saved.value,'initial');
 value='edited';store.changed();await store.flush();assert.equal(revision,2);
 store.changed();await store.flush();assert.equal(revision,2,'unchanged snapshot is not rewritten');
 await store.saveNamed('A');await store.openNamed('chosen');assert.equal(restored.value,'named');assert.equal(saved.value,'named');
 const second=new globalThis.WorkbenchWorkspace.Store(client,async()=>({value}),async x=>{restored=x;},()=>{});await second.init();assert.equal(restored.value,'named');
 console.log('Workspace autosave and named-open tests passed');
})().catch(e=>{console.error(e);process.exitCode=1});
