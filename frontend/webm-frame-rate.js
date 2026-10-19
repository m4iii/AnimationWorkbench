(function(root){
  'use strict';
  // Metadata only: DefaultDuration declares nanoseconds per frame. No decoding,
  // network requests or playback-based guesses are used by this reader.
  const MAX_PREFIX=8*1024*1024, MAX_ELEMENTS=100000;
  const unknown=reason=>({status:'unknown',reason});
  async function detect(blob,{isCancelled=()=>false}={}){
    try{
      if(isCancelled())return unknown('cancelled');
      if(!blob||!Number.isSafeInteger(blob.size)||blob.size<5||typeof blob.slice!=='function')return unknown('not_webm');
      const bytes=new Uint8Array(await blob.slice(0,Math.min(blob.size,MAX_PREFIX)).arrayBuffer());
      if(isCancelled())return unknown('cancelled');
      let elements=0;
      const check=()=>{if(isCancelled())throw Error('cancelled');if(++elements>MAX_ELEMENTS)throw Error('metadata_limit');};
      function vint(offset,isId=false){
        if(offset>=bytes.length)throw Error('truncated_metadata');
        const first=bytes[offset];let length=1,mask=128;
        while(length<=8&&!(first&mask)){length++;mask>>=1;}
        if(length>8||(isId&&length>4)||offset+length>bytes.length)throw Error('invalid_ebml');
        let value=isId?first:first&(mask-1),allOnes=!isId&&value===mask-1;
        for(let i=1;i<length;i++){value=value*256+bytes[offset+i];allOnes=allOnes&&bytes[offset+i]===255;}
        if(!allOnes&&!Number.isSafeInteger(value))throw Error('oversized_metadata');
        return {value,length,unknown:allOnes};
      }
      function element(offset,parentEnd){
        check();const id=vint(offset,true),size=vint(offset+id.length);
        const start=offset+id.length+size.length,end=size.unknown?parentEnd:start+size.value;
        if(!Number.isSafeInteger(end)||end>parentEnd||start>parentEnd)throw Error('invalid_ebml_bounds');
        return {id:id.value,start,end,unknown:size.unknown};
      }
      function uint(e){
        const n=e.end-e.start;if(e.unknown||n<1||n>8||e.end>bytes.length)throw Error('invalid_integer');
        let value=0;for(let p=e.start;p<e.end;p++)value=value*256+bytes[p];
        if(!Number.isSafeInteger(value))throw Error('oversized_integer');return value;
      }
      function children(start,end,visit){
        if(end>bytes.length)throw Error('metadata_limit');
        for(let p=start;p<end;){const e=element(p,end);if(e.unknown)throw Error('unknown_element_size');visit(e);p=e.end;}
      }
      function readTracks(tracks){
        const videoTracks=[];
        children(tracks.start,tracks.end,entry=>{
          if(entry.id!==0xAE)return;
          let type=null,enabled=1,duration=null;const seen=new Set();
          children(entry.start,entry.end,e=>{
            if(![0x83,0xB9,0x23E383].includes(e.id))return;
            if(seen.has(e.id))throw Error('duplicate_track_metadata');seen.add(e.id);
            const value=uint(e);
            if(e.id===0x83)type=value;
            else if(e.id===0xB9){if(value>1)throw Error('invalid_track_flag');enabled=value;}
            else duration=value;
          });
          if(type===null)throw Error('missing_track_type');
          if(type===1&&enabled)videoTracks.push({duration});
        });
        if(videoTracks.length!==1)return unknown(videoTracks.length?'multiple_video_tracks':'no_video_track');
        const duration=videoTracks[0].duration;
        if(!duration)return unknown('default_duration_missing');
        const fps=1e9/duration;
        if(!Number.isFinite(fps)||fps<1||fps>240)return unknown('unsupported_frame_rate');
        return {status:'detected',fps,source:'WebM DefaultDuration',variable:false,declared:true};
      }
      const header=element(0,blob.size);
      if(header.id!==0x1A45DFA3)return unknown('not_webm');
      if(header.unknown)return unknown('invalid_ebml_header');
      if(header.end>bytes.length)return unknown('metadata_limit');
      let segment=null;
      for(let p=header.end;p<blob.size&&p<bytes.length;){
        const e=element(p,blob.size);
        if(e.id===0x18538067){segment=e;break;}
        if(e.unknown)return unknown('unknown_element_size');p=e.end;
      }
      if(!segment)return unknown('segment_not_found');
      for(let p=segment.start;p<segment.end&&p<bytes.length;){
        const e=element(p,segment.end);
        if(e.unknown)return unknown('unknown_element_size');
        if(e.id===0x1654AE6B)return readTracks(e);
        p=e.end;
      }
      return unknown(blob.size>bytes.length?'metadata_limit':'tracks_not_found');
    }catch(error){return unknown(error?.message||'invalid_ebml');}
  }
  const api={detect,MAX_PREFIX};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.WebmFrameRate=api;
})(typeof globalThis!=='undefined'?globalThis:this);
