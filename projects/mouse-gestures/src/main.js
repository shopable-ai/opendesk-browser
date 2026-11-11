(() => {
  'use strict';
  const tool=globalThis.OpenDeskTool;
  const root=tool?.root,request=tool?.request;
  const toggle=root?.querySelector('#gesture-enabled');
  const error=root?.querySelector('#gesture-error');
  if(!toggle||!error||typeof request!=='function')throw Error('E_MOUSE_GESTURES_TOOL_CONTEXT');
  const key='preferences';
  let closed=false,busy=false,enabled=false,revision=0;
  const updateUI=()=>{toggle.checked=enabled;toggle.setAttribute('aria-checked',String(enabled));};
  const showError=message=>{error.textContent=message;error.hidden=!message;};
  const validValue=value=>value===null||value===undefined||
    (typeof value==='object'&&!Array.isArray(value));
  async function readSettings(){
    const saved=await request('storage.get',{key,withEtag:true});
    if(typeof saved?.etag!=='string'||!saved.etag||!validValue(saved.value))
      throw Error('E_GESTURE_SETTINGS');
    return saved;
  }
  async function refresh(){
    if(closed||busy)return;
    const turn=++revision;
    toggle.disabled=true;
    try{
      const saved=await readSettings();
      if(closed||turn!==revision)return;
      enabled=saved.value?.enabled===true;
      showError('');
    }catch{
      if(closed||turn!==revision)return;
      showError('无法读取设置，请检查扩展安装及权限');
    }finally{
      if(!closed&&turn===revision){updateUI();toggle.disabled=Boolean(error.textContent);}
    }
  }
  async function onChange(){
    if(closed||busy)return;
    const desired=toggle.checked;
    toggle.disabled=true;busy=true;revision++;
    tool.setState?.({busy:true,dirty:true});
    showError('');
    let written=false;
    try{
      for(let attempt=0;attempt<3;attempt++){
        const before=await readSettings();
        if(closed)return;
        try{
          const value={...(before.value||{}),enabled:desired};
          const receipt=await request('storage.set',{key,value,ifMatch:before.etag});
          if(receipt?.saved!==true)throw Error('E_GESTURE_SAVE_UNKNOWN');
          written=true;break;
        }catch(error){
          if(error?.code!=='E_STORAGE_CONFLICT'||attempt===2)throw error;
        }
      }
      if(closed)return;
      enabled=desired;
      // Best effort only: the target may be a restricted page or another tab.
      // The Page Module always checks the shared storage again on execution.
      void request('page.request',{operation:'gesture.refresh',payload:{}}).catch(()=>{});
    }catch{
      if(!closed)showError('设置保存未确认；已停止操作，请重新读取后再试');
    }finally{
      if(!closed){
        busy=false;tool.setState?.({busy:false,dirty:false});
        let readable=false;
        try{
          const confirmed=await readSettings();
          if(!closed){enabled=confirmed.value?.enabled===true;readable=true;if(written)showError('');}
        }catch{if(!closed)showError('无法确认设置状态，请重新打开此页面');}
        if(!closed){updateUI();toggle.disabled=!readable;}
      }
    }
  }
  toggle.addEventListener('change',()=>void onChange());
  root.addEventListener('opendesk-page-changed',()=>void refresh());
  window.addEventListener('focus',()=>void refresh());
  window.addEventListener('pagehide',()=>{closed=true;revision++;},{once:true});
  void refresh();
})();
