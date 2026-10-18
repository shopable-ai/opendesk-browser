// Fixed first-party Side Panel UI. Never import this module from an installed tool.
import {ADBLOCK_ID,ADBLOCK_CAPABILITY,ADBLOCK_PERMISSION,ADBLOCK_STORE,ADBLOCK_DNR_CLEANUP_STORE} from './policy.js';
import {adblockDnrCleanupPending} from './dnr-session.js';
const SESSION_RESTART_COPY='全局保护：扩展过滤能力尚未就绪，过滤尚未开启。请先保存当前工作并重新加载 OpenDesk Browser 扩展；也可完整退出并重新打开 Chrome。完成后手动开启全局保护。';
const SITE_STATUS_COPY={
  navigating:['当前页面正在导航','页面加载完成后将自动更新当前网站。'],
  incognito:['当前页面为隐身页面','隐身页面不可管理当前网站过滤，请切换到普通窗口。'],
  unsupported:['当前页面不支持过滤','仅支持普通 HTTP(S) 网站，请切换后重试。'],
  unavailable:['当前网站读取失败','无法读取面板所属窗口的当前网站，请切换或重新加载页面后重试。']
};

export async function prepareAdblockUninstallCleanup({api,event}){
  if(event?.isTrusted!==true)throw Object.assign(new Error('请在可信扩展页面恢复清理'),{code:'E_ADBLOCK_TRUSTED_CLICK'});
  if(!await adblockDnrCleanupPending(api)||await api.permissions.contains({permissions:[ADBLOCK_PERMISSION]}))return;
  throw Object.assign(new Error('广告过滤为扩展必选权限，无法单独重新授权。请保存工作并重新加载或启用 OpenDesk Browser 扩展后恢复清理；清理记录保留，过滤不会自动开启。'),{code:'E_ADBLOCK_PERMISSION'});
}

