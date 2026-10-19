const assert=require('node:assert/strict');
const {Editor,thumbnailSize,cleanMetadata}=require('../frontend/motion-input.js');
async function main(){
 assert.deepEqual(thumbnailSize(960,540),{width:256,height:144});
 assert.deepEqual(thumbnailSize(1080,1920),{width:144,height:256});
 assert.deepEqual(thumbnailSize(32,16),{width:32,height:16});
 const draws=[],encodes=[];let peak=0;
 global.document={createElement(type){assert.equal(type,'canvas');const canvas={width:0,height:0,getContext(){peak=Math.max(peak,this.width*this.height);return {drawImage(...args){draws.push(args);}};},toBlob(callback,mime){encodes.push({width:this.width,height:this.height,mime});callback({size:123});}};return canvas;}};
 const ed=Object.create(Editor.prototype);Object.assign(ed,{epoch:1,sourceSerial:0,sources:[],sourceFiles:new Map(),own:()=> 'blob:thumbnail',kind:'video',duration:5,timelineFps:30,q:()=>({value:12}),frameIndex:t=>Math.round(t*30)});
 const file={name:'clip.mp4',size:9000,type:'video/mp4',lastModified:100};ed.activeSourceId=ed.registerSource(file,'video');
 const source={},image=await ed.raster(source,960,540);assert.deepEqual(encodes[0],{width:256,height:144,mime:'image/png'});assert.equal(peak,256*144);assert.equal(image.width,960);assert.equal(image.thumbnailWidth,256);
 const crop={x:200,y:100,width:800,height:400};await ed.raster(source,800,400,crop);assert.deepEqual(draws[1],[source,200,100,800,400,0,0,256,128]);
 const frame={...image,id:'f1',kind:'video',name:'frame',time:.5,locator:ed.videoLocator(.5),redraw:true,prompt:'draw'};ed.frames=[frame];
 const metadata=ed.metadata(),restored=cleanMetadata(metadata),request=ed.frameRequest(frame,'draw');
 assert.equal(restored.sources[0].name,'clip.mp4');assert.equal(restored.frames[0].locator.sourceId,ed.activeSourceId);assert.equal(restored.frames[0].thumbnailWidth,256);
 assert.equal(request.locator.timeSeconds,.5);assert.equal(request.locator.frameIndexHint,15);assert.equal(request.extractOriginalOnBackend,true);assert.deepEqual(request.originalSize,{width:960,height:540});assert.equal(request.prompt,'draw');assert.ok(!JSON.stringify(request).includes('blob:'));assert.ok(!JSON.stringify(metadata).includes('blob:'));
 assert.equal(ed.sourceFiles.get(ed.activeSourceId),file);assert.equal(metadata.sources[0].assetId,null);assert.equal(metadata.sources[0].needsRegistration,true);
 console.log(JSON.stringify({passed:true,checks:['bounded_thumbnail_canvas','original_dimensions_preserved','sheet_crop_keeps_source_coordinates','frame_locator_and_source_roundtrip','generation_request_excludes_thumbnail_pixels','backend_registration_not_faked']}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
