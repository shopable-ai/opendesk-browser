// Source-reviewed browser-global proxy profile registry.
// There is no approved commercial Provider or endpoint as of 2026-10-16.
// A future entry MUST be reviewed in trusted Host source and include:
// {reviewId,reviewedAt,reviewedBy,toolId,packageHash,config:{endpoint,domains}}
// Review endpoint ownership, target-domain authorization and outage policy.
// Never load entries from sandbox, tool storage, remote URLs, validated:true
// or developer loopback preferences.
export const REVIEWED_MANAGED_PROXY_PROFILES=Object.freeze([]);

// This separate development route is reviewed in trusted source, never in an
// installed package, storage, or the legacy AI local-test adapter. WXT serve
// uses Vite's build pipeline, so DEV may be false; MODE is the actual mode.
const developmentBuild=import.meta.env?.MODE==='development';
// Reviewed ai-vip-share 1.4.0, 116801 bytes; server allocation and two activation entries. Any package change needs source review
// and a new pin; runtime preferences and package claims cannot approve it.
const developmentPackageHash='043e97c5b92685d4865b03b36d45896777153709e8b32f7fca9530828c40ddfe';
export const MANAGED_PROXY_DEVELOPMENT_ENABLED=developmentBuild&&
  typeof developmentPackageHash==='string'&&/^[0-9a-f]{64}$/.test(developmentPackageHash);
export const DEVELOPMENT_MANAGED_PROXY_CONFIG=Object.freeze({
  endpoint:Object.freeze({scheme:'http',host:'127.0.0.1',port:7897}),
  domains:Object.freeze(['chatgpt.com','openai.com','claude.ai','anthropic.com',
    'gemini.google.com','generativelanguage.googleapis.com','perplexity.ai'].sort())
});
const exact=(value,keys)=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
  Object.keys(value).sort().join(',')===[...keys].sort().join(',');
// Also used to recognize a previous development journal for release only.
// Recognition alone is never approval to ENABLE, including in production.
export function isFixedDevelopmentManagedProxyConfig(config){
  const fixed=DEVELOPMENT_MANAGED_PROXY_CONFIG;
  return exact(config,['endpoint','domains'])&&exact(config.endpoint,['scheme','host','port'])&&
    config.endpoint.scheme===fixed.endpoint.scheme&&config.endpoint.host===fixed.endpoint.host&&
    config.endpoint.port===fixed.endpoint.port&&Array.isArray(config.domains)&&
    config.domains.length===fixed.domains.length&&config.domains.every(domain=>typeof domain==='string')&&
    [...config.domains].sort().every((domain,index)=>domain===fixed.domains[index]);
}
export function getDevelopmentManagedProxyProfile(owner){
  if(!MANAGED_PROXY_DEVELOPMENT_ENABLED||owner?.toolId!=='ai-vip-share'||
     owner.packageHash!==developmentPackageHash)return null;
  return {endpoint:{...DEVELOPMENT_MANAGED_PROXY_CONFIG.endpoint},
    domains:[...DEVELOPMENT_MANAGED_PROXY_CONFIG.domains]};
}
