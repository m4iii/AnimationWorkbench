(function(){
 'use strict';
 const $=id=>document.getElementById(id),media=JSON.parse($('sample-media').textContent),features=JSON.parse($('function-map').textContent);
 const storageKey='animation-workbench-ui-v2',legacyKey='animation-workbench-ui-v1';
 const initial={project:'AnimationWorkbench',instructions:'保持角色身份与指定画风；依据动作帧重绘。仅生成无武器人物。',draft:'',executionModel:'',executionEffort:'',batchConcurrency:1,promptMode:'new',promptSession:'',imageMode:'new',imageSession:'',anchor:{x:55,y:45},feedback:{},motionInput:null};
 let config=structuredClone(initial),editor=null,ready=false,toastTimer,referenceRole='character',candidateTarget=null,viewer='source',lastPrimary=null,lastPromptOwner=null,lastLoadedPrompt=null,lastPreviewId=null,lastPreviewEpoch=null;
 const refs={},candidates=new Map(),logs=[];
 const backend=new WorkbenchBackend.Client();let backendBusy=false,activeJob=null,undoPrompt=null;
 const taskPanel=new WorkbenchTasks.Panel(backend);
 let workspaceStore=null,workspaceJobs=[],recoveringJobs=false,workspaceEpoch=null;const workspaceBlobs=new Map();
 function cacheChanged(){if(editor&&workspaceEpoch!==editor.epoch){if(workspaceEpoch!==null&&!workspaceStore?.restoring)workspaceJobs=[];workspaceEpoch=editor.epoch;}workspaceStore?.changed();}
 function normalize(v){const out=structuredClone(initial);for(const key of ['project','instructions','draft','promptSession','imageSession'])if(typeof v?.[key]==='string')out[key]=v[key].slice(0,20000);for(const key of ['promptMode','imageMode'])if(['new','resume'].includes(v?.[key]))out[key]=v[key];if(['','gpt-6.1-sol','gpt-6-astra','gpt-6-sol','gpt-6-luna'].includes(v?.executionModel))out.executionModel=v.executionModel;if(['','low','medium','high','xhigh','max'].includes(v?.executionEffort))out.executionEffort=v.executionEffort;if(Number.isSafeInteger(v?.batchConcurrency)&&v.batchConcurrency>=1)out.batchConcurrency=v.batchConcurrency;for(const key of ['x','y'])out.anchor[key]=Math.max(0,Math.min(100,Number(v?.anchor?.[key])||0));out.motionInput=MotionInput.cleanMetadata(v?.motionInput);if(v?.feedback&&typeof v.feedback==='object')out.feedback=v.feedback;return out;}
 try{const raw=localStorage.getItem(storageKey)||localStorage.getItem(legacyKey);if(raw)config=normalize(JSON.parse(raw));}catch(e){}
 function toast(text){clearTimeout(toastTimer);$('toast').textContent=text;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,4500);}
 function open(id){$('more-menu').open=false;$(id).showModal();}
 function record(id,payload={},local=false){const feature=features.find(f=>f.id===id);const entry={time:new Date().toLocaleTimeString('zh-CN'),functionId:id,operation:feature?.label||id,executionScope:payload.backendAccepted?'backend_task':local?'browser_only':'simulation',backendExecuted:false,payload};$('request-json').textContent=JSON.stringify(entry,null,2);logs.push(entry);if(logs.length>100)logs.shift();$('logs').textContent=logs.map(l=>l.time+' '+l.operation+' · '+(l.executionScope==='browser_only'?'本页完成':l.executionScope==='backend_task'?'后端任务':'模拟请求')).join('\n');}
 function snapshot(){return {...config,version:2,prototype:true,motionInput:editor.metadata(),references:Object.fromEntries(Object.entries(refs).map(([role,r])=>[role,{name:r.name,note:'文件内容未保存'}]))};}
 function save(silent=false){try{localStorage.setItem(storageKey,JSON.stringify(snapshot()));if(!silent)toast('草稿已保存；图片和视频需在下次打开时重新选择。');}catch(e){if(!silent)toast('浏览器无法保存，请导出配置 JSON。');}}
 function download(name,value){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

 async function storeURL(url,name){let blob=workspaceBlobs.get(url);if(!blob){blob=await backend.localBlob(url);workspaceBlobs.set(url,blob);}return (await backend.upload(blob,name)).assetId;}
 async function captureWorkspace(){
  if(editor.pending||editor.batch)throw new Error('正在采样，完成后自动缓存');
  const motion=structuredClone(editor.metadata()),settings=structuredClone(config),files=new Map(editor.sourceFiles);
  const frames=editor.frames.map(f=>({id:f.id,url:f.url})),references=Object.entries(refs).map(([role,r])=>({role,...r}));
  const results=[...candidates].map(([frameId,list])=>({frameId,list:list.map(c=>({...c}))}));
  const layout=document.querySelector('.studio-layout');
  const state={selected:editor.selected,framePreviewId:editor.framePreviewId||null,selectionIds:[...editor.selectionIds],cursor:editor.cursor,viewer,previewId:lastPreviewId,activeSourceId:editor.activeSourceId,frameLayout:editor.frameLayout,timelineView:editor.timelineView,sourceFrameTimes:editor.sourceFrameTimes,batchRange:editor.batchRange,layout:Object.fromEntries(['left','right','bottom'].map(k=>[k,layout.style.getPropertyValue('--studio-'+k)])),workspaceJobs:structuredClone(workspaceJobs)};
  for(const source of motion.sources){const file=files.get(source.id);if(!file)throw new Error('原始素材未关联，请重新导入后保存');source.assetId=(await backend.upload(file,source.name)).assetId;}
  for(const frame of motion.frames){const item=frames.find(f=>f.id===frame.id);if(!item)throw new Error('当前帧尚未关联');frame.thumbnailAssetId=await storeURL(item.url,frame.name+'.png');}
  const referenceData=[];for(const ref of references){const assetId=ref.blob?(await backend.upload(ref.blob,ref.name)).assetId:await storeURL(ref.url,ref.name);referenceData.push({role:ref.role,name:ref.name,assetId});}
  const candidateData=[];for(const group of results){const list=[];for(const c of group.list)list.push({id:c.id,name:c.name,active:!!c.active,adopted:!!c.adopted,backend:!!c.backend,assetId:await storeURL(c.url,c.name)});candidateData.push({frameId:group.frameId,list});}
  delete settings.motionInput;
  return {schemaVersion:1,name:settings.project,config:settings,motion,references:referenceData,candidates:candidateData,state};
 }
 async function restoreWorkspace(saved){
  if(saved?.schemaVersion!==1||!saved.motion)throw new Error('工作区格式无效');
  const motion=MotionInput.cleanMetadata(saved.motion),state=saved.state||{};
  if(!motion)throw new Error('工作区帧信息无效');
  // Read all media before replacing the current workspace.
  const blobMap=new Map();const get=async id=>{if(!blobMap.has(id))blobMap.set(id,backend.asset(id));return blobMap.get(id);};
  const sourceData=[];for(const source of saved.motion.sources||[])sourceData.push({source,file:new File([await get(source.assetId)],source.name,{type:source.type||'application/octet-stream',lastModified:source.lastModified||0})});
  const frameData=[];for(const frame of saved.motion.frames||[])frameData.push({frame,blob:new Blob([await get(frame.thumbnailAssetId)],{type:'image/png'})});
  const refData=[];for(const ref of saved.references||[])refData.push({ref,blob:new Blob([await get(ref.assetId)],{type:'image/png'})});
  const resultData=[];for(const group of saved.candidates||[]){const list=[];for(const c of group.list)list.push({c,blob:new Blob([await get(c.assetId)],{type:'image/png'})});resultData.push({frameId:group.frameId,list});}
  ready=false;
  try{
   editor.reset(motion.kind||'sequence',false);
   for(const ref of Object.values(refs))if(ref.owned)URL.revokeObjectURL(ref.url);for(const role of Object.keys(refs))delete refs[role];
   for(const list of candidates.values())for(const c of list)URL.revokeObjectURL(c.url);candidates.clear();workspaceBlobs.clear();
   config=normalize(saved.config);editor.savedPlan=null;editor.sources=sourceData.map(x=>MotionInput.cleanSource(x.source));editor.sourceFiles=new Map(sourceData.map(x=>[x.source.id,x.file]));
   editor.sourceName=motion.sourceName;editor.activeSourceId=state.activeSourceId||editor.sources[0]?.id||null;
   editor.frames=frameData.map(({frame,blob})=>({...frame,url:editor.own(blob)}));
   editor.serial=Math.max(0,...editor.frames.map(f=>Number(f.id.match(/(\d+)$/)?.[1])||0));editor.sourceSerial=editor.sources.length;
   editor.q('sequence-fps').value=motion.previewFps||12;editor.timelineFps=motion.timelineFps||30;editor.q('timeline-fps').value=editor.timelineFps;editor.fpsInfo={...motion.frameRateInfo,status:motion.frameRateInfo?.status==='saved'?'manual':motion.frameRateInfo?.status||'manual',fps:editor.timelineFps};editor.rateBlocked=false;
   const sourceFile=editor.sourceFiles.get(editor.activeSourceId);
   if(editor.kind==='video'&&sourceFile){
    editor.sourceVideoBlob=sourceFile;editor.videoUrl=editor.own(sourceFile);
    await new Promise((resolve,reject)=>{const cleanup=()=>{clearTimeout(timer);editor.video.removeEventListener('loadeddata',done);editor.video.removeEventListener('error',failed);};const done=()=>{cleanup();resolve();};const failed=()=>{cleanup();reject(new Error('缓存视频无法解码'));};const timer=setTimeout(failed,20000);editor.video.addEventListener('loadeddata',done);editor.video.addEventListener('error',failed);editor.video.src=editor.videoUrl;editor.video.load();});
   }else if(editor.kind==='sheet'&&sourceFile){const image=new Image();image.src=editor.own(sourceFile);await image.decode();editor.sheet=image;editor.restoreSheetSettings(motion.sheetSettings||MotionInput.inferSheetSettings(motion.frames));editor.previewGrid();}
   editor.sourceFrameTimes=Array.isArray(state.sourceFrameTimes)?state.sourceFrameTimes:null;editor.batchRange=state.batchRange||motion.batchRange;editor.timelineView=state.timelineView||null;editor.frameLayout=state.frameLayout||motion.frameLayout;
   editor.framePreviewId=state.framePreviewId||null;editor.selected=state.selected||null;editor.selectionIds=Array.isArray(state.selectionIds)?state.selectionIds:[];editor.reconcileSelection();
   for(const {ref,blob} of refData)refs[ref.role]={name:ref.name,blob,url:URL.createObjectURL(blob),owned:true};
   for(const group of resultData)candidates.set(group.frameId,group.list.map(({c,blob})=>({...c,url:URL.createObjectURL(blob)})));
   viewer=state.viewer==='result'?'result':'source';lastPreviewEpoch=editor.epoch;lastPreviewId=state.previewId||null;lastPromptOwner=null;lastLoadedPrompt=null;comparisonKey=null;
   workspaceJobs=Array.isArray(state.workspaceJobs)?state.workspaceJobs:[];
   const layout=document.querySelector('.studio-layout');for(const [key,value] of Object.entries(state.layout||{}))if(['left','right','bottom'].includes(key)&&/^\d+(\.\d+)?px$/.test(value))layout.style.setProperty('--studio-'+key,value);
   editor.render();editor.setCursor(Number(state.cursor)||0);
  }finally{ready=true;renderConfig();renderContext(editor);}
 }
 async function recoverWorkspaceJobs(){
  if(!workspaceStore?.ready||workspaceStore.restoring||backendBusy||recoveringJobs)return;
  recoveringJobs=true;const epoch=editor.epoch;
  try{for(const saved of workspaceJobs.filter(x=>!x.done)){
   const job=await backend.job(saved.id);if(epoch!==editor.epoch)return;
   if(!['completed','partial','failed','cancelled'].includes(job.status))continue;
   for(const item of job.items.filter(i=>i.status==='completed')){
    const frame=editor.frames.find(f=>f.id===item.frameId);
    if(saved.kind==='generation'&&frame){const list=candidates.get(frame.id)||[];if(list.some(c=>c.id===item.result.artifactId))continue;const blob=await backend.artifact(item.result.artifactId);if(epoch!==editor.epoch)return;list.push({id:item.result.artifactId,name:'恢复的生成结果',url:URL.createObjectURL(blob),active:!list.length,backend:true});candidates.set(frame.id,list);}
    else if(saved.kind==='prompt'&&(!saved.frameId||frame)&&effectivePrompt(frame)===saved.original){const text=await (await backend.artifact(item.result.artifactId)).text();if(epoch!==editor.epoch)return;if(frame)frame.prompt=text;else config.draft=text;}
   }
   saved.done=true;renderContext(editor);cacheChanged();
  }}catch(e){$('workspace-cache-status').textContent='任务恢复稍后重试：'+e.message;}finally{recoveringJobs=false;}
 }
 function executionSettings(){return {...(config.executionModel?{model:config.executionModel}:{}),...(config.executionEffort?{reasoningEffort:config.executionEffort}:{})};}

 async function runBackend(kind){
  if(backendBusy)return;
  if(!backend.capabilities)return toast('本机后端尚未就绪，请稍后重试或刷新页面。');
  const focus=primary(),epoch=editor.epoch,original=effectivePrompt(focus),items=kind==='generation'?selected().map(f=>({frame:f,prompt:effectivePrompt(f),locator:structuredClone(f.locator)})):[{frame:focus,prompt:original,locator:focus?structuredClone(focus.locator):null}];
  if(!items.length)return toast('请先选择动作帧。');
  if(kind==='prompt'&&items.some(x=>!x.prompt.trim()))return toast('请先填写需要优化的提示词。');
  if(editor.pending||editor.batch)return toast('请等待采样完成。');
  const mode=kind==='prompt'?config.promptMode:config.imageMode;
  if(mode==='resume')return toast('当前后端暂不支持复用会话，请在设置中选择新会话。');
  const payload={...executionSettings(),mode,concurrency:config.batchConcurrency,outputTarget:'character_without_weapon',references:[]};
  const sourceFiles=new Map(editor.sourceFiles),referenceSnapshot=Object.entries(refs).filter(([role])=>role!=='weapon').map(([role,r])=>({role,ref:r}));
  backendBusy=true;taskPanel.uploading(kind,items.length);renderContext(editor);$('backend-job-status').textContent='正在上传原始素材…';
  try{
   const frames=[];
   for(const item of items){
    let locator=null;
    if(item.locator){const asset=await backend.upload(sourceFiles.get(item.locator.sourceId),item.frame.name);locator={...item.locator,assetId:asset.assetId};delete locator.sourceId;}
    frames.push({frameId:item.frame?.id||null,prompt:item.prompt,...(locator?{locator}:{})});
   }
   for(const {role,ref} of referenceSnapshot){if(!ref.blob)ref.blob=await backend.localBlob(ref.url);const asset=await backend.upload(ref.blob,ref.name);payload.references.push({role,assetId:asset.assetId});}
   if(kind==='prompt')Object.assign(payload,frames[0]);else payload.frames=frames;
   if(epoch!==editor.epoch)throw new Error('动作素材已改变，请重新提交任务');
   const job=await backend.submit(kind,payload);activeJob=job.id;workspaceJobs.push({id:job.id,kind,frameId:focus?.id||null,original});cacheChanged();taskPanel.update(job);$('backend-cancel').hidden=false;
   record(kind==='prompt'?'prompt.optimize':'generation.submit',{jobId:job.id,backendAccepted:true,frameCount:frames.length});
   let state=job;
   while(!['completed','partial','failed','cancelled'].includes(state.status)){
    $('backend-job-status').textContent='任务 '+state.status+' · '+state.items.filter(i=>i.status==='completed').length+' / '+state.items.length;
    await new Promise(resolve=>setTimeout(resolve,1000));state=await backend.job(job.id);taskPanel.update(state);
   }
   for(const item of state.items.filter(i=>i.status==='completed')){
    const blob=await backend.artifact(item.result.artifactId);
    if(kind==='prompt'){
     const text=await blob.text();
     if(epoch===editor.epoch&&(!focus||editor.frames.includes(focus))&&effectivePrompt(focus)===original){undoPrompt={frame:focus,epoch,hadOwn:typeof focus?.prompt==='string',original,optimized:text};if(focus)focus.prompt=text;else config.draft=text;editor.changed();$('prompt-undo').hidden=false;}
     else{$('request-json').textContent=text;open('logs-dialog');toast('编辑内容已变化，优化结果保留在结果窗口，未覆盖。');}
    }else if(epoch===editor.epoch&&editor.frames.some(f=>f.id===item.frameId)){
     const list=candidates.get(item.frameId)||[];list.forEach(c=>c.active=false);list.push({id:item.result.artifactId,name:'后端生成 '+(list.length+1),url:URL.createObjectURL(blob),active:true,backend:true});candidates.set(item.frameId,list);
    }
   }
   $('backend-job-status').textContent='任务 '+state.status+' · '+state.items.filter(i=>i.status==='completed').length+' / '+state.items.length+(state.items.find(i=>i.error)?' · '+state.items.find(i=>i.error).error:'');
   if(epoch===editor.epoch){const saved=workspaceJobs.find(x=>x.id===job.id);if(saved)saved.done=true;cacheChanged();}
   if(kind==='generation'&&epoch===editor.epoch&&(candidates.get(previewFrame()?.id)||[]).length)viewer='result';
  }catch(error){taskPanel.uploadError(error.message);$('backend-job-status').textContent=error.message;toast(error.message);}
  finally{backendBusy=false;activeJob=null;$('backend-cancel').hidden=true;renderContext(editor);}
 }
 function previewFrame(){if(lastPreviewEpoch!==editor?.epoch){lastPreviewEpoch=editor?.epoch;lastPreviewId=null;}const frame=(['sequence','sheet'].includes(editor?.kind)&&editor.frames.find(f=>f.id===editor.framePreviewId))||primary()||editor?.frames.find(f=>f.id===lastPreviewId)||editor?.frames[0]||null;if(frame)lastPreviewId=frame.id;return frame;}
 let comparisonKey=null,comparisonURL=null,comparisonVersion=0;
 function renderComparisonOriginal(frame){
  $('comparison-original').hidden=viewer!=='result';
  if(viewer!=='result')return;
  const key=frame?JSON.stringify([editor.epoch,frame.id,frame.url,frame.locator,!!backend.capabilities]):null;
  if(key===comparisonKey)return;
  comparisonKey=key;const version=++comparisonVersion;
  if(comparisonURL){URL.revokeObjectURL(comparisonURL);comparisonURL=null;}
  const image=$('comparison-original-image'),empty=$('comparison-original-empty'),caption=$('comparison-original-caption');
  image.hidden=!frame?.url;empty.hidden=!!frame?.url;
  if(!frame){image.removeAttribute('src');caption.textContent='';return;}
  image.src=frame.url;caption.textContent=frame.name+' · 缩略预览';
  if(!backend.capabilities||!frame.locator)return;
  const locator=structuredClone(frame.locator),file=editor.sourceFiles.get(locator.sourceId);
  if(!file)return;
  (async()=>{try{
   const asset=await backend.upload(file,frame.name);if(version!==comparisonVersion)return;
   locator.assetId=asset.assetId;delete locator.sourceId;
   const result=await (await backend.request('/frames/extract',{frames:[locator]})).json();
   if(version!==comparisonVersion)return;
   const blob=await backend.artifact(result.frames[0].artifactId);if(version!==comparisonVersion)return;
   comparisonURL=URL.createObjectURL(blob);image.src=comparisonURL;image.hidden=false;empty.hidden=true;caption.textContent=frame.name+' · 原尺寸';
  }catch(e){if(version===comparisonVersion)caption.textContent=frame.name+' · 缩略预览（原图读取失败）';}})();
 }
 function primary(){return editor?.frames.find(f=>f.id===editor.selected)||null;}
 function selected(){return editor?.frames.filter(f=>editor.selectionIds.includes(f.id))||[];}
 function effectivePrompt(f){return typeof f?.prompt==='string'?f.prompt:config.draft;}
 function renderReferences(){const box=$('reference-list');box.replaceChildren();for(const [role,label] of [['character','人设'],['style','画风'],['weapon','独立武器']]){const r=refs[role],item=document.createElement('div');item.className='reference-row';const im=document.createElement('img');im.alt=label;if(r)im.src=r.url;else im.hidden=true;const name=document.createElement('span');name.textContent=label;const file=document.createElement('small');file.textContent=r?r.name:'未导入';const choose=document.createElement('button');choose.textContent=r?'替换':'导入';choose.onclick=()=>{referenceRole=role;$('reference-file').click();};const clear=document.createElement('button');clear.textContent='清除';clear.dataset.uiIcon='x';clear.dataset.iconOnly='true';clear.title='清除'+label;clear.disabled=!r;clear.onclick=()=>{if(r?.owned)URL.revokeObjectURL(r.url);delete refs[role];renderReferences();record('reference.clear',{role},true);};item.append(im,name,file,choose,clear);box.append(item);}}
 function renderCandidates(f){const box=$('candidate-list');box.replaceChildren();const list=f?candidates.get(f.id)||[]:[];if(!list.length){const p=document.createElement('p');p.className='muted';p.textContent='生成后，各版本会显示在这里。';box.append(p);}for(const c of list){const row=document.createElement('div');row.className='candidate-row';const view=document.createElement('button');const thumb=document.createElement('img');thumb.src=c.url;thumb.alt=c.name;thumb.loading='lazy';const caption=document.createElement('span');caption.textContent=c.name+(c.adopted?' · 已采用':'');view.append(thumb,caption);view.title=c.name;view.setAttribute('aria-pressed',String(c.active||(!list.some(x=>x.active)&&c===list.at(-1))));view.onclick=()=>{list.forEach(x=>x.active=x===c);viewer='result';renderContext(editor);};const adopt=document.createElement('button');adopt.textContent=c.adopted?'已采用':'采用';adopt.onclick=()=>{list.forEach(x=>x.adopted=x===c);record('candidate.select',{frameId:f.id,candidateId:c.id},true);renderContext(editor);};row.append(view,adopt);box.append(row);}const chosen=list.find(c=>c.active)||list.at(-1);$('candidate-import').disabled=!primary();$('result-empty').hidden=!!chosen;$('result-empty').textContent=f?'当前帧暂无生成结果':'请先选择动作帧';$('result-image').hidden=!chosen;if(chosen)$('result-image').src=chosen.url;else $('result-image').removeAttribute('src');$('result-caption').textContent=chosen?(chosen.backend?'后端生成 · ':'手动导入候选 · ')+chosen.name+(chosen.adopted?' · 已采用':''):'候选按当前帧关联。';}
 function renderContext(ed){if(!ready)return;cacheChanged();const f=ed.frames.find(x=>x.id===ed.selected)||null;
  if(lastPrimary!==ed.selected)lastPrimary=ed.selected;
  const owner=f?f.id:'project',prompt=effectivePrompt(f);if(lastPromptOwner!==owner||lastLoadedPrompt!==prompt){$('draft').value=prompt;lastPromptOwner=owner;lastLoadedPrompt=prompt;}
  const own=typeof f?.prompt==='string',count=selected().length,frameNumber=f?ed.frames.indexOf(f)+1:null;
  $('prompt-owner').textContent=f?'帧 '+frameNumber+(own?' · 独立':' · 默认'):'项目默认';
  $('draft').setAttribute('aria-label',f?'帧 '+frameNumber+' 的生图提示词':'项目默认生图提示词');
  $('prompt-state').textContent=count>1?'当前编辑帧 '+frameNumber+'；其他所选帧保留各自提示词。':f?(own?'':'编辑后仅对此帧生效。'):'未单独设置的帧将使用此提示词。';
  $('prompt-state').hidden=!$('prompt-state').textContent;
  $('prompt-copy').disabled=!prompt.trim();$('optimize-prompt-button').disabled=!prompt.trim()||backendBusy;$('prompt-use-default').hidden=!f||!own;
  $('prompt-save-default').hidden=!f||!prompt.trim()||prompt===config.draft;
  $('prompt-default-actions').hidden=$('prompt-use-default').hidden&&$('prompt-save-default').hidden;
  $('frame-candidates').hidden=viewer!=='result';
  const targets=selected();$('generate-button').disabled=backendBusy||!targets.length||!!ed.pending||!!ed.batch;$('generate-button').textContent=targets.length?'生成 '+targets.length+' 帧':'请先选择动作帧';
  const preview=previewFrame();renderCandidates(preview);renderComparisonOriginal(preview);if(ed.kind!=='video'&&preview?.url)ed.q('image-preview').src=preview.url;document.querySelector('.studio-canvas').classList.toggle('show-result',viewer==='result');$('result-panel').hidden=viewer!=='result';for(const b of document.querySelectorAll('.viewer-tabs button'))b.setAttribute('aria-pressed',String(b.dataset.action==='viewer.'+viewer));
 }
 function renderConfig(){for(const [id,key] of [['batch-concurrency','batchConcurrency'],['execution-model','executionModel'],['execution-effort','executionEffort'],['project-name','project'],['prompt-mode','promptMode'],['prompt-session','promptSession'],['image-mode','imageMode'],['image-session','imageSession']])$(id).value=config[key];$('prompt-session').hidden=config.promptMode!=='resume';$('image-session').hidden=config.imageMode!=='resume';$('session-summary').textContent='设置';for(const k of ['x','y'])$('anchor-'+k).value=config.anchor[k];renderReferences();renderContext(editor);}
 function purgeCandidates(){const live=new Set(editor.frames.map(f=>f.id));for(const [id,list] of candidates)if(!live.has(id)){for(const c of list)URL.revokeObjectURL(c.url);candidates.delete(id);}}
 editor=new MotionInput.Editor($('motion-editor'),{sampleVideo:media.video,message:toast,onAction:(id,payload)=>{record(id,payload,true);if(ready)renderContext(editor);},onSelection:renderContext,onSourcePreview:()=>{if(ready)renderContext(editor);},onChange:meta=>{config.motionInput=meta;if(ready){purgeCandidates();renderContext(editor);}}});
 ready=true;if(config.motionInput)editor.loadPlan(config.motionInput);
 // Public distribution starts without reference artwork.
 if(media.character)refs.character={name:'人设参考',url:media.character};if(media.style)refs.style={name:'画风参考',url:media.style};
 const runner=new WorkbenchCore.DemoRunner((event,s)=>{$('run-status').textContent=({idle:'未运行',running:'模拟中',draining:'本阶段后停止',paused:'已暂停',cancelled:'已终止',completed:'模拟结束 · 无新产物',waiting_review:'等待确认'})[s.state];});
 const actions={
  'workspace.assets':()=>document.querySelector('.studio-layout').classList.toggle('assets-open'),'workspace.inspector':()=>document.querySelector('.studio-layout').classList.toggle('inspector-closed'),
  'task.save':()=>showWorkspaceDialog('save'), 'config.export':()=>download('animation-workbench-config.json',snapshot()),'config.import':()=>$('config-file').click(),
  'logs.open':()=>open('logs-dialog'),'run.open':()=>open('run-dialog'),'run.all':()=>runner.start(),'run.stop_now':()=>runner.stopNow(),'run.stop_after':()=>runner.toggleAfterStage(),'run.continue':()=>runner.continueRun(),
  'export.request':()=>open('export-dialog'),'export.simulate':()=>{record('export.request',{format:$('export-format').value,frameIds:editor.frames.map(f=>f.id)});toast('已记录模拟导出请求，没有生成动画文件。');},
  'viewer.source':()=>{viewer='source';renderContext(editor);},'viewer.result':()=>{editor.pause();viewer='result';renderContext(editor);},
  'prompt.optimize':()=>runBackend('prompt'),
  'prompt.copy':async()=>{try{await navigator.clipboard.writeText($('draft').value);toast('已复制');}catch(e){$('draft').focus();$('draft').select();toast('已选中文字，请按 Ctrl+C。');}},
  'prompt.use_default':()=>{const f=primary();if(f){delete f.prompt;editor.changed();renderContext(editor);}},'prompt.save_default':()=>{config.draft=$('draft').value;save(true);renderContext(editor);toast('已设为项目默认提示词。');},
  'generation.submit':()=>runBackend('generation'),
  'candidate.import':()=>{const f=primary();if(!f)return;candidateTarget={id:f.id,epoch:editor.epoch};$('candidate-file').click();},
  'functions.open':()=>{const box=$('function-items');box.replaceChildren();for(const f of features){const item=document.createElement('article'),h=document.createElement('h3'),p=document.createElement('p'),note=document.createElement('textarea');h.textContent=f.label+' · '+f.id;p.textContent=f.ui+' 后端：'+f.backend;note.placeholder='修改意见';note.value=config.feedback[f.id]||'';note.oninput=()=>config.feedback[f.id]=note.value;item.append(h,p,note);box.append(item);}open('functions-dialog');},
  'feedback.export':()=>download('animation-workbench-feedback.json',config.feedback),
  'demo.reset':()=>{if(!confirm('重置本页配置与素材？原始文件不会删除。'))return;runner.reset();editor.reset();config=structuredClone(initial);for(const r of Object.values(refs))if(r.owned)URL.revokeObjectURL(r.url);for(const k of Object.keys(refs))delete refs[k];lastPromptOwner=null;renderConfig();save(true);}
 };
 document.addEventListener('click',e=>{const button=e.target.closest('button');if(!button||button.disabled)return;if(button.dataset.close)$(button.dataset.close).close();const action=actions[button.dataset.action];if(action){$('more-menu').open=false;action();}});
 for(const [id,key] of [['project-name','project'],['prompt-session','promptSession'],['image-session','imageSession']])$(id).oninput=()=>config[key]=$(id).value;
 for(const [id,key] of [['prompt-mode','promptMode'],['image-mode','imageMode']])$(id).onchange=()=>{config[key]=$(id).value;renderConfig();};
 for(const [id,key] of [['execution-model','executionModel'],['execution-effort','executionEffort']])$(id).onchange=()=>{config[key]=$(id).value;save(true);};
 $('batch-concurrency').onchange=()=>{const value=Number($('batch-concurrency').value);if(!Number.isSafeInteger(value)||value<1){$('batch-concurrency').value=config.batchConcurrency;return toast('并行个数请输入大于等于 1 的整数。');}config.batchConcurrency=value;renderConfig();save(true);};
 async function connectBackend(){try{await backend.connect();$('backend-status').textContent='本机工作台 · 已就绪';taskPanel.connected();workspaceStore=new WorkbenchWorkspace.Store(backend,captureWorkspace,restoreWorkspace,text=>$('workspace-cache-status').textContent=text);document.getElementById('motion-editor').inert=true;try{await workspaceStore.init();if(new URLSearchParams(location.search).has('pickerProbe')){workspaceStore.ready=false;$('workspace-cache-status').textContent='诊断页 · 不写入缓存';}}finally{document.getElementById('motion-editor').inert=false;}setInterval(recoverWorkspaceJobs,2500);}catch(e){$('backend-status').textContent=e.message;}}
 async function showWorkspaceDialog(mode){
  if(!workspaceStore?.ready)return toast('缓存尚未就绪');
  try{const data=await (await backend.request('/workspaces')).json();
   if(mode==='save'){$('workspace-name').value=config.project;$('workspace-root-label').textContent='保存位置：'+data.directory;const select=$('workspace-existing');select.replaceChildren(new Option('新建工作区',''));for(const item of data.workspaces)select.append(new Option(item.name,item.name));open('workspace-save-dialog');}
   else{const list=$('workspace-load-list');list.replaceChildren();$('workspace-load-root').textContent=data.directory;if(!data.workspaces.length){const p=document.createElement('p');p.textContent='还没有保存的工作区';list.append(p);}for(const item of data.workspaces){const button=document.createElement('button');button.className='wide';button.textContent=item.name+' · '+new Date(item.modifiedAt*1000).toLocaleString('zh-CN');button.onclick=async()=>{if(backendBusy||editor.pending||editor.batch)return toast('请等待当前操作完成');button.disabled=true;document.getElementById('motion-editor').inert=true;try{await workspaceStore.openNamed(item.name);$('workspace-load-dialog').close();toast('已打开：'+item.name);}catch(e){toast(e.message);}finally{button.disabled=false;document.getElementById('motion-editor').inert=false;}};list.append(button);}open('workspace-load-dialog');}
  }catch(e){toast(e.message);}
 }
 $('workspace-existing').onchange=()=>{if($('workspace-existing').value)$('workspace-name').value=$('workspace-existing').value;};
 $('workspace-save-confirm').onclick=async()=>{const name=$('workspace-name').value.trim();if(!name)return toast('请输入工作区名称');const button=$('workspace-save-confirm');button.disabled=true;try{await workspaceStore.saveNamed(name);config.project=name;renderConfig();$('workspace-save-dialog').close();toast('已保存工作区：'+name);}catch(e){toast(e.message);}finally{button.disabled=false;}};
 $('workspace-open').onclick=()=>showWorkspaceDialog('open');
 for(const event of ['input','change','click','pointerup','keyup'])document.addEventListener(event,e=>{if(['click','pointerup','keyup'].includes(event)&&e.target.closest?.('[data-mi-action=images],[data-mi-action=sheet],[data-mi-action=video],input[type=file]'))return;cacheChanged();});
 let lastPlaybackCache=0;editor.video.addEventListener('pause',cacheChanged);editor.video.addEventListener('timeupdate',()=>{if(Date.now()-lastPlaybackCache>3000){lastPlaybackCache=Date.now();cacheChanged();}});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&workspaceStore?.ready&&workspaceStore.dirty){workspaceStore.flush().catch(()=>{});}});
 $('backend-cancel').onclick=async()=>{if(activeJob)try{await backend.cancel(activeJob);$('backend-job-status').textContent='正在取消…';}catch(e){toast(e.message);}};
 $('prompt-undo').onclick=()=>{if(!undoPrompt)return;const u=undoPrompt;if(u.epoch!==editor.epoch||(u.frame&&!editor.frames.includes(u.frame))||effectivePrompt(u.frame)!==u.optimized)return toast('提示词已再次修改，无法撤销这次优化。');if(u.frame){if(u.hadOwn)u.frame.prompt=u.original;else delete u.frame.prompt;}else config.draft=u.original;undoPrompt=null;$('prompt-undo').hidden=true;editor.changed();renderContext(editor);};
 $('draft').oninput=()=>{const f=primary();if(f)f.prompt=$('draft').value;else config.draft=$('draft').value;lastLoadedPrompt=$('draft').value;editor.changed();};

 for(const k of ['x','y'])$('anchor-'+k).onchange=()=>{config.anchor[k]=Math.max(0,Math.min(100,+$('anchor-'+k).value||0));$('anchor-'+k).value=config.anchor[k];};
 $('reference-file').onchange=()=>{const f=$('reference-file').files[0],role=referenceRole;$('reference-file').value='';if(!f)return;const previous=refs[role];if(previous?.owned)URL.revokeObjectURL(previous.url);refs[role]={name:f.name,url:URL.createObjectURL(f),owned:true,blob:f};renderReferences();record('reference.choose',{role,name:f.name},true);};
 $('candidate-file').onchange=()=>{const file=$('candidate-file').files[0],target=candidateTarget;$('candidate-file').value='';if(!file||!target||editor.epoch!==target.epoch||!editor.frames.some(f=>f.id===target.id))return;const list=candidates.get(target.id)||[];list.forEach(c=>c.active=false);list.push({id:'candidate-'+Date.now(),name:file.name,url:URL.createObjectURL(file),active:true});candidates.set(target.id,list);if(primary()?.id===target.id)viewer='result';renderContext(editor);record('candidate.import',{frameId:target.id,name:file.name},true);};
 $('config-file').onchange=async()=>{const file=$('config-file').files[0];$('config-file').value='';if(!file)return;if(file.size>2*1024*1024)return toast('配置文件过大。');try{const imported=normalize(JSON.parse(await file.text()));runner.reset();config=imported;editor.loadPlan(config.motionInput);lastPromptOwner=null;renderConfig();toast('已载入配置；请重新选择动作素材。');}catch(e){toast('配置无效：'+e.message);}};
 window.addEventListener('beforeunload',e=>{if(editor.pending)editor.pause();if(workspaceStore?.dirty||workspaceStore?.saving){e.preventDefault();e.returnValue='';}});
 connectBackend();
 renderConfig();record('workspace.open',{layout:'single_editor'},true);
})();
