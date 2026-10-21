import {permissionPattern} from '../../environment.js';
import {agentSameTarget,agentTargetFromSnapshot} from '../../native-agent/protocol.js';
import {decodeValue} from '../../platform/page-port/codec.js';
import {digestUtf8} from '../../platform/protocol.js';
import {verifyDirectExecutionReceipt} from './direct-execution.js';

// The only Browser tool available to the Agent. Its code and budget are bundled,
// never supplied by the model. All execution belongs to the original RunHost.
export const WORKFLOW_OBSERVE_SOURCE=String.raw`async function main() {
  const first=await page.observe({maxNodes:12,maxChars:2600});
  const rows=[...first.nodes],seen=new Set(rows.map(row=>JSON.stringify(row.locator)));
  const query=String(params.request||'').replace(/\s+/g,'').slice(0,4000);
  let truncated=first.truncated===true;
  if(query){
    const regions=page.locator('section[id],form[id]'),count=await regions.count();
    if(count>12)truncated=true;
    for(let i=0;i<Math.min(count,12)&&rows.length<24;i++){
      const id=await regions.nth(i).getAttribute('id');
      if(!/^[A-Za-z][\w-]{0,79}$/.test(id||''))continue;
      const part=await page.observe({root:'[id='+JSON.stringify(id)+']',maxDepth:7,maxNodes:14,maxChars:2400});
      // A planning request may contain a short control label ("搜索"), while
      // a post-click effect observation may contain only the search term.
      // Match bounded, visible result text containing that term as well.
      const match=row=>row?.state?.visible===true&&[row.name,row.text].some(value=>{
        if(typeof value!=='string')return false;
        const text=value.replace(/\s+/g,'').toLocaleLowerCase();
        const term=query.toLocaleLowerCase();
        return text.length>=2&&text.length<=120&&
          (text.length<=40&&term.includes(text)||
            term.length>=2&&term.length<=120&&text.includes(term));
      });
      if(!part.nodes.some(match))continue;
      for(const row of [...part.nodes].sort((a,b)=>Number(match(b))-Number(match(a)))){
        if(!row.locator||row.locator.parent||row.state?.visible!==true)continue;
        const key=JSON.stringify(row.locator);
        if(seen.has(key))continue;
        if(rows.length>=24){truncated=true;break;}
        seen.add(key);rows.push(row);
      }
      if(part.truncated)truncated=true;
    }
  }
  return {...first,nodes:rows,truncated};
}
`;
const error=(code,message)=>Object.assign(new Error(message),{code});
// One existing session-scoped observation grant, not a second permission store.
// Recipient identity is a SHA-256 of the exact provider, endpoint and model:
// never persist a credential-bearing HTTPS URL in chrome.storage.session.
export async function workflowObservationRecipientId({selected,endpoint,model}={}) {
  if(selected==='local_codex')return 'local_codex';
  let url;
  try{url=new URL(endpoint);}catch{}
  if(!['cloud_responses','custom_https'].includes(selected)||
    !url||url.protocol!=='https:'||url.username||url.password||url.hash||
    typeof model!=='string'||!model.trim())
    throw error('E_AI_CONFIG','AI 接收方范围无效');
  return selected+':'+await digestUtf8(JSON.stringify([endpoint,model]));
}
export function workflowObservationGrantMatches(grant,row,now=Date.now()) {
  const local=row?.selected==='local_codex';
  if(!local&&!['cloud_responses','custom_https'].includes(row?.selected))return false;
  // Local-Codex grants issued before R23.17 had no explicit recipient fields.
  // Such legacy grants never authorize sharing with an HTTPS receiver.
  const legacyLocal=local&&grant&&grant.provider===undefined&&
    grant.recipientId===undefined&&grant.receiverPattern===undefined;
  return Boolean(grant&&row&&typeof row.sessionId==='string'&&row.sessionId&&
    typeof row.captured?.origin==='string'&&row.captured.origin&&
    typeof row.recipientId==='string'&&row.recipientId&&
    grant.sessionId===row.sessionId&&grant.origin===row.captured.origin&&
    grant.scope==='semantic-dom-summary-v1'&&
    (grant.provider===row.selected||legacyLocal)&&
    (grant.recipientId===row.recipientId||legacyLocal)&&
    (local?grant.receiverPattern==null:
      typeof row.receiverPattern==='string'&&row.receiverPattern.length>0&&
      grant.receiverPattern===row.receiverPattern)&&
    Number.isSafeInteger(grant.approvedAt)&&Number.isSafeInteger(grant.expiresAt)&&
    Number.isSafeInteger(now)&&grant.approvedAt<=now&&grant.expiresAt>now&&
    grant.expiresAt-grant.approvedAt===30*60*1000);
}

