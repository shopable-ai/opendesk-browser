(() => {
  'use strict';
  const tool=globalThis.OpenDeskTool;
  const root=tool?.root,request=tool?.request;
  const toggle=root?.querySelector('#gesture-enabled');
  const triggerControl=root?.querySelector('#gesture-trigger');
  const menuControl=root?.querySelector('#gesture-menu-policy');
  const menuHelp=root?.querySelector('#gesture-menu-help');
  const traceControl=root?.querySelector('#gesture-trace');
  const comboControl=root?.querySelector('#gesture-combo');
  const comboActionControl=root?.querySelector('#gesture-combo-action');
  const hint=root?.querySelector('#gesture-help');
  const error=root?.querySelector('#gesture-error');
  if(!toggle||!triggerControl||!traceControl||!hint||!error||
    typeof request!=='function')throw Error('E_MOUSE_GESTURES_TOOL_CONTEXT');
  const key='preferences';
  let closed=false,busy=false,revision=0;
  let current={enabled:true,trigger:'right',menuPolicy:'native-first',
    showTrace:true,gestureMappings:{}};
  const comboKeys=new Set(['left-up','left-down','right-up','right-down',
    'up-left','up-right','down-left','down-right']);
  const validActions=new Set(['left','right','up','down']);
  function cleanMappings(value){
    if(!value||typeof value!=='object'||Array.isArray(value))return {};
    const result={};
    for(const key of comboKeys)if(validActions.has(value[key]))result[key]=value[key];
    return result;
  }
  const showError=message=>{error.textContent=message;error.hidden=!message;};
  const controlsDisabled=disabled=>{
    toggle.disabled=disabled;triggerControl.disabled=disabled;traceControl.disabled=disabled;
    if(menuControl)menuControl.disabled=disabled;
    if(comboControl)comboControl.disabled=disabled;
    if(comboActionControl)comboActionControl.disabled=disabled;
  };
  function apply(){
    toggle.checked=current.enabled;
    toggle.setAttribute('aria-checked',String(current.enabled));
    triggerControl.value=current.trigger;
    if(menuControl)menuControl.value=current.menuPolicy;
    if(menuHelp)menuHelp.textContent=current.menuPolicy==='gesture-first'?
      '手势优先会拦截已授权网页空白处的普通右键菜单。按住 Shift 再右键可使用原生菜单；链接、输入框等排除区域仍保留原生菜单。':
      '默认保留普通右键菜单。若 macOS 在拖动前就弹出菜单，手势可能无法开始；可改用 Option / Alt + 左键或手动启用手势优先。';
    traceControl.checked=current.showTrace;
    if(comboControl&&comboActionControl)
      comboActionControl.value=current.gestureMappings[comboControl.value]||'none';
    hint.textContent=current.trigger==='alt-left'?
      '按住 Option / Alt 与左键拖动，松开执行 · Esc 取消':
      '右键拖动，松开执行 · Esc 取消';
  }
  async function readSettings(){
    const saved=await request('storage.get',{key,withEtag:true});
    const value=saved?.value;
    if(typeof saved?.etag!=='string'||!saved.etag||
      (value!=null&&(typeof value!=='object'||Array.isArray(value)))||
      (value?.enabled!==undefined&&typeof value.enabled!=='boolean'))
      throw Error('E_GESTURE_SETTINGS');
    return saved;
  }
  const parse=saved=>({
    // Authorized new installations start enabled without writing on first read.
    enabled:saved?.value?.enabled!==false,
    trigger:saved?.value?.trigger==='alt-left'?'alt-left':'right',
    menuPolicy:saved?.value?.menuPolicy==='gesture-first'?'gesture-first':'native-first',
    showTrace:saved?.value?.showTrace!==false,
    gestureMappings:cleanMappings(saved?.value?.gestureMappings)
  });
  async function refresh(){
    if(closed||busy)return;
    const turn=++revision;
    controlsDisabled(true);
    try{
      const saved=await readSettings();
      if(closed||turn!==revision)return;
      current=parse(saved);
      showError('');
    }catch{
      if(closed||turn!==revision)return;
      current={...current,enabled:false}; // No permission/readback: fail closed.
      showError('无法读取设置，请检查扩展安装及权限');
    }finally{
      if(!closed&&turn===revision){apply();controlsDisabled(Boolean(error.textContent));}
    }
  }
  async function persist(changes){
    if(closed||busy)return;
    const turn=++revision;
    controlsDisabled(true);busy=true;
    tool.setState?.({busy:true,dirty:true});showError('');
    let written=false;
    try{
      for(let attempt=0;attempt<3;attempt++){
        const before=await readSettings();
        if(closed)return;
        try{
          const value={...(before.value||{}),...(typeof changes==='function'?changes(before.value||{}):changes)};
          const receipt=await request('storage.set',{key,value,ifMatch:before.etag});
          if(receipt?.saved!==true)throw Error('E_GESTURE_SAVE_UNKNOWN');
          written=true;break;
        }catch(err){
          if(err?.code!=='E_STORAGE_CONFLICT'||attempt===2)throw err;
        }
      }
      if(closed)return;
      // Best effort; existing Page Authority re-reads the shared settings.
      void request('page.request',{operation:'gesture.refresh',payload:{}}).catch(()=>{});
    }catch{
      if(!closed)showError('设置保存未确认；已保留原设置，请重试');
    }finally{
      if(!closed){
        busy=false;tool.setState?.({busy:false,dirty:false});
        let readable=false;
        try{
          const confirmed=await readSettings();
          if(!closed){current=parse(confirmed);readable=true;if(written)showError('');}
        }catch{if(!closed)showError('无法确认设置状态，请重新打开此页面');}
        if(!closed&&turn===revision){apply();controlsDisabled(!readable);}
      }
    }
  }
  toggle.addEventListener('change',()=>void persist({enabled:toggle.checked}));
  triggerControl.addEventListener('change',()=>void persist({trigger:triggerControl.value}));
  menuControl?.addEventListener('change',()=>void persist({menuPolicy:menuControl.value}));
  traceControl.addEventListener('change',()=>void persist({showTrace:traceControl.checked}));
  comboControl?.addEventListener('change',()=>{
    if(comboActionControl)comboActionControl.value=current.gestureMappings[comboControl.value]||'none';
  });
  comboActionControl?.addEventListener('change',()=>{
    if(!comboControl||!comboKeys.has(comboControl.value))return;
    const key=comboControl.value,action=comboActionControl.value;
    if(action!=='none'&&!validActions.has(action))return;
    void persist(old=>{
      const map=cleanMappings(old.gestureMappings);
      if(action==='none')delete map[key];else map[key]=action;
      return {gestureMappings:map};
    });
  });
  root.addEventListener('opendesk-page-changed',()=>void refresh());
  window.addEventListener('focus',()=>void refresh());
  window.addEventListener('pagehide',()=>{closed=true;revision++;},{once:true});
  controlsDisabled(true);apply();void refresh();
})();
