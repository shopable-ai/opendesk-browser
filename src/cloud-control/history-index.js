// Cloud history projections live in the ORIGINAL frameworkKV database.
// Their primary-key prefixes provide bounded native cursor paging on IDB v2.
// No second Run/Result store, remote code or observer write authority is added.
import {invariant} from '../platform/protocol.js';

const KV='frameworkKV', REQUEST='cloud:request:', ROOT='cloud:history:v1:';
const STATES=Object.freeze(['waiting','prepared','permitted','finished','cancelled','cancellation-pending','OUTCOME_UNKNOWN','other']);
const known=new Set(STATES);
const stamp=value=>Number.isSafeInteger(value)&&value>=0?value:0;
const status=value=>known.has(value)?value:'other';
const namespaceKey=namespace=>encodeURIComponent(namespace);
const marker=namespace=>ROOT+'meta:'+namespaceKey(namespace);
const byTime=namespace=>ROOT+'time:'+namespaceKey(namespace)+':';
const byState=(namespace,state)=>ROOT+'state:'+namespaceKey(namespace)+':'+encodeURIComponent(state)+':';
const suffix=row=>String(stamp(row.createdAt)).padStart(16,'0')+':'+row.requestId;
const timeKey=row=>byTime(row.namespace)+suffix(row);
const stateKey=(row,state)=>byState(row.namespace,state)+suffix(row);
const counters=()=>Object.fromEntries(STATES.map(state=>[state,0]));
const projection=row=>({tag:'cloud-history-entry-v1',namespace:row.namespace,requestId:row.requestId,
  createdAt:stamp(row.createdAt),state:status(row.state)});

function validateRow(row){
  invariant(row?.tag==='cloud-request-v1'&&typeof row.namespace==='string'&&
    row.namespace.startsWith('tool:')&&typeof row.requestId==='string'&&
    row.requestId.startsWith('cloud:'),'E_VERSION','Invalid durable cloud history identity');
}
function validateMeta(meta,namespace){
  invariant(meta?.tag==='cloud-history-meta-v1'&&meta.namespace===namespace&&
    Number.isSafeInteger(meta.total)&&meta.total>=0&&
    STATES.every(s=>Number.isSafeInteger(meta.states?.[s])&&meta.states[s]>=0)&&
    STATES.reduce((sum,s)=>sum+meta.states[s],0)===meta.total,
  'E_VERSION','Cloud history index metadata is inconsistent');
}

export function createCloudHistoryIndex({storage,namespace}){
  invariant(typeof storage?.transaction==='function'&&typeof namespace==='string'&&namespace.startsWith('tool:'),
    'E_SCHEMA','History index requires the original storage and trusted namespace');

  // One atomic transaction: interruption, Quota or failed validation cannot
  // publish a partially migrated index. Only keys are materialized in memory.
  async function ensure(){
    return storage.transaction([KV],'readwrite',async tx=>{
      const existing=await tx.get(KV,marker(namespace));
      if(existing){validateMeta(existing,namespace);return {migrated:false,total:existing.total};}
      invariant(typeof tx.keys==='function','E_VERSION','Native bounded key cursor required for Cloud history migration');
      const keys=await tx.keys(KV,{prefix:REQUEST,limit:1000001});
      invariant(keys.length<=1000000,'E_LIMIT','Cloud history migration requires a bounded maintenance window');
      const states=counters();let total=0;
      for(const key of keys){
        const row=await tx.get(KV,key);
        if(row?.tag!=='cloud-request-v1'||row.namespace!==namespace)continue;
        validateRow(row);
        invariant(key===REQUEST+row.requestId,'E_VERSION','Cloud request primary-key mismatch');
        const entry=projection(row);
        await tx.put(KV,entry,timeKey(entry));
        await tx.put(KV,entry,stateKey(entry,entry.state));
        states[entry.state]++;total++;
      }
      const meta={tag:'cloud-history-meta-v1',namespace,total,states};
      await tx.put(KV,meta,marker(namespace));
      return {migrated:true,total};
    });
  }

  // Caller owns the original IDB readwrite transaction that also updates
  // Run, Result, journal or Provider receipt. Never update indexes afterwards.
  async function put(tx,row){
    validateRow(row);
    const meta=await tx.get(KV,marker(row.namespace));
    if(meta){
      validateMeta(meta,row.namespace);
      const prior=await tx.get(KV,REQUEST+row.requestId);
      if(prior)invariant(prior.namespace===row.namespace&&stamp(prior.createdAt)===stamp(row.createdAt),
        'E_VERSION','Cloud request history sort identity changed');
      const entry=projection(row),old=await tx.get(KV,timeKey(entry));
      invariant(!!prior===!!old,'E_VERSION','Cloud history index missing a durable request');
      if(!old){
        meta.total++;meta.states[entry.state]++;
        await tx.put(KV,entry,timeKey(entry));
        await tx.put(KV,entry,stateKey(entry,entry.state));
        await tx.put(KV,meta,marker(row.namespace));
      }else if(old.state!==entry.state){
        invariant(old.tag==='cloud-history-entry-v1'&&old.namespace===entry.namespace&&
          old.requestId===entry.requestId&&old.createdAt===entry.createdAt,
        'E_VERSION','Cloud history projection does not match its primary record');
        await tx.delete(KV,stateKey(old,old.state));
        await tx.put(KV,entry,timeKey(entry));
        await tx.put(KV,entry,stateKey(entry,entry.state));
        invariant(meta.states[old.state]>0,'E_VERSION','Cloud history state counter underflow');
        meta.states[old.state]--;meta.states[entry.state]++;
        await tx.put(KV,meta,marker(row.namespace));
      }
    }
    await tx.put(KV,row,REQUEST+row.requestId);
  }

  // Strictly read-only: no index repair, migration, or execution in Observer.
  // null means migration has not yet committed; caller can use legacy reading.
  async function page(tx,{limit,offset=0,state='all'}={}){
    const meta=await tx.get(KV,marker(namespace));
    if(!meta||typeof tx.scan!=='function')return null;
    validateMeta(meta,namespace);
    invariant(Number.isSafeInteger(offset)&&offset>=0&&offset<=1000000&&
      Number.isSafeInteger(limit)&&limit>=1&&limit<=50&&
      (state==='all'||known.has(state)),'E_SCHEMA');
    const prefix=state==='all'?byTime(namespace):byState(namespace,state);
    const entries=await tx.scan(KV,{prefix,direction:'prev',offset,limit});
    const rows=[];
    for(const entry of entries){
      invariant(entry?.tag==='cloud-history-entry-v1'&&entry.namespace===namespace,
        'E_VERSION','Invalid indexed Cloud history projection');
      const row=await tx.get(KV,REQUEST+entry.requestId);
      validateRow(row);
      invariant(row.namespace===namespace&&status(row.state)===entry.state&&
        stamp(row.createdAt)===entry.createdAt,'E_VERSION','Stale Cloud history projection');
      rows.push(row);
    }
    return {rows,total:meta.total,matchingTotal:state==='all'?meta.total:meta.states[state],
      states:{...meta.states}};
  }
  return Object.freeze({ensure,put,page});
}
