// Team metadata and credential references only. Never receives or applies Cookies.
import {createHash} from 'node:crypto';
import {bindingError as error,exact} from './service-binding-store.mjs';
const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const same=(a,b)=>canonical(a)===canonical(b);
const hash=v=>createHash('sha256').update(canonical(v)).digest('hex');
const shape=(v,keys)=>{exact(v,keys);if(Object.keys(v).length!==keys.length)throw error('BAD_INPUT');};
const id=v=>{if(typeof v!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(v))throw error('BAD_INPUT');};
const num=(v,min=0)=>{if(!Number.isSafeInteger(v)||v<min)throw error('BAD_INPUT');};
const digest=v=>{if(typeof v!=='string'||!/^[a-f0-9]{64}$/.test(v))throw error('BAD_INPUT');};
function origin(v){let u;try{u=new URL(v);}catch{throw error('BAD_INPUT');}if(typeof v!=='string'||v.length>2048||!['https:','http:'].includes(u.protocol)||u.origin!==v)throw error('BAD_INPUT');}
function invite(v){let u;try{u=new URL(v);}catch{throw error('BAD_INPUT');}if(typeof v!=='string'||v.length>2048||u.protocol!=='https:'||u.username||u.password||u.search||u.hash||!/^\/i\/[A-Za-z0-9_-]{22,80}$/.test(u.pathname)||v!==u.origin+u.pathname)throw error('BAD_INPUT');return hash(v);}
function fingerprint(v){if(v!==null)digest(v);}
function metadata(a){shape(a,['tenantId','accountId','version','displayName','origin','source','expiresAt']);id(a.tenantId);id(a.accountId);num(a.version,1);origin(a.origin);num(a.expiresAt,1);
  if(a.source!=='ENCRYPTED_SESSION'||typeof a.displayName!=='string'||!a.displayName.trim()||a.displayName.length>80||/[\x00-\x1f\x7f]/.test(a.displayName))throw error('BAD_INPUT');}
function member(m){shape(m,['tenantId','userId','deviceId','authEpoch']);['tenantId','userId','deviceId'].forEach(k=>id(m[k]));num(m.authEpoch,1);}
function target(t){shape(t,['origin','documentId','tabId','url','storeId','partitionKey','packageHash','installEpoch']);origin(t.origin);id(t.documentId);num(t.tabId);id(t.storeId);digest(t.packageHash);
  // Installation epochs are opaque strings in the existing Account contract.
  if(typeof t.installEpoch!=='string'||!t.installEpoch.length||t.installEpoch.length>160||t.installEpoch.trim()!==t.installEpoch||/[\x00-\x1f\x7f]/.test(t.installEpoch))throw error('BAD_INPUT');
  let u;try{u=new URL(t.url);}catch{throw error('BAD_INPUT');}if(typeof t.url!=='string'||t.url.length>4096||u.origin!==t.origin||u.username||u.password)throw error('BAD_INPUT');
  if(t.partitionKey!==null){shape(t.partitionKey,['topLevelSite','hasCrossSiteAncestor']);origin(t.partitionKey.topLevelSite);if(typeof t.partitionKey.hasCrossSiteAncestor!=='boolean')throw error('BAD_INPUT');}}
