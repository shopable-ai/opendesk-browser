import {AGENT_CONFIG_PROTOCOL} from './protocol.js';
import {createDevelopmentPairingRequest} from './pairing.js';
import {recoverControlFocus} from './control-focus.js';
import {initTrustedPageLocale,subscribeLocale,translate} from '../i18n/index.js';
export function initNativeAgentSettings({api=globalThis.chrome,document:doc=globalThis.document,navigate=url=>globalThis.location.assign(url)}={}) {
  initTrustedPageLocale({api,doc,page:'settings'});
  const status=doc.getElementById('bridge-status'),enable=doc.getElementById('bridge-enable'),
    disable=doc.getElementById('bridge-disable'),refresh=doc.getElementById('bridge-refresh'),pair=doc.getElementById('bridge-pair');
  const show=value=>{status.textContent=value};
  const controls = busy=>{enable.disabled=disable.disabled=refresh.disabled=busy};
  doc.getElementById('workspace-open')?.addEventListener('click',()=>api.tabs.create({url:api.runtime.getURL('native-agent/workspace.html')}));
  async function request(type) {
    const response=await api.runtime.sendMessage({protocol:AGENT_CONFIG_PROTOCOL,type});
    if (!response?.ok) throw response?.error || {code:'E_EFFECT_UNKNOWN',message:'未收到设置回执'};
    return response.data;
  }
  let settleTimer,connectingPolls=0,lastState=null;
  const renderState=state=>show([
    translate('settings.stateAgent',{state:translate(state.enabled?'settings.enabled':'settings.disabled')}),
    translate('settings.stateHost',{state:state.nativeConnected?translate('settings.connected'):
      state.requiresReload?translate('settings.requiresReload'):state.connecting?translate('settings.trying'):translate('settings.notConnected')}),
    translate('settings.hostCount',{count:state.hostCount}),translate('settings.extensionId',{id:state.extensionId})
  ].join('\n'));
  const unsubscribeLocale=subscribeLocale(()=>{if(lastState)renderState(lastState);});
  globalThis.addEventListener?.('pagehide',unsubscribeLocale,{once:true});
  async function update() {
    clearTimeout(settleTimer);settleTimer=null;
    const state=await request('status');
    lastState=state;renderState(state);
    // A connecting Port may not have delivered its hello yet. Observe only
    // briefly while this Options document is visible; no background polling.
    if(state.connecting&&connectingPolls++<6){
      settleTimer=setTimeout(()=>{if(!doc.hidden)void update().catch(e=>show((e.code||'E_NATIVE_NOT_READY')+'：'+(e.message||e)));},500);
    }else connectingPolls=0;
  }
  enable.addEventListener('click',event=>{
    if (!event.isTrusted) return;
    const restoreFocus=recoverControlFocus(doc);
    // Browser permission prompts MUST originate directly from a real click.
    const grant=api.permissions.request({permissions:['nativeMessaging']});
    controls(true);restoreFocus.disabled();
    (async()=>{
      if (!await grant) throw {code:'E_PERMISSION_REQUIRED',message:'浏览器 Native Messaging 权限被拒绝'};
      await request('enable');await update();
    })().catch(e=>show((e.code||'E_PERMISSION')+'：'+(e.message||e)))
      .finally(()=>{controls(false);restoreFocus.restore();});
  });
  disable.addEventListener('click',()=>{
    const restoreFocus=recoverControlFocus(doc);
    controls(true);restoreFocus.disabled();request('disable').then(update).catch(e=>show((e.code||'E_EFFECT_UNKNOWN')+'：'+e.message)).finally(()=>{controls(false);restoreFocus.restore();});
  });
  refresh.addEventListener('click',()=>{connectingPolls=0;update().catch(e=>show((e.code||'E_EFFECT_UNKNOWN')+'：'+e.message));});
  pair?.addEventListener('click',event=>{
    if(!event.isTrusted){event.preventDefault();return;}
    try{
      const request=createDevelopmentPairingRequest(api.runtime.id);
      show(translate('settings.pairWait',{id:api.runtime.id}));
      navigate(request.url);
    }catch(error){event.preventDefault();show(translate('settings.pairFailure',{error:error.message}));}
  });
  update().catch(e=>show((e.code||'E_EFFECT_UNKNOWN')+'：'+e.message));
}
