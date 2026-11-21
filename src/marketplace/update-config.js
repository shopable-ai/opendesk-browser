import {loadMarketChannel} from './external.js';
import {UPDATE_INDEX_SOURCE,UPDATE_INDEX_CHANNEL,UPDATE_INDEX_PATH,updateIndexError} from './update-index.js';

// Provision an independently held release key through the existing Browser build
// review. No key from HTTP, a CMS session or local storage can extend this trust root.
export const MARKET_UPDATE_PUBLIC_KEYS=Object.freeze({});
export async function loadMarketUpdateConfig({api=globalThis.chrome,fetcher=globalThis.fetch}={}){
  const channel=await loadMarketChannel(api,fetcher);
  if(!channel.enabled||channel.extensionId!==api.runtime.id||!Object.keys(MARKET_UPDATE_PUBLIC_KEYS).length)
    throw updateIndexError('E_UPDATE_NOT_CONFIGURED','在线发行通道或签名公钥尚未配置。');
  return {sourceId:UPDATE_INDEX_SOURCE,channel:UPDATE_INDEX_CHANNEL,
    origin:channel.origin,endpoint:channel.origin+UPDATE_INDEX_PATH,publicKeys:MARKET_UPDATE_PUBLIC_KEYS};
}
