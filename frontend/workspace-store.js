(function(root){
 'use strict';
 class Store{
  constructor(client,capture,restore,status){this.client=client;this.capture=capture;this.restore=restore;this.status=status;this.revision=0;this.ready=false;this.dirty=false;this.saving=null;this.timer=null;this.last='';this.restoring=false;}
  async init(){this.status('正在恢复工作区…');const record=await (await this.client.request('/workspace-cache')).json();this.revision=record.revision;if(record.snapshot){this.restoring=true;try{await this.restore(record.snapshot);}finally{this.restoring=false;}}this.ready=true;this.status(record.snapshot?'已恢复临时缓存':'临时缓存已启用');}
  changed(){if(!this.ready||this.restoring)return;this.dirty=true;clearTimeout(this.timer);this.status('有修改 · 正在缓存');this.timer=setTimeout(()=>this.flush().catch(()=>{}),600);}
  async flush(){
   if(!this.ready||this.restoring)return;
   if(this.saving){await this.saving;if(this.dirty)return this.flush();return;}
   clearTimeout(this.timer);
   if(!this.dirty)return;
   this.saving=(async()=>{try{while(this.dirty){this.dirty=false;const snapshot=await this.capture();const text=JSON.stringify(snapshot);if(text!==this.last){const response=await (await this.client.request('/workspace-cache',{revision:this.revision,snapshot})).json();this.revision=response.revision;this.last=text;}}this.status('临时缓存已保存');}catch(e){this.dirty=true;this.status('缓存未完成：'+e.message);throw e;}finally{this.saving=null;}})();
   await this.saving;
  }
  async saveNamed(name){this.changed();await this.flush();return (await this.client.request('/workspaces/save',{name,revision:this.revision})).json();}
  async openNamed(name){await this.flush();const response=await (await this.client.request('/workspaces/open',{name})).json();this.restoring=true;try{await this.restore(response.snapshot);}finally{this.restoring=false;}this.changed();await this.flush();return response.snapshot;}
 }
 root.WorkbenchWorkspace={Store};
})(typeof window==='undefined'?globalThis:window);
