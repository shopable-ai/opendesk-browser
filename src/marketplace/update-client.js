// Trusted Side Panel/app adapter. The existing Worker is the index authority;
// downloaded packages still go through distribution.js and the original Installer.
import {UPDATE_NOTICE_PROTOCOL} from '../platform/chrome/update-notice-state.js';
import {loadMarketTool} from './distribution.js';
import {updateIndexError,UPDATE_INDEX_SOURCE,UPDATE_INDEX_CHANNEL,
  sameUpdateRelease,updateReleaseEligibility,MAX_MARKET_PACKAGE_BYTES,MAX_UPDATE_PAYLOAD_BYTES,
  updateIndexDigest,decodeUpdateIndexBase64} from './update-index.js';
import {MARKET_UPDATE_INDEX_STORE} from './update-discovery.js';
import {sidebarToolPackageHash,serializeSidebarToolPackage} from '../ui/sidebar-tools/package.js';
import {sameStorageValue} from '../ui/sidebar-tools/storage-state.js';

export function onlineUpdateSource(value){
  const source=value?.updateSource||value;
  let url;try{url=new URL(source?.origin);}catch{return null;}
  if(source?.sourceId!==UPDATE_INDEX_SOURCE||source.kind!=='sidebar-tool'||source.channel!==UPDATE_INDEX_CHANNEL||
    url.origin!==source.origin||url.pathname!=='/'||url.search||url.hash||url.username||url.password||
    !(url.protocol==='https:'||url.protocol==='http:'&&url.hostname==='127.0.0.1'&&url.port))return null;
  return {sourceId:source.sourceId,kind:source.kind,channel:source.channel,origin:source.origin};
}
export async function readOnlineUpdateCatalog({api=globalThis.chrome,fresh=false}={}){
  let timer,response;
  try{response=await Promise.race([
    api.runtime.sendMessage({protocol:UPDATE_NOTICE_PROTOCOL,kind:'market-index',...(fresh?{fresh:true}:{})}),
    new Promise((_,reject)=>{timer=setTimeout(()=>reject(updateIndexError(
      'E_UPDATE_TIMEOUT','在线发行核验超时，请重新检查。')),20000);})
  ]);}finally{clearTimeout(timer);}
  if(!response?.ok)throw updateIndexError(response?.error?.code||'E_UPDATE_UNAVAILABLE',
    response?.error?.message||'在线发行核验服务不可用。');
  const data=response.data;
  if(!data||data.sourceId!==UPDATE_INDEX_SOURCE||data.channel!==UPDATE_INDEX_CHANNEL||
    !Number.isSafeInteger(data.sequence)||data.sequence<1||!Array.isArray(data.apps)||
    !/^[a-f0-9]{64}$/.test(data.payloadSha256)||!Number.isFinite(Date.parse(data.expiresAt))||Date.parse(data.expiresAt)<=Date.now())
    throw updateIndexError('E_UPDATE_SCHEMA','在线发行核验回执无效或已过期。');
  return data;
}
export async function resolveOnlineUpdateRelease(selection,{api=globalThis.chrome,fetcher=globalThis.fetch}={}){
  const source=onlineUpdateSource(selection),toolId=selection?.toolId||selection?.id;
  if(!source)throw updateIndexError('E_UPDATE_SOURCE','更新候选缺少完整可信来源。');
  const catalog=await readOnlineUpdateCatalog({api,fresh:true});
  if(catalog.origin!==source.origin)throw updateIndexError('E_UPDATE_SOURCE','更新来源在审阅期间变化。');
  const row=catalog.apps.find(item=>item.toolId===toolId&&item.version===selection.version&&
    item.sha256===selection.sha256&&sameStorageValue(onlineUpdateSource(item),source));
  if(!row||row.state!=='published')throw updateIndexError('E_UPDATE_WITHDRAWN','所选发行已撤回或不在当前快照中。');
  if(updateReleaseEligibility(row)!=='package')throw updateIndexError('E_UPDATE_COMPATIBILITY',
    '此发行需要先更新 Browser 或核对运行兼容性。');
  if(selection.descriptor&&!sameUpdateRelease(selection,row))
    throw updateIndexError('E_PACKAGE_IDENTITY','发行身份或安全元数据在审阅期间变化。');
  return {...row,indexVerification:{sourceId:catalog.sourceId,channel:catalog.channel,origin:catalog.origin,
    sequence:catalog.sequence,payloadSha256:catalog.payloadSha256,expiresAt:catalog.expiresAt}};
}
export async function verifyOnlineMarketCandidate(candidate,market,{api=globalThis.chrome,fetcher=globalThis.fetch}={}){
  const row=await resolveOnlineUpdateRelease({toolId:candidate.id,version:candidate.version,
    sha256:market.sha256,updateSource:market},{api,fetcher});
  const bytes=new TextEncoder().encode(serializeSidebarToolPackage(candidate));
  if(market.marketId!==row.marketId||bytes.length!==row.descriptor.bytes||bytes.length>MAX_MARKET_PACKAGE_BYTES||
    await sidebarToolPackageHash(candidate)!==row.descriptor.sha256||candidate.title!==row.packageTitle||
    candidate.description!==row.description||!sameStorageValue([...candidate.capabilities].sort(),[...row.capabilities].sort())||
    !sameStorageValue({format:candidate.format,browserSdk:candidate.requires?.browserSdk??null,
      uiRuntime:candidate.uiRuntime??null},row.requirements))
    throw updateIndexError('E_PACKAGE_IDENTITY','已审阅包的字节、来源、能力或运行需求与当前发行不一致。');
  // A fresh network response is not an atomic admission to installation. Keep
  // its verified identity in this trusted closure; the original Installer calls
  // it while holding UPDATE_NOTICE_LOCK immediately before its first journal
  // write. No network/Worker RPC occurs inside that short critical section.
  const proof=structuredClone(row.indexVerification);
  return {release:row,async assertCurrent(){
    const state=(await api.storage.local.get(MARKET_UPDATE_INDEX_STORE))[MARKET_UPDATE_INDEX_STORE];
    if(!state||state.schema!==MARKET_UPDATE_INDEX_STORE||
      ['sourceId','channel','origin','sequence','payloadSha256'].some(key=>state[key]!==proof[key]))
      throw updateIndexError('E_UPDATE_INDEX_CHANGED','安装前发行快照已变化，请重新检查并审阅。');
    const bytes=decodeUpdateIndexBase64(state.envelope?.payload,MAX_UPDATE_PAYLOAD_BYTES);
    if(await updateIndexDigest(bytes)!==proof.payloadSha256)
      throw updateIndexError('E_UPDATE_STORAGE','安装前发行快照原件与核验回执不一致。');
    if(Date.parse(proof.expiresAt)<=Date.now())
      throw updateIndexError('E_UPDATE_EXPIRED','安装前发行快照已过期，请重新检查。');
  }};
}
export async function loadOnlineUpdateTool(release,options={}){
  const row=await resolveOnlineUpdateRelease(release,options);
  const {tool}=await loadMarketTool({kind:'app',marketId:row.marketId,version:row.version},
    {...options,origin:row.origin,expectedDescriptor:row.descriptor});
  // Local comparison now; the Installer performs another fresh check after locks/review.
  const bytes=new TextEncoder().encode(serializeSidebarToolPackage(tool));
  if(bytes.length!==row.bytes||tool.title!==row.packageTitle||tool.description!==row.description||
    !sameStorageValue([...tool.capabilities].sort(),[...row.capabilities].sort())||
    !sameStorageValue({format:tool.format,browserSdk:tool.requires?.browserSdk??null,
      uiRuntime:tool.uiRuntime??null},row.requirements))
    throw updateIndexError('E_PACKAGE_IDENTITY','下载包与签名发行元数据不一致。');
  return {tool,release:row};
}
