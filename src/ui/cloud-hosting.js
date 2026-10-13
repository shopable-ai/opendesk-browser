// Hosting shares the visible document's existing RunHost and Authority slot.
import {projectCloudStatus,cloudHostingSummary,projectCloudRequestSamples} from './cloud-status-presentation.js';
// Advisory projection only: the Browser Host uses the original Task resolver
// again before granting authority, binding a Run, or admitting a Worker.
export function projectCloudInstalledTasks(data,approved=[]){
  const catalog=Array.isArray(data?.catalog)?data.catalog:[],
    installed=Array.isArray(data?.installed)?data.installed:[],
    grants=Array.isArray(approved)?approved:[];
  return installed.map(row=>{
    const item=catalog.find(candidate=>candidate.taskId===row.taskId&&
      candidate.version===row.version&&candidate.manifestHash===row.manifestHash);
    const manifest=item?.manifest,sourceHash=manifest?.program?.sourceHash??null,
      siteOrigins=Array.isArray(manifest?.siteOrigins)?manifest.siteOrigins:[],
      eligible=!!(row.enabled&&item?.stage==='available'&&
        item?.verification?.manifestHash===row.manifestHash&&
        item?.verification?.sourceHash===sourceHash&&sourceHash&&siteOrigins.length);
    const authorized=grants.find(grant=>grant.taskId===row.taskId&&
      grant.version===row.version&&grant.manifestHash===row.manifestHash&&
      grant.sourceHash===sourceHash&&grant.installationId===row.installationId&&
      grant.generation===row.generation);
    return {taskId:row.taskId,version:row.version,manifestHash:row.manifestHash,
      sourceHash,installationId:row.installationId??null,generation:row.generation??null,
      title:manifest?.title||row.taskId,description:manifest?.description||'',
      siteOrigins,paramsSchema:manifest?.paramsSchema??null,
      enabled:row.enabled===true,
      eligible,approved:!!authorized,resultAllowed:authorized?.resultAllowed===true};
  });
}
const cloudChoiceKey=task=>[task.taskId,task.version,task.manifestHash,task.sourceHash,
  task.installationId,task.generation].join('|');

