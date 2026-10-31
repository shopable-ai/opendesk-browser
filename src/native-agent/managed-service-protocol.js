// Fixed, internal Native subprotocol. No page SDK, URL proxy or command runner.
export const MANAGED_SERVICES_PROTOCOL='opendesk.managed-services.v1';
export const SERVICE_ACTIONS=Object.freeze(['connect','accounts','bind','unbind','policy','accept','operation','open','disconnect']);
export const SERVICE_READS=Object.freeze(['accounts','policy','operation']);
export const serviceObject=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export const serviceExact=(v,keys)=>serviceObject(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
export const serviceID=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(v);
export const serviceOwner=v=>serviceExact(v,['extensionId','toolId','packageHash','installEpoch'])&&
  typeof v.extensionId==='string'&&/^[a-p]{32}$/.test(v.extensionId)&&serviceID(v.toolId)&&
  typeof v.packageHash==='string'&&/^[a-f0-9]{64}$/.test(v.packageHash)&&
  typeof v.installEpoch==='string'&&v.installEpoch.length>0&&v.installEpoch.length<=160&&!/[\x00-\x1f\x7f]/.test(v.installEpoch);
export function serviceDescriptor(v,{registered=false}={}){
  if(!serviceExact(v,['serviceId','serviceInstanceId','productName','origin','capabilities',...(registered?['providerEpoch']:[])])||
    !serviceID(v.serviceId)||!serviceID(v.serviceInstanceId)||registered&&!serviceID(v.providerEpoch)||
    typeof v.productName!=='string'||!v.productName.trim()||v.productName.length>80||/[\x00-\x1f\x7f]/.test(v.productName)||
    !Array.isArray(v.capabilities)||v.capabilities.length>16||new Set(v.capabilities).size!==v.capabilities.length||
    v.capabilities.some(x=>typeof x!=='string'||!/^[-a-z0-9:]{1,64}$/.test(x)))return false;
  try{const u=new URL(v.origin);
    // This version is for explicitly registered local processes only. Company
    // HTTPS/SSO requires its own reviewed connector, never a generic fetch.
    return u.origin===v.origin&&u.protocol==='http:'&&!u.username&&!u.password&&
      /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.localhost$/.test(u.hostname)&&Number(u.port)>0;
  }catch{return false;}
}
export const serviceCall=v=>serviceExact(v,['serviceId','providerEpoch','owner','action','payload'])&&
  serviceID(v.serviceId)&&serviceID(v.providerEpoch)&&serviceOwner(v.owner)&&SERVICE_ACTIONS.includes(v.action)&&serviceObject(v.payload);
