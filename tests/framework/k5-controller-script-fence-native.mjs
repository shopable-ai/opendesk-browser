import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {decodeValue} from '../../src/framework/control/value.js';
import {SCRIPT_FENCE_ID,scriptFencePlan,validateScriptFenceOracle} from './k5-controller-script-fence.mjs';
import {nativeFailureOutcome} from './k5-controller-product-native-outcome.mjs';

export async function runScriptFenceOriginal(definition,row,c) {
  const {origin,seed,newPage,browserClient,originalBarriers,chooseBorrowed,click,evaluate,until,snapshot,commit,json,directory,start,durable,readUI,targets,pageObservation,toolResources,getTool,openTool,errorView,catalog}=c;
  row.nativeVariants=[];
  const allVariants=['before','after'].flatMap(stage=>['navigation','revocation','stop','deadline','host-close'].map(trigger=>`${stage}-${trigger}`));
  const selectedVariants=c.variantSelection?.split(',')??allVariants;
  assert(selectedVariants.length&&new Set(selectedVariants).size===selectedVariants.length&&selectedVariants.every(key=>allVariants.includes(key)));
  row.nativeVariantSelection={required:allVariants,selected:selectedVariants,complete:selectedVariants.length===allVariants.length,formalAccepted:false};
  const release=barrier=>{
    if(!barrier.response||barrier.release)return;
    if(barrier.response.writableEnded||barrier.response.destroyed){barrier.release={at:Date.now(),kind:'response-already-closed',destroyed:barrier.response.destroyed,writableEnded:barrier.response.writableEnded};return;}
    barrier.release={at:Date.now(),kind:'response-ended'};barrier.response.setHeader('content-type','application/json');barrier.response.end(JSON.stringify({released:true}));
  };
  for(const stage of ['before','after'])for(const trigger of ['navigation','revocation','stop','deadline','host-close']) {
    if(!selectedVariants.includes(`${stage}-${trigger}`))continue;
    const token=randomUUID(),key=`${stage}-${trigger}`,before={token},after={token:token+'-main'};
    const plan=scriptFencePlan(definition,{stage,trigger,token,beforeURL:`${origin}/original-api48-barrier?token=${token}`,afterURL:`${origin}/original-api48-barrier?token=${after.token}`});
    const aPage=await newPage(`${origin}/original-api48?seed=${seed}&role=A&family=selector&fence=${token}#A-fragment`),bPage=await newPage(`${origin}/original-api48?seed=${seed}&role=B&family=selector&fence=${token}#B-fragment`);
    const variant={stage,trigger,status:'NOT_TESTED',plan,raw:`original-${SCRIPT_FENCE_ID}-${key}`};row.nativeVariants.push(variant);
    originalBarriers.set(token,before);originalBarriers.set(after.token,after);
    let runId,revision,selected,retired=false,startAttempted=false;
    try {
      revision=await commit(plan.source,plan.params);selected=await chooseBorrowed(aPage);
      const aBefore=await pageObservation(aPage),bBefore={...await pageObservation(bPage),markerText:await evaluate(bPage.client,'document.querySelector("#marker")?.textContent')},beforeResources=await toolResources();
      assert.equal(selected.documentId,aBefore.documentId);
      await json(`${directory}/${variant.raw}-input.json`,{definition,plan,revision,selected,catalog,aBefore,bBefore,beforeResources});
      startAttempted=true;runId=await start();
      await until(()=>before.request&&!before.response.destroyed,'Script fence actual Worker HTTP barrier');
      before.pendingOperation=await until(async()=> (await snapshot(getTool().client,{runId})).rows.commandJournal.find(r=>r.value.tag==='controller-operation'&&r.value.runId===runId&&r.value.state==='dispatched'&&r.value.envelope?.operation.method==='AXIOS_GET'&&decodeValue(r.value.envelope.operation.args)[0].url===plan.params.beforeURL)?.value,'Script fence exact admitted Worker barrier');
      before.pendingArgs=decodeValue(before.pendingOperation.envelope.operation.args);
      const initialRun=(await snapshot(getTool().client,{runId})).rows.runs.find(r=>r.value.runId===runId).value;
      await browserClient.send('Target.activateTarget',{targetId:bPage.id});
      const bActive=await until(async()=>{
        const activeTab=await evaluate(getTool().client,'chrome.tabs.query({active:true,currentWindow:true}).then(t=>t[0])'),focusedB=await evaluate(bPage.client,'document.hasFocus()');
        return activeTab?.id===bBefore.tabId&&focusedB&&{activeTab,focusedB,at:Date.now()};
      },'Script fence real active B');
      if(stage==='before'&&trigger==='deadline') {
        release(before);
        before.completedOperation=await until(async()=>{
          const operation=(await snapshot(getTool().client,{runId})).rows.commandJournal.find(r=>r.value.requestId===before.pendingOperation.requestId)?.value;
          return operation?.state==='durable'&&operation;
        },'Script before-deadline short service completed before idle Worker waits for controller deadline',12000);
        assert.equal(before.completedOperation.reply?.error,undefined);
      }
      let aDuring;
      if(stage==='after'){
        release(before);
        await until(()=>after.request&&!after.response.destroyed,'Script fence actual MAIN request after dispatch');
        after.operation=await until(async()=> (await snapshot(getTool().client,{runId})).rows.commandJournal.find(r=>r.value.tag==='controller-operation'&&r.value.runId===runId&&r.value.state==='dispatched'&&r.value.envelope?.operation.kind==='user-script'&&r.value.envelope.operation.method==='eval')?.value,'Script fence dispatched MAIN operation');
        aDuring={...await pageObservation(aPage),proof:await evaluate(aPage.client,'globalThis.__opendeskFenceProof')};
      }
      const triggerAt=Date.now(),triggerEvidence={stage,trigger,triggerAt,initialRun};let hostReopened;
      if(trigger==='stop')await click(getTool().client,getTool().targetId,'#script-stop');
      if(trigger==='navigation'){
        aPage.url=`${origin}/original-api48?seed=${seed}&role=A&family=selector&fence=${token}&replaced=1#A-fragment`;
        triggerEvidence.navigation=await aPage.client.send('Page.navigate',{url:aPage.url});
        await until(()=>evaluate(aPage.client,'document.readyState==="complete"'),'Script fence replacement document loaded');
      }
      if(trigger==='revocation'){
        const pattern=new URL(origin).protocol+'//'+new URL(origin).hostname+'/*';
        triggerEvidence.permissionsBefore=await evaluate(getTool().client,'chrome.permissions.getAll()');
        assert(triggerEvidence.permissionsBefore.origins.includes(pattern));
        triggerEvidence.removed=await evaluate(getTool().client,`chrome.permissions.remove({origins:[${JSON.stringify(pattern)}]})`);assert.equal(triggerEvidence.removed,true);
        triggerEvidence.permissionsAfter=await evaluate(getTool().client,'chrome.permissions.getAll()');assert(!triggerEvidence.permissionsAfter.origins.includes(pattern));
      }
      if(trigger==='host-close'){
        const old=getTool();triggerEvidence.closedTargetId=old.targetId;
        await browserClient.send('Target.closeTarget',{targetId:old.targetId});
        await until(async()=>!(await targets()).some(t=>t.targetId===old.targetId),'Script fence old host absent');
        const fresh=await openTool();hostReopened={closedTargetId:old.targetId,targetId:fresh.targetId};assert.notEqual(old.targetId,fresh.targetId);
      }
      const expected={navigation:'E_DOCUMENT_REPLACED',revocation:'E_PERMISSION',stop:'E_CANCELLED',deadline:'E_TIMEOUT','host-close':'E_HOST_CLOSED'}[trigger];
      const invalidated=await until(async()=>{
        const snap=await snapshot(getTool().client,{runId}),run=snap.rows.runs.find(r=>r.value.runId===runId)?.value,result=snap.rows.results.find(r=>r.value.runId===runId)?.value;
        return ((run?.terminalReason?.code??run?.terminalReason)===expected||result?.outcome?.error?.code===expected)&&{run,result,at:Date.now()};
      },'Script fence real invalidation before releasing native continuation',trigger==='deadline'?40000:12000);
      triggerEvidence.invalidated=invalidated;
      await json(`${directory}/${variant.raw}-trigger.json`,{runId,revision,selected,bActive,before:{request:before.request,operation:before.pendingOperation,release:before.release},after:{request:after.request,operation:after.operation},aDuring,triggerEvidence});
      release(before);release(after);
      const actual=await durable(runId,getTool().client,true);retired=actual.run.retirementState==='released';
      const pageOperations=actual.snapshot.rows.commandJournal.filter(r=>r.value.tag==='controller-operation'&&r.value.runId===runId&&r.value.envelope?.operation.kind!=='service').map(r=>r.value);
      const aAfter={...await pageObservation(aPage),...await evaluate(aPage.client,'({proof:globalThis.__opendeskFenceProof,markerText:document.querySelector("#marker")?.textContent})')};
      if(stage==='after'){
        const operation=pageOperations[0];aAfter.effectDisposition={state:operation?.state,deliveryState:operation?.deliveryState,submissionCount:operation?.submissionCount,terminalError:actual.result.outcome?.error?.code};
        aAfter.conservativeEffectRecorded=pageOperations.length===1&&operation.submissionCount===1&&['effect_unknown','cancelled'].includes(operation.state)&&actual.result.outcome?.ok===false;
      }
      const view=trigger==='revocation'?{resultDeliveryRevoked:actual.run.resultDeliveryRevoked,readSkippedAfterActualRevocation:true}:await readUI(runId,getTool().client,getTool().targetId);
      const afterResources=await until(async()=>{
        const resources=await toolResources();
        return Object.entries(beforeResources.counts).every(([key,value])=>resources.counts[key]===value)&&resources;
      },'Script fence actual host settlement and six-resource baseline',12000);
      const o={selected,revision,admittedRun:initialRun,run:actual.run,result:actual.result,beforeResources,afterResources,bBefore,bAfter:{...await pageObservation(bPage),markerText:await evaluate(bPage.client,'document.querySelector("#marker")?.textContent')},bActive,beforeBarrier:{request:before.request,pendingOperation:before.pendingOperation,pendingArgs:before.pendingArgs,release:before.release,...(before.completedOperation?{completedOperation:before.completedOperation}:{})},afterBarrier:stage==='after'?{request:after.request,operation:after.operation,release:after.release,documentId:selected.documentId}:undefined,
        triggerAt:{stage,trigger,runId,at:trigger==='deadline'?initialRun.deadlineAt:triggerAt},aDuring,aAfter,hostReopened,pageOperations,triggerEvidence};
      await json(`${directory}/${variant.raw}-observation.json`,o);
      const oracle=validateScriptFenceOracle(plan,o);
      Object.assign(variant,{status:'PASS',runId,resultId:actual.result.resultId,oracle,retirement:actual.run.retirementState});
      await json(`${directory}/${variant.raw}-result.json`,{variant,view,formalAccepted:false});
    } catch(error){variant.error=errorView(error);Object.assign(variant,nativeFailureOutcome(error));throw error;}
    finally {
      release(before);release(after);originalBarriers.delete(token);originalBarriers.delete(after.token);
      if(runId&&!retired&&getTool().client.isOpen){
        try{const client=getTool().client,run=(await snapshot(client,{runId})).rows.runs.find(r=>r.value.runId===runId)?.value;
          if(run&&await evaluate(client,'!document.querySelector("#script-stop").disabled'))await click(client,getTool().targetId,'#script-stop');
          const terminal=await durable(runId,getTool().client,true);retired=terminal.run.retirementState==='released';
          await json(`${directory}/${variant.raw}-cleanup.json`,{terminal,retired});
        }catch(error){await json(`${directory}/${variant.raw}-cleanup-unresolved.json`,errorView(error));}
      }
      if(retired||!startAttempted){for(const page of [aPage,bPage])if(browserClient.isOpen&&(await targets()).some(t=>t.targetId===page.id))await browserClient.send('Target.closeTarget',{targetId:page.id});}
      else variant.retainedTargets=[aPage.id,bPage.id];
    }
  }
  return {originalCaseId:SCRIPT_FENCE_ID,variants:row.nativeVariants,nativeVariantSelection:row.nativeVariantSelection,fullOriginalCaseCovered:row.nativeVariantSelection.complete,formalAccepted:false};
}
