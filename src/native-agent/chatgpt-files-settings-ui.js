import {recoverControlFocus} from './control-focus.js';

const PROTOCOL='opendesk.chatgpt.project.v1';
const PREFERENCES_KEY='opendesk.chatgpt.files.preferences.v1';

// Trusted Options controls only: the existing background owns preferences and authority.
export function initChatGPTFilesSettingsUI({api=globalThis.chrome,document:doc=globalThis.document}={}) {
  const enabled=doc.getElementById('chatgpt-files-enabled');
  const diagnostics=doc.getElementById('chatgpt-files-diagnostics');
  const status=doc.getElementById('chatgpt-files-settings-status');
  if(!enabled||!diagnostics||!status)return ()=>{};
  const fields=[[enabled,'enabled'],[diagnostics,'diagnosticsVisible']];
  let state=null,busy=false,disposed=false,refreshAgain=false,focusRecovery;
  const removers=[];
  function listen(target,type,handler){
    target?.addEventListener(type,handler);
    removers.push(()=>target?.removeEventListener(type,handler));
  }
  function render(){
    for(const [control,key] of fields){
      if(state)control.checked=state[key];
      control.disabled=disposed||busy||!state;
    }
  }
  async function request(action,preferences){
    const reply=await api.runtime.sendMessage({protocol:PROTOCOL,action,...(preferences?{preferences}:{})});
    if(!reply?.ok)throw reply?.error||new Error('未收到设置回执');
    const value=reply.data?.preferences;
    if(typeof value?.enabled!=='boolean'||typeof value?.diagnosticsVisible!=='boolean')
      throw new Error('设置回执无效');
    return {enabled:value.enabled,diagnosticsVisible:value.diagnosticsVisible};
  }
  async function update(preferences){
    if(disposed)return;
    if(busy){refreshAgain=true;return;}
    const recovery=recoverControlFocus(doc);
    focusRecovery=recovery;
    busy=true;render();recovery.disabled();
    status.textContent=preferences?'正在保存设置…':'正在读取设置…';
    try{
      let value,recovered=false;
      try{value=await request(preferences?'configure':'settings',preferences);}
      catch(error){
        if(!preferences||disposed)throw error;
        // A configure may already have persisted. Never replay or invent a rollback.
        value=await request('settings');recovered=true;
      }
      if(disposed)return;
      state=value;
      status.textContent=(recovered?'保存回执未确认，已回读当前设置。':'')+
        (state.enabled?'项目文件处理已开启。':'项目文件处理已关闭，停止接收新任务；已派发写入请查看真实回执。');
    }catch(error){
      if(disposed)return;
      state=null;
      status.textContent='设置状态未知，请返回此页重新读取。'+(error?.message||'未收到有效回执');
    }finally{
      busy=false;
      if(!disposed)render();
      recovery.restore(!disposed);focusRecovery=null;
      if(refreshAgain&&!disposed){refreshAgain=false;void update();}
    }
  }
  for(const [control,key] of fields)listen(control,'change',event=>{
    if(!event.isTrusted||busy||!state||disposed){render();return;}
    if(control.checked===state[key])return;
    void update({[key]:control.checked});
  });
  const refresh=()=>{if(!doc.hidden)void update();};
  listen(doc.defaultView,'focus',refresh);
  const changed=(changes,area)=>{
    if(area==='local'&&Object.hasOwn(changes,PREFERENCES_KEY))void update();
  };
  api.storage?.onChanged?.addListener(changed);
  function destroy(){
    if(disposed)return;
    disposed=true;refreshAgain=false;
    for(const remove of removers)remove();
    api.storage?.onChanged?.removeListener(changed);
    focusRecovery?.restore(false);
    render();
  }
  listen(doc.defaultView,'pagehide',destroy);
  void update();
  return destroy;
}
