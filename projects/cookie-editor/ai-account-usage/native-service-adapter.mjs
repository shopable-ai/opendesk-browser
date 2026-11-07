// Process-only business adapter. The provider handler MUST authenticate owner on
// Chrome → Go → Node and route open results only to the fixed internal SW.
// This module grants no Native authority and never accepts a sandbox identity.
import {createHash,randomUUID} from 'node:crypto';
import {bindingError as error} from './service-binding-store.mjs';
const id=v=>{if(typeof v!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(v))throw error('BAD_INPUT');return v;};
const shape=(v,keys)=>{
  if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==keys.length||Object.keys(v).some(k=>!keys.includes(k)))throw error('BAD_INPUT');
};
const fields={
  connect:['label','operationId'],accounts:[],policy:[],
  bind:['operationId','remoteAccountId','localRef'],
  unbind:['operationId','bindingId','authEpoch','expectedRevision'],
  accept:['operationId','authEpoch','desiredRevision','desiredHash','scope'],
  operation:['operationId'],open:['remoteAccountId','bindingId'],
  disconnect:['operationId','authEpoch']
};
const positive=v=>{if(!Number.isSafeInteger(v)||v<1)throw error('BAD_INPUT');};
function origin(v){let u;try{u=new URL(v);}catch{throw error('BAD_INPUT');}
  if(typeof v!=='string'||!['https:','http:'].includes(u.protocol)||u.origin!==v||v.length>2048)throw error('BAD_INPUT');}
function localRef(v){shape(v,['origin','alias','version','storeId','partitionKey']);origin(v.origin);id(v.alias);id(v.storeId);
  if(!Number.isSafeInteger(v.version)||v.version<0)throw error('BAD_INPUT');
  if(v.partitionKey!==null){shape(v.partitionKey,['topLevelSite','hasCrossSiteAncestor']);origin(v.partitionKey.topLevelSite);if(typeof v.partitionKey.hasCrossSiteAncestor!=='boolean')throw error('BAD_INPUT');}}
function scope(v){shape(v,['bindingIds','dataCategories','trigger','retentionDays']);
  if(!Array.isArray(v.bindingIds)||v.bindingIds.length>64||new Set(v.bindingIds).size!==v.bindingIds.length)throw error('BAD_INPUT');v.bindingIds.forEach(id);
  if(!Array.isArray(v.dataCategories)||!v.dataCategories.length||v.dataCategories.length>2||new Set(v.dataCategories).size!==v.dataCategories.length||v.dataCategories.some(x=>!['ACCOUNT_METADATA','USAGE_SUMMARY'].includes(x))||v.trigger!=='MANUAL'||!Number.isInteger(v.retentionDays)||v.retentionDays<1||v.retentionDays>30)throw error('UNSUPPORTED_SCOPE');}
const safeCodes=new Set(('BAD_INPUT BAD_ID NOT_FOUND DEVICE_REQUIRED DEVICE_REVOKED GRANT_CONFLICT EPOCH_CONFLICT OPERATION_CONFLICT OPERATION_EXPIRED POLICY_CONFLICT SCOPE_EXCEEDED UNSUPPORTED_SCOPE BINDING_CONFLICT RESOURCE_ALREADY_BOUND TRUSTED_SESSION_REQUIRED SERVICE_CLOSED STORE_BUSY STORE_WRITE STORE_READ STORE_PERMISSIONS STORE_SCHEMA STORE_SIZE STORE_RESULT_SIZE INSTANCE_CONFLICT').split(' '));

// Only known metadata crosses the provider boundary. In particular, never
// forward an entire capability/client object, even if a provider adds fields.
const pick=(v,keys)=>Object.fromEntries(keys.filter(k=>Object.hasOwn(v,k)).map(k=>[k,v[k]]));
const scopeState=v=>pick(v,['bindingIds','dataCategories','trigger','retentionDays']);
function bindingState(v){
  const result=pick(v,['bindingId','deviceId','purpose','providerKey','remoteAccountId','revision','authEpoch','sourceMode','verificationState','verifiedAt','revoked']);
  if(v.localAccount){result.localAccount=pick(v.localAccount,['origin','alias','version','storeId','partitionKey']);
    if(result.localAccount.partitionKey!==null)result.localAccount.partitionKey=pick(v.localAccount.partitionKey,['topLevelSite','hasCrossSiteAncestor']);}
  return result;
}
function metadata(v){
  if(v.bindingId)return bindingState(v);
  const result=pick(v,['serviceInstanceId','deviceId','authEpoch','status','registrationStatus']);
  for(const key of ['desired','acceptance'])if(Object.hasOwn(v,key)){
    result[key]=v[key]===null?null:pick(v[key],['desiredRevision','desiredHash','authEpoch']);
    if(v[key]?.scope)result[key].scope=scopeState(v[key].scope);
  }
  if(Object.hasOwn(v,'paused'))result.paused=v.paused;
  if(v.bindings)result.bindings=v.bindings.map(bindingState);
  return result;
}
function output(action,v){
  if(action==='connect')return {...pick(v,['connectionId','providerKey']),...metadata(v)};
  if(action==='accounts')return {accounts:v.accounts.map(a=>pick(a,['remoteAccountId','providerKey','displayName','verificationState']))};
  if(action==='operation')return {...pick(v,['operationId','status','createdAt','currentAuthEpoch','deviceRevoked']),result:metadata(v.result)};
  // This URL is for the fixed internal SW only, never sandbox dispatch.
  if(action==='open')return pick(v,['url','expiresAt']);
  return metadata(v);
}

