import {createEntitlementService} from '../../platform/entitlement/index.js';
import {createTargetService} from '../../platform/target/index.js';
import {createPagePortService, validatePlan} from '../../platform/page-port/index.js';
import {invariant, newId, projectCommand} from '../../platform/protocol.js';

// Explicit business registration injects this descriptor into the existing broker.
// It consumes the broker's one storage, authority and download service.
export function createScrapingBackground({subject} = {}) {
  invariant(typeof subject === 'string' && subject.length > 0,'E_ENTITLEMENT','A bound template subject is required');
  return Object.freeze({validatePlan,
    createEntitlement:({storage,clock}) => createEntitlementService({storage,clock,subject}),
    attach({storage,api,session,authority,downloads,entitlement,emitToHost,background}) {
      const targets=createTargetService({storage,api,session,assertHost:authority.assertHost});
      const pagePort=createPagePortService({storage,api,session,targetService:targets,assertHost:authority.assertHost,
        admitIdentity:authority.admitIdentity,emitToHost});
      const routes={
    claimRun:(p,s)=>authority.claimRun(p,s),
    snapshotRun:(p,s)=>authority.snapshotRun(p,s),
    prepareCommand:(p,s)=>authority.prepareCommand(p,s),
    async dispatchCommand(p,s) {
      const authorization = await authority.authorizeDispatch(p,s);
      if (authorization.call) background(pagePort.executeCommand(projectCommand(authorization.command))
        .catch(async error=>{await authority.markUnknown(authorization.command,error);throw error;}));
      return {accepted:true,state:authorization.command.state};
    },
    stopRun:(p,s)=>authority.stopRun(p,s),
    abandonUnknown:(p,s)=>authority.abandonUnknown(p,s),
    finishRun:(p,s)=>authority.finishRun(p,s),
    createTarget:(p,s)=>targets.createTarget(p,s),
    reconcileTargetCreation:(p,s)=>targets.reconcileTargetCreation(p,s),
    bindTarget:(p,s)=>targets.bindTarget(p,s),
    retireTarget:(p,s)=>targets.retireTarget(p,s),
    ackPageFrame:(p,s)=>pagePort.ackPageFrame(p,s),
    ackSourceFrame:(p,s)=>pagePort.ackSourceFrame(p,s),
    openSourceContext:(p,s)=>pagePort.openSourceContext(p,s),
    startSourceSelection:(p,s)=>pagePort.startSourceSelection(p,s),
    cancelSourceSelection:(p,s)=>pagePort.cancelSourceSelection(p,s),
    releaseSourceContext:(p,s)=>pagePort.releaseSourceContext(p,s),
    async previewSource(p,s) {
      const stream = await pagePort.previewSource(p,s);
      const host = await authority.assertHost(s);
      background((async()=>{for await (const frame of stream) await emitToHost(host.registrationId,frame);})());
      return {accepted:true,selectionId:p.context.selectionId,requestId:p.requestId};
    },
    async saveTemplate(p) {
      const snapshot = await entitlement.getSnapshot();
      return storage.saveTemplate(p,{admitTemplate:({templateId,tx})=>entitlement.admitTemplate({templateId,tx,snapshot})});
    },
    listTemplates:p=>storage.listTemplates(p),
    getTemplateRevision:p=>storage.getTemplateRevision(p),
    renameTemplate:p=>storage.renameTemplate(p),
    beginPage:p=>storage.beginPage(p),
    stagePageBatch:p=>storage.stagePageBatch(p),
    sealPage:p=>storage.sealPage(p),
    readRecords:p=>storage.readRecords(p),
    openReaderPin:p=>storage.openReaderPin(p),
    releaseReaderPin:p=>storage.releaseReaderPin(p),
    prepareExport:(p,s)=>downloads.prepareExport(p,s),
    retryExport:(p,s)=>downloads.retryExport(p,s),
    abandonExport:(p,s)=>downloads.abandonExport(p,s),
    getEntitlementSnapshot:()=>entitlement.getSnapshot(),
    entitlementStatus:()=>entitlement.status(),
    installEntitlement:p=>entitlement.install(p),
    revokeEntitlement:p=>entitlement.revoke(p),
    async deleteRun(p,s) {
      invariant(p.explicitUserAction === true, 'E_OWNER', 'Deletion needs an explicit user action');
      let run = await storage.transaction(['runs'], 'readonly', tx=>tx.get('runs',p.runId));
      invariant(run && !run.tombstoned,'E_TOMBSTONE','Run unavailable');
      if (run.retirementState !== 'released') {
        const retired = await authority.abandonUnknown({runId:p.runId,expectedRunRevision:run.runRevision,requestId:newId(),userExplicit:true},s);
        const result = await targets.retireTarget({retirementId:retired.retirementId},s);
        invariant(result.slotReleased === true,'E_EFFECT_UNKNOWN','Target retirement still unresolved');
      }
      await downloads.abandonRun({runId:p.runId},s);
      return storage.deleteRun(p);
    }
      };
      return Object.freeze({routes,targets,pagePort,
        bootstrapReady:(payload,sender)=>targets.bootstrapReady(payload,sender),
        agentReady:(payload,sender)=>targets.agentReady(payload,sender),
        handleAgentMessage:(message,sender)=>pagePort.handleAgentMessage(message,sender),
        reconcileRetirements:()=>targets.reconcileRetirements(),
        invalidateHost:registrationId=>pagePort.invalidateHost(registrationId)});
    }
  });
}
