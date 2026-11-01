import {BROWSER_HOST_PROTOCOL} from '../../framework/sdk/browser-contract.js';
import {managedProxyReview} from '../../platform/chrome/browser-managed-proxy-config.js';

// Local pending work only; durable consent and already-issued intents remain
// owned by the Host. Capture at request ingress, before admission or queueing.
export function createManagedProxyActionGate(){
  const stops=new Map();
  const stop=toolId=>stops.set(toolId,(stops.get(toolId)||0)+1);
  return {stop,begin(toolId,operation){
    if(operation==='browser.proxy.managed.requestDisable')stop(toolId);
    const generation=stops.get(toolId)||0;
    return {hasUserActivation:globalThis.navigator?.userActivation?.isActive===true,
      assertCurrent(){
        if(operation==='browser.proxy.managed.requestEnable'&&generation!==(stops.get(toolId)||0))
          throw Object.assign(new Error('较新的停止操作已取消本次启用'),{code:'E_PROXY_ACTION_CANCELLED'});
      }};
  }};
}

// Presentation only: the existing Host owns grants, identity and one-use intents.
export async function requestManagedProxyIntent({api,identity,title,operation,payload,
  hasUserActivation,assertCurrent,requestReview}){
  const confirm=async proxyConsent=>{
    assertCurrent();
    const reply=await api.runtime.sendMessage({protocol:BROWSER_HOST_PROTOCOL,kind:'host',
      ...identity,operation:'browser.intent.confirm',targetOperation:operation,targetArgs:payload,
      ...(proxyConsent?{proxyConsent}:{})});
    assertCurrent();
    if(!reply?.ok)throw Object.assign(new Error(reply?.error?.message||'代理授权未确认'),
      {code:reply?.error?.code||'E_BROWSER'});
    return reply.data.approvalRef;
  };
  // STOP only releases exact owned state. It never grants another route.
  if(operation==='browser.proxy.managed.requestDisable')return confirm();
  // Chrome propagates a child-frame activation to its ancestor. Capture that
  // native fact in the trusted parent, never a sandbox-supplied gesture flag.
  if(hasUserActivation){
    try{return await confirm('reuse');}
    catch(error){if(error?.code!=='E_PROXY_CONSENT_REQUIRED')throw error;}
  }
  return requestReview({toolId:identity.toolId,
    message:'「'+title+'」请求'+managedProxyReview(payload.config)+
      '。\n\n允许后，此安装重复使用同一线路不再确认；更换线路或扩大范围需重新审阅。可在工具设置中撤销并停止。',
    button:'允许并记住此线路',run:event=>{
      if(!event?.isTrusted)throw Object.assign(new Error('请点击可信授权按钮'),{code:'E_USER_GESTURE_REQUIRED'});
      return confirm('remember');
    }});
}
