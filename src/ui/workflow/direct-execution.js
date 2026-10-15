import {validateWorkflow,validateWorkflowParams} from '../../framework/workflow/contract.js';

const error=(code,message)=>Object.assign(new Error(message),{code});
const targetFields=['windowId','tabId','frameId','documentId','url','origin'];
const highImpact=/(?:付款|支付|购买|下单|结账|转账|提现|确认订单|提交订单|删除|永久移除|清空|注销|发布|群发|发送(?:邮件|消息)|发消息|退款|修改(?:密码|账号)|重设密码|pay(?:ment)?|purchase|checkout|transfer\s+money|delete|remove\s+account|reset\s+password|send\s+(?:email|message)|post\s+(?:comment|message)|confirm\s+order)/i;
const riskyClickTarget=/(?:付款|支付|购买|下单|结账|转账|删除|清空|注销|发布|发送|退款|密码|订单确认|支付确认|pay|purchase|checkout|transfer|delete|remove|reset.?password|send|submit|提交|confirm.?order|logout|publish|billing)/i;
const fillIntent=/(?:填入|填写|输入|填上|填到|写入|写在|设为|放入|设置输入框|\b(?:fill|type|enter)\b)/i;
const clickIntent=/(?:点击|点开|按下|打开|跳转|搜索(?!关键词|框|栏|输入框|结果|页面|记录|历史|列表)|提交|下一步|选择(?:按钮|菜单|选项|标签|条目|项目)|\bsearch\b(?!\s+(?:keyword|input|field|box)\b)|\b(?:click|open|navigate|submit|select|press)\b)/i;
const readIntent=/(?:查看(?:页面|网页|内容|结果)?|读取|提取|显示(?:页面|内容|结果)|观察|检查网页|页面内容|\b(?:read|extract|observe|inspect|show)\b)/i;

