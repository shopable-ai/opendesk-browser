// UI projection, never a second workflow/Run/permission authority. The view
// publishes immutable snapshots; React alone renders and updates DOM.
const initialControls={
  "workflow-saved-state": {
    "hidden": true
  },
  "workflow-history-toggle": {
    "title": "历史"
  },
  "workflow-ai-new-session": {
    "title": "新对话"
  },
  "workflow-new": {
    "title": "新建工作流（检查未保存草稿）"
  },
  "workflow-new-review": {
    "hidden": true
  },
  "workflow-ai-transcript": {
    "hidden": true
  },
  "workflow-planning-indicator": {
    "hidden": true
  },
  "workflow-ai-progress": {
    "hidden": true
  },
  "workflow-ai-approval": {
    "hidden": true
  },
  "workflow-run-review": {
    "hidden": true
  },
  "workflow-ai-proposal": {
    "hidden": true
  },
  "workflow-plan-panel": {
    "hidden": true
  },
  "workflow-edit-details": {
    "title": "编辑工作流"
  },
  "workflow-target-warning": {
    "hidden": true
  },
  "workflow-params-panel": {
    "hidden": true
  },
  "workflow-params-empty": {
    "hidden": true
  },
  "workflow-result-panel": {
    "hidden": true
  },
  "workflow-result-raw": {
    "hidden": true
  },
  "workflow-manage-panel": {
    "hidden": true
  },
  "workflow-manage-close": {
    "title": "收起"
  },
  "workflow-refresh": {
    "title": "刷新列表"
  },
  "workflow-ai-resume": {
    "hidden": true
  },
  "workflow-provider-toggle": {
    "title": "AI 设置"
  },
  "workflow-ai-plan": {
    "title": "发送并执行"
  },
  "workflow-ai-cancel": {
    "hidden": true,
    "title": "停止 AI 规划"
  },
  "workflow-ai-provider": {
    "value": "local_codex"
  },
  "workflow-https-mode": {
    "hidden": true
  },
  "workflow-https-protocol": {
    "value": "custom_https"
  },
  "workflow-local-connected": {
    "hidden": true
  },
  "workflow-custom-settings": {
    "hidden": true
  },
  "workflow-ai-endpoint": {
    "value": "https://api.openai.com/v1/chat/completions"
  },
  "workflow-observation-revoke": {
    "disabled": true
  },
  "workflow-status": {
    "hidden": true
  },
  "workflow-dock": {
    "hidden": true
  },
  "workflow-run": {
    "disabled": true
  },
  "workflow-save": {
    "disabled": true
  },
  "workflow-stop": {
    "disabled": true
  }
};
export function createWorkflowUIState() {
  let disposed=false,pending=false,version=0;
  const listeners=new Set(),controls={},proxies=new Map();
  const state={controls,steps:[],params:[],messages:[],progress:[],savedOptions:[],
    history:{open:false,rows:[],canResume:false},header:{},sourceName:'Codex',
    entryMode:'new-workflow',focusRequest:null};
  let snapshot;
  const publish=()=>{
    if(disposed||pending)return;
    pending=true;
    queueMicrotask(()=>{
      pending=false;if(disposed)return;
      snapshot=commit();
      for(const listener of [...listeners])listener();
    });
  };
  function control(id) {
    if(!proxies.has(id)) {
      const data={value:'',text:'',hidden:false,disabled:false,checked:false,open:false,
        title:'',dataset:{},...structuredClone(initialControls[id]||{})};
      data.dataset=new Proxy(data.dataset,{set(target,key,value){target[key]=value;publish();return true;}});
      controls[id]=data;
      proxies.set(id,new Proxy(data,{set(target,key,value){
        if(target[key]!==value){target[key]=value;publish();}return true;
      }}));
    }
    return proxies.get(id);
  }
  // Proxies never enter a React snapshot (structuredClone rejects Proxy).
  const copy=()=>({...state,controls:Object.fromEntries(Object.entries(controls)
    .map(([key,value])=>[key,{...value,dataset:{...value.dataset}}]))});
  // The proxy data are shallow UI records. Clone their plain projection at emit.
  const commit=()=>structuredClone(copy());
  for(const id of Object.keys(initialControls))control(id);
  snapshot=commit();
  return {
    control,
    patch(next){if(!disposed){Object.assign(state,next);publish();}},
    setFocus(id){if(!disposed){state.focusRequest={id,version:++version};publish();}},
    getSnapshot:()=>snapshot,
    subscribe(listener){if(disposed)return ()=>{};listeners.add(listener);return ()=>listeners.delete(listener);},
    dispose(){disposed=true;listeners.clear();proxies.clear();},
  };
}
