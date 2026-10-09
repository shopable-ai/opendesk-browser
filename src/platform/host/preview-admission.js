import {invariant} from '../protocol.js';

// One shared Authority slot, no Page RunHost or invented Controller runId.
export function createPreviewAdmission({storage,assertHost,currentHost}) {
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
