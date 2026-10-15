// Fixed, extension-bundled AdBlock authority constants. Not a dynamic package entry.
export const ADBLOCK_ID='adblock';
export const ADBLOCK_CAPABILITY='adblock.control';
export const ADBLOCK_PROTOCOL='opendesk.adblock.v1';
export const ADBLOCK_SERVICE_VERSION=1;
export const ADBLOCK_STORE='opendesk.adblock.state.v1';
export const ADBLOCK_PERMISSION='declarativeNetRequestWithHostAccess';
export const ADBLOCK_RULE_FIRST=741000;
export const ADBLOCK_RULE_LAST=741199;
export const ADBLOCK_MAX_EXCEPTIONS=100;
export const ADBLOCK_OPERATIONS=Object.freeze([
  'adblock.status','adblock.enable','adblock.disable','adblock.site.set','adblock.site.restore'
]);
export const adblockError=(code,message)=>Object.assign(new Error(message),{code});
export function adblockHost(value,{asUrl=false}={}){
  if(typeof value!=='string'||!value||value.length>1024)return null;
  try{
    const raw=value.trim();
    if(!asUrl&&(/[:/?#@\s]/.test(raw)||raw!==value))return null;
    const url=new URL(asUrl?raw:'https://'+raw);
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return null;
    const host=url.hostname.toLowerCase().replace(/\.$/,'');
    if(!host||host.length>253||!(/^[a-z0-9.-]+$/.test(host)))return null;
    if(host.split('.').some(x=>!x||x.length>63||!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(x)))return null;
    if(!asUrl&&url.hostname.toLowerCase().replace(/\.$/,'')!==host)return null;
    return host;
  }catch{return null;}
}
export function emptyAdblockState(){
  return {version:1,enabled:false,exceptions:[],approvedHash:null,approvedEpoch:null};
}
export function readAdblockState(raw){
  if(raw===undefined)return emptyAdblockState();
  const bad=()=>{throw adblockError('E_ADBLOCK_STATE_CORRUPT','广告拦截本机状态损坏，已保护性停止规则，原始数据保留');};
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||
    Object.keys(raw).sort().join(',')!=='approvedEpoch,approvedHash,enabled,exceptions,version'||
    raw.version!==1||typeof raw.enabled!=='boolean'||!Array.isArray(raw.exceptions)||
    raw.exceptions.length>ADBLOCK_MAX_EXCEPTIONS||new Set(raw.exceptions).size!==raw.exceptions.length||
    raw.exceptions.some(x=>adblockHost(x)!==x)||
    (raw.approvedHash!==null&&!/^[a-f0-9]{64}$/.test(raw.approvedHash))||
    (raw.approvedEpoch!==null&&(typeof raw.approvedEpoch!=='string'||raw.approvedEpoch.length>100)))
    bad();
  return {...raw,exceptions:[...raw.exceptions]};
}
