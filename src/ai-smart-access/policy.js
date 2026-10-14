// Fixed first-party policy. Remote services may supply only a validated endpoint,
// never PAC JavaScript, website rules, arbitrary URLs or Cookie instructions.
// Transitional identity until a public managed proxy SDK replaces the R1 host.
export const AI_ID='ai-vip-share';
export const LEGACY_AI_ID='ai-smart-access';
export const AI_CAPABILITY='ai.access';
export const AI_PROTOCOL='opendesk.ai-vip-share.v1';
export const AI_VERSION=1;
// New tool installation cannot inherit the old ID's activation lease.
export const AI_STORE='opendesk.ai-vip-share.state.v1';
export const LEGACY_AI_STORE='opendesk.ai-access.state.v1';
export const AI_ALARM='opendesk.ai-vip-share.lease-check.v1';
export const LEGACY_AI_ALARM='opendesk.ai-access.lease-check.v1';
export const AI_OPERATIONS=Object.freeze(['aiAccess.status','aiAccess.enable','aiAccess.disable','aiAccess.activate']);
export const AI_DOMAINS=Object.freeze([
  'chatgpt.com','openai.com','claude.ai','gemini.google.com','perplexity.ai'
]);
export const aiError=(code,message)=>Object.assign(new Error(message),{code});
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const exact=(value,names)=>plain(value)&&
  Object.keys(value).sort().join(',')===names.slice().sort().join(',');
export function validEndpoint(endpoint){
  if(!exact(endpoint,['scheme','host','port'])||
     !['https','socks5'].includes(endpoint.scheme)||
     typeof endpoint.host!=='string'||endpoint.host.length>253||
     !Number.isInteger(endpoint.port)||endpoint.port<1||endpoint.port>65535)
    throw aiError('E_AI_ENDPOINT','可信服务返回了无效代理端点');
  const host=endpoint.host;
  if(host!==host.toLowerCase()||host.endsWith('.')||!host.includes('.')||
     /^(?:localhost|.*\.localhost|.*\.local|.*\.internal)$/.test(host)||
     /^[0-9.]+$/.test(host)||host.includes(':')||
     !host.split('.').every(label=>label.length>0&&label.length<=63&&
       /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)))
    throw aiError('E_AI_ENDPOINT','代理必须是可信服务批准的公网 ASCII 域名');
  return {scheme:endpoint.scheme,host,port:endpoint.port};
}
export function validLease(lease,now=Date.now()){
  if(!exact(lease,['leaseId','expiresAt','endpoint'])||
     typeof lease.leaseId!=='string'||!/^[A-Za-z0-9._-]{8,180}$/.test(lease.leaseId)||
     !Number.isSafeInteger(lease.expiresAt)||lease.expiresAt<=now+60000||
     lease.expiresAt>now+3*86400000)
    throw aiError('E_AI_LEASE','代理授权无效或已过期');
  return {leaseId:lease.leaseId,expiresAt:lease.expiresAt,endpoint:validEndpoint(lease.endpoint)};
}
export function leaseUsable(lease,now=Date.now()){
  try{return validLease(lease,now)}catch{return null}
}
export function compileAiPac(endpoint){
  const approved=validEndpoint(endpoint);
  const directive=(approved.scheme==='socks5'?'SOCKS5 ':'HTTPS ')+approved.host+':'+approved.port;
  const lines=['function FindProxyForURL(url, host) {',
    '  host = String(host).toLowerCase().replace(/\\.$/, "");'];
  for(const domain of AI_DOMAINS){
    const name=JSON.stringify(domain);
    lines.push('  if (host === '+name+' || dnsDomainIs(host, ".'+domain+'")) return '+JSON.stringify(directive)+';');
  }
  lines.push('  return "DIRECT";','}');
  return lines.join('\n');
}
export function desiredAiProxy(endpoint){
  return {mode:'pac_script',pacScript:{data:compileAiPac(endpoint),mandatory:true}};
}
export function matchesAiProxy(actual,endpoint){
  const expected=desiredAiProxy(endpoint);
  return actual?.mode==='pac_script'&&
    actual.pacScript?.data===expected.pacScript.data&&actual.pacScript?.mandatory===true;
}
export function controlLevel(level){
  return ['not_controllable','controlled_by_other_extensions',
    'controllable_by_this_extension','controlled_by_this_extension'].includes(level)?level:'unknown';
}
