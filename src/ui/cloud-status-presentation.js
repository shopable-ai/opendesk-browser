// Strict projection of the existing authenticated cloudStatus() response.
// Never export credentials, server URL, executorId, target URL, task IDs, request IDs or run IDs.
const CONNECTION = new Set(['offline','connecting','authenticated','backoff']);
const REQUEST = new Set(['waiting','prepared','permitted','finished','cancelled','cancellation-pending','OUTCOME_UNKNOWN']);
const boundedCount = value => Math.min(Number.isSafeInteger(value) && value >= 0 ? value : 0, 999999);

export function projectCloudStatus(raw, {version='未知', capturedAt=new Date().toISOString(), hostOccupied=false}={}) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const rows = Array.isArray(source.requests) ? source.requests : [];
  const counts = Object.fromEntries([...REQUEST].map(name=>[name,0]));
  counts.other=0;
  let receipts=0, retired=0;
  // Keep an upper bound on large historical journals; no raw request object survives projection.
  const sampled=rows.slice(-2000);
  for(const row of sampled){
    const state=REQUEST.has(row?.state)?row.state:'other';counts[state]++;
    if(row?.receipt != null)receipts++;
    if(row?.retirementState==='released')retired++;
  }
  return {
    schema:'opendesk.cloud-control.diagnostics.v1',capturedAt,
    extensionVersion:/^\d+(?:\.\d+){1,3}$/.test(String(version))?String(version):'未知',
    paired:Boolean(source.provider),enabled:source.enabled===true,
    connection:CONNECTION.has(source.connection)?source.connection:'unknown',
    online:source.online===true,reconciled:source.reconciled===true,
    hostReady:source.hostReady===true,slotAvailable:source.slotAvailable===true,
    hostOccupied:Boolean(hostOccupied),approvedTasks:boundedCount(source.tasks?.length),
    requests:{total:boundedCount(source.requestTotal??rows.length),sampled:boundedCount(sampled.length),states:counts,
      receivedReceipts:boundedCount(receipts),releasedSlots:boundedCount(retired)}
  };
}

export function cloudHostingSummary(status){
  if(!status.paired)return '未配对提供者。云端托管是浏览器内置能力；请先安装任务，再配对并批准明确范围。';
  if(!status.enabled)return '已配对，托管已关闭。不会领取新任务。';
  if(!status.online)return '托管已启用，但提供者尚未连接。请检查网络和连接状态。';
  if(!status.reconciled)return '已连接提供者，正在对账；尚不能确认可执行。';
  if(!status.hostReady)return '连接和对账已完成；需要可用的浏览器执行宿主。';
  if(!status.slotAvailable)return '连接与对账已完成；执行槽占用中，等待原任务完成及资源释放。';
  return '托管已启用，连接和对账已完成；可等待已批准任务。';
}

const REQUEST_STATE_LABELS=Object.freeze({waiting:'等待执行',prepared:'已绑定任务',permitted:'已取得许可',finished:'已完成',cancelled:'已取消','cancellation-pending':'取消处理中',OUTCOME_UNKNOWN:'结果待核对'});
const RUN_STATE_LABELS=Object.freeze({preparing:'准备中',running:'运行中',stopping:'停止中',settling:'结果结算中',completed:'已完成',failed:'失败',stopped:'已停止',interrupted:'已中断',paused_unknown:'结果待核对'});
export function projectCloudRequestSamples(raw,limit=5){
  const requests=Array.isArray(raw?.requests)?raw.requests:[];
  const size=Number.isSafeInteger(limit)?Math.max(0,Math.min(limit,5)):5;
  return requests.slice(-size).reverse().map(row=>({
    title:typeof row?.taskTitle==='string'&&row.taskTitle.trim()
      ?row.taskTitle.trim().slice(0,80):'历史任务',
    state:REQUEST_STATE_LABELS[row?.state]||'状态未识别',
    run:RUN_STATE_LABELS[row?.runState]||'尚无执行状态',
    settlement:row?.retirementState==='released'?'资源已释放':'资源未确认释放',
    receipt:row?.receipt!=null?'回执已确认':'回执未确认'
  }));
}
