// Site profiles select reviewed code; they never grant permissions or execute it.
// Only exact, canonical origins are supported. Ambiguous registrations fail closed.
const fields=['id','version','origin','adapter','adapterVersion','protocols','enabled'];
const identifier=/^[a-z][a-z0-9-]{0,63}$/u;
const version=/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u;
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
  Object.getPrototypeOf(value)===Object.prototype;
const fail=()=>{throw Object.assign(new Error('Invalid or conflicting site profile'),{code:'E_SITE_PROFILE'});};
function originOf(value){
  if(typeof value!=='string'||value.length>2048)return null;
  try{
    const url=new URL(value);
    return (url.protocol==='https:'||url.protocol==='http:')&&!url.username&&!url.password&&
      !url.hostname.includes('*')?url.origin:null;
  }catch{return null;}
}
export function createSiteProfileRegistry({profiles,adapterIds,protocolIds}={}){
  if(!Array.isArray(profiles)||!Array.isArray(adapterIds)||!Array.isArray(protocolIds)||profiles.length>256)fail();
  const adapters=new Set(adapterIds),protocols=new Set(protocolIds),ids=new Set(),origins=new Map();
  for(const item of profiles){
    if(!plain(item)||Object.keys(item).length!==fields.length||
      !fields.every(key=>Object.hasOwn(item,key))||
      typeof item.id!=='string'||!identifier.test(item.id)||
      typeof item.adapter!=='string'||!identifier.test(item.adapter)||
      typeof item.version!=='string'||!version.test(item.version)||
      typeof item.adapterVersion!=='string'||!version.test(item.adapterVersion)||
      typeof item.origin!=='string'||originOf(item.origin)!==item.origin||!adapters.has(item.adapter)||
      typeof item.enabled!=='boolean'||!Array.isArray(item.protocols)||
      item.protocols.length===0||item.protocols.length>16||
      new Set(item.protocols).size!==item.protocols.length||
      Array.from(item.protocols).some(protocol=>typeof protocol!=='string'||!protocols.has(protocol))||
      ids.has(item.id)||item.enabled&&origins.has(item.origin))fail();
    ids.add(item.id);
    const profile=Object.freeze({id:item.id,version:item.version,origin:item.origin,
      adapter:item.adapter,adapterVersion:item.adapterVersion,
      protocols:Object.freeze([...item.protocols]),enabled:item.enabled});
    if(profile.enabled)origins.set(profile.origin,profile);
  }
  return Object.freeze({select(url){const origin=originOf(url);return origin?origins.get(origin)??null:null;}});
}
