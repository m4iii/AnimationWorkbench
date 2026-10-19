(function(){
 'use strict';
 const icons=JSON.parse(document.getElementById('ui-icons').textContent);
 const actionIcons={
  'task.save':'save','export.request':'download','config.import':'folder-open','config.export':'file-code',
  'workspace.assets':'layers','workspace.inspector':'sliders-horizontal','functions.open':'info','logs.open':'logs',
  'run.open':'play','demo.reset':'rotate-ccw','prompt.optimize':'wand-sparkles','prompt.copy':'copy',
  'prompt.use_default':'rotate-ccw','prompt.save_default':'save','generation.submit':'sparkles',
  'candidate.import':'image-plus','export.simulate':'download','feedback.export':'download',
  'run.all':'play','run.stop_after':'pause','run.stop_now':'x','run.continue':'play'
 };
 const motionIcons={images:'images',sheet:'grid-2x2',video:'film',sample:'play','select-all':'square-dashed',
  'clear-selection':'x','mark-selected':'bookmark','unmark-selected':'bookmark-x','remove-selected':'trash',
  'step-back':'arrow-left','step-forward':'arrow-right','toggle-frame-layout':'grid-2x2','toggle-sort':'arrow-left','fit-time':'scan','detect-fps':'scan',capture:'plus','batch-full':'scan','toggle-batch':'plus','batch-add':'plus',
  split:'grid-2x2',clear:'trash',previous:'arrow-left',next:'arrow-right',remove:'trash'};
 function icon(name){if(!icons[name])throw new Error('Missing icon: '+name);const span=document.createElement('span');span.className='ui-icon';span.setAttribute('aria-hidden','true');span.innerHTML=icons[name];return span;}
 function enhance(root){
  for(const holder of root.querySelectorAll('[data-icon]'))if(!holder.querySelector('.ui-icon'))holder.replaceChildren(icon(holder.dataset.icon));
  for(const b of root.querySelectorAll('button,summary')){
   if(b.querySelector('.ui-icon'))continue;
   let name=b.dataset.uiIcon||actionIcons[b.dataset.action]||motionIcons[b.dataset.miAction];
   const label=b.textContent.trim(),action=b.dataset.miAction;
   if(action==='play-sequence')name=label.startsWith('暂停')?'pause':'play';
   if(action==='toggle-redraw')name=label==='已标记'?'check':'bookmark';
   if(!name)continue;
   const iconOnly=b.dataset.iconOnly==='true'||['previous','next'].includes(action);
   const aria=action==='previous'?'将图片帧前移一位':action==='next'?'将图片帧后移一位':b.getAttribute('aria-label')||b.title||label;
   b.replaceChildren(icon(name));b.classList.add('ui-icon-button');
   if(iconOnly){b.classList.add('icon-only');b.setAttribute('aria-label',aria);b.title=aria;}
   else{const text=document.createElement('span');text.className='ui-button-label';text.textContent=label;b.append(text);}
  }
 }
 enhance(document);
 // Existing controls update their text when playback/selection changes. Restore their icons without changing handlers.
 const observer=new MutationObserver(()=>enhance(document));
 observer.observe(document.body,{subtree:true,childList:true});
})();
