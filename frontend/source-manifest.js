(function(root){
  'use strict';
  const MAX_FRAMES=200;
  const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
  function fail(message){throw Error('素材元数据：'+message);}
  function integer(value,name,min=0){if(!Number.isSafeInteger(value)||value<min)fail(name+'必须是有效整数。');return value;}
  function basename(value,name='文件名'){
    if(typeof value!=='string'||!value||value.length>1000||/[\x00-\x1f\\:?#]/.test(value)||value.startsWith('/')||value.split('/').some(part=>!part||part==='.'||part==='..'))fail(name+'必须是包内相对路径，不能是网址。');
    return value.split('/').pop();
  }
  function size(value,name){if(!object(value))fail(name+'缺失。');return {w:integer(value.w??value.width,name+'宽度',1),h:integer(value.h??value.height,name+'高度',1)};}
  function rect(value,name){if(!object(value))fail(name+'缺失。');return {x:integer(value.x,name+' X'),y:integer(value.y,name+' Y'),width:integer(value.w??value.width,name+'宽度',1),height:integer(value.h??value.height,name+'高度',1)};}
  function parse(value){
    if(!object(value)||!Array.isArray(value.frames)||!value.frames.length||value.frames.length>MAX_FRAMES)fail('需要 1–200 个完整帧记录。');
    const count=value.frames.length;
    if(value.frame_count!==undefined&&integer(value.frame_count,'帧数',1)!==count)fail('帧数与帧记录不一致。');
    const width=integer(value.width,'原帧宽度',1),height=integer(value.height,'原帧高度',1);
    const hasGrid=value.columns!==undefined||value.rows!==undefined;
    const columns=hasGrid?integer(value.columns,'列数',1):null,rows=hasGrid?integer(value.rows,'行数',1):null;
    if(hasGrid&&(columns>MAX_FRAMES||rows>MAX_FRAMES||columns*rows<count))fail('图集行列不足以容纳全部帧。');
    const atlas=value.atlas===undefined?null:basename(value.atlas,'图集文件名');
    const atlasWidth=value.atlas_width===undefined?(hasGrid?columns*width:null):integer(value.atlas_width,'图集宽度',1);
    const atlasHeight=value.atlas_height===undefined?(hasGrid?rows*height:null):integer(value.atlas_height,'图集高度',1);
    if(value.durations_ms!==undefined&&(!Array.isArray(value.durations_ms)||value.durations_ms.length!==count))fail('时长数组必须包含全部帧。');
    const names=new Set();
    const frames=value.frames.map((entry,index)=>{
      if(!object(entry))fail('第 '+(index+1)+' 帧记录无效。');
      if(entry.index!==undefined&&integer(entry.index,'帧序号')!==index)fail('帧序号与数组顺序不一致。');
      if(entry.rotated!==undefined&&typeof entry.rotated!=='boolean')fail('旋转标记无效。');
      if(entry.rotated)fail('暂不支持旋转打包的图集，请导出未旋转版本。');
      if(entry.trimmed!==undefined&&typeof entry.trimmed!=='boolean')fail('裁边标记无效。');
      const file=basename(entry.file,'帧文件名');if(names.has(file))fail('存在同名帧文件，无法可靠匹配。');names.add(file);
      const crop=entry.frame===undefined&&entry.crop===undefined?null:rect(entry.frame??entry.crop,'帧矩形');
      if(crop&&((atlasWidth!==null&&crop.x+crop.width>atlasWidth)||(atlasHeight!==null&&crop.y+crop.height>atlasHeight)))fail('帧矩形超出图集范围。');
      const sourceSize=entry.sourceSize===undefined?{w:width,h:height}:size(entry.sourceSize,'原帧画布');
      const spriteSourceSize=entry.spriteSourceSize===undefined?{x:0,y:0,w:crop?.width??sourceSize.w,h:crop?.height??sourceSize.h}:(()=>{const r=rect(entry.spriteSourceSize,'裁边偏移');return {x:r.x,y:r.y,w:r.width,h:r.height};})();
      if(spriteSourceSize.x+spriteSourceSize.w>sourceSize.w||spriteSourceSize.y+spriteSourceSize.h>sourceSize.h)fail('裁边画面超出原帧画布。');
      if(crop&&(crop.width!==spriteSourceSize.w||crop.height!==spriteSourceSize.h))fail('裁边尺寸与图集矩形不一致。');
      const fromArray=value.durations_ms?.[index],raw=entry.duration_ms!==undefined?entry.duration_ms:fromArray;
      const durationMs=raw===undefined?null:raw;
      if(raw!==undefined&&(!Number.isFinite(raw)||raw<=0))fail('每帧时长必须为正数（毫秒）。');
      if(entry.duration_ms!==undefined&&fromArray!==undefined&&entry.duration_ms!==fromArray)fail('帧时长与时长数组冲突。');
      return {file,durationMs,crop,sourceSize,spriteSourceSize,trimmed:entry.trimmed===true,rotated:false};
    });
    const timed=frames.filter(frame=>frame.durationMs!==null).length;
    if(timed&&timed!==count)fail('时序不完整，不能混用未知与已知时长。');
    const totalDurationMs=timed?frames.reduce((total,frame)=>total+frame.durationMs,0):null;
    if(totalDurationMs!==null&&!Number.isFinite(totalDurationMs))fail('总时长超出有效范围。');
    if(value.total_duration_ms!==undefined&&(!Number.isFinite(value.total_duration_ms)||value.total_duration_ms<=0||totalDurationMs===null||Math.abs(value.total_duration_ms-totalDurationMs)>1e-6))fail('总时长与逐帧时长不一致。');
    const regular=hasGrid&&frames.every((frame,index)=>frame.crop&&frame.crop.x===index%columns*width&&frame.crop.y===Math.floor(index/columns)*height&&frame.crop.width===width&&frame.crop.height===height);
    const sheetSettings=regular?{cols:columns,rows,count,'offset-x':0,'offset-y':0,'cell-w':width,'cell-h':height,'gap-x':0,'gap-y':0}:null;
    return {frames,sheetSettings,atlas,width,height,atlasWidth,atlasHeight,totalDurationMs};
  }
  function matchImages(manifest,files){
    if(!manifest||!Array.isArray(manifest.frames))fail('请先读取有效的素材元数据。');
    const supplied=Array.from(files||[]),byName=new Map();
    for(const file of supplied){const name=basename(file?.name,'所选图片名');if(byName.has(name))fail('所选图片有重复文件名。');byName.set(name,file);}
    if(supplied.length!==manifest.frames.length)fail('请同时选择元数据列出的全部帧图片，不要混入其他图片。');
    return manifest.frames.map(meta=>{const file=byName.get(meta.file);if(!file)fail('缺少帧图片：'+meta.file);return {file,meta};});
  }
  const api={parse,matchImages};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SourceManifest=api;
})(typeof window==='undefined'?globalThis:window);
