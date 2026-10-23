// OFFLINE UI_PREVIEW_ONLY. Not a Provider Runtime, Host or Permission Authority.
// The preview never retains a credential or sends a request to a model or page.
const allowedSources=new Set(['local_codex','custom_https','cloud_responses']);
export function createPreviewProviderSettings(){
 const listeners=new Set();
 let publicState=Object.freeze({source:'local_codex',
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
   const hasApiKey=Object.hasOwn(patch,'apiKey')?Boolean(String(patch.apiKey||'')):publicState.hasApiKey;
   // API Key is deliberately never saved, even in this offline-only adapter.
   publicState=Object.freeze({source,endpoint,model,hasApiKey,
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
  pending:null,step:'仅布局和交互预览；未连接任务执行宿主',busy:false});
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
