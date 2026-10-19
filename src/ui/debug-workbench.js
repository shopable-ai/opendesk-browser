import {projectCloudStatus,cloudHostingSummary} from './cloud-status-presentation.js';

// Development-only observer of the existing authenticated Host Client.
// Never import cloud-hosting.js: its refresh() may claim and dispatch tasks.
export const DEBUG_INITIAL_STATE=Object.freeze({
  summary:'尚未读取云控状态',pairing:'未检测',connection:'未检测',reconcile:'未检测',
  slot:'未检测',taskCount:'—',requestCount:'—',snapshot:'请点击刷新',
  feedback:'本页仅支持读取状态，不触发连接、领取、配对或执行。',
  refreshing:false,copying:false,disposed:false
});

export function createDebugWorkbench({client,host,api=globalThis.chrome,
  clipboard=globalThis.navigator?.clipboard,now=()=>new Date(),reactUI=null}={}){
  let disposed=false,sequence=0,copySequence=0,snapshot=null,state=DEBUG_INITIAL_STATE;
  const listeners=new Set();
  const publish=fields=>{
    if(disposed)return;
    state=Object.freeze({...state,...fields});
    if(reactUI?.debugMounted)reactUI.renderDebugDiagnostics(state);
    for(const listener of listeners)listener();
  };
  const refresh=async()=>{
    if(disposed)return;
    const current=++sequence;
    copySequence++;
    publish({refreshing:true,copying:false,feedback:'正在读取当前云控状态…'});
    try{
      const value=await client.cloud.cloudStatus({});
      if(disposed||current!==sequence)return;
      const version=api?.runtime?.getManifest?.()?.version;
      snapshot=projectCloudStatus(value,{version,hostOccupied:Boolean(host?.currentRun),capturedAt:now().toISOString()});
      publish({
        summary:cloudHostingSummary(snapshot),pairing:snapshot.paired?'已配对':'未配对',
        connection:snapshot.connection,reconcile:snapshot.reconciled?'已对账':'尚未对账',
        slot:snapshot.slotAvailable?'空闲':'繁忙 / 未就绪',
        taskCount:String(snapshot.approvedTasks),requestCount:String(snapshot.requests.total),
        snapshot:JSON.stringify(snapshot,null,2),
        feedback:'已读取可信 Host 的只读诊断；没有领取或执行任务。'
      });
    }catch{
      if(disposed||current!==sequence)return;
      snapshot=null;
      publish({
        pairing:'未知',connection:'未知',reconcile:'未知',slot:'未知',
        taskCount:'未知',requestCount:'未知',summary:'云控状态暂不可读取',
        snapshot:'未获得可信诊断快照。',
        feedback:'E_DIAGNOSTICS：请核对扩展 Host 和后台连接；详情请查看开发日志。'
      });
    }finally{
      if(!disposed&&current===sequence)publish({refreshing:false});
    }
  };
  const copy=async()=>{
    if(disposed||state.refreshing||state.copying)return;
    if(!snapshot){publish({feedback:'没有可复制的诊断摘要，请先刷新。'});return;}
    if(typeof clipboard?.writeText!=='function'){
      publish({feedback:'剪贴板不可用，可在下方查看脱敏快照。'});return;
    }
    const current=++copySequence;
    publish({copying:true});
    try{
      // Starts within the user click, with no intervening Host request or await.
      await clipboard.writeText(JSON.stringify(snapshot,null,2));
      if(!disposed&&current===copySequence)publish({feedback:'脱敏摘要已复制。'});
    }catch{
      if(!disposed&&current===copySequence)publish({feedback:'复制失败，可展开脱敏快照查看。'});
    }finally{
      if(!disposed&&current===copySequence)publish({copying:false});
    }
  };
  const actions={refresh,copy};
  if(reactUI?.debugMounted){
    reactUI.renderDebugDiagnostics(state);
    reactUI.connectDebugActions(actions);
  }
  return {
    getSnapshot:()=>state,
    subscribe(listener){
      if(disposed)return ()=>{};
      listeners.add(listener);
      return ()=>listeners.delete(listener);
    },
    refresh,copy,
    dispose(){
      if(disposed)return;
      disposed=true;
      sequence++;copySequence++;snapshot=null;
      state=Object.freeze({...state,disposed:true,refreshing:false,copying:false});
      if(reactUI?.debugMounted){
        reactUI.renderDebugDiagnostics(state);
        reactUI.connectDebugActions(null);
      }
      for(const listener of listeners)listener();
      listeners.clear();
    }
  };
}
