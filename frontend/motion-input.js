(function(root){
  'use strict';
  const Timeline=typeof module!=='undefined'&&module.exports?require('./timeline.js'):root.MotionTimeline;
  const Animation=typeof module!=='undefined'&&module.exports?require('./animation-metadata.js'):root.AnimationMetadata;
  const MAX_FRAMES=200;
  const THUMBNAIL_EDGE=256;
  function thumbnailSize(width,height){
    if(!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1)throw Error('无法读取源图像尺寸');
    const scale=Math.min(1,THUMBNAIL_EDGE/Math.max(width,height));
    return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
  }
  function cleanSource(source){if(!source||typeof source!=='object')return null;return {id:String(source.id||'').slice(0,100),assetId:null,name:String(source.name||'').slice(0,300),kind:['video','sheet','image'].includes(source.kind)?source.kind:'image',size:Number.isFinite(source.size)?source.size:null,lastModified:Number.isFinite(source.lastModified)?source.lastModified:null,type:String(source.type||'').slice(0,100),needsRegistration:true};}
  function cleanLocator(value){if(!value||typeof value!=='object')return null;const loc={kind:['video','sheet','image'].includes(value.kind)?value.kind:'image',sourceId:String(value.sourceId||'').slice(0,100)};
    if(loc.kind==='video'){loc.timeSeconds=Number.isFinite(value.timeSeconds)?Math.max(0,value.timeSeconds):0;loc.frameIndexHint=Number.isInteger(value.frameIndexHint)?Math.max(0,value.frameIndexHint):null;loc.indexBasis=value.indexBasis==='presentation_table'?'presentation_table':'configured_fps';loc.fpsHint=Number.isFinite(value.fpsHint)?value.fpsHint:null;}
    if(loc.kind==='sheet'&&value.crop&&['x','y','width','height'].every(k=>Number.isFinite(value.crop[k])))loc.crop=Object.fromEntries(['x','y','width','height'].map(k=>[k,value.crop[k]]));return loc;
  }
  // Compare original-resolution decoded RGBA, never filenames or thumbnails.
  async function pixelFingerprint(width,height,pixels){
    const digest=await root.crypto.subtle.digest('SHA-256',pixels);
    return width+'x'+height+':'+Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  }
  async function imageFingerprint(image,crop=null){
    const canvas=document.createElement('canvas');canvas.width=crop?crop.width:image.naturalWidth;canvas.height=crop?crop.height:image.naturalHeight;
    try{const ctx=canvas.getContext('2d',{willReadFrequently:true});if(crop)ctx.drawImage(image,crop.x,crop.y,crop.width,crop.height,0,0,crop.width,crop.height);else ctx.drawImage(image,0,0);return await pixelFingerprint(canvas.width,canvas.height,ctx.getImageData(0,0,canvas.width,canvas.height).data);}
    finally{canvas.width=canvas.height=1;}
  }
  function uniqueSequenceSelection(frames){
    const first=new Map(),selected=[];
    for(const frame of frames){
      const key=['image','sheet'].includes(frame.kind)&&(frame.contentFingerprint||frame.animationAssetId&&'asset:'+frame.animationAssetId);
      if(key&&first.has(key)){frame.duplicateOf=first.get(key);}
      else{frame.duplicateOf=null;selected.push(frame.id);if(key)first.set(key,frame.id);}
    }
    return selected;
  }
  function frameIdentityMap(frames){
    const seen=new Map(),identities=new Map();let next=0;
    frames.forEach((frame,index)=>{
      const staticFrame=['image','sheet'].includes(frame.kind),key=staticFrame&&(frame.contentFingerprint||frame.animationAssetId&&'asset:'+frame.animationAssetId);
      const first=staticFrame?(key?seen.get(key):identities.get(frame.duplicateOf)):null;
      const identity={number:first?first.number:++next,sourceOrdinal:index+1,referenceId:first?first.referenceId:frame.id,duplicate:!!first};
      identities.set(frame.id,identity);if(key&&!first)seen.set(key,identity);
    });return identities;
  }
  function matchingSequenceIds(frames,id){
    const frame=frames.find(f=>f.id===id);if(!frame)return [];if(!['image','sheet'].includes(frame.kind))return [frame.id];
    return frames.filter(f=>['image','sheet'].includes(f.kind)&&(f.id===id||(frame.contentFingerprint&&f.contentFingerprint===frame.contentFingerprint)||(frame.animationAssetId&&f.animationAssetId===frame.animationAssetId))).map(f=>f.id);
  }
  const clampTime=(t,d)=>Math.max(0,Math.min(Number.isFinite(+t)?+t:0,Math.max(0,(Number.isFinite(+d)?+d:0)-.001)));
  const validFps=value=>Number.isFinite(+value)&&+value>=1&&+value<=240?+value:30;
  function snapFrameTime(value,duration,fps=30){
    const rate=validFps(fps),last=Math.max(0,Math.ceil(Math.max(0,duration||0)*rate-1e-7)-1);
    const index=Math.max(0,Math.min(last,Math.round((Number.isFinite(+value)?+value:0)*rate)));
    return index/rate;
  }
  function reorder(list,id,targetId,after=false){
    const out=list.slice(),from=out.findIndex(x=>x.id===id);
    if(from<0||id===targetId||!out.some(x=>x.id===targetId))return out;
    const item=out.splice(from,1)[0],to=out.findIndex(x=>x.id===targetId);
    out.splice(to+(after?1:0),0,item);return out;
  }
  function sortFiles(files){return Array.from(files).map((file,i)=>({file,i})).sort((a,b)=>a.file.name.localeCompare(b.file.name,'zh-CN',{numeric:true,sensitivity:'base'})||a.i-b.i).map(x=>x.file);}
  function gridRects(o){
    const {width,height,cols,rows,count}=o;
    if(![width,height,cols,rows,count].every(Number.isInteger)||Math.min(width,height,cols,rows,count)<1||count>MAX_FRAMES||count>cols*rows)throw Error('请填写有效行列和帧数，最多 200 帧。');
    const x=+o.x||0,y=+o.y||0,gx=+o.gx||0,gy=+o.gy||0;
    if([x,y,gx,gy].some(v=>!Number.isInteger(v)||v<0))throw Error('起点与间距必须是非负整数。');
    const cw=+o.cellWidth||((width-x-(cols-1)*gx)/cols),ch=+o.cellHeight||((height-y-(rows-1)*gy)/rows);
    if(cw<1||ch<1||x+cols*cw+(cols-1)*gx>width+.01||y+rows*ch+(rows-1)*gy>height+.01)throw Error('分帧范围超出图片，请检查格宽、高、起点和间距。');
    return Array.from({length:count},(_,i)=>{const c=i%cols,r=Math.floor(i/cols),sx=Math.round(x+c*(cw+gx)),sy=Math.round(y+r*(ch+gy));return {x:sx,y:sy,width:Math.round(x+c*(cw+gx)+cw)-sx,height:Math.round(y+r*(ch+gy)+ch)-sy};});
  }
  class SerialQueue{constructor(){this.last=Promise.resolve();}run(fn){const p=this.last.catch(()=>{}).then(fn);this.last=p;return p;}}
  const sheetSettingKeys=['cols','rows','count','offset-x','offset-y','cell-w','cell-h','gap-x','gap-y'];
  function cleanSheetSettings(value){
    if(!value||typeof value!=='object')return null;const out={};
    for(const key of sheetSettingKeys){const number=Number(value[key]??0);if(!Number.isFinite(number)||number<0||number>1e7)return null;out[key]=number;}
    if(['cols','rows','count'].some(key=>!Number.isInteger(out[key])||out[key]<1||out[key]>200))return null;return out;
  }
  function inferSheetSettings(frames){
    const crops=frames.filter(f=>f.kind==='sheet'&&f.crop).map(f=>f.crop);if(!crops.length)return null;
    const first=crops[0],xs=[...new Set(crops.map(c=>c.x))].sort((a,b)=>a-b),ys=[...new Set(crops.map(c=>c.y))].sort((a,b)=>a-b);
    if(crops.some(c=>c.width!==first.width||c.height!==first.height))return null;
    const dx=xs.length>1?xs[1]-xs[0]:first.width,dy=ys.length>1?ys[1]-ys[0]:first.height;
    if(dx<first.width||dy<first.height||xs.some((x,i)=>x!==xs[0]+i*dx)||ys.some((y,i)=>y!==ys[0]+i*dy))return null;
    return cleanSheetSettings({cols:xs.length,rows:ys.length,count:crops.length,'offset-x':xs[0],'offset-y':ys[0],'cell-w':first.width,'cell-h':first.height,'gap-x':dx-first.width,'gap-y':dy-first.height});
  }
  function cleanMetadata(value){
    if(!value||typeof value!=='object')return null;
    let frames=Array.isArray(value.frames)?value.frames.filter(f=>f&&typeof f==='object').slice(0,MAX_FRAMES).map((f,i)=>({id:String(f.id||'saved-'+i).slice(0,80),name:String(f.name||'帧 '+(i+1)).slice(0,200),kind:['image','video','sheet'].includes(f.kind)?f.kind:'image',locator:cleanLocator(f.locator),thumbnailWidth:Number.isFinite(f.thumbnailWidth)?f.thumbnailWidth:null,thumbnailHeight:Number.isFinite(f.thumbnailHeight)?f.thumbnailHeight:null,contentFingerprint:typeof f.contentFingerprint==='string'&&/^\d+x\d+:[a-f0-9]{64}$/.test(f.contentFingerprint)?f.contentFingerprint:null,animationAssetId:typeof f.animationAssetId==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$/.test(f.animationAssetId)?f.animationAssetId:null,duplicateOf:typeof f.duplicateOf==='string'?f.duplicateOf.slice(0,80):null,redraw:f.redraw===true,prompt:typeof f.prompt==='string'?f.prompt.slice(0,20000):null,time:Number.isFinite(f.time)?Math.max(0,f.time):null,duration:Number.isFinite(f.duration)?Math.max(0,f.duration):null,durationMs:Number.isFinite(f.durationMs)&&f.durationMs>0&&f.durationMs<=3600000?f.durationMs:Number.isFinite(f.duration)&&f.duration>0&&f.duration<=3600?f.duration*1000:null,width:Number.isFinite(f.width)?f.width:null,height:Number.isFinite(f.height)?f.height:null,crop:f.crop&&['x','y','width','height'].every(k=>Number.isFinite(f.crop[k]))?Object.fromEntries(['x','y','width','height'].map(k=>[k,f.crop[k]])):null})):[];
    if(value.animation&&frames.length&&['sequence','sheet'].includes(value.kind)){const animation=Animation.clean(value.animation),byId=new Map(frames.map(frame=>[frame.id,frame]));if(animation.frames.length!==frames.length||animation.frames.some(frame=>!byId.has(frame.id)))throw Error('动画元数据与帧记录不匹配');const assets=new Map(animation.assets.map(asset=>[asset.id,asset]));for(const item of animation.frames){const frame=byId.get(item.id),raw=value.frames.find(f=>f?.id===item.id),asset=assets.get(item.frameRef),source=(value.sources||[]).find(source=>source?.id===frame.locator?.sourceId),name=source?.name||raw?.name||'frame-'+frame.id,rect=frame.crop||frame.locator?.crop;const same=asset.contentFingerprint?asset.contentFingerprint===frame.contentFingerprint:name===asset.fileName&&(!rect&&!asset.crop||rect&&asset.crop&&['x','y','width','height'].every(key=>rect[key]===asset.crop[key]));if(!same)throw Error('动画引用与原始帧素材不匹配');}frames=animation.frames.map(item=>({...byId.get(item.id),animationAssetId:item.frameRef,durationMs:item.durationMs,duration:item.durationMs/1000}));}
    return {version:3,animation:['sequence','sheet'].includes(value.kind)?Animation.fromFrames(frames,Array.isArray(value.sources)?value.sources.map(cleanSource).filter(Boolean):[],+value.previewFps||12,frameIdentityMap(frames)):null,sheetSettings:cleanSheetSettings(value.sheetSettings),sources:Array.isArray(value.sources)?value.sources.map(cleanSource).filter(Boolean):[],kind:['sequence','video','sheet'].includes(value.kind)?value.kind:'sequence',sourceName:String(value.sourceName||'').slice(0,200),sourceDuration:Number.isFinite(value.sourceDuration)?value.sourceDuration:null,previewFps:Math.max(1,Math.min(60,+value.previewFps||12)),timelineFps:validFps(value.timelineFps),frameLayout:value.frameLayout==='grid'?'grid':'row',batchRange:value.batchRange&&Number.isFinite(value.batchRange.start)&&Number.isFinite(value.batchRange.end)&&value.batchRange.start>=0&&value.batchRange.end>value.batchRange.start?{start:value.batchRange.start,end:value.batchRange.end}:null,frameRateInfo:{status:['detected','manual','unknown','saved','detecting','idle'].includes(value.frameRateInfo?.status)?value.frameRateInfo.status:'saved',source:String(value.frameRateInfo?.source||'').slice(0,100),variable:!!value.frameRateInfo?.variable},frames,needsRelink:true};
  }
  const fmt=t=>{const n=Math.max(0,+t||0);return Math.floor(n/60)+':'+(n%60).toFixed(3).padStart(6,'0');};
  function loadImage(url){return new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error('无法读取这张图片。'));im.src=url;});}
  const imageSourceAdapter={
    timing:editor=>Animation.timing(editor.frames,Math.max(1,Math.min(60,+editor.q('sequence-fps').value||12))),
    preview:(editor,value)=>editor.previewFramesAt(value),editableFrames:false
  };
  const sourceAdapters={sequence:imageSourceAdapter,sheet:imageSourceAdapter,video:{
    timing:editor=>({duration:editor.duration,fps:editor.timelineFps,times:editor.sourceFrameTimes}),
    preview:(editor,value)=>editor.previewVideoAt(value),editableFrames:true
  }};
  class Editor{
    constructor(host,options={}){
      this.host=host;this.options=options;this.frames=[];this.urls=new Set();this.epoch=0;this.serial=0;this.sourceSerial=0;this.sources=[];this.sourceFiles=new Map();this.activeSourceId=null;this.pending=0;this.queue=new SerialQueue();this.kind='sequence';this.duration=0;this.cursor=0;this.seekVersion=0;this.timelineView=null;this.timelineFps=30;this.batchRange=null;this.fpsInfo={status:'idle'};this.rateGeneration=0;this.rateBlocked=false;this.autoFpsPending=false;this.sourceVideoBlob=null;this.sourceFrameTimes=null;this.sourceName='';this.videoUrl='';this.selected=null;this.selectionIds=[];this.frameSortMode=false;this.frameLayout='row';this.savedPlan=null;
      host.innerHTML=`<div class="mi-top"><span class="mi-import-label">导入动作素材</span><div class="mi-import-choices"><button data-mi-action="images" title="导入多张帧图片"><span>帧序列</span></button><button data-mi-action="sheet" title="导入连续帧图或图集"><span>连续图 / 图集</span></button><button data-mi-action="video" title="导入视频并选帧"><span>视频</span></button></div><button class="mi-sample-button" hidden data-mi-action="sample">试用示例视频</button></div>
        <p class="info-text">支持多张帧图片、一张连续帧图/图集，或视频选帧。切换素材会重建本页的动作帧列表，原文件不变。</p>
        <input data-mi="animation-file" type="file" accept="application/json,.json" hidden><input data-mi="images-file" type="file" accept="image/png,image/jpeg,image/webp" multiple hidden><input data-mi="sheet-file" type="file" accept="image/png,image/jpeg,image/webp" hidden><input data-mi="video-file" type="file" accept="video/*,.mp4,.webm,.mov" hidden>
        <div data-mi="restore" class="warning-inline" hidden></div><div data-mi="source-label" class="mi-source">尚未导入动作素材</div>
        <div data-mi="video-section" hidden><video data-mi="video" controls muted playsinline preload="auto" class="mi-video"></video>
          <div class="mi-time-row"><b data-mi="timeline-title">动作采样时间轴</b><label class="timeline-fps" title="导入后自动读取视频帧率，也可以手动覆盖">帧率 <input data-mi="timeline-fps" type="number" min="1" max="240" step="0.001" value="30" aria-label="时间轴帧率，可自动识别或手动设置"> fps</label><span data-mi="fps-status" class="fps-status" role="status">等待视频</span><button class="tiny" data-mi-action="detect-fps" title="重新识别并使用源视频帧率">自动识别</button><button class="tiny" data-mi-action="fit-time">适应全部</button><span data-mi="cursor-label" class="mi-help">当前位置 0.000s</span><span data-mi="visible-time" class="mi-help"></span></div><div class="timeline-range-bar"><span>采样范围</span><b data-mi="batch-range-label">未选择范围</b><button data-mi-action="batch-full" class="tiny">全片范围</button><small>拖选时间轴：设置范围并选择帧</small></div><div class="mi-markers" data-mi="markers" tabindex="0" role="group" aria-label="通用帧时间轴：拖动红色播放头预览，拖选时间范围选择帧，滚轮缩放"><div data-mi="ticks" class="mi-ticks"></div><div data-mi="batch-range-highlight" class="timeline-sample-range" aria-hidden="true"></div><div data-mi="points" class="mi-points"></div><div data-mi="playhead" class="mi-playhead"><span data-playhead-handle="true" class="playhead-handle" role="button" tabindex="0" aria-label="拖动播放指针预览帧" title="拖动定位；拖到边缘可平移时间轴"></span></div><span class="mi-track-label">采样帧</span></div><div data-mi="time-pan" class="timeline-scrollbar" role="scrollbar" aria-orientation="horizontal" aria-label="时间轴水平滚动条" tabindex="0"></div>
          <div class="mi-time-row animation-controls" data-mi="animation-controls"><button data-mi-action="play-sequence">播放帧序列</button><label hidden title="没有逐帧时长的图片使用此默认帧率；不会覆盖已导入时长">默认帧率<input data-mi="sequence-fps" type="number" min="1" max="60" step="0.001" value="12"> fps</label><button hidden class="tiny" data-mi-action="uniform-fps" title="按填写的帧率替换所有帧时长">统一所有帧时长</button><button class="tiny" data-mi-action="import-animation">导入动画 JSON</button><button class="tiny" data-mi-action="export-animation">导出动画 JSON</button><small data-mi="timing-status">无时长元数据时使用默认帧率</small></div><div class="mi-time-row video-capture-row"><label title="输入时间后，点击添加帧；也可直接双击时间轴添加">添加帧时间 <input data-mi="add-time" type="number" min="0" step="0.001" value="0"> 秒</label><div class="frame-step-buttons" role="group" aria-label="逐帧预览"><button data-mi-action="step-back" title="预览上一视频帧" disabled>上一帧</button><button data-mi-action="step-forward" title="预览下一视频帧" disabled>下一帧</button></div><button data-mi-action="capture" class="btn-accent" disabled>在此添加帧</button><button data-mi-action="toggle-batch" class="batch-toggle" aria-expanded="false" aria-controls="batch-options">批量添加</button><span class="info-text" data-mi="video-status">等待读取视频</span></div>
          <details class="mi-batch batch-inline-options" id="batch-options"><summary hidden>批量添加帧</summary><div class="batch-body"><div class="batch-method-row"><div class="batch-methods" role="group" aria-label="批量采样方式"><button data-mi-action="batch-mode-step" aria-pressed="true">按固定时间间隔</button><button data-mi-action="batch-mode-count" aria-pressed="false">按总帧数均匀分配</button></div><select data-mi="batch-mode" hidden aria-label="批量采样方式"><option value="step">按固定时间间隔</option><option value="count">按总帧数均匀分配</option></select><label class="batch-number-field batch-amount"><input data-mi="batch-value" type="number" min="0.001" step="0.001" value="0.1" aria-label="采样间隔或总帧数"><span data-mi="batch-unit" class="batch-unit">秒 / 帧</span></label><button data-mi-action="batch-add" class="btn-accent" disabled>批量添加到时间轴</button></div><p class="mi-help">在上方时间刻度拖选采样范围。范围包含起点、不含终点；均分 N 段取每段起点，共 N 帧。自动跳过已有采样位置，合计最多 200 帧。</p></div></details>
          <p class="mi-help">拖动顶部刻度选择采样范围；拖动红色播放指针定位；空白轨道拖动框选，Ctrl/Shift可追加。滚轮缩放，Alt或中键拖动平移。双击轨道在该位置添加帧；拖动菱形点时实时预览，并按时间轴帧率吸附；松开后更新采样帧。</p></div>
        <div data-mi="sheet-section" hidden><canvas data-mi="sheet-preview" class="mi-sheet-preview"></canvas><div class="mi-grid-fields"><label>列数<input data-mi="cols" type="number" min="1" max="200" value="7"></label><label>行数<input data-mi="rows" type="number" min="1" max="200" value="1"></label><label>帧数<input data-mi="count" type="number" min="1" max="200" value="7"></label><button data-mi-action="split" class="btn-accent">按网格切分</button></div>
          <details><summary>切分起点、格尺寸与间距</summary><div class="mi-grid-fields"><label>起点 X<input data-mi="offset-x" type="number" min="0" value="0"></label><label>起点 Y<input data-mi="offset-y" type="number" min="0" value="0"></label><label>格宽（0=均分）<input data-mi="cell-w" type="number" min="0" value="0"></label><label>格高（0=均分）<input data-mi="cell-h" type="number" min="0" value="0"></label><label>水平间距<input data-mi="gap-x" type="number" min="0" value="0"></label><label>垂直间距<input data-mi="gap-y" type="number" min="0" value="0"></label></div></details><p class="mi-help">一行连续图设行数为 1。按从左到右、从上到下切分，可保留真实重复画面。</p></div>
        <div data-mi="image-section" hidden><div class="mi-image-stage"><img data-mi="image-preview" alt="当前帧预览"></div></div>
        <div class="mi-list-head"><b>动作帧 <span data-mi="frame-count">0</span></b><button class="tiny frame-display-toggle" data-mi-action="toggle-frame-layout" aria-pressed="false" title="切换为多行显示">单行显示</button><span data-mi="frame-hint" class="mi-help">拖动框选 · Ctrl 追加 · Shift 连选</span><button data-mi-action="toggle-sort" class="tiny" hidden>调整图片顺序</button></div><p class="mi-help">拖动缩略图调整顺序；也可使用前移/后移按钮。视频帧按采样时间自动排序；图片帧可手动重排，原始素材不变。</p>
        <div data-mi="frames" class="mi-frames" role="listbox" aria-label="动作帧批量选择区域" aria-multiselectable="true" tabindex="0"><div class="empty-state">导入素材后，在这里整理动作帧。</div></div><div data-mi="status" class="mi-help" role="status"></div>`;
      this.q=name=>host.querySelector('[data-mi="'+name+'"]');this.video=this.q('video');mountMotionWorkspace(this);
      host.addEventListener('click',e=>{const button=e.target.closest('[data-mi-action]');if(button&&!button.disabled){if(['images','sheet','video'].includes(button.dataset.miAction))root.WorkbenchPickerProbe?.clicked(e);this.click(button.dataset.miAction,button);}});
      for(const [name,type] of [['images-file','images'],['sheet-file','sheet'],['video-file','video']])this.q(name).onchange=()=>{const files=Array.from(this.q(name).files);this.q(name).value='';if(!files.length)return;if(type==='images')this.importImages(files);else if(type==='sheet')this.importSheet(files[0]);else this.importVideo(files[0]);};
      this.q('timeline-fps').onchange=()=>{if(this.isFrameSource()){this.setFrameRate(this.q('timeline-fps').value);return;}this.rateGeneration++;this.autoFpsPending=false;this.rateBlocked=false;this.timelineFps=validFps(this.q('timeline-fps').value);this.fpsInfo={status:'manual',fps:this.timelineFps};this.sourceFrameTimes=null;this.renderRateStatus();this.q('add-time').step=1/this.timelineFps;this.setCursor(this.cursor);this.renderFrames();this.updateControls();this.changed();this.action('motion.frame_rate',{fps:this.timelineFps,sourceFrameRateDetected:false});};
      this.q('batch-mode').onchange=()=>{const count=this.q('batch-mode').value==='count';this.q('batch-value').value=count?7:.1;this.q('batch-value').step=count?1:.001;this.q('batch-value').min=count?1:.001;this.q('batch-unit').textContent=count?'帧':'秒 / 帧';for(const mode of ['step','count'])this.host.querySelector('[data-mi-action="batch-mode-'+mode+'"]').setAttribute('aria-pressed',String(this.q('batch-mode').value===mode));};
      for(const name of ['cols','rows','count','offset-x','offset-y','cell-w','cell-h','gap-x','gap-y'])this.q(name).oninput=()=>{if(name==='cols'||name==='rows')this.q('count').value=Math.min(MAX_FRAMES,Math.max(1,+this.q('cols').value*+this.q('rows').value));this.previewGrid();};
      this.q('animation-file').onchange=async()=>{const input=this.q('animation-file'),file=input.files[0],epoch=this.epoch;input.value='';if(!file)return;if(file.size>1024*1024)return this.message('动画 JSON 不得超过 1 MB。');try{const value=JSON.parse(await file.text());if(epoch!==this.epoch)return;this.importAnimation(value);}catch(e){this.message('动画 JSON 无效：'+e.message);}};
      this.q('sequence-fps').onchange=()=>this.setFrameRate(this.q('sequence-fps').value);
      for(const name of ['sequence-fps','timeline-fps'])this.q(name).oninput=()=>{const value=+this.q(name).value;if(this.isFrameSource()&&Number.isFinite(value)&&value>=1&&value<=60)this.setFrameRate(value);};
      this.video.onloadedmetadata=()=>{if(!this.videoUrl)return;if(!Number.isFinite(this.video.duration)||this.video.duration<=0){this.message('视频时长不可读，请使用本地 MP4/WebM。');return;}this.duration=this.video.duration;this.batchRange={start:0,end:this.duration};this.timelineView=null;this.renderMarkers();this.changed();this.q('add-time').max=Math.max(0,this.duration-.001);this.updateControls();};
      this.video.onloadeddata=()=>{this.updateControls();this.renderTime();};this.video.ontimeupdate=()=>{if(!this.pending&&!this.drag){this.cursor=this.video.currentTime;this.renderTime();}};
      this.video.onerror=()=>{if(this.videoUrl)this.message('浏览器无法解码该视频。可尝试 H.264 MP4 或 WebM；原型不进行后台转码。');this.updateControls();};
      host.addEventListener('change',e=>{if(e.target.dataset.frameTime)this.retime(e.target.dataset.frameTime,+e.target.value);});
      this.bindDrag();this.bindMarquee();this.bindMarkers();this.render();
    }
    action(id,payload={}){if(this.options.onAction)this.options.onAction(id,payload);}
    message(text){this.q('status').textContent=text;if(this.options.message)this.options.message(text);}
    own(blob){const url=URL.createObjectURL(blob);this.urls.add(url);return url;}
    release(url){if(this.urls.has(url)){URL.revokeObjectURL(url);this.urls.delete(url);}}
    registerSource(file,kind,name=file.name){const source=cleanSource({id:'source-'+this.epoch+'-'+(++this.sourceSerial),name,kind,size:file.size,lastModified:file.lastModified,type:file.type});this.sources.push(source);this.sourceFiles.set(source.id,file);return source.id;}
    videoLocator(time){return {kind:'video',sourceId:this.activeSourceId||'',timeSeconds:time,frameIndexHint:this.frameIndex(time),indexBasis:this.sourceFrameTimes?.length?'presentation_table':'configured_fps',fpsHint:this.timelineFps};}
    frameRequest(frame,prompt){return {id:frame.id,locator:cleanLocator(frame.locator),originalSize:{width:frame.width,height:frame.height},redraw:!!frame.redraw,prompt,extractOriginalOnBackend:true};}
    newId(){return 'motion-frame-'+(++this.serial);}
    reset(kind='sequence',notify=true){if(this.frameHoverTooltip){this.frameHoverTooltip.remove();this.frameHoverTooltip=null;}this.framePreviewId=null;this.epoch++;if(this.cancelTimelineGesture)this.cancelTimelineGesture();if(this.cancelMarquee)this.cancelMarquee();this.frameSortMode=false;this.rateGeneration++;this.autoFpsPending=false;this.rateBlocked=false;this.sourceVideoBlob=null;this.sourceFrameTimes=null;this.fpsInfo={status:'idle'};this.timelineFps=30;this.batchRange=null;this.previewRequest=null;if(this.batch)this.batch.cancelled=true;this.seekVersion++;this.timelineView=null;this.stopSequence();if(this.abortSeek)this.abortSeek();this.kind=kind;this.videoUrl='';this.video.pause();this.video.removeAttribute('src');this.video.load();for(const url of this.urls)URL.revokeObjectURL(url);this.urls.clear();this.frames=[];this.sources=[];this.sourceFiles?.clear();this.activeSourceId=null;this.sourceName='';this.duration=0;this.cursor=0;this.sheet=null;this.savedPlan=null;this.selected=null;this.selectionIds=[];this.drag=null;this.render();if(notify)this.changed();}
    loadPlan(meta){this.reset('sequence',false);this.savedPlan=cleanMetadata(meta);if(this.savedPlan){this.frameLayout=this.savedPlan.frameLayout;this.batchRange=this.savedPlan.batchRange;this.timelineFps=this.savedPlan.timelineFps;this.fpsInfo={...this.savedPlan.frameRateInfo,status:'saved',fps:this.timelineFps};this.q('timeline-fps').value=this.timelineFps;}this.render();this.changed();}
    metadata(){if(!this.frames.length&&this.savedPlan)return {...this.savedPlan,frameLayout:this.frameLayout||'row'};return {version:3,animation:this.isFrameSource()?this.animationMetadata():null,sheetSettings:this.kind==='sheet'?this.sheetSettings():null,sources:(this.sources||[]).map(cleanSource),frameLayout:this.frameLayout||'row',batchRange:this.batchRange?{...this.batchRange}:null,kind:this.kind,sourceName:this.sourceName,sourceDuration:this.kind==='video'?this.duration:null,previewFps:+this.q('sequence-fps').value,timelineFps:validFps(this.timelineFps),frameRateInfo:{status:this.fpsInfo?.status||'manual',source:this.fpsInfo?.source||'',variable:!!this.fpsInfo?.variable},frames:this.frames.map(f=>({id:f.id,name:f.name,kind:f.kind,locator:cleanLocator(f.locator),thumbnailWidth:f.thumbnailWidth??null,thumbnailHeight:f.thumbnailHeight??null,contentFingerprint:f.contentFingerprint||null,animationAssetId:f.animationAssetId||null,duplicateOf:f.duplicateOf||null,redraw:!!f.redraw,prompt:typeof f.prompt==='string'?f.prompt:null,time:f.time??null,duration:f.duration??null,durationMs:f.durationMs??null,width:f.width,height:f.height,crop:f.crop||null})),needsRelink:false};}
    changed(){const meta=this.metadata();if(this.options.onChange)this.options.onChange(meta,this.frames[0]?.url||null);}
    async importImages(files){
      if(files.length>MAX_FRAMES)return this.message('一次最多导入 200 张；所有帧保留，相同画面默认只选中首帧。');
      this.reset('sequence');this.sourceName='帧序列';const epoch=this.epoch,ordered=sortFiles(files);let failed=0,unchecked=0;this.pending++;
      try{
        for(const file of ordered){
          if(epoch!==this.epoch)return;const url=this.own(file);
          try{
            const im=await loadImage(url);if(epoch!==this.epoch){this.release(url);return;}
            let contentFingerprint=null;try{contentFingerprint=await imageFingerprint(im);}catch(e){unchecked++;}
            if(epoch!==this.epoch){this.release(url);return;}
            const thumbnail=await this.raster(im,im.naturalWidth,im.naturalHeight);this.release(url);
            if(epoch!==this.epoch){this.release(thumbnail.url);return;}
            const sourceId=this.registerSource(file,'image');this.frames.push({...thumbnail,id:this.newId(),kind:'image',name:file.name,locator:{kind:'image',sourceId},contentFingerprint});
          }catch(e){failed++;this.release(url);}
        }
        this.selectionIds=uniqueSequenceSelection(this.frames);this.selected=this.selectionIds[0]||null;
        this.render();this.changed();this.action('motion.import_frames',{files:ordered.map(f=>f.name),loaded:this.frames.length,failed,uniqueSelected:this.selectionIds.length,unchecked});
        this.message('时间轴保留 '+this.frames.length+' 个播放位置，下方显示 '+this.selectionIds.length+' 个不同画面。'+(failed?' 有 '+failed+' 张无法读取。':'')+(unchecked?' 有 '+unchecked+' 帧未能比较，已保留选中。':''));
      }finally{this.pending--;if(epoch===this.epoch){this.updateControls();this.changed();}}
    }
    importVideo(file){if(file.size>1024*1024*1024)return this.message('前端预览的视频请小于 1GB。');this.reset('video');this.sourceName=file.name;this.activeSourceId=this.registerSource(file,'video');this.videoUrl=this.own(file);this.video.src=this.videoUrl;this.video.load();this.sourceVideoBlob=file;this.detectFrameRate(file);this.render();this.action('motion.import_video',{name:file.name,size:file.size});}
    loadSample(){if(!this.options.sampleVideo)return this.message('请导入自己的视频素材');this.reset('video');this.sourceName='内嵌待机示例.mp4';this.videoUrl=this.options.sampleVideo;this.video.src=this.videoUrl;this.video.load();const encoded=this.options.sampleVideo.split(',')[1],bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));this.sourceVideoBlob=new Blob([bytes],{type:'video/mp4'});this.activeSourceId=this.registerSource(this.sourceVideoBlob,'video',this.sourceName);this.detectFrameRate(this.sourceVideoBlob);this.render();this.action('motion.import_video',{sample:true});}
    renderRateStatus(){const status=this.fpsInfo?.status||'idle',field=this.q('timeline-fps'),badge=this.q('fps-status');badge.dataset.state=status;
      field.value=['detecting','unknown'].includes(status)?'':Number(validFps(this.timelineFps).toFixed(6));field.placeholder=status==='detecting'?'识别中':'填写帧率';
      badge.textContent=status==='detecting'?'正在识别…':status==='detected'?(this.fpsInfo.variable?'自动 · 可变帧率':this.fpsInfo.declared?'自动 · 声明帧率':'自动识别'):status==='unknown'?'未识别 · 请手动填写':status==='manual'?'手动设置':status==='saved'?'已保存 · 待重新导入':'等待视频';
      badge.title=this.fpsInfo?.reason||((this.fpsInfo?.source||'')+(this.fpsInfo?.variable?'；显示平均帧率，吸附使用实际帧时间。':''));
      this.host.querySelector('[data-mi-action="detect-fps"]').disabled=!this.sourceVideoBlob||this.autoFpsPending;
    }
    async detectFrameRate(blob=this.sourceVideoBlob){if(!blob)return;const epoch=this.epoch,generation=++this.rateGeneration;this.autoFpsPending=true;this.rateBlocked=true;this.fpsInfo={status:'detecting'};this.sourceFrameTimes=null;this.renderRateStatus();this.updateControls();
      const result=await VideoFrameRate.detect(blob,{isCancelled:()=>epoch!==this.epoch||generation!==this.rateGeneration});
      if(epoch!==this.epoch||generation!==this.rateGeneration)return;
      this.autoFpsPending=false;this.fpsInfo=result;this.rateBlocked=result.status!=='detected';
      if(!this.rateBlocked){this.timelineFps=result.fps;this.sourceFrameTimes=result.frameTimes||null;this.q('add-time').step=1/this.timelineFps;}
      this.renderRateStatus();this.updateControls();this.renderFrames();this.renderTime();this.changed();this.action('motion.detect_frame_rate',{status:result.status,fps:result.fps||null,variable:!!result.variable,source:result.source||null,reason:result.reason||null});
    }
    async importSheet(file){this.reset('sheet');this.sourceName=file.name;this.activeSourceId=this.registerSource(file,'sheet');const epoch=this.epoch,url=this.own(file);try{const im=await loadImage(url);if(epoch!==this.epoch)return;this.sheet=im;this.render();this.previewGrid();this.changed();this.action('motion.import_sheet',{name:file.name,width:im.naturalWidth,height:im.naturalHeight});}catch(e){this.message(e.message);}}
    sheetSettings(){return cleanSheetSettings(Object.fromEntries(sheetSettingKeys.map(key=>[key,+this.q(key).value])));}
    restoreSheetSettings(settings){const clean=cleanSheetSettings(settings);if(clean)for(const key of sheetSettingKeys)this.q(key).value=clean[key];}
    sheetOptions(){return {width:this.sheet?.naturalWidth,height:this.sheet?.naturalHeight,cols:+this.q('cols').value,rows:+this.q('rows').value,count:+this.q('count').value,x:+this.q('offset-x').value,y:+this.q('offset-y').value,gx:+this.q('gap-x').value,gy:+this.q('gap-y').value,cellWidth:+this.q('cell-w').value,cellHeight:+this.q('cell-h').value};}
    previewGrid(){if(!this.sheet)return;const canvas=this.q('sheet-preview'),s=Math.min(1,950/this.sheet.naturalWidth,240/this.sheet.naturalHeight);canvas.width=Math.max(1,Math.round(this.sheet.naturalWidth*s));canvas.height=Math.max(1,Math.round(this.sheet.naturalHeight*s));const c=canvas.getContext('2d');c.drawImage(this.sheet,0,0,canvas.width,canvas.height);try{c.strokeStyle='#eac269';c.lineWidth=1;for(const r of gridRects(this.sheetOptions()))c.strokeRect(r.x*s,r.y*s,r.width*s,r.height*s);}catch(e){this.q('status').textContent=e.message;}}
    async splitSheet(){if(this.splitting)return; if(!this.sheet)return this.message('请先导入连续图或图集。');let rects;try{rects=gridRects(this.sheetOptions());}catch(e){return this.message(e.message);}const epoch=this.epoch,items=[],grid=this.sheetOptions();this.splitting=true;this.host.querySelector('[data-mi-action="split"]').disabled=true;try{for(let i=0;i<rects.length;i++){const r=rects[i];let contentFingerprint=null;try{contentFingerprint=await imageFingerprint(this.sheet,r);}catch(e){}const result=await this.raster(this.sheet,r.width,r.height,r);if(epoch!==this.epoch){this.release(result.url);for(const f of items)this.release(f.url);return;}items.push({...result,contentFingerprint,id:this.newId(),kind:'sheet',name:this.sourceName+' #'+(i+1),crop:r,locator:{kind:'sheet',sourceId:this.activeSourceId,crop:{...r}}});}for(const f of this.frames)this.release(f.url);this.frames=items;this.cursor=0;this.framePreviewId=null;this.batchRange=null;this.timelineView=null;this.selectionIds=uniqueSequenceSelection(items);this.selected=this.selectionIds[0]||null;this.render();this.changed();this.action('motion.split_sheet',{grid,frames:items.length});this.message('已切分 '+items.length+' 帧，透明通道保留；可继续拖动排序。');}catch(e){for(const f of items)this.release(f.url);this.message(e.message);}finally{this.splitting=false;this.host.querySelector('[data-mi-action="split"]').disabled=false;}}
    raster(source,width,height,crop){return new Promise((resolve,reject)=>{let size;try{size=thumbnailSize(width,height);}catch(e){return reject(e);}const canvas=document.createElement('canvas');canvas.width=size.width;canvas.height=size.height;try{const c=canvas.getContext('2d');c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';if(crop)c.drawImage(source,crop.x,crop.y,crop.width,crop.height,0,0,size.width,size.height);else c.drawImage(source,0,0,size.width,size.height);canvas.toBlob(blob=>{canvas.width=1;canvas.height=1;if(!blob)return reject(Error('无法生成缩略图。'));resolve({url:this.own(blob),width,height,thumbnailWidth:size.width,thumbnailHeight:size.height,thumbnailBytes:blob.size});},'image/png');}catch(e){canvas.width=1;canvas.height=1;reject(e);}});}

    seek(t){const v=this.video;if(!v.seeking&&v.readyState>=2&&Math.abs(v.currentTime-t)<.0001)return Promise.resolve();return new Promise((resolve,reject)=>{let timer;const clean=()=>{clearTimeout(timer);v.removeEventListener('seeked',done);v.removeEventListener('error',error);this.abortSeek=null;};const done=()=>{clean();v.readyState>=2?resolve():reject(Error('视频尚未解码，请稍后重试。'));};const error=()=>{clean();reject(Error('视频定位失败。'));};this.abortSeek=()=>{clean();reject(Error('source_changed'));};v.addEventListener('seeked',done,{once:true});v.addEventListener('error',error,{once:true});timer=setTimeout(()=>{clean();reject(Error('视频定位超时，请换一个时间点重试。'));},10000);try{v.currentTime=t;}catch(e){clean();reject(e);}});}
    enqueue(fn,{preview=false}={}){const epoch=this.epoch;this.pending++;if(preview)this.previewPending=(this.previewPending||0)+1;this.updateControls();return this.queue.run(async()=>{if(epoch!==this.epoch)return null;return fn(epoch);}).catch(e=>{if(e.message!=='source_changed')this.message(e.message);return null;}).finally(()=>{this.pending--;if(preview)this.previewPending--;this.updateControls();if(!this.pending)this.renderTime();});}
    frameLabel(frame){const identity=frameIdentityMap(this.frames).get(frame.id);return identity?'编号 '+identity.number+' · 原始第 '+identity.sourceOrdinal+' 帧':'';}
    sourceAdapter(){return sourceAdapters[this.kind]||sourceAdapters.video;}
    isFrameSource(){return this.kind==='sequence'||this.kind==='sheet';}
    timelineModel(){return Timeline.frameModel(this.sourceAdapter().timing(this));}
    animationMetadata(){return Animation.fromFrames(this.frames,this.sources||[],+this.q('sequence-fps').value||12,frameIdentityMap(this.frames));}
    visibleFrames(){const identities=frameIdentityMap(this.frames);return this.frames.filter(f=>!identities.get(f.id).duplicate);}
    importAnimation(value){
      if(!this.isFrameSource()||!this.frames.length)throw Error('请先导入帧图片，或切分图集。');
      if(this.pending||this.batch||this.splitting)throw Error('请等待当前导入完成。');
      const resolved=Animation.resolve(value,this.frames,this.sources||[]);
      this.stopSequence();this.cancelTimelineGesture?.();this.cancelMarquee?.();
      const retained=new Set(resolved.frames.map(f=>f.url));for(const frame of this.frames)if(!retained.has(frame.url))this.release(frame.url);
      const previous=new Map(this.frames.map(frame=>[frame.id,frame]));this.serial=Math.max(this.serial||0,...this.frames.map(f=>Number(f.id.match(/(\d+)$/)?.[1])||0),...resolved.frames.map(f=>{const n=Number(f.id.match(/(\d+)$/)?.[1]);return Number.isSafeInteger(n)&&n<1000000000?n:0;}));
      this.frames=resolved.frames.map(frame=>{const prior=previous.get(frame.id),same=prior&&(prior.url===frame.url||prior.contentFingerprint&&prior.contentFingerprint===frame.contentFingerprint);return {...frame,id:same?frame.id:this.newId()};});this.epoch++;this.q('sequence-fps').value=resolved.metadata.defaultFps;
      this.selectionIds=uniqueSequenceSelection(this.frames);this.selected=this.selectionIds[0]||null;this.framePreviewId=null;this.cursor=0;this.batchRange=null;this.timelineView=null;this.render();this.changed();this.message('已应用动画 JSON：'+this.frames.length+' 个播放位置，保留逐帧时长。');
    }
    exportAnimation(){if(!this.isFrameSource()||!this.frames.length)return;const url=URL.createObjectURL(new Blob([JSON.stringify(this.animationMetadata(),null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='animation.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
    setFrameRate(value,{uniform=false}={}){
      if(!this.isFrameSource())return;
      const index=this.framePreviewId?this.frames.findIndex(f=>f.id===this.framePreviewId):Math.round(this.cursor*(this.timelineFps||12));
      const fps=Math.max(1,Math.min(60,+value||12));this.q('sequence-fps').value=fps;this.q('timeline-fps').value=fps;
      if(uniform)for(const frame of this.frames)frame.durationMs=1000/fps;
      this.syncFrameTimeline();this.cursor=this.timelineModel().start(Math.max(0,index));this.batchRange={start:0,end:this.duration};this.timelineView=null;this.renderMarkers();this.renderTime();
      if(this.playTimer){this.stopSequence();this.playSequence();}this.changed();
    }
    syncFrameTimeline(){
      if(!this.isFrameSource())return;
      const model=this.timelineModel();this.timelineFps=model.fps;this.duration=model.duration;this.q('timeline-fps').value=model.fps;
      this.frames.forEach((frame,index)=>{frame.time=model.start(index);frame.duration=model.interval(index).duration;});
      this.cursor=model.snap(this.cursor);
      if(!this.batchRange||this.batchRange.end>this.duration||(this.duration>0&&this.batchRange.end<=this.batchRange.start))this.batchRange={start:0,end:this.duration};
    }
    previewFramesAt(value,{playing=false}={}){
      if(!this.frames.length)return;if(!playing)this.stopSequence();
      this.cursor=this.snapTime(value);const frame=this.frames[this.frameIndex(this.cursor)];if(!frame)return;
      this.framePreviewId=frame.id;if(!playing)this.options?.onSourcePreview?.(this);
      this.q('image-preview').src=frame.url;this.q('preview-title').textContent=(playing?'播放中':'画面预览')+' · '+this.frameLabel(frame);
      this.renderTime();
    }
    frameIndex(value){return this.timelineModel().indexAt(value);}
    snapTime(value){return this.timelineModel().snap(value);}
    stepTime(value,direction){return this.timelineModel().step(value,direction);}
    stepPreview(direction){
      if(this.isFrameSource()){this.setCursor(this.stepTime(this.cursor,direction));return;}if(this.kind!=='video'||this.rateBlocked||this.batch||!this.duration||this.video.readyState<2||this.video.error)return;
      const time=this.stepTime(this.cursor,direction),view=this.getView();
      if(time<view.start||time>=view.start+view.span){const start=time<view.start?time:time-view.span+Math.min(view.span*.1,1/validFps(this.timelineFps));this.timelineView=MotionTimeline.view(this.duration,start,view.span);this.renderMarkers();}
      this.setCursor(time);this.action('motion.step_preview',{direction,time});
    }
    updateStepControls(){const ready=this.isFrameSource()?this.frames.length>0:this.kind==='video'&&this.duration>0&&this.video.readyState>=2&&!this.video.error&&!this.rateBlocked&&!this.batch;
      for(const [action,direction] of [['step-back',-1],['step-forward',1]]){const button=this.host.querySelector('[data-mi-action="'+action+'"]');if(button)button.disabled=!ready||Math.abs(this.stepTime(this.cursor,direction)-this.snapTime(this.cursor))<1e-9;}
    }
    setCursor(value){return this.sourceAdapter().preview(this,value);}
    previewVideoAt(value){if(this.rateBlocked||this.batch||!this.duration)return;this.options?.onSourcePreview?.(this);this.video.pause();this.cursor=this.snapTime(value);this.renderTime();const epoch=this.epoch;this.previewRequest={time:this.cursor,epoch};
      if(this.previewJob?.epoch===epoch)return this.previewJob.promise;
      const job={epoch};this.previewJob=job;
      job.promise=this.enqueue(async()=>{while(this.previewRequest?.epoch===epoch&&this.epoch===epoch){const request=this.previewRequest;this.previewRequest=null;await this.seek(request.time);}},{preview:true}).finally(()=>{if(this.previewJob===job)this.previewJob=null;});return job.promise;
    }

    frameAt(time,exceptId=null){const index=this.frameIndex(time);return this.frames.find(f=>f.kind==='video'&&f.id!==exceptId&&(this.frameIndex(f.time)===index||(f.pending&&Number.isFinite(f.committedTime)&&this.frameIndex(f.committedTime)===index)));}
    async capture(value=this.cursor){if(this.rateBlocked)return this.message('请先等待帧率识别，或手动设置帧率。');if(!this.duration||this.video.readyState<1||!this.video.videoWidth||this.video.error)return this.message('请等视频读取完成。');if(this.batch)return;const time=this.snapTime(value);this.video.pause();
      return this.enqueue(async epoch=>{let existing=this.frameAt(time);if(existing){this.select(existing.id);this.message('此位置已有采样帧，已选中，不重复添加。');return;}
        if(this.frames.length>=MAX_FRAMES)return this.message('最多保留 200 个选帧。');await this.seek(time);const image=await this.raster(this.video,this.video.videoWidth,this.video.videoHeight);if(epoch!==this.epoch){this.release(image.url);return;}
        existing=this.frameAt(time);if(existing){this.release(image.url);this.select(existing.id);this.message('此位置已有采样帧，未重复添加。');return;}
        const frame={...image,id:this.newId(),kind:'video',name:'视频帧 '+fmt(time),time,locator:this.videoLocator(time)};this.frames.push(frame);this.selected=frame.id;this.selectionIds=[frame.id];this.renderFrames();this.changed();this.action('motion.capture',{sourceName:this.sourceName,time,width:frame.width,height:frame.height});
      });
    }

    retime(id,value){const frame=this.frames.find(f=>f.id===id);if(this.rateBlocked||this.batch||!frame||frame.kind!=='video'||!this.duration)return;const time=this.snapTime(value);if(this.frameAt(time,id)){this.renderFrames();this.setCursor(frame.time);this.message('目标位置已有采样帧，不能重叠放置。');return;}const oldTime=frame.committedTime??frame.time,version=(frame.version||0)+1;frame.version=version;frame.committedTime=oldTime;frame.time=time;this.previewRequest=null;frame.pending=true;this.sortVideoFrames();this.cursor=time;this.video.pause();this.renderFrames();this.renderTime();this.enqueue(async epoch=>{try{await this.seek(time);const image=await this.raster(this.video,this.video.videoWidth,this.video.videoHeight);if(epoch!==this.epoch||!this.frames.includes(frame)||frame.version!==version){this.release(image.url);return;}this.release(frame.url);Object.assign(frame,image,{name:'视频帧 '+fmt(time),committedTime:time,locator:this.videoLocator(time),pending:false});this.renderFrames();this.changed();this.action('motion.retime',{frameId:id,time,frameIds:this.frames.map(f=>f.id)});}catch(e){if(this.frames.includes(frame)&&frame.version===version){frame.time=oldTime;frame.pending=false;this.sortVideoFrames();this.renderFrames();}throw e;}});}
    async batchAdd(){
      if(this.rateBlocked||this.batch||this.pending>(this.previewPending||0)||!this.duration||this.video.readyState<1||!this.video.videoWidth||this.video.error)return;
      let times,requested;const mode=this.q('batch-mode').value,range=this.getBatchRange();
      try{const raw=MotionTimeline.sampleTimes(this.duration,range.start,range.end,mode,+this.q('batch-value').value,MAX_FRAMES).map(time=>{let snapped=this.snapTime(time);if(snapped>=range.end)snapped=this.stepTime(range.end,-1);return Math.max(range.start,snapped);});requested=raw.length;const seen=new Set();times=raw.filter(time=>{const index=this.frameIndex(time);if(seen.has(index)||this.frameAt(time))return false;seen.add(index);return true;});if(times.length>MAX_FRAMES-this.frames.length)throw Error('新增帧超过剩余容量，请减少采样数量。');}catch(e){return this.message(e.message);}
      const job={cancelled:false,done:0,skipped:requested-times.length};if(!times.length){this.message('所选位置已有采样帧，未重复添加。');this.action('motion.batch_add',{mode,requested,added:0,skipped:job.skipped});return;}
      this.batch=job;this.video.pause();this.video.controls=false;
      await this.enqueue(async epoch=>{for(const time of times){if(job.cancelled||epoch!==this.epoch)break;if(this.frameAt(time)){job.skipped++;continue;}await this.seek(time);if(job.cancelled||epoch!==this.epoch)break;
        const image=await this.raster(this.video,this.video.videoWidth,this.video.videoHeight);if(job.cancelled||epoch!==this.epoch){this.release(image.url);break;}if(this.frameAt(time)){this.release(image.url);job.skipped++;continue;}
        const frame={...image,id:this.newId(),kind:'video',name:'视频帧 '+fmt(time),time,locator:this.videoLocator(time)};this.frames.push(frame);this.selected=frame.id;this.selectionIds=[frame.id];this.cursor=time;job.done++;this.renderFrames();this.renderTime();this.changed();this.q('video-status').textContent='正在添加 '+job.done+' / '+times.length;
      }});
      if(this.batch===job){this.batch=null;this.video.controls=true;this.updateControls();if(this.kind==='video')this.message((job.cancelled?'已停止，保留':'已添加')+' '+job.done+' 帧'+(job.skipped?'，跳过 '+job.skipped+' 个重复位置。':'。'));this.action('motion.batch_add',{mode,requested,added:job.done,skipped:job.skipped,cancelled:job.cancelled});}
    }

    renderTime(){const t=clampTime(this.cursor,this.duration);this.q('cursor-label').textContent=this.rateBlocked?'当前位置 '+t.toFixed(3)+'s · 帧率待确认':'帧 '+this.frameIndex(t)+' · '+this.snapTime(t).toFixed(3)+'s / '+fmt(this.duration);if(document.activeElement!==this.q('add-time'))this.q('add-time').value=t.toFixed(3);this.renderPlayhead();this.updateStepControls();}
    updateControls(){const busy=this.pending>(this.previewPending||0);this.updateStepControls();this.host.querySelector('[data-mi-action="batch-full"]').disabled=!this.duration||!!this.batch;for(const mode of ['step','count'])this.host.querySelector('[data-mi-action="batch-mode-'+mode+'"]').disabled=!!this.batch;this.q('batch-value').disabled=!!this.batch;const ready=this.kind==='video'&&this.duration>0&&this.video.readyState>=1&&this.video.videoWidth>0&&!this.video.error;for(const action of ['capture','batch-add'])this.host.querySelector('[data-mi-action="'+action+'"]').disabled=!ready||busy||!!this.batch||!!this.rateBlocked;this.q('video-status').textContent=this.autoFpsPending?'正在识别视频帧率…':this.rateBlocked?'请填写帧率后选帧':busy?'正在读取视频画面…':ready?'可选帧 · '+this.video.videoWidth+' × '+this.video.videoHeight:'等待读取视频';this.video.controls=!busy&&!this.batch;if(this.options?.onSelection)this.options.onSelection(this);}
    render(){this.renderRateStatus();this.updateInspector();this.q('video-section').hidden=this.kind!=='video'&&!(this.isFrameSource()&&this.frames.length);this.q('video-section').classList.toggle('frame-source-timeline',this.isFrameSource());this.q('timeline-title').textContent='动作采样时间轴';this.q('timeline-fps').max=this.isFrameSource()?60:240;this.q('animation-controls').hidden=!this.isFrameSource();this.q('sheet-section').hidden=this.kind!=='sheet';this.q('image-section').hidden=this.kind==='video'||!this.frames.length;this.q('source-label').textContent=this.sourceName||'尚未导入动作素材';this.q('restore').hidden=!this.savedPlan;if(this.savedPlan)this.q('restore').textContent='配置中保存了 '+this.savedPlan.frames.length+' 个动作帧记录（'+this.savedPlan.sourceName+'）。文件内容未保存，请重新导入素材后选帧。';this.renderFrames();this.updateControls();this.renderTime();}
    sortVideoFrames(){if(this.kind==='video')this.frames.sort((a,b)=>a.time-b.time);}
    highlightSameFrames(id,anchor=null){
      const frame=this.frames.find(f=>f.id===id),matches=new Set(matchingSequenceIds(this.frames,id));this.hoverFrameId=frame?.id||null;
      for(const name of ['frames','points']){const list=this.q(name);list.classList?.toggle('hover-group-active',!!frame);for(const card of list.children||[])card.classList.toggle('same-content-hover',matches.has(card.dataset.frameId||card.dataset.marker));}
      if(!frame||!anchor){if(this.frameHoverTooltip)this.frameHoverTooltip.hidden=true;return;}
      if(!this.frameHoverTooltip){const tip=document.createElement('div');tip.className='mi-frame-hover-preview';tip.setAttribute('role','tooltip');const image=document.createElement('img'),caption=document.createElement('div');tip.append(image,caption);document.body.append(tip);this.frameHoverTooltip=tip;}
      const tip=this.frameHoverTooltip,index=this.frames.indexOf(frame);tip.children[0].src=frame.url;tip.children[0].alt=this.frameLabel(frame)+' 缩略图';tip.children[1].textContent=this.frameLabel(frame)+' · '+fmt(frame.time||0);tip.hidden=false;
      const rect=anchor.getBoundingClientRect(),width=tip.offsetWidth||180,height=tip.offsetHeight||190;
      tip.style.left=Math.max(8,Math.min((root.innerWidth||1024)-width-8,rect.left+rect.width/2-width/2))+'px';
      tip.style.top=Math.max(8,Math.min((root.innerHeight||768)-height-8,rect.top>=height+8?rect.top-height-8:rect.bottom+8))+'px';
    }
    renderFrames(){
      if(this.marqueeGesture||this.drag?.mode==='range'){this.frameRenderDeferred=true;return;}
      this.frameRenderDeferred=false;this.syncFrameTimeline();this.sortVideoFrames();this.reconcileSelection();this.updateInspector();this.q('frame-count').textContent=this.visibleFrames().length;
      const timingStatus=this.q('timing-status');if(timingStatus)timingStatus.textContent=this.frames.some(f=>f.durationMs>0)?'逐帧时长 · 共 '+this.duration.toFixed(3)+' 秒':'默认帧率 · 共 '+this.duration.toFixed(3)+' 秒';
      const list=this.q('frames'),sortButton=this.host.querySelector('[data-mi-action="toggle-sort"]');sortButton.hidden=this.kind==='video'||this.frames.length<2;sortButton.textContent=this.frameSortMode?'完成排序':'调整图片顺序';sortButton.setAttribute('aria-pressed',String(!!this.frameSortMode));
      const grid=this.frameLayout==='grid',displayButton=this.host.querySelector('[data-mi-action="toggle-frame-layout"]');list.classList.toggle('multi-line',grid);displayButton.textContent=grid?'多行显示':'单行显示';displayButton.setAttribute('aria-pressed',String(grid));displayButton.title=grid?'切换为单行横向滚动':'切换为多行自动换行';displayButton.setAttribute('aria-label',(grid?'当前多行，':'当前单行，')+displayButton.title);list.classList.toggle('sort-mode',!!this.frameSortMode);this.q('frame-hint').textContent=this.frameSortMode?'拖动卡片调整顺序；完成后返回框选':(this.isFrameSource()?'仅显示不同画面 · 时间轴保留全部播放位置':'拖动框选 · Ctrl 追加 · Shift 连选');list.replaceChildren();list.onpointerleave=()=>this.highlightSameFrames(null);
      if(!this.frames.length){const empty=document.createElement('div');empty.className='empty-state';empty.textContent='导入动作素材后，在此框选需要处理的帧。';list.append(empty);}
      const identities=frameIdentityMap(this.frames);this.visibleFrames().forEach((f,i)=>{const identity=identities.get(f.id);const card=document.createElement('article');card.className='mi-frame'+(this.selectionIds.includes(f.id)?' selected':'')+(identity.duplicate?' duplicate':'')+(f.redraw?' redraw':'');card.draggable=!!this.frameSortMode&&this.kind!=='video';card.dataset.frameId=f.id;card.onpointerenter=()=>this.highlightSameFrames(f.id);card.onpointerleave=()=>this.highlightSameFrames(null);card.setAttribute('role','option');card.setAttribute('aria-selected',String(this.selectionIds.includes(f.id)));card.setAttribute('aria-label',this.frameLabel(f)+'，'+f.name+(f.redraw?'，需要重绘':''));
        const image=document.createElement('img');image.src=f.url;image.alt=this.frameLabel(f)+' '+f.name;image.loading='lazy';image.draggable=false;
        const title=document.createElement('div');title.className='mi-frame-title';title.textContent=String(identity.number).padStart(2,'0')+' · '+f.name;title.title=this.frameLabel(f)+' · '+f.name+(identity.duplicate?' · 相同画面，默认不选中；可手动选择':'');card.append(image,title);list.append(card);
      });
      this.renderMarkers();this.q('image-section').hidden=this.kind==='video'||!this.frames.length;
      if(this.kind!=='video'&&this.frames.length){const selected=this.frames.find(f=>f.id===(this.framePreviewId||this.selected));if(selected)this.q('image-preview').src=selected.url;}
    }

    getView(){return MotionTimeline.view(this.duration,this.timelineView?.start||0,this.timelineView?.span||this.duration);}
    pointTime(e,snap=false){const rect=this.q('markers').getBoundingClientRect(),v=this.getView();let t=v.start+(e.clientX-rect.left)/Math.max(1,rect.width)*v.span;return clampTime(t,this.duration);}
    getBatchRange(){const range=this.batchRange||{start:0,end:this.duration};return {start:Math.max(0,Math.min(this.duration,range.start)),end:Math.max(0,Math.min(this.duration,range.end))};}
    selectBatchRange(base=[],additive=false,primary=this.selected){const range=this.getBatchRange(),ids=new Set(additive?base:[]);for(const frame of this.frames)if((frame.kind==='video'||this.isFrameSource())&&frame.time>=range.start&&frame.time<range.end)ids.add(frame.id);this.selectionIds=this.frames.filter(frame=>ids.has(frame.id)).map(frame=>frame.id);this.selected=this.selectionIds.includes(primary)?primary:this.selectionIds[0]||null;}
    setBatchRange(a,b,notify=true){if(!this.duration)return;const low=Math.max(0,Math.min(a,b)),high=Math.min(this.duration,Math.max(a,b));let start=this.snapTime(low),end=high>=this.duration-1e-7?this.duration:this.snapTime(high);if(end<=start){end=this.stepTime(start,1);if(end<=start)end=this.duration;}this.batchRange={start,end};this.renderBatchRange();if(notify){this.changed();this.action('motion.batch_range',this.batchRange);}}
    renderBatchRange(){const range=this.getBatchRange(),v=this.getView(),highlight=this.q('batch-range-highlight');const left=Math.max(v.start,range.start),right=Math.min(v.start+v.span,range.end);highlight.hidden=!this.duration||right<=left;highlight.style.left=((left-v.start)/v.span*100)+'%';highlight.style.width=(Math.max(0,right-left)/v.span*100)+'%';this.q('batch-range-label').textContent=this.duration?range.start.toFixed(3)+' — '+range.end.toFixed(3)+' 秒':'未选择范围';}
    renderPlayhead(){const v=this.getView(),head=this.q('playhead'),left=(this.cursor-v.start)/v.span*100;head.hidden=left<0||left>100;head.style.left=left+'%';}
    renderMarkers(){if(['key','box'].includes(this.drag?.mode))return;if(this.hoverFrameId)this.highlightSameFrames(null);const focusId=document.activeElement?.dataset?.marker;const rail=this.q('points'),ruler=this.q('ticks'),v=this.getView();rail.replaceChildren();ruler.replaceChildren();this.q('visible-time').textContent=fmt(v.start)+' — '+fmt(v.start+v.span);const pan=this.q('time-pan');if(typeof WorkbenchControls!=='undefined')WorkbenchControls.syncScrollbar(pan,{duration:this.duration,start:v.start,span:v.span},start=>{this.timelineView=MotionTimeline.view(this.duration,start,this.getView().span);this.renderMarkers();});this.renderPlayhead();this.renderBatchRange();if(!this.duration)return;
      for(const tick of MotionTimeline.ticks(v)){const el=document.createElement('span');el.className='mi-tick';el.style.left=tick.left+'%';el.textContent=tick.time.toFixed(v.span<1?3:2)+'s';ruler.append(el);}
      const identities=frameIdentityMap(this.frames);this.frames.forEach((f,i)=>{const identity=identities.get(f.id);if(!['video','image','sheet'].includes(f.kind))return;const left=(f.time-v.start)/v.span*100;if(left<0||left>100)return;const b=document.createElement('button');b.className='mi-marker'+((this.selectionIds||[]).includes(f.id)?' selected':'')+(f.redraw?' redraw':'')+(identity.duplicate?' duplicate':'');const number=document.createElement('span');number.textContent=String(identity.number);number.style.cssText='display:block;transform:rotate(-45deg)';b.append(number);b.dataset.marker=f.id;b.onpointerenter=()=>this.highlightSameFrames(f.id,b);b.onpointerleave=()=>this.highlightSameFrames(null);b.style.left=left+'%';b.title=this.frameLabel(f)+' · '+fmt(f.time)+(this.sourceAdapter().editableFrames?'；拖动调整采样时间':'；点击选择，拖动播放头预览');b.setAttribute('aria-label',b.title);b.setAttribute('aria-selected',String((this.selectionIds||[]).includes(f.id)));b.onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();if(this.sourceAdapter().editableFrames)this.retime(f.id,this.stepTime(f.time,e.key==='ArrowRight'?1:-1));else this.stepPreview(e.key==='ArrowRight'?1:-1);}};rail.append(b);});if(focusId)Array.from(rail.children).find(b=>b.dataset.marker===focusId)?.focus({preventScroll:true});}
    reconcileSelection(){const state=FrameSelection.reconcile(this.frames,this.selected,this.selectionIds||[]);this.selected=state.primaryId;this.selectionIds=state.selectedIds;}
    select(id,options={}){this.stopSequence();if(!this.frames.some(f=>f.id===id))return;const state=FrameSelection.choose(options.visibleOnly?this.visibleFrames():this.frames,this.selected,this.selectionIds||[],id,options);this.selected=state.primaryId;this.selectionIds=state.selectedIds;if(this.isFrameSource())this.framePreviewId=id;this.renderFrames();const f=this.frames.find(f=>f.id===this.selected);if(f?.kind==='video'||this.isFrameSource()&&f)this.setCursor(f.time);}
    markSelected(value){if(this.batch)return;this.stopSequence();FrameSelection.mark(this.frames,this.selectionIds||[],value);this.renderFrames();this.changed();this.action('pose.mark',{frameIds:this.selectionIds,redraw:value});}
    clearSelection(){if(this.cancelTimelineGesture)this.cancelTimelineGesture();if(this.cancelMarquee)this.cancelMarquee();this.selected=null;this.selectionIds=[];this.renderFrames();this.action('motion.clear_selection',{frameCount:this.frames.length});}
    removeSelected(){if(this.batch)return;this.stopSequence();const ids=new Set(this.selectionIds||[]);for(const f of this.frames)if(ids.has(f.id)&&!this.frames.some(other=>!ids.has(other.id)&&other.url===f.url))this.release(f.url);this.frames=this.frames.filter(f=>!ids.has(f.id));this.reconcileSelection();this.renderFrames();this.changed();this.action('motion.remove',{frameIds:[...ids]});}
    move(id,target,after){if(this.kind==='video')return;this.stopSequence();this.frames=reorder(this.frames,id,target,after);this.renderFrames();this.changed();this.action('motion.reorder',{frameIds:this.frames.map(f=>f.id)});}
    toggleFrameLayout(){if(this.cancelMarquee)this.cancelMarquee();this.frameLayout=this.frameLayout==='grid'?'row':'grid';const list=this.q('frames');list.scrollLeft=0;list.scrollTop=0;this.renderFrames();this.changed();this.action('motion.frame_layout',{mode:this.frameLayout});}
    bindMarquee(){FrameMarquee.attach(this);}
    bindDrag(){const list=this.q('frames');list.addEventListener('dragstart',e=>{if(!this.frameSortMode||this.kind==='video'){e.preventDefault();return;}if(e.target.closest('input,button')){e.preventDefault();return;}const c=e.target.closest('[data-frame-id]');if(!c)return;this.dragId=c.dataset.frameId;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',this.dragId);});list.addEventListener('dragover',e=>{const c=e.target.closest('[data-frame-id]');if(!c||!this.dragId)return;e.preventDefault();for(const x of list.children)x.classList.remove('drop-before','drop-after');const rect=c.getBoundingClientRect();c.classList.add(e.clientX>rect.left+rect.width/2?'drop-after':'drop-before');});list.addEventListener('drop',e=>{const c=e.target.closest('[data-frame-id]');if(!c||!this.dragId)return;e.preventDefault();const rect=c.getBoundingClientRect();this.move(this.dragId,c.dataset.frameId,e.clientX>rect.left+rect.width/2);this.dragId=null;});list.addEventListener('dragend',()=>{this.dragId=null;for(const x of list.children)x.classList.remove('drop-before','drop-after');});}
    bindMarkers(){
      const rail=this.q('markers');rail.addEventListener('pointerleave',()=>this.highlightSameFrames(null));let edgeRaf=null,edgeLast=null;
      const stopEdge=()=>{if(edgeRaf!==null&&typeof cancelAnimationFrame!=='undefined')cancelAnimationFrame(edgeRaf);edgeRaf=null;edgeLast=null;};
      const seekPoint=x=>{const r=rail.getBoundingClientRect();return this.pointTime({clientX:Math.max(r.left,Math.min(r.left+r.width,x))});};
      const edgeTick=now=>{edgeRaf=null;const d=this.drag;if(!d||d.mode!=='seek'||d.epoch!==this.epoch){stopEdge();return;}
        const r=rail.getBoundingClientRect(),current=this.getView(),next=MotionTimeline.edgePan(this.duration,current,d.lastX-r.left,r.width,edgeLast===null?16:now-edgeLast);edgeLast=now;
        if(next.start!==current.start){this.timelineView=next;this.renderMarkers();this.setCursor(seekPoint(d.lastX));}
        const edge=Math.min(32,r.width/4),local=d.lastX-r.left;if(next.start!==current.start&&(local<edge||local>r.width-edge))edgeRaf=requestAnimationFrame(edgeTick);else stopEdge();
      };
      const updateEdge=()=>{if(typeof requestAnimationFrame==='undefined')return;const d=this.drag,r=rail.getBoundingClientRect(),edge=Math.min(32,r.width/4),local=d.lastX-r.left;
        if(local<edge||local>r.width-edge){if(edgeRaf===null)edgeRaf=requestAnimationFrame(edgeTick);}else stopEdge();
      };
      const rulerHeight=()=>this.q('ticks').clientHeight||32;
      const syncSelection=()=>{this.updateInspector();for(const point of this.q('points').children){const chosen=(this.selectionIds||[]).includes(point.dataset.marker);point.classList.toggle('selected',chosen);point.setAttribute?.('aria-selected',String(chosen));}for(const card of this.q('frames').children||[]){if(!card.dataset.frameId)continue;const chosen=(this.selectionIds||[]).includes(card.dataset.frameId);card.classList.toggle('selected',chosen);card.setAttribute('aria-selected',String(chosen));}};
      const paintRange=(e,d=this.drag)=>{if(!d||d.mode!=='range')return;if(!d.moved&&Math.abs(e.clientX-d.x)<4)return;d.moved=true;const r=rail.getBoundingClientRect(),raw=this.getView().start+(e.clientX-r.left)/Math.max(1,r.width)*this.getView().span;this.setBatchRange(d.rangeAnchor,raw,false);this.selectBatchRange(d.base,d.additive,d.primary);syncSelection();this.setCursor(raw);};
      const moveKey=e=>{const d=this.drag;d.time=this.snapTime(d.original+(e.clientX-d.x)/d.width*d.span);const point=Array.from(this.q('points').children).find(b=>b.dataset.marker===d.id);if(point){const v=this.getView();point.style.left=(d.time-v.start)/v.span*100+'%';point.title=fmt(d.time);}this.cursor=d.time;this.renderTime();if(d.previewTime!==d.time){d.previewTime=d.time;this.setCursor(d.time);}};
      const finish=(e,cancelled=false)=>{
        const d=this.drag;if(!d||e&&e.pointerId!==d.pointerId)return;
        stopEdge();this.drag=null;if(rail.hasPointerCapture(d.pointerId))rail.releasePointerCapture(d.pointerId);
        if(d.epoch!==this.epoch)return;
        if(cancelled){if(d.mode==='range'){this.batchRange=d.oldRange;this.renderBatchRange();}if(d.mode==='seek')this.timelineView=MotionTimeline.view(this.duration,d.start,d.span);const state=FrameSelection.reconcile(this.frames,d.primary,d.base);this.selected=state.primaryId;this.selectionIds=state.selectedIds;this.setCursor(d.oldCursor);this.renderFrames();this.renderTime();return;}
        if(d.mode==='range'){if(e)paintRange(e,d);if(d.moved){this.renderFrames();this.changed();this.action('motion.batch_range',this.getBatchRange());this.action('motion.select',{method:'timeline_range',frameIds:this.selectionIds});}else if(e)this.setCursor(this.pointTime(e));this.renderBatchRange();}else if(d.mode==='selection'){this.renderFrames();const frame=this.frames.find(f=>f.id===(this.isFrameSource()?d.id:this.selected));if(frame)this.setCursor(frame.time);}
        else if(d.mode==='seek'){if(e)this.setCursor(seekPoint(e.clientX));}
        else if(d.mode==='key'){if(Number.isFinite(e?.clientX))d.time=this.snapTime(d.original+(e.clientX-d.x)/d.width*d.span);if(Math.abs(d.time-d.original)>.00001)this.retime(d.id,d.time);else{const state=FrameSelection.choose(this.frames,d.primary,d.base,d.id,{toggle:true});this.selected=state.primaryId;this.selectionIds=state.selectedIds;this.renderFrames();this.setCursor(d.time);}}
      };
      rail.addEventListener('wheel',e=>{if(!this.duration)return;e.preventDefault();if(this.drag)return;const r=rail.getBoundingClientRect(),delta=e.deltaY||e.deltaX;this.timelineView=MotionTimeline.zoom(this.duration,this.getView(),Math.exp(Math.max(-1,Math.min(1,delta*.002))),(e.clientX-r.left)/Math.max(1,r.width));this.renderMarkers();},{passive:false});
      rail.addEventListener('dblclick',e=>{if(this.rateBlocked||this.batch||!this.duration||e.target.closest('[data-marker]')||e.clientY-rail.getBoundingClientRect().top<rulerHeight())return;this.setCursor(this.pointTime(e,true));if(this.kind==='video')this.capture();});
      rail.addEventListener('pointerdown',e=>{
        if(this.drag||this.marqueeGesture||this.rateBlocked||this.batch||!this.duration||![0,1].includes(e.button))return;
        e.preventDefault();this.video.pause();if(this.isFrameSource())this.stopSequence();rail.focus?.({preventScroll:true});
        const button=e.target.closest('[data-marker]'),frame=button&&this.frames.find(f=>f.id===button.dataset.marker),v=this.getView(),rect=rail.getBoundingClientRect();
        const handle=e.target.closest('[data-playhead-handle]');const mode=e.button===1||e.altKey?'pan':frame?'key':handle?.dataset?.playheadHandle?'seek':'range';
        const d={mode,epoch:this.epoch,id:frame?.id,time:frame?.time,original:frame?.time,oldCursor:this.cursor,oldRange:{...this.getBatchRange()},pointerId:e.pointerId,x:e.clientX,y:e.clientY,lastX:e.clientX,start:v.start,span:v.span,width:Math.max(1,rect.width),primary:this.selected,base:[...(this.selectionIds||[])],additive:true,moved:false};
        this.drag=d;rail.setPointerCapture(e.pointerId);
        if(frame&&this.isFrameSource()&&mode==='key'){
          const state=FrameSelection.choose(this.frames,this.selected,this.selectionIds||[],frame.id,{toggle:true,range:e.shiftKey});this.selected=state.primaryId;this.selectionIds=state.selectedIds;d.mode='selection';syncSelection();this.setCursor(frame.time);return;
        }
        if(mode==='range'){d.rangeAnchor=Math.max(0,Math.min(this.duration,v.start+(e.clientX-rect.left)/Math.max(1,rect.width)*v.span));}
        else if(frame&&mode==='key'){const state=FrameSelection.choose(this.frames,this.selected,this.selectionIds||[],frame.id,{toggle:true,range:e.shiftKey});if(e.ctrlKey||e.metaKey||e.shiftKey){this.selected=state.primaryId;this.selectionIds=state.selectedIds;d.mode='selection';}else{this.selected=frame.id;this.selectionIds=Array.from(new Set([...d.base,frame.id]));}syncSelection();this.setCursor(frame.time);}
        else if(mode==='seek')this.setCursor(this.pointTime(e));
      });
      rail.addEventListener('pointermove',e=>{const d=this.drag;if(!d||e.pointerId!==d.pointerId)return;if(d.mode==='range')paintRange(e);else if(d.mode==='key')moveKey(e);else if(d.mode==='seek'){d.lastX=e.clientX;this.setCursor(seekPoint(e.clientX));if(Math.abs(e.clientX-d.x)>=3||edgeRaf!==null)updateEdge();}else if(d.mode==='pan'){this.timelineView=MotionTimeline.view(this.duration,d.start-(e.clientX-d.x)/Math.max(1,rail.clientWidth)*d.span,d.span);this.renderMarkers();}});
      rail.addEventListener('pointerup',e=>finish(e));rail.addEventListener('pointercancel',e=>finish(e,true));rail.addEventListener('lostpointercapture',e=>finish(e,true));
      rail.addEventListener('keydown',e=>{if(!this.drag&&e.target?.dataset?.playheadHandle&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();this.stepPreview(e.key==='ArrowRight'?1:-1);return;}if(e.key==='Escape'&&this.drag){e.preventDefault();finish(null,true);return;}if(!this.drag&&e.target===rail&&['ArrowLeft','ArrowRight'].includes(e.key)){const frame=this.frames.find(f=>f.id===this.selected);if(this.isFrameSource()){e.preventDefault();this.stepPreview(e.key==='ArrowRight'?1:-1);}else if(frame){e.preventDefault();this.retime(frame.id,this.stepTime(frame.time,e.key==='ArrowRight'?1:-1));}}});
      this.cancelTimelineGesture=()=>finish(null,true);
    }

    stopSequence(){if(this.playTimer)clearTimeout(this.playTimer);this.playTimer=null;const b=this.host.querySelector('[data-mi-action="play-sequence"]');if(b)b.textContent='播放帧序列';}
    playSequence(){if(this.playTimer){this.stopSequence();this.renderFrames();return;}if(!this.frames.length)return;this.host.querySelector('[data-mi-action="play-sequence"]').textContent='暂停帧序列';let i=Math.max(0,this.frames.findIndex(f=>f.id===(this.framePreviewId||this.selected)));const epoch=this.epoch;
      const schedule=()=>{const delay=this.timelineModel().interval(i).duration*1000;this.playTimer=setTimeout(()=>{if(epoch!==this.epoch||!this.frames.length){this.stopSequence();return;}i=(i+1)%this.frames.length;this.previewFramesAt(this.frames[i].time,{playing:true});schedule();},delay);};schedule();
    }
    pause(){this.video.pause();this.stopSequence();this.renderFrames();}
    openImportPicker(name){const input=this.q(name);const probe=root.WorkbenchPickerProbe;probe?.before();try{input.click();}finally{probe?.after();}}
    click(action,b){if(action==='import-animation')this.openImportPicker('animation-file');else if(action==='export-animation')this.exportAnimation();else if(action==='uniform-fps')this.setFrameRate(this.q('sequence-fps').value,{uniform:true});else if(action==='toggle-batch'){const panel=this.host.querySelector('.mi-batch');panel.open=!panel.open;b.setAttribute('aria-expanded',String(panel.open));this.action('motion.batch_options',{open:panel.open});}else if(action==='batch-mode-step'||action==='batch-mode-count'){this.q('batch-mode').value=action==='batch-mode-step'?'step':'count';this.q('batch-mode').onchange();}else if(action==='step-back')this.stepPreview(-1);else if(action==='step-forward')this.stepPreview(1);else if(action==='toggle-frame-layout')this.toggleFrameLayout();else if(action==='toggle-sort'){if(this.kind==='video')return;this.frameSortMode=!this.frameSortMode;this.renderFrames();this.action('motion.sort_mode',{enabled:this.frameSortMode});}else if(action==='detect-fps')this.detectFrameRate();else if(action==='mark-selected')this.markSelected(true);else if(action==='unmark-selected')this.markSelected(false);else if(action==='remove-selected')this.removeSelected();else if(action==='select-all'){this.selectionIds=this.visibleFrames().map(f=>f.id);this.selected=this.selectionIds.includes(this.selected)?this.selected:this.selectionIds[0]||null;this.renderFrames();}else if(action==='toggle-redraw'){const f=this.frames.find(f=>f.id===b.dataset.id);if(f){f.redraw=!f.redraw;this.renderFrames();this.changed();this.action('pose.mark',{frameId:f.id,redraw:f.redraw});}}else if(action==='fit-time'){this.timelineView=null;this.renderMarkers();}else if(action==='images')this.openImportPicker('images-file');else if(action==='sheet')this.openImportPicker('sheet-file');else if(action==='video')this.openImportPicker('video-file');else if(action==='sample')this.loadSample();else if(action==='capture')this.capture(+this.q('add-time').value);else if(action==='batch-add')this.batchAdd();else if(action==='batch-full'){this.batchRange={start:0,end:this.duration};this.selectBatchRange();this.renderFrames();this.renderBatchRange();this.changed();this.action('motion.batch_range',this.batchRange);this.action('motion.select',{method:'timeline_range',frameIds:this.selectionIds});}else if(action==='split')this.splitSheet();else if(action==='clear'||action==='clear-selection')this.clearSelection();else if(action==='play-sequence'){this.playSequence();this.action('motion.preview_sequence',{playing:!!this.playTimer,fps:+this.q('sequence-fps').value});}else if(action==='remove'){this.stopSequence();const f=this.frames.find(x=>x.id===b.dataset.id);if(f&&!this.frames.some(other=>other.id!==f.id&&other.url===f.url))this.release(f.url);this.frames=this.frames.filter(x=>x.id!==b.dataset.id);this.renderFrames();this.changed();this.action('motion.remove',{frameId:b.dataset.id});}else if(action==='previous'||action==='next'){const i=this.frames.findIndex(f=>f.id===b.dataset.id),target=this.frames[i+(action==='previous'?-1:1)];if(target)this.move(b.dataset.id,target.id,action==='next');}}
  }
  const api={frameIdentityMap,cleanSheetSettings,inferSheetSettings,sourceAdapters,matchingSequenceIds,pixelFingerprint,imageFingerprint,uniqueSequenceSelection,Editor,SerialQueue,thumbnailSize,cleanSource,cleanLocator,clampTime,validFps,snapFrameTime,reorder,sortFiles,gridRects,cleanMetadata};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MotionInput=api;
})(typeof window!=='undefined'?window:globalThis);
