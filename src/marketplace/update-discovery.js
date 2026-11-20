// Runs in the EXISTING trusted Worker. UI reads through its existing notice RPC.
import {loadMarketUpdateConfig} from './update-config.js';
import {UPDATE_INDEX_PATH,UPDATE_INDEX_SOURCE,UPDATE_INDEX_CHANNEL,MAX_UPDATE_INDEX_BYTES,MAX_UPDATE_PAYLOAD_BYTES,
  verifySignedUpdateIndex,parseUpdateIndexJSON,updateIndexError,updateReleaseEligibility,
  updateReleaseIdentityKey,updateReleaseIdentityDigest,decodeUpdateIndexBase64} from './update-index.js';
import {writeVerifiedLocalValue} from '../ui/sidebar-tools/storage-state.js';
import {MARKET_PROVENANCE_STORE} from '../sidebar-tools/official-reading-toc.js';
import {UPDATE_NOTICE_LOCK} from '../platform/chrome/update-notice-state.js';

export const MARKET_UPDATE_INDEX_STORE='opendesk.market.verified-index.v1';
export const MAX_ACCEPTED_RELEASE_IDENTITIES=4096;
const fail=(code,message)=>{throw updateIndexError(code,message);};
const clone=value=>structuredClone(value);
const plain=v=>v&&typeof v==='object'&&!Array.isArray(v);
function storedState(value){
  if(value===undefined)return null;
  if(!plain(value)||value.schema!==MARKET_UPDATE_INDEX_STORE||value.sourceId!==UPDATE_INDEX_SOURCE||
    value.channel!==UPDATE_INDEX_CHANNEL||!Number.isSafeInteger(value.sequence)||value.sequence<1||
    typeof value.origin!=='string'||!plain(value.envelope)||
    !/^[a-f0-9]{64}$/.test(value.payloadSha256)||!plain(value.identities)||
    Object.keys(value.identities).length>MAX_ACCEPTED_RELEASE_IDENTITIES||
    Object.entries(value.identities).some(([key,digest])=>
      !/^opendesk-official\|sidebar-tool\|opendesk\/[a-z][a-z0-9-]{1,39}\|(?:0|[1-9]\d{0,5})\.(?:0|[1-9]\d{0,5})\.(?:0|[1-9]\d{0,5})$/.test(key)||
      typeof digest!=='string'||!/^[a-f0-9]{64}$/.test(digest))||
    !(value.etag===null||typeof value.etag==='string'&&value.etag.length<=200)||
    !Number.isFinite(value.acceptedAt))fail('E_UPDATE_STORAGE','发行核验记录损坏，已停止更新检查。');
  return value;
}
function validConfig(config){
  let url;try{url=new URL(config.endpoint);}catch{fail('E_UPDATE_NOT_CONFIGURED','发行索引地址未配置。');}
  if(config.sourceId!==UPDATE_INDEX_SOURCE||config.channel!==UPDATE_INDEX_CHANNEL||
    url.origin!==config.origin||url.pathname!==UPDATE_INDEX_PATH||url.search||url.hash||url.username||url.password||
    !(url.protocol==='https:'||url.protocol==='http:'&&url.hostname==='127.0.0.1'&&url.port)||
    !plain(config.publicKeys)||!Object.keys(config.publicKeys).length)
    fail('E_UPDATE_NOT_CONFIGURED','发行索引来源、渠道或公钥未配置。');
  return config;
}
function catalog(verified,config){
  const {payload,payloadSha256}=verified;
  return {sourceId:payload.sourceId,channel:payload.channel,origin:config.origin,
    sequence:payload.sequence,payloadSha256,issuedAt:payload.issuedAt,expiresAt:payload.expiresAt,
    apps:payload.releases.map(row=>({...clone(row),id:row.marketId,
      installationPolicy:'optional',bytes:row.descriptor.bytes,sha256:row.descriptor.sha256,
      packagePath:row.descriptor.packagePath,sourceId:payload.sourceId,channel:payload.channel,
      origin:config.origin,eligibility:updateReleaseEligibility(row),
      updateSource:{sourceId:payload.sourceId,kind:row.kind,channel:payload.channel,origin:config.origin}}))};
}

