import {projectCloudStatus,cloudHostingSummary} from './cloud-status-presentation.js';

// Development-only observer, using the same authenticated Host Client as My Tasks.
// Never import cloud-hosting.js: its refresh() may claim and dispatch tasks.
const DIAGNOSTIC_NODES={
  summary:'debug-cloud-summary',pairing:'debug-pairing',connection:'debug-connection',
  reconcile:'debug-reconcile',slot:'debug-slot',taskCount:'debug-task-count',
  requestCount:'debug-request-count',snapshot:'debug-snapshot',feedback:'debug-feedback'
};
export function createDebugWorkbench({client,host,api=globalThis.chrome,document:doc=globalThis.document,
  clipboard=globalThis.navigator?.clipboard,now=()=>new Date(),reactUI=null}={}){
  const get=id=>doc.getElementById(id);
  const refreshButton=get('debug-refresh'),copyButton=get('debug-copy');
  let disposed=false, sequence=0, snapshot=null;
  // Node/legacy fallback remains; never write directly into React-owned children.
  const render=fields=>{
    if(disposed)return;
    if(reactUI?.debugMounted){reactUI.renderDebugDiagnostics(fields);return;}
    for(const [key,value] of Object.entries(fields))
      get(DIAGNOSTIC_NODES[key]).textContent=value;
  };
  const refresh=async()=>{
    const current=++sequence;
    if(disposed)return;
    refreshButton.disabled=true;
    render({feedback:'正在读取当前云控状态…'});
    try{
      const value=await client.cloud.cloudStatus({});
      if(disposed||current!==sequence)return;
      const version=api?.runtime?.getManifest?.()?.version;
      snapshot=projectCloudStatus(value,{version,hostOccupied:Boolean(host?.currentRun),capturedAt:now().toISOString()});
      render({
        summary:cloudHostingSummary(snapshot),pairing:snapshot.paired?'已配对':'未配对',
        connection:snapshot.connection,reconcile:snapshot.reconciled?'已对账':'尚未对账',
        slot:snapshot.slotAvailable?'空闲':'繁忙 / 未就绪',
        taskCount:String(snapshot.approvedTasks),requestCount:String(snapshot.requests.total),
        snapshot:JSON.stringify(snapshot,null,2),
        feedback:'已读取可信 Host 的只读诊断；没有领取或执行任务。'
      });
    }catch(error){
      if(disposed||current!==sequence)return;
      snapshot=null;
      render({
        pairing:'未知',connection:'未知',reconcile:'未知',slot:'未知',
        taskCount:'未知',requestCount:'未知',summary:'云控状态暂不可读取',
        snapshot:'未获得可信诊断快照。',
        feedback:'E_DIAGNOSTICS：请核对扩展 Host 和后台连接；详情请查看开发日志。'
      });
    }finally{if(!disposed&&current===sequence)refreshButton.disabled=false;}
  };
  const copy=()=>{
    if(disposed)return;
    if(!snapshot){render({feedback:'没有可复制的诊断摘要，请先刷新。'});return;}
    if(typeof clipboard?.writeText!=='function'){
      render({feedback:'剪贴板不可用，可在下方查看脱敏快照。'});return;
    }
    // Clipboard use starts from the user gesture, never after an extra async request.
    void clipboard.writeText(JSON.stringify(snapshot,null,2)).then(()=>{
      if(!disposed)render({feedback:'脱敏摘要已复制。'});
    }).catch(()=>{if(!disposed)render({feedback:'复制失败，可展开脱敏快照查看。'});});
  };
  const onRefresh=()=>{void refresh();};
  refreshButton.addEventListener('click',onRefresh);
  copyButton.addEventListener('click',copy);
  return {refresh,dispose(){if(disposed)return;disposed=true;sequence++;
    refreshButton.removeEventListener('click',onRefresh);
    copyButton.removeEventListener('click',copy);
  }};
}
