// OD-AI-WORKFLOW-BRIDGE: site-neutral two-step projection over the EXISTING
// transactional frameworkKV store. The original Controller and site adapters
// own task effects, approval, complete-result validation and delivery to A.
// No page DOM, grants, Runner, Authority or retry mechanism is created here.
import {canonical} from '../../../src/platform/protocol.js';

const PREFIX='webflow:serial-two-step:v1:';
const ID=/^[A-Za-z0-9._:-]{8,128}$/u;
const SHA=/^[a-f0-9]{64}$/u;
const fail=code=>{throw Object.assign(new Error(code),{code});};
const validId=value=>typeof value==='string'&&ID.test(value);
const validKind=value=>typeof value==='string'&&/^[a-z][a-z0-9-]{0,63}$/u.test(value);
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
  Object.getPrototypeOf(value)===Object.prototype;
const copy=value=>structuredClone(value);
const scopedKey=(namespace,id)=>PREFIX+JSON.stringify([namespace,id]);
// Prevent different workflows from reusing a committed side-effect identity.
const indexKey=(namespace,kind,id)=>PREFIX+JSON.stringify(['index',namespace,kind,id]);

function validateInput(input){
  if(!plain(input)||!validId(input.workflowId)||!validId(input.operationKey)||
    !validId(input.deliveryKey)||input.operationKey===input.deliveryKey||
    !validId(input.authorizationRef)||!plain(input.source)||!plain(input.task)||
    !Array.isArray(input.inputRefs)||input.inputRefs.length<1||input.inputRefs.length>16||
    !Number.isSafeInteger(input.deadlineAt)||input.deadlineAt<=0)fail('E_SERIAL_WORKFLOW_INPUT');
  const serialized=canonical(input); // Existing framework canonical JSON rules.
  if(new TextEncoder().encode(serialized).byteLength>16384)fail('E_SERIAL_WORKFLOW_INPUT');
  return {value:JSON.parse(serialized),frozen:serialized};
}
function resultProof(proof,run){
  if(!plain(proof)||proof.verified!==true||
    proof.operationKey!==run.input.operationKey||!validId(proof.runId)||
    !validId(proof.resultId)||!plain(proof.resultRef)||
    !validKind(proof.resultRef.kind)||!validId(proof.resultRef.id)||!SHA.test(proof.resultRef.sha256)||
    (run.bRunId&&proof.runId!==run.bRunId))fail('E_SERIAL_B_PROOF');
  // The site adapter owns message identity and full-text hash validation.
  // The persistent projection retains references, never full page/AI text.
  return copy({runId:proof.runId,resultId:proof.resultId,resultRef:proof.resultRef});
}
function prepareDeliveryIntent(intent,run){
  if(!plain(intent)||!SHA.test(intent.contentSha256)||
    intent.deliveryKey!==run.input.deliveryKey||
    !plain(intent.source)||canonical(intent.source)!==canonical(run.input.source)||
    intent.authorizationRef!==run.input.authorizationRef||
    !run.bProof||intent.bRunId!==run.bProof.runId||
    intent.bResultId!==run.bProof.resultId)fail('E_SERIAL_A_INTENT');
  return copy({contentSha256:intent.contentSha256,deliveryKey:intent.deliveryKey,
    authorizationRef:intent.authorizationRef,bRunId:intent.bRunId,
    bResultId:intent.bResultId});
}
function deliveryProof(proof,run){
  if(!plain(proof)||proof.verified!==true||proof.deliveryKey!==run.input.deliveryKey||
    !plain(proof.source)||canonical(proof.source)!==canonical(run.input.source)||
    proof.authorizationRef!==run.input.authorizationRef||
    !run.bProof||proof.bRunId!==run.bProof.runId||
    proof.bResultId!==run.bProof.resultId||
    !validId(proof.messageId)||!plain(proof.deliveryRef)||
    !validKind(proof.deliveryRef.kind)||!validId(proof.deliveryRef.id)||
    !SHA.test(proof.deliveryRef.sha256)||proof.contentSha256!==proof.deliveryRef.sha256||
    !run.aIntent||proof.contentSha256!==run.aIntent.contentSha256||
    (proof.deliveryRef.kind==='message'&&proof.deliveryRef.id!==proof.messageId))
    fail('E_SERIAL_A_PROOF');
  // The site adapter must independently inspect the real source A message.
  // An ACK or a caller-claimed digest alone must never complete this flow.
  return copy({messageId:proof.messageId,deliveryRef:proof.deliveryRef,
    contentSha256:proof.contentSha256,bRunId:proof.bRunId,bResultId:proof.bResultId,
    authorizationRef:proof.authorizationRef,deliveryKey:proof.deliveryKey,
    aiReplyObserved:proof.aiReplyObserved===true});
}

