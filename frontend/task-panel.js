(function(root){
 'use strict';
 const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
 const terminal=new Set(['completed','partial','failed','cancelled']);
 const labels={uploading:'上传素材',queued:'排队中',running:'进行中',cancelling:'正在取消',completed:'已完成',partial:'部分失败',failed:'失败',cancelled:'已取消'};
 function summary(job){const items=job.items||[];return {total:items.length,finished:items.filter(i=>terminal.has(i.status)).length,succeeded:items.filter(i=>i.status==='completed').length,failed:items.filter(i=>i.status==='failed').length,active:!terminal.has(job.status)};}
 class Panel{
  constructor(client){
   this.client=client;this.rows=new Map();this.polling=false;this.signature='';this.localId=null;
   this.button=document.getElementById('tasks-button');this.panel=document.getElementById('tasks-panel');this.list=document.getElementById('tasks-list');this.status=document.getElementById('tasks-status');
   this.button.onclick=()=>this.toggle(this.panel.hidden);
   document.getElementById('tasks-close').onclick=()=>this.toggle(false);
   document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!this.panel.hidden){this.toggle(false);this.button.focus();}});
   document.addEventListener('pointerdown',e=>{if(!this.panel.hidden&&!this.panel.contains(e.target)&&!this.button.contains(e.target))this.toggle(false);});
   this.center=document.getElementById('tasks-center');this.centerId=null;
   document.getElementById('tasks-open-center').onclick=()=>this.openCenter();
   document.getElementById('tasks-center-close').onclick=()=>this.center.close();
   this.center.addEventListener('close',()=>{this.clearMedia(document.getElementById('tasks-center-detail'));this.button.focus();});
   this.render();
  }
  toggle(open){this.panel.hidden=!open;this.button.setAttribute('aria-expanded',String(open));if(open){this.refresh();document.getElementById('tasks-close').focus();}}
  uploading(kind,count){this.localId='upload-'+Date.now();this.rows.set(this.localId,{id:this.localId,kind,status:'uploading',createdAt:Date.now()/1000,items:Array.from({length:count},()=>({status:'queued'})),local:true});this.render();}
  update(job){if(this.localId){this.rows.delete(this.localId);this.localId=null;}this.rows.set(job.id,job);this.render();}
  uploadError(message){if(this.localId){this.rows.set(this.localId,{...this.rows.get(this.localId),status:'failed',error:message});this.localId=null;this.render();}}
  connected(){if(this.timer)clearInterval(this.timer);this.rows.clear();this.signature='';this.refresh();this.timer=setInterval(()=>this.refresh(),2500);}
  async refresh(){
   if(!this.client.capabilities){this.status.textContent='本机后端尚未就绪';return;}
   if(this.polling)return;this.polling=true;
   try{const data=await this.client.jobs();const live=new Set(data.jobs.map(j=>j.id));for(const [id,row] of this.rows)if(!row.local&&terminal.has(row.status)&&!live.has(id))this.rows.delete(id);for(const job of data.jobs)this.rows.set(job.id,job);this.status.textContent='自动更新 · 最近 50 个已结束任务';this.render();this.refreshDetails();}
   catch(e){this.status.textContent='进度暂不可用：'+e.message;}
   finally{this.polling=false;}
  }
  render(){
   const rows=[...this.rows.values()].sort((a,b)=>Number(summary(b).active)-Number(summary(a).active)||(b.createdAt||0)-(a.createdAt||0));
   const active=rows.filter(j=>summary(j).active).length;
   document.getElementById('tasks-count').textContent=active?String(active):'';document.getElementById('tasks-count').hidden=!active;
   this.button.classList.toggle('has-active-tasks',active>0);this.button.setAttribute('aria-label',active?'后台任务，'+active+' 个进行中':'后台任务');
   const signature=JSON.stringify(rows);if(signature===this.signature)return;this.signature=signature;
   const opened=new Set([...this.list.querySelectorAll('details[open]')].map(n=>n.dataset.job));this.clearMedia(this.list);this.list.replaceChildren();
   const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
   if(!rows.length){this.list.append(el('p','暂无后台任务','tasks-empty'));return;}
   for(const job of rows){
    const info=summary(job),card=el('article',undefined,'task-card'),header=el('div',undefined,'task-card-heading');
    header.append(el('strong',job.kind==='prompt'?'优化提示词':'生成图片'),el('span',labels[job.status]||job.status,'task-state state-'+job.status));card.append(header);
    const progress=el('progress');progress.max=Math.max(1,info.total);progress.setAttribute('aria-label','已结束 '+info.finished+' / '+info.total);
    if(job.status!=='uploading'&&!(info.active&&info.total===1&&info.finished===0))progress.value=info.finished;card.append(progress);
    card.append(el('p',job.status==='uploading'?'正在准备原帧和参考图…':'成功 '+info.succeeded+' / '+info.total+(info.failed?' · 失败 '+info.failed:'')+(job.concurrency?' · 并行 '+job.concurrency:''),'task-meta'));
    if(job.error)card.append(el('p',job.error,'task-error'));
    const details=el('details');details.dataset.job=job.id;details.open=opened.has(job.id);details.append(el('summary','逐帧详情'));
    const body=el('div',undefined,'task-expanded-body');details.append(body);
    details.ontoggle=()=>{if(details.open&&!job.local)this.loadDetails(job.id,body,false);};
    if(details.open&&!job.local)this.loadDetails(job.id,body,false);
    if(job.local)body.append(el('p','任务提交后显示详情。','task-meta'));
    card.append(details);
    if(!job.local){const more=el('button','打开完整详情','task-open-detail');more.onclick=()=>this.openCenter(job.id);card.append(more);}
    if(info.active&&!job.local){const cancel=el('button',job.status==='cancelling'?'正在取消…':'取消任务','task-cancel');cancel.disabled=job.status==='cancelling';cancel.onclick=async()=>{cancel.disabled=true;try{this.update(await this.client.cancel(job.id));}catch(e){this.status.textContent=e.message;cancel.disabled=false;}};card.append(cancel);}
    this.list.append(card);
   }
   if(this.center.open)this.renderCenterList();
  }

  clearMedia(container){for(const image of container.querySelectorAll('img[data-task-image]'))if(image.src.startsWith('blob:'))URL.revokeObjectURL(image.src);container.dataset.signature='';container.dataset.loadToken='';}
  openCenter(id){this.toggle(false);this.centerId=id||this.centerId||[...this.rows.values()].find(j=>!j.local)?.id||null;if(!this.center.open)this.center.showModal();this.renderCenterList();const target=document.getElementById('tasks-center-detail');this.clearMedia(target);target.replaceChildren();if(this.centerId)this.loadDetails(this.centerId,target,true);else target.append(el('p','暂无任务','tasks-empty'));}
  renderCenterList(){
   const list=document.getElementById('tasks-center-list');list.replaceChildren();
   const jobs=[...this.rows.values()].filter(j=>!j.local).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
   for(const job of jobs){const button=el('button',undefined,'task-nav-item');button.classList.toggle('active',job.id===this.centerId);button.append(el('strong',job.kind==='prompt'?'优化提示词':'生成图片'),el('span',(labels[job.status]||job.status)+' · '+summary(job).succeeded+'/'+summary(job).total),el('small',job.createdAt?new Date(job.createdAt*1000).toLocaleString('zh-CN'):'历史任务'));button.onclick=()=>this.openCenter(job.id);list.append(button);}
  }
  refreshDetails(){for(const details of this.list.querySelectorAll('details[open]'))this.loadDetails(details.dataset.job,details.querySelector('.task-expanded-body'),false);if(this.center.open&&this.centerId)this.loadDetails(this.centerId,document.getElementById('tasks-center-detail'),true);}
  async loadDetails(id,container,full){
   if(!container||id.startsWith('upload-'))return;
   const token=id+':'+Date.now();container.dataset.requestToken=token;
   if(!container.children.length)container.append(el('p','正在读取任务详情…','task-meta'));
   try{
    const job=await this.client.jobDetails(id);
    if(!container.isConnected||container.dataset.requestToken!==token||(full&&(!this.center.open||this.centerId!==id)))return;
    const signature=JSON.stringify(job);if(container.dataset.signature===signature)return;
    const expanded=new Set([...container.querySelectorAll('details[open]')].map(d=>d.dataset.section));
    this.clearMedia(container);container.dataset.loadToken=token;container.dataset.signature=signature;container.replaceChildren();
    if(full){container.append(el('h3',job.kind==='prompt'?'提示词优化':'图片生成'));container.append(el('p',(labels[job.status]||job.status)+' · Model '+(job.settings?.model||'默认')+' · Effort '+(job.settings?.reasoningEffort||'默认')+' · 并行 '+job.concurrency,'task-meta'));container.append(el('p','任务 '+job.id,'task-id'));}
    for(const [index,item] of job.items.entries()){
     const frame=el('article',undefined,'task-frame-detail');frame.append(el('h4',(item.frameId||'项目提示词')+' · '+(labels[item.status]||item.status)));
     if(item.locator?.timeSeconds!=null)frame.append(el('p','源视频位置 '+item.locator.timeSeconds.toFixed(3)+' 秒','task-meta'));
     if(item.error)frame.append(el('p',item.error,'task-error'));
     const result=el('div',undefined,'task-result-preview');result.append(el('h4',job.kind==='prompt'?'优化结果':'生成结果'));frame.append(result);
     if(item.result)this.loadResult(item.result,result,job.kind,container,token);
     else result.append(el('p',item.status==='failed'?'没有生成结果':item.status==='cancelled'?'任务已取消':'等待生成结果','task-meta'));
     const inputs=el('section',undefined,'task-inputs');inputs.append(el('h4','实际传入的图片'));const gallery=el('div',undefined,'task-input-gallery');inputs.append(gallery);
     for(const input of item.inputImages||[]){const box=el('div',undefined,'task-input-image');box.append(el('p','图片 '+input.index+' · '+({source:'动作原帧',character:'人设参考',style:'画风参考'}[input.role]||'补充参考')));gallery.append(box);this.loadResult(input,box,'input',container,token);}
     if(!item.inputImages?.length)gallery.append(el('p','尚未准备输入图片，或此历史任务没有图片快照。','task-meta'));frame.append(inputs);
     const promptBox=el('details',undefined,'task-prompt-detail');promptBox.dataset.section='prompt-'+index;promptBox.open=full||expanded.has(promptBox.dataset.section);promptBox.append(el('summary','当次生图提示词'),el('pre',item.prompt??'此任务未保存提示词'));frame.append(promptBox);
     const sent=el('details',undefined,'task-prompt-detail');sent.dataset.section='sent-'+index;sent.open=expanded.has(sent.dataset.section);sent.append(el('summary','发送给 Codex 的完整指令'),el('pre',item.sentPrompt??'未保存完整指令：旧任务没有该快照，或当前帧尚未开始调用。'));frame.append(sent);
     container.append(frame);
    }
   }catch(e){if(container.dataset.requestToken===token){this.clearMedia(container);container.replaceChildren(el('p','详情读取失败：'+e.message,'task-error'));container.dataset.signature='';}}
  }
  async loadResult(result,box,kind,container,token){
   try{const blob=await this.client.artifact(result.artifactId);if(!container.isConnected||container.dataset.loadToken!==token)return;
    if(blob.type.startsWith('image/')){const image=el('img');image.dataset.taskImage='true';image.alt=kind==='input'?'本次任务实际输入图片':'本次任务生成图片';image.src=URL.createObjectURL(blob);const link=el('a');link.href=image.src;link.target='_blank';link.rel='noopener';link.title='打开原图';link.append(image);box.append(link);}
    else box.append(el('pre',await blob.text(),'task-text-result'));
    const download=el('button',kind==='input'?'下载输入图':'下载结果');download.onclick=()=>{const url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download=result.artifactId.slice(0,12)+(blob.type.startsWith('image/')?'.png':'.txt');a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};box.append(download);
   }catch(e){if(container.dataset.loadToken===token)box.append(el('p','结果读取失败：'+e.message,'task-error'));}
  }
 }
 root.WorkbenchTasks={Panel,summary};
})(typeof window==='undefined'?globalThis:window);