export function createMarketUpdateDiscovery({api=globalThis.chrome,fetcher=globalThis.fetch,
  lockManager=globalThis.navigator?.locks,now=Date.now,loadConfig=loadMarketUpdateConfig,
  timeoutMs=15000}={}){
  let pending=null,writeUnknown=false;
  const config=async()=>validConfig(await loadConfig({api,fetcher}));
  const read=async()=>storedState((await api.storage.local.get(MARKET_UPDATE_INDEX_STORE))[MARKET_UPDATE_INDEX_STORE]);
  async function verifyState(state,cfg,{historical=false}={}){
    if(!state||state.origin!==cfg.origin||state.sourceId!==cfg.sourceId||state.channel!==cfg.channel)
      fail('E_UPDATE_SOURCE','本地发行记录与已配置来源不一致。');
    // An expired previous snapshot may attest history, never usable candidates.
    const time=historical?Date.parse(parseUpdateIndexJSON(
      decodeUpdateIndexBase64(state.envelope.payload,MAX_UPDATE_PAYLOAD_BYTES),MAX_UPDATE_PAYLOAD_BYTES).issuedAt):now();
    const verified=await verifySignedUpdateIndex(JSON.stringify(state.envelope),{...cfg,now:time});
    if(verified.payload.sequence!==state.sequence||verified.payloadSha256!==state.payloadSha256)
      fail('E_UPDATE_STORAGE','发行高水位与签名原件不一致。');
    for(const row of verified.payload.releases)
      if(state.identities[updateReleaseIdentityKey(cfg.sourceId,row)]!==await updateReleaseIdentityDigest(row))
        fail('E_UPDATE_STORAGE','已接受发行记录与签名原件不一致。');
    return verified;
  }
  async function readCurrent(){
    const cfg=await config(),state=await read();
    if(!state)fail('E_UPDATE_NOT_CHECKED','尚未核验在线发行。');
    return catalog(await verifyState(state,cfg),cfg);
  }
  // Caller may already own UPDATE_NOTICE_LOCK. This function NEVER takes it.
  async function assertCurrent(observed){
    const cfg=await config(),state=await read();
    if(!state||state.origin!==observed.origin||state.sourceId!==observed.sourceId||state.channel!==observed.channel||
      state.sequence!==observed.sequence||state.payloadSha256!==observed.payloadSha256)
      fail('E_UPDATE_INDEX_CHANGED','发行索引已变化，请重新检查。');
    await verifyState(state,cfg);
    return true;
  }
  async function accept(verified,cfg,etag){
    if(!lockManager?.request)fail('E_UPDATE_LOCK','缺少共享更新锁。');
    return lockManager.request(UPDATE_NOTICE_LOCK,{mode:'exclusive'},async()=>{
      if(writeUnknown)fail('E_UPDATE_STORAGE_UNKNOWN','发行核验写入结果未知，请先只读核对。');
      const previous=await read();
      if(previous){
        await verifyState(previous,cfg,{historical:true});
        if(verified.payload.sequence<previous.sequence||verified.payload.sequence===previous.sequence&&
          verified.payloadSha256!==previous.payloadSha256)
          fail('E_UPDATE_REPLAY','发行索引序号回退或同序号内容冲突。');
      }
      // Recheck time after waiting for the lock. ETag cannot extend it.
      verified=await verifySignedUpdateIndex(JSON.stringify(verified.envelope),{...cfg,now:now()});
      const identities={...(previous?.identities||{})};
      const provenance=(await api.storage.local.get(MARKET_PROVENANCE_STORE))[MARKET_PROVENANCE_STORE];
      if(provenance!==undefined&&!plain(provenance))fail('E_UPDATE_STORAGE','安装来源记录无法核对。');
      for(const release of verified.payload.releases){
        const key=updateReleaseIdentityKey(cfg.sourceId,release),digest=await updateReleaseIdentityDigest(release);
        if(identities[key]&&identities[key]!==digest)
          fail('E_UPDATE_RELEASE_CONFLICT','已接受的同版本发行身份发生变化。');
        const old=provenance?.[release.toolId];
        if(old?.sourceId===cfg.sourceId&&old.kind===release.kind&&old.channel===cfg.channel&&
          old.origin===cfg.origin&&old.marketId===release.marketId&&old.version===release.version&&
          old.sha256!==release.descriptor.sha256)
          fail('E_UPDATE_RELEASE_CONFLICT','发行与本机已接受的同版本包摘要冲突。');
        identities[key]=digest;
      }
      if(Object.keys(identities).length>MAX_ACCEPTED_RELEASE_IDENTITIES)
        fail('E_UPDATE_HISTORY_LIMIT','已接受发行历史达到安全容量；未截断历史。');
      const next={schema:MARKET_UPDATE_INDEX_STORE,sourceId:cfg.sourceId,channel:cfg.channel,origin:cfg.origin,
        sequence:verified.payload.sequence,payloadSha256:verified.payloadSha256,
        envelope:verified.envelope,etag,acceptedAt:now(),identities};
      try{await writeVerifiedLocalValue(api,MARKET_UPDATE_INDEX_STORE,next,previous??undefined,'发行索引核验');}
      catch(error){if(error.code==='E_OUTCOME_UNKNOWN')writeUnknown=true;throw error;}
      return catalog(verified,cfg);
    });
  }
  async function request(cfg,previous){
    const controller=new AbortController();let timer,reader;
    const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();
      void reader?.cancel().catch(()=>{});reject(updateIndexError('E_UPDATE_TIMEOUT','发行索引读取超时。'));
    },Math.min(15000,Math.max(1,timeoutMs)));});
    try{return await Promise.race([(async()=>{
      let cached=null;
      if(previous)try{cached=await verifyState(previous,cfg);}catch(error){
        if(error.code!=='E_UPDATE_EXPIRED')throw error;
      }
      const response=await fetcher(cfg.endpoint,{method:'GET',cache:'no-store',credentials:'omit',
        redirect:'error',signal:controller.signal,headers:{Accept:'application/json',
          ...(cached&&previous.etag?{'If-None-Match':previous.etag}:{})}});
      if(response.redirected||response.url&&response.url!==cfg.endpoint)
        fail('E_UPDATE_SOURCE','发行索引不得重定向或更换来源。');
      if(response.status===304){
        if(!cached||!previous?.etag)fail('E_UPDATE_CACHE','304 没有仍有效的已验证缓存。');
        const tag=response.headers?.get?.('etag');
        if(tag&&tag!==previous.etag)fail('E_UPDATE_CACHE','304 的缓存身份不一致。');
        // The accepting lock rechecks expiry and high-water before reuse.
        return {verified:cached,etag:previous.etag};
      }
      if(response.status!==200)fail(response.status===429?'E_UPDATE_RATE_LIMIT':
        response.status===503?'E_UPDATE_UNAVAILABLE':'E_UPDATE_HTTP','发行索引服务返回 '+response.status+'。');
      if(!/^application\/json(?:\s*;|$)/i.test(response.headers?.get?.('content-type')||''))
        fail('E_UPDATE_CONTENT_TYPE','发行索引未返回 JSON。');
      if(Number(response.headers?.get?.('content-length'))>MAX_UPDATE_INDEX_BYTES)
        fail('E_UPDATE_LIMIT','发行索引超过读取预算。');
      let bytes;
      if(response.body?.getReader){
        reader=response.body.getReader();const parts=[];let length=0;
        try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;
          if(length>MAX_UPDATE_INDEX_BYTES)fail('E_UPDATE_LIMIT','发行索引超过读取预算。');parts.push(value);}}
        catch(error){void reader.cancel().catch(()=>{});throw error;}
        finally{reader.releaseLock();reader=null;}
        bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
      }else{bytes=new Uint8Array(await response.arrayBuffer());
        if(bytes.length>MAX_UPDATE_INDEX_BYTES)fail('E_UPDATE_LIMIT','发行索引超过读取预算。');}
      const etag=response.headers?.get?.('etag');
      return {verified:await verifySignedUpdateIndex(bytes,{...cfg,now:now()}),
        etag:typeof etag==='string'&&etag.length<=200?etag:null};
    })(),deadline]);}
    finally{clearTimeout(timer);controller.abort();}
  }
  async function check({fresh=false}={}){
    if(pending){
      if(!fresh||pending.fresh)return clone(await pending.promise);
      // A manual/fresh check cannot be satisfied by a pending cache-only read.
      try{await pending.promise;}catch{/* The explicit fresh attempt still runs. */}
      return check({fresh:true});
    }
    const work=(async()=>{
      const cfg=await config();
      if(writeUnknown){
        // A new explicit check only clears the fence after a full readback.
        const state=await read();await verifyState(state,cfg,{historical:true});writeUnknown=false;
      }
      if(!fresh){
        if(!lockManager?.request)fail('E_UPDATE_LOCK','缺少共享更新锁。');
        const cached=await lockManager.request(UPDATE_NOTICE_LOCK,{mode:'exclusive'},async()=>{
          const state=await read();if(!state)return null;
          try{return catalog(await verifyState(state,cfg),cfg);}
          catch(error){if(error.code==='E_UPDATE_EXPIRED')return null;throw error;}
        });
        if(cached)return cached;
      }
      const previous=await read(),{verified,etag}=await request(cfg,previous);
      return accept(verified,cfg,etag);
    })();
    const ticket={fresh,promise:work};pending=ticket;
    try{return clone(await work);}finally{if(pending===ticket)pending=null;}
  }
  return {check,readCurrent,assertCurrent};
}
