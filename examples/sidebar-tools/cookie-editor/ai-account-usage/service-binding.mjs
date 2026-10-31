import {createHash,randomUUID} from 'node:crypto';
import {bindingError as error,exact} from './service-binding-store.mjs';
const id=value=>{if(typeof value!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(value))throw error('BAD_ID');return value;};
const number=value=>{if(!Number.isSafeInteger(value)||value<0)throw error('BAD_INPUT');return value;};
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const hash=value=>createHash('sha256').update(canonical(value)).digest('hex');
// Fixed local HistoryStore contract; a caller label cannot define a provider.
const LOCAL_PROVIDER_KEY='codex';
const owner=c=>[c.tenantId,c.userId,c.connectionId,c.installationId,c.grantFamilyId];
const same=(a,b)=>canonical(a)===canonical(b);
function context(c){exact(c,['tenantId','userId','connectionId','installationId','grantFamilyId','resourceIds']);
  owner(c).forEach(id);if(!Array.isArray(c.resourceIds)||c.resourceIds.length>64||new Set(c.resourceIds).size!==c.resourceIds.length)throw error('BAD_INPUT');c.resourceIds.forEach(id);}
function localRef(ref){exact(ref,['origin','alias','version','storeId','partitionKey']);
  let url;try{if(typeof ref.origin!=='string'||ref.origin.length>2048)throw Error();url=new URL(ref.origin);}catch{throw error('BAD_INPUT');}
  if(!['http:','https:'].includes(url.protocol)||url.origin!==ref.origin)throw error('BAD_INPUT');
  id(ref.alias);number(ref.version);id(ref.storeId);
  if(ref.partitionKey!==null){exact(ref.partitionKey,['topLevelSite','hasCrossSiteAncestor']);
    let site;try{site=new URL(ref.partitionKey.topLevelSite);}catch{throw error('BAD_INPUT');}
    if(!['http:','https:'].includes(site.protocol)||site.origin!==ref.partitionKey.topLevelSite||typeof ref.partitionKey.hasCrossSiteAncestor!=='boolean')throw error('BAD_INPUT');}
}
function scope(value){exact(value,['bindingIds','dataCategories','trigger','retentionDays']);
  if(!Array.isArray(value.bindingIds)||value.bindingIds.length>64||new Set(value.bindingIds).size!==value.bindingIds.length)throw error('BAD_INPUT');value.bindingIds.forEach(id);
  if(!Array.isArray(value.dataCategories)||value.dataCategories.length<1||new Set(value.dataCategories).size!==value.dataCategories.length||value.dataCategories.some(x=>!['ACCOUNT_METADATA','USAGE_SUMMARY'].includes(x))||value.trigger!=='MANUAL'||!Number.isInteger(value.retentionDays)||value.retentionDays<1||value.retentionDays>30)throw error('UNSUPPORTED_SCOPE');
}
export function createServiceBindingService({store,serviceInstanceId=randomUUID(),clock=Date.now}={}) {
  id(serviceInstanceId);
  function device(state,c,allowRevoked=false){context(c);const d=state.devices.find(d=>d.serviceInstanceId===serviceInstanceId&&same(owner(d),owner(c)));
    if(!d)throw error('DEVICE_REQUIRED',403);if(!same(d.resourceIds,c.resourceIds))throw error('GRANT_CONFLICT',403);if(d.revoked&&!allowRevoked)throw error('DEVICE_REVOKED',403);return d;}
  function resource(c,remote){id(remote);if(!c.resourceIds.includes(remote))throw error('NOT_FOUND',404);}
  function binding(state,d,bindingId){const b=state.bindings.find(b=>b.bindingId===bindingId&&b.deviceId===d.deviceId&&b.tenantId===d.tenantId&&!b.revoked);
    if(!b)throw error('NOT_FOUND',404);return b;}
  function epoch(d,body){if(number(body.authEpoch)!==d.authEpoch)throw error('EPOCH_CONFLICT',409);}
  function receipt(state,c,body,kind,run,validateReplay=()=>{}){id(body.operationId);const digest=hash({kind,body,serviceInstanceId}),key=[kind==='desired'?'admin':'device',serviceInstanceId,...owner(c)];
    const existing=state.operations.find(o=>o.operationId===body.operationId&&same(o.owner,key));
    if(existing){if(existing.digest!==digest)throw error('OPERATION_CONFLICT',409);
      if(clock()-existing.createdAt>=30*86400_000)throw error('OPERATION_EXPIRED',410);validateReplay(existing.result);return existing.result;}
    const result=run();state.operations.push({operationId:body.operationId,owner:key,digest,createdAt:clock(),result:structuredClone(result)});return result;}
  function policy(d){return {serviceInstanceId,deviceId:d.deviceId,authEpoch:d.authEpoch,desired:d.desired,acceptance:d.acceptance,paused:d.paused,
    status:!d.acceptance?'PENDING':d.paused?'PAUSED':d.acceptance.desiredHash===d.desired?.desiredHash?'ACCEPTED':'PENDING'};}
  async function registerDevice(c,body){context(c);exact(body,['operationId','label']);
    if(typeof body.label!=='string'||body.label.length<1||body.label.length>80||/[\x00-\x1f]/.test(body.label))throw error('BAD_INPUT');
    return store.transact(state=>{const existing=state.devices.find(d=>d.serviceInstanceId===serviceInstanceId&&same(owner(d),owner(c)));
      if(state.devices.some(d=>d.serviceInstanceId===serviceInstanceId&&d.tenantId===c.tenantId&&d.grantFamilyId===c.grantFamilyId&&(!same(owner(d),owner(c))||!same(d.resourceIds,c.resourceIds))))throw error('GRANT_CONFLICT',403);
      if(existing?.revoked)throw error('DEVICE_REVOKED',403);
      return receipt(state,c,body,'register',()=>{if(existing)return {deviceId:existing.deviceId,authEpoch:existing.authEpoch,serviceInstanceId};
        const d={...Object.fromEntries(['tenantId','userId','connectionId','installationId','grantFamilyId'].map(k=>[k,c[k]])),resourceIds:structuredClone(c.resourceIds),deviceId:randomUUID(),serviceInstanceId,label:body.label,authEpoch:1,revoked:false,desired:null,acceptance:null,paused:false};
        state.devices.push(d);return {deviceId:d.deviceId,authEpoch:1,serviceInstanceId};});});}
  async function saveDesiredPolicy(admin,body){exact(admin,['tenantId','deviceId']);id(admin.tenantId);id(admin.deviceId);exact(body,['operationId','expectedRevision','scope']);scope(body.scope);
    return store.transact(state=>{const d=state.devices.find(d=>d.deviceId===admin.deviceId&&d.tenantId===admin.tenantId&&d.serviceInstanceId===serviceInstanceId&&!d.revoked);
      if(!d)throw error('NOT_FOUND',404);
      // Separate administrative owner: a device receipt cannot impersonate a policy save.
      const c=d;
      return receipt(state,c,body,'desired',()=>{if(number(body.expectedRevision)!==(d.desired?.desiredRevision??0))throw error('POLICY_CONFLICT',409);
        body.scope.bindingIds.forEach(b=>binding(state,d,b));
        const desired={desiredRevision:(d.desired?.desiredRevision??0)+1,scope:structuredClone(body.scope)};
        desired.desiredHash=hash({serviceInstanceId,tenantId:d.tenantId,deviceId:d.deviceId,...desired});d.desired=desired;return desired;});});}
  async function request(c,{method,path,body}) {
    context(c);
    if(method==='POST'&&path==='/opendesk/v1/devices')return registerDevice(c,body);
    if(method==='GET'){
      const state=await store.read(),d=device(state,c,path.startsWith('/opendesk/v1/operations/'));
      if(path==='/opendesk/v1/self')return {serviceInstanceId,tenantId:c.tenantId,userId:c.userId,connectionId:c.connectionId,deviceId:d.deviceId,scopes:['accounts:read','bindings:usage','policy:state'],roles:['device']};
      if(path==='/opendesk/v1/sync-policy')return {...policy(d),bindings:state.bindings.filter(b=>b.deviceId===d.deviceId&&!b.revoked&&c.resourceIds.includes(b.remoteAccountId))};
      const operation=/^\/opendesk\/v1\/operations\/([A-Za-z0-9_-]+)$/.exec(path);
      if(operation){const o=state.operations.find(o=>o.operationId===operation[1]&&same(o.owner,['device',serviceInstanceId,...owner(c)]));
        if(!o)throw error('NOT_FOUND',404);if(clock()-o.createdAt>=30*86400_000)throw error('OPERATION_EXPIRED',410);
        return {operationId:o.operationId,status:'CONFIRMED',createdAt:o.createdAt,currentAuthEpoch:d.authEpoch,deviceRevoked:d.revoked,result:o.result};}
      throw error('NOT_FOUND',404);
    }
    return store.transact(state=>{const d=device(state,c,method==='DELETE');
      if(d.revoked){
        const old=state.operations.find(o=>o.operationId===body?.operationId&&same(o.owner,['device',serviceInstanceId,...owner(c)]));
        if(!old)throw error('DEVICE_REVOKED',403);
        return receipt(state,c,body,path,()=>{throw error('DEVICE_REVOKED',403);});
      }
      if(method==='POST'&&path==='/opendesk/v1/bindings'){
        exact(body,['operationId','purpose','providerKey','remoteAccountId','expectedRevision','localAccount']);
        if(body.purpose!=='usage')throw error('UNSUPPORTED_PURPOSE');id(body.providerKey);if(body.providerKey!==LOCAL_PROVIDER_KEY)throw error('PROVIDER_MISMATCH');resource(c,body.remoteAccountId);localRef(body.localAccount);
        return receipt(state,c,body,path,()=>{if(body.expectedRevision!==0)throw error('BINDING_CONFLICT',409);
          if(state.bindings.some(b=>!b.revoked&&b.tenantId===c.tenantId&&state.devices.some(owner=>owner.deviceId===b.deviceId&&owner.serviceInstanceId===serviceInstanceId&&owner.connectionId===c.connectionId)&&b.remoteAccountId===body.remoteAccountId))throw error('RESOURCE_ALREADY_BOUND',409);
          const b={bindingId:randomUUID(),deviceId:d.deviceId,tenantId:c.tenantId,purpose:'usage',providerKey:LOCAL_PROVIDER_KEY,remoteAccountId:body.remoteAccountId,localAccount:structuredClone(body.localAccount),revision:1,authEpoch:d.authEpoch,sourceMode:'MANUAL',verificationState:'UNVERIFIED',verifiedAt:null,revoked:false};state.bindings.push(b);return b;});
      }
      if(method==='POST'&&path==='/opendesk/v1/policy-acceptances'){
        exact(body,['operationId','action','authEpoch','desiredRevision','desiredHash','scope']);
        // Current authority precedes replay: historical success cannot restore it.
        epoch(d,body);
        return receipt(state,c,body,path,()=>{
          if(body.action==='accept'){
            scope(body.scope);body.scope.bindingIds.forEach(b=>resource(c,binding(state,d,b).remoteAccountId));
            const desired=d.desired;
            if(!desired||body.desiredRevision!==desired.desiredRevision||body.desiredHash!==desired.desiredHash)throw error('POLICY_CONFLICT',409);
            if(body.scope.bindingIds.some(b=>!desired.scope.bindingIds.includes(b))||body.scope.dataCategories.some(x=>!desired.scope.dataCategories.includes(x))||body.scope.retentionDays>desired.scope.retentionDays)throw error('SCOPE_EXCEEDED',403);
            d.acceptance={desiredRevision:body.desiredRevision,desiredHash:body.desiredHash,authEpoch:d.authEpoch,scope:structuredClone(body.scope)};
            // Acceptance alone cannot undo an explicit pause.
          }else if(body.action==='pause'){d.paused=true;}
          else if(body.action==='resume'){
            if(!d.acceptance||d.acceptance.desiredHash!==d.desired?.desiredHash)throw error('POLICY_CONFLICT',409);d.paused=false;
          }else if(body.action==='revoke'){d.authEpoch++;d.acceptance=null;d.paused=true;}
          else throw error('BAD_INPUT');return policy(d);},historical=>{
          if(!same(historical,policy(d)))throw error('POLICY_CONFLICT',409);
        });
      }
      const deleted=/^\/opendesk\/v1\/(bindings|devices)\/([A-Za-z0-9_-]+)$/.exec(path);
      if(method==='DELETE'&&deleted){exact(body,deleted[1]==='bindings'?['operationId','authEpoch','expectedRevision']:['operationId','authEpoch']);
        return receipt(state,c,body,path,()=>{epoch(d,body);
          if(deleted[1]==='devices'){if(deleted[2]!==d.deviceId)throw error('NOT_FOUND',404);d.revoked=true;state.bindings.filter(b=>b.deviceId===d.deviceId).forEach(b=>{b.revoked=true;b.authEpoch++;});}
          else {const b=binding(state,d,deleted[2]);resource(c,b.remoteAccountId);if(body.expectedRevision!==b.revision)throw error('BINDING_CONFLICT',409);b.revoked=true;b.revision++;b.authEpoch++;}
          d.authEpoch++;d.acceptance=null;d.paused=true;return {status:'REVOKED',authEpoch:d.authEpoch};});}
      throw error('NOT_FOUND',404);
    });
  }
  async function managementPath(c,target){context(c);exact(target,['serviceInstanceId','deviceId','bindingId','remoteAccountId']);
    if(target.serviceInstanceId!==serviceInstanceId)throw error('INSTANCE_CONFLICT',409);
    const state=await store.read(),d=device(state,c);if(d.deviceId!==target.deviceId)throw error('NOT_FOUND',404);
    if(target.bindingId===undefined&&target.remoteAccountId===undefined)return '/opendesk/admin/sync?device='+encodeURIComponent(d.deviceId);
    const b=binding(state,d,target.bindingId);resource(c,target.remoteAccountId);
    if(b.remoteAccountId!==target.remoteAccountId)throw error('NOT_FOUND',404);
    return '/opendesk/admin/accounts/'+encodeURIComponent(b.remoteAccountId);
  }
  async function adminOperation({deviceId,operationId}){
    id(deviceId);id(operationId);const state=await store.read();
    const d=state.devices.find(d=>d.deviceId===deviceId&&d.tenantId==='local'&&d.serviceInstanceId===serviceInstanceId);
    if(!d)throw error('NOT_FOUND',404);
    const key=['admin',serviceInstanceId,...owner(d)];
    const o=state.operations.find(o=>o.operationId===operationId&&same(o.owner,key));
    if(!o)throw error('NOT_FOUND',404);if(clock()-o.createdAt>=30*86400_000)throw error('OPERATION_EXPIRED',410);
    return {operationId,status:'CONFIRMED',result:o.result};
  }
  async function adminDevices(){const state=await store.read();return state.devices.filter(d=>d.serviceInstanceId===serviceInstanceId&&d.tenantId==='local').map(d=>({...policy(d),label:d.label,revoked:d.revoked,
    bindings:state.bindings.filter(b=>b.deviceId===d.deviceId&&!b.revoked)}));}
  return Object.freeze({serviceInstanceId,registerDevice,request,saveDesiredPolicy,managementPath,adminDevices,adminOperation});
}
