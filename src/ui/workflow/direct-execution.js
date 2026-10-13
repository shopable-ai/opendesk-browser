import {validateWorkflow,validateWorkflowParams} from '../../framework/workflow/contract.js';

const error=(code,message)=>Object.assign(new Error(message),{code});
const targetFields=['windowId','tabId','frameId','documentId','url','origin'];
const highImpact=/(?:付款|支付|购买|下单|结账|转账|提现|删除|永久移除|清空|注销|发布|群发|发送邮件|退款|修改密码|重设密码|pay(?:ment)?|purchase|checkout|transfer\s+money|delete|remove\s+account|reset\s+password|send\s+email)/i;
const fillIntent=/(?:填入|填写|输入|填上|填到|设置输入框|\b(?:fill|type|enter)\b)/i;
const clickIntent=/(?:点击|点开|按下|打开|跳转|搜索|选择|提交|下一步|\b(?:click|open|navigate|search|submit|select|press)\b)/i;

// Admission for existing RunHost only; never execute arbitrary generated JS.
export function prepareDirectExecution({request,workflow,target}) {
  const clean=validateWorkflow(workflow);
  if(typeof request!=='string'||!request.trim()||request.length>4000)
    throw error('E_AI_REQUEST','任务描述无效');
  if(!target||!targetFields.every(key=>Object.hasOwn(target,key))||
    target.frameId!==0||target.origin!==clean.siteOrigin)
    throw error('E_DOCUMENT_STALE','当前网页身份已变化，未执行');
  let url;
  try{url=new URL(target.url);}catch{}
  if(!url||!['http:','https:'].includes(url.protocol)||url.origin!==clean.siteOrigin)
    throw error('E_WORKFLOW_ORIGIN','只允许在当前授权网站执行');
  // Navigation invalidates the originally admitted DocumentId.
  if(clean.steps.some(step=>step.op==='navigate'||step.op==='confirm'))
    throw error('E_AI_REVIEW_REQUIRED','本轮暂不自动执行跳转或交互确认');
  if(highImpact.test(request)&&clean.steps.some(step=>['fill','click'].includes(step.op)))
    throw error('E_AI_REVIEW_REQUIRED','涉及敏感或难以撤销的操作，未自动执行');
  if(fillIntent.test(request)&&!clickIntent.test(request)&&clean.steps.some(step=>step.op==='click'))
    throw error('E_AI_UNREQUESTED_ACTION','本次只要求填写，模型额外生成点击；已拒绝');
  if(fillIntent.test(request)&&!clean.steps.some(step=>step.op==='fill'))
    throw error('E_AI_MISSING_ACTION','用户要求填写，模型没有返回填写步骤');
  if(clean.steps.some(step=>step.op==='click')&&!clickIntent.test(request))
    throw error('E_AI_UNREQUESTED_ACTION','用户没有明确请求点击');
  if(clean.steps.some(step=>step.op==='click'&&
    /(删除|付款|支付|清空|注销|结账|delete|remove|pay|checkout|purchase|send[-_ ]?mail)/i
      .test([step.selector,step.roleName].filter(Boolean).join(' '))))
    throw error('E_AI_REVIEW_REQUIRED','模型选择了潜在不可撤销的点击，未执行');
  const params=validateWorkflowParams(clean,{});
  for(const step of clean.steps)if(step.op==='fill') {
    const value=step.param?params[step.param]:step.text;
    if(typeof value!=='string'||!value.length||!request.includes(value))
      throw error('E_AI_VALUE_NOT_GROUNDED','填写内容不在本次用户请求中，拒绝自行猜测');
  }
  return {params,hasReadback:clean.steps.some(step=>step.op==='fill'),
    hasUnprovenClick:clean.steps.some(step=>step.op==='click')&&!clean.steps.some(step=>step.op==='assert')};
}
export function verifyDirectExecutionReceipt({claim,completed,view,sourceHash,target}) {
  const runId=claim?.runId,run=view?.run,result=view?.results?.find(item=>item?.runId===runId);
  if(!runId||completed?.state==='paused_unknown'||completed?.pendingSettlement||
    completed?.state!=='completed'||completed?.retirement?.state!=='released'||
    run?.runId!==runId||run.state!=='completed'||run.workerRetired!==true||
    run.retirementState!=='released'||run.target?.documentId!==target.documentId||
    run.target?.allowedOrigin!==target.origin||
    claim.revision?.sourceHash!==sourceHash||run.revision?.sourceHash!==sourceHash||
    result?.revision?.sourceHash!==sourceHash||!result?.resultId||result.runId!==runId)
    throw error('E_AI_OUTCOME_UNKNOWN','运行结果、文档、源码或 Worker 收尾无法共同核对；不会自动重试');
  if(result.outcome?.ok!==true)
    throw error(result.outcome?.error?.code||'E_WORKFLOW_RUN','浏览器操作失败；不会自动重放');
  return {runId,resultId:result.resultId,sourceHash};
}
