// Strict projection of the existing authenticated cloudStatus() response.
// Never export credentials, server URL, executorId, target URL, task IDs, request IDs or run IDs.
const CONNECTION = new Set(['offline','connecting','authenticated','backoff']);
const REQUEST = new Set(['waiting','prepared','permitted','finished','cancelled','cancellation-pending','OUTCOME_UNKNOWN']);
const REVOCATION = new Set(['pending','confirmed']);
const revocationState = value => value==null?null:REVOCATION.has(value?.state)?value.state:'unknown';
const SITE_AUTHORIZATION = new Set(['granted','revoked','unknown','none']);
const SLOT = new Set(['available','preview','local-running','cloud-running','stopping','retirement-pending','outcome-unknown','unknown']);
const siteAuthorization = value => SITE_AUTHORIZATION.has(value)?value:'unknown';
const slotState = source => SLOT.has(source?.slotState)&&
  (source.slotState!=='available'||source.slotAvailable===true)?source.slotState:'unknown';
const SITE_LABELS=Object.freeze({granted:'目标网站已授权',revoked:'目标网站访问已撤销',unknown:'目标网站授权待核对',none:'尚无已批准网站范围'});
const SLOT_LABELS=Object.freeze({available:'空闲',preview:'预览占用','local-running':'本地任务运行中','cloud-running':'云任务运行中',
  stopping:'停止中，等待执行结束','retirement-pending':'等待资源释放','outcome-unknown':'原运行结果待核对，请勿重试',unknown:'执行槽状态待核对'});
const SLOT_WAITING=Object.freeze({preview:'等待预览结束及释放执行槽','local-running':'等待本地任务完成及资源释放',
  'cloud-running':'等待云任务完成及资源释放',stopping:'等待原运行停止及资源释放','retirement-pending':'等待原任务资源释放',
  'outcome-unknown':'原运行结果待核对，请勿重试',unknown:'执行槽状态待核对'});
export const cloudSiteAuthorizationLabel = value => SITE_LABELS[siteAuthorization(value)];
export const cloudSlotStateLabel = value => SLOT_LABELS[SLOT.has(value)?value:'unknown'];
const boundedCount = value => Math.min(Number.isSafeInteger(value) && value >= 0 ? value : 0, 999999);

export function projectCloudStatus(raw, {version='未知', capturedAt=new Date().toISOString(), hostOccupied=false}={}) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const rows = Array.isArray(source.requests) ? source.requests : [];
  const counts = Object.fromEntries([...REQUEST].map(name=>[name,0]));
  counts.other=0;
  let receipts=0, retired=0, unknownOutcomes=0;
  // Keep an upper bound on large historical journals; no raw request object survives projection.
  const sampled=rows.slice(-2000);
  for(const row of sampled){
    const state=REQUEST.has(row?.state)?row.state:'other';counts[state]++;
    if(row?.receipt != null)receipts++;
    if(row?.retirementState==='released')retired++;
    if(row?.outcomeUnknown===true)unknownOutcomes++;
  }
  return {
    schema:'opendesk.cloud-control.diagnostics.v1',capturedAt,
    extensionVersion:/^\d+(?:\.\d+){1,3}$/.test(String(version))?String(version):'未知',
    paired:Boolean(source.provider),enabled:source.enabled===true,
    revocation:revocationState(source.revocation),remoteSuspension:['pending','confirmed'].includes(source.remoteSuspension)?source.remoteSuspension:null,
    connection:CONNECTION.has(source.connection)?source.connection:'unknown',
    online:source.online===true,reconciled:source.reconciled===true,
    hostReady:source.hostReady===true,slotAvailable:slotState(source)==='available',
    siteAuthorization:siteAuthorization(source.siteAuthorization),slotState:slotState(source),
    pendingResources:typeof source.pendingResources==='boolean'?source.pendingResources:null,
    hostOccupied:Boolean(hostOccupied),approvedTasks:boundedCount(source.tasks?.length),
    requests:{total:boundedCount(source.requestTotal??rows.length),sampled:boundedCount(sampled.length),states:counts,
      receivedReceipts:boundedCount(receipts),releasedSlots:boundedCount(retired),unknownOutcomes:boundedCount(unknownOutcomes)}
  };
}

