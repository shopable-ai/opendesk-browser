// Cloud history projections live in the ORIGINAL frameworkKV database.
// Their primary-key prefixes provide bounded native cursor paging on IDB v2.
// No second Run/Result store, remote code or observer write authority is added.
import {invariant} from '../platform/protocol.js';

const KV='frameworkKV', REQUEST='cloud:request:', ROOT='cloud:history:v1:', KEY_VERSION=2;
const STATES=Object.freeze(['waiting','prepared','permitted','finished','cancelled','cancellation-pending','OUTCOME_UNKNOWN','other']);
const known=new Set(STATES);
const stamp=value=>Number.isSafeInteger(value)&&value>=0?value:0;
const status=value=>known.has(value)?value:'other';
const namespaceKey=namespace=>encodeURIComponent(namespace);
const marker=namespace=>ROOT+'meta:'+namespaceKey(namespace);
const byTime=namespace=>ROOT+'time:'+namespaceKey(namespace)+':';
const byState=(namespace,state)=>ROOT+'state:'+namespaceKey(namespace)+':'+encodeURIComponent(state)+':';
const requestKey=row=>row.storageKey||REQUEST+row.requestId;
// The durable primary key separates equal request IDs across pairing generations.
// Legacy unscoped rows retain their original primary key and relative time order.
const suffix=row=>String(stamp(row.createdAt)).padStart(16,'0')+':'+requestKey(row);
const timeKey=row=>byTime(row.namespace)+suffix(row);
const stateKey=(row,state)=>byState(row.namespace,state)+suffix(row);
const counters=()=>Object.fromEntries(STATES.map(state=>[state,0]));
const projection=row=>({tag:'cloud-history-entry-v1',namespace:row.namespace,requestId:row.requestId,
  storageKey:requestKey(row),createdAt:stamp(row.createdAt),state:status(row.state)});

function validateRow(row){
  invariant(row?.tag==='cloud-request-v1'&&typeof row.namespace==='string'&&
    row.namespace.startsWith('tool:')&&typeof row.requestId==='string'&&
    row.requestId.startsWith('cloud:')&&
    (row.storageKey===undefined||typeof row.storageKey==='string'&&
      row.storageKey.startsWith(REQUEST)&&row.storageKey.length>REQUEST.length&&row.storageKey.length<=1024),
  'E_VERSION','Invalid durable cloud history identity');
}
function validateMeta(meta,namespace){
  invariant(meta?.tag==='cloud-history-meta-v1'&&meta.namespace===namespace&&
    (meta.keyVersion===undefined||meta.keyVersion===1||meta.keyVersion===KEY_VERSION)&&
    Number.isSafeInteger(meta.total)&&meta.total>=0&&
    STATES.every(s=>Number.isSafeInteger(meta.states?.[s])&&meta.states[s]>=0)&&
    STATES.reduce((sum,s)=>sum+meta.states[s],0)===meta.total,
  'E_VERSION','Cloud history index metadata is inconsistent');
}