export function createSerialTwoStepRun({storage,namespace,assertOwner,authorize,
  dispatchB,readB,prepareA,deliverA,readA,clock=Date.now}={}){
  if(!storage?.transaction||!validId(namespace)||
    [assertOwner,authorize,dispatchB,readB,prepareA,deliverA,readA,clock].some(fn=>typeof fn!=='function'))
    fail('E_SERIAL_WORKFLOW_OWNER');
  const key=id=>{if(!validId(id))fail('E_SERIAL_WORKFLOW_ID');return scopedKey(namespace,id);};
  const getRaw=id=>storage.transaction(['frameworkKV'],'readonly',tx=>tx.get('frameworkKV',key(id)));
  async function get(id){
    const record=await getRaw(id);
    if(record){if(await assertOwner(copy(record))!==true)fail('E_SERIAL_WORKFLOW_OWNER');}
    return record?copy(record):null;
  }
  async function start(input){
    const {value,frozen}=validateInput(input);
    if(await authorize(copy(value),'start')!==true)fail('E_SERIAL_WORKFLOW_AUTH');
    return storage.transaction(['frameworkKV'],'readwrite',async tx=>{
      const k=key(value.workflowId);
      const operationIndex=indexKey(namespace,'operation',value.operationKey);
      const deliveryIndex=indexKey(namespace,'delivery',value.deliveryKey);
      const previous=await tx.get('frameworkKV',k);
      const operationOwner=await tx.get('frameworkKV',operationIndex);
      const deliveryOwner=await tx.get('frameworkKV',deliveryIndex);
      if((operationOwner!==undefined&&operationOwner!==value.workflowId)||
        (deliveryOwner!==undefined&&deliveryOwner!==value.workflowId)||
        (previous&&previous.inputFrozen!==frozen))fail('E_SERIAL_WORKFLOW_CONFLICT');
      // Both uniqueness claims use the original atomic frameworkKV transaction.
      if(operationOwner!==value.workflowId)
        await tx.put('frameworkKV',operationIndex,value.workflowId);
      if(deliveryOwner!==value.workflowId)
        await tx.put('frameworkKV',deliveryIndex,value.workflowId);
      if(previous)return copy(previous);
      const record={version:1,workflowId:value.workflowId,input:value,inputFrozen:frozen,
        phase:'PREPARED',revision:1,bRunId:null,bProof:null,aIntent:null,aProof:null,createdAt:clock()};
      await tx.put('frameworkKV',k,record);return copy(record);
    });
  }
  async function move(record,expectedPhase,phase,change={}){
    return storage.transaction(['frameworkKV'],'readwrite',async tx=>{
      const k=key(record.workflowId),latest=await tx.get('frameworkKV',k);
      if(latest?.revision!==record.revision||latest.phase!==expectedPhase||
        latest.inputFrozen!==record.inputFrozen)fail('E_SERIAL_WORKFLOW_STALE');
      const next={...latest,...change,phase,revision:latest.revision+1};
      await tx.put('frameworkKV',k,next);return copy(next);
    });
  }
  const hold=(phase,reason,record)=>({phase,reason,workflowId:record.workflowId,revision:record.revision});
  async function advance(id){
    let run=await get(id);
    if(!run)fail('E_SERIAL_WORKFLOW_MISSING');
    if(run.phase==='DONE')return hold('DONE','VERIFIED',run);
    if(run.phase==='PREPARED'){
      if(clock()>=run.input.deadlineAt||await authorize(copy(run),'dispatch-b')!==true)
        return hold('PREPARED','E_SERIAL_WORKFLOW_AUTH',run);
      // The irreversible B intent is durable BEFORE calling the original
      // Controller. A crash after this write is READ ONLY, never retry.
      try{run=await move(run,'PREPARED','B_INTENT_RECORDED');}
      catch(e){if(e?.code==='E_SERIAL_WORKFLOW_STALE')return hold('STALE','READ_ORIGINAL',run);throw e;}
      try{
        if(clock()>=run.input.deadlineAt||await authorize(copy(run),'dispatch-b')!==true)
          return hold('B_INTENT_RECORDED','E_SERIAL_WORKFLOW_AUTH',run);
        const ack=await dispatchB(copy(run));
        if(!validId(ack?.runId)||ack?.duplicate===true)fail('E_SERIAL_B_UNKNOWN');
        run=await move(run,'B_INTENT_RECORDED','B_ADMITTED',{bRunId:ack.runId});
        return hold('B_ADMITTED','READ_ORIGINAL',run);
      }catch{return hold('B_INTENT_RECORDED','E_SERIAL_B_UNKNOWN',run);}
    }
    if(['B_INTENT_RECORDED','B_ADMITTED'].includes(run.phase)){
      let proof;
      try{proof=await readB(copy(run));}catch{return hold(run.phase,'E_SERIAL_B_UNKNOWN',run);}
      if(!proof)return hold(run.phase,'WAIT_B_VERIFIED',run);
      const checked=resultProof(proof,run);
      try{run=await move(run,run.phase,'B_VERIFIED',{bRunId:checked.runId,bProof:checked});}
      catch(e){if(e?.code==='E_SERIAL_WORKFLOW_STALE')return hold('STALE','READ_ORIGINAL',run);throw e;}
      return hold('B_VERIFIED','READY_FOR_A',run);
    }
    if(run.phase==='B_VERIFIED'){
      if(clock()>=run.input.deadlineAt||await authorize(copy(run),'deliver-a')!==true)
        return hold('B_VERIFIED','E_SERIAL_WORKFLOW_AUTH',run);
      // Only trusted read-only business formatting can determine the A bytes.
      // Persist the exact text hash with the one-use intent BEFORE any click.
      let intent;
      try{intent=prepareDeliveryIntent(await prepareA(copy(run)),run);}
      catch{return hold('B_VERIFIED','E_SERIAL_A_PREPARE_UNKNOWN',run);}
      if(clock()>=run.input.deadlineAt||await authorize(copy(run),'deliver-a')!==true)
        return hold('B_VERIFIED','E_SERIAL_WORKFLOW_AUTH',run);
      try{run=await move(run,'B_VERIFIED','A_INTENT_RECORDED',{aIntent:intent});}
      catch(e){if(e?.code==='E_SERIAL_WORKFLOW_STALE')return hold('STALE','READ_ORIGINAL',run);throw e;}
      // The site-specific trusted delivery adapter must reuse the ORIGINAL
      // source A and its existing one-use send/admission safeguards.
      try{
        if(clock()>=run.input.deadlineAt||await authorize(copy(run),'deliver-a')!==true)
          return hold('A_INTENT_RECORDED','E_SERIAL_WORKFLOW_AUTH',run);
        await deliverA(copy(run));
      }catch{return hold('A_INTENT_RECORDED','E_SERIAL_A_UNKNOWN',run);}
      return hold('A_INTENT_RECORDED','READ_A_ORIGINAL',run);
    }
    if(run.phase==='A_INTENT_RECORDED'){
      let proof;
      try{proof=await readA(copy(run));}catch{return hold(run.phase,'E_SERIAL_A_UNKNOWN',run);}
      if(!proof)return hold(run.phase,'READ_A_ORIGINAL',run);
      const checked=deliveryProof(proof,run);
      try{run=await move(run,'A_INTENT_RECORDED','DONE',{aProof:checked});}
      catch(e){if(e?.code==='E_SERIAL_WORKFLOW_STALE')return hold('STALE','READ_ORIGINAL',run);throw e;}
      return hold('DONE','VERIFIED',run);
    }
    fail('E_SERIAL_WORKFLOW_STATE');
  }
  return Object.freeze({get,start,advance});
}