export function createWorkflowObservation({api=globalThis.chrome,host,currentPageTarget,onRunOwner=()=>{},onRunId=()=>{}}) {
  let disposed=false,active=null,epoch=0;
  const used=new Set();
  async function cancel() {
    epoch++;
    const row=active;
    if(row?.runId&&host.currentRun===row.runId)
      await host.stop({controller:true,runId:row.runId,reason:'E_CANCELLED'});
  }
  async function observe(target,{signal,requestId,request=''}={}) {
    if(disposed||active||host.executionPending||host.currentRun)throw error('E_OWNER','原 RunHost 正忙或已关闭');
    if(typeof requestId!=='string'||!/^[a-zA-Z0-9._:-]{1,100}$/.test(requestId)||used.has(requestId))
      throw error('E_AI_APPROVAL','观察请求无效或已经使用；不会重复执行');
    if(typeof request!=='string'||request.length>4000)throw error('E_AI_REQUEST','观察任务描述无效');
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
      const claim=await host.start({source:{kind:'draft',sourceUtf8:WORKFLOW_OBSERVE_SOURCE},params:request?{request}:{},requestId,
        target:{mode:'borrowed',tabId:captured.tabId,frameId:0,documentId:captured.documentId,
          expectedUrl:captured.url,expectedWindowId:captured.windowId},deadlineAt:Date.now()+15000});
      row.runId=claim.runId;onRunId(claim.runId);onRunOwner(claim.runId);
      if(disposed||signal?.aborted||row.epoch!==epoch){await host.stop({controller:true,runId:claim.runId,reason:'E_CANCELLED'});assertLive();}
      const completed=await host.completion;assertLive();
      if(completed?.state==='paused_unknown'||completed?.pendingSettlement||completed?.retirement?.state!=='released')throw error('E_AI_OUTCOME_UNKNOWN','观察结果或收尾状态未知；不会重放');
      const view=await host.controller.snapshotControllerRun({runId:claim.runId});assertLive();
      // Observe is a real Controller execution: match its claim, complete
      // terminal, durable result, exact page target, source hash and retired
      // Worker just as strictly as a direct browser action.
      const proof=verifyDirectExecutionReceipt({claim,completed,view,sourceHash,target:captured});
      const result=view.results.find(item=>item.runId===proof.runId);
      const value=decodeValue(result.outcome.valueWire);
      if(value?.kind!=='semantic-dom-summary'||value.document?.documentId!==captured.documentId||value.document?.url!==captured.url||
        !Array.isArray(value.nodes)||value.nodes.length>24)throw error('E_AI_RECEIPT','观察摘要或文档回执不匹配');
      await currentPageTarget.revalidate(captured);assertLive();
      if(!await api.permissions.contains({origins:[permissionPattern(captured.url)]}))throw error('E_PERMISSION','网站授权已撤销，摘要未发送');
      assertLive();
      // Send only the separately approved semantic nodes. Omit document URL
      // and unrelated request/history fields; page text can still be sensitive.
      const receipt={format:'opendesk.workflow-observation.v1',runId:proof.runId,resultId:proof.resultId,
        sourceHash:proof.sourceHash,
        summary:{kind:value.kind,origin:captured.origin,documentId:captured.documentId,
          nodes:value.nodes,truncated:value.truncated===true}};
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
