// Exact one-shot continuation provenance for a previously retained owned tab.
// Generic Controller infrastructure only: no site selectors, Task authorization,
// approval, account binding, or implicit retry are granted here.
import {canonical,invariant} from '../protocol.js';
import {RETAIN_ON_SUCCESS} from './controller-target-retention.js';

export const retainedContinuationKey=runId=>`controller-retained-continuation:${runId}`;

export function assertRetainedControllerContinuation({
  previous,retainedFrom,selection,observed,installedTask,current,host,session
}={}){
  const retained=previous?.retainedTarget,original=previous?.target;
  const previousTask=previous?.installedTaskAuthorization;
  const installation=installedTask?.installation;
  const auth=installation?.authorization,priorAuth=previousTask?.authorization;
  const samePrincipal=previous?.principal!==undefined&&host?.principal!==undefined&&
    canonical(previous.principal)===canonical(host.principal);
  invariant(previous?.tag==='controller-run'&&
    previous.runId===retainedFrom?.runId&&previous.requestId===retainedFrom?.requestId&&
    previous.namespace===host?.namespace&&samePrincipal&&
    previous.browserSessionIncarnation===session&&
    original?.browserSessionIncarnation===session&&
    previous.sourceKind==='saved'&&previous.targetDisposition===RETAIN_ON_SUCCESS&&
    previous.selection?.mode==='owned'&&original?.mode==='owned'&&
    previous.state==='completed'&&previous.retirementState==='released'&&
    previous.workerRetired===true&&
    typeof previous.retirementId==='string'&&previous.retirementId.length>0&&
    previous.scriptId===current?.scriptId&&previous.contentHash===current?.contentHash&&
    previous.revision?.scriptId===current.scriptId&&
    previous.revision?.sourceHash===current.contentHash&&
    previous.revision?.revision===installedTask?.candidate?.package?.manifest?.program?.revision&&
    previousTask?.taskId===installation?.taskId&&
    previousTask?.version===installation.version&&
    previousTask?.manifestHash===installation.manifestHash&&
    priorAuth?.installationId===auth?.installationId&&
    Number.isSafeInteger(priorAuth?.generation)&&priorAuth.generation>0&&
    priorAuth.generation===auth?.generation&&
    selection?.mode==='borrowed'&&selection.frameId===0&&
    typeof selection.expectedUrl==='string'&&selection.expectedUrl.length>0&&
    original.frameId===0&&original.tabId===selection.tabId&&
    original.documentId===selection.documentId&&
    retained?.tabId===selection.tabId&&retained.documentId===selection.documentId&&
    retained.origin===original.allowedOrigin&&
    retained.url===selection.expectedUrl&&
    observed?.tabId===selection.tabId&&observed.frameId===0&&
    observed.documentId===selection.documentId&&
    observed.allowedOrigin===retained.origin&&observed.url===retained.url,
    'E_TARGET_CONTINUATION','Retained source Run, immutable installation, or exact document changed');
  return Object.freeze({runId:previous.runId,requestId:previous.requestId});
}