// Admission for the existing RunHost only. Model output is never executable code,
// a Chrome origin grant, or authority to exceed the user's requested actions.
export function prepareDirectExecution({request,workflow,target,observation}) {
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
  if(clean.steps.some(step=>step.op==='assert'&&fills.some(fill=>
    step.locatorKind===fill.locatorKind&&step.selector===fill.selector&&
    (step.locatorKind!=='role'||(step.roleName||'')===(fill.roleName||'')))))
    throw error('E_AI_ASSERT_TARGET','输入值应读回，不能断言输入框文本');
  const clicks=clean.steps.filter(step=>step.op==='click');
  const reads=clean.steps.filter(step=>step.op==='observe'||step.op==='extract');
  // Search terms and other fill literals are data. Sensitive *instructions*
  // are denied, while merely typing a risky-sounding word remains possible.
  const literalValues=fills.map(step=>step.text)
    .filter(value=>typeof value==='string'&&value.length&&request.includes(value));
  const requestIntent=literalValues.reduce((text,value)=>text.replace(value,''),request);
  if(highImpact.test(requestIntent)&&(fills.length||clicks.length))
    throw error('E_AI_REVIEW_REQUIRED','涉及敏感或难以撤销的操作，未自动执行');
  if(clicks.length>1)
    throw error('E_AI_REVIEW_REQUIRED','本轮不自动执行多次点击，请拆分为明确的任务');
  // The click must be the last action in the frozen Controller. Any post-click
  // read uses a separately authorized, freshly bound observation; an old
  // Document must never license a second action after navigation.
  if(clicks.length&&clean.steps.at(-1)!==clicks[0])
    throw error('E_AI_REVIEW_REQUIRED','点击后的读取需重新绑定网页；请先完成本次点击');
  const params=validateWorkflowParams(clean,{});
  const values=[];
  for(const step of fills) {
    const value=step.param?params[step.param]:step.text;
    if(typeof value!=='string'||!value.length||!request.includes(value))
      throw error('E_AI_VALUE_NOT_GROUNDED','填写内容不在本次用户请求中，拒绝自行猜测');
    const quoted=[['"','"'],["'","'"],['“','”'],['‘','’'],['「','」'],['『','』']]
      .some(([open,close])=>request.includes(open+value+close));
    if(!quoted&&/[。.!！?？]$/.test(value)&&request.trim().endsWith(value))
      throw error('E_AI_VALUE_NOT_GROUNDED','模型把指令的句末标点包含在填写内容中，未执行');
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
  if(clickIntent.test(instruction)&&!clicks.length)
    throw error('E_AI_MISSING_ACTION','用户要求点击，模型没有返回点击步骤');
  const summary=observation?.summary;
  const observedSearch=step=>step.locatorKind==='css'&&
    summary?.origin===target.origin&&summary.documentId===target.documentId&&
    !riskyClickTarget.test(step.selector.replace(/submit/ig,''))&&
    summary.nodes?.some(node=>node.role==='button'&&/^(?:搜索|search)$/i.test(node.name)&&
      node.state?.visible&&node.locator?.kind==='css'&&node.locator.value===step.selector&&
      !node.locator.parent&&node.locator.index===undefined);
  if(clicks.some(step=>riskyClickTarget.test([step.selector,step.roleName].filter(Boolean).join(' '))&&
    (!observedSearch(step)||riskyClickTarget.test(step.roleName||''))))
    throw error('E_AI_REVIEW_REQUIRED','模型选择了潜在不可撤销的点击，未执行');
  if(reads.length&&!readIntent.test(instruction))
    throw error('E_AI_UNREQUESTED_ACTION','本次未要求读取页面，模型额外生成网页读取动作');

  const searchButton=step=>{
    if(!summary||summary.origin!==target.origin||summary.documentId!==target.documentId)return false;
    if(step.locatorKind==='css')return observedSearch(step);
    if(step.locatorKind!=='role'||step.selector!=='button'||
      !/^(?:搜索|search)$/i.test(step.roleName||''))return false;
    return summary.nodes?.some(node=>node.role==='button'&&node.name===step.roleName&&
      node.state?.visible===true&&node.locator?.kind==='role'&&
      node.locator.value==='button'&&node.locator.name===step.roleName&&
      !node.locator.parent&&node.locator.index===undefined)===true;
  };
  // Only a one-query, one-click, observed Search button can opt in to a
  // read-only effect check. No model-authored assert is promoted to an oracle.
  const query=fills.length===1?values[0]:null;
  const effectExpectation=clicks.length===1&&fills.length===1&&
    typeof query==='string'&&query.trim().length>=2&&query.length<=120&&
    /(?:搜索|查找|检索|\bsearch\b)/i.test(instruction)&&searchButton(clicks[0])
      ?{kind:'search-results-v1',query}:null;
  return {params,hasReadback:fills.length>0,hasUnprovenClick:clicks.length>0,effectExpectation};
}

// A generated fill script compares inputValue() in the same RunHost execution.
// Independently check the decoded durable value, not merely a successful status.
export function verifyDirectFillReadbacks({workflow,params={},values}={}) {
  const fills=workflow?.steps?.filter(step=>step.op==='fill')||[];
  if(!fills.length||!values||typeof values!=='object'||Array.isArray(values))return false;
  return fills.every(step=>{
    const expected=step.param?params[step.param]:step.text;
    const row=Object.hasOwn(values,step.stepId)?values[step.stepId]:null;
    return expected!==undefined&&row?.kind==='input-readback'&&row.matched===true&&
      typeof row.value==='string'&&row.value===String(expected);
  });
}

// This oracle proves only a visible, query-related search-result *state*.
// It does not prove relevance, server persistence, or an arbitrary click.
// Both summaries must come from separately verified, read-only RunHost receipts.
export function verifySearchBusinessEffect({expectation,before,after,actionTarget,resultTarget}={}) {
  if(expectation?.kind!=='search-results-v1'||typeof expectation.query!=='string')return null;
  const query=expectation.query.trim().toLocaleLowerCase();
  if(query.length<2||query.length>120||!before?.summary||!after?.summary||
    before.format!=='opendesk.workflow-observation.v1'||!before.runId||!before.resultId||!before.sourceHash||
    after.format!=='opendesk.workflow-observation.v1'||!after.runId||!after.resultId||!after.sourceHash||
    !Array.isArray(before.summary.nodes)||!Array.isArray(after.summary.nodes)||
    after.summary.nodes.length>24||!actionTarget||!resultTarget)return null;
  if(before.summary.origin!==actionTarget.origin||before.summary.documentId!==actionTarget.documentId||
    after.summary.origin!==resultTarget.origin||after.summary.documentId!==resultTarget.documentId||
    actionTarget.origin!==resultTarget.origin||actionTarget.windowId!==resultTarget.windowId||
    actionTarget.tabId!==resultTarget.tabId||resultTarget.frameId!==0)return null;
  let resultUrl;
  try{resultUrl=new URL(resultTarget.url);}catch{return null;}
  if(!['http:','https:'].includes(resultUrl.protocol)||resultUrl.origin!==actionTarget.origin)return null;
  const sameText=value=>typeof value==='string'&&value.trim().toLocaleLowerCase()===query;
  const urlQuery=['q','query','search','keyword','keywords','wd','s','term']
    .some(key=>resultUrl.searchParams.getAll(key).some(sameText));
  const visible=node=>node?.state?.visible===true;
  const label=node=>[node?.name,node?.text].filter(value=>typeof value==='string').join(' ').slice(0,400);
  const resultMarker=/搜索结果|查询结果|匹配结果|search results|results for/i;
  const emptyMarker=/没有(?:找到|搜索到|匹配)|未找到|无搜索结果|0\s*(?:条|个)?(?:搜索)?结果|no results|nothing found/i;
  const mark=node=>visible(node)&&['heading','region','status','alert','list'].includes(node.role)&&
    (resultMarker.test(label(node))||emptyMarker.test(label(node)));
  // A same-document search may render a text result without new hyperlinks.
  // Require two independently observed website states: completion status and
  // the exact user-query result in a previously observed DOM container.
  // An LLM-generated assert or an unobserved result cannot be its oracle.
  const inlineText=value=>{
    if(typeof value!=='string')return false;
    const match=value.trim().match(/^(?:搜索结果|查询结果|结果|search results?|results?)\s*[:：]\s*(.+)$/i);
    return Boolean(match&&match[1].trim().toLocaleLowerCase()===query);
  };
  const inlineRow=node=>visible(node)&&node?.locator?.kind==='css'&&
    !node.locator.parent&&node.locator.index===undefined&&
    (node.role===null||['status','region','alert'].includes(node.role))&&
    [node.name,node.text].some(inlineText);
  const completion=node=>visible(node)&&['status','alert'].includes(node?.role)&&
    [node.name,node.text].some(value=>typeof value==='string'&&
      /^(?:搜索完成|查询完成|检索完成|search complete(?:d)?|search finished)$/i.test(value.trim()));
  if(resultTarget.documentId===actionTarget.documentId&&resultTarget.url===actionTarget.url&&
    after.summary.nodes.some(completion)&&
    after.summary.nodes.some(node=>inlineRow(node)&&before.summary.nodes.some(prior=>
      prior?.state?.visible===true&&prior?.locator?.kind==='css'&&
      JSON.stringify(prior.locator)===JSON.stringify(node.locator)&&
      ![prior.name,prior.text].some(inlineText)))) {
    return {kind:'search-inline'};
  }
  const beforeMarkers=new Set(before.summary.nodes.filter(mark).map(label));
  const markers=after.summary.nodes.filter(mark);
  const changed=markers.some(node=>!beforeMarkers.has(label(node)))||
    (actionTarget.documentId!==resultTarget.documentId&&actionTarget.url!==resultTarget.url);
  if(!changed||!markers.length||!(urlQuery||markers.some(node=>
    label(node).toLocaleLowerCase().includes(query))))return null;
  const previousLinks=new Set(before.summary.nodes.filter(node=>visible(node)&&node.role==='link')
    .map(node=>JSON.stringify([node.name,node.locator])));
  const newLinks=after.summary.nodes.filter(node=>visible(node)&&node.role==='link'&&
    typeof node.name==='string'&&node.name.trim().length>=3&&node.locator&&
    !previousLinks.has(JSON.stringify([node.name,node.locator])));
  if(newLinks.length)return {kind:'search-results',visibleResultLinks:newLinks.length};
  if(markers.some(node=>emptyMarker.test(label(node))))return {kind:'search-empty',visibleResultLinks:0};
  return null;
}

// Three independent levels: a durable receipt alone cannot prove click effects.
export function directExecutionEvidenceLevel({receiptVerified=false,hasReadback=false,
  hasUnprovenClick=false,searchEffectVerified=false}={}) {
  if(!receiptVerified)return 'PROPOSAL_VALID';
  if(searchEffectVerified||(hasReadback&&!hasUnprovenClick))return 'BUSINESS_EFFECT_VERIFIED';
  return 'EXECUTION_RECEIPT_VERIFIED';
}

// A stored script is still the same revision only if every independently
// durable source identity agrees. Used by AI-free manual runs as well.
export function verifySavedWorkflowRevision({source,claim,completed,view,result}={}) {
  if(source?.kind!=='saved'||typeof source.scriptId!=='string'||
    !Number.isSafeInteger(source.revision)||source.revision<=0||
    !/^[a-f0-9]{64}$/.test(source.contentHash||''))return false;
  return [claim?.revision,completed?.result?.revision,view?.run?.revision,result?.revision]
    .every(row=>row?.scriptId===source.scriptId&&row.revision===source.revision&&
      row.sourceHash===source.contentHash);
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
