import {invariant,canonical} from '../protocol.js';

// One shared Authority slot, no Page RunHost or invented Controller runId.
export function createPreviewAdmission({storage,assertHost,currentHost,session}) {
  return {
    async reserve(preview,sender) {
      const host=await assertHost(sender);
      await storage.transaction(['runs','commandJournal'],'readwrite',async tx=>{
        await currentHost(tx,host,sender);
        const slot=await tx.get('runs','@slot');
        invariant(!slot?.currentRunId&&!slot?.preview,'E_OWNER','执行入口被占用；未知的页面执行须关闭原标签页后再继续');
        await tx.put('runs',{...(slot||{tag:'slot',currentRunId:null}),preview:{...preview,registrationId:host.registrationId}},'@slot');
      });
    },
    async reserveInstalled(preview,installation) {
      // The same slot is used by Controller, developer previews and installed
      // Page scripts. This internal call cannot manufacture a Host identity.
      await storage.transaction(['runs','frameworkKV'],'readwrite',async tx=>{
        const grant=await tx.get('frameworkKV','page-installed:'+canonical([installation.namespace,installation.programId]));
        invariant(grant?.tag==='page-installed-v1'&&grant.enabled===true&&
          grant.token===installation.token&&grant.manifestHash===installation.manifestHash&&
          grant.sourceHash===preview.sourceHash,'E_PERMISSION','页面脚本已停用或安装版本已经改变');
        const execution=await tx.get('frameworkKV',installation.executionKey);
        invariant(execution?.tag==='page-execution-v1'&&execution.state==='prepared'&&
          execution.browserSessionIncarnation===session&&execution.installationToken===grant.token&&
          execution.manifestHash===grant.manifestHash&&execution.sourceHash===preview.sourceHash&&
          execution.documentId===preview.documentId&&execution.tabId===preview.tabId,
          'E_OWNER','页面执行准入身份已经改变');
        const slot=await tx.get('runs','@slot');
        invariant(!slot?.currentRunId&&!slot?.preview,'E_OWNER','已有执行占用共享入口；不会自动重试页面脚本');
        await tx.put('runs',{...(slot||{tag:'slot',currentRunId:null}),preview:{...preview,
          installedProgramId:grant.programId,manifestHash:grant.manifestHash,
          executionKey:installation.executionKey,browserSessionIncarnation:session}},'@slot');
        await tx.put('frameworkKV',{...execution,receiptNonce:preview.nonce},installation.executionKey);
      });
    },
    async release({nonce,removedTabId}) {
      await storage.transaction(['runs'],'readwrite',async tx=>{
        const slot=await tx.get('runs','@slot');
        if(slot?.preview&&(nonce&&slot.preview.nonce===nonce||removedTabId!==undefined&&slot.preview.tabId===removedTabId)){
          delete slot.preview;await tx.put('runs',slot,'@slot');
        }
      });
    }
  };
}
