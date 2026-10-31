// Non-secret connection/policy state, separate from quota history and credentials.
import {constants} from 'node:fs';
import {open, mkdir, lstat, rename, unlink} from 'node:fs/promises';
import {join, isAbsolute} from 'node:path';
import {homedir} from 'node:os';
import {randomUUID,createHash} from 'node:crypto';
export const bindingError=(code,status=400)=>Object.assign(new Error(code),{code,status});
const file='service-binding-v1.json',lockFile='.service-binding-v1.lock',maxBytes=8*1024*1024;
const empty=()=>({schemaVersion:1,devices:[],bindings:[],operations:[]});
export function exact(value,keys) {
  if(!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).some(k=>!keys.includes(k)))
    throw bindingError('BAD_INPUT');
}
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const policyHash=(d,v)=>createHash('sha256').update(canonical({serviceInstanceId:d.serviceInstanceId,tenantId:d.tenantId,deviceId:d.deviceId,desiredRevision:v.desiredRevision,scope:v.scope})).digest('hex');
const DEVICE_FIELDS=['deviceId','serviceInstanceId','tenantId','userId','connectionId','installationId','grantFamilyId','label','resourceIds','authEpoch','revoked','desired','acceptance','paused'];
const BINDING_FIELDS=['bindingId','deviceId','tenantId','purpose','providerKey','remoteAccountId','localAccount','revision','authEpoch','sourceMode','verificationState','verifiedAt','revoked'];
const requireShape=(v,keys)=>{exact(v,keys);if(Object.keys(v).length!==keys.length)throw Error();};
const identifier=v=>{if(typeof v!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(v))throw Error();};
const positive=v=>{if(!Number.isSafeInteger(v)||v<1)throw Error();};
const boolean=v=>{if(typeof v!=='boolean')throw Error();};
const digest=v=>{if(typeof v!=='string'||!/^[a-f0-9]{64}$/.test(v))throw Error();};
const ids=(v,max=64)=>{if(!Array.isArray(v)||v.length>max||new Set(v).size!==v.length)throw Error();v.forEach(identifier);};
function scope(v){requireShape(v,['bindingIds','dataCategories','trigger','retentionDays']);ids(v.bindingIds);
  if(!Array.isArray(v.dataCategories)||v.dataCategories.length<1||v.dataCategories.length>2||new Set(v.dataCategories).size!==v.dataCategories.length||v.dataCategories.some(x=>!['ACCOUNT_METADATA','USAGE_SUMMARY'].includes(x))||v.trigger!=='MANUAL'||!Number.isInteger(v.retentionDays)||v.retentionDays<1||v.retentionDays>30)throw Error();}
function desired(v){requireShape(v,['desiredRevision','scope','desiredHash']);positive(v.desiredRevision);digest(v.desiredHash);scope(v.scope);}
function acceptance(v){requireShape(v,['desiredRevision','desiredHash','authEpoch','scope']);positive(v.desiredRevision);positive(v.authEpoch);digest(v.desiredHash);scope(v.scope);}
function localAccount(v){requireShape(v,['origin','alias','version','storeId','partitionKey']);
  const origin=x=>{if(typeof x!=='string'||x.length>2048)throw Error();const u=new URL(x);if(!['http:','https:'].includes(u.protocol)||u.origin!==x)throw Error();};
  origin(v.origin);identifier(v.alias);if(!Number.isSafeInteger(v.version)||v.version<0)throw Error();identifier(v.storeId);
  if(v.partitionKey!==null){requireShape(v.partitionKey,['topLevelSite','hasCrossSiteAncestor']);origin(v.partitionKey.topLevelSite);boolean(v.partitionKey.hasCrossSiteAncestor);}}
function binding(v){requireShape(v,BINDING_FIELDS);['bindingId','deviceId','tenantId','providerKey','remoteAccountId'].forEach(k=>identifier(v[k]));
  positive(v.revision);positive(v.authEpoch);localAccount(v.localAccount);boolean(v.revoked);
  if(v.purpose!=='usage'||v.sourceMode!=='MANUAL'||v.verificationState!=='UNVERIFIED'||v.verifiedAt!==null)throw Error();}
