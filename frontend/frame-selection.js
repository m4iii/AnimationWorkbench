(function(root){
  'use strict';

  function frameIds(frames){
    return Array.from(new Set(frames.map(frame=>frame.id)));
  }

  // Selection follows frame identity, never its changing timeline index.
  function reconcile(frames,primaryId,selectedIds){
    const ordered=frameIds(frames),existing=new Set(ordered);
    const requested=new Set(Array.isArray(selectedIds)?selectedIds:[]);
    if(!ordered.length||(primaryId==null&&!requested.size))return {primaryId:null,selectedIds:[]};
    const primary=existing.has(primaryId)?primaryId:ordered[0];
    requested.add(primary);
    return {primaryId:primary,selectedIds:ordered.filter(id=>requested.has(id))};
  }

  function choose(frames,primaryId,selectedIds,id,{toggle=false,range=false}={}){
    const ordered=frameIds(frames),current=reconcile(frames,primaryId,selectedIds);
    const target=ordered.indexOf(id);
    if(target<0)return current;
    if(range){
      const anchor=ordered.indexOf(current.primaryId);
      const start=anchor<0?target:Math.min(anchor,target),end=anchor<0?target:Math.max(anchor,target);
      const span=ordered.slice(start,end+1);return {primaryId:id,selectedIds:toggle?ordered.filter(key=>current.selectedIds.includes(key)||span.includes(key)):span};
    }
    if(toggle){
      const selected=new Set(current.selectedIds);
      if(selected.has(id))selected.delete(id);else selected.add(id);
      const next=ordered.filter(frameId=>selected.has(frameId));
      const primary=selected.has(id)?id:selected.has(current.primaryId)?current.primaryId:next[0]??null;
      return {primaryId:primary,selectedIds:next};
    }
    return {primaryId:id,selectedIds:[id]};
  }

  function mark(frames,ids,value){
    const selected=new Set(Array.isArray(ids)?ids:[]),matched=new Set();
    for(const frame of frames){
      if(!selected.has(frame.id))continue;
      frame.redraw=!!value;
      matched.add(frame.id);
    }
    return matched.size;
  }

  function marquee(frames,bounds,start,end,baseIds=[],additive=false){
    const left=Math.min(start.x,end.x),right=Math.max(start.x,end.x),top=Math.min(start.y,end.y),bottom=Math.max(start.y,end.y);
    const result=new Set(additive?baseIds:[]);
    if(right>left&&bottom>top)for(const box of bounds){
      if(box.left<right&&box.right>left&&box.top<bottom&&box.bottom>top)result.add(box.id);
    }
    return frameIds(frames).filter(id=>result.has(id));
  }

  const api={reconcile,choose,mark,marquee};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.FrameSelection=api;
})(typeof window!=='undefined'?window:globalThis);
