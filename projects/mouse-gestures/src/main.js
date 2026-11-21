(() => {
  'use strict';
  const tool=globalThis.OpenDeskTool;
  const root=tool?.root,request=tool?.request;
  const toggle=root?.querySelector('#gesture-enabled');
  const triggerControl=root?.querySelector('#gesture-trigger');
  const menuHelp=root?.querySelector('#gesture-menu-help');
  const compatSummary=root?.querySelector('#gesture-compat-summary');
  const comboSummary=root?.querySelector('#gesture-combo-summary');
  const traceControl=root?.querySelector('#gesture-trace');
  const comboControl=root?.querySelector('#gesture-combo');
  const comboActionControl=root?.querySelector('#gesture-combo-action');
  const hint=root?.querySelector('#gesture-help');
  const pageStatusView=root?.querySelector('#gesture-page-status');
  const error=root?.querySelector('#gesture-error');
  if(!toggle||!triggerControl||!traceControl||!hint||!error||
    typeof request!=='function')throw Error('E_MOUSE_GESTURES_TOOL_CONTEXT');
  const key='preferences';
  let closed=false,busy=false,revision=0;
  let pageGeneration=0,unknownPageResult=false,checkingPage=false,checkAgain=false;
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
  const showPageStatus=message=>{if(pageStatusView)pageStatusView.textContent=message;};
  async function checkPage(){
    if(closed||busy||unknownPageResult)return;
    if(checkingPage){checkAgain=true;return;}
    checkingPage=true;
    const turn=revision,generation=pageGeneration,enabled=current.enabled;
    showPageStatus('正在核对当前网页…');
    let result;
    try{
      const receipt=await request('page.request',{operation:'gesture.refresh',payload:{}});
      result=receipt?.enabled===enabled?(enabled?'设置已应用到当前网页':'已确认当前网页暂停手势'):
        '未确认当前网页采用了此设置';
    }catch(error){
      switch(error?.code){
        case 'E_APP_PAGE_ACTIVATION_REQUIRED':
        case 'E_USER_SCRIPTS_UNAVAILABLE': result='网页功能待开启。请在 Chrome 开启「允许用户脚本」，再到「扩展 → 网页功能设置」检查鼠标手势。';break;
        case 'E_PERMISSION': result='当前网站访问受限，请在扩展中核对网站权限。';break;
        case 'E_APP_PAGE_RELOAD_REQUIRED': result='当前网页仍在使用旧文档。请先保存网页内容，再刷新网页。';break;
        case 'E_EFFECT_UNKNOWN':
        case 'E_OUTCOME_UNKNOWN':
        case 'E_TOOL_TIMEOUT': result='网页请求结果未知。请先检查网页，再决定是否重新打开工具。';break;
        default: result='未确认当前网页已应用设置。若网页先于功能打开，请先保存内容，再刷新网页。';
      }
      if(!closed&&['E_EFFECT_UNKNOWN','E_OUTCOME_UNKNOWN','E_TOOL_TIMEOUT'].includes(error?.code)){
        unknownPageResult=true;showPageStatus(result);
      }
    }
    checkingPage=false;
    if(!closed&&turn===revision&&generation===pageGeneration&&!unknownPageResult)showPageStatus(result);
    if(checkAgain){checkAgain=false;void checkPage();}
  }
  const controlsDisabled=disabled=>{
    toggle.disabled=disabled;triggerControl.disabled=disabled;traceControl.disabled=disabled;
    if(comboControl)comboControl.disabled=disabled;
    if(comboActionControl)comboActionControl.disabled=disabled;
  };
  function apply(){
    toggle.checked=current.enabled;
    toggle.setAttribute('aria-checked',String(current.enabled));
    triggerControl.value=current.trigger;
    if(menuHelp)menuHelp.textContent='普通点击、短拖和取消手势保留原菜单。若 macOS 菜单抢先出现，本次手势会安全取消；可选择 Option / Alt + 左键。';
    if(compatSummary)compatSummary.textContent=current.trigger==='alt-left'?
        'Option / Alt + 左键':'原生菜单优先';
    if(comboSummary){
      const count=Object.keys(current.gestureMappings).length;
      comboSummary.textContent=count?'已配置 '+count+' 组':'未配置';
    }
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
    menuPolicy:'native-first',
    showTrace:saved?.value?.showTrace!==false,
    gestureMappings:cleanMappings(saved?.value?.gestureMappings)
  });
  async function refresh(){
    if(closed||busy)return;
    const turn=++revision;
    controlsDisabled(true);
    if(!unknownPageResult)showPageStatus('正在核对当前网页…');
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
      if(!closed&&turn===revision){
        apply();controlsDisabled(Boolean(error.textContent));
        if(!error.textContent)void checkPage();
        else if(!unknownPageResult)showPageStatus('未核对当前网页');
      }
    }
  }
  async function persist(changes){
    if(closed||busy)return;
    const turn=++revision,active=()=>!closed&&turn===revision;
    const baseline=current;
    controlsDisabled(true);busy=true;
    checkAgain=false;
    tool.setState?.({busy:true,dirty:true});showError('');
    if(!unknownPageResult)showPageStatus('正在保存设置…');
    let written=false,conflict=false;
    try{
      for(let attempt=0;attempt<3;attempt++){
        const before=await readSettings();
        if(!active())return;
        const latest=parse(before);
        const overlaps=Object.keys(changes).some(field=>field==='gestureMappings'?
          Object.keys(changes.gestureMappings).some(key=>
            latest.gestureMappings[key]!==baseline.gestureMappings[key]):
          latest[field]!==baseline[field]);
        if(overlaps){conflict=true;break;}
        const value={...(before.value||{}),...changes,menuPolicy:'native-first'};
        if(changes.gestureMappings){
          value.gestureMappings={...cleanMappings(before.value?.gestureMappings)};
          for(const [key,action] of Object.entries(changes.gestureMappings)){
            if(action===undefined)delete value.gestureMappings[key];
            else value.gestureMappings[key]=action;
          }
        }
        try{
          const receipt=await request('storage.set',{key,value,ifMatch:before.etag});
          if(!active())return;
          if(receipt?.saved!==true)throw Error('E_GESTURE_SAVE_UNKNOWN');
          written=true;break;
        }catch(err){
          if(!active())return;
          if(err?.code!=='E_STORAGE_CONFLICT')throw err;
          if(attempt===2){conflict=true;break;}
        }
      }
      if(!active())return;
    }catch{
      // A missing receipt does not prove that storage kept the old value.
      if(!active())return;
    }finally{
      if(active()){
        let readable=false;
        try{
          const confirmed=await readSettings();
          if(!active())return;
          current=parse(confirmed);readable=true;
          showError(conflict?'设置冲突，未覆盖并发修改；已读取最新设置，请核对后重试':
            written?'':'设置保存未确认：写入结果未知；已读取最新设置，请核对后再操作');
        }catch{
          if(!active())return;
          current={...current,enabled:false};
          showError(written?'设置已保存，但无法读取最新状态，请重新打开此页面':
            conflict?'设置冲突，无法读取最新状态，请重新打开此页面':
            '设置保存未确认：写入结果未知；无法读取最新状态，请重新打开此页面');
        }finally{
          if(active()){
            apply();controlsDisabled(!readable);
            if(written&&readable){
              hint.textContent+=' · 设置已保存';
              try{tool.ui?.notify?.({message:'设置已保存',type:'success'});}catch{}
            }
            busy=false;tool.setState?.({busy:false,dirty:false});
            if(written&&readable)void checkPage();
            else if(!unknownPageResult)showPageStatus('未核对当前网页');
          }
        }
      }
    }
  }
  toggle.addEventListener('change',()=>void persist({enabled:toggle.checked}));
  triggerControl.addEventListener('change',()=>void persist({trigger:triggerControl.value}));
  traceControl.addEventListener('change',()=>void persist({showTrace:traceControl.checked}));
  comboControl?.addEventListener('change',()=>{
    if(comboActionControl)comboActionControl.value=current.gestureMappings[comboControl.value]||'none';
  });
  comboActionControl?.addEventListener('change',()=>{
    if(!comboControl||!comboKeys.has(comboControl.value))return;
    const key=comboControl.value,action=comboActionControl.value;
    if(action!=='none'&&!validActions.has(action))return;
    void persist({gestureMappings:{[key]:action==='none'?undefined:action}});
  });
  root.addEventListener('opendesk-page-changed',()=>{
    pageGeneration++;void refresh();
  });
  window.addEventListener('focus',()=>void refresh());
  window.addEventListener('pagehide',()=>{closed=true;revision++;},{once:true});
  controlsDisabled(true);apply();void refresh();
})();
