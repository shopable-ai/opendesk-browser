import {AGENT_CONFIG_PROTOCOL} from './protocol.js';
import {initAnalyticsConsentControls} from '../analytics/consent-ui.js';
import {createDevelopmentPairingRequest} from './pairing.js';
import {recoverControlFocus} from './control-focus.js';
import {initTrustedPageLocale,subscribeLocale,translate,getLocale} from '../i18n/index.js';
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
  const controls=pending=>{toggle.disabled=pending||!lastState;refresh.disabled=pending;};
  doc.getElementById('http-relay-open')?.addEventListener('click',()=>navigate(api.runtime.getURL('native-agent/http-relay.html')));
  doc.getElementById('workspace-open')?.addEventListener('click',()=>api.tabs.create({
    url:api.runtime.getURL('native-agent/workspace.html')
  }));
  async function request(type) {
    const response=await api.runtime.sendMessage({protocol:AGENT_CONFIG_PROTOCOL,type});
    if (!response?.ok) throw response?.error || {code:'E_EFFECT_UNKNOWN',message:'未收到设置回执'};
    return response.data;
  }
  let settleTimer,connectingPolls=0,lastState=null,busy=false,statusEpoch=0;
  const renderState=state=>{
    toggle.checked=Boolean(state.enabled);
    const lastSeen=Number.isSafeInteger(state.lastConnectedAt)&&state.lastConnectedAt>0
      ?new Date(state.lastConnectedAt).toLocaleString(getLocale(),{dateStyle:'short',timeStyle:'short'}):null;
    let heading,description,connection='offline';
    if(!state.enabled){
      heading=translate('settings.statusOff');
      description=lastSeen?translate('settings.captionPastOff',{time:lastSeen}):translate('settings.captionOff');
    }else if(state.nativeConnected){
      heading=translate('settings.connected');
      description=translate('settings.captionOnline');
      connection='online';
    }else if(state.requiresReload){
      heading=translate('settings.statusReload');
      description=translate('settings.captionReload');
    }else if(state.connecting){
      heading=translate('settings.statusConnecting');
      description=translate('settings.captionConnecting');
      connection='connecting';
    }else{
      heading=translate('settings.statusOffline');
      description=(lastSeen?translate('settings.captionPastOffline',{time:lastSeen}):'')+' '+translate('settings.captionOffline');
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
      translate('settings.extensionId',{id:state.extensionId}),
      ...(lastSeen?[translate('settings.diagnosticLastSeen',{time:lastSeen})]:[])
    ].join('\n');
    if(!busy)toggle.disabled=false;
  };
  const fail=error=>{
    lastState=null;toggle.disabled=true;
    status.textContent=translate('settings.statusUnknown');
    caption.textContent=translate('settings.captionUnknown');
    connectionCard.dataset.connection='unknown';
    showFeedback((error?.code||'E_NATIVE_NOT_READY')+'：'+(error?.message||error));
  };
  const unsubscribeLocale=subscribeLocale(()=>{if(lastState)renderState(lastState);});
  globalThis.addEventListener?.('pagehide',unsubscribeLocale,{once:true});
  async function update() {
    clearTimeout(settleTimer);settleTimer=null;
    const epoch=++statusEpoch;
    const state=await request('status');
    if(epoch!==statusEpoch)return;
    if(typeof state?.enabled!=='boolean'||typeof state.nativeConnected!=='boolean')
      throw {code:'E_NATIVE_STATUS',message:translate('settings.invalidStatus')};
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
    statusEpoch++;
    clearTimeout(settleTimer);
    const permission=wantEnabled?api.permissions.request({permissions:['nativeMessaging']}):null;
    busy=true;controls(true);restoreFocus.disabled();showFeedback('');
    (async()=>{
      if(wantEnabled&&!await permission)
        throw {code:'E_PERMISSION_REQUIRED',message:translate('settings.permissionRequired')};
      await request(wantEnabled?'enable':'disable');
      connectingPolls=0;await update();
    })().catch(async error=>{
      // A lost/unknown enable acknowledgement must never be treated as a
      // confirmed rollback. Read back the one existing settings authority.
      try{await update();}catch(readError){fail(readError);}
      if(lastState)toggle.checked=Boolean(lastState.enabled);
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
