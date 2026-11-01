import {createQueueJournal,appendQueueEvent,replayQueueJournal} from './state.js';

// One externally exclusive owner only. Read-before-write detects stale data;
// it is NOT an atomic CAS, distributed lease, scheduler or execution permit.
const MAX_BYTES=128*1024;
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const active=new Set(['LEASED','DISPATCH_INTENT','RUNNING']);
function decode(raw){
  if(typeof raw!=='string'||raw.length>MAX_BYTES||new TextEncoder().encode(raw).byteLength>MAX_BYTES)
    fail('E_QUEUE_SCHEMA','Invalid saved queue');
  try{return JSON.parse(raw);}catch{fail('E_QUEUE_SCHEMA','Invalid saved queue');}
}

export function createSingleOwnerQueue({storage,key,workflowId,ownerId,scope,clock=Date.now}){
  const expectedKey=`opendesk.webflow.queue.v1:${workflowId}`;
  if(!storage||typeof storage.getItem!=='function'||typeof storage.setItem!=='function'||
    typeof clock!=='function'||key!==expectedKey)
    fail('E_QUEUE_SCHEMA','Queue requires scoped AppStorage getItem/setItem');
  let journal=null,raw=null,queue=null,busy=false,storageStatus='UNLOADED';
  const options=()=>({...scope,workflowId,ownerId,now:clock()});
  const enter=()=>{if(busy)fail('E_QUEUE_BUSY','This queue instance already has an operation');busy=true;};
  async function read(){
    try{return await storage.getItem(key);}catch{
      storageStatus='UNKNOWN';fail('E_QUEUE_STORAGE_UNKNOWN','Queue read outcome is unknown');
    }
  }
  async function commit(next,expectedRaw,opts){
    const nextQueue=replayQueueJournal(next,opts);
    const nextRaw=JSON.stringify(next);
    if(nextRaw.length>MAX_BYTES||new TextEncoder().encode(nextRaw).byteLength>MAX_BYTES)
      fail('E_QUEUE_LIMIT','Queue journal budget exceeded; history was retained');
    if(await read()!==expectedRaw){storageStatus='UNKNOWN';fail('E_QUEUE_STALE','Saved queue changed; reload before continuing');}
    try{
      await storage.setItem(key,nextRaw);
      if(await storage.getItem(key)!==nextRaw)throw Error('Readback mismatch');
    }catch{
      storageStatus='UNKNOWN';fail('E_QUEUE_STORAGE_UNKNOWN','Queue write is not confirmed; do not retry');
    }
    journal=next;raw=nextRaw;queue=nextQueue;storageStatus='CONFIRMED';
    return queue;
  }
  async function load(){
    enter();try{
      const opts=options(),saved=await read();
      const loaded=saved===null?createQueueJournal({workflowId,ownerId,now:opts.now}):decode(saved);
      const state=replayQueueJournal(loaded,opts);
      if(state.jobs.some(row=>active.has(row.status))){
        const recovered=appendQueueEvent(loaded,{type:'recover',at:opts.now},opts);
        return await commit(recovered,saved,opts);
      }
      journal=loaded;raw=saved;queue=state;storageStatus='CONFIRMED';return queue;
    }catch(error){storageStatus='UNKNOWN';throw error;}finally{busy=false;}
  }
  async function apply(event){
    enter();try{
      if(storageStatus==='UNKNOWN')fail('E_QUEUE_STORAGE_UNKNOWN','Reload and reconcile this queue first');
      if(!journal)fail('E_QUEUE_STATE','Load the queue before updating it');
      const opts=options();
      const next=appendQueueEvent(journal,{...event,at:opts.now},opts);
      if(next===journal)return queue;
      return await commit(next,raw,opts);
    }finally{busy=false;}
  }
  return Object.freeze({load,apply,snapshot:()=>Object.freeze({storageStatus,queue})});
}
