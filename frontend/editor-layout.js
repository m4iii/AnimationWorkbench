(function(root){
root.mountMotionWorkspace=function(editor){
 const host=editor.host,q=editor.q,layout=document.createElement('div');layout.className='studio-layout';
 layout.innerHTML=`<aside class="studio-assets"><div class="studio-panel-title">素材</div><div class="studio-imports"></div><div class="studio-source"></div><div class="studio-references"></div></aside><div class="studio-divider" data-resize="left" role="separator" aria-label="调整素材栏宽度" tabindex="0"></div><section class="studio-preview"><div class="studio-panel-title"><span data-mi="preview-title">画面预览</span><div class="viewer-tabs"><button data-action="viewer.source" aria-pressed="true">源画面</button><button data-action="viewer.result" aria-pressed="false">生成结果</button></div></div><div class="studio-canvas"><div class="studio-welcome"><span class="welcome-icon" data-icon="film"></span><b>导入一个动作，开始编辑</b><p>视频、帧序列或连续图均可。<br>在下方添加、选择帧并生成图片。</p></div></div></section><div class="studio-divider" data-resize="right" role="separator" aria-label="调整属性栏宽度" tabindex="0"></div><aside class="studio-inspector"><div class="studio-panel-title">生成设置 <span data-mi="selection-count">0 帧</span></div><div class="studio-prompt-slot"></div></aside><div class="studio-divider studio-horizontal" data-resize="bottom" role="separator" aria-label="调整时间轴高度" tabindex="0"></div><section class="studio-bottom"><div class="studio-selection-tools"><b>动作帧</b><button data-mi-action="select-all" title="选中全部动作帧">全选</button><button data-mi-action="clear-selection" title="取消全部选择，保留帧和视频">清空</button><button data-mi-action="remove-selected">删除所选</button><span data-mi="selection-summary">未选中</span><small>时间轴拖选范围 · 缩略图框选 · 滚轮缩放</small></div><div class="studio-timeline"></div><div class="studio-frame-strip"></div></section>`;
 host.append(layout);const find=s=>layout.querySelector(s);
 find('.studio-imports').append(host.querySelector('.mi-top'));
 find('.studio-source').append(q('source-label'),q('restore'),q('project-controls'));
 find('.studio-references').append(document.getElementById('reference-panel'));
 const canvas=find('.studio-canvas'),sourceStage=document.createElement('section');sourceStage.className='studio-source-stage';sourceStage.setAttribute('aria-label','原画面');const sourceLabel=document.createElement('div');sourceLabel.className='comparison-label';sourceLabel.textContent='原画面';sourceStage.append(sourceLabel,find('.studio-welcome'),editor.video,q('image-section'),q('sheet-section'));canvas.append(sourceStage,document.getElementById('comparison-original'),document.getElementById('result-panel'),document.getElementById('frame-candidates'));
 find('.studio-prompt-slot').append(document.getElementById('prompt-panel'));
 find('.studio-timeline').append(q('video-section'));
 find('.studio-frame-strip').append(host.querySelector('.mi-list-head'),q('frames'));
 layout.append(q('status'));q('status').classList.add('studio-status');
 for(const el of Array.from(host.children))if(el!==layout&&el.tagName!=='INPUT')el.remove();
 host.querySelector('.mi-batch').open=false;
 editor.updateInspector=()=>{
  const frame=editor.frames.find(f=>f.id===editor.selected),selected=editor.frames.filter(f=>(editor.selectionIds||[]).includes(f.id));
  q('selection-count').textContent=selected.length?selected.length+' 帧':'未选帧';q('selection-summary').textContent='选中 '+selected.length+' / 共 '+editor.frames.length;
  for(const action of ['remove-selected'])host.querySelector('[data-mi-action="'+action+'"]').disabled=!selected.length||!!editor.batch;
  host.querySelector('[data-mi-action="select-all"]').disabled=!editor.frames.length;host.querySelector('[data-mi-action="clear-selection"]').disabled=!selected.length;
  editor.video.hidden=editor.kind!=='video';find('.studio-welcome').hidden=!!editor.sourceName;
  const viewed=editor.isFrameSource?.()?editor.frames.find(f=>f.id===editor.framePreviewId)||frame:frame;q('preview-title').textContent=viewed?'画面预览 · '+editor.frameLabel(viewed):'画面预览';
  if(editor.options.onSelection)editor.options.onSelection(editor);
 };
 for(const handle of layout.querySelectorAll('[data-resize]')){
  const axis=handle.dataset.resize;let drag=null;
  const set=value=>{const max=axis==='bottom'?Math.max(180,layout.clientHeight-140):Math.max(160,layout.clientWidth*.4);layout.style.setProperty('--studio-'+axis,Math.max(axis==='bottom'?180:160,Math.min(max,value))+'px');};
  handle.onpointerdown=e=>{if(e.button!==0)return;drag={x:e.clientX,y:e.clientY,value:parseFloat(getComputedStyle(layout).getPropertyValue('--studio-'+axis))};handle.setPointerCapture(e.pointerId);e.preventDefault();};
  handle.onpointermove=e=>{if(drag)set(drag.value+(axis==='bottom'?drag.y-e.clientY:axis==='right'?drag.x-e.clientX:e.clientX-drag.x));};handle.onpointerup=handle.onpointercancel=()=>drag=null;
  handle.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();set(parseFloat(getComputedStyle(layout).getPropertyValue('--studio-'+axis))+(['ArrowRight','ArrowDown'].includes(e.key)?10:-10));};
 }
};
})(window);