const assignmentFields=['tenantId','userId','deviceId','authEpoch','accountId','accountVersion','assignmentRevision','inviteUrl','senderFingerprint','revoked'];
function assignment(a,credentials=true){shape(a,assignmentFields.filter(k=>credentials||!['inviteUrl','senderFingerprint'].includes(k)));member(Object.fromEntries(['tenantId','userId','deviceId','authEpoch'].map(k=>[k,a[k]])));id(a.accountId);num(a.accountVersion,1);num(a.assignmentRevision,1);if(typeof a.revoked!=='boolean')throw error('BAD_INPUT');if(credentials){invite(a.inviteUrl);fingerprint(a.senderFingerprint);}}
const publicAssignment=a=>Object.fromEntries(assignmentFields.filter(k=>!['inviteUrl','senderFingerprint'].includes(k)).map(k=>[k,a[k]]));
const owner=d=>[d.tenantId,d.userId,d.deviceId];
const receiptFields=['operationId','kind','owner','digest','createdAt','result'];
export function validateTeamState(s){try{
  shape(s,['schemaVersion','accounts','assignments','operations','invitations']);if(s.schemaVersion!==1)throw Error();
  for(const [key,max] of [['accounts',256],['assignments',2048],['operations',4096],['invitations',4096]])if(!Array.isArray(s[key])||s[key].length>max)throw Error();
  const unique=(rows,key)=>{const values=rows.map(key);if(new Set(values).size!==values.length)throw Error();};
  s.accounts.forEach(metadata);unique(s.accounts,a=>canonical([a.tenantId,a.accountId]));
  for(const a of s.assignments){assignment(a);if(!s.accounts.some(x=>x.tenantId===a.tenantId&&x.accountId===a.accountId))throw Error();}
  unique(s.assignments,a=>canonical([a.tenantId,a.accountId,a.deviceId]));
  for(const i of s.invitations){shape(i,['digest','tenantId','accountId','deviceId']);digest(i.digest);['tenantId','accountId','deviceId'].forEach(k=>id(i[k]));}unique(s.invitations,i=>i.digest);
  for(const a of s.assignments)if(!s.invitations.some(i=>i.digest===invite(a.inviteUrl)&&same([i.tenantId,i.accountId,i.deviceId],[a.tenantId,a.accountId,a.deviceId])))throw Error();
  for(const o of s.operations){shape(o,receiptFields);id(o.operationId);digest(o.digest);num(o.createdAt);if(!['publish','assign','revoke','claim','authorize-use'].includes(o.kind)||!Array.isArray(o.owner)||![1,4].includes(o.owner.length))throw Error();o.owner.forEach(id);
    const r=o.result;if(!r||r.operationId!==o.operationId||!['CONFIRMED','CLAIMED','AUTHORIZED'].includes(r.status))throw Error();
    if(r.status!==({claim:'CLAIMED','authorize-use':'AUTHORIZED'}[o.kind]??'CONFIRMED'))throw Error();
    if(o.kind==='publish'){shape(r,['operationId','status','account']);metadata(r.account);}
    else if(['assign','revoke'].includes(o.kind)){shape(r,['operationId','status','assignment']);assignment(r.assignment,false);}
    else {shape(r,['operationId','status','account','member','accountVersion','assignmentRevision',...(o.kind==='claim'?['inviteUrl','senderFingerprint']:['target'])]);metadata(r.account);member(r.member);num(r.accountVersion,1);num(r.assignmentRevision,1);if(o.kind==='claim'){invite(r.inviteUrl);fingerprint(r.senderFingerprint);}else target(r.target);}
  }unique(s.operations,o=>canonical([o.owner,o.operationId]));return s;
}catch{throw error('STORE_SCHEMA',503);}}

