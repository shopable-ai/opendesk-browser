import {projectCloudStatus,cloudHostingSummary} from './cloud-status-presentation.js';

// Development-only observer, using the same authenticated Host Client as My Tasks.
// Never import cloud-hosting.js: its refresh() may claim and dispatch tasks.
export function createDebugWorkbench({client,host,api=globalThis.chrome,document:doc=globalThis.document,
  clipboard=globalThis.navigator?.clipboard,now=()=>new Date()}={}){
  const get=id=>doc.getElementById(id);
  const refreshButton=get('debug-refresh'),copyButton=get('debug-copy');
  const feedback=get('debug-feedback');
  let disposed=false, sequence=0, snapshot=null;
  const refresh=async()=>{
    const current=++sequence;
    if(disposed)return;
    refreshButton.disabled=true;
    feedback.textContent='正在读取当前云控状态…';
    try{
      const value=await client.cloud.cloudStatus({});
      if(disposed||current!==sequence)return;
      const version=api?.runtime?.getManifest?.()?.version;
      snapshot=projectCloudStatus(value,{version,hostOccupied:Boolean(host?.currentRun),capturedAt:now().toISOString()});
      get('debug-cloud-summary').textContent=cloudHostingSummary(snapshot);
      get('debug-pairing').textContent=snapshot.paired?'已配对':'未配对';
      get('debug-connection').textContent=snapshot.connection;
      get('debug-reconcile').textContent=snapshot.reconciled?'已对账':'尚未对账';
      get('debug-slot').textContent=snapshot.slotAvailable?'空闲':'繁忙 / 未就绪';
      get('debug-task-count').textContent=String(snapshot.approvedTasks);
      get('debug-request-count').textContent=String(snapshot.requests.total);
      get('debug-snapshot').textContent=JSON.stringify(snapshot,null,2);
      feedback.textContent='已读取可信 Host 的只读诊断；没有领取或执行任务。';
    }catch(error){
      if(disposed||current!==sequence)return;
      snapshot=null;
      for(const id of ['debug-pairing','debug-connection','debug-reconcile','debug-slot','debug-task-count','debug-request-count'])get(id).textContent='未知';
      const code='E_DIAGNOSTICS';
      get('debug-cloud-summary').textContent='云控状态暂不可读取';
      get('debug-snapshot').textContent='未获得可信诊断快照。';
      feedback.textContent=code+'：请核对扩展 Host 和后台连接；详情请查看开发日志。';
    }finally{if(!disposed&&current===sequence)refreshButton.disabled=false;}
  };
  const copy=()=>{
    if(disposed)return;
    if(!snapshot){feedback.textContent='没有可复制的诊断摘要，请先刷新。';return;}
    if(typeof clipboard?.writeText!=='function'){
      feedback.textContent='剪贴板不可用，可在下方查看脱敏快照。';return;
    }
    // Clipboard use starts from the user gesture, never after an extra async request.
    void clipboard.writeText(JSON.stringify(snapshot,null,2)).then(()=>{
      if(!disposed)feedback.textContent='脱敏摘要已复制。';
    }).catch(()=>{if(!disposed)feedback.textContent='复制失败，可展开脱敏快照查看。';});
  };
  const onRefresh=()=>{void refresh();};
  refreshButton.addEventListener('click',onRefresh);
  copyButton.addEventListener('click',copy);
  return {refresh,dispose(){if(disposed)return;disposed=true;sequence++;
    refreshButton.removeEventListener('click',onRefresh);
    copyButton.removeEventListener('click',copy);
  }};
}
