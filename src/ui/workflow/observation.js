import {permissionPattern} from '../../environment.js';
import {agentSameTarget,agentTargetFromSnapshot} from '../../native-agent/protocol.js';
import {decodeValue} from '../../platform/page-port/codec.js';
import {digestUtf8} from '../../platform/protocol.js';

// The only Browser tool available to the Agent. Its code and budget are bundled,
// never supplied by the model. All execution belongs to the original RunHost.
export const WORKFLOW_OBSERVE_SOURCE='async function main() {\n  return await page.observe({maxNodes:24,maxChars:4000});\n}\n';
const error=(code,message)=>Object.assign(new Error(message),{code});
export function createWorkflowObservation({api=globalThis.chrome,host,currentPageTarget,onRunOwner=()=>{},onRunId=()=>{}}) {
  let disposed=false,active=null,epoch=0;
  const used=new Set();
  async function cancel() {
    epoch++;
    const row=active;
    if(row?.runId&&host.currentRun===row.runId)
      await host.stop({controller:true,runId:row.runId,reason:'E_CANCELLED'});
  }
  async function observe(target,{signal,requestId}={}) {
    if(disposed||active||host.executionPending||host.currentRun)throw error('E_OWNER','原 RunHost 正忙或已关闭');
    if(typeof requestId!=='string'||!/^[a-zA-Z0-9._:-]{1,100}$/.test(requestId)||used.has(requestId))
      throw error('E_AI_APPROVAL','观察请求无效或已经使用；不会重复执行');
    if(used.size>=64)throw error('E_AI_LIMIT','本次 Sidebar 的观察次数已达上限');
    const captured=currentPageTarget.capture();
    if(!agentSameTarget(agentTargetFromSnapshot(captured),target))throw error('E_DOCUMENT_STALE','请求的网页已变化，请重新规划');
    used.add(requestId);
    const row={epoch:++epoch,runId:null};active=row;onRunOwner('pending');
    const assertLive=()=>{if(disposed||signal?.aborted||active!==row||row.epoch!==epoch)throw error('E_CANCELLED','页面观察已取消');};
    const aborted=()=>{void cancel().catch(()=>{});};
    signal?.addEventListener('abort',aborted,{once:true});
    try {
      assertLive();
      if(!await api.permissions.contains({origins:[permissionPattern(captured.url)]}))throw error('E_PERMISSION','请先允许读取这个网站');
      assertLive();await currentPageTarget.revalidate(captured);assertLive();
      const sourceHash=await digestUtf8(WORKFLOW_OBSERVE_SOURCE);assertLive();
      const claim=await host.start({source:{kind:'draft',sourceUtf8:WORKFLOW_OBSERVE_SOURCE},params:{},requestId,
        target:{mode:'borrowed',tabId:captured.tabId,frameId:0,documentId:captured.documentId,
          expectedUrl:captured.url,expectedWindowId:captured.windowId},deadlineAt:Date.now()+15000});
      row.runId=claim.runId;onRunId(claim.runId);onRunOwner(claim.runId);
      if(disposed||signal?.aborted||row.epoch!==epoch){await host.stop({controller:true,runId:claim.runId,reason:'E_CANCELLED'});assertLive();}
      const completed=await host.completion;assertLive();
      if(completed?.state==='paused_unknown'||completed?.pendingSettlement)throw error('E_AI_OUTCOME_UNKNOWN','观察结果或收尾状态未知；不会重放');
      const view=await host.controller.snapshotControllerRun({runId:claim.runId});assertLive();
      const result=view?.results?.find(item=>item.runId===claim.runId);
      if(!result?.resultId||!result.outcome?.ok)throw error(result?.outcome?.error?.code||'E_AI_RECEIPT','没有成功的原 Controller 持久观察结果');
      if(claim.revision?.sourceHash!==sourceHash||result.revision?.sourceHash!==sourceHash)
        throw error('E_AI_RECEIPT','原 Controller 的观察源码哈希不匹配');
      const value=decodeValue(result.outcome.valueWire);
      if(value?.kind!=='semantic-dom-summary'||value.document?.documentId!==captured.documentId||value.document?.url!==captured.url||
        !Array.isArray(value.nodes)||value.nodes.length>24)throw error('E_AI_RECEIPT','观察摘要或文档回执不匹配');
      await currentPageTarget.revalidate(captured);assertLive();
      if(!await api.permissions.contains({origins:[permissionPattern(captured.url)]}))throw error('E_PERMISSION','网站授权已撤销，摘要未发送');
      assertLive();
      // Send only the separately approved semantic nodes. Omit document URL
      // and unrelated request/history fields; page text can still be sensitive.
      const receipt={format:'opendesk.workflow-observation.v1',runId:claim.runId,resultId:result.resultId,sourceHash,
        summary:{kind:value.kind,origin:captured.origin,nodes:value.nodes,truncated:value.truncated===true}};
      if(new TextEncoder().encode(JSON.stringify(receipt)).length>12*1024)throw error('E_AI_LIMIT','观察摘要超过发送上限');
      return receipt;
    } finally {
      signal?.removeEventListener('abort',aborted);
      if(active===row)active=null;
      if(!row.runId||host.currentRun!==row.runId){onRunId(null);onRunOwner(null);}
    }
  }
  return {observe,cancel,dispose(){if(disposed)return;disposed=true;void cancel().catch(()=>{});},get activeRunId(){return active?.runId||null;}};
}