// One adapter per authenticated transport. Call disconnectAll on socket retirement.
// Returned callback takes {owner,action,payload}; no HTTP or CLI auth is invented.
export function createUsageNativeAdapter({server,store,userId='local_uid'}={}) {
  id(userId);
  const api=server?.serviceBinding,sessions=new Map();let retired=false,queue=Promise.resolve();
  const active=s=>{if(retired||s.closed)throw error('TRANSPORT_RETIRED');};
  const stop=s=>{s.closed=true;if(s.client)api.revokeLocalClient(s.client.secret);sessions.delete(s.connectionId);};
  async function run({owner,action,payload}) {
    shape(owner,['extensionId','toolId','packageHash','installEpoch']);
    if(owner.toolId!=='cookie-editor'||typeof owner.extensionId!=='string'||!/^[a-p]{32}$/.test(owner.extensionId)||typeof owner.packageHash!=='string'||!/^[a-f0-9]{64}$/.test(owner.packageHash)||
      typeof owner.installEpoch!=='string'||!owner.installEpoch.length||owner.installEpoch.length>160||/[\x00-\x1f\x7f]/.test(owner.installEpoch))throw error('OWNER_REJECTED');
    if(!Object.hasOwn(fields,action))throw error('UNKNOWN_ACTION');
    // Open is either device-level or an exact account/binding pair; identities
    // are always derived below from the authenticated session.
    shape(payload,['connectionId',...(action==='open'&&Object.keys(payload??{}).length===1?[]:fields[action])]);id(payload.connectionId);
    const p=structuredClone(payload),ownerKey=JSON.stringify([owner.extensionId,owner.toolId,owner.packageHash,owner.installEpoch]);
    if('operationId'in p)id(p.operationId);
    for(const k of ['remoteAccountId','bindingId'])if(k in p)id(p[k]);
    for(const k of ['authEpoch','expectedRevision','desiredRevision'])if(k in p)positive(p[k]);
    if(action==='connect'&&(typeof p.label!=='string'||!p.label.length||p.label.length>80||/[\x00-\x1f]/.test(p.label)))throw error('BAD_INPUT');
    if(action==='bind')localRef(p.localRef);
    if(action==='accept'){scope(p.scope);if(typeof p.desiredHash!=='string'||!/^[a-f0-9]{64}$/.test(p.desiredHash))throw error('BAD_INPUT');}
    if(retired)throw error('TRANSPORT_RETIRED');
    if(!api||!['createLocalClient','renewLocalClient','retainLocalClientReceipts','request','createManagementOpen','revokeLocalClient'].every(k=>typeof api[k]==='function'))throw error('NATIVE_NOT_WIRED',503);
    let s=sessions.get(p.connectionId);
    if(s&&s.ownerKey!==ownerKey)throw error('OWNER_MISMATCH',403);
    if(action==='connect') {
      if(s)throw error('CONNECTION_EXISTS',409);
      s={connectionId:p.connectionId,ownerKey,closed:false,client:null,device:null,writes:new Set(),connectOperationId:p.operationId};sessions.set(p.connectionId,s);
      try {
        const resourceIds=(await store.accounts()).map(a=>id(a.alias));active(s);
        if(resourceIds.length>64||new Set(resourceIds).size!==resourceIds.length)throw error('BAD_INPUT');
        const installationId=createHash('sha256').update(JSON.stringify([owner.extensionId,owner.packageHash,owner.installEpoch])).digest('hex');
        s.client=await api.createLocalClient({connectionId:p.connectionId,installationId,userId,grantFamilyId:randomUUID(),resourceIds});
        if(retired||s.closed){api.revokeLocalClient(s.client.secret);active(s);}
        s.device=await api.request(s.client.secret,{method:'POST',path:'/opendesk/v1/devices',body:{operationId:p.operationId,label:p.label}});active(s);
        return {connectionId:p.connectionId,status:'CONNECTED',providerKey:'codex',...s.device};
      }catch(e){if(!s.client)stop(s);throw e;}
    }
    if(!s)throw error('CONNECTION_REQUIRED',409);
    // Only GET receipts survive an uncertain disconnect. A second explicit
    // disconnect retires that private context locally; it never resends DELETE.
    if(s.receiptOnly&&action==='disconnect'){stop(s);return {status:'DISCONNECTED',registrationStatus:'UNKNOWN'};}
    if(s.receiptOnly&&action!=='operation')throw error('CONNECTION_RECEIPT_ONLY',409);
    active(s);
    // Process-only renewal uses the server clock and the SAME context/grant.
    // Renew before dispatch, never retry a request after an expiry or lost reply.
    const renewal=await api.renewLocalClient(s.client.secret);active(s);
    s.client.expiresAt=renewal.expiresAt;
    const req=(method,path,body)=>api.request(s.client.secret,{method,path:'/opendesk/v1/'+path,body});
    if(action==='operation') {
      const result=await req('GET','operations/'+p.operationId);active(s);
      if(!s.device&&p.operationId===s.connectOperationId)s.device=result.result;
      return result;
    }
    if(!s.device&&action==='disconnect'){stop(s);return {status:'DISCONNECTED',registrationStatus:'UNKNOWN'};}
    if(!s.device)throw error('CONNECTION_UNCONFIRMED',409);
    if(action==='accounts'||action==='policy') {const result=await req('GET',action==='accounts'?'accounts':'sync-policy');active(s);return result;}
    if(action==='open') {const result=await api.createManagementOpen(s.client.secret,{serviceInstanceId:api.serviceInstanceId,deviceId:s.device.deviceId,remoteAccountId:p.remoteAccountId,bindingId:p.bindingId});active(s);return result;}
    if(s.writes.has(p.operationId))throw error('OPERATION_ALREADY_SENT',409);
    s.writes.add(p.operationId);
    let method,path,body;
    if(action==='bind'){method='POST';path='bindings';body={operationId:p.operationId,purpose:'usage',providerKey:'codex',remoteAccountId:p.remoteAccountId,expectedRevision:0,localAccount:p.localRef};}
    if(action==='unbind'){method='DELETE';path='bindings/'+p.bindingId;body={operationId:p.operationId,authEpoch:p.authEpoch,expectedRevision:p.expectedRevision};}
    if(action==='accept'){method='POST';path='policy-acceptances';const {connectionId,...rest}=p;body={...rest,action:'accept'};}
    if(action==='disconnect'){method='DELETE';path='devices/'+s.device.deviceId;body={operationId:p.operationId,authEpoch:p.authEpoch};}
    try {const result=await req(method,path,body);active(s);if(action==='disconnect')stop(s);return result;}
    catch(e){
      if(action==='disconnect'&&!retired&&!s.closed){
        // DELETE may have committed. Preserve exact owner/grant for reconciliation,
        // but revoke account access, mutations and all management links/sessions.
        s.receiptOnly=true;api.retainLocalClientReceipts(s.client.secret);
      }
      throw e;
    }
  }
  const callback=input=>{
    // Snapshot before queueing: transport/UI mutation cannot change the owner.
    let snapshot;try{shape(input,['owner','action','payload']);snapshot=structuredClone(input);}catch{return Promise.reject(error('BAD_INPUT'));}
    const task=queue.then(()=>run(snapshot));queue=task.catch(()=>{});
    return task.then(value=>output(snapshot.action,value)).catch(e=>{if(safeCodes.has(e.code)||['OWNER_REJECTED','OWNER_MISMATCH','UNKNOWN_ACTION','TRANSPORT_RETIRED','NATIVE_NOT_WIRED','CONNECTION_EXISTS','CONNECTION_REQUIRED','CONNECTION_UNCONFIRMED','CONNECTION_RECEIPT_ONLY','OPERATION_ALREADY_SENT'].includes(e.code))throw error(e.code,e.status);throw error('RESULT_UNKNOWN',503);});
  };
  callback.disconnectAll=async()=>{retired=true;for(const s of sessions.values())stop(s);};
  return Object.freeze(callback);
}
