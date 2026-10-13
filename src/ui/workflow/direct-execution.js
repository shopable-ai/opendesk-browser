import {validateWorkflow,validateWorkflowParams} from '../../framework/workflow/contract.js';

const error=(code,message)=>Object.assign(new Error(message),{code});
const targetFields=['windowId','tabId','frameId','documentId','url','origin'];
const highImpact=/(?:付款|支付|购买|下单|结账|转账|提现|确认订单|提交订单|删除|永久移除|清空|注销|发布|群发|发送(?:邮件|消息)|发消息|退款|修改(?:密码|账号)|重设密码|pay(?:ment)?|purchase|checkout|transfer\s+money|delete|remove\s+account|reset\s+password|send\s+(?:email|message)|post\s+(?:comment|message)|confirm\s+order)/i;
const riskyClickTarget=/(?:付款|支付|购买|下单|结账|转账|删除|清空|注销|发布|发送|退款|密码|订单确认|支付确认|pay|purchase|checkout|transfer|delete|remove|reset.?password|send.?mail|send.?message|submit|提交|confirm.?order|logout|publish|billing)/i;
const fillIntent=/(?:填入|填写|输入|填上|填到|写入|写在|设为|放入|设置输入框|\b(?:fill|type|enter)\b)/i;
const clickIntent=/(?:点击|点开|按下|打开|跳转|搜索|提交|下一步|选择(?:按钮|菜单|选项|标签|条目|项目)|\b(?:click|open|navigate|search|submit|select|press)\b)/i;
const readIntent=/(?:查看|读取|提取|显示|观察|检查网页|页面内容|\b(?:read|extract|observe|inspect|show)\b)/i;

// Admission for the existing RunHost only. Model output is never executable code,
// a Chrome origin grant, or authority to exceed the user's requested actions.
export function prepareDirectExecution({request,workflow,target}) {
  const clean=validateWorkflow(workflow);
  if(typeof request!=='string'||!request.trim()||request.length>4000)
    throw error('E_AI_REQUEST','任务描述无效');
  if(!target||!targetFields.every(key=>Object.hasOwn(target,key))||
    !Number.isSafeInteger(target.windowId)||!Number.isSafeInteger(target.tabId)||
    typeof target.documentId!=='string'||!target.documentId||
    target.frameId!==0||target.origin!==clean.siteOrigin)
    throw error('E_DOCUMENT_STALE','当前网页身份已变化，未执行');
  let url;
  try{url=new URL(target.url);}catch{}
  if(!url||!['http:','https:'].includes(url.protocol)||url.origin!==clean.siteOrigin||
    url.username||url.password)
    throw error('E_WORKFLOW_ORIGIN','只允许在当前授权网站执行');

  // Navigation or interactive confirmation invalidates the originally admitted
  // document/authorization model. These remain separate product milestones.
  if(clean.steps.some(step=>step.op==='navigate'||step.op==='confirm'))
    throw error('E_AI_REVIEW_REQUIRED','本轮暂不自动执行跳转或交互确认');
  const fills=clean.steps.filter(step=>step.op==='fill');
  const clicks=clean.steps.filter(step=>step.op==='click');
  const reads=clean.steps.filter(step=>step.op==='observe'||step.op==='extract');
  if(highImpact.test(request)&&(fills.length||clicks.length))
    throw error('E_AI_REVIEW_REQUIRED','涉及敏感或难以撤销的操作，未自动执行');
  if(clicks.length>1)
    throw error('E_AI_REVIEW_REQUIRED','本轮不自动执行多次点击，请拆分为明确的任务');
  if(clicks.some(step=>riskyClickTarget.test([step.selector,step.roleName].filter(Boolean).join(' '))))
    throw error('E_AI_REVIEW_REQUIRED','模型选择了潜在不可撤销的点击，未执行');

  const params=validateWorkflowParams(clean,{});
  const values=[];
  for(const step of fills) {
    const value=step.param?params[step.param]:step.text;
    if(typeof value!=='string'||!value.length||!request.includes(value))
      throw error('E_AI_VALUE_NOT_GROUNDED','填写内容不在本次用户请求中，拒绝自行猜测');
    values.push(value);
  }
  // A fill literal is *data*, not authority. For example, the "选择" in
  // "ai自动化第一选择" must not authorize a model-invented extra click.
  const instruction=values.reduce((text,value)=>text.replace(value,''),request);
  if(fillIntent.test(instruction)&&!fills.length)
    throw error('E_AI_MISSING_ACTION','用户要求填写，模型没有返回填写步骤');
  if(fills.length&&!fillIntent.test(instruction))
    throw error('E_AI_UNREQUESTED_ACTION','本次未要求填写，模型额外生成填写动作');
  if(clicks.length&&!clickIntent.test(instruction))
    throw error('E_AI_UNREQUESTED_ACTION','本次未要求点击，模型额外生成点击动作');
  if(reads.length&&!readIntent.test(instruction))
    throw error('E_AI_UNREQUESTED_ACTION','本次未要求读取页面，模型额外生成网页读取动作');

  return {params,hasReadback:fills.length>0,
    hasUnprovenClick:clean.steps.some((step,index)=>step.op==='click'&&
      !clean.steps.slice(index+1).some(next=>next.op==='assert'))};
}

// A RunHost completion is not automatically a successful web-page effect.
// Bind all independently durable run/result/revision/document identities and
// the released Worker/target before presenting a verified success to the user.
export function verifyDirectExecutionReceipt({claim,completed,view,sourceHash,target}) {
  const runId=claim?.runId,run=view?.run;
  const result=view?.results?.find(item=>item?.runId===runId);
  const targetMatches=target&&run?.target&&claim?.target&&
    ['windowId','tabId','frameId','documentId','url'].every(key=>
      run.target[key]===target[key]&&claim.target[key]===target[key])&&
    run.target.allowedOrigin===target.origin&&claim.target.allowedOrigin===target.origin;
  if(!runId||!claim?.resultId||!targetMatches||
    completed?.runId!==runId||completed?.pendingSettlement||
    completed?.retirement?.state!=='released'||
    completed?.result?.runId!==runId||completed.result?.resultId!==claim.resultId||
    run?.runId!==runId||run.workerRetired!==true||run.retirementState!=='released'||
    run.resultId!==claim.resultId||result?.resultId!==claim.resultId||
    completed.result?.state!==run.state||result?.state!==run.state||
    claim.revision?.sourceHash!==sourceHash||run.revision?.sourceHash!==sourceHash||
    completed.result?.revision?.sourceHash!==sourceHash||result?.revision?.sourceHash!==sourceHash||
    !['completed','failed','stopped','interrupted'].includes(run?.state)||
    completed?.state!==run.state)
    throw error('E_AI_OUTCOME_UNKNOWN','运行结果、文档、源码或 Worker 收尾无法共同核对；不会自动重试');
  if(run.state!=='completed'||result.outcome?.ok!==true||completed.result.outcome?.ok!==true)
    throw error(result.outcome?.error?.code||'E_WORKFLOW_RUN','浏览器操作失败或被停止；不会自动重放');
  return {runId,resultId:result.resultId,sourceHash};
}