export function cloudHostingSummary(status){
  const resources=status.pendingResources===true?'仍有待处理资源，等待停止、核对及资源释放。':
    status.pendingResources===false?'':'待处理资源状态待核对。';
  const availability=hostingAvailabilitySummary(status),site=cloudSiteAuthorizationLabel(status.siteAuthorization);
  return availability+(availability.includes(site)?'':' '+site+'。')+(resources?' '+resources:'');
}

function hostingAvailabilitySummary(status){
  if(status.revocation==='pending')return '本机已停止；服务端撤销待确认。确认前不能重新配对。';
  if(status.revocation==='unknown')return '撤销状态待核对；暂不能确认可重新配对。';
  if(!status.paired&&status.revocation==='confirmed')return '本机已停止；服务端撤销已确认。可重新配对提供者。';
  if(!status.paired)return '未配对提供者。云端托管是浏览器内置能力；请先安装任务，再配对并批准明确范围。';
  if(!status.enabled&&status.remoteSuspension==='pending')return '本地已停止执行，但提供者尚未确认暂停；外部请求可能继续排队。';
  if(!status.enabled)return '已配对，托管已关闭。未启用任务授权，不会领取新任务。';
  if(!status.online)return '托管已启用，但提供者尚未连接。请检查网络和连接状态。';
  if(!status.reconciled)return '已连接提供者，正在对账；尚不能确认可执行。';
  if(!status.hostReady)return '连接和对账已完成；需要可用的浏览器执行宿主。';
  if(status.siteAuthorization==='revoked')return '目标网站访问已撤销，请恢复网站授权。';
  if(status.siteAuthorization==='none')return '尚无已批准网站范围，等待批准任务及网站范围。';
  if(status.siteAuthorization!=='granted')return '目标网站授权待核对；尚不能确认可执行。';
  if(!status.slotAvailable||status.slotState!=='available')return '连接与对账已完成；'+SLOT_WAITING[SLOT.has(status.slotState)?status.slotState:'unknown']+'。';
  if(status.pendingResources!==false)return '执行资源状态待核对；尚不能确认可执行。';
  return '托管已启用，连接和对账已完成；可等待已批准任务。';
}

const REQUEST_STATE_LABELS=Object.freeze({waiting:'等待执行',prepared:'已绑定任务',permitted:'已取得许可',finished:'已完成',cancelled:'已取消','cancellation-pending':'取消处理中',OUTCOME_UNKNOWN:'结果待核对'});
const RUN_STATE_LABELS=Object.freeze({preparing:'准备中',running:'运行中',stopping:'停止中',settling:'结果结算中',retiring:'资源回收中',completed:'已完成',failed:'失败',stopped:'已停止',interrupted:'已中断',paused_unknown:'结果待核对'});
const RETIREMENT_LABELS=Object.freeze({'not-started':'资源尚未释放',fenced:'资源释放中',released:'资源已释放'});
const REASON_LABELS=Object.freeze({E_CLOUD_CANCELLED:'云请求已取消或租约已到期',E_CLOUD_REVOKED:'本机托管授权已撤销',E_CLOUD_FENCED:'执行许可已失效',E_LEASE:'执行许可已到期',E_RUN_REF:'请求与原运行不一致',E_OUTCOME_UNKNOWN:'原执行副作用或结果待核对，暂不重试'});
const SAVED_RUN_STATES=new Set(['completed','failed','stopped','interrupted']);
const label=(labels,value,fallback)=>typeof value==='string'&&Object.hasOwn(labels,value)?labels[value]:fallback;

