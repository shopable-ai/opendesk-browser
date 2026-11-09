// Memory-only Host substitute; no Chrome, durable grants or real installation.
import {requestManagedProxyIntent} from '../../../src/ui/sidebar-tools/managed-proxy-consent.js';
import {normalizeManagedProxyConfig} from '../../../src/platform/chrome/browser-managed-proxy-config.js';

export function createPreviewProxyConsent({requestReview,hasUserActivation=()=>true}){
  const grants=new Set();
  let sequence=0,reviews=0;
  const api={runtime:{async sendMessage(request){
    const key=JSON.stringify(normalizeManagedProxyConfig(request.targetArgs.config));
    if(request.proxyConsent==='reuse'&&!grants.has(key))
      return {ok:false,error:{code:'E_PROXY_CONSENT_REQUIRED'}};
    if(request.proxyConsent==='remember')grants.add(key);
    return {ok:true,data:{approvalRef:'preview-only-'+ ++sequence}};
  }}};
  return {
    get reviewCount(){return reviews;},
    authorize(config){
      return requestManagedProxyIntent({api,identity:{toolId:'ai-proxy'},title:'AI Proxy',
        operation:'browser.proxy.managed.requestEnable',payload:{config:normalizeManagedProxyConfig(config)},
        hasUserActivation:hasUserActivation(),assertCurrent(){},
        requestReview:review=>{reviews++;return requestReview(review);}});
    },
    revoke(){grants.clear();}
  };
}