export function createCloudHistoryIndex({storage,namespace}){
  invariant(typeof storage?.transaction==='function'&&typeof namespace==='string'&&namespace.startsWith('tool:'),
    'E_SCHEMA','History index requires the original storage and trusted namespace');

  // One atomic transaction upgrades only private projections and their marker.
  // Original request keys, bodies, Run/Result records and receipts stay intact.
  // Only keys are materialized in memory; interruption or Quota rolls back all.
  async function ensure(){
    return storage.transaction([KV],'readwrite',async tx=>{
      const existing=await tx.get(KV,marker(namespace));
      if(existing){
        validateMeta(existing,namespace);
        if(existing.keyVersion===KEY_VERSION)return {migrated:false,total:existing.total};
      }
      invariant(typeof tx.keys==='function','E_VERSION','Native bounded key cursor required for Cloud history migration');
      const keys=await tx.keys(KV,{prefix:REQUEST,limit:1000001});
      invariant(keys.length<=1000000,'E_LIMIT','Cloud history migration requires a bounded maintenance window');
      // Rebuild an existing v1 index. A fresh database needs only the original
      // request-key scan; no request/Run/Result key enters these prefixes.
      if(existing)for(const prefix of [byTime(namespace),...STATES.map(s=>byState(namespace,s))]){
        const oldKeys=await tx.keys(KV,{prefix,limit:1000001});
        invariant(oldKeys.length<=1000000,'E_LIMIT','Cloud history projection migration exceeded its bound');
        for(const key of oldKeys)await tx.delete(KV,key);
      }
      const states=counters();let total=0;
      for(const key of keys){
        const row=await tx.get(KV,key);
        if(row?.tag!=='cloud-request-v1'||row.namespace!==namespace)continue;
        validateRow(row);
        invariant(key===requestKey(row),'E_VERSION','Cloud request primary-key mismatch');
        const entry=projection(row);
        await tx.put(KV,entry,timeKey(entry));
        await tx.put(KV,entry,stateKey(entry,entry.state));
        states[entry.state]++;total++;
      }
      const meta={tag:'cloud-history-meta-v1',namespace,keyVersion:KEY_VERSION,total,states};
      await tx.put(KV,meta,marker(namespace));
      return {migrated:true,total};
    });
  }

  // Caller owns the original IDB readwrite transaction that also updates
  // Run, Result, journal or Provider receipt. Never update indexes afterwards.
  async function put(tx,row){
    validateRow(row);
    const key=requestKey(row),prior=await tx.get(KV,key);
    if(prior){
      validateRow(prior);
      invariant(prior.namespace===row.namespace&&prior.requestId===row.requestId&&
        requestKey(prior)===key&&stamp(prior.createdAt)===stamp(row.createdAt),
      'E_VERSION','Cloud request history sort identity changed');
    }
    const meta=await tx.get(KV,marker(row.namespace));
    if(meta){
      validateMeta(meta,row.namespace);
      if(meta.keyVersion!==KEY_VERSION){
        // Keep the legacy marker for authenticated atomic rebuilding. page()
        // selects original-record fallback until the key-aware upgrade commits.
        // Mutating the original row cannot make an old index authoritative.
      }else{
        const entry=projection(row),old=await tx.get(KV,timeKey(entry));
        invariant(!!prior===!!old,'E_VERSION','Cloud history index missing a durable request');
        if(old)invariant(old.tag==='cloud-history-entry-v1'&&old.namespace===entry.namespace&&
          old.requestId===entry.requestId&&old.storageKey===entry.storageKey&&old.createdAt===entry.createdAt,
        'E_VERSION','Cloud history projection does not match its primary record');
        if(!old){
          meta.total++;meta.states[entry.state]++;
          await tx.put(KV,entry,timeKey(entry));
          await tx.put(KV,entry,stateKey(entry,entry.state));
          await tx.put(KV,meta,marker(row.namespace));
        }else if(old.state!==entry.state){
          await tx.delete(KV,stateKey(old,old.state));
          await tx.put(KV,entry,timeKey(entry));
          await tx.put(KV,entry,stateKey(entry,entry.state));
          invariant(meta.states[old.state]>0,'E_VERSION','Cloud history state counter underflow');
          meta.states[old.state]--;meta.states[entry.state]++;
          await tx.put(KV,meta,marker(row.namespace));
        }
      }
    }
    await tx.put(KV,row,key);
  }

  // Strictly read-only: old/uncommitted indexes select legacy reading, not
  // migration or repair. Only the authenticated Host can initialize the index.
  async function page(tx,{limit,offset=0,state='all'}={}){
    const meta=await tx.get(KV,marker(namespace));
    if(!meta||typeof tx.scan!=='function')return null;
    validateMeta(meta,namespace);
    if(meta.keyVersion!==KEY_VERSION)return null;
    invariant(Number.isSafeInteger(offset)&&offset>=0&&offset<=1000000&&
      Number.isSafeInteger(limit)&&limit>=1&&limit<=50&&
      (state==='all'||known.has(state)),'E_SCHEMA');
    const prefix=state==='all'?byTime(namespace):byState(namespace,state);
    const entries=await tx.scan(KV,{prefix,direction:'prev',offset,limit});
    const rows=[];
    for(const entry of entries){
      invariant(entry?.tag==='cloud-history-entry-v1'&&entry.namespace===namespace&&
        typeof entry.storageKey==='string'&&entry.storageKey.startsWith(REQUEST),
      'E_VERSION','Invalid indexed Cloud history projection');
      const row=await tx.get(KV,entry.storageKey);
      validateRow(row);
      invariant(row.namespace===namespace&&row.requestId===entry.requestId&&requestKey(row)===entry.storageKey&&
        status(row.state)===entry.state&&stamp(row.createdAt)===entry.createdAt,
      'E_VERSION','Stale Cloud history projection');
      rows.push(row);
    }
    return {rows,total:meta.total,matchingTotal:state==='all'?meta.total:meta.states[state],
      states:{...meta.states}};
  }
  return Object.freeze({ensure,put,page});
}
