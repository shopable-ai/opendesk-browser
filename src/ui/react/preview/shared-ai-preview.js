// OFFLINE UI_PREVIEW_ONLY. Not a Provider Runtime, Host or Permission Authority.
// The preview never retains a credential or sends a request to a model or page.
const allowedSources=new Set(['local_codex','custom_https','cloud_responses']);

// The real settings Portal targets document.body. In an offline HTML review,
// bound that viewport to the displayed Side Panel, without moving React DOM.
export function bindPreviewSettingsViewport(stage){
 const doc=stage.ownerDocument,view=doc.defaultView,style=doc.documentElement.style;
 const sync=()=>{
  const rect=stage.getBoundingClientRect();
  for(const key of ['left','top','width','height'])
   style.setProperty('--od-preview-stage-'+key,rect[key]+'px');
 };
 const observer=new view.ResizeObserver(sync);
 observer.observe(stage);view.addEventListener('resize',sync);
 view.addEventListener('scroll',sync,true);sync();
 return ()=>{
  observer.disconnect();view.removeEventListener('resize',sync);
  view.removeEventListener('scroll',sync,true);
  for(const key of ['left','top','width','height'])style.removeProperty('--od-preview-stage-'+key);
 };
}
const endpointOrigin=endpoint=>{
 try{const origin=new URL(endpoint).origin;return origin==='null'?null:origin;}
 catch{return null;}
};
export function createPreviewProviderSettings(){
 const listeners=new Set();
 let publicState=Object.freeze({source:'local_codex',httpsSource:null,
  endpoint:'https://api.openai.com/v1/chat/completions',model:'',
  hasApiKey:false,generation:1});
 const snapshot=()=>publicState;
 const notify=()=>{for(const listener of [...listeners])listener();};
 return Object.freeze({
  settingsSnapshot:snapshot,
  subscribeSettings(listener){listeners.add(listener);return ()=>listeners.delete(listener);},
  updateSettings(patch={}){
   if(!patch||typeof patch!=='object'||Array.isArray(patch)||
    Object.keys(patch).some(key=>!['source','endpoint','model','apiKey'].includes(key)))
    throw new Error('不支持的预览设置字段');
   const source=patch.source??publicState.source;
   if(!allowedSources.has(source))throw new Error('不支持的 AI 来源');
   const endpoint=patch.endpoint??publicState.endpoint;
   const model=patch.model??publicState.model;
   if(typeof endpoint!=='string'||typeof model!=='string')
    throw new Error('预览设置格式错误');
   if(Object.hasOwn(patch,'apiKey')&&typeof patch.apiKey!=='string')
    throw Object.assign(new Error('预览设置格式错误'),{code:'E_AI_CONFIG'});
   if(publicState.hasApiKey&&!Object.hasOwn(patch,'apiKey')&&
    (!endpointOrigin(endpoint)||endpointOrigin(endpoint)!==endpointOrigin(publicState.endpoint)))
    throw Object.assign(new Error('接收端来源已改变或地址无效，请输入新的 API Key，或明确清空 API Key 后保存'),{code:'E_AI_CONFIG'});
   const hasApiKey=Object.hasOwn(patch,'apiKey')?Boolean(patch.apiKey):publicState.hasApiKey;
   const httpsSource=source==='local_codex'?
    (endpoint===publicState.endpoint?publicState.httpsSource:null):source;
   if(source===publicState.source&&endpoint===publicState.endpoint&&model===publicState.model&&
    hasApiKey===publicState.hasApiKey&&httpsSource===publicState.httpsSource)return snapshot();
   // API Key is deliberately never saved, even in this offline-only adapter.
   publicState=Object.freeze({source,httpsSource,endpoint,model,hasApiKey,
    generation:publicState.generation+1});
   notify();return snapshot();
  },
  dispose(){listeners.clear();}
 });
}
// Fake conversation only for the six-tab visual review. The actual Tasks
// Agent/RunHost never participates; no grants, installations or executions.
export function createPreviewMyAgent(){
 const listeners=new Set();
 let seq=0,timeout=null;
 let state=Object.freeze({open:false,rows:[],draft:'',status:'idle',
  pending:null,step:'',busy:false});
 const publish=patch=>{
  state=Object.freeze({...state,...patch});
  for(const listener of [...listeners])listener();
 };
 const cancelTimer=()=>{if(timeout!==null)clearTimeout(timeout);timeout=null;};
 return Object.freeze({
  subscribe(listener){listeners.add(listener);return ()=>listeners.delete(listener);},
  getSnapshot:()=>state,
  toggle(){publish({open:!state.open});},
  setDraft(draft){publish({draft:String(draft).slice(0,4000)});},
  send(draft,event){
   if(event?.isTrusted!==true||state.busy||state.pending||!String(draft).trim())return;
   cancelTimer();
   const id=++seq;
   publish({busy:true,status:'thinking',
    rows:[...state.rows,{id:'preview-user-'+id,speaker:'你',message:String(draft)}].slice(-24),
    step:'正在预览发送/停止按钮 · 无真实 AI 或 Task 执行'});
   timeout=setTimeout(()=>{
    timeout=null;
    publish({busy:false,status:'idle',
     rows:[...state.rows,{id:'preview-system-'+id,speaker:'系统',
      message:'这只是界面预览，没有连接 AI Provider，也没有执行任务。'}].slice(-24),
     step:'仅预览界面 · 无真实 RunHost 回执'});
   },3000);
  },
  stop(){
   if(!state.busy)return;
   cancelTimer();publish({busy:false,status:'idle',
    rows:[...state.rows,{id:'preview-stop-'+(++seq),speaker:'系统',
      message:'演示已停止；没有产生任何真实执行。'}].slice(-24),
    step:'预览停止成功；不代表真实 Host Stop'});
  },
  dispose(){cancelTimer();listeners.clear();}
 });
}