function requestProgress(row,status){
  if(!REQUEST.has(row?.state))return '请求状态待核对';
  if(row?.state==='OUTCOME_UNKNOWN'||row?.runState==='paused_unknown')return '执行结果待核对，暂不重试';
  if(row?.runState!=null&&!Object.hasOwn(RUN_STATE_LABELS,row.runState))return '执行状态待核对';
  if(row?.runState==='stopping')return '停止已请求，等待执行结束及资源释放';
  if(row?.state==='cancelled')return '请求已取消';
  if(SAVED_RUN_STATES.has(row?.runState)){
    const stopped=row.runState==='stopped';
    if(row.retirementState!=='released')return stopped?'执行已停止，等待资源释放':'结果已保存，等待资源释放';
    if(row.receipt==null)return '等待提供者确认回执';
    return stopped?'执行已停止':row.runState==='failed'?'执行失败，结果已保存':row.runState==='interrupted'?'执行已中断':'';
  }
  if(row?.state==='cancellation-pending')return '取消处理中，等待执行结束及资源释放';
  if(row?.state==='waiting'){
    const revocation=revocationState(status?.revocation);
    if(revocation==='pending')return '本机已停止；服务端撤销待确认';
    if(revocation==='unknown')return '撤销状态待核对';
    if(!status?.provider)return '等待配对提供者';
    if(status.enabled!==true)return '托管已关闭，等待重新启用';
    if(status.online!==true)return '等待提供者连接';
    if(status.reconciled!==true)return '等待连接对账';
    if(status.hostReady!==true)return '等待浏览器执行宿主就绪';
    const authorization=siteAuthorization(status.siteAuthorization),slot=slotState(status);
    if(authorization==='revoked')return '目标网站访问已撤销，等待恢复网站授权';
    if(authorization==='none')return '尚无已批准网站范围，等待批准任务及网站范围';
    if(authorization!=='granted')return '目标网站授权待核对';
    if(slot!=='available')return SLOT_WAITING[slot];
    if(status.pendingResources!==false)return status.pendingResources===true?
      '仍有待处理资源，等待核对及资源释放':'待处理资源状态待核对';
    return '等待浏览器开始执行';
  }
  if(row?.state==='prepared')return '等待执行许可';
  if(row?.runState==='running')return '任务正在执行';
  if(row?.runState==='preparing')return '等待执行准备完成';
  if(row?.runState==='settling')return '等待结果保存确认';
  if(row?.runState==='retiring')return '等待资源释放，结果尚待确认';
  return '等待执行状态确认';
}

export function projectCloudRequestSamples(raw,limit=5){
  const requests=Array.isArray(raw?.requests)?raw.requests:[];
  const size=Number.isSafeInteger(limit)?Math.max(0,Math.min(limit,5)):5;
  if(!size)return [];
  return requests.slice(-size).reverse().map(row=>{
    // A historical assignment expiry cannot invalidate a confirmed successful result.
    // Keep cancellation history unless all four completion facts agree; never mutate it.
    const completed=row?.state==='finished'&&row?.runState==='completed'&&row?.retirementState==='released'&&row?.receipt!=null&&row?.outcomeUnknown!==true;
    const reason=row?.reason==null||row.reason===''||completed&&row.reason==='E_CLOUD_CANCELLED'?'':label(REASON_LABELS,row.reason,'状态原因待核对');
    return {
      title:typeof row?.taskTitle==='string'&&row.taskTitle.trim()
        ?row.taskTitle.trim().slice(0,80):'历史任务',
      state:row?.state==='finished'&&row?.runState!=='completed'?'请求已结束':label(REQUEST_STATE_LABELS,row?.state,'状态未识别'),
      run:label(RUN_STATE_LABELS,row?.runState,row?.runState==null?'尚无执行状态':'执行状态未识别'),
      // Controller terminal state and result are committed in the same transaction;
      // a reserved resultId alone is not evidence of a saved result.
      result:SAVED_RUN_STATES.has(row?.runState)?'结果已保存':'结果保存未确认',
      settlement:label(RETIREMENT_LABELS,row?.retirementState,'资源释放未确认'),
      receipt:row?.receipt!=null?'回执已确认':'回执未确认',
      reason:[requestProgress(row,raw),row?.outcomeUnknown===true?'网页副作用待核对，请勿重试该请求':'',reason].filter(Boolean).join('；')
    };
  });
}
