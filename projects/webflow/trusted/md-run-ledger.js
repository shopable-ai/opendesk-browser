// OD-AI-WORKFLOW-BRIDGE: WebFlow-specific projection onto the ORIGINAL
// trusted frameworkKV transactional store. This never starts a task, opens
// a tab, sends a message, or writes a workspace file. Only an authenticated
// original Host may construct this adapter with a validated namespace/owner.
import {createMdRunRecord,applyMdRunEvent,nextMdRunAction} from '../src/md-run-contract.js';
import {readMdChatGPTReplyEvent,readMdOriginalController} from './md-run-receipt.js';

const STORE='frameworkKV',PREFIX='opendesk.webflow.md-run.v1:';
const fail=(code,message=code)=>{throw Object.assign(new Error(message),{code});};
const id=value=>typeof value==='string'&&/^[A-Za-z0-9._:-]{8,128}$/u.test(value);
const copy=value=>structuredClone(value);
const frozen=value=>Object.freeze(value);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const key=(namespace,workflowId)=>PREFIX+JSON.stringify([namespace,workflowId]);

function sameFrozenInput(previous,next){
  return previous.workflowId===next.workflowId&&previous.sourceUrl===next.sourceUrl&&
    previous.sourceSha256===next.sourceSha256&&same(previous.workflow,next.workflow)&&
    same(previous.account,next.account)&&
    previous.authorizationRef===next.authorizationRef&&
    previous.artifactScopeRef===next.artifactScopeRef;
}

// Cross-window safety depends on storage.transaction being the original
// IndexedDB readwrite transaction, not an ordinary storage.get/set shim.
// SHA-256 and other non-IDB async work happen BEFORE taking that transaction:
// awaiting crypto inside an IDB write transaction can close it prematurely.
export function createMdTrustedRunLedger({storage,namespace,assertOwner,clock=()=>Date.now(),
  randomUUID=()=>crypto.randomUUID(),digest,client,verifyAccount}={}){
  if(typeof storage?.transaction!=='function'||!id(namespace)||
    typeof assertOwner!=='function'||typeof clock!=='function'||
    typeof randomUUID!=='function')fail('E_MD_OWNER','A trusted namespace, store and owner check are required');

  const access=async(action,details={})=>{
    if(await assertOwner({namespace,action,...details})!==true)
      fail('E_MD_OWNER','Original trusted Host rejected this Markdown operation');
  };
  async function get(workflowId){
    if(!id(workflowId))fail('E_MD_RUN_SCHEMA');
    await access('read',{workflowId});
    const found=await storage.transaction([STORE],'readonly',
      tx=>tx.get(STORE,key(namespace,workflowId)));
    return found?frozen(copy(found)):null;
  }
  async function startOrGet(input){
    const incoming=createMdRunRecord(input);
    await access('start',{workflowId:incoming.workflowId,runId:incoming.runId,
      account:incoming.account,authorizationRef:incoming.authorizationRef,
      artifactScopeRef:incoming.artifactScopeRef});
    const result=await storage.transaction([STORE],'readwrite',async tx=>{
      const entryKey=key(namespace,incoming.workflowId);
      const found=await tx.get(STORE,entryKey);
      if(found){
        if(!sameFrozenInput(found,incoming))
          fail('E_MD_RUN_CONFLICT','An existing run freezes another source, account or authority');
        return {created:false,run:found};
      }
      await tx.put(STORE,incoming,entryKey);
      return {created:true,run:incoming};
    });
    return frozen({created:result.created,run:frozen(copy(result.run))});
  }
  async function append(workflowId,event){
    if(!id(workflowId)||!event||typeof event!=='object')
      fail('E_MD_RUN_SCHEMA');
    await access('transition',{workflowId,eventType:event.type,taskId:event.taskId});
    // Read-only snapshot is not authority to write. The second, atomic
    // readwrite transaction checks the same revision immediately before put.
    const snapshot=await storage.transaction([STORE],'readonly',
      tx=>tx.get(STORE,key(namespace,workflowId)));
    if(!snapshot)fail('E_MD_RUN_MISSING');
    const next=await applyMdRunEvent(snapshot,event,{digest});
    const committed=await storage.transaction([STORE],'readwrite',async tx=>{
      const entryKey=key(namespace,workflowId),current=await tx.get(STORE,entryKey);
      if(!current||current.runId!==snapshot.runId||current.revision!==snapshot.revision)
        fail('E_MD_RUN_STALE','Another Host committed first; inspect the original run');
      await tx.put(STORE,next,entryKey);
      return next;
    });
    return frozen(copy(committed));
  }
  async function claimNext(workflowId){
    const current=await get(workflowId);
    if(!current)fail('E_MD_RUN_MISSING');
    const action=nextMdRunAction(current);
    if(action.action!=='CLAIM_WITH_TRUSTED_LEDGER')
      return frozen({claimed:false,action:action.action,run:current});
    const event={type:'claim',taskId:action.taskId,expectedRevision:current.revision,
      at:Math.max(clock(),current.updatedAt),claimRef:'claim-'+randomUUID()};
    try{return frozen({claimed:true,action:'CLAIMED',run:await append(workflowId,event)});}
    catch(e){
      // Only an actual compare-and-swap conflict may be reconciled by READ.
      // Neither UNKNOWN nor permission loss is ever converted into a claim.
      if(e.code!=='E_MD_RUN_STALE')throw e;
      const latest=await get(workflowId);
      return frozen({claimed:false,action:nextMdRunAction(latest).action,run:latest});
    }
  }
  async function reconcileOriginalReply(workflowId,taskId){
    // Only the authenticated original Host supplies these two capabilities;
    // a sandbox Task result/claimed account cannot be injected here.
    if(typeof client?.controller?.snapshotControllerRun!=='function'||
      typeof verifyAccount!=='function')
      fail('E_MD_OWNER','Original Controller and live account check are required');
    const current=await get(workflowId);
    if(!current)fail('E_MD_RUN_MISSING');
    const event=await readMdChatGPTReplyEvent({workflowRun:current,taskId,
      readOriginalRun:args=>readMdOriginalController({client,...args}),
      verifyAccount,clock});
    // CAS protects against another window committing first. A conflict only
    // permits re-reading this original run; never resubmitting a Task.
    return append(workflowId,event);
  }
  return frozen({get,startOrGet,append,claimNext,reconcileOriginalReply});
}
