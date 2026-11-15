// A bounded, observation-driven continuation guard for WorkflowView.
// No Chrome privilege, Provider, Compiler, scheduler or RunHost is owned here.
import {isWorkflowSearchControl,requiresWorkflowSearchControls} from './direct-execution.js';
import {requiresOrderedSearchResults,verifyOrderedSearchResults} from './ordered-search-results.js';
const fault=(code,message)=>Object.assign(new Error(message),{code});
const terminalUnknown=code=>/(?:UNKNOWN|TIMEOUT|SETTLEMENT|DISCONNECT|WORKER)/i.test(code||'');
const actions=step=>({op:step.op,locatorKind:step.locatorKind||'',selector:step.selector||'',
  roleName:step.roleName||'',param:step.param||'',text:step.text||'',url:step.url||'',
  ...(step.waitUntil?{waitUntil:step.waitUntil,timeout:step.timeout??15000}:{}),
  ...(step.searchNavigation?{searchNavigation:step.searchNavigation}:{})});
const positiveGoal=goal=>goal.replace(/(?:不要|不需|无需|不得|别|禁止|勿|do\s+not|don't|never)\s*(?:点击|按下|提交|搜索|查找|检索|跳转|打开|进入|填写|填入|输入|查看|读取|提取|读回|观察|检查|press|click|submit|search|open|navigate|fill|type|read|extract|observe|inspect|check)[^，,。；;\n]*/gi,'');
const searchIntent=/(?:搜索(?!按钮|控件|框|栏|关键词|输入框|词|结果|页面|历史|记录|列表)|查找(?!输入框|框)|检索(?!词|框)|\bsearch\b(?!\s+(?:keyword|input|field|box|term|results?)\b))/i;
// This refinement applies to an explicit control-identification read, not
// ordinary page reads or a request to fill/submit a search.
function missingSearchControls(ticket,values){
  let input=false,button=false;
  for(const step of ticket.steps||[]){
    const value=values?.[step.stepId];
    if(step.op!=='observe'||value?.kind!=='semantic-dom-summary'||
      !ticket.documentId||value.document?.documentId!==ticket.documentId||
      !Array.isArray(value.nodes))continue;
    try{if(new URL(value.document.url).origin!==ticket.origin)continue;}
    catch{continue;}
    for(const node of value.nodes){
      if(node?.state?.visible!==true||typeof node.locator?.kind!=='string'||
        !node.locator.kind.trim()||typeof node.locator.value!=='string'||
        !node.locator.value.trim())continue;
      const searchName=/(?:搜索|查找|检索|\bsearch\b)/i.test(node.name||'');
      input ||= node.role==='searchbox'||
        ['textbox','combobox'].includes(node.role)&&searchName;
      button ||= node.role==='button'&&searchName;
    }
  }
  return [!input&&'搜索输入框',!button&&'搜索按钮'].filter(Boolean);
}
function goalFulfilled(goal,facts){
  // A prohibition in the user's own request is not a positive completion
  // condition (e.g. "填写搜索框，不要点击搜索").
  const affirmed=positiveGoal(goal);
  const price=/(?:价格|标价|售价|价钱|\bprice\b)/i.test(affirmed);
  const details=/(?:商品详情|商品页面|详情页|\bproduct\s*(?:page|detail)\b)/i.test(affirmed);
  // Arriving at the search results is the search effect, not an additional
  // result-link click. Keep independently named links as navigation targets.
  const actionsGoal=affirmed.replace(/(?:打开|进入|跳转(?:到|至)?)\s*搜索结果(?:页面|页)(?=$|[，,。；;\n]|(?:并|然后|再)(?:读取|查看|提取|告诉|核对))|\b(?:open|navigate\s+to)\s+(?:the\s+)?search\s+results?(?:\s+page)?(?=$|[,.;\n]|\s+and\s+(?:read|extract|inspect|tell)\b)/gi,'');
  const open=/(?:打开|进入|点开|跳转|点击(?:.*?)(?:链接|结果)|\b(?:open|navigate)\b)/i.test(actionsGoal);
  const search=searchIntent.test(affirmed);
  const fill=/(?:填写|填入|输入(?!框|栏|区|控件|字段)|\bfill\b|\btype\b)/i.test(affirmed);
  const read=/(?:查看|读取|提取|读回|核对|观察|检查|\b(?:read|extract|verify|observe|inspect|check)\b)/i.test(affirmed);
  const product=facts.has('product-page'),link=product||facts.has('link-page');
  // The same effect category does not prove two independently named targets.
  // Fail closed on coordinated objects instead of declaring the first one
  // "completed" merely because its generic category became true.
  const fragments=actionsGoal.split(/[，,。；;\n]/);
  const explicitFillCount=fragments.filter(value=>/(?:填写|填入|输入(?!框|栏|区|控件|字段)|\b(?:fill|type)\b)/i.test(value)).length;
  const explicitOpenCount=fragments.filter(value=>/(?:打开|进入|点开|跳转|\b(?:open|navigate)\b)/i.test(value)).length;
  const explicitSearchCount=fragments.filter(value=>searchIntent.test(value)).length;
  const multiOpen=explicitOpenCount>=2||fragments.some(part=>
    /(?:打开|进入|点开|点击|访问|\b(?:open|visit|click)\b)[^，,。；;]{1,100}(?:和|与|以及|\band\b)[^，,。；;]{1,100}/i.test(part)&&
    !/(?:和|与|以及|\band\b)\s*(?:检查|核对|查看|读取|搜索|验证|\b(?:read|check|verify|search)\b)/i.test(part));
  const multiFill=explicitFillCount>=2||fragments.some(part=>
    (/(?:填写|填入|输入(?!框|栏|区|控件|字段)|\b(?:fill|type)\b)[^，,。；;]{1,100}(?:和|与|以及|\band\b)[^，,。；;]{1,100}/i.test(part)&&
    !/(?:和|与|以及|\band\b)\s*(?:检查|核对|查看|读取|搜索|打开|点击|\b(?:read|check|verify|search|open|click)\b)/i.test(part))||
    /(?:填写|填入|输入)[^，,。；;]{1,100}(?:并且|然后|再)(?:填写|填入|输入)/i.test(part));
  // A combined user goal is a conjunction, not "whichever fact happens first".
  // Search and fill are independently required when the user named both;
  // a product detail can satisfy a requested read of that detail.
  const required=[];
  if(requiresOrderedSearchResults(goal))required.push(facts.has('ordered-search-results'));
  if(price||details)required.push(product);
  else if(open)required.push(link);
  if(search)required.push([...facts].some(value=>value.startsWith('search-')));
  if(fill)required.push(facts.has('input-readback'));
  if(multiOpen)required.push([...facts].filter(value=>value.startsWith(
    price||details?'product-target:':'link-target:')).length>=2);
  if(multiFill)required.push([...facts].filter(value=>value.startsWith('fill-target:')).length>=2);
  if(explicitSearchCount>=2)
    required.push([...facts].filter(value=>value.startsWith('search-target:')).length>=2);
  // A separately requested page inspection is not satisfied by an input
  // readback. Search/product reads already have independent effect oracles.
  const standalonePageRead=/(?:查看|读取|观察|检查)(?:当前|新的|目标)?(?:页面|网页|页面内容|网页内容)|\b(?:observe|inspect)\s+(?:the\s+)?(?:page|document)\b/i.test(affirmed);
  if(read&&!open&&!price&&!details&&!search&&
    (standalonePageRead||!fill))required.push(facts.has('read-only'));
  return required.length>0&&required.every(Boolean);
}
// Pure projection of one Workflow-owned Stop. An unresolved RunHost.start
// can still dispatch a write after Stop, even if no runId exists yet.
export function classifyWorkflowAgentStop({stopRejected=false,runActive=false,
  startPending=false,executionPending=false,startedCount=0}={}) {
  if(stopRejected||runActive||startPending||executionPending)return 'OUTCOME_UNKNOWN';
  return startedCount>0?'PARTIAL':'STOPPED';
}
export function createWorkflowAgentLoopGuard({goal,signal,clock=Date.now,limits={}}={}) {
  if(typeof goal!=='string'||!goal.trim()||goal.length>4000)
    throw fault('E_AGENT_GOAL','工作流目标不明确，请补充具体操作对象');
  const cap={rounds:Math.min(8,Math.max(1,limits.rounds||8)),
    actions:Math.min(24,Math.max(1,limits.actions||24)),
    durationMs:Math.min(480000,Math.max(1,limits.durationMs||480000))};
  const start=clock(),issued=new Set(),confirmed=new Set(),facts=new Set(),states=[];
  let rounds=0,actionCount=0,lastError=null;
  function check(){
    if(signal?.aborted)throw signal.reason?.code?signal.reason:
      fault('E_CANCELLED','已停止后续 AI 与网页操作');
    if(clock()-start>=cap.durationMs)
      throw fault('E_AGENT_LIMIT','任务已到达八分钟上限，已完成的网页变化不会自动回滚');
  }
  // Prevent verified effects being replayed under a new step ID, Document
  // or group. Only the original Controller marks an effect verified.
  const identity=(origin,step)=>JSON.stringify([origin,actions(step)]);
  const fieldIdentity=(origin,step)=>JSON.stringify(
    [origin,step.locatorKind||'',step.selector||'',step.roleName||'']);
  const isObservedSearch=(step,observation,target)=>
    step.op==='click'&&(
      step.locatorKind==='role'&&step.selector==='button'&&
        isWorkflowSearchControl(step.roleName)||
      Boolean(observation?.summary&&target)&&observation.summary.origin===target.origin&&
      observation.summary.documentId===target.documentId&&
      observation.summary.nodes?.some(node=>node.role==='button'&&
        isWorkflowSearchControl(node.name)&&node.state?.visible===true&&
        node.locator?.kind===step.locatorKind&&node.locator?.value===step.selector&&
        (step.locatorKind!=='role'||node.locator.name===step.roleName))
    );
  function claim({workflow,target,observation,linkGuard,params={}}={}){
    check();
    if(!workflow||!Array.isArray(workflow.steps)||!workflow.steps.length||
      workflow.steps.length>4)
      throw fault('E_AGENT_SCHEMA','每轮只允许一至四个受限步骤');
    if(rounds>=cap.rounds||actionCount+workflow.steps.length>cap.actions)
      throw fault('E_AGENT_LIMIT','已达连续决策或操作数量上限，不再继续执行');
    // Replay parameter values are validated by the existing Workflow
    // admission. Resolve only for effect identity, never mutate frozen code.
    const steps=workflow.steps.map(step=>step.op==='fill'&&step.param&&
      params&&Object.hasOwn(params,step.param)?
      {...step,text:String(params[step.param])}:step);
    const requested=goal.toLocaleLowerCase().replace(/\s+/g,' ');
    const freshSearch=steps.some(step=>{
      if(step.op!=='fill'||typeof step.text!=='string'||!step.text.trim())return false;
      const value=step.text.trim().toLocaleLowerCase();
      return !facts.has('search-target:'+value)&&
        ['搜索','查找','检索','search'].some(verb=>
          requested.includes(verb+' '+value)||requested.includes(verb+value));
    });
    if(steps.some(step=>['fill','click'].includes(step.op)&&
      confirmed.has(identity(target?.origin,step))&&
      !(freshSearch&&isObservedSearch(step,observation,target))))
      throw fault('E_AGENT_NO_PROGRESS','该填写或点击已独立核验，不得拆分后重复执行');
    if([...facts].some(value=>value.startsWith('search-'))&&!freshSearch&&
      steps.some(step=>isObservedSearch(step,observation,target)))
      throw fault('E_AGENT_NO_PROGRESS','搜索结果已核验，不再重复点击搜索按钮');
    // Do not include model-generated step IDs or Document IDs: renamed
    // locators and navigation must not allow a repeated write on another page.
    const signature=JSON.stringify([target?.origin,steps.map(actions)]);
    if(issued.has(signature))
      throw fault('E_AGENT_NO_PROGRESS','相同网页操作已经尝试；已停止，避免重复写入或点击');
    issued.add(signature);rounds++;actionCount+=workflow.steps.length;
    return Object.freeze({signature,round:rounds,actions:workflow.steps.length,
      origin:target?.origin,documentId:target?.documentId,url:target?.url,
      steps:steps.map((step,index)=>({...actions(step),stepId:workflow.steps[index].stepId})),linkName:linkGuard?.name||null,
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
    if(reply.effect?.kind==='ordered-search-results'){
      const ordered=ticket.readOnly&&reply.readOnlyVerified===true&&
        reply.evidenceLevel==='BUSINESS_EFFECT_VERIFIED'&&
        verifyOrderedSearchResults({workflow:{steps:ticket.steps},
          values:reply.readbackValues,target:ticket,request:goal});
      if(!ordered||JSON.stringify(ordered)!==JSON.stringify(reply.effect)||
        searchIntent.test(positiveGoal(goal))&&
        !facts.has('search-target:'+ordered.query.trim().toLocaleLowerCase()))
        return {state:'PARTIAL',completed:false,
          reason:'前三条结果的文档、查询、顺序或排除广告规则无法共同核对，已停止'};
      facts.add('ordered-search-results');facts.add('read-only');
    } else if(reply.evidenceLevel==='BUSINESS_EFFECT_VERIFIED'){
      if(reply.effect?.kind==='product-page'&&(
        typeof reply.effect.name!=='string'||!reply.effect.name.trim()||
        !goal.toLocaleLowerCase().includes(reply.effect.name.toLocaleLowerCase())||
        !/^(?:¥|￥|\$|€)\s?\d{1,9}(?:\.\d{1,2})?$/.test(reply.effect.price||'')))
        return {state:'PARTIAL',completed:false,
          reason:'商品名称或价格不能与原始目标及读回结果共同核对，停止继续'};
      if(reply.readbackVerified===true)facts.add('input-readback');
      if(typeof reply.effect?.kind==='string')facts.add(reply.effect.kind);
      if(['search-results','search-empty','search-inline'].includes(reply.effect?.kind)){
        const query=ticket.steps?.find(step=>step.op==='fill'&&typeof step.text==='string')?.text;
        if(query?.trim())facts.add('search-target:'+query.trim().toLocaleLowerCase());
      }
      const name=String(reply.effect?.name||ticket.linkName||
        ticket.steps?.find(step=>step.op==='click'&&step.selector==='link')?.roleName||'')
        .trim().toLocaleLowerCase();
      if(name&&goal.toLocaleLowerCase().includes(name)&&
        ['link-page','product-page'].includes(reply.effect?.kind)){
        facts.add('link-target:'+name);
        if(reply.effect.kind==='product-page')facts.add('product-target:'+name);
      }
      const clickVerified=['search-results','search-empty','search-inline',
        'link-page','product-page'].includes(reply.effect?.kind);
      for(const step of ticket.steps||[])if(
        step.op==='fill'&&reply.readbackVerified===true||
        step.op==='click'&&clickVerified){
        const key=identity(ticket.origin,step);
        confirmed.add(key);
        if(step.op==='fill')facts.add('fill-target:'+fieldIdentity(ticket.origin,step));
      }
    } else if(ticket.readOnly&&reply.evidenceLevel==='EXECUTION_RECEIPT_VERIFIED'&&
      reply.readOnlyVerified===true){
      if(requiresWorkflowSearchControls(goal)){
        const missing=missingSearchControls(ticket,reply.readbackValues);
        if(missing.length)return {state:'PARTIAL',completed:false,
          reason:'只读回执已核对，但尚未实际读取到可见且有定位器的'+missing.join('和')+
            '，不能确认已识别目标；已停止，不重复同一无效观察'};
      }
      facts.add('read-only');
    }
    else return {state:'PARTIAL',completed:false,reason:'执行回执已核对，但网页效果尚未独立确认，不继续写入'};
    if(requiresOrderedSearchResults(goal)&&!facts.has('ordered-search-results'))
      return {state:ticket.readOnly?'PARTIAL':'CONTINUE',completed:false,facts:[...facts],
        reason:ticket.readOnly?'当前读取合同无法证明前三条自然结果的顺序、标题和网址；已停止，不重复搜索':
          '搜索状态已核验，下一段只读前三条自然结果；不得重复搜索'};
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
