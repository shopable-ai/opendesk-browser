// A bounded, observation-driven continuation guard for WorkflowView.
// No Chrome privilege, Provider, Compiler, scheduler or RunHost is owned here.
const fault=(code,message)=>Object.assign(new Error(message),{code});
const terminalUnknown=code=>/(?:UNKNOWN|TIMEOUT|SETTLEMENT|DISCONNECT|WORKER)/i.test(code||'');
const actions=step=>({op:step.op,locatorKind:step.locatorKind||'',selector:step.selector||'',
  roleName:step.roleName||'',param:step.param||'',text:step.text||'',url:step.url||''});
function goalFulfilled(goal,facts){
  // A prohibition in the user's own request is not a positive completion
  // condition (e.g. "填写搜索框，不要点击搜索").
  const affirmed=goal.replace(/(?:不要|不需|无需|不得|别|禁止|勿|do\s+not|don't|never)\s*(?:点击|按下|提交|搜索|查找|检索|跳转|打开|进入|填写|填入|输入|press|click|submit|search|open|navigate|fill|type)[^，,。；;\n]*/gi,'');
  const price=/(?:价格|标价|售价|价钱|\bprice\b)/i.test(affirmed);
  const details=/(?:商品详情|商品页面|详情页|\bproduct\s*(?:page|detail)\b)/i.test(affirmed);
  const open=/(?:打开|进入|点开|跳转|点击(?:.*?)(?:链接|结果)|\b(?:open|navigate)\b)/i.test(affirmed);
  const search=/(?:搜索(?!框|栏|关键词|输入框|词)|查找(?!输入框|框)|检索(?!词|框)|\bsearch\b(?!\s+(?:keyword|input|field|box|term)\b))/i.test(affirmed);
  const fill=/(?:填写|填入|输入|\bfill\b|\btype\b)/i.test(affirmed);
  const read=/(?:查看|读取|提取|读回|核对|观察|检查|\b(?:read|extract|verify|observe|inspect|check)\b)/i.test(affirmed);
  const product=facts.has('product-page'),link=product||facts.has('link-page');
  // A combined user goal is a conjunction, not "whichever fact happens first".
  // Search and fill are independently required when the user named both;
  // a product detail can satisfy a requested read of that detail.
  const required=[];
  if(price||details)required.push(product);
  else if(open)required.push(link);
  if(search)required.push([...facts].some(value=>value.startsWith('search-')));
  if(fill)required.push(facts.has('input-readback'));
  if(read&&!open&&!price&&!details&&!search&&!fill)
    required.push(facts.has('read-only'));
  return required.length>0&&required.every(Boolean);
}
export function createWorkflowAgentLoopGuard({goal,signal,clock=Date.now,limits={}}={}) {
  if(typeof goal!=='string'||!goal.trim()||goal.length>4000)
    throw fault('E_AGENT_GOAL','工作流目标不明确，请补充具体操作对象');
  const cap={rounds:Math.min(8,Math.max(1,limits.rounds||8)),
    actions:Math.min(24,Math.max(1,limits.actions||24)),
    durationMs:Math.min(480000,Math.max(1,limits.durationMs||480000))};
  const start=clock(),issued=new Set(),facts=new Set(),states=[];
  let rounds=0,actionCount=0,lastError=null;
  function check(){
    if(signal?.aborted)throw signal.reason?.code?signal.reason:
      fault('E_CANCELLED','已停止后续 AI 与网页操作');
    if(clock()-start>=cap.durationMs)
      throw fault('E_AGENT_LIMIT','任务已到达八分钟上限，已完成的网页变化不会自动回滚');
  }
  function claim({workflow,target}={}){
    check();
    if(!workflow||!Array.isArray(workflow.steps)||!workflow.steps.length||
      workflow.steps.length>4)
      throw fault('E_AGENT_SCHEMA','每轮只允许一至四个受限步骤');
    if(rounds>=cap.rounds||actionCount+workflow.steps.length>cap.actions)
      throw fault('E_AGENT_LIMIT','已达连续决策或操作数量上限，不再继续执行');
    // Do not include model-generated step IDs or Document IDs: renamed
    // locators and navigation must not allow a repeated write on another page.
    const signature=JSON.stringify([target?.origin,workflow.steps.map(actions)]);
    if(issued.has(signature))
      throw fault('E_AGENT_NO_PROGRESS','相同网页操作已经尝试；已停止，避免重复写入或点击');
    issued.add(signature);rounds++;actionCount+=workflow.steps.length;
    return Object.freeze({signature,round:rounds,actions:workflow.steps.length,
      readOnly:workflow.steps.every(step=>['observe','extract','assert','wait'].includes(step.op))});
  }
  function verified({claim:ticket,reply}={}){
    check();
    if(!ticket||!issued.has(ticket.signature))throw fault('E_AGENT_STATE','执行票据未登记');
    const code=reply?.error?.code;
    if(!reply?.ok){
      const state=terminalUnknown(code)||!code?'OUTCOME_UNKNOWN':'PARTIAL';
      return {state,completed:false,reason:state==='OUTCOME_UNKNOWN'
        ?'操作结果未知，已停止且绝不自动重放'
        :'已有步骤可能生效，当前执行失败，不再重放'};
    }
    if(reply.evidenceLevel==='BUSINESS_EFFECT_VERIFIED'){
      if(reply.readbackVerified===true)facts.add('input-readback');
      if(typeof reply.effect?.kind==='string')facts.add(reply.effect.kind);
    } else if(ticket.readOnly&&reply.evidenceLevel==='EXECUTION_RECEIPT_VERIFIED'&&
      reply.readOnlyVerified===true)facts.add('read-only');
    else return {state:'PARTIAL',completed:false,reason:'执行回执已核对，但网页效果尚未独立确认，不继续写入'};
    const completed=goalFulfilled(goal,facts);
    return {state:completed?'COMPLETED':'CONTINUE',completed,
      facts:[...facts],reason:completed?'原始目标已由独立网页结果核验':'仅部分目标已确认，需重新观察并规划'};
  }
  function observed({target,receipt,remaining='',errorCode=null}={}){
    check();
    const summary=receipt?.summary;
    if(!summary||!Array.isArray(summary.nodes)||!target||
      summary.origin!==target.origin||summary.documentId!==target.documentId)
      throw fault('E_AGENT_OBSERVATION','无法证明本轮观察来自当前网页，停止继续');
    const state=JSON.stringify({target:[target.origin,target.documentId,target.url],
      nodes:summary.nodes.map(row=>[row.role,row.name,row.text,row.locator,row.state?.visible]),
      completed:[...facts].sort(),remaining,errorCode});
    states.push(state);if(states.length>4)states.shift();
    const n=states.length;
    if(n>=3&&states[n-1]===states[n-2]&&states[n-2]===states[n-3]||
      n>=4&&states[n-1]===states[n-3]&&states[n-2]===states[n-4])
      throw fault('E_AGENT_NO_PROGRESS','连续观察没有可验证进展（或出现交替重复），已提前停止');
    if(errorCode&&lastError===errorCode)
      throw fault('E_AGENT_NO_PROGRESS','重复发生同一错误，停止盲目重试');
    lastError=errorCode;
    return {rounds,actionCount,remainingRounds:cap.rounds-rounds,
      remainingActions:cap.actions-actionCount,facts:[...facts]};
  }
  function snapshot(){return Object.freeze({rounds,actionCount,facts:[...facts],
    remainingRounds:cap.rounds-rounds,remainingActions:cap.actions-actionCount});}
  return Object.freeze({claim,verified,observed,check,snapshot});
}
