// Hosting shares the visible document's existing RunHost and Authority slot.
import {projectCloudStatus,cloudHostingSummary} from './cloud-status-presentation.js';
export function createCloudHosting({client,host,document:doc=globalThis.document}){
  const get=id=>doc.getElementById(id),cloud=client.cloud;let disposed=false,busy=false,starting=false,timer;
  const status=get('cloud-status'),brief=get('cloud-brief');
  const fail=e=>{const code=/^E_[A-Z0-9_]{1,60}$/.test(String(e?.code))?e.code:'E_CLOUD';
    brief.textContent='状态异常';status.textContent=`${code}：云控状态不可用。请查看开发诊断或日志。`;};
  async function refresh(){
    const s=await cloud.cloudStatus({});if(disposed)return;
    const projected=projectCloudStatus(s),summary=cloudHostingSummary(projected);
    brief.textContent=!projected.paired?'未配对':!projected.enabled?'已关闭':!projected.online?'连接中':!projected.reconciled?'对账中':!projected.slotAvailable?'执行槽繁忙':'可用';
    status.textContent=summary+`\n已批准任务 ${projected.approvedTasks} 项 · 历史云请求 ${projected.requests.total} 条 · 已确认回执 ${projected.requests.receivedReceipts} 条（最近 ${projected.requests.sampled} 条统计）`;
    get('cloud-pair').disabled=!!s.provider;get('cloud-approve').disabled=!s.provider||s.enabled;get('cloud-stop').disabled=!s.provider;get('cloud-unpair').disabled=!s.provider;
    if(!s.enabled||host.executionPending||starting||!s.online||!s.reconciled)return;
    const next=await cloud.cloudNext({});if(!next||disposed)return;
    starting=true;try{const request=await cloud.cloudResolve(next);await host.start(request);host.completion.catch(fail).finally(()=>{starting=false;});}catch(e){starting=false;throw e;}
  }
  async function action(fn){if(busy)return;busy=true;try{await fn();await refresh();}catch(e){fail(e);}finally{busy=false;}}
  const listeners=[];function click(id,fn){const handler=()=>void action(fn);get(id).addEventListener('click',handler);listeners.push([id,handler]);}
  click('cloud-pair',()=>cloud.cloudPair({url:get('cloud-url').value,providerId:get('cloud-provider-id').value.trim(),pairingCode:get('cloud-pairing-code').value.trim(),allowLoopback:get('cloud-loopback').checked}).then(()=>{get('cloud-pairing-code').value='';}));
  click('cloud-approve',async()=>{if(!get('cloud-consent').checked)throw Error('请先批准所选固定任务、网站范围和结果回传');const taskId=get('task-installed-list').value;if(!taskId)throw Error('请先安装并选择任务');return cloud.cloudApprove({tasks:[{taskId,resultAllowed:get('cloud-result-consent').checked}]});});
  click('cloud-stop',()=>cloud.cloudStop({}));click('cloud-unpair',()=>cloud.cloudUnpair({}));click('cloud-refresh',()=>refresh());
  async function poll(){if(disposed)return;try{if(!busy)await refresh();}catch(e){if(!disposed)fail(e);}finally{if(!disposed)timer=setTimeout(poll,2000);}}
  void poll();return {dispose(){disposed=true;clearTimeout(timer);for(const[id,fn]of listeners)get(id).removeEventListener('click',fn);}};
}
