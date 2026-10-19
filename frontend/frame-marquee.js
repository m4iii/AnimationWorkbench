(function(root){
 'use strict';
 function attach(editor){
  const list=editor.q('frames');let gesture=null,raf=0;
  const origin=()=>{const r=list.getBoundingClientRect();return {x:r.left+list.clientLeft,y:r.top+list.clientTop};};
  const point=(x,y)=>{const o=origin();return {x:x-o.x+list.scrollLeft,y:y-o.y+list.scrollTop};};
  function paint(){
   const g=gesture;if(!g||!g.moved)return;const raw=point(g.x,g.y),end={x:Math.max(0,Math.min(g.contentWidth-1,raw.x)),y:Math.max(0,Math.min(g.contentHeight-1,raw.y))};
   const ids=FrameSelection.marquee(editor.frames,g.bounds,g.start,end,g.base,g.additive);
   editor.selectionIds=ids;editor.selected=ids.includes(g.primary)?g.primary:ids[0]||null;
   for(const card of list.querySelectorAll('[data-frame-id]')){const selected=ids.includes(card.dataset.frameId);card.classList.toggle('selected',selected);card.setAttribute('aria-selected',String(selected));}
   Object.assign(g.box.style,{left:Math.min(g.start.x,end.x)+'px',top:Math.min(g.start.y,end.y)+'px',width:Math.abs(g.start.x-end.x)+'px',height:Math.abs(g.start.y-end.y)+'px'});
   editor.updateInspector();editor.renderMarkers();
  }
  function autoScroll(){raf=0;if(!gesture?.moved)return;const r=list.getBoundingClientRect(),x=gesture.x,y=gesture.y;
   const vertical=editor.frameLayout==='grid'?(list.closest?.('.studio-bottom')||list):list;
   const viewport=vertical.getBoundingClientRect(),top=Math.max(r.top,viewport.top),bottom=Math.min(r.bottom,viewport.bottom);
   const dx=x<r.left+22?-12:x>r.right-22?12:0,dy=y<top+22?-12:y>bottom-22?12:0,oldX=list.scrollLeft,oldY=vertical.scrollTop;
   if(dx)list.scrollLeft=Math.max(0,Math.min(gesture.contentWidth-list.clientWidth,list.scrollLeft+dx));
   const maxY=vertical===list?gesture.contentHeight-list.clientHeight:vertical.scrollHeight-vertical.clientHeight;
   if(dy)vertical.scrollTop=Math.max(0,Math.min(maxY,vertical.scrollTop+dy));
   if(oldX!==list.scrollLeft||oldY!==vertical.scrollTop)paint();raf=requestAnimationFrame(autoScroll);
  }
  function finish(e,cancelled=false){
   const g=gesture;if(!g||e&&e.pointerId!==g.pointerId)return;
   if(!cancelled&&g.epoch===editor.epoch&&g.moved){if(Number.isFinite(e?.clientX)){g.x=e.clientX;g.y=e.clientY;}paint();}
   gesture=null;editor.marqueeGesture=null;if(raf)cancelAnimationFrame(raf);raf=0;g.box?.remove();
   if(list.hasPointerCapture(g.pointerId))list.releasePointerCapture(g.pointerId);
   if(g.epoch!==editor.epoch)return;
   if(cancelled){const state=FrameSelection.reconcile(editor.frames,g.primary,g.base);editor.selected=state.primaryId;editor.selectionIds=state.selectedIds;editor.renderFrames();return;}
   if(!g.moved){if(g.cardId)editor.select(g.cardId,{toggle:true,range:g.range,visibleOnly:true});else{editor.renderFrames();}}
   else{editor.renderFrames();const frame=editor.frames.find(f=>f.id===editor.selected);if(frame?.kind==='video')editor.setCursor(frame.time);editor.action('motion.select',{frameIds:editor.selectionIds,method:'marquee'});}
   list.focus({preventScroll:true});
  }
  list.addEventListener('pointerdown',e=>{
   if(e.button!==0||editor.frameSortMode||editor.batch||editor.drag||gesture||!editor.frames.length||e.target.closest('button,input,select,textarea'))return;
   const r=list.getBoundingClientRect();if(e.clientY>=r.top+list.clientHeight||e.clientX>=r.left+list.clientWidth)return;
   e.preventDefault();editor.stopSequence();editor.video.pause();list.focus({preventScroll:true});const o=origin();
   const bounds=Array.from(list.querySelectorAll('[data-frame-id]')).map(card=>{const b=card.getBoundingClientRect();return {id:card.dataset.frameId,left:b.left-o.x+list.scrollLeft,top:b.top-o.y+list.scrollTop,right:b.right-o.x+list.scrollLeft,bottom:b.bottom-o.y+list.scrollTop};});
   gesture={epoch:editor.epoch,pointerId:e.pointerId,x:e.clientX,y:e.clientY,initialX:e.clientX,initialY:e.clientY,start:point(e.clientX,e.clientY),bounds,contentWidth:list.scrollWidth,contentHeight:list.scrollHeight,primary:editor.selected,base:[...(editor.selectionIds||[])],cardId:e.target.closest('[data-frame-id]')?.dataset.frameId||null,additive:true,toggle:true,range:e.shiftKey,moved:false};
   editor.marqueeGesture=gesture;list.setPointerCapture(e.pointerId);
  });
  list.addEventListener('pointermove',e=>{const g=gesture;if(!g||e.pointerId!==g.pointerId)return;g.x=e.clientX;g.y=e.clientY;
   if(!g.moved&&Math.hypot(e.clientX-g.initialX,e.clientY-g.initialY)<5)return;
   if(!g.moved){g.moved=true;g.box=document.createElement('div');g.box.className='frame-marquee';g.box.setAttribute('aria-hidden','true');list.append(g.box);raf=requestAnimationFrame(autoScroll);}paint();
  });
  list.addEventListener('pointerup',e=>finish(e));list.addEventListener('pointercancel',e=>finish(e,true));list.addEventListener('lostpointercapture',e=>finish(e,true));
  list.addEventListener('click',e=>{if(!editor.frameSortMode)return;const card=e.target.closest('[data-frame-id]');if(card)editor.select(card.dataset.frameId,{toggle:true,range:e.shiftKey,visibleOnly:true});});
  list.addEventListener('keydown',e=>{
   if(e.key==='Escape'&&gesture){e.preventDefault();finish(null,true);return;}
   if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='a'){e.preventDefault();if(gesture)finish(null);editor.selectionIds=(editor.visibleFrames?.()||editor.frames).map(f=>f.id);editor.selected=editor.selectionIds.includes(editor.selected)?editor.selected:editor.selectionIds[0]||null;editor.renderFrames();}
   if(['Delete','Backspace'].includes(e.key)&&!e.repeat){e.preventDefault();if(gesture)finish(null);editor.removeSelected();}
  });
  editor.cancelMarquee=()=>finish(null,true);
 }
 const api={attach};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.FrameMarquee=api;
})(typeof window!=='undefined'?window:globalThis);
