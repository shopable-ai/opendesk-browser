// Hosting shares the visible document's existing RunHost and Authority slot.
import {projectCloudStatus,cloudHostingSummary,projectCloudRequestSamples} from './cloud-status-presentation.js';
export function createCloudHosting({client,host,document:doc=globalThis.document}){
  const get=id=>doc.getElementById(id),cloud=client.cloud;let disposed=false,busy=false,starting=false,timer;
  const status=get('cloud-status'),brief=get('cloud-brief'),myState=get('cloud-my-state');
  const overview=get('cloud-overview-state'),sampleList=get('cloud-request-samples');
  let lastSamples='',lastFullRefresh=0;
  function sampleView(s){
    const samples=projectCloudRequestSamples(s),serial=JSON.stringify(samples);
    if(serial===lastSamples)return;lastSamples=serial;sampleList.replaceChildren();
    if(!samples.length){const li=doc.createElement('li');li.textContent='暂无云请求记录';sampleList.append(li);return;}
    for(const s of samples){const li=doc.createElement('li'),state=doc.createElement('span'),detail=doc.createElement('span');
      state.textContent=s.state+' · '+s.run;detail.textContent=s.settlement+' · '+s.receipt;li.append(state,detail);sampleList.append(li);}
  }
  const put=(id,text)=>{const el=get(id);if(el)el.textContent=text;};
  const fail=e=>{const code=/^E_[A-Z0-9_]{1,60}$/.test(String(e?.code))?e.code:'E_CLOUD';
    brief.textContent='状态异常';status.textContent=`${code}：云控状态不可用。请查看开发诊断或日志。`;
    myState.textContent='状态不可读取';overview.textContent='云端托管状态暂不可读取';};
  // Refresh is deliberately read-only. Cloud claim/dispatch belongs only to poll().
  async function refresh(){
    const s=await cloud.cloudStatus({limit:5});if(disposed)return null;
    const projected=projectCloudStatus(s),summary=cloudHostingSummary(projected);
    brief.textContent=!projected.paired?'未配对':!projected.enabled?'已关闭':!projected.online?'连接中':!projected.reconciled?'对账中':!projected.hostReady?'等待宿主':!projected.slotAvailable?'执行槽繁忙':'可用';
    status.textContent=summary+`\n已批准任务 ${projected.approvedTasks} 项 · 历史云请求 ${projected.requests.total} 条 · 已确认回执 ${projected.requests.receivedReceipts} 条（最近 ${projected.requests.sampled} 条统计）`;
    myState.textContent=brief.textContent+' · 已批准 '+projected.approvedTasks+' 项任务';
    overview.textContent=summary;
    put('cloud-overview-provider',projected.paired?'已配对':'未配对');
    put('cloud-overview-connection',projected.online?'已连接':projected.connection==='backoff'?'重连中':'未连接');
    put('cloud-overview-host',projected.hostReady?'已就绪':'不可用');
    put('cloud-overview-slot',projected.slotAvailable?'空闲':'占用／未就绪');
    put('cloud-overview-tasks',String(projected.approvedTasks));
    put('cloud-overview-requests',String(projected.requests.total));
    sampleView(s);lastFullRefresh=Date.now();
    get('cloud-pair').disabled=!!s.provider;get('cloud-approve').disabled=!s.provider||s.enabled;get('cloud-stop').disabled=!s.provider;get('cloud-unpair').disabled=!s.provider;
    return s;
  }
  async function dispatchNext(s){
    if(disposed||!s?.enabled||host.executionPending||starting||!s.online||!s.reconciled)return;
    const next=await cloud.cloudNext({});if(!next||disposed)return;
    starting=true;try{const request=await cloud.cloudResolve(next);await host.start(request);host.completion.catch(fail).finally(()=>{starting=false;});}catch(e){starting=false;throw e;}
  }
  async function action(fn){if(busy)return;busy=true;try{await fn();await refresh();}catch(e){fail(e);}finally{busy=false;}}
  const listeners=[];function click(id,fn){const handler=()=>void action(fn);get(id).addEventListener('click',handler);listeners.push([id,handler]);}
  click('cloud-pair',()=>cloud.cloudPair({url:get('cloud-url').value,providerId:get('cloud-provider-id').value.trim(),pairingCode:get('cloud-pairing-code').value.trim(),allowLoopback:get('cloud-loopback').checked}).then(()=>{get('cloud-pairing-code').value='';}));
  click('cloud-approve',async()=>{if(!get('cloud-consent').checked)throw Error('请先批准所选固定任务、网站范围和结果回传');const taskId=get('task-installed-list').value;if(!taskId)throw Error('请先安装并选择任务');return cloud.cloudApprove({tasks:[{taskId,resultAllowed:get('cloud-result-consent').checked}]});});
  click('cloud-stop',()=>cloud.cloudStop({}));click('cloud-unpair',()=>cloud.cloudUnpair({}));
  // The user's “核对状态” gesture must never itself claim or run a cloud task.
  click('cloud-refresh',async()=>{});
  click('cloud-overview-refresh',async()=>{});
  // Preserve the two-second dispatch cadence without scanning cloud history
  // every time. Visibility changes observations, not execution ownership.
  async function poll(){if(disposed)return;try{if(!busy){
    const s=await cloud.cloudStatus({includeRequests:false});
    if(!busy&&!disposed)await dispatchNext(s);
    const cloudVisible=doc.documentElement?.dataset?.opendeskTab==='cloud';
    if(!busy&&!disposed&&Date.now()-lastFullRefresh>=(cloudVisible?5000:15000))await refresh();
  }}catch(e){if(!disposed)fail(e);}finally{if(!disposed)timer=setTimeout(poll,2000);}}
  void poll();return {refresh,dispose(){disposed=true;clearTimeout(timer);for(const[id,fn]of listeners)get(id).removeEventListener('click',fn);}};
}
