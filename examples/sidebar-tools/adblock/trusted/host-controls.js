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

export function createAdblockPermissionControls({
  api,doc,container,notice,runOperation,onViewChange=()=>{},openToolManagement=()=>{},settingsControl=null
}){
  let toolKey='',visible=false,enabled=false,suspended=false,busy=false,state=null,reading=false,readError=null;
  let sequence=0,generation=0,refreshPending=false,listening=false,view='overview';
  let exceptionsReturnView='overview',exceptionsReturnControl=null,pendingFocus=null;
  const make=(tag,klass='',value)=>{const node=doc.createElement(tag);node.className=klass;
    if(value!==undefined)node.textContent=value;return node;};
  const button=(klass,label,text)=>{const node=make('button',klass,text);node.type='button';
    node.setAttribute('aria-label',label);return node;};
  const section=make('section','sidebar-tool-adblock-native');
  section.setAttribute('aria-label','AdBlock 产品控制');section.hidden=true;
  const overview=make('section','adblock-native-overview');
  overview.setAttribute('aria-label','AdBlock 概览');
  // Product identity and settings live in the shared, trusted Side Panel
  // toolbar next to Uninstall. Never create another product-header row here.

  const globalCard=make('section','adblock-native-card adblock-native-global');
  globalCard.setAttribute('aria-label','全局保护');
  const globalRow=make('div','adblock-native-card-row');
  const globalCopy=make('div','adblock-native-copy');
  globalCopy.append(make('h3','adblock-native-heading','全局保护'),
    make('p','adblock-native-muted','为所有支持的网站启用'));
  const global=button('adblock-native-toggle','全局广告拦截','状态未确认');
  global.setAttribute('role','switch');global.setAttribute('aria-checked','false');
  globalRow.append(globalCopy,global);
  const statusLine=make('p','adblock-native-status');
  const statusDot=make('span','adblock-native-status-dot');
  statusDot.setAttribute('aria-hidden','true');
  const statusText=make('span','adblock-native-status-copy','正在核对 Chrome 规则');
  statusLine.append(statusDot,statusText);
  globalCard.append(globalRow,statusLine);overview.append(globalCard);
  const recover=button('adblock-native-secondary','重新核对并清理残留广告规则','重新核对并清理残留规则');
  recover.hidden=true;globalCard.append(recover);

  const siteCard=make('section','adblock-native-card adblock-native-site');
  siteCard.setAttribute('aria-label','当前网站');
  siteCard.append(make('p','adblock-native-eyebrow','当前网站'));
  const siteIdent=make('div','adblock-native-site-ident');
  const avatar=make('span','adblock-native-avatar','—');
  avatar.setAttribute('aria-hidden','true');
  const siteIdentity=make('div','adblock-native-site-identity');
  const siteHost=make('strong','adblock-native-host','未识别网站');
  const siteMeta=make('span','adblock-native-muted','仅支持普通 HTTP(S) 网站');
  siteIdentity.append(siteHost,siteMeta);siteIdent.append(avatar,siteIdentity);
  siteCard.append(siteIdent);
  const siteRow=make('div','adblock-native-card-row');
  const siteCopy=make('div','adblock-native-copy');
  const siteHeading=make('h3','adblock-native-heading','在此网站拦截');
  const siteScope=make('p','adblock-native-muted','仅影响当前域名');
  siteCopy.append(siteHeading,siteScope);
  const site=button('adblock-native-toggle','当前网站不可用','状态未确认');
  site.setAttribute('role','switch');site.setAttribute('aria-checked','false');
  siteRow.append(siteCopy,site);siteCard.append(siteRow);
  siteCard.append(make('div','adblock-native-divider'));
  const summary=make('div','adblock-native-summary');
  const metric=make('div','adblock-native-metric');
  metric.append(make('strong','adblock-native-count','—'),
    make('span','adblock-native-muted','本网站已拦截的请求'));
  summary.append(metric,make('span','adblock-native-stat-note','暂无可核实统计'));
  const siteHelp=make('p','adblock-native-help');
  siteCard.append(summary,siteHelp);
  overview.append(siteCard);

  const preset=make('section','adblock-native-card adblock-native-preset');
  preset.setAttribute('aria-label','过滤规则');
  const presetTop=make('div','adblock-native-preset-top');
  presetTop.append(make('strong','','过滤规则'),make('span','adblock-native-pill','默认推荐'));
  preset.append(presetTop,make('p','adblock-native-muted','使用内置离线规则，拦截常见第三方广告与跟踪请求。'));
  overview.append(preset);
  const exceptionsTrigger=button('adblock-native-link','管理已停用的网站','管理已停用的网站');
  const exceptionTotal=make('span','adblock-native-link-count','0');
  exceptionsTrigger.setAttribute('data-adblock-nav','exceptions');
  exceptionsTrigger.append(exceptionTotal,make('span','adblock-native-chevron','›'));
  overview.append(exceptionsTrigger);
  const info=make('p','adblock-native-feedback');
  info.setAttribute('role','status');info.setAttribute('aria-live','polite');

  const exceptions=make('section','adblock-native-subpage');
  exceptions.setAttribute('aria-label','已停用的网站');exceptions.hidden=true;
  const exceptionsHead=make('header','adblock-native-subhead');
  const exceptionsBack=button('adblock-native-back','从已停用的网站返回概览','‹');
  const exceptionsTitle=make('h2','','已停用的网站');
  const exceptionsSummary=make('span','adblock-native-subcount','0 个网站');
  exceptionsBack.setAttribute('data-adblock-nav','overview');
  exceptionsHead.append(exceptionsBack,exceptionsTitle,exceptionsSummary);
  exceptions.append(exceptionsHead,make('p','adblock-native-intro',
    '这些网站已停用过滤。你可以在列表中恢复，或返回概览，在“当前网站”中开启过滤。'));

  const settings=make('section','adblock-native-subpage');
  settings.setAttribute('aria-label','AdBlock 产品设置');settings.hidden=true;
  const settingsHead=make('header','adblock-native-subhead');
  const settingsBack=button('adblock-native-back','从 AdBlock 设置返回概览','‹');
  settingsBack.setAttribute('data-adblock-nav','overview');
  settingsHead.append(settingsBack,make('h2','','设置'));settings.append(settingsHead);
  const settingsCard=make('div','adblock-native-card adblock-native-settings-card');
  const settingRow=(name,copy)=>{
    const row=make('div','adblock-native-setting');
    row.append(make('h3','',name),make('p','adblock-native-muted',copy));
    settingsCard.append(row);return row;
  };
  settingRow('默认过滤','使用内置推荐规则，无法在本版本中编辑订阅源。');
  const manageSites=settingRow('网站例外','关闭当前网站过滤后，该域名会添加到例外列表。');
  const settingsExceptions=button('adblock-native-secondary','从设置查看已停用的网站','查看例外列表');
  settingsExceptions.setAttribute('data-adblock-nav','exceptions');
  manageSites.append(settingsExceptions);
  settingRow('网页异常处理','网页功能出现异常时，可临时停用当前网站过滤并刷新网页。');
  settingRow('Chrome 权限与恢复','广告过滤为扩展必选能力，工具默认关闭，不需要单独授权弹窗。关闭或卸载工具会清理自身规则并读回确认。网站访问、停用和卸载扩展由 Chrome 管理；能力不可用时先保存工作再重新加载扩展，之后手动开启过滤。');
  const manageTool=settingRow('工具管理','工具启停、版本、授权及卸载由 OpenDesk 统一管理。');
  const managementButton=button('adblock-native-secondary','打开通用工具管理','打开工具管理');
  manageTool.append(managementButton);settings.append(settingsCard);
  settings.append(make('p','adblock-native-setting-note',
    '当前版本不提供订阅源编辑、元素屏蔽或无法验证的请求统计。'));
  section.append(overview,exceptions,settings,info);container.append(section);

  const report=(value,problem=false)=>{
    info.textContent=value;info.hidden=!value;
    info.setAttribute('data-error',String(problem));
    if(problem)notice(value,true);
  };
  function navigate(next,source){
    if(!visible||!['overview','exceptions','settings'].includes(next))return;
    if(next==='exceptions'&&view!=='exceptions'){
      exceptionsReturnView=view;
      exceptionsReturnControl=view==='settings'?settingsExceptions:exceptionsTrigger;
      exceptionsBack.setAttribute('aria-label',view==='settings'?
        '从已停用的网站返回 AdBlock 设置':'从已停用的网站返回概览');
    }
    if(next!==view)pendingFocus=null;
    view=next;overview.hidden=next!=='overview';
    exceptions.hidden=next!=='exceptions';settings.hidden=next!=='settings';
    onViewChange(next);
    if(source?.focus)source.focus({preventScroll:true});
    else if(next!=='overview')(next==='exceptions'?exceptionsBack:settingsBack).focus?.({preventScroll:true});
  }
  exceptionsTrigger.addEventListener('click',()=>navigate('exceptions'));
  settingsExceptions.addEventListener('click',()=>navigate('exceptions'));
  exceptionsBack.addEventListener('click',()=>navigate(exceptionsReturnView,exceptionsReturnControl));
  settingsBack.addEventListener('click',()=>navigate('overview',settingsControl));
  managementButton.addEventListener('click',()=>{if(visible)openToolManagement();});

  function currentHost(){
    if(state?.currentSite&&state.currentSite.status!=='ready')return null;
    return typeof state?.currentHost==='string'&&state.currentHost?state.currentHost:null;
  }
  function paint(){
    const permission=state?.permissions?.dnr===true;
    const verified=Boolean(enabled&&permission&&state?.rules?.verified===true);
    const on=Boolean(verified&&state.enabled===true&&!state.restartRequired);
    const exceptionsList=Array.isArray(state?.exceptions)?state.exceptions:[];
    const host=currentHost();
    const siteProblem=!host&&state?.currentSite?
      SITE_STATUS_COPY[state.currentSite.status]||SITE_STATUS_COPY.unavailable:null;
    global.textContent=!enabled?'工具已停用':!state?'状态未确认':
      state.restartRequired?(permission?'需重新加载扩展':'需重启 Chrome'):on?'开启':'关闭';
    global.setAttribute('aria-checked',String(on));
    global.disabled=!visible||suspended||!enabled||busy||!state||
      typeof state.permissions?.dnr!=='boolean'||Boolean(state.restartRequired);
    recover.hidden=!visible||!enabled||!state?.restartRequired||permission;
    recover.disabled=suspended||busy||!state;
    statusLine.className='adblock-native-status'+(on?'':!state?' is-unknown':' is-off');
    statusText.textContent=!enabled?'工具已停用，请在工具管理中启用':
      readError?.code==='E_ADBLOCK_UPDATE_REQUIRED'?'广告拦截版本不匹配':
      !state?'Chrome 状态未确认':
      state.restartRequired?(permission?'过滤尚未开启，请保存工作并重新加载扩展后手动开启':
        '权限已撤销，请完整重启 Chrome'):
      state.permissions?.dnr!==true&&state.permissions?.dnr!==false?'Chrome 权限状态未确认':
      !permission?'需要批准 Chrome 广告过滤权限':
      !state.rules?.verified?'Chrome 规则尚未通过读回验证':
      on?'已开启保护':'保护已关闭';
    siteHost.textContent=!state?'网站状态尚未取得':host||siteProblem?.[0]||'当前页面不可用';
    siteMeta.textContent=!state?'待广告拦截状态确认':host?'普通 HTTP(S) 网站 · '+host:
      siteProblem?.[1]||'仅支持普通 HTTP(S) 网站';
    avatar.textContent=host?host[0].toUpperCase():'—';
    const siteOn=Boolean(host&&on&&!exceptionsList.includes(host));
    site.setAttribute('aria-checked',String(siteOn));
    site.setAttribute('aria-label',host?'网站 '+host+' 的广告过滤':'当前网站不可用');
    site.textContent=!host?'不可用':!state?'状态未确认':siteOn?'开启':'关闭';
    site.disabled=!visible||suspended||!enabled||busy||!on||!host;
    siteHeading.textContent=!state?'网站过滤状态未确认':host?'在此网站拦截':siteProblem?.[0]||'当前页面不支持过滤';
    siteScope.textContent=!state?'待广告拦截状态确认':host?'仅影响当前域名':
      siteProblem?.[1]||'请切换到普通 HTTP(S) 网站';
    siteHelp.textContent=!state?'取得广告拦截状态后，可在这里管理当前网站的过滤。':
      !host?siteProblem?.[1]||'切换到普通 HTTP(S) 网站后，可在这里管理该网站的过滤。':
      !on?'开启全局保护后，可单独管理当前网站的过滤。':
      siteOn?'网页显示异常时，可临时关闭当前网站过滤，再刷新网页。':
      '当前网站已停用过滤，重新开启后请刷新网页。';
    exceptionTotal.textContent=String(exceptionsList.length);
    exceptionsSummary.textContent=exceptionsList.length+' 个网站';
    exceptionsTrigger.disabled=!visible;
    const unavailable=!enabled||!state||!permission||!on||!host;
    siteMeta.setAttribute('data-available',String(!unavailable));
  }
  // A native button becomes blurred while busy because paint() disables it.
  // Retain focus only for the same live tool generation, same visible view, and
  // only when Chrome left focus on the body rather than another user control.
  function restorePendingFocus(){
    const pending=pendingFocus;
    if(!pending)return;
    const {target,generation:ownerGeneration,view:ownerView}=pending;
    if(ownerGeneration!==generation||!visible||!enabled||suspended||
      container.hidden||overview.hidden||view!==ownerView||target.isConnected!==true){
      pendingFocus=null;return;
    }
    if(doc.activeElement!==doc.body&&doc.activeElement!==target){
      pendingFocus=null;return;
    }
    if(busy||reading||refreshPending)return;
    pendingFocus=null;
    if(state&&!target.disabled)target.focus?.({preventScroll:true});
  }
  const storageChanged=(changes,area)=>{
    if(area==='local'&&[ADBLOCK_STORE,ADBLOCK_DNR_CLEANUP_STORE].some(key=>Object.hasOwn(changes,key)))void refresh();
  };
  const permissionsChanged=()=>{void refresh();};
  const contextChanged=()=>{pendingFocus=null;void refresh();};
  const tabUpdated=(_tabId,changeInfo)=>{
    if(changeInfo&&(Object.hasOwn(changeInfo,'status')||Object.hasOwn(changeInfo,'url')))contextChanged();
  };
  function listen(next){
    if(listening===next)return;
    listening=next;
    for(const [event,listener] of [[api.storage?.onChanged,storageChanged],
      [api.permissions?.onAdded,permissionsChanged],[api.permissions?.onRemoved,permissionsChanged],
      [api.tabs?.onUpdated,tabUpdated],[api.tabs?.onActivated,contextChanged],
      [api.tabs?.onRemoved,contextChanged],[api.windows?.onFocusChanged,contextChanged]])
      event?.[next?'addListener':'removeListener']?.(listener);
  }
  async function refresh(){
    if(!visible||suspended||!enabled)return;
    const captured=++sequence;
    state=null;readError=null;paint();
    if(busy||reading){refreshPending=true;return;}
    refreshPending=false;reading=true;
    try{
      const data=await runOperation('adblock.status',{},null);
      if(visible&&captured===sequence){
        state=data;
        report(data.restartRequired?(data.permissions?.dnr===true?
          SESSION_RESTART_COPY:
          '全局保护：Chrome 广告过滤权限已撤销，停止过滤尚未确认，请完整退出并重启 Chrome。'):'');
        paint();
      }
    }catch(e){
      if(visible&&captured===sequence){
        state=null;readError=e;report('状态读取失败：'+String(e.message||e),true);paint();
      }
    }finally{reading=false;if(refreshPending)void refresh();else restorePendingFocus();}
  }
  function finish(){busy=false;paint();if(refreshPending||!state)void refresh();else restorePendingFocus();}
  async function operate(op,payload,event,focusAtDispatch=null){
    if(event?.isTrusted!==true||busy||!visible||suspended||!enabled)return;
    // Preserve native keyboard focus when the pending Chrome operation disables
    // the switch. Chrome may blur a focused <button> as soon as disabled=true.
    const focusTarget=focusAtDispatch===global||focusAtDispatch===site?focusAtDispatch:
      event?.currentTarget===global?global:event?.currentTarget===site?site:null;
    const restoreFocus=Boolean(focusTarget&&(focusAtDispatch===focusTarget||
      doc.activeElement===focusTarget));
    const captured=sequence,capturedGeneration=generation;
    if(restoreFocus)pendingFocus={target:focusTarget,generation:capturedGeneration,view};
    busy=true;paint();report('正在核对 Chrome 规则…');
    try{
      const data=await runOperation(op,payload,event);
      if(captured!==sequence||capturedGeneration!==generation)return;
      if(data.rules?.verified!==true||
        (op==='adblock.enable'&&data.enabled!==true)||
        (op==='adblock.disable'&&data.enabled!==false))
        throw Error('Chrome 规则回读不一致');
      state=data;
      report(data.refreshRequired?'设置已生效于新请求，请刷新当前网站。':
        data.enabled?'Chrome 已确认过滤开启':'Chrome 已确认过滤关闭');
    }catch(e){
      if(captured===sequence&&capturedGeneration===generation){
        state=null;
        // The first permission grant intentionally requires a browser restart.
        // Keep that expected guidance in the product status; a global error
        // would otherwise survive navigation after the fresh status read.
        const restartRequired=e.code==='E_ADBLOCK_RESTART_REQUIRED';
        report(restartRequired?
          SESSION_RESTART_COPY:
          (e.code||'E_ADBLOCK')+'：'+String(e.message||e),!restartRequired);
      }
    }finally{
      // An older request must not clear the busy flag or return focus to a
      // newly installed tool, including when its readback resolves late.
      if(capturedGeneration===generation)finish();
    }
  }
  function reportMissingCapability(){
    report('广告过滤为扩展必选权限，无法单独授权。请保存工作并重新加载或启用 OpenDesk Browser 扩展；过滤保持关闭，之后需手动开启。',true);
  }
  global.addEventListener('click',event=>{
    if(event?.isTrusted!==true||busy||!visible||suspended||!enabled||!state||
      typeof state.permissions?.dnr!=='boolean')return;
    if(state.enabled){void operate('adblock.disable',{},event);return;}
    const focusAtDispatch=doc.activeElement===global?global:null;
    // Reuse the verified grant; the worker rechecks permission before DNR writes.
    if(state.permissions.dnr===true){
      void operate('adblock.enable',{},event,focusAtDispatch);return;
    }
    reportMissingCapability();
  });
  recover.addEventListener('click',async event=>{
    if(event?.isTrusted!==true||busy||!visible||suspended||!enabled||!state?.restartRequired||
      state.permissions?.dnr!==false)return;
    // Recovery requests permission only to clear rules. It never enables filtering.
    const captured=generation,capturedSequence=sequence;
    busy=true;paint();
    try{
      const granted=await api.permissions.contains({permissions:[ADBLOCK_PERMISSION]});
      if(captured!==generation||capturedSequence!==sequence)return;
      busy=false;
      if(granted===true)await operate('adblock.disable',{},event);
      else reportMissingCapability();
    }catch(error){
      if(captured===generation&&capturedSequence===sequence)report('清理状态读取失败：'+String(error.message||error),true);
    }finally{if(captured===generation)finish();}
  });
  site.addEventListener('click',event=>{
    if(event?.isTrusted!==true||site.disabled)return;
    const host=currentHost();
    if(!host)return;
    void operate('adblock.site.set',{host,filtering:state.exceptions.includes(host)},event);
  });
  function render(tool,readOnly=false,toolEnabled=false,toolManagementOpen=false){
    const active=!readOnly&&tool?.id===ADBLOCK_ID&&tool.capabilities?.includes(ADBLOCK_CAPABILITY);
    const nextKey=active?tool.id+'@'+tool.version:'';
    const changed=nextKey!==toolKey||enabled!==Boolean(active&&toolEnabled);
    const invalidated=changed||suspended!==Boolean(toolManagementOpen);
    if(invalidated){
      listen(false);sequence++;generation++;refreshPending=false;busy=false;pendingFocus=null;state=null;readError=null;report('');
    }
    if(changed){
      view='overview';exceptionsReturnView='overview';exceptionsReturnControl=null;
    }
    toolKey=nextKey;visible=Boolean(active);enabled=Boolean(active&&toolEnabled);
    suspended=Boolean(toolManagementOpen);
    listen(visible&&!suspended);
    section.hidden=!visible||suspended;
    container.hidden=!visible||suspended;
    overview.hidden=view!=='overview';
    exceptions.hidden=view!=='exceptions';settings.hidden=view!=='settings';
    if(invalidated){state=null;paint();if(enabled)void refresh();}
    else paint();
  }
  return {render,refresh,view:()=>view,
    toggleProductSettings:()=>{
      if(!visible||suspended)return;
      navigate(view==='settings'?'overview':'settings',
        view==='settings'?settingsControl:null);
    },
    dispose:()=>render(null)};
}