function policy(v){requireShape(v,['serviceInstanceId','deviceId','authEpoch','desired','acceptance','paused','status']);identifier(v.serviceInstanceId);identifier(v.deviceId);positive(v.authEpoch);boolean(v.paused);
  if(v.desired!==null)desired(v.desired);if(v.acceptance!==null){acceptance(v.acceptance);if(!v.desired||v.acceptance.authEpoch!==v.authEpoch||v.acceptance.desiredRevision>v.desired.desiredRevision)throw Error();}
  const status=!v.acceptance?'PENDING':v.paused?'PAUSED':v.acceptance.desiredHash===v.desired?.desiredHash?'ACCEPTED':'PENDING';if(v.status!==status)throw Error();}
function result(v){
  if(v?.bindingId!==undefined)return binding(v);
  if(v?.desiredRevision!==undefined)return desired(v);
  if(v?.status==='REVOKED'){requireShape(v,['status','authEpoch']);return positive(v.authEpoch);}
  if(v?.status!==undefined)return policy(v);
  requireShape(v,['deviceId','authEpoch','serviceInstanceId']);identifier(v.deviceId);positive(v.authEpoch);identifier(v.serviceInstanceId);
}
function validate(state) {
  try {
    requireShape(state,['schemaVersion','devices','bindings','operations']);
    if(state.schemaVersion!==1||!['devices','bindings','operations'].every(k=>Array.isArray(state[k])&&state[k].length<=20000))throw Error();
    const deviceIds=new Set(),bindingIds=new Set(),operationIds=new Set();
    for(const row of state.devices){requireShape(row,DEVICE_FIELDS);
      ['deviceId','serviceInstanceId','tenantId','userId','connectionId','installationId','grantFamilyId'].forEach(k=>identifier(row[k]));
      if(deviceIds.has(row.deviceId))throw Error();deviceIds.add(row.deviceId);
      if(typeof row.label!=='string'||row.label.length<1||row.label.length>80||/[\x00-\x1f]/.test(row.label))throw Error();
      ids(row.resourceIds);boolean(row.revoked);positive(row.authEpoch);boolean(row.paused);
      policy({serviceInstanceId:row.serviceInstanceId,deviceId:row.deviceId,authEpoch:row.authEpoch,desired:row.desired,acceptance:row.acceptance,paused:row.paused,
        status:!row.acceptance?'PENDING':row.paused?'PAUSED':row.acceptance.desiredHash===row.desired?.desiredHash?'ACCEPTED':'PENDING'});
      if(row.desired&&row.desired.desiredHash!==policyHash(row,row.desired))throw Error();
      if(row.acceptance?.desiredRevision===row.desired?.desiredRevision&&row.acceptance&&row.acceptance.desiredHash!==row.desired.desiredHash)throw Error();
      if(row.revoked&&(row.acceptance!==null||!row.paused))throw Error();
    }
    for(const row of state.bindings){binding(row);if(bindingIds.has(row.bindingId))throw Error();bindingIds.add(row.bindingId);
      const d=state.devices.find(d=>d.deviceId===row.deviceId);if(!d||d.tenantId!==row.tenantId||!d.resourceIds.includes(row.remoteAccountId))throw Error();}
    for(const row of state.operations){requireShape(row,['operationId','owner','digest','createdAt','result']);identifier(row.operationId);
      if(!Array.isArray(row.owner)||row.owner.length!==7||!['admin','device'].includes(row.owner[0]))throw Error();row.owner.slice(1).forEach(identifier);
      const key=JSON.stringify([row.owner,row.operationId]);if(operationIds.has(key))throw Error();operationIds.add(key);
      digest(row.digest);if(!Number.isSafeInteger(row.createdAt)||row.createdAt<0)throw Error();
      if(Buffer.byteLength(JSON.stringify(row.result))>65536)throw bindingError('STORE_RESULT_SIZE',503);result(row.result);
      const d=state.devices.find(d=>d.serviceInstanceId===row.owner[1]&&JSON.stringify([d.tenantId,d.userId,d.connectionId,d.installationId,d.grantFamilyId])===JSON.stringify(row.owner.slice(2)));
      if(!d)throw Error();
      if(row.result.deviceId!==undefined&&row.result.deviceId!==d.deviceId)throw Error();
      if(row.result.serviceInstanceId!==undefined&&row.result.serviceInstanceId!==d.serviceInstanceId)throw Error();
      if(row.result.desiredRevision!==undefined&&row.result.desiredHash!==policyHash(d,row.result))throw Error();
    }
    return state;
  }catch(error){if(error.code==='STORE_RESULT_SIZE')throw error;throw bindingError('STORE_SCHEMA',503);}
}
async function check(path,directory=false) {
  const stat=await lstat(path);
  if(stat.isSymbolicLink() || (directory?!stat.isDirectory():!stat.isFile()) || (stat.mode&0o077) ||
      (process.getuid && stat.uid!==process.getuid()))throw bindingError('STORE_PERMISSIONS',503);
  return stat;
}
export class ServiceBindingStore {
  #directory;#queue=Promise.resolve();
  constructor({directory=join(homedir(),'.opendesk','ai-account-usage')}={}) {
    if(typeof directory!=='string'||!isAbsolute(directory))throw bindingError('STORE_DIRECTORY');
    this.#directory=directory;
  }
  async #init(){await mkdir(this.#directory,{recursive:true,mode:0o700});await check(this.#directory,true);}
  async #load(){
    await this.#init();let handle;
    try {
      await check(join(this.#directory,file));
      handle=await open(join(this.#directory,file),constants.O_RDONLY|constants.O_NOFOLLOW);
      const stat=await handle.stat();
      if(!stat.isFile()||(stat.mode&0o077)||(process.getuid&&stat.uid!==process.getuid()))throw bindingError('STORE_PERMISSIONS',503);
      if(stat.size>maxBytes)throw bindingError('STORE_SIZE',503);
      const body=await handle.readFile();if(body.length>maxBytes)throw bindingError('STORE_SIZE',503);
      let parsed;try{parsed=JSON.parse(body.toString('utf8'));}catch{throw bindingError('STORE_SCHEMA',503);}
      return validate(parsed);
    }catch(error){if(error.code==='ENOENT')return empty();if(error.status)throw error;throw bindingError('STORE_READ',503);}
    finally{await handle?.close();}
  }
  #serial(run){const task=this.#queue.then(run,run);this.#queue=task.catch(()=>{});return task;}
  read(){return this.#serial(()=>this.#load());}
  transact(run){return this.#serial(async()=>{
    await this.#init();const path=join(this.#directory,lockFile);let lock;
    try{lock=await open(path,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);}
    catch(error){throw bindingError(error.code==='EEXIST'?'STORE_BUSY':'STORE_WRITE',503);}
    const temp=join(this.#directory,`.service-binding-${randomUUID()}.tmp`);let handle;
    try {
      const lockStat=await lock.stat();
      if(!lockStat.isFile()||(lockStat.mode&0o077)||(process.getuid&&lockStat.uid!==process.getuid()))throw bindingError('STORE_PERMISSIONS',503);
      const state=await this.#load(),result=await run(state);
      if(Buffer.byteLength(JSON.stringify(result)??'')>65536)throw bindingError('STORE_RESULT_SIZE',503);
      validate(state);
      const body=JSON.stringify(state);if(Buffer.byteLength(body)>maxBytes)throw bindingError('STORE_SIZE',503);
      handle=await open(temp,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);
      await handle.writeFile(body);await handle.sync();await handle.close();handle=null;
      await rename(temp,join(this.#directory,file));
      const directoryHandle=await open(this.#directory,constants.O_RDONLY|constants.O_NOFOLLOW);
      try{await directoryHandle.sync();}finally{await directoryHandle.close();}
      return structuredClone(result);
    }catch(error){if(error.status)throw error;throw bindingError('STORE_WRITE',503);
    }finally{
      await handle?.close();await unlink(temp).catch(()=>{});
      try{const held=await lock.stat(),current=await lstat(path);
        if(current.isSymbolicLink()||held.ino!==current.ino||held.dev!==current.dev)throw bindingError('STORE_BUSY',503);
        await unlink(path);
      }catch(error){if(error.status)throw error;throw bindingError('STORE_WRITE',503);}
      finally{await lock.close();}
    }
  });}
}
