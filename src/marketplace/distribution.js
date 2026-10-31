import {SIDEBAR_TOOL_LIMITS} from '../ui/sidebar-tools/limits.js';
// The compiled channel is the distribution authority. Page-provided URLs,
// redirects and package-declared publishers never establish source trust.
import {loadMarketChannel} from './external.js';
import {validateMarketSubject,marketError} from './intent.js';
import {validateSidebarToolPackage,serializeSidebarToolPackage,sidebarToolPackageHash} from '../ui/sidebar-tools/package.js';
export const marketReleaseBase=subject=>'/releases/'+subject.marketId+'/'+subject.version+'/';
const fields=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
export async function marketResource(url,limit,fetcher=globalThis.fetch){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{
    const response=await fetcher(url,{cache:'no-store',redirect:'error',credentials:'omit',signal:controller.signal});
    if(!response.ok)throw marketError('E_PACKAGE_MISSING','市场未提供这个固定版本的安装包。');
    if(response.redirected||response.url&&response.url!==url)throw marketError('E_PACKAGE_SOURCE','发行资源不得重定向或更换来源。');
    if(Number(response.headers?.get?.('content-length'))>limit)throw marketError('E_TOOL_LIMIT','市场资源超过大小限制。');
    if(!response.body?.getReader){
      const bytes=new Uint8Array(await response.arrayBuffer());
      if(bytes.length>limit)throw marketError('E_TOOL_LIMIT','市场资源超过大小限制。');
      return bytes;
    }
    const reader=response.body.getReader(),parts=[];let size=0;
    try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
      if(size>limit)throw marketError('E_TOOL_LIMIT','市场资源超过大小限制。');parts.push(value);}}
    catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
    const bytes=new Uint8Array(size);let at=0;for(const part of parts){bytes.set(part,at);at+=part.length;}return bytes;
  }finally{clearTimeout(timer);}
}
// The descriptor is the release's fixed published identity, scoped to the
// compiled market channel. Reads/open actions do not download or execute code.
export async function loadMarketReleaseDescriptor(subject,{api=globalThis.chrome,fetcher=globalThis.fetch,origin}={}){
  subject=validateMarketSubject(subject);
  if(subject.kind!=='app')throw marketError('E_INTENT_FIELDS','此操作只支持单个应用。');
  const channel=await loadMarketChannel(api,fetcher);
  if(!channel.enabled||channel.extensionId!==api.runtime.id||origin!==channel.origin)
    throw marketError('E_PACKAGE_SOURCE','市场发行来源与本扩展批准的通道不一致。');
  const base=marketReleaseBase(subject),decode=bytes=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  const release=decode(await marketResource(origin+base+'descriptor.json',4096,fetcher));
  if(!fields(release,['schema','marketId','version','bytes','sha256','packagePath'])||
    release.schema!=='opendesk.market.release.v1'||release.marketId!==subject.marketId||release.version!==subject.version||
    release.packagePath!==base+'package.opendesk-tool.json'||!Number.isSafeInteger(release.bytes)||release.bytes<1||release.bytes>SIDEBAR_TOOL_LIMITS.packageBytes||
    typeof release.sha256!=='string'||!(/^[a-f0-9]{64}$/).test(release.sha256))
    throw marketError('E_PACKAGE_IDENTITY','市场发行描述与所选应用或版本不一致。');
  return {release,base};
}
export async function loadMarketTool(subject,options={}){
  const {release,base}=await loadMarketReleaseDescriptor(subject,options);
  const {fetcher=globalThis.fetch,origin}=options;
  const decode=bytes=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  const bytes=await marketResource(origin+release.packagePath,SIDEBAR_TOOL_LIMITS.packageBytes,fetcher);
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
  if(bytes.length!==release.bytes||digest!==release.sha256)throw marketError('E_PACKAGE_INTEGRITY','市场安装包大小或摘要不符。');
  const tool=validateSidebarToolPackage(decode(bytes));
  if(tool.id!==subject.marketId.split('/')[1]||tool.version!==subject.version||
    await sidebarToolPackageHash(tool)!==release.sha256||new TextEncoder().encode(serializeSidebarToolPackage(tool)).length!==release.bytes)
    throw marketError('E_PACKAGE_IDENTITY','安装包身份、版本或规范字节与发行描述不符。');
  return {tool,release};
}
