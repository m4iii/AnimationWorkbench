const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const calls=[];let failUpload=false;
const context={window:{location:{protocol:"http:",hostname:"127.0.0.1",origin:"http://127.0.0.1:8765"}},document:{getElementById:()=>({textContent:JSON.stringify({token:"test-token"})})},Blob,WeakMap,AbortSignal,Number,encodeURIComponent,Error,fetch:async(url,options)=>{
 calls.push({url,options});
 if(url.startsWith('blob:'))return {blob:async()=>new Blob(['reference'])};
 if(failUpload&&url.includes('/assets'))return {ok:false,status:500,json:async()=>({error:'upload failed'})};
 return {ok:true,json:async()=>url.includes('/assets')?{assetId:'test-id'}:{maxConcurrency:2},blob:async()=>new Blob(['result'])};
}};
vm.createContext(context);vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../frontend/backend-client.js'),'utf8'),context);
(async()=>{
 const client=new context.window.WorkbenchBackend.Client();
 await assert.rejects(client.request('/capabilities'),/后端端口/);assert.equal(calls.length,0);
 context.window.location.hostname='192.168.1.2';await assert.rejects(client.connect(),/端口/);context.window.location.hostname='127.0.0.1';
 await client.connect();
 assert.equal(calls[0].options.headers.Authorization,'Bearer test-token');
 const file=new Blob(['original']);await Promise.all([client.upload(file,'原视频.mp4'),client.upload(file,'原视频.mp4')]);
 assert.equal(calls.filter(x=>x.url.includes('/assets')).length,1,'in-flight original upload is shared');
 assert.equal(calls[1].options.body,file,'upload uses original blob');
 assert.ok(calls[1].url.startsWith('http://127.0.0.1:8765/assets?name='));
 const other=new Blob(['other']);failUpload=true;await assert.rejects(client.upload(other),/upload failed/);failUpload=false;await client.upload(other);
 await assert.rejects(client.localBlob('https://example.org/image.png'),/本地素材/);
 context.window.location.origin='http://127.0.0.1:8766';await client.connect();await client.upload(file);assert.equal(calls.at(-1).url.startsWith('http://127.0.0.1:8766'),true);
 console.log(JSON.stringify({passed:true,checks:['explicit_connection','loopback_only','original_blob_upload','dedup_inflight','failed_upload_retry','reconnect_clears_asset_ids']}));
})().catch(e=>{console.error(e);process.exitCode=1;});
