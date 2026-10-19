(function(root){
  'use strict';
  const MAX_ITEMS=200,MAX_DURATION_MS=3600000,CROP_KEYS=['x','y','width','height'];
  const positive=n=>typeof n==='number'&&Number.isFinite(n)&&n>0;
  const fail=message=>{throw Error('Animation metadata: '+message);};
  function object(value,label){if(!value||typeof value!=='object'||Array.isArray(value))fail(label+' must be an object');return value;}
  function id(value,label){if(typeof value!=='string'||! /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$/.test(value))fail(label+' is invalid');return value;}
  function fps(value){if(!positive(value)||value<1||value>60)fail('defaultFps must be between 1 and 60');return value;}
  function duration(value){if(!positive(value)||value>MAX_DURATION_MS)fail('durationMs must be greater than 0 and at most 3600000');return value;}
  function fileName(value){if(typeof value!=='string'||!value.trim()||value.length>300||/[\\/:\x00-\x1f\x7f]/.test(value)||value==='.'||value==='..')fail('fileName must be a local basename');return value;}
  function crop(value){object(value,'crop');const result={};for(const key of CROP_KEYS){const n=value[key];if(typeof n!=='number'||!Number.isFinite(n)||n>1e7||n<(key==='x'||key==='y'?0:Number.MIN_VALUE))fail('crop.'+key+' is invalid');result[key]=n;}return result;}
  function fingerprint(value){return typeof value==='string'&&/^(?:[1-9]\d{0,7}x[1-9]\d{0,7}:)?[a-fA-F0-9]{64}$/.test(value)?value.toLowerCase():null;}
  function list(value,label){if(!Array.isArray(value)||value.length>MAX_ITEMS)fail(label+' must contain at most 200 items');return value;}
  function clean(value){
    object(value,'document');if(value.schema!=='animation-workbench'||value.version!==1)fail('unsupported schema or version');
    const defaultFps=fps(value.defaultFps),assetIds=new Set(),frameIds=new Set();
    const assets=list(value.assets,'assets').map(raw=>{object(raw,'asset');const asset={id:id(raw.id,'asset id'),fileName:fileName(raw.fileName)};if(assetIds.has(asset.id))fail('duplicate asset id');assetIds.add(asset.id);if(raw.crop!==undefined)asset.crop=crop(raw.crop);if(raw.contentFingerprint!==undefined){asset.contentFingerprint=fingerprint(raw.contentFingerprint);if(!asset.contentFingerprint)fail('invalid contentFingerprint');}return asset;});
    const frames=list(value.frames,'frames').map(raw=>{object(raw,'frame');const frame={id:id(raw.id,'frame id'),frameRef:id(raw.frameRef,'frameRef'),durationMs:duration(raw.durationMs===undefined?1000/defaultFps:raw.durationMs)};if(frameIds.has(frame.id))fail('duplicate frame id');frameIds.add(frame.id);if(!assetIds.has(frame.frameRef))fail('dangling frameRef '+frame.frameRef);return frame;});
    return {schema:'animation-workbench',version:1,defaultFps,assets,frames};
  }
  function sourceName(frame,sources){const source=(Array.isArray(sources)?sources:[]).find(s=>s&&s.id===frame.locator?.sourceId);return source?.name||frame.name||'frame-'+frame.id;}
  function assetFor(frame,sources,referenceId){const asset={id:referenceId,fileName:sourceName(frame,sources)},rect=frame.crop||frame.locator?.crop,hash=fingerprint(frame.contentFingerprint);if(rect)asset.crop=crop(rect);if(hash)asset.contentFingerprint=hash;return asset;}
  function fromFrames(frames,sources,defaultFps,identityMap){
    list(frames,'frames');fps(defaultFps);const byId=new Map(),assets=[],seen=new Set();
    for(const frame of frames){object(frame,'frame');id(frame.id,'frame id');if(byId.has(frame.id))fail('duplicate frame id');byId.set(frame.id,frame);}
    const occurrences=frames.map(frame=>{const referenceId=identityMap?.get(frame.id)?.referenceId||frame.id;if(!byId.has(referenceId))fail('missing reference frame '+referenceId);if(!seen.has(referenceId)){assets.push(assetFor(byId.get(referenceId),sources,referenceId));seen.add(referenceId);}return {id:frame.id,frameRef:referenceId,durationMs:positive(frame.durationMs)?frame.durationMs:positive(frame.duration)?frame.duration*1000:1000/defaultFps};});
    return clean({schema:'animation-workbench',version:1,defaultFps,assets,frames:occurrences});
  }
  function sameCrop(a,b){return !a&&!b||!!a&&!!b&&CROP_KEYS.every(key=>a[key]===b[key]);}
  function resolve(value,frames,sources){
    const metadata=clean(value);list(frames,'loaded frames');const matches=new Map();
    for(const asset of metadata.assets){
      const candidates=frames.filter(frame=>frame&&['image','sheet'].includes(frame.kind)&&typeof frame.url==='string'&&frame.url&& (asset.contentFingerprint?fingerprint(frame.contentFingerprint)===asset.contentFingerprint:sourceName(frame,sources)===asset.fileName&&sameCrop(frame.crop||frame.locator?.crop,asset.crop)));
      if(!candidates.length)fail('missing loaded asset '+asset.fileName);
      // Repeated occurrences of one source/crop are not distinct assets. A hash
      // also proves equivalence; filenames alone never prove that two files match.
      if(!asset.contentFingerprint){const keys=new Set(candidates.map(frame=>frame.locator?.sourceId?JSON.stringify([frame.locator.sourceId,...CROP_KEYS.map(key=>(frame.crop||frame.locator?.crop)?.[key]??null)]):frame.url));if(keys.size>1)fail('ambiguous loaded asset '+asset.fileName);}
      matches.set(asset.id,candidates);
    }
    const result=metadata.frames.map(occurrence=>{const candidates=matches.get(occurrence.frameRef),matched=candidates.find(frame=>frame.id===occurrence.id)||candidates[0];const frame={...matched,id:occurrence.id,animationAssetId:occurrence.frameRef,durationMs:occurrence.durationMs,duration:occurrence.durationMs/1000};if(matched.locator)frame.locator={...matched.locator,...(matched.locator.crop?{crop:{...matched.locator.crop}}:{})};if(matched.crop)frame.crop={...matched.crop};return frame;});
    return {metadata,frames:result};
  }
  function timing(frames,defaultFps){
    list(frames,'frames');fps(defaultFps);let milliseconds=0;const times=frames.map(frame=>{const start=milliseconds/1000;milliseconds+=duration(positive(frame.durationMs)?frame.durationMs:1000/defaultFps);return start;});
    const seconds=milliseconds/1000;return {fps:defaultFps,count:frames.length,duration:seconds,times};
  }
  const api={clean,fromFrames,resolve,timing};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AnimationMetadata=api;
})(typeof globalThis!=='undefined'?globalThis:this);
