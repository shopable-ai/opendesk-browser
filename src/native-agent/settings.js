import {AGENT_CONFIG_PROTOCOL} from './protocol.js';
import {initAnalyticsConsentControls} from '../analytics/consent-ui.js';
import {createDevelopmentPairingRequest} from './pairing.js';
import {recoverControlFocus} from './control-focus.js';
import {initTrustedPageLocale,subscribeLocale,translate} from '../i18n/index.js';
export function initNativeAgentSettings({api=globalThis.chrome,document:doc=globalThis.document,navigate=url=>globalThis.location.assign(url)}={}) {
  initTrustedPageLocale({api,doc,page:'settings'});
  initAnalyticsConsentControls({api,doc});
  const status=doc.getElementById('bridge-status');
  const caption=doc.getElementById('bridge-caption');
  const toggle=doc.getElementById('bridge-toggle');
  const refresh=doc.getElementById('bridge-refresh');
  const feedback=doc.getElementById('bridge-feedback');
  const diagnostics=doc.getElementById('bridge-details');
  const connectionCard=doc.querySelector('.connection-status');
  const pair=doc.getElementById('bridge-pair');
  const showFeedback=value=>{
    feedback.textContent=value||'';
    feedback.hidden=!value;
  };
  const controls=busy=>{toggle.disabled=refresh.disabled=busy;};
  doc.getElementById('workspace-open')?.addEventListener('click',()=>api.tabs.create({
    url:api.runtime.getURL('native-agent/workspace.html')
  }));
  async function request(type) {
    const response=await api.runtime.sendMessage({protocol:AGENT_CONFIG_PROTOCOL,type});
    if (!response?.ok) throw response?.error || {code:'E_EFFECT_UNKNOWN',message:'未收到设置回执'};
    return response.data;
  }
  let settleTimer,connectingPolls=0,lastState=null,busy=false;
  const renderState=state=>{
    toggle.checked=Boolean(state.enabled);
    let heading,description,connection='offline';
    if(!state.enabled){
      heading='未启用';
      description='本机连接已关闭；需要时开启即可。';
    }else if(state.nativeConnected){
      heading='已连接';
      description='OpenDesk 本机通信在线，无需重复配对；Codex 能力仍需使用时核验。';
      connection='online';
    }else if(state.requiresReload){
      heading='需要重载扩展';
      description='本机连接已启用，但当前 Chrome API 未就绪；请重新加载扩展。';
    }else if(state.connecting){
      heading='正在连接';
      description='已保留连接设置，正在等待 OpenDesk 响应，无需重复授权。';
      connection='connecting';
    }else{
      heading='已启用 · 当前离线';
      description='连接设置仍在。请确认 OpenDesk 已运行，或点击重新检测。';
    }
    status.textContent=heading;
    caption.textContent=description;
    connectionCard.dataset.connection=connection;
    diagnostics.textContent=[
      translate('settings.stateAgent',{state:translate(state.enabled?'settings.enabled':'settings.disabled')}),
      translate('settings.stateHost',{state:state.nativeConnected?translate('settings.connected'):
        state.requiresReload?translate('settings.requiresReload'):
          state.connecting?translate('settings.trying'):translate('settings.notConnected')}),
      translate('settings.hostCount',{count:state.hostCount}),
      translate('settings.extensionId',{id:state.extensionId})
    ].join('\n');
    if(!busy)toggle.disabled=false;
  };
  const fail=error=>{
    lastState=null;toggle.disabled=true;
    status.textContent='连接状态未知';
    caption.textContent='当前未取得可靠状态，请点击重新检测。';
    connectionCard.dataset.connection='unknown';
    showFeedback((error?.code||'E_NATIVE_NOT_READY')+'：'+(error?.message||error));
  };
  const unsubscribeLocale=subscribeLocale(()=>{if(lastState)renderState(lastState);});
  globalThis.addEventListener?.('pagehide',unsubscribeLocale,{once:true});
  async function update() {
    clearTimeout(settleTimer);settleTimer=null;
    const state=await request('status');
    if(typeof state?.enabled!=='boolean'||typeof state.nativeConnected!=='boolean')
      throw {code:'E_NATIVE_STATUS',message:'连接状态回执无效'};
    lastState=state;
    renderState(state);
    showFeedback('');
    // An in-progress Native hello is observed only for a bounded time in this
    // visible Options document; there is no background polling or authorization.
    if(state.connecting&&connectingPolls++<6){
      settleTimer=setTimeout(()=>{
        if(!doc.hidden)void update().catch(fail);
      },650);
    }else connectingPolls=0;
  }
  toggle.addEventListener('change',event=>{
    // Native permission prompts must originate in the original trusted gesture.
    if(!event.isTrusted||busy||!lastState){
      toggle.checked=Boolean(lastState?.enabled);return;
    }
    const wantEnabled=toggle.checked;
    if(wantEnabled===lastState.enabled)return;
    const restoreFocus=recoverControlFocus(doc);
    // This call MUST precede the first await / Promise callback.
    const permission=wantEnabled?api.permissions.request({permissions:['nativeMessaging']}):null;
    busy=true;controls(true);restoreFocus.disabled();showFeedback('');
    (async()=>{
      if(wantEnabled&&!await permission)
        throw {code:'E_PERMISSION_REQUIRED',message:'未授予浏览器本机通信权限，原设置保持不变'};
      await request(wantEnabled?'enable':'disable');
      connectingPolls=0;await update();
    })().catch(error=>{
      toggle.checked=Boolean(lastState?.enabled);
      showFeedback((error?.code||'E_NATIVE_CONFIG')+'：'+(error?.message||error));
    }).finally(()=>{
      busy=false;controls(false);restoreFocus.restore();
    });
  });
  refresh.addEventListener('click',()=>{
    connectingPolls=0;showFeedback('');void update().catch(fail);
  });
  const checkOnReturn=()=>{
    if(busy||doc.hidden)return;
    connectingPolls=0;void update().catch(fail);
  };
  doc.addEventListener('visibilitychange',checkOnReturn);
  doc.defaultView?.addEventListener('focus',checkOnReturn);
  pair?.addEventListener('click',event=>{
    if(!event.isTrusted){event.preventDefault();return;}
    try{
      const pairing=createDevelopmentPairingRequest(api.runtime.id);
      showFeedback(translate('settings.pairWait',{id:api.runtime.id}));
      navigate(pairing.url);
    }catch(error){
      event.preventDefault();
      showFeedback(translate('settings.pairFailure',{error:error.message}));
    }
  });
  void update().catch(fail);
}
