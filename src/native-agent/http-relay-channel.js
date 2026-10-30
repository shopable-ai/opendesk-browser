import {relayStore} from './http-relay-store.js';
import {fail} from '../framework/sdk/registry.js';
const ENDPOINT='http://127.0.0.1:43122/rpc',LIMIT=8192;
const encoder=new TextEncoder();
export const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':
  value&&typeof value==='object'?'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}':JSON.stringify(value);
const hex=bytes=>Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');
const unhex=value=>Uint8Array.from(value.match(/../g)??[],x=>parseInt(x,16));
const unbase64=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),x=>x.charCodeAt(0));
const random=()=>btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const unsigned=value=>{const {mac,...body}=value;return body;};
export async function sha(value){return hex(await crypto.subtle.digest('SHA-256',encoder.encode(canonical(value))));}
export async function mac(key,value){
  const imported=await crypto.subtle.importKey('raw',key,{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return hex(await crypto.subtle.sign('HMAC',imported,encoder.encode(canonical(value))));
}
const proof=(key,label,transcript)=>mac(key,{label,transcript});
export function createRelayChannel({store=relayStore(),fetchImpl=globalThis.fetch,
  withLock=work=>globalThis.navigator.locks.request('opendesk-native-http-channel',work),origin=globalThis.location?.origin}={}){
  async function post(value,timeout=2500,path='/rpc'){
    const body=JSON.stringify(value);
    if(encoder.encode(body).length>LIMIT)throw fail('E_LIMIT','Local HTTP RPC exceeds 8192 bytes');
    let response;
    try{response=await fetchImpl(ENDPOINT.replace('/rpc',path),{method:value===null?'GET':'POST',
      ...(value===null?{}:{headers:{'Content-Type':'application/json'},body}),
      credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(timeout)});}
    catch{throw fail('E_NATIVE_UNAVAILABLE','Local Node HTTP service unavailable; no browser fallback');}
    if(!response.body)throw fail('E_NATIVE_AUTH','Missing local response');
    const reader=response.body.getReader(),chunks=[];let size=0;
    try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;
      if(size>LIMIT){await reader.cancel();throw fail('E_LIMIT','Local HTTP response exceeds 8192 bytes');}chunks.push(value);}}
    finally{reader.releaseLock();}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
    catch{throw fail('E_NATIVE_AUTH','Invalid local service response');}
  }
  async function rpcLocked(method,body,candidate,beforeSend){
    const pair=candidate??await store.read();if(!pair)throw fail('E_NATIVE_PAIR_REQUIRED','Pair the local Node service in 本机连接 → 本地 HTTP 转发');
    const seq=pair.seq+1;
    if(!Number.isSafeInteger(seq))throw fail('E_NATIVE_AUTH');
    if(!candidate)await store.write({...pair,seq}); // Reserve before dispatch, including uncertain failures.
    const request={v:1,clientId:pair.clientId,generation:pair.generation,sessionId:pair.sessionId,seq,id:random(),method,body};
    const envelope={...request,mac:await mac(unhex(pair.key),request)};
    if(beforeSend)await beforeSend();
    const response=await post(envelope);
    const valid=response.v===1&&response.clientId===request.clientId&&response.generation===request.generation&&
      response.sessionId===request.sessionId&&response.seq===seq&&response.id===request.id&&response.requestHash===await sha(request)&&
      typeof response.mac==='string'&&response.mac===await mac(unhex(pair.key),unsigned(response));
    if(!valid)throw fail('E_NATIVE_AUTH','Local response authentication failed');
    if(!response.ok)throw fail('E_NATIVE_REQUEST',response.body?.code??'Local HTTP request rejected');
    if(candidate||pair.phase!=='active')await store.write({...pair,seq,phase:'active'});
    return response.body;
  }
  return {
    rpc:(method,body={},beforeSend)=>withLock(()=>rpcLocked(method,body,undefined,beforeSend)),
    async pair(encoded){return withLock(async()=>{
      if(await store.read())throw fail('E_NATIVE_PAIR_EXISTS','Revoke the current pairing before replacing it');
      let invite;try{invite=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(unbase64(encoded.trim())));}catch{throw fail('E_NATIVE_INVITE','Invalid invitation');}
      if(!invite||!Number.isSafeInteger(invite.generation)||invite.expiresAt<=Date.now()||
        !/^[A-Za-z0-9_-]{43}$/.test(invite.secret)||!/^[A-Za-z0-9_-]{43}$/.test(invite.invitationId))throw fail('E_NATIVE_INVITE','Invalid or expired invitation');
      const challenge={invitationId:invite.invitationId,generation:invite.generation,clientId:random(),clientNonce:random()};
      const first=await post({v:1,method:'pair.challenge',body:challenge});
      const {serverProof,...transcript}=first.body??{};
      if(!first.ok||Object.keys(transcript).length!==7||Object.entries(challenge).some(([k,v])=>transcript[k]!==v)||
        transcript.origin!==origin||!/^[A-Za-z0-9_-]{43}$/.test(transcript.sessionId)||!/^[A-Za-z0-9_-]{43}$/.test(transcript.serverNonce)||
        serverProof!==await proof(unbase64(invite.secret),'server',transcript))throw fail('E_NATIVE_AUTH','Local service invitation proof failed');
      const material=await crypto.subtle.importKey('raw',unbase64(invite.secret),'HKDF',false,['deriveBits']);
      const key=new Uint8Array(await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt:unhex(await sha(transcript)),
        info:encoder.encode('opendesk-http-relay-v1')},material,256));
      const ready=await post({v:1,method:'pair.prove',body:{sessionId:transcript.sessionId,proof:await proof(unbase64(invite.secret),'client',transcript)}});
      if(!ready.ok||ready.body?.sessionId!==transcript.sessionId||ready.body.proof!==await proof(key,'ready',transcript))throw fail('E_NATIVE_AUTH');
      const pair={clientId:transcript.clientId,sessionId:transcript.sessionId,generation:transcript.generation,key:hex(key),seq:0,phase:'confirming'};
      await store.write(pair); // A lost confirmation is recovered by authenticated status, never by replaying a target request.
      const confirmed=await post({v:1,method:'pair.confirm',body:{sessionId:transcript.sessionId,proof:await proof(key,'confirm',transcript)}});
      if(!confirmed.ok||confirmed.body?.generation!==pair.generation||confirmed.body?.proof!==await proof(key,'paired',transcript))throw fail('E_EFFECT_UNKNOWN','Pair confirmation unknown; check status');
      await store.write({...pair,phase:'active'});return {paired:true};
    });},
    async revoke(){return withLock(async()=>{
      const pair=await store.read();
      if(!pair)return {paired:false};
      try{await rpcLocked('revoke',{});}
      catch(error){
        if(pair.phase!=='confirming')throw error;
        // No target request is admitted until authenticated status activates
        // this key. Explicitly clearing a stranded confirmation is safe; it
        // makes no claim about the disconnected Node service's pairing state.
        await store.clear();return {paired:false,notice:'已清除未完成配对。本机服务状态未知，请在本机执行 revoke 后重新生成邀请。'};
      }
      await store.clear();return {paired:false};
    });},
    async status(){return withLock(async()=>{
      const pair=await store.read();if(!pair)return {paired:false};
      // Discovery is untrusted. Prove the retained channel key against a fresh
      // signed status before saving a new boot incarnation. Never replay HTTP.
      // Chrome omits Origin on extension GETs. A JSON POST carries its actual
      // extension Origin, preserving the relay's strict transport check.
      const hello=await post({v:1},2500,'/hello');
      if(hello.v!==1||!Number.isSafeInteger(hello.generation)||hello.generation<pair.generation||
        !Number.isSafeInteger(hello.lastSeq)||hello.lastSeq<0||!/^[A-Za-z0-9_-]{43}$/.test(hello.sessionId))throw fail('E_NATIVE_AUTH');
      const sameBoot=hello.generation===pair.generation&&hello.sessionId===pair.sessionId;
      return rpcLocked('status',{}, {...pair,generation:hello.generation,sessionId:hello.sessionId,
        seq:sameBoot?Math.max(pair.seq,hello.lastSeq):hello.lastSeq});
    });}
  };
}