// Business state stays in the existing trusted controller. React alone owns its DOM.
export function createAdblockPermissionControls({
  api,doc,container,notice,runOperation,mountView,onViewChange=()=>{},
  openToolManagement=()=>{},settingsControl=null
}){
  let toolKey='',visible=false,enabled=false,suspended=false,busy=false,state=null;
  let generation=0,revision=0,reading=false,refreshPending=false,listening=false;
  let view='overview',returnView='overview',mounted=null,message='',problem=false;
  let pendingFocus=null,readError=null;
  const currentHost=()=>state?.currentSite&&state.currentSite.status!=='ready'?null:
    (typeof state?.currentHost==='string'&&state.currentHost?state.currentHost:null);
  function paint(){
    container.hidden=!visible||suspended;
    if(!visible||suspended){mounted?.dispose();mounted=null;return;}
    const permission=state?.permissions?.dnr===true;
    const verified=Boolean(enabled&&permission&&state?.rules?.verified===true);
    const on=Boolean(verified&&state.enabled===true&&!state.restartRequired);
    const host=currentHost(),exceptions=Array.isArray(state?.exceptions)?state.exceptions:[];
    const siteProblem=!host&&state?.currentSite?
      SITE_STATUS_COPY[state.currentSite.status]||SITE_STATUS_COPY.unavailable:null;
    const model={view,returnView,busy,state,exceptions,host,on,
      siteOn:Boolean(host&&on&&!exceptions.includes(host)),
      globalDisabled:!enabled||busy||!state||typeof state.permissions?.dnr!=='boolean'||Boolean(state.restartRequired),
      siteDisabled:!enabled||busy||!on||!host,
      restoreDisabled:!enabled||busy||!verified||Boolean(state?.restartRequired),
      recovery:enabled&&state?.restartRequired&&!permission,
      status:!enabled?'工具已停用，请在工具管理中启用':
        !state?(readError?.code==='E_ADBLOCK_UPDATE_REQUIRED'?'广告拦截版本不匹配':'状态未确认，请重新读取 Chrome 规则'):
        state.restartRequired?(permission?'过滤尚未开启，请保存工作并重新加载扩展后手动开启':
          '停止过滤尚未确认，请完整退出并重启 Chrome'):
        typeof state.permissions?.dnr!=='boolean'?'Chrome 权限尚未确认':
        !permission?'Chrome 广告过滤权限未就绪':!verified?'Chrome DNR 尚未确认':on?'保护已开启':'保护已关闭',
      siteTitle:!state?'网站状态尚未取得':host||siteProblem?.[0]||'当前页面不可用',
      siteDescription:!state?'待广告拦截状态确认':host?'普通 HTTP(S) 网站':
        siteProblem?.[1]||'仅支持普通 HTTP(S) 网站',
      message,problem};
    if(!mounted){
      if(typeof mountView!=='function')throw new Error('E_ADBLOCK_REACT_ROOT_MISSING');
      mounted=mountView({container,model,actions});
    }else mounted.render(model);
  }
  function report(value,error=false){message=value;problem=error;paint();if(error)notice(value,true);}
  function focus(selector){container.querySelector(selector)?.focus({preventScroll:true});}
  function navigate(next,restore=false){
    if(!visible||suspended)return;
    if(next==='exceptions'&&view!=='exceptions')returnView=view;
    pendingFocus=null;view=next;paint();onViewChange(next);
    if(restore&&next==='overview')focus('[data-adblock-nav="exceptions"]');
    else if(restore&&next==='settings')focus('[data-adblock-settings-exceptions]');
    else if(next!=='overview')focus('[data-adblock-back]');
  }
  function restoreFocus(){
    const pending=pendingFocus;if(!pending||busy||reading||refreshPending)return;
    pendingFocus=null;
    if(pending.generation!==generation||pending.view!==view||!visible||suspended||!state)return;
    if(doc.activeElement!==doc.body&&doc.activeElement!==pending.node)return;
    if(pending.node?.isConnected&&!pending.node.disabled)pending.node.focus({preventScroll:true});
    else if(pending.restoreHost)focus('[data-adblock-back]');
  }
  async function refresh(){
    if(!visible||suspended||!enabled)return;
    revision++;
    if(busy||reading){refreshPending=true;return;}
    const captured=generation,readRevision=revision;
    reading=true;refreshPending=false;state=null;readError=null;paint();
    try{
      const data=await runOperation('adblock.status',{},null);
      if(captured!==generation||readRevision!==revision)return;
      state=data;report(data.restartRequired?SESSION_RESTART_COPY:'');
    }catch(error){
      if(captured===generation&&readRevision===revision){state=null;readError=error;
        report('状态读取失败：'+String(error.message||error),true);}
    }finally{
      reading=false;
      if(refreshPending&&visible&&!suspended)void refresh();else restoreFocus();
    }
  }
  async function operate(operation,payload,event){
    if(event?.isTrusted!==true||busy||!visible||suspended||!enabled||!state)return;
    const captured=generation,node=doc.activeElement;
    if(container.contains(node))pendingFocus={node,generation:captured,view,
      restoreHost:operation==='adblock.site.restore'?payload.host:null};
    busy=true;report('正在核对 Chrome 规则…');
    try{
      const data=await runOperation(operation,payload,event);
      if(captured!==generation)return;
      if(data.rules?.verified!==true||
        (operation==='adblock.enable'&&data.enabled!==true)||
        (operation==='adblock.disable'&&data.enabled!==false)||
        (operation==='adblock.site.restore'&&data.exceptions?.includes(payload.host))||
        (operation==='adblock.site.set'&&(!Array.isArray(data.exceptions)||
          data.exceptions.includes(payload.host)===payload.filtering)))
        throw new Error('Chrome 规则回读不一致');
      // Read from the real service again; UI selection never commits an operation.
      const checked=await runOperation('adblock.status',{},null);
      if(captured!==generation)return;
      if(checked.rules?.verified!==true||checked.enabled!==data.enabled||
        JSON.stringify(checked.exceptions)!==JSON.stringify(data.exceptions))
        throw new Error('Chrome 规则回读不一致');
      state=checked;report(data.refreshRequired?'设置已生效于新请求，请刷新当前网站。':
        checked.enabled?'Chrome 已确认过滤开启':'Chrome 已确认过滤关闭');
    }catch(error){
      if(captured===generation){state=null;readError=error;
        report(error.code==='E_ADBLOCK_RESTART_REQUIRED'?SESSION_RESTART_COPY:
          (error.code||'E_ADBLOCK')+'：'+String(error.message||error),error.code!=='E_ADBLOCK_RESTART_REQUIRED');}
    }finally{
      if(captured===generation){busy=false;paint();
        if(refreshPending||!state)void refresh();else restoreFocus();}
    }
  }
  const actions={
    global:event=>{
      if(!state||busy||state.restartRequired||typeof state.permissions?.dnr!=='boolean')return;
      if(state.permissions.dnr!==true){report(SESSION_RESTART_COPY,true);return;}
      void operate(state.enabled?'adblock.disable':'adblock.enable',{},event);
    },
    site:event=>{const host=currentHost();if(!host||!state?.rules?.verified||!state.enabled)return;
      void operate('adblock.site.set',{host,filtering:state.exceptions.includes(host)},event);},
    restore:(host,event)=>{if(!state?.exceptions?.includes(host)||state.rules?.verified!==true)return;
      void operate('adblock.site.restore',{host},event);},
    recover:event=>{if(state?.restartRequired&&state.permissions?.dnr===false)
      void operate('adblock.disable',{},event);},
    refresh:()=>void refresh(),navigate,
    back:()=>navigate(returnView,true),
    settingsBack:()=>{navigate('overview');settingsControl?.focus({preventScroll:true});},
    manage:()=>{if(visible&&!suspended)openToolManagement();}
  };
  const storageChanged=(changes,area)=>{
    if(area==='local'&&[ADBLOCK_STORE,ADBLOCK_DNR_CLEANUP_STORE].some(key=>Object.hasOwn(changes,key)))void refresh();
  };
  const contextChanged=()=>{pendingFocus=null;void refresh();};
  const tabUpdated=(_id,info)=>{if(info&&(Object.hasOwn(info,'status')||Object.hasOwn(info,'url')))contextChanged();};
  function listen(next){
    if(listening===next)return;listening=next;
    for(const [event,listener] of [[api.storage?.onChanged,storageChanged],
      [api.permissions?.onAdded,contextChanged],[api.permissions?.onRemoved,contextChanged],
      [api.tabs?.onUpdated,tabUpdated],[api.tabs?.onActivated,contextChanged],
      [api.tabs?.onRemoved,contextChanged],[api.windows?.onFocusChanged,contextChanged]])
      event?.[next?'addListener':'removeListener']?.(listener);
  }
  function render(tool,readOnly=false,toolEnabled=false,toolManagementOpen=false){
    const active=!readOnly&&tool?.id===ADBLOCK_ID&&tool.capabilities?.includes(ADBLOCK_CAPABILITY);
    const nextKey=active?tool.id+'@'+tool.version:'';
    const changed=nextKey!==toolKey||enabled!==Boolean(active&&toolEnabled);
    const invalidated=changed||suspended!==Boolean(toolManagementOpen);
    if(invalidated){listen(false);generation++;revision++;refreshPending=false;busy=false;
      pendingFocus=null;state=null;readError=null;message='';problem=false;
      if(changed){view='overview';returnView='overview';}}
    toolKey=nextKey;visible=Boolean(active);enabled=Boolean(active&&toolEnabled);suspended=Boolean(toolManagementOpen);
    listen(visible&&!suspended);paint();if(invalidated&&enabled)void refresh();
  }
  return {render,refresh,view:()=>view,toggleProductSettings:()=>{
    if(!visible||suspended)return;
    if(view==='settings')actions.settingsBack();else navigate('settings');
  },dispose:()=>render(null)};
}
