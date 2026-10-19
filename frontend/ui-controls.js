(function(root){
 'use strict';
 function metrics(value,min,max){
  const lo=Number.isFinite(+min)?+min:0,hi=Number.isFinite(+max)?Math.max(lo,+max):100;
  const val=Math.max(lo,Math.min(hi,Number.isFinite(+value)?+value:lo));
  return {value:val,percent:hi>lo?(val-lo)/(hi-lo)*100:0};
 }
 function syncRange(input){
  if(typeof document==='undefined')return;
  let shell=input.parentElement;
  if(!shell?.classList.contains('ui-range')){
   shell=document.createElement('div');shell.className='ui-range';input.before(shell);shell.append(input);
   const tip=document.createElement('output');tip.className='ui-range-value';tip.setAttribute('aria-hidden','true');shell.append(tip);
   input.addEventListener('input',()=>syncRange(input));
  }
  const m=metrics(input.value,input.min,input.max),text=m.value.toFixed(3)+' s';
  input.style.setProperty('--range-fill',m.percent+'%');shell.style.setProperty('--range-fill',m.percent+'%');
  shell.classList.toggle('is-disabled',input.disabled);
  shell.querySelector('output').textContent=text;
  input.setAttribute('aria-valuetext',input.disabled?'完整时间轴已显示':('可见范围起点 '+text));
  input.title=input.disabled?'滚轮放大时间轴后，可用此滑杆平移':'拖动以平移时间轴的可见范围';
 }
 function scrollMetrics(duration,span,start,width){
  const total=Math.max(.001,+duration||.001),visible=Math.max(.001,Math.min(total,+span||total)),viewport=Math.max(1,+width||1);
  const content=Math.max(viewport,Math.min(8000000,viewport*total/visible)),range=Math.max(0,total-visible);
  return {content,range,left:range?Math.max(0,Math.min(range,+start||0))/range*(content-viewport):0};
 }
 const scrollbars=new WeakMap();
 function syncScrollbar(element,view,onChange){
  let state=scrollbars.get(element);
  if(!state){
   const spacer=document.createElement('div');spacer.className='timeline-scroll-content';spacer.setAttribute('aria-hidden','true');element.append(spacer);
   state={spacer,view,onChange};scrollbars.set(element,state);
   element.addEventListener('scroll',()=>{const range=state.metrics?.range||0,max=element.scrollWidth-element.clientWidth;
    if(!range||max<=0||Math.abs(element.scrollLeft-state.appliedLeft)<.5)return;
    const start=element.scrollLeft/max*range;state.appliedLeft=element.scrollLeft;state.onChange(start);
   });
   if(typeof ResizeObserver!=='undefined'){state.observer=new ResizeObserver(()=>syncScrollbar(element,state.view,state.onChange));state.observer.observe(element);}
  }
  state.view=view;state.onChange=onChange;
  const m=scrollMetrics(view.duration,view.span,view.start,element.clientWidth);state.metrics=m;
  state.spacer.style.width=m.content+'px';
  element.scrollLeft=m.range?Math.max(0,Math.min(m.range,view.start))/m.range*(element.scrollWidth-element.clientWidth):0;
  state.appliedLeft=element.scrollLeft;
  element.setAttribute('aria-valuemin','0');element.setAttribute('aria-valuemax',String(m.range));element.setAttribute('aria-valuenow',String(view.start));
  element.setAttribute('aria-valuetext',m.range?view.start.toFixed(3)+' 秒起的可见范围':'已显示完整时间轴');element.setAttribute('aria-disabled',String(!m.range));
 }
 const api={metrics,syncRange,scrollMetrics,syncScrollbar};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WorkbenchControls=api;
})(typeof window!=='undefined'?window:globalThis);
