// SW-only lifecycle manager for the fixed Offscreen RunHost document.
// Execution, Provider claims, permission gates, and durable Run/Result stay
// owned by the EXISTING Controller and Cloud Authority, never this helper.
import {CLOUD_RUNNER_DOCUMENT_PATH} from '../tool-document-url.js';

export function createCloudRunnerLifecycle({api=globalThis.chrome}={}){
  if(typeof api?.runtime?.getURL!=='function'||
     typeof api?.runtime?.getContexts!=='function'||
     typeof api?.offscreen?.createDocument!=='function'||
     typeof api?.offscreen?.closeDocument!=='function')
    throw Error('E_CLOUD_RUNNER_NATIVE_API');

  // Serialize STOP/UNPAIR against a concurrent APPROVE, then inspect the
  // latest durable state on each pass. Do not coalesce away a newer request.
  let queue=Promise.resolve();
  async function reconcileNow(broker){
    const cloud=broker?.authority?.cloud;
    if(typeof cloud?.read!=='function'||typeof broker?.storage?.transaction!=='function')
      throw Error('E_CLOUD_RUNNER_CONTRACT');
    const enabled=(await cloud.read())?.enabled===true;
    const documentUrl=api.runtime.getURL(CLOUD_RUNNER_DOCUMENT_PATH);
    const contexts=await api.runtime.getContexts({
      contextTypes:['OFFSCREEN_DOCUMENT'],documentUrls:[documentUrl]
    });
    if(!Array.isArray(contexts)||contexts.length>1||
       contexts.some(context=>context.contextType!=='OFFSCREEN_DOCUMENT'||
         context.documentUrl!==documentUrl))
      throw Error('E_CLOUD_RUNNER_CONTEXT');

    if(enabled){
      if(contexts.length===1)return {state:'ready'};
      await api.offscreen.createDocument({
        url:CLOUD_RUNNER_DOCUMENT_PATH,reasons:['WORKERS'],
        justification:'Execute already-approved Controller Tasks after closing the Side Panel'
      });
      return {state:'created'};
    }
    if(!contexts.length)return {state:'absent'};

    // STOP fences the Run before signalling its Host. Closing the document
    // while @slot is occupied would abandon Controller retirement/result
    // settlement and could turn a known effect into OUTCOME_UNKNOWN.
    const slot=await broker.storage.transaction(['runs'],'readonly',
      tx=>tx.get('runs','@slot'));
    if(slot?.currentRunId||slot?.preview)return {state:'retained-pending'};

    // State may have changed while IndexedDB was read; recheck the current
    // approval before a global chrome.offscreen.closeDocument() operation.
    if((await cloud.read())?.enabled===true)return {state:'ready'};
    await api.offscreen.closeDocument();
    return {state:'closed'};
  }
  function reconcile(broker){
    const operation=queue.catch(()=>{}).then(()=>reconcileNow(broker));
    queue=operation;
    return operation;
  }
  return Object.freeze({reconcile});
}
