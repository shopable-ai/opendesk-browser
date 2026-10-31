// Application business state. Runs inside the installed tool sandbox; the only
// privileged operations below are existing, independently authorized SDK calls.
const KEY='cookie-http-services.v1';
const fail=code=>Object.assign(Error(code),{code});
const check=(value,code='E_SERVICE_INPUT')=>{if(!value)throw fail(code);};
const copy=value=>structuredClone(value);
const id=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(value);
const positive=value=>Number.isSafeInteger(value)&&value>0;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const encode=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const same=(a,b)=>encode(a)===encode(b);
const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).byteLength;
const uuid=()=>crypto.randomUUID().replaceAll('-','');
export function cookieServiceOrigin(value){
  let url;try{url=new URL(value);}catch{throw fail('E_SERVICE_INPUT');}
  check(typeof value==='string'&&value.length<=320&&url.origin===value&&!url.username&&!url.password);
  const local=url.hostname==='localhost'||url.hostname.endsWith('.localhost')||url.hostname==='127.0.0.1'||url.hostname==='[::1]';
  check(url.protocol==='https:'||url.protocol==='http:'&&local);
  return value;
}
const safeResource=row=>object(row)&&id(row.remoteAccountId)&&row.providerKey==='codex'&&row.verificationState==='UNVERIFIED';
const safeBinding=row=>object(row)&&id(row.bindingId)&&id(row.remoteAccountId)&&row.verificationState==='UNVERIFIED'&&
  row.providerKey==='codex'&&row.purpose==='usage'&&typeof row.revoked==='boolean'&&positive(row.revision)&&positive(row.authEpoch)&&
  object(row.localAccount)&&id(row.localAccount.alias)&&Number.isSafeInteger(row.localAccount.version);
