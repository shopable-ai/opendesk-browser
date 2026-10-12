// Hosting shares the visible document's existing RunHost and Authority slot.
import {projectCloudStatus,cloudHostingSummary,projectCloudRequestSamples,cloudSlotStateLabel} from './cloud-status-presentation.js';
export function createCloudHosting({client,host,document:doc=globalThis.document,api=globalThis.chrome}){
  const get=id=>doc.getElementById(id),cloud=client.cloud;let disposed=false,busy=false,starting=false,timer;
  const status=get('cloud-status'),brief=get('cloud-brief'),myState=get('cloud-my-state');
  const overview=get('cloud-overview-state'),sampleList=get('cloud-request-samples');
  let lastSamples='',lastFullRefresh=0;
  let statusText=status.textContent,operationFeedback='';
  const updateStatus=()=>{status.textContent=[statusText,operationFeedback].filter(Boolean).join('\n');};
  const operationFail=error=>{
    if(disposed)return;
    const messages={E_CLOUD_CONSENT_REQUIRED:'请先批准所选固定任务和网站范围。',
      E_CLOUD_TASK_REQUIRED:'请先安装并选择任务。',E_PAIRING:'配对操作未完成，请核对提供者地址、身份与配对码。',
      E_PERMISSION:'目标网站访问尚未授权，请核对网站权限。'};
    operationFeedback=Object.hasOwn(messages,error?.code)?messages[error.code]:'操作未完成，请核对状态后再试。';
    updateStatus();
  };
  function sampleView(samples){
    const serial=JSON.stringify(samples);
    if(serial===lastSamples)return;lastSamples=serial;sampleList.replaceChildren();
    if(!samples.length){const li=doc.createElement('li');li.textContent='暂无云请求记录';sampleList.append(li);return;}
    for(const s of samples){const li=doc.createElement('li'),state=doc.createElement('span'),detail=doc.createElement('span');
      state.textContent=s.state+' · '+s.run;detail.textContent=[s.result,s.settlement,s.receipt,s.reason].filter(Boolean).join(' · ');li.append(state,detail);sampleList.append(li);}
  }
  const put=(id,text)=>{const el=get(id);if(el)el.textContent=text;};
  const fail=()=>{
    if(disposed)return;
    brief.textContent='状态异常';statusText='云控状态暂不可读取，请稍后核对。';updateStatus();
    myState.textContent='状态不可读取';overview.textContent='云端托管状态暂不可读取';
    for(const metric of ['provider','connection','host','slot','tasks','requests'])put('cloud-overview-'+metric,'待核对');
    get('cloud-pair').disabled=true;get('cloud-approve').disabled=true;
    get('cloud-refresh').disabled=false;get('cloud-overview-refresh').disabled=false;
    lastSamples='';sampleList.replaceChildren();const li=doc.createElement('li');li.textContent='请求状态暂不可读取';sampleList.append(li);};
  // Refresh is deliberately read-only. Cloud claim/dispatch belongs only to poll().
  async function refresh(){
    const s=await cloud.cloudStatus({limit:5});if(disposed)return null;
    const projected=projectCloudStatus(s),summary=cloudHostingSummary(projected),samples=projectCloudRequestSamples(s);
    brief.textContent=projected.revocation==='pending'?'本机已停止；服务端撤销待确认':projected.revocation==='unknown'?'撤销状态待核对':
      !projected.paired?(projected.revocation==='confirmed'?'撤销已确认':'未配对'):!projected.enabled?'已关闭':!projected.online?'连接中':!projected.reconciled?'对账中':!projected.hostReady?'宿主未就绪':
      projected.siteAuthorization==='revoked'?'网站访问已撤销':projected.siteAuthorization==='none'?'未批准网站范围':projected.siteAuthorization!=='granted'?'网站授权待核对':
      !projected.slotAvailable?cloudSlotStateLabel(projected.slotState):projected.pendingResources!==false?'待处理资源待核对':'可用';
    statusText=summary+`\n已批准任务 ${projected.approvedTasks} 项 · 历史云请求 ${projected.requests.total} 条 · 已确认回执 ${projected.requests.receivedReceipts} 条（最近 ${projected.requests.sampled} 条统计）`;updateStatus();
    const latest=samples[0];
    myState.textContent=brief.textContent+' · 已批准 '+projected.approvedTasks+' 项任务'+
      (projected.pendingResources===true?' · 仍有待处理资源，等待停止、核对及资源释放':projected.pendingResources===false?'':' · 待处理资源状态待核对')+
      (latest?' · 最近请求：'+[latest.state,latest.run,latest.result,latest.settlement,latest.receipt,latest.reason].filter(Boolean).join(' · '):'');
    overview.textContent=summary;
    put('cloud-overview-provider',projected.paired?'已配对':'未配对');
    put('cloud-overview-connection',projected.online?'已连接':projected.connection==='backoff'?'重连中':'未连接');
    put('cloud-overview-host',projected.hostReady?'已就绪':'不可用');
    put('cloud-overview-slot',cloudSlotStateLabel(projected.slotState));
    put('cloud-overview-tasks',String(projected.approvedTasks));
    put('cloud-overview-requests',String(projected.requests.total));
    sampleView(samples);lastFullRefresh=Date.now();
    get('cloud-pair').disabled=projected.paired||projected.revocation==='pending'||projected.revocation==='unknown';get('cloud-approve').disabled=!s.provider||s.enabled;get('cloud-stop').disabled=!s.provider;get('cloud-unpair').disabled=!s.provider;
    return s;
  }
  async function dispatchNext(s){
    if(disposed||!s?.enabled||host.executionPending||starting||!s.online||!s.reconciled)return;
    const next=await cloud.cloudNext({});if(!next||disposed)return;
    starting=true;try{const request=await cloud.cloudResolve(next);await host.start(request);host.completion.catch(operationFail).finally(()=>{starting=false;});}catch(e){starting=false;throw e;}
  }
  async function action(fn,readOnly){if(busy)return;busy=true;
    operationFeedback='';updateStatus();
    try{
      if(!readOnly){try{await fn();}catch(error){operationFail(error);return;}}
      try{await refresh();}catch{fail();}
    }finally{busy=false;}
  }
  const listeners=[];function click(id,fn){
    const readOnly=id==='cloud-refresh'||id==='cloud-overview-refresh';
    const handler=()=>void action(fn,readOnly);get(id).addEventListener('click',handler);listeners.push([id,handler]);}
  click('cloud-pair',()=>cloud.cloudPair({url:get('cloud-url').value,providerId:get('cloud-provider-id').value.trim(),pairingCode:get('cloud-pairing-code').value.trim(),allowLoopback:get('cloud-loopback').checked}).then(()=>{get('cloud-pairing-code').value='';}));
  click('cloud-approve',async()=>{if(!get('cloud-consent').checked)throw {code:'E_CLOUD_CONSENT_REQUIRED'};const taskId=get('task-installed-list').value;if(!taskId)throw {code:'E_CLOUD_TASK_REQUIRED'};return cloud.cloudApprove({tasks:[{taskId,resultAllowed:get('cloud-result-consent').checked}]});});
  click('cloud-stop',()=>cloud.cloudStop({}));click('cloud-unpair',()=>cloud.cloudUnpair({}));
  // The user's “核对状态” gesture must never itself claim or run a cloud task.
  click('cloud-refresh',async()=>{});
  click('cloud-overview-refresh',async()=>{});
  click('cloud-open-console',async()=>{await api.tabs.create({url:api.runtime.getURL('ui/cloud-control.html')});});
  // Preserve the two-second dispatch cadence without scanning cloud history
  // every time. Visibility changes observations, not execution ownership.
  async function poll(){if(disposed)return;try{if(!busy){
    const s=await cloud.cloudStatus({includeRequests:false});
    if(!busy&&!disposed)try{await dispatchNext(s);}catch(error){operationFail(error);}
    const cloudVisible=doc.documentElement?.dataset?.opendeskTab==='tasks';
    if(!busy&&!disposed&&Date.now()-lastFullRefresh>=(cloudVisible?5000:15000))await refresh();
  }}catch(e){if(!disposed)fail(e);}finally{if(!disposed)timer=setTimeout(poll,2000);}}
  void poll();return {refresh,dispose(){disposed=true;clearTimeout(timer);for(const[id,fn]of listeners)get(id).removeEventListener('click',fn);}};
}
