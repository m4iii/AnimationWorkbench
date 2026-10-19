// Opt-in diagnostics: measures the real import path, without touching files or cache.
(function(root){
 if(!new URLSearchParams(location.search).has('pickerProbe'))return;
 const output=document.createElement('pre');output.id='picker-probe';output.setAttribute('aria-label','文件选择器耗时诊断');
 output.style.cssText='position:fixed;left:10px;bottom:26px;z-index:200;max-width:650px;white-space:pre-wrap;padding:12px;background:#101117;color:#eee;border:1px solid #777;font:12px/1.6 monospace';
 document.body.append(output);
 let current=null;const rows=[],longTasks=[];
 const ms=value=>Math.round(value*100)/100;
 function paint(){output.textContent=JSON.stringify({note:'仅测网页事件和原生调用交接；不把调用返回当成系统窗口已显示。',samples:rows.slice(-6),longTasks:lastTasks()},null,2);}
 function lastTasks(){return longTasks.filter(t=>performance.now()-t.start<10000).slice(-5);}
 try{new PerformanceObserver(list=>{for(const e of list.getEntries())longTasks.push({start:ms(e.startTime),duration:ms(e.duration)});if(longTasks.length>100)longTasks.splice(0,longTasks.length-100);}).observe({type:'longtask',buffered:true});}catch{}
 root.WorkbenchPickerProbe={
  clicked(event){const now=performance.now();current={action:event.target.closest('[data-mi-action]')?.dataset.miAction,eventDelayMs:ms(now-event.timeStamp),start:now};},
  before(){if(current)current.nativeStart=performance.now();},
  after(){if(!current)return;const sample=current;current=null;const now=performance.now();rows.push({action:sample.action,eventDelayMs:sample.eventDelayMs,handlerBeforePickerMs:ms(sample.nativeStart-sample.start),nativeCallReturnMs:ms(now-sample.nativeStart)});setTimeout(paint,0);}
 };
 paint();
})(window);