const readActions=new Set(['serviceStatus','serviceResources','serviceUsage','serviceReadPolicy','serviceReconcile']);
// Only this Host error proves the HTTP RPC was never submitted. Cancellation
// and permission loss can also happen after a remote write has committed.
const notSent=new Set(['E_NETWORK_NOT_SUBMITTED']);
export function createCookieHttpServices({request,version,context,clock=Date.now}={}){
  check(typeof request==='function'&&typeof context==='function'&&typeof version==='string');
  let busy=false;const transient=new Map();
  const durable=state=>({...state,connections:state.connections.map(c=>({...c,resources:[],resourceCursor:null,usageCache:{},policy:null}))});
  const remember=c=>transient.set(c.id,{session:c.session,resources:copy(c.resources),resourceCursor:c.resourceCursor??null,usageCache:copy(c.usageCache),policy:copy(c.policy)});
  const archive=(c,p,outcome)=>c.history.push({operationId:p.operationId,action:p.action,outcome});
  async function read(){
    const raw=(await request('browser.storage.local.get',{keys:[KEY]}))?.items?.[KEY];
    if(raw===undefined)return {format:1,revision:0,connections:[]};
    check(object(raw)&&raw.format===1&&Number.isSafeInteger(raw.revision)&&raw.revision>=0&&Array.isArray(raw.connections)&&raw.connections.length<=8,'E_SERVICE_STORE');
    check(bytes(raw)<=8192,'E_SERVICE_STORE');
    const seen=new Set();
    for(const c of raw.connections){
      check(object(c)&&id(c.id)&&!seen.has(c.id)&&typeof c.label==='string'&&typeof c.version==='string'&&
        Array.isArray(c.resources)&&c.resources.length<=64&&c.resources.every(safeResource)&&Array.isArray(c.bindings)&&c.bindings.length<=128&&c.bindings.every(safeBinding)&&
        ['UNCONNECTED','CONNECTED','DISCONNECTED','RETIRED'].includes(c.status)&&Array.isArray(c.history)&&c.history.length<=64&&
        (c.pending===null||object(c.pending)&&id(c.pending.operationId)&&typeof c.pending.action==='string')&&
        (c.session===null||typeof c.session==='string'&&/^[a-f0-9]{64}$/.test(c.session)),'E_SERVICE_STORE');
      cookieServiceOrigin(c.origin);seen.add(c.id);
      const cached=transient.get(c.id);
      if(cached?.session===c.session)Object.assign(c,copy(cached));
    }
    return raw;
  }
  function view(state){return {revision:state.revision,connections:state.connections.map(c=>{
    const {session,version:ownerVersion,history,archivedOperations,...metadata}=copy(c);
    const status=c.status==='RETIRED'?'RETIRED':ownerVersion!==version?'INVALIDATED':c.pending?'OUTCOME_UNKNOWN':c.receiptOnly?'RECEIPTS_ONLY':
      c.status==='CONNECTED'&&clock()>=c.expiresAt?'SESSION_EXPIRED':c.status;
    return {...metadata,status,canRetire:c.status!=='RETIRED'&&(ownerVersion!==version||c.receiptOnly||c.pending?.action==='connect'||c.status==='CONNECTED'&&clock()>=c.expiresAt),
      pending:c.pending?{operationId:c.pending.operationId,action:c.pending.action,canArchive:c.pending.action==='open'}:null,
      history:history.map(r=>({operationId:r.operationId,action:r.action,outcome:r.outcome}))};
  })};}
  async function save(before,next){
    check(same(await read(),before),'E_SERVICE_CONFLICT');next.revision++;
    const stored=durable(next);check(bytes(stored)<=8192,'E_LIMIT');
    try{
      await request('browser.storage.local.set',{items:{[KEY]:stored}});
      next.connections.forEach(remember);
      check(same(await read(),next),'E_OUTCOME_UNKNOWN');
    }catch{throw fail('E_OUTCOME_UNKNOWN');}
    return copy(next);
  }
  async function wire(c,method,path,body){
    const response=await request('browser.network.request',{method:'POST',url:c.origin+'/opendesk/client/request',
      data:{session:c.session,method,path,...(body===undefined?{}:{body})},config:{responseType:'json',timeout:12000}});
    check(response?.status===200&&object(response.data),'E_SERVICE_RESPONSE');return response.data;
  }
  function apply(c,p,result){
    check(object(result),'E_SERVICE_RESPONSE');
    if(p.action==='connect'){
      check(/^[a-f0-9]{64}$/.test(result.session)&&positive(result.expiresAt)&&id(result.serviceInstanceId)&&
        id(result.device?.deviceId)&&positive(result.device.authEpoch)&&result.device.serviceInstanceId===result.serviceInstanceId,'E_SERVICE_RESPONSE');
      c.session=result.session;c.expiresAt=result.expiresAt;c.serviceInstanceId=result.serviceInstanceId;c.deviceId=result.device.deviceId;
      c.authEpoch=result.device.authEpoch;c.status='CONNECTED';c.receiptOnly=false;c.resources=[];c.resourceCursor=null;c.usageCache={};c.policy=null;
    }else if(p.action==='bind'){
      check(safeBinding(result)&&result.remoteAccountId===p.body.remoteAccountId&&same(result.localAccount,p.body.localAccount)&&result.deviceId===c.deviceId&&!result.revoked,'E_SERVICE_RESPONSE');
      c.bindings.push(result);
    }else if(p.action==='unbind'||p.action==='disconnect'){
      check(result.status==='REVOKED'&&positive(result.authEpoch)&&result.authEpoch>c.authEpoch,'E_SERVICE_RESPONSE');
      c.authEpoch=result.authEpoch;c.policy=null;
      if(p.action==='disconnect'){c.status='DISCONNECTED';c.bindings.forEach(b=>{b.revoked=true;});}
      else {const b=c.bindings.find(b=>b.bindingId===p.bindingId);check(b,'E_SERVICE_RESPONSE');b.revoked=true;b.revision++;}
    }else if(p.action==='accept'){
      check(result.serviceInstanceId===c.serviceInstanceId&&result.deviceId===c.deviceId&&result.authEpoch===c.authEpoch&&
        result.acceptance?.desiredRevision===p.body.desiredRevision&&result.acceptance?.desiredHash===p.body.desiredHash&&same(result.acceptance?.scope,p.body.scope),'E_SERVICE_RESPONSE');
      c.policy=result;
    }
  }
  async function dispatch(action,payload={}){
    check(!busy,'E_SERVICE_CONFLICT');busy=true;
    try{
      let before=await read(),state=copy(before);
      const commit=async()=>{before=await save(before,state);};
      if(action==='serviceStatus')return view(state);
      const readOnly=readActions.has(action);
      if(!readOnly){check(payload.revision===state.revision,'E_SERVICE_CONFLICT');
        check(!state.connections.some(c=>c.pending)||['serviceArchiveOpen','serviceRetire'].includes(action),'E_OUTCOME_UNKNOWN');}
      if(action==='serviceSave'){
        check(typeof payload.label==='string'&&payload.label.trim()===payload.label&&payload.label.length>0&&payload.label.length<=64&&!/[\x00-\x1f\x7f]/.test(payload.label));
        cookieServiceOrigin(payload.serviceOrigin);
        check(state.connections.length<8,'E_SERVICE_LIMIT');
        check(!state.connections.some(c=>c.origin===payload.serviceOrigin&&!['DISCONNECTED','RETIRED'].includes(c.status)),'E_SERVICE_EXISTS');
        state.connections.push({id:'http_'+uuid(),label:payload.label,origin:payload.serviceOrigin,version,status:'UNCONNECTED',session:null,
          expiresAt:0,serviceInstanceId:'',deviceId:'',authEpoch:0,resources:[],resourceCursor:null,usageCache:{},bindings:[],policy:null,pending:null,history:[]});
        await commit();return view(state);
      }
      const c=state.connections.find(c=>c.id===payload.connectionId);check(c,'E_SERVICE_NOT_FOUND');
      if(action==='serviceRetire'){
        check(c.status!=='RETIRED'&&(c.version!==version||c.receiptOnly||c.pending?.action==='connect'||c.status==='CONNECTED'&&clock()>=c.expiresAt),'E_SERVICE_PENDING');
        // Retire locally without claiming a remote revocation or replaying an
        // unknown request. Keep its original private payload for later audit.
        if(c.pending){c.archivedOperations=[...(c.archivedOperations??[]),copy(c.pending)];archive(c,c.pending,'ARCHIVED_UNKNOWN');c.pending=null;}
        c.status='RETIRED';await commit();return view(state);
      }
      check(c.version===version,'E_TOOL_CHANGED');
      if(action==='serviceArchiveOpen'){
        check(c.pending?.action==='open','E_SERVICE_PENDING');
        archive(c,c.pending,'ARCHIVED_UNKNOWN');c.pending=null;await commit();return view(state);
      }
      if(action==='serviceReconcile'&&c.pending?.action==='connect'){
        const p=c.pending;
        const response=await request('browser.network.request',{method:'POST',url:c.origin+'/opendesk/client/pair-result',
          data:{receiptKey:p.receiptKey,connectionId:c.id,operationId:p.operationId},config:{responseType:'json',timeout:12000}});
        const receipt=response?.data;
        check(response?.status===200&&receipt?.operationId===p.operationId&&['CONFIRMED','REJECTED'].includes(receipt.status),'E_SERVICE_RESPONSE');
        if(receipt.status==='CONFIRMED')apply(c,p,receipt.result);
        else check(receipt.error==='PAIRING_INVALID','E_SERVICE_RESPONSE');
        archive(c,p,receipt.status);c.pending=null;await commit();return view(state);
      }
      if(action==='serviceConnect'){
        check(c.status==='UNCONNECTED'||c.status==='DISCONNECTED','E_SERVICE_SESSION_EXISTS');
        check(typeof payload.code==='string'&&/^[a-f0-9]{64}$/.test(payload.code));
      }else if(action==='serviceDisconnect'&&c.status==='UNCONNECTED'){
        c.status='DISCONNECTED';await commit();return view(state);
      }else{
        check(c.session&&(c.status==='CONNECTED'||action==='serviceReconcile')&&clock()<c.expiresAt,'E_SERVICE_SESSION_EXPIRED');
        check(!c.receiptOnly||action==='serviceReconcile','E_SERVICE_RECEIPTS_ONLY');
        check(!c.pending||action==='serviceReconcile','E_OUTCOME_UNKNOWN');
      }
      if(action==='serviceResources'){
        const cursor=payload.cursor??0;
        check(Number.isSafeInteger(cursor)&&cursor>=0&&cursor<64&&(!cursor||cursor===c.resourceCursor),'E_SERVICE_INPUT');
        const result=await wire(c,'GET',cursor?'/opendesk/v1/accounts-page/'+cursor:'/opendesk/v1/accounts');
        check(Array.isArray(result.accounts)&&result.accounts.length<=16&&result.accounts.every(safeResource)&&
          (result.nextCursor===null||Number.isSafeInteger(result.nextCursor)&&result.nextCursor>cursor&&result.nextCursor<64),'E_SERVICE_RESPONSE');
        c.resources=cursor?[...c.resources,...result.accounts]:result.accounts;c.resourceCursor=result.nextCursor;
        check(c.resources.length<=64&&new Set(c.resources.map(r=>r.remoteAccountId)).size===c.resources.length,'E_SERVICE_RESPONSE');
        await commit();return view(state);
      }
      if(action==='serviceUsage'){
        check(c.resources.some(r=>r.remoteAccountId===payload.remoteAccountId),'E_SERVICE_RESOURCE');
        const result=await wire(c,'GET','/opendesk/v1/accounts/'+payload.remoteAccountId+'/usage');
        check(result.remoteAccountId===payload.remoteAccountId&&result.providerKey==='codex','E_SERVICE_RESPONSE');
        // Server cache is sanitized; retain only quota display fields, never its
        // entire profile or arbitrary provider fields in the installed app.
        c.usageCache[payload.remoteAccountId]={status:result.status,observedAt:result.observedAt,sourceMode:result.sourceMode,
          windows:copy(result.account?.windows??[])};await commit();return view(state);
      }
      if(action==='serviceReadPolicy'){
        const result=await wire(c,'GET','/opendesk/v1/sync-policy');
        check(result.deviceId===c.deviceId&&result.serviceInstanceId===c.serviceInstanceId&&positive(result.authEpoch),'E_SERVICE_RESPONSE');
        c.policy=result;c.authEpoch=result.authEpoch;await commit();return view(state);
      }
      if(action==='serviceReconcile'){
        check(c.pending&&c.pending.action!=='open'&&c.pending.action!=='connect','E_SERVICE_PENDING');
        const receipt=await wire(c,'GET','/opendesk/v1/operations/'+c.pending.operationId);
        check(receipt.operationId===c.pending.operationId&&receipt.status==='CONFIRMED','E_SERVICE_RESPONSE');
        apply(c,c.pending,receipt.result);archive(c,c.pending,'CONFIRMED');c.pending=null;
        await commit();return view(state);
      }
      check(c.history.length<64,'E_SERVICE_LIMIT');
      const p={operationId:'op_'+uuid(),action:'',method:'POST',path:'',body:null};
      if(action==='serviceConnect'){p.action='connect';p.receiptKey=uuid()+uuid();}
      else if(action==='serviceBind'){
        const current=await context(),account=current.accounts.find(a=>a.alias===payload.alias&&a.origin===current.origin);
        check(account&&account.version===payload.accountVersion,'E_VAULT_CONFLICT');
        check(c.resources.some(r=>r.remoteAccountId===payload.remoteAccountId),'E_SERVICE_RESOURCE');
        check(!c.bindings.some(b=>!b.revoked&&b.remoteAccountId===payload.remoteAccountId),'E_SERVICE_EXISTS');
        check(id(current.storeId)&&current.partitionKey!==undefined,'E_COOKIE_STORE');
        p.action='bind';p.path='/opendesk/v1/bindings';p.body={operationId:p.operationId,purpose:'usage',providerKey:'codex',remoteAccountId:payload.remoteAccountId,
          expectedRevision:0,localAccount:{origin:current.origin,alias:account.alias,version:account.version,storeId:current.storeId,partitionKey:current.partitionKey}};
      }else if(action==='serviceUnbind'){
        const b=c.bindings.find(b=>b.bindingId===payload.bindingId&&!b.revoked);check(b,'E_SERVICE_BINDING');
        p.action='unbind';p.bindingId=b.bindingId;p.method='DELETE';p.path='/opendesk/v1/bindings/'+b.bindingId;
        p.body={operationId:p.operationId,authEpoch:c.authEpoch,expectedRevision:b.revision};
      }else if(action==='serviceDisconnect'){
        p.action='disconnect';p.method='DELETE';p.path='/opendesk/v1/devices/'+c.deviceId;p.body={operationId:p.operationId,authEpoch:c.authEpoch};
      }else if(action==='serviceAcceptPolicy'){
        check(c.policy?.desired&&payload.desiredRevision===c.policy.desired.desiredRevision&&payload.desiredHash===c.policy.desired.desiredHash,'E_SERVICE_POLICY');
        const s=payload.scope,d=c.policy.desired.scope;
        check(object(s)&&s.trigger==='MANUAL'&&Array.isArray(s.bindingIds)&&s.bindingIds.length>0&&new Set(s.bindingIds).size===s.bindingIds.length&&
          s.bindingIds.every(id=>d.bindingIds.includes(id)&&c.bindings.some(b=>b.bindingId===id&&!b.revoked))&&
          Array.isArray(s.dataCategories)&&s.dataCategories.length>0&&new Set(s.dataCategories).size===s.dataCategories.length&&s.dataCategories.every(v=>['ACCOUNT_METADATA','USAGE_SUMMARY'].includes(v)&&d.dataCategories.includes(v))&&
          positive(s.retentionDays)&&s.retentionDays<=Math.min(30,d.retentionDays),'E_SERVICE_POLICY');
        p.action='accept';p.path='/opendesk/v1/policy-acceptances';p.body={operationId:p.operationId,action:'accept',authEpoch:c.authEpoch,desiredRevision:payload.desiredRevision,desiredHash:payload.desiredHash,scope:s};
      }else if(action==='serviceOpen'){
        p.action='open';p.path='/opendesk/v1/management-open';p.body={};p.tabAttempted=false;
        if(payload.bindingId){const b=c.bindings.find(b=>b.bindingId===payload.bindingId&&!b.revoked);check(b,'E_SERVICE_BINDING');
          const current=await context(),a=current.accounts.find(a=>a.alias===b.localAccount.alias&&a.origin===b.localAccount.origin);
          check(current.origin===b.localAccount.origin&&a?.version===b.localAccount.version,'E_VAULT_CONFLICT');
          p.body={bindingId:b.bindingId,remoteAccountId:b.remoteAccountId};}
      }else throw fail('E_SERVICE_INPUT');
      c.pending=p;
      // Reserve room for the confirmed binding/credential before sending any
      // remote write. Existing SDK storage limits remain unchanged.
      check(bytes(durable(state))<=7000,'E_LIMIT');await commit();
      try{
        let result;
        if(p.action==='connect'){
          const response=await request('browser.network.request',{method:'POST',url:c.origin+'/opendesk/client/pair',
            data:{code:payload.code,connectionId:c.id,label:c.label,operationId:p.operationId,receiptKey:p.receiptKey},config:{responseType:'json',timeout:12000}});
          check(response?.status===200,'E_SERVICE_RESPONSE');result=response.data;
        }else result=await wire(c,p.method,p.path,p.body);
        if(p.action==='open'){
          let url;try{url=new URL(result.url);}catch{throw fail('E_SERVICE_RESPONSE');}
          check(url.origin===c.origin&&!url.username&&!url.password&&result.expiresAt>clock()&&
            /^\/opendesk\/admin\/(accounts\/[A-Za-z0-9_-]+|sync)$/.test(url.pathname)&&/^#open=[a-f0-9]{64}$/.test(url.hash)&&
            (p.body.bindingId?url.pathname==='/opendesk/admin/accounts/'+p.body.remoteAccountId&&!url.search:
              url.pathname==='/opendesk/admin/sync'&&url.search==='?device='+c.deviceId),'E_SERVICE_RESPONSE');
          p.tabAttempted=true;await commit();
          await request('browser.tabs.create',{url:url.href});
        }else apply(c,p,result);
        archive(c,p,'CONFIRMED');c.pending=null;await commit();
      }catch(error){
        if(notSent.has(error?.code)&&(!p.tabAttempted||error.code==='E_CANCELLED')){
          archive(c,p,'NOT_DISPATCHED');c.pending=null;await commit();throw error;
        }
        if(p.action==='unbind'||p.action==='disconnect')c.receiptOnly=true;
        // The request may have committed. Persist the exact original operation;
        // only read its receipt later. Never retry a mutation or re-open a tab.
        await commit();
      }
      return view(state);
    }finally{busy=false;}
  }
  return Object.freeze({dispatch});
}