export function createTeamAccountService({store,bindingStore,bindings,clock=Date.now}){
  const tenantId='local';
  const account=(s,aid,tenant=tenantId)=>{const a=s.accounts.find(a=>a.accountId===aid&&a.tenantId===tenant);if(!a)throw error('NOT_FOUND',404);return a;};
  const visible=a=>({...a,state:clock()>=a.expiresAt?'EXPIRED':'AVAILABLE'});
  async function device(c,allowRevoked=false){
    // Original self authenticates context; receipt lookup uses original operation
    // authorization to preserve audit access after revocation.
    if(!allowRevoked)await bindings.request(c,{method:'GET',path:'/opendesk/v1/self'});
    return deviceFromState(await bindingStore.read(),c,allowRevoked);
  }
  function deviceFromState(s,c,allowRevoked=false){
    const d=s.devices.find(d=>d.serviceInstanceId===bindings.serviceInstanceId&&['tenantId','userId','connectionId','installationId','grantFamilyId'].every(k=>d[k]===c[k]));
    if(!d||!same(d.resourceIds,c.resourceIds))throw error('DEVICE_REQUIRED',403);if(d.revoked&&!allowRevoked)throw error('DEVICE_REVOKED',403);return d;
  }
  const who=d=>Object.fromEntries(['tenantId','userId','deviceId','authEpoch'].map(k=>[k,d[k]]));
  function record(s,key,kind,b,run,resource=null){id(b.operationId);const digest=hash({kind,body:b,resource}),old=s.operations.find(o=>o.operationId===b.operationId);
    if(old){if(!same(old.owner,key)||old.digest!==digest)throw error('OPERATION_CONFLICT',409);return old.result;}
    if(s.operations.length>=4096)throw error('TEAM_CAPACITY',503);
    const result=run();s.operations.push({operationId:b.operationId,kind,owner:key,digest,createdAt:clock(),result:structuredClone(result)});return result;}
  function authorized(s,d,aid,b){const a=account(s,aid,d.tenantId),as=s.assignments.find(x=>x.accountId===aid&&same(owner(x),owner(d)));
    if(!as||as.revoked)throw error('ASSIGNMENT_REQUIRED',403);
    if(clock()>=a.expiresAt)throw error('ACCOUNT_EXPIRED',410);
    if(b.accountVersion!==a.version||as.accountVersion!==a.version)throw error('VERSION_CONFLICT',409);
    if(b.authEpoch!==d.authEpoch||as.authEpoch!==d.authEpoch)throw error('EPOCH_CONFLICT',409);
    if(b.assignmentRevision!==as.assignmentRevision)throw error('ASSIGNMENT_CONFLICT',409);return {a,as};}
  async function admin({method,path,body:b}){
    if(method==='GET'&&path==='/opendesk/admin/api/team-accounts'){const s=await store.read();const devices=(await bindingStore.read()).devices.filter(d=>d.tenantId===tenantId&&d.serviceInstanceId===bindings.serviceInstanceId&&!d.revoked).map(d=>({...who(d),label:d.label}));
      return {accounts:s.accounts.filter(a=>a.tenantId===tenantId).map(visible),assignments:s.assignments.filter(a=>a.tenantId===tenantId).map(publicAssignment),devices};}
    const op=/^\/opendesk\/admin\/api\/team-operations\/([A-Za-z0-9_-]+)$/.exec(path);
    if(method==='GET'&&op){const s=await store.read(),r=s.operations.find(o=>o.operationId===op[1]&&o.owner[0]===tenantId);if(!r)throw error('NOT_FOUND',404);return {operationId:r.operationId,status:'CONFIRMED',createdAt:r.createdAt,result:structuredClone(r.result)};}
    if(method!=='POST')throw error('NOT_FOUND',404);
    const kind=({'/opendesk/admin/api/team-accounts':'publish','/opendesk/admin/api/team-assignments':'assign','/opendesk/admin/api/team-revoke':'revoke'})[path];if(!kind)throw error('NOT_FOUND',404);
    shape(b,kind==='publish'?['operationId','accountId','expectedVersion','displayName','origin','expiresAt']:kind==='assign'?['operationId','accountId','accountVersion','deviceId','expectedRevision','inviteUrl','senderFingerprint']:['operationId','accountId','deviceId','expectedRevision']);id(b.operationId);id(b.accountId);
    let d;
    if(kind==='publish'){num(b.expectedVersion);metadata({tenantId,accountId:b.accountId,version:b.expectedVersion+1,displayName:b.displayName,origin:b.origin,expiresAt:b.expiresAt,source:'ENCRYPTED_SESSION'});}
    else {id(b.deviceId);num(b.expectedRevision);if(kind==='assign'){num(b.accountVersion,1);invite(b.inviteUrl);fingerprint(b.senderFingerprint);}d=(await bindingStore.read()).devices.find(d=>d.deviceId===b.deviceId&&d.tenantId===tenantId&&d.serviceInstanceId===bindings.serviceInstanceId&&!d.revoked);if(!d)throw error('NOT_FOUND',404);}
    return store.transact(s=>record(s,[tenantId],kind,b,()=>{
      if(kind==='publish'){const old=s.accounts.find(a=>a.tenantId===tenantId&&a.accountId===b.accountId);if((old?.version??0)!==b.expectedVersion)throw error('VERSION_CONFLICT',409);
        if(b.expiresAt<=clock())throw error('ACCOUNT_EXPIRED',410);if(!old&&s.accounts.length>=256)throw error('TEAM_CAPACITY',503);
        const a={tenantId,accountId:b.accountId,version:b.expectedVersion+1,displayName:b.displayName,origin:b.origin,source:'ENCRYPTED_SESSION',expiresAt:b.expiresAt};if(old)Object.assign(old,a);else s.accounts.push(a);return {operationId:b.operationId,status:'CONFIRMED',account:a};}
      const a=account(s,b.accountId),old=s.assignments.find(x=>x.tenantId===tenantId&&x.accountId===b.accountId&&x.deviceId===b.deviceId);
      if((old?.assignmentRevision??0)!==b.expectedRevision)throw error('ASSIGNMENT_CONFLICT',409);
      if(kind==='revoke'){if(!old)throw error('NOT_FOUND',404);old.revoked=true;old.assignmentRevision++;return {operationId:b.operationId,status:'CONFIRMED',assignment:publicAssignment(old)};}
      if(a.version!==b.accountVersion)throw error('VERSION_CONFLICT',409);if(clock()>=a.expiresAt)throw error('ACCOUNT_EXPIRED',410);
      const h=invite(b.inviteUrl),used=s.invitations.find(i=>i.digest===h);
      if(used&&!same([used.tenantId,used.accountId,used.deviceId],[tenantId,a.accountId,d.deviceId]))throw error('INVITATION_REUSED',409);
      if(!old&&s.assignments.length>=2048||!used&&s.invitations.length>=4096)throw error('TEAM_CAPACITY',503);
      if(!used)s.invitations.push({digest:h,tenantId,accountId:a.accountId,deviceId:d.deviceId});
      const as={...who(d),accountId:a.accountId,accountVersion:a.version,assignmentRevision:(old?.assignmentRevision??0)+1,inviteUrl:b.inviteUrl,senderFingerprint:b.senderFingerprint,revoked:false};if(old)Object.assign(old,as);else s.assignments.push(as);
      return {operationId:b.operationId,status:'CONFIRMED',assignment:publicAssignment(as)};
    }));
  }
  async function request(c,{method,path,body:b}){
    const op=/^\/opendesk\/v1\/team-operations\/([A-Za-z0-9_-]+)$/.exec(path),d=await device(c,method==='GET'&&!!op);
    if(method==='GET'&&op){const s=await store.read(),r=s.operations.find(o=>o.operationId===op[1]&&same(o.owner,[...owner(d),bindings.serviceInstanceId]));if(!r)throw error('NOT_FOUND',404);return {operationId:r.operationId,status:'CONFIRMED',createdAt:r.createdAt,result:structuredClone(r.result)};}
    if(method==='GET'&&path==='/opendesk/v1/team-accounts'){const s=await store.read();return {accounts:s.assignments.filter(as=>same(owner(as),owner(d))&&!as.revoked&&as.authEpoch===d.authEpoch).flatMap(as=>{const a=account(s,as.accountId,d.tenantId);return a.version===as.accountVersion?[{...visible(a),assignmentRevision:as.assignmentRevision}]:[];}),member:who(d)};}
    const m=/^\/opendesk\/v1\/team-accounts\/([A-Za-z0-9_-]+)\/(claim|authorize-use)$/.exec(path);if(method!=='POST'||!m)throw error('NOT_FOUND',404);
    shape(b,['operationId','accountVersion','assignmentRevision','authEpoch',...(m[2]==='authorize-use'?['target']:[])]);id(b.operationId);['accountVersion','assignmentRevision','authEpoch'].forEach(k=>num(b[k],1));if(m[2]==='authorize-use')target(b.target);
    return store.transact((s,authority)=>{const d=deviceFromState(authority,c),{a,as}=authorized(s,d,m[1],b);
      if(m[2]==='authorize-use'){if(!as.senderFingerprint)throw error('FINGERPRINT_REQUIRED',409);if(b.target.origin!==a.origin)throw error('TARGET_REJECTED',403);}
      return record(s,[...owner(d),bindings.serviceInstanceId],m[2],b,()=>({operationId:b.operationId,status:m[2]==='claim'?'CLAIMED':'AUTHORIZED',account:structuredClone(a),member:who(d),accountVersion:a.version,assignmentRevision:as.assignmentRevision,...(m[2]==='claim'?{inviteUrl:as.inviteUrl,senderFingerprint:as.senderFingerprint}:{target:structuredClone(b.target)})}),m[1]);},{withAuthorization:run=>bindingStore.withAuthorization(run)});
  }
  return Object.freeze({admin,request});
}
