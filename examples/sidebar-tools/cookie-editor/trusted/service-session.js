// Fixed, trusted Cookie consumer. Never import this into a dynamic tool sandbox.
import {serviceDescriptor,serviceOwner} from '../../../../src/native-agent/managed-service-protocol.js';
export const COOKIE_SERVICE_SESSION_KEY='opendesk.cookie-editor.service-session.v1';
const fail=code=>Object.assign(Error(code),{code});
const clone=v=>structuredClone(v);
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>object(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const id=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(v);
const integer=v=>Number.isSafeInteger(v)&&v>=0;
const positive=v=>integer(v)&&v>0;
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const check=(ok,code='E_SERVICE_INPUT')=>{if(!ok)throw fail(code);};
const origin=v=>{try{const u=new URL(v);return typeof v==='string'&&v.length<=2048&&u.origin===v&&['http:','https:'].includes(u.protocol)&&!u.username&&!u.password;}catch{return false;}};
const owner=v=>serviceOwner(v)&&v.toolId==='cookie-editor';
const ref=v=>exact(v,['origin','alias','version','storeId','partitionKey'])&&origin(v.origin)&&id(v.alias)&&integer(v.version)&&id(v.storeId)&&
  (v.partitionKey===null||exact(v.partitionKey,['topLevelSite','hasCrossSiteAncestor'])&&origin(v.partitionKey.topLevelSite)&&typeof v.partitionKey.hasCrossSiteAncestor==='boolean');
const scope=v=>exact(v,['bindingIds','dataCategories','trigger','retentionDays'])&&Array.isArray(v.bindingIds)&&v.bindingIds.length<=64&&v.bindingIds.every(id)&&new Set(v.bindingIds).size===v.bindingIds.length&&
  Array.isArray(v.dataCategories)&&v.dataCategories.length>0&&v.dataCategories.length<=2&&new Set(v.dataCategories).size===v.dataCategories.length&&v.dataCategories.every(x=>['ACCOUNT_METADATA','USAGE_SUMMARY'].includes(x))&&v.trigger==='MANUAL'&&positive(v.retentionDays)&&v.retentionDays<=30;
const desired=v=>exact(v,['desiredRevision','desiredHash','scope'])&&positive(v.desiredRevision)&&hash(v.desiredHash)&&scope(v.scope);
const acceptance=v=>exact(v,['desiredRevision','desiredHash','scope','authEpoch'])&&desired({desiredRevision:v.desiredRevision,desiredHash:v.desiredHash,scope:v.scope})&&positive(v.authEpoch);
const policyValid=v=>v===null||exact(v,['serviceInstanceId','deviceId','authEpoch','status','desired','acceptance','paused'])&&id(v.serviceInstanceId)&&id(v.deviceId)&&positive(v.authEpoch)&&['PENDING','ACCEPTED','PAUSED'].includes(v.status)&&typeof v.paused==='boolean'&&(v.desired===null||desired(v.desired))&&(v.acceptance===null||acceptance(v.acceptance));
const bindingKeys=['bindingId','deviceId','purpose','providerKey','remoteAccountId','revision','authEpoch','sourceMode','verificationState','verifiedAt','revoked','localAccount'];
const bindingValid=v=>exact(v,bindingKeys)&&id(v.bindingId)&&id(v.deviceId)&&v.purpose==='usage'&&v.providerKey==='codex'&&id(v.remoteAccountId)&&positive(v.revision)&&positive(v.authEpoch)&&v.sourceMode==='MANUAL'&&v.verificationState==='UNVERIFIED'&&v.verifiedAt===null&&typeof v.revoked==='boolean'&&ref(v.localAccount);
const pick=(v,keys)=>Object.fromEntries(keys.map(k=>[k,clone(v[k])]));
const actions={serviceConnect:['connect',['connectionId','serviceId','providerEpoch']],serviceResources:['accounts',['connectionId']],serviceReadPolicy:['policy',['connectionId']],
  serviceCommitAssociation:['bind',['associationId']],serviceUnbindAssociation:['unbind',['associationId']],serviceRemoteDisconnect:['disconnect',['connectionId']],
  serviceAcceptPolicy:['accept',['connectionId','desiredRevision','desiredHash','scope']],serviceOpenManagement:['open',['connectionId','associationId']],
  serviceReconcile:['operation',['connectionId']],serviceArchiveOpenUnknown:['archive',['connectionId','operationId']]};
const reads=new Set(['accounts','policy','operation']);
const outcomes=['PENDING','OUTCOME_UNKNOWN','CONFIRMED','NOT_DISPATCHED','FAILED_CONFIRMED'];
const expectedValid=(action,v)=>action==='bind'?exact(v,['associationId','remoteAccountId','localRef'])&&id(v.associationId)&&id(v.remoteAccountId)&&ref(v.localRef):
  action==='unbind'?exact(v,['associationId','bindingId','expectedRevision','authEpoch'])&&id(v.associationId)&&id(v.bindingId)&&positive(v.expectedRevision)&&positive(v.authEpoch):
  action==='accept'?exact(v,['authEpoch','desiredRevision','desiredHash','scope'])&&positive(v.authEpoch)&&positive(v.desiredRevision)&&hash(v.desiredHash)&&scope(v.scope):
  action==='open'?exact(v,['associationId','remoteAccountId','bindingId','tabAttempted'])&&typeof v.tabAttempted==='boolean'&&[v.associationId,v.remoteAccountId,v.bindingId].every(x=>x===''||id(x)):
  ['connect','disconnect'].includes(action)&&exact(v,[]);
const receiptValid=v=>exact(v,['operationId','action','outcome','expected','archived'])&&id(v.operationId)&&outcomes.includes(v.outcome)&&typeof v.archived==='boolean'&&expectedValid(v.action,v.expected);
const retiredKeys=['provider','remoteConnectionId','deviceId','authEpoch','status','connectionEpoch','bindings','ledger'];
const recoverable=r=>!r.pending&&!r.bindings.some(x=>!x.value.revoked)&&
  (r.status==='DISCONNECTED'&&r.ledger.at(-1)?.action==='disconnect'&&r.ledger.at(-1)?.outcome==='CONFIRMED'||
   r.status==='UNCONNECTED'&&r.deviceId===''&&r.ledger.at(-1)?.action==='connect'&&r.ledger.at(-1)?.outcome==='NOT_DISPATCHED');
const stored=v=>v===undefined?empty():v;
const empty=()=>({format:1,revision:0,sessions:[]});
function validate(v){
  check(exact(v,['format','revision','sessions'])&&v.format===1&&integer(v.revision)&&Array.isArray(v.sessions)&&v.sessions.length<=16&&JSON.stringify(v).length<=262144,'E_SERVICE_STORE');
  const seen=new Set();
  for(const r of v.sessions){
    check(exact(r,['connectionId','connectionEpoch','owner','runtimeId','provider','remoteConnectionId','deviceId','authEpoch','status','resources','policy','bindings','pending','ledger','retired'])&&id(r.connectionId)&&!seen.has(r.connectionId)&&positive(r.connectionEpoch)&&owner(r.owner)&&id(r.runtimeId)&&serviceDescriptor(r.provider,{registered:true})&&r.provider.serviceId==='ai-account-usage'&&id(r.remoteConnectionId)&&(r.deviceId===''||id(r.deviceId))&&integer(r.authEpoch)&&['UNCONNECTED','CONNECTED','DISCONNECTED'].includes(r.status)&&Array.isArray(r.resources)&&r.resources.length<=64&&r.resources.every(x=>exact(x,['remoteAccountId','providerKey','verificationState'])&&id(x.remoteAccountId)&&x.providerKey==='codex'&&x.verificationState==='UNVERIFIED')&&policyValid(r.policy)&&Array.isArray(r.bindings)&&r.bindings.length<=128&&r.bindings.every(x=>exact(x,['associationId','value'])&&id(x.associationId)&&bindingValid(x.value))&&Array.isArray(r.ledger)&&r.ledger.length<=128&&r.ledger.every(receiptValid)&&(r.pending===null||receiptValid(r.pending)&&['PENDING','OUTCOME_UNKNOWN'].includes(r.pending.outcome)),'E_SERVICE_STORE');
    check(Array.isArray(r.retired)&&r.retired.length<=8&&r.retired.every(x=>exact(x,retiredKeys)&&serviceDescriptor(x.provider,{registered:true})&&x.provider.serviceId==='ai-account-usage'&&id(x.remoteConnectionId)&&(x.deviceId===''||id(x.deviceId))&&integer(x.authEpoch)&&positive(x.connectionEpoch)&&['UNCONNECTED','DISCONNECTED'].includes(x.status)&&Array.isArray(x.bindings)&&x.bindings.length<=128&&x.bindings.every(b=>exact(b,['associationId','value'])&&id(b.associationId)&&bindingValid(b.value)&&b.value.revoked)&&Array.isArray(x.ledger)&&x.ledger.length<=128&&x.ledger.every(receiptValid)),'E_SERVICE_STORE');
    seen.add(r.connectionId);
  }
  return v;
}

export function createCookieServiceSession({api,storage,transport}={}){
  const runtimeId='runtime_'+crypto.randomUUID().replaceAll('-','');
  // A runtime marker alone cannot authenticate persisted metadata. Keep a
  // process-only lease and permanently retire it when the client/provider changes.
  const leases=new Map();
  function native(){
    try{const client=transport?.(),s=client?.state();if(typeof client?.request!=='function'||!s?.supported||!s.connected||!Array.isArray(s.services))return {client,providers:[]};
      return {client,providers:s.services.filter(v=>serviceDescriptor(v,{registered:true})&&v.serviceId==='ai-account-usage'&&v.capabilities.includes('usage:manual-binding')&&v.capabilities.includes('policy:metadata-state')).map(clone)};
    }catch{return {client:null,providers:[]};}
  }
  function live(r,n){const lease=leases.get(r.connectionId);if(!lease)return false;
    if(lease.client!==n.client||!n.providers.some(p=>same(p,r.provider))){leases.delete(r.connectionId);return false;}
    return r.runtimeId===runtimeId&&lease.remoteConnectionId===r.remoteConnectionId;
  }
  async function db(){try{const s=await storage?.();check(s?.readOnly!==true&&typeof s?.transaction==='function','E_ACCOUNT_STORAGE_UNAVAILABLE');return s;}catch{throw fail('E_ACCOUNT_STORAGE_UNAVAILABLE');}}
  async function read(d){try{return validate(await d.transaction(['frameworkKV'],'readonly',async tx=>stored(await tx.get('frameworkKV',COOKIE_SERVICE_SESSION_KEY))));}catch(e){throw fail(e?.code==='E_SERVICE_STORE'?'E_SERVICE_STORE':'E_ACCOUNT_STORAGE_UNAVAILABLE');}}
  async function save(d,before,next,guard){
    validate(next);let attempted=false;
    try{await d.transaction(['frameworkKV'],'readwrite',async tx=>{const current=validate(stored(await tx.get('frameworkKV',COOKIE_SERVICE_SESSION_KEY)));check(same(current,before),'E_SERVICE_CONFLICT');await guard();attempted=true;await tx.put('frameworkKV',clone(next),COOKIE_SERVICE_SESSION_KEY);});
      check(same(await read(d),next),'E_OUTCOME_UNKNOWN');await guard();
    }catch(e){if(attempted)throw fail('E_OUTCOME_UNKNOWN');throw e?.code?e:fail('E_ACCOUNT_STORAGE_UNAVAILABLE');}
  }
  function facts(localState,identity,accounts,n,state){
    const result=clone(localState);result.sessionRevision=state.revision;
    result.nativeServices=n.providers.map(p=>({...clone(p),capabilities:p.capabilities.filter(x=>['usage:manual-binding','policy:metadata-state','management:resource-open'].includes(x))}));
    result.connections=result.connections.map(c=>{
      const r=state.sessions.find(x=>x.connectionId===c.id);
      if(!r)return {...c,session:null};
      const ownerCurrent=same(r.owner,identity),epochCurrent=r.connectionEpoch===c.epoch,
        leased=live(r,n),active=c.ownerCurrent&&ownerCurrent&&epochCurrent&&leased&&!r.pending&&r.status==='CONNECTED';
      return {...c,session:{ownerCurrent,epochCurrent,live:leased,status:r.status,
        reconnectable:recoverable(r)&&r.retired.length<8,
        management:r.provider.capabilities.includes('management:resource-open'),
        resources:active?clone(r.resources):[],policy:active?clone(r.policy):null,
        pending:r.pending?pick(r.pending,['operationId','action','outcome']):null}};
    });
    result.associations=result.associations.map(a=>{
      const r=state.sessions.find(x=>x.connectionId===a.connectionId),b=r?.bindings.find(x=>x.associationId===a.id)?.value;
      return {...a,accountCurrent:accounts.some(x=>x.alias===a.localAlias&&x.origin===a.localOrigin&&x.version===a.accountVersion),
        binding:b?{id:b.bindingId,revoked:b.revoked}:null};
    });
    return result;
  }
  async function present(localState,{identity,accounts=[],assertCurrent=async()=>{}}={}){
    const d=await db();await assertCurrent();const state=await read(d);await assertCurrent();return facts(localState,identity,accounts,native(),state);
  }
  function apply(r,p,result){
    check(object(result),'E_SERVICE_RESULT');
    if(p.action==='connect'){
      check(result.serviceInstanceId===r.provider.serviceInstanceId&&id(result.deviceId)&&positive(result.authEpoch)&&(!('connectionId'in result)||result.connectionId===r.remoteConnectionId)&&(!('providerKey'in result)||result.providerKey==='codex'),'E_SERVICE_RESULT');
      r.deviceId=result.deviceId;r.authEpoch=result.authEpoch;r.status='CONNECTED';
    }else if(p.action==='bind'){
      const b=pick(result,bindingKeys),e=p.expected;
      check(bindingValid(b)&&b.deviceId===r.deviceId&&b.remoteAccountId===e.remoteAccountId&&same(b.localAccount,e.localRef)&&!b.revoked&&b.authEpoch===r.authEpoch,'E_SERVICE_RESULT');
      const old=r.bindings.find(x=>x.associationId===e.associationId);if(old)old.value=b;else r.bindings.push({associationId:e.associationId,value:b});r.policy=null;
    }else if(p.action==='unbind'){
      const e=p.expected,old=r.bindings.find(x=>x.associationId===e.associationId)?.value;
      check(old&&old.bindingId===e.bindingId&&old.revision===e.expectedRevision&&result.status==='REVOKED'&&result.authEpoch===e.authEpoch+1,'E_SERVICE_RESULT');
      old.revoked=true;old.revision++;old.authEpoch++;r.authEpoch=result.authEpoch;r.policy=null;
    }else if(p.action==='disconnect'){
      check(result.status==='REVOKED'&&result.authEpoch===r.authEpoch+1,'E_SERVICE_RESULT');r.status='DISCONNECTED';r.authEpoch=result.authEpoch;r.policy=null;r.resources=[];for(const b of r.bindings)b.value.revoked=true;
    }else if(p.action==='accept'){
      const v=pick(result,['serviceInstanceId','deviceId','authEpoch','status','desired','acceptance','paused']);
      check(policyValid(v)&&v.serviceInstanceId===r.provider.serviceInstanceId&&v.deviceId===r.deviceId&&v.authEpoch===r.authEpoch&&['ACCEPTED','PAUSED'].includes(v.status)&&v.acceptance&&v.acceptance.authEpoch===r.authEpoch&&same(v.desired,r.policy?.desired)&&same(v.acceptance.scope,p.expected.scope)&&v.acceptance.desiredRevision===p.expected.desiredRevision&&v.acceptance.desiredHash===p.expected.desiredHash,'E_SERVICE_RESULT');r.policy=v;
    }
  }
  async function dispatch({operation,payload,localState,identity,accounts=[],localRef,assertCurrent=async()=>{}}){
    const spec=actions[operation];check(spec&&owner(identity)&&origin(payload?.origin));const [action,fields]=spec;
    check(exact(payload,['origin',...(!reads.has(action)?['revision','sessionRevision']:[]),...fields]));
    if(!reads.has(action))check(integer(payload.revision)&&payload.revision===localState.revision,'E_SERVICE_CONFLICT');
    const input=clone({payload,identity,localState,accounts,localRef:localRef??null});({payload,identity,localState,accounts,localRef}=input);
    let n=native();const client=n.client;
    await assertCurrent();check(native().client===client,'E_SERVICE_SESSION_EXPIRED');
    const d=await db();await assertCurrent();let before=await read(d);await assertCurrent();
    // Configuration revision alone cannot identify a reviewed Native session:
    // reconnect and remote reads may change authority without editing config.
    if(!reads.has(action))check(integer(payload.sessionRevision)&&payload.sessionRevision===before.revision,'E_SERVICE_CONFLICT');
    let state=clone(before);
    const association=payload.associationId?localState.associations.find(x=>x.id===payload.associationId&&x.localOrigin===payload.origin):null;
    if(action==='open'&&association)check(payload.connectionId===association.connectionId,'E_SERVICE_BINDING');
    const connectionId=association?.connectionId??payload.connectionId;
    const c=localState.connections.find(x=>x.id===connectionId);check(c,'E_SERVICE_NOT_FOUND');
    check(c.mode==='local','E_SERVICE_UNSUPPORTED');check(c.ownerCurrent===true,'E_SERVICE_DISCONNECTED');
    let r=state.sessions.find(x=>x.connectionId===c.id);
    let opened=false;
    const guard=async()=>{await assertCurrent({allowInactiveDocument:action==='open'&&opened});const now=native();check(now.client===client&&now.providers.some(p=>same(p,r.provider)),'E_SERVICE_SESSION_EXPIRED');check(same(identity,r.owner)&&r.connectionEpoch===c.epoch,'E_SERVICE_SESSION_EXPIRED');};
    if(action==='connect'){
      check(!r||same(r.owner,identity)&&recoverable(r),'E_SERVICE_SESSION_EXISTS');const provider=n.providers.find(p=>p.serviceId===payload.serviceId&&p.providerEpoch===payload.providerEpoch);check(provider,'E_SERVICE_UNSUPPORTED');
      check((r||state.sessions.length<16)&&(!r||r.retired.length<8),'E_SERVICE_LIMIT');
      const retired=r?[...r.retired,pick(r,retiredKeys)]:[];
      if(r)state.sessions.splice(state.sessions.indexOf(r),1);
      r={connectionId:c.id,connectionEpoch:c.epoch,owner:identity,runtimeId,provider,remoteConnectionId:'remote_'+crypto.randomUUID().replaceAll('-',''),deviceId:'',authEpoch:0,status:'UNCONNECTED',resources:[],policy:null,bindings:[],pending:null,ledger:[],retired};state.sessions.push(r);
    }else{
      check(r&&same(r.owner,identity)&&r.connectionEpoch===c.epoch&&(action==='operation'||action==='archive'||live(r,native())),'E_SERVICE_SESSION_EXPIRED');
      if(action!=='operation'&&action!=='archive')check(!r.pending,'E_OUTCOME_UNKNOWN');
      if(action!=='operation'&&action!=='archive')check(r.status==='CONNECTED','E_SERVICE_DISCONNECTED');
    }
    await guard();
    const commit=async()=>{state.revision++;await save(d,before,state,guard);before=clone(state);};
    if(action==='archive'){
      check(r.pending?.action==='open'&&r.pending.expected.tabAttempted&&r.pending.outcome==='OUTCOME_UNKNOWN'&&r.pending.operationId===payload.operationId,'E_SERVICE_PENDING');
      r.pending.archived=true;r.ledger.push(r.pending);r.pending=null;check(r.ledger.length<=128,'E_SERVICE_LIMIT');await commit();return facts(localState,identity,accounts,native(),state);
    }
    let wire={connectionId:r.remoteConnectionId},expected={};
    const ownBinding=()=>{check(association,'E_SERVICE_NOT_FOUND');const b=r.bindings.find(x=>x.associationId===association.id)?.value;check(b&&!b.revoked,'E_SERVICE_BINDING');return b;};
    const currentAccount=()=>{check(association&&association.connectionEpoch===c.epoch&&association.providerKey==='codex','E_SERVICE_BINDING');const a=accounts.find(x=>x.alias===association.localAlias&&x.origin===payload.origin);check(a&&a.version===association.accountVersion,'E_VAULT_CONFLICT');return a;};
    if(action==='bind'){
      const a=currentAccount();check(ref(localRef)&&localRef.origin===payload.origin&&localRef.alias===a.alias&&localRef.version===a.version,'E_SERVICE_INPUT');
      check(r.resources.some(x=>x.remoteAccountId===association.remoteAccountId&&x.providerKey==='codex'),'E_SERVICE_RESOURCE');check(!r.bindings.some(x=>x.associationId===association.id&&!x.value.revoked),'E_SERVICE_BINDING');
      expected={associationId:association.id,remoteAccountId:association.remoteAccountId,localRef};Object.assign(wire,{remoteAccountId:expected.remoteAccountId,localRef});
    }
    if(action==='unbind'){const b=ownBinding();expected={associationId:association.id,bindingId:b.bindingId,expectedRevision:b.revision,authEpoch:r.authEpoch};Object.assign(wire,{bindingId:b.bindingId,expectedRevision:b.revision,authEpoch:r.authEpoch});}
    if(action==='accept'){
      check(scope(payload.scope)&&r.policy?.desired&&r.policy.authEpoch===r.authEpoch&&payload.desiredRevision===r.policy.desired.desiredRevision&&payload.desiredHash===r.policy.desired.desiredHash&&payload.scope.bindingIds.every(x=>r.policy.desired.scope.bindingIds.includes(x))&&payload.scope.dataCategories.every(x=>r.policy.desired.scope.dataCategories.includes(x))&&payload.scope.retentionDays<=r.policy.desired.scope.retentionDays,'E_SERVICE_POLICY');
      const owned=r.bindings.filter(x=>!x.value.revoked).map(x=>x.value.bindingId).sort();check(payload.scope.bindingIds.every(x=>owned.includes(x)),'E_SERVICE_POLICY');
      expected={authEpoch:r.authEpoch,desiredRevision:payload.desiredRevision,desiredHash:payload.desiredHash,scope:payload.scope};Object.assign(wire,expected);
    }
    if(action==='open'){
      check(r.provider.capabilities.includes('management:resource-open'),'E_SERVICE_UNSUPPORTED');expected={associationId:'',remoteAccountId:'',bindingId:'',tabAttempted:false};
      if(payload.associationId!==''){currentAccount();const b=ownBinding();check(b.remoteAccountId===association.remoteAccountId&&b.localAccount.version===association.accountVersion,'E_SERVICE_BINDING');expected={associationId:association.id,remoteAccountId:b.remoteAccountId,bindingId:b.bindingId,tabAttempted:false};Object.assign(wire,{remoteAccountId:b.remoteAccountId,bindingId:b.bindingId});}
    }
    if(action==='disconnect')wire.authEpoch=r.authEpoch;
    if(action==='operation'){check(r.pending&&r.pending.action!=='open','E_SERVICE_PENDING');wire.operationId=r.pending.operationId;}
    const write=!reads.has(action);let intent;
    if(write){check(r.ledger.length<128,'E_SERVICE_LIMIT');intent={operationId:'op_'+crypto.randomUUID().replaceAll('-',''),action,outcome:'PENDING',expected,archived:false};r.pending=intent;
      if(action!=='open')wire.operationId=intent.operationId;
      if(action==='connect')wire.label='Cookie Editor';
      await commit();if(action==='connect')leases.set(r.connectionId,{client,remoteConnectionId:r.remoteConnectionId});
    }
    let dispatched=false;
    try{
      await guard();dispatched=true;
      const result=await client.request({serviceId:r.provider.serviceId,providerEpoch:r.provider.providerEpoch,owner:clone(identity),action,payload:clone(wire)});await guard();
      if(action==='accounts'){
        check(Array.isArray(result.accounts)&&result.accounts.length<=64,'E_SERVICE_RESULT');r.resources=result.accounts.map(x=>pick(x,['remoteAccountId','providerKey','verificationState']));
      }else if(action==='policy'){
        const v=pick(result,['serviceInstanceId','deviceId','authEpoch','status','desired','acceptance','paused']);check(policyValid(v)&&v.serviceInstanceId===r.provider.serviceInstanceId&&v.deviceId===r.deviceId&&v.authEpoch===r.authEpoch,'E_SERVICE_RESULT');r.policy=v;
      }else if(action==='operation'){
        check(result.operationId===r.pending.operationId&&result.status==='CONFIRMED','E_SERVICE_RESULT');apply(r,r.pending,result.result);
        if(!positive(result.currentAuthEpoch)||typeof result.deviceRevoked!=='boolean'||result.currentAuthEpoch!==r.authEpoch||result.deviceRevoked&&r.status!=='DISCONNECTED')leases.delete(c.id);
        r.pending.outcome='CONFIRMED';r.ledger.push(r.pending);r.pending=null;
      }else if(action==='open'){
        check(typeof result.url==='string'&&result.url.length<=4096,'E_SERVICE_RESULT');const u=new URL(result.url),e=intent.expected;
        const target=e.associationId?'/opendesk/admin/accounts/'+e.remoteAccountId:'/opendesk/admin/sync?device='+r.deviceId;
        check(u.origin===r.provider.origin&&!u.username&&!u.password&&u.pathname+u.search===target&&/^#open=[a-f0-9]{64}$/.test(u.hash)&&result.url===r.provider.origin+target+u.hash,'E_SERVICE_RESULT');
        intent.expected.tabAttempted=true;await commit();
        await guard();await api.tabs.create({url:result.url});opened=true;await guard();
      }else apply(r,intent,result);
      if(write){intent.outcome='CONFIRMED';r.ledger.push(intent);r.pending=null;}
      await commit();const v=facts(localState,identity,accounts,native(),state);if(action==='open')v.opened=true;return v;
    }catch(error){
      if(write){
        const known=!dispatched?'NOT_DISPATCHED':['NOT_DISPATCHED','FAILED_CONFIRMED'].includes(error?.outcome)?error.outcome:null;
        // The confirmation transaction may have committed before its readback
        // failed. CAS against either exact snapshot, restoring UNKNOWN rather
        // than leaving a durable success after an unverified write/check.
        const candidate=clone(state);state=clone(before);r=state.sessions.find(x=>x.connectionId===c.id);
        if(r?.pending){r.pending.outcome=known??'OUTCOME_UNKNOWN';if(known){r.ledger.push(r.pending);r.pending=null;}
          try{await d.transaction(['frameworkKV'],'readwrite',async tx=>{
            const current=validate(stored(await tx.get('frameworkKV',COOKIE_SERVICE_SESSION_KEY)));
            check(same(current,before)||same(current,candidate),'E_SERVICE_CONFLICT');
            state.revision=current.revision+1;validate(state);await tx.put('frameworkKV',clone(state),COOKIE_SERVICE_SESSION_KEY);
          });}catch{leases.delete(c.id);/* never revive an unverified runtime */}}
        if(known)throw fail(known==='NOT_DISPATCHED'?'E_SERVICE_NOT_DISPATCHED':'E_SERVICE_FAILED');throw fail('E_OUTCOME_UNKNOWN');
      }
      leases.delete(c.id);
      throw fail(action==='operation'?'E_OUTCOME_UNKNOWN':error?.code==='E_SERVICE_SESSION_EXPIRED'?error.code:'E_SERVICE_READ');
    }
  }
  async function guardLocalChange({operation,payload,localState,identity}){
    const d=await db(),state=await read(d);
    if(!['serviceDisconnect','serviceRemoveAssociation','serviceRemove'].includes(operation))return;
    const association=localState.associations.find(x=>x.id===payload.associationId&&x.localOrigin===payload.origin);
    const connectionId=association?.connectionId??payload.connectionId;
    // Expired provider/installation does not prove remote revocation.
    const r=state.sessions.find(x=>x.connectionId===connectionId);if(!r)return;
    if(operation==='serviceRemoveAssociation')check(!r.pending&&!r.bindings.some(x=>x.associationId===association?.id&&!x.value.revoked),'E_SERVICE_REMOTE_ACTIVE');
    else check(!r.pending&&r.status!=='CONNECTED'&&!r.bindings.some(x=>!x.value.revoked),'E_SERVICE_REMOTE_ACTIVE');
  }
  async function clear(){// Called only from the parent's original cleanup queue.
    const d=await db();await d.transaction(['frameworkKV'],'readwrite',tx=>tx.delete('frameworkKV',COOKIE_SERVICE_SESSION_KEY));
    check((await read(d)).sessions.length===0,'E_OUTCOME_UNKNOWN');leases.clear();
  }
  const safe=fn=>async(...args)=>{try{return await fn(...args);}catch(e){
    const codes=['E_SERVICE_INPUT','E_SERVICE_STORE','E_ACCOUNT_STORAGE_UNAVAILABLE','E_SERVICE_CONFLICT','E_OUTCOME_UNKNOWN','E_SERVICE_SESSION_EXPIRED','E_SERVICE_SESSION_EXISTS','E_SERVICE_UNSUPPORTED','E_SERVICE_NOT_FOUND','E_SERVICE_DISCONNECTED','E_SERVICE_LIMIT','E_SERVICE_PENDING','E_SERVICE_BINDING','E_VAULT_CONFLICT','E_SERVICE_RESOURCE','E_SERVICE_POLICY','E_SERVICE_NOT_DISPATCHED','E_SERVICE_FAILED','E_SERVICE_READ','E_SERVICE_REMOTE_ACTIVE'];
    throw fail(codes.includes(e?.code)?e.code:'E_SERVICE_SESSION_EXPIRED');}};
  return Object.freeze({present:safe(present),dispatch:safe(dispatch),guardLocalChange:safe(guardLocalChange),clear:safe(clear)});
}
