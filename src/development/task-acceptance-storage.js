import {invariant} from '../platform/protocol.js';
import {createStorageMethods} from '../platform/storage/repository.js';
import {installedKey, scriptStorageKey, taskKey, taskScriptId, verifyTaskPackage} from '../platform/tasks/contract.js';

// This storage adapter is only imported by the WXT serve acceptance entry.
// No IndexedDB, Chrome storage, namespace fallback or copy-back is available.
export function createTaskAcceptanceStorage({clock}={}) {
  let state=new Map(), tail=Promise.resolve(), closed=false;
  const instanceId=crypto.randomUUID();
  let committedTransactions=0,committedWrites=0;
  const clone=structuredClone;
  const storage={transaction(stores,mode,work){
    const next=tail.then(async()=>{
      invariant(!closed,'E_HOST_CLOSED','Offline acceptance storage has closed');
      invariant(['readonly','readwrite'].includes(mode),'E_SCHEMA','Invalid transaction mode');
      const staged=clone(state);
      let writes=0;
      const store=name=>{
        invariant(stores.includes(name),'E_SCHEMA','Store outside transaction scope');
        if(!staged.has(name))staged.set(name,new Map());
        return staged.get(name);
      };
      let active=true;
      const access=name=>{
        invariant(active&&!closed,'E_HOST_CLOSED','Offline acceptance transaction has closed');
        return store(name);
      };
      const write=name=>{
        invariant(mode==='readwrite','E_SCHEMA','Readonly acceptance transaction');
        return access(name);
      };
      const entries=(name,{prefix,direction='next',offset=0,limit=50,afterKey}={})=>{
        invariant(typeof prefix==='string'&&prefix.length>0&&['next','prev'].includes(direction)&&
          Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>0&&
          (afterKey===undefined||typeof afterKey==='string'&&afterKey.startsWith(prefix)&&direction==='next'&&offset===0),
          'E_SCHEMA','Invalid acceptance cursor');
        const rows=access(name);
        const keys=[...rows.keys()].filter(key=>typeof key==='string'&&key.startsWith(prefix)&&
          (afterKey===undefined||key>afterKey)).sort();
        if(direction==='prev')keys.reverse();
        return keys.slice(offset,offset+limit).map(key=>({key,value:clone(rows.get(key))}));
      };
      try{
        const output=await work(Object.freeze({
          get:async(name,key)=>clone(access(name).get(key)),
          all:async name=>clone([...access(name).values()]),
          put:async(name,value,key)=>{
            invariant(typeof key==='string'&&key.length>0,'E_SCHEMA','Expected explicit acceptance record key');
            write(name).set(key,clone(value));
            writes++;
          },
          delete:async(name,key)=>{write(name).delete(key);writes++;},
          scan:async(name,options)=>entries(name,options).map(row=>row.value),
          keys:async(name,options)=>entries(name,options).map(row=>row.key),
          scanEntries:async(name,options)=>entries(name,options),
          countPrefix:async(name,prefix)=>entries(name,{prefix,limit:Number.MAX_SAFE_INTEGER}).length,
        }));
        invariant(!closed,'E_HOST_CLOSED','Offline acceptance storage has closed');
        if(mode==='readwrite'){
          state=staged;committedTransactions++;committedWrites+=writes;
        }
        return output;
      }finally{active=false;}
    });
    tail=next.catch(()=>{});
    return next;
  },diagnostics(){
    invariant(!closed,'E_HOST_CLOSED','Offline acceptance storage has closed');
    return {instanceId,kind:'memory-map',entries:Object.fromEntries([...state].map(([name,rows])=>[name,rows.size])),
      committedTransactions,committedWrites};
  },close(){closed=true;state.clear();}};
  return Object.freeze(Object.assign(storage,createStorageMethods(storage,{clock})));
}

const taskStores=['frameworkKV','scriptHeads','scriptRevisions'];

// Pin one installed record and its exact immutable package and script. Do not
// read run, result, draft or command tables from the daily store.
export async function readTaskAcceptanceSource(liveStorage,namespace,{taskId,version,installationId,generation}) {
  const installKey=installedKey(namespace,taskId), candidateKey=taskKey(namespace,taskId,version);
  const scriptId=taskScriptId(taskId,version), headKey=scriptStorageKey(namespace,scriptId);
  const revisionKey=scriptStorageKey(namespace,scriptId,1);
  const [install,candidate,head,revision]=await liveStorage.transaction(taskStores,'readonly',tx=>Promise.all([
    tx.get('frameworkKV',installKey),tx.get('frameworkKV',candidateKey),
    tx.get('scriptHeads',headKey),tx.get('scriptRevisions',revisionKey),
  ]));
  invariant(install?.tag==='task-installed-v1'&&install.namespace===namespace&&install.enabled===true&&
    install.taskId===taskId&&install.version===version&&install.scriptId===scriptId&&
    install.authorization?.installationId===installationId&&install.authorization?.generation===generation,
    'E_REVISION','Offline acceptance installation pin expired');
  const pkg=await verifyTaskPackage(candidate?.package);
  const sourceHash=pkg.manifest.program.sourceHash;
  invariant(candidate?.tag==='task-candidate-v1'&&candidate.namespace===namespace&&candidate.stage==='available'&&
    candidate.taskId===taskId&&candidate.version===version&&pkg.manifest.taskId===taskId&&pkg.manifest.version===version&&
    pkg.manifestHash===install.manifestHash&&candidate.verification?.manifestHash===pkg.manifestHash&&
    candidate.verification?.sourceHash===sourceHash&&head?.tag==='script-head'&&!head.tombstoned&&
    head.namespace===namespace&&head.scriptId===scriptId&&head.revision===1&&head.contentHash===sourceHash&&
    revision?.tag==='script-revision'&&revision.namespace===namespace&&revision.scriptId===scriptId&&
    revision.revision===1&&revision.contentHash===sourceHash&&revision.sourceUtf8===pkg.sourceUtf8,
    'E_HASH','Offline acceptance source does not match the exact installed package');
  return {manifestHash:pkg.manifestHash,sourceHash,records:[
    ['frameworkKV',installKey,install],['frameworkKV',candidateKey,candidate],
    ['scriptHeads',headKey,head],['scriptRevisions',revisionKey,revision],
  ]};
}

export async function seedTaskAcceptanceStorage(storage,{records}) {
  await storage.transaction(taskStores,'readwrite',async tx=>{
    for(const [store,key,row] of records)await tx.put(store,row,key);
  });
}
