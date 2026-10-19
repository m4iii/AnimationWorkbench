(function(root){
 'use strict';
 class Client {
  constructor(){this.base='';this.token='';this.capabilities=null;this.assets=new WeakMap();}
  async request(path,body,raw=false){
   if(!this.token)throw new Error('请通过本机后端端口打开工作台。');
   const response=await fetch(this.base+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+this.token,...(body===undefined?{}:{'Content-Type':raw?'application/octet-stream':'application/json'})},body:body===undefined?undefined:raw?body:JSON.stringify(body),signal:AbortSignal.timeout(path.startsWith('/workspaces/')?240000:raw?120000:30000)});
   if(!response.ok){let error;try{error=(await response.json()).error;}catch{}throw new Error(error||'后端请求失败：'+response.status);}
   return response;
  }
  async connect(){
   const location=root.location;
   if(location.protocol!=='http:'||!['127.0.0.1','localhost'].includes(location.hostname))throw new Error('请通过本机后端端口打开工作台。');
   const bootstrap=JSON.parse(document.getElementById('backend-bootstrap').textContent);
   this.base=location.origin;this.token=typeof bootstrap.token==='string'?bootstrap.token:'';this.capabilities=null;this.assets=new WeakMap();
   this.capabilities=await (await this.request('/capabilities')).json();return this.capabilities;
  }
  async upload(blob,name){
   if(!(blob instanceof Blob))throw new Error('原始素材未关联，请重新导入。');
   if(this.assets.has(blob))return this.assets.get(blob);
   const promise=this.request('/assets?name='+encodeURIComponent(name||'asset'),blob,true).then(r=>r.json());this.assets.set(blob,promise);
   try{return await promise;}catch(e){this.assets.delete(blob);throw e;}
  }
  async localBlob(url){
   if(!/^(blob:|data:)/.test(url))throw new Error('只允许本页导入的本地素材。');
   return (await fetch(url)).blob();
  }
  async asset(id){return (await this.request('/assets/'+encodeURIComponent(id))).blob();}
  async submit(kind,payload){return (await this.request('/'+kind+'-jobs',payload)).json();}
  async job(id){return (await this.request('/jobs/'+encodeURIComponent(id))).json();}
  async jobs(){return (await this.request('/jobs')).json();}
  async jobDetails(id){return (await this.request('/jobs/'+encodeURIComponent(id)+'/details')).json();}
  async cancel(id){return (await this.request('/jobs/'+encodeURIComponent(id)+'/cancel',{})).json();}
  async artifact(id){return (await this.request('/artifacts/'+encodeURIComponent(id))).blob();}
 }
 root.WorkbenchBackend={Client};
})(window);