export function createCloudHosting({client,host,document:doc=globalThis.document,api=globalThis.chrome}){
  const get=id=>doc.getElementById(id),cloud=client.cloud;let disposed=false,busy=false,starting=false,timer;
  const status=get('cloud-status'),brief=get('cloud-brief'),myState=get('cloud-my-state');
  const overview=get('cloud-overview-state'),sampleList=get('cloud-request-samples');
  let lastSamples='',lastFullRefresh=0,lastCatalogAt=0,lastCatalogStamp='';
  let taskChoices=[];const selections=new Map();
  const selectedTasks=()=>taskChoices.filter(task=>
    task.eligible&&selections.get(cloudChoiceKey(task))?.selected);
  function renderApprovalSummary(){
    const selected=selectedTasks(),uploaded=selected.filter(task=>
      selections.get(cloudChoiceKey(task))?.resultAllowed).length;
    put('cloud-approval-summary',selected.length+' 项已选 · '+uploaded+
      ' 项允许回传结果正文；未勾选的任务仅回传最小执行状态。');
    const button=get('cloud-approve');
    if(button)button.disabled=!selected.length||!button.cloudCanApprove;
  }
  async function refreshTaskChoices(cloudState){
    if(typeof client.request!=='function'||Date.now()-lastCatalogAt<5000)return;
    lastCatalogAt=Date.now();
    let data;
    try{data=await client.request('listTaskCatalog',{});}
    catch{taskChoices=[];const list=get('cloud-task-list');
      list.textContent='任务目录不可读取；请先检查本地安装与授权';renderApprovalSummary();return;}
    if(disposed)return;
    const projected=projectCloudInstalledTasks(data,cloudState.tasks),
      stamp=JSON.stringify([projected,!!cloudState.enabled]);
    if(stamp===lastCatalogStamp)return;
    lastCatalogStamp=stamp;taskChoices=projected;
    const keys=new Set(taskChoices.map(cloudChoiceKey));
    for(const key of selections.keys())if(!keys.has(key))selections.delete(key);
    const parent=get('cloud-task-list');parent.replaceChildren();
    if(!taskChoices.length){
      const empty=doc.createElement('p');empty.textContent='暂无已安装任务。请先在「我的」验证并安装 Controller Task。';
      empty.className='hint';parent.append(empty);
      const manage=doc.createElement('button');manage.type='button';manage.className='od-button od-button--secondary';
      manage.textContent='前往「我的」安装任务';manage.addEventListener('click',()=>get('tab-my-tasks')?.click?.());
      parent.append(manage);
    }
    for(const task of taskChoices){
      const key=cloudChoiceKey(task),selection=selections.get(key)||{selected:false,resultAllowed:false};
      const section=doc.createElement('section');section.className='cloud-task-choice';
      const header=doc.createElement('label'),check=doc.createElement('input'),title=doc.createElement('span');
      check.type='checkbox';check.dataset.cloudTaskKey=key;check.checked=selection.selected;
      check.disabled=!task.eligible||cloudState.enabled;
      title.textContent=task.title+' · v'+task.version+
        (task.eligible?'':task.enabled?' · 需要重新验证':' · 已停用')+
        (task.approved?' · 已授权':'');
      header.append(check,title);section.append(header);
      if(task.description){const description=doc.createElement('small');
        description.className='cloud-task-description';description.textContent=task.description;
        header.append(description);}
      const scope=doc.createElement('p');scope.className='cloud-task-scope';
      scope.textContent='允许访问：'+(task.siteOrigins.join('、')||'网站范围尚未验证');
      section.append(scope);
      const params=doc.createElement('p');params.className='cloud-task-params';
      const schema=task.paramsSchema;
      params.textContent='参数许可（固定 Schema）：'+(schema?.properties
        ?Object.entries(schema.properties).map(([name,rule])=>
          name+' ('+rule.type+(schema.required?.includes(name)?'，必填':'，可选')+
          (Array.isArray(rule.enum)?'，选项 '+rule.enum.join('/'):'')+')').join('；')||'无参数'
        :'不可读取');
      section.append(params);
      const label=doc.createElement('label'),result=doc.createElement('input'),copy=doc.createElement('span');
      result.type='checkbox';result.dataset.cloudResultKey=key;result.checked=selection.resultAllowed;
      result.disabled=!task.eligible||cloudState.enabled;
      copy.textContent='允许回传结果正文（网页数据、返回值与错误详情）'+
        (task.resultAllowed?' · 当前已授权':' · 默认关闭');
      label.append(result,copy);section.append(label);
      const constraints=doc.createElement('details'),open=doc.createElement('summary'),
        values=doc.createElement('pre');
      open.textContent='查看参数约束';
      values.textContent=JSON.stringify(task.paramsSchema??{},null,2);
      constraints.append(open,values);section.append(constraints);
      const technical=doc.createElement('details'),technicalLabel=doc.createElement('summary'),
        technicalValue=doc.createElement('pre');
      technicalLabel.textContent='高级：固定版本与安装身份';
      technicalValue.textContent=JSON.stringify({
        taskId:task.taskId,version:task.version,manifestHash:task.manifestHash,
        sourceHash:task.sourceHash,installationId:task.installationId,generation:task.generation
      },null,2);
      technical.append(technicalLabel,technicalValue);section.append(technical);parent.append(section);
    }
    renderApprovalSummary();
  }
  function sampleView(s){
    const samples=projectCloudRequestSamples(s),serial=JSON.stringify(samples);
    if(serial===lastSamples)return;lastSamples=serial;sampleList.replaceChildren();
    if(!samples.length){const li=doc.createElement('li');li.textContent='暂无云请求记录';sampleList.append(li);return;}
    for(const s of samples){const li=doc.createElement('li'),state=doc.createElement('span'),detail=doc.createElement('span');
      state.textContent=s.title+' · '+s.state+' · '+s.run;
      detail.textContent=s.settlement+' · '+s.receipt;li.append(state,detail);sampleList.append(li);}
  }
  const put=(id,text)=>{const el=get(id);if(el)el.textContent=text;};
  const fail=e=>{const code=/^E_[A-Z0-9_]{1,60}$/.test(String(e?.code))?e.code:'E_CLOUD';
    const help={E_AUTH:'提供者拒绝凭据，请核对配对状态',
      E_PAIRING:'连接尚未完成配对，或需要先解除已有配对',
      E_PAIR_ACTIVE:'此浏览器已在提供者配对，请先撤销旧配对',
      E_EXECUTOR_TARGET:'外部请求没有指向已配对的浏览器',
      E_REVISION:'任务版本或安装授权已变化，请停止后重新批准',
      E_CLOUD_REVOKED:'云控授权已停止，任务不能继续执行',
      E_PERMISSION:'网站或本地 Task 授权已失效，请重新审核',
      E_PROVIDER:'提供者连接异常，请核对 HTTPS 地址和网络'};
    // Only render trusted, fixed local validation messages verbatim. Remote
    // Provider errors remain projected to known codes, never raw page details.
    const local=new Set(['请先核对所选任务的固定版本、网站范围与安装代际',
      '请选择 1–32 项已验证且启用的 Controller Task',
      '请确认允许所选任务的结果回传范围']);
    const safe=local.has(e?.message)?e.message:null;
    brief.textContent='需要处理';
    status.textContent=safe||(help[code]||'操作未完成，请检查连接与授权')+'（'+code+'）';
    myState.textContent='需要处理 · '+code;overview.textContent=status.textContent;};
  // Refresh is deliberately read-only. Cloud claim/dispatch belongs only to poll().
  async function refresh(){
    const s=await cloud.cloudStatus({limit:5});if(disposed)return null;
    const projected=projectCloudStatus(s),summary=cloudHostingSummary(projected);
    brief.textContent=!projected.paired?'未配对':
      !projected.enabled?(s.remoteSuspension==='pending'?'本地已停 · 远端待确认':'已关闭'):
      !projected.online?'连接中':!projected.reconciled?'对账中':!projected.hostReady?'等待宿主':!projected.slotAvailable?'执行槽繁忙':'可用';
    status.textContent=summary+`\n已批准任务 ${projected.approvedTasks} 项 · 历史云请求 ${projected.requests.total} 条 · 已确认回执 ${projected.requests.receivedReceipts} 条（最近 ${projected.requests.sampled} 条统计）`;
    myState.textContent=brief.textContent+' · 已批准 '+projected.approvedTasks+' 项任务';
    overview.textContent=!projected.paired?'还未配对：连接可信提供者后再批准任务。':
      !projected.enabled?(s.remoteSuspension==='pending'?
        '本地已停止执行，但提供者尚未确认暂停；外部请求可能继续排队，重新配对前请确认连接。':
        s.remoteSuspension==='confirmed'?
        '已停止远程执行，提供者也确认不再接收该授权的新任务。':
        '已配对，但未启用任务授权；现在不会接收云端任务。') :
      !projected.online?'云控已启用，正在等待提供者连接。':
      !projected.reconciled?'已连接，正在核对上次运行结果。':
      !projected.slotAvailable?'执行任务中；新的请求会排队。':
      '已连接，等待已授权的任务请求。';
    get('cloud-first-run').hidden=!!s.provider;
    get('cloud-approval-section').hidden=!s.provider;
    put('cloud-next-step','先安装或验证任务，再连接可信提供者并选择允许远程调用的任务。');
    put('cloud-overview-provider',projected.paired?'已配对':'未配对');
    put('cloud-overview-connection',projected.online?'已连接':projected.connection==='backoff'?'重连中':'未连接');
    put('cloud-overview-host',projected.hostReady?'已就绪':'不可用');
    put('cloud-overview-slot',projected.slotAvailable?'空闲':'占用／未就绪');
    put('cloud-overview-tasks',String(projected.approvedTasks));
    put('cloud-overview-requests',String(projected.requests.total));
    sampleView(s);lastFullRefresh=Date.now();await refreshTaskChoices(s);
    get('cloud-pair').disabled=!!s.provider;get('cloud-approve').cloudCanApprove=!!s.provider&&!s.enabled;renderApprovalSummary();get('cloud-stop').disabled=!s.provider||!s.enabled;get('cloud-unpair').disabled=!s.provider;
    return s;
  }
  async function dispatchNext(s){
    if(disposed||!s?.enabled||host.executionPending||starting||!s.online||!s.reconciled)return;
    const next=await cloud.cloudNext({});if(!next||disposed)return;
    starting=true;try{const request=await cloud.cloudResolve(next);await host.start(request);host.completion.catch(fail).finally(()=>{starting=false;});}catch(e){starting=false;throw e;}
  }
  async function action(fn){if(busy)return;busy=true;try{await fn();await refresh();}catch(e){fail(e);}finally{busy=false;}}
  const listeners=[];function click(id,fn){const handler=()=>void action(fn);get(id).addEventListener('click',handler);listeners.push([id,handler]);}
  click('cloud-configure',async()=>{get('cloud-hosting').open=true;get('cloud-url').focus?.();});
  click('cloud-pair',()=>cloud.cloudPair({url:get('cloud-url').value,providerId:get('cloud-provider-id').value.trim(),pairingCode:get('cloud-pairing-code').value.trim(),allowLoopback:get('cloud-loopback').checked}).then(()=>{get('cloud-pairing-code').value='';}));
  const onChoiceChange=event=>{
    const input=event?.target,key=input?.dataset?.cloudTaskKey||input?.dataset?.cloudResultKey;
    if(!key)return;
    const row=taskChoices.find(task=>cloudChoiceKey(task)===key);
    if(!row?.eligible)return;
    const selection=selections.get(key)||{selected:false,resultAllowed:false};
    if(input.dataset.cloudTaskKey)selection.selected=!!input.checked;
    else selection.resultAllowed=!!input.checked;
    selections.set(key,selection);renderApprovalSummary();
  };
  get('cloud-task-list').addEventListener('change',onChoiceChange);
  listeners.push(['cloud-task-list',onChoiceChange,'change']);
  click('cloud-approve',async()=>{
    if(!get('cloud-consent').checked)throw Error('请先核对所选任务的固定版本、网站范围与安装代际');
    const selected=selectedTasks();
    if(!selected.length||selected.length>32)throw Error('请选择 1–32 项已验证且启用的 Controller Task');
    if(selected.some(task=>selections.get(cloudChoiceKey(task)).resultAllowed)&&
      !get('cloud-result-consent').checked)throw Error('请确认允许所选任务的结果回传范围');
    await cloud.cloudApprove({tasks:selected.map(task=>({
      taskId:task.taskId,version:task.version,manifestHash:task.manifestHash,
      sourceHash:task.sourceHash,siteOrigins:task.siteOrigins,
      installationId:task.installationId,generation:task.generation,
      resultAllowed:selections.get(cloudChoiceKey(task)).resultAllowed===true
    }))});
    get('cloud-consent').checked=false;get('cloud-result-consent').checked=false;
  });
  click('cloud-stop',()=>cloud.cloudStop({}));click('cloud-unpair',()=>cloud.cloudUnpair({}));
  // The user's “核对状态” gesture must never itself claim or run a cloud task.
  click('cloud-refresh',async()=>{});
  click('cloud-overview-refresh',async()=>{});
  click('cloud-open-console',()=>api.tabs.create({url:api.runtime.getURL('ui/cloud-control.html')}));
  // Preserve the two-second dispatch cadence without scanning cloud history
  // every time. Visibility changes observations, not execution ownership.
  async function poll(){if(disposed)return;try{if(!busy){
    const s=await cloud.cloudStatus({includeRequests:false});
    if(!busy&&!disposed)await dispatchNext(s);
    const cloudVisible=doc.documentElement?.dataset?.opendeskTab==='cloud';
    if(!busy&&!disposed&&Date.now()-lastFullRefresh>=(cloudVisible?5000:15000))await refresh();
  }}catch(e){if(!disposed)fail(e);}finally{if(!disposed)timer=setTimeout(poll,2000);}}
  void poll();return {refresh,dispose(){disposed=true;clearTimeout(timer);for(const[id,fn,event='click']of listeners)get(id).removeEventListener(event,fn);}};
}
