(function(root){
  'use strict';
  function view(duration,start=0,span=duration){
    const d=Math.max(.001,duration||.001),s=Math.max(Math.min(.02,d),Math.min(d,span));
    return {start:Math.max(0,Math.min(d-s,start)),span:s};
  }
  function zoom(duration,current,ratio,fraction){
    const f=Math.max(0,Math.min(1,fraction)),anchor=current.start+current.span*f;
    const next=view(duration,0,current.span*ratio);
    return view(duration,anchor-next.span*f,next.span);
  }
  function ticks(current){
    const raw=current.span/8,base=10**Math.floor(Math.log10(raw));
    const step=[1,2,5,10].map(n=>n*base).find(n=>n>=raw);
    const result=[];
    for(let t=Math.ceil(current.start/step)*step;t<=current.start+current.span+step*.001;t+=step)result.push({time:t,left:(t-current.start)/current.span*100});
    return result;
  }
  function sampleTimes(duration,start,end,mode,value,limit=200){
    if(![duration,start,end,value].every(Number.isFinite)||duration<=0||start<0||end>duration||end<=start)throw Error('请填写有效的采样范围。');
    let count;
    if(mode==='count'){if(!Number.isInteger(value)||value<1)throw Error('总帧数必须是正整数。');count=value;}
    else if(mode==='step'){if(value<=0)throw Error('时间间隔必须大于 0。');count=Math.ceil((end-start)/value-1e-10);}
    else throw Error('未知采样方式。');
    if(count<1||count>limit)throw Error('本次采样超出剩余帧数上限（'+limit+' 帧）。');
    return Array.from({length:count},(_,i)=>Math.min(Math.max(0,duration-.001),start+i*(mode==='count'?(end-start)/count:value)));
  }
  function edgePan(duration,current,x,width,elapsedMs){
    const w=Math.max(1,width),edge=Math.min(32,w/4);
    const pressure=x<edge?-Math.min(1,(edge-x)/edge):x>w-edge?Math.min(1,(x-(w-edge))/edge):0;
    return view(duration,current.start+pressure*current.span*.8*Math.max(0,Math.min(50,elapsedMs))/1000,current.span);
  }
  // A shared source-neutral mapping. Constant-rate sources stay lazy; VFR sources
  // provide presentation timestamps. Every interval is [start,end), in seconds.
  function frameModel({duration=0,fps=30,times=null,count=null}={}){
    fps=Number.isFinite(fps)&&fps>=1&&fps<=240?fps:30;
    const table=Array.isArray(times)&&times.length?times:null;
    let size=table?table.length:count==null?Math.max(0,Math.ceil(duration*fps-1e-7)):Math.max(0,count);
    if(table)while(size&&table[size-1]>=duration)size--;
    const clamp=i=>Math.max(0,Math.min(Math.max(0,size-1),i));
    const start=i=>table?table[clamp(i)]:clamp(i)/fps;
    const nearest=value=>{
      if(!size)return 0;if(!table)return clamp(Math.round((Number.isFinite(value)?value:0)*fps));
      let lo=0,hi=size;while(lo<hi){const mid=(lo+hi)>>>1;if(table[mid]<value)lo=mid+1;else hi=mid;}
      if(!lo)return 0;if(lo===size)return size-1;return value-table[lo-1]<table[lo]-value?lo-1:lo;
    };
    const interval=i=>{i=clamp(i);const from=start(i),end=i+1<size?start(i+1):duration;return {index:i,start:from,end,duration:Math.max(0,end-from)};};
    return {duration,fps,count:size,start,indexAt:nearest,snap:value=>start(nearest(value)),step:(value,direction)=>start(clamp(nearest(value)+direction)),interval};
  }
  const api={frameModel,view,zoom,ticks,sampleTimes,edgePan};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MotionTimeline=api;
})(typeof window!=='undefined'?window:globalThis);
