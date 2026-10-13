// Hosting shares the visible document's existing RunHost and Authority slot.
import {projectCloudStatus,cloudHostingSummary,projectCloudRequestSamples,cloudSlotStateLabel} from './cloud-status-presentation.js';
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
    const requiresReapproval=!authorized&&grants.some(grant=>grant.taskId===row.taskId);
    return {taskId:row.taskId,version:row.version,manifestHash:row.manifestHash,
      sourceHash,installationId:row.installationId??null,generation:row.generation??null,
      title:manifest?.title||row.taskId,description:manifest?.description||'',
      siteOrigins,paramsSchema:manifest?.paramsSchema??null,
      enabled:row.enabled===true,
      eligible,approved:!!authorized,requiresReapproval,
      resultAllowed:authorized?.resultAllowed===true};
  });
}
const cloudChoiceKey=task=>[task.taskId,task.version,task.manifestHash,task.sourceHash,
  task.installationId,task.generation].join('|');

export function createCloudHosting({client,host,document:doc=globalThis.document,api=globalThis.chrome}){
  const get=id=>doc.getElementById(id),cloud=client.cloud;let disposed=false,busy=false,starting=false,timer;
  const status=get('cloud-status'),brief=get('cloud-brief'),myState=get('cloud-my-state');
  const overview=get('cloud-overview-state'),sampleList=get('cloud-request-samples');
  let lastSamples='',lastFullRefresh=0,lastCatalogAt=0,lastCatalogStamp='';
  let requestOffset=0,requestNextOffset=null,selectedRequestIndex=null,selectedOriginalRunId=null;
  let taskChoices=[];const selections=new Map();
  let hostingEnabled=false;
  const updateResultConsent=()=>{get('cloud-result-consent').disabled=busy||hostingEnabled;};
  let statusText=status.textContent,operationFeedback='';
  let activeClientTasks=[],lastClientTasksStamp='',clientNextOffset=null,oneTimeToken='';
  const put=(id,text)=>{const el=get(id);if(el)el.textContent=text;};
  const updateStatus=()=>{status.textContent=[statusText,operationFeedback].filter(Boolean).join('\n');};
  const selectedTasks=()=>taskChoices.filter(task=>
    task.eligible&&selections.get(cloudChoiceKey(task))?.selected);
  function renderApprovalSummary(){
    const selected=selectedTasks(),uploaded=selected.filter(task=>
      selections.get(cloudChoiceKey(task))?.resultAllowed).length;
    put('cloud-approval-summary',selected.length+' 项已选 · '+uploaded+
      ' 项允许回传结果正文；未勾选的任务仅回传最小执行状态。');
    // Review only the selected immutable identities. The HTML must not copy
    // manifest descriptions as markup or disclose their source SHA by default.
    const review=get('cloud-approval-review'),items=get('cloud-review-items');
    review.hidden=selected.length===0;items.replaceChildren();
    for(const task of selected){
      const row=doc.createElement('li'),schema=task.paramsSchema;
      const parameters=schema?.properties?Object.keys(schema.properties).map(name=>
        name+(schema.required?.includes(name)?'（必填）':'（可选）')).join('、'):'待核对';
      row.textContent=task.title+' · v'+task.version+
        ' · 网站：'+task.siteOrigins.join('、')+
        ' · 参数：'+(parameters||'无')+
        ' · 结果正文：'+(selections.get(cloudChoiceKey(task))?.resultAllowed?'允许':'不回传');
      items.append(row);
    }
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
    // An external install/upgrade/consent change makes any earlier human
    // confirmation stale, even when the old Task remains selected.
    get('cloud-consent').checked=false;
    get('cloud-result-consent').checked=false;
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
        (task.approved?' · 当前已批准':task.requiresReapproval?' · 需重新批准':'');
      header.append(check,title);section.append(header);
      if(task.description){const description=doc.createElement('small');
        description.className='cloud-task-description';description.textContent=task.description;
        header.append(description);}
      const scope=doc.createElement('p');scope.className='cloud-task-scope';
      scope.textContent='允许访问：'+(task.siteOrigins.join('、')||'网站范围尚未验证');
      section.append(scope);
      if(task.requiresReapproval){
        const warning=doc.createElement('p');warning.className='cloud-task-needs-review';
        warning.textContent='此任务版本或安装授权已经变化；先停止云控，再核对并重新批准。';
        section.append(warning);
      }
      const params=doc.createElement('p');params.className='cloud-task-params';
      const schema=task.paramsSchema;
      params.textContent='参数许可（固定 Schema）：'+(schema?.properties
        ?Object.entries(schema.properties).map(([name,rule])=>
          name+' ('+rule.type+(schema.required?.includes(name)?'，必填':'，可选')+
          (Array.isArray(rule.enum)?'，选项 '+rule.enum.join('/'):'')+')').join('；')||'无参数'
        :'不可读取');
      section.append(params);
      const label=doc.createElement('label'),result=doc.createElement('input'),copy=doc.createElement('span');
      result.type='checkbox';result.dataset.cloudResultKey=key;result.checked=cloudState.enabled?task.resultAllowed===true:selection.resultAllowed;
      result.disabled=!task.eligible||(cloudState.enabled&&(!task.approved||task.resultAllowed!==true));
      copy.textContent='允许回传结果正文（网页数据、返回值与错误详情）'+
        (task.resultAllowed?' · 当前已授权':' · 默认关闭');
      label.append(result,copy);section.append(label);
      const constraints=doc.createElement('details'),open=doc.createElement('summary'),
        values=doc.createElement('pre');
      constraints.className='od-disclosure od-disclosure--flat';
      open.textContent='查看参数约束';
      values.textContent=JSON.stringify(task.paramsSchema??{},null,2);
      constraints.append(open,values);section.append(constraints);
      const technical=doc.createElement('details'),technicalLabel=doc.createElement('summary'),
        technicalValue=doc.createElement('pre');
      technical.className='od-disclosure od-disclosure--flat';
      technicalLabel.textContent='查看授权状态与固定版本详情';
      const explanation=doc.createElement('p');
      explanation.className='cloud-task-authorization';
      explanation.textContent=task.approved
        ?'当前安装身份已与批准的任务版本一致。结果正文：'+(task.resultAllowed?'已允许回传':'不回传')
        :task.requiresReapproval
          ?'旧云控批准不再匹配当前安装身份。请停止当前托管，重新检查任务的网站和参数后批准。'
          :task.eligible?'该任务可供选择，但尚未批准远程执行。'
            :'该任务尚不可批准，请先在「我的」启用并完成版本验证。';
      technicalValue.textContent=JSON.stringify({
        taskId:task.taskId,version:task.version,manifestHash:task.manifestHash,
        sourceHash:task.sourceHash,installationId:task.installationId,generation:task.generation
      },null,2);
      technical.append(technicalLabel,explanation,technicalValue);section.append(technical);parent.append(section);
    }
    renderApprovalSummary();
  }
  const operationFail=error=>{
    if(disposed)return;
    const messages={E_CLOUD_CONSENT_REQUIRED:'请先核对所选任务的固定版本、网站范围与安装代际。',
      E_CLOUD_TASK_REQUIRED:'请先安装并选择任务。',
      E_CLOUD_RESULT_CONSENT_REQUIRED:'请确认允许所选任务的结果回传范围。',
      E_CLOUD_TASK_SELECTION:'请选择 1–32 项已验证且启用的 Controller Task。',
      E_PAIRING:'配对操作未完成，请核对提供者地址、身份与配对码。',
      E_PAIR_ACTIVE:'此浏览器已在提供者配对，请先撤销旧配对。',
      E_EXECUTOR_TARGET:'外部请求没有指向已配对的浏览器。',
      E_REVISION:'任务版本或安装授权已变化，请停止后重新批准。',
      E_CLOUD_REVOKED:'云控授权已停止，任务不能继续执行。',
      E_PERMISSION:'目标网站访问尚未授权，请核对网站权限。',
      E_PROVIDER:'提供者连接异常，请核对 HTTPS 地址和网络。'};
    operationFeedback=Object.hasOwn(messages,error?.code)?messages[error.code]:
      cloudErrorText(error);
    updateStatus();
  };
  function clearClientToken(){
    oneTimeToken='';
    get('cloud-client-token').value='';
    get('cloud-client-once').hidden=true;
  }
  function updateClientResultChoice(){
    const current=activeClientTasks.find(t=>t.taskId===get('cloud-client-task').value);
    const result=get('cloud-client-result');
    result.disabled=!current?.resultAllowed;
    if(result.disabled)result.checked=false;
  }
  function updateClientTaskChoices(cloudState){
    const approved=cloudState.enabled&&Array.isArray(cloudState.tasks)?cloudState.tasks:[];
    const stamp=JSON.stringify(approved.map(t=>[t.taskId,t.version,t.manifestHash,
      t.sourceHash,t.installationId,t.generation,t.resultAllowed]));
    if(stamp!==lastClientTasksStamp){
      lastClientTasksStamp=stamp;activeClientTasks=approved;
      const select=get('cloud-client-task'),previous=select.value;
      select.replaceChildren();
      if(!approved.length){
        const empty=doc.createElement('option');empty.value='';
        empty.textContent='先批准并启用云控任务';select.append(empty);
        select.value='';
      }else{
        for(const task of approved){
          const opt=doc.createElement('option'),local=taskChoices.find(t=>
            t.taskId===task.taskId&&t.manifestHash===task.manifestHash);
          opt.value=task.taskId;opt.textContent=(local?.title||task.taskId)+' · v'+task.version;
          select.append(opt);
        }
        select.value=approved.some(t=>t.taskId===previous)?previous:approved[0].taskId;
      }
      updateClientResultChoice();
    }
    get('cloud-client-task').disabled=!approved.length;
    get('cloud-client-create').disabled=!approved.length;
    get('cloud-client-refresh').disabled=!cloudState.provider;
  }
  async function refreshClientList({append=false}={}){
    if(append&&clientNextOffset===null)return;
    const offset=append?clientNextOffset:0;
    const response=await cloud.cloudClients({offset,limit:20});
    if(disposed)return;
    const list=get('cloud-clients-list');
    if(!append)list.replaceChildren();
    for(const clientRow of response.clients){
      const row=doc.createElement('li'),copy=doc.createElement('span'),
        revoke=doc.createElement('button');
      row.className='cloud-client-row';
      const names=clientRow.tasks.map(pin=>{
        const task=taskChoices.find(t=>t.taskId===pin.taskId&&t.version===pin.version);
        return task?.title||pin.taskId;
      }).join('、');
      copy.textContent=(clientRow.label||'外部客户端')+' · '+names+
        (clientRow.allowResult?' · 可读取结果':' · 仅任务状态');
      revoke.type='button';revoke.className='od-button od-button--secondary';
      revoke.textContent='撤销';
      let confirmed=false;
      revoke.addEventListener('click',()=>{
        if(!confirmed){confirmed=true;revoke.textContent='确认撤销';return;}
        void action(async()=>{
          await cloud.cloudClientRevoke({clientId:clientRow.clientId});
          clearClientToken();
          await refreshClientList();
          put('cloud-clients-status','外部应用凭据已撤销；历史运行记录仍保留。');
        });
      });
      row.append(copy,revoke);list.append(row);
    }
    if(!list.children.length){
      const empty=doc.createElement('li');empty.textContent='暂无有效的外部应用凭据。';
      list.append(empty);
    }
    clientNextOffset=response.nextOffset??null;
    get('cloud-client-more').hidden=clientNextOffset===null;
    put('cloud-clients-count',String(response.total)+' 个有效授权');
  }
  function closeRequestDetail(){
    selectedRequestIndex=null;selectedOriginalRunId=null;
    get('cloud-request-detail').hidden=true;
    get('cloud-request-open-result').disabled=true;
    put('cloud-request-detail-run-id','');
  }
  function showRequestDetail(sample,raw){
    // Only a trusted cloudStatus Host projection can provide this pointer.
    // Results are NOT copied into the Cloud UI or the external Provider.
    selectedOriginalRunId=typeof raw?.runId==='string'&&
      /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(raw.runId)
      ?raw.runId:null;
    get('cloud-request-detail').hidden=false;
    put('cloud-request-detail-title',sample.title);
    put('cloud-request-detail-state',[sample.state,sample.run].join(' · '));
    put('cloud-request-detail-facts',[sample.result,sample.settlement,sample.receipt].join(' · '));
    put('cloud-request-detail-reason',sample.reason||'暂无其他状态信息。');
    put('cloud-request-detail-run-id',selectedOriginalRunId||'尚无可核对的原始 Run');
    get('cloud-request-open-result').disabled=!selectedOriginalRunId;
    put('cloud-request-detail-note',selectedOriginalRunId
      ?'仅在本机可信「开发 → 运行记录」读取原始数据，仍受原网站和 Run 授权限制；不会重新执行，也不扩大外部结果权限。'
      :'该请求尚未绑定可查询的原始 Run；状态未知时请勿重新执行。');
  }
  function sampleView(samples,rawRows=[]){
    const serial=JSON.stringify([requestOffset,samples,rawRows.map(row=>row?.runId??null)]);
    if(serial===lastSamples)return;lastSamples=serial;sampleList.replaceChildren();
    if(!samples.length){const li=doc.createElement('li');li.textContent='此页暂无请求记录';sampleList.append(li);closeRequestDetail();return;}
    samples.forEach((s,i)=>{
      const li=doc.createElement('li'),state=doc.createElement('span'),
        detail=doc.createElement('span'),button=doc.createElement('button');
      state.textContent=[s.title,s.state,s.run].filter(Boolean).join(' · ');
      detail.textContent=[s.result,s.settlement,s.receipt,s.reason].filter(Boolean).join(' · ');
      button.type='button';button.className='od-button od-button--secondary';
      button.textContent='查看详情';
      button.addEventListener('click',()=>{
        selectedRequestIndex=requestOffset+i;
        showRequestDetail(s,rawRows[i]);
        get('cloud-request-detail-title').focus?.();
      });
      li.append(state,detail,button);sampleList.append(li);
    });
    const i=selectedRequestIndex===null?-1:selectedRequestIndex-requestOffset;
    if(i>=0&&i<samples.length)showRequestDetail(samples[i],rawRows[i]);
    else closeRequestDetail();
  }
  const cloudErrorText=e=>{let code=/^E_[A-Z0-9_]{1,60}$/.test(String(e?.code))?e.code:'E_CLOUD';
    const help={E_AUTH:'提供者拒绝凭据，请核对配对状态',
      E_PAIRING:'连接尚未完成配对，或需要先解除已有配对',
      E_PAIR_ACTIVE:'此浏览器已在提供者配对，请先撤销旧配对',
      E_EXECUTOR_TARGET:'外部请求没有指向已配对的浏览器',
      E_REVISION:'任务版本或安装授权已变化，请停止后重新批准',
      E_CLOUD_REVOKED:'云控授权已停止，任务不能继续执行',
      E_PERMISSION:'网站或本地 Task 授权已失效，请重新审核',
      E_PROVIDER:'提供者连接异常，请核对 HTTPS 地址和网络',
      E_CLIENT:'该外部应用授权已失效，请刷新列表',
      E_CLIENT_SCOPE:'外部应用只能调用当前已批准且版本匹配的任务，结果权限不能扩大',
      E_CLIENT_LIMIT:'外部授权数量已达上限，请先撤销不用的应用',
      E_CLOUD_STOPPED:'云控已停用，请先重新批准当前任务'};
    if(!Object.hasOwn(help,code))code='E_CLOUD';
    // Only render trusted, fixed local validation messages verbatim. Remote
    // Provider errors remain projected to known codes, never raw page details.
    const local=new Set(['请先核对所选任务的固定版本、网站范围与安装代际',
      '请选择 1–32 项已验证且启用的 Controller Task',
      '请确认允许所选任务的结果回传范围','请填写外部应用名称']);
    const safe=local.has(e?.message)?e.message:null;
    return safe||(help[code]||'操作未完成，请检查连接与授权')+'（'+code+'）';
  };
  const fail=error=>{
    if(disposed)return;
    brief.textContent='状态异常';statusText='云控状态暂不可读取，请稍后核对。'+(error?' '+cloudErrorText(error):'');updateStatus();
    myState.textContent='状态不可读取';overview.textContent='云端托管状态暂不可读取';
    for(const metric of ['provider','connection','host','slot','tasks','requests'])put('cloud-overview-'+metric,'待核对');
    get('cloud-pair').disabled=true;get('cloud-approve').disabled=true;
    get('cloud-refresh').disabled=false;get('cloud-overview-refresh').disabled=false;
    lastSamples='';sampleList.replaceChildren();const li=doc.createElement('li');li.textContent='请求状态暂不可读取';sampleList.append(li);
    closeRequestDetail();get('cloud-request-prev').disabled=true;get('cloud-request-next').disabled=true;
    put('cloud-request-page','历史状态不可读取');
  };
  // Refresh is deliberately read-only. Cloud claim/dispatch belongs only to poll().
  async function refresh(){
    const s=await cloud.cloudStatus({limit:5,...(requestOffset?{offset:requestOffset}:{})});if(disposed)return null;
    const projected=projectCloudStatus(s),summary=cloudHostingSummary(projected),samples=projectCloudRequestSamples(s);
    brief.textContent=projected.revocation==='pending'?'本机已停止；服务端撤销待确认':projected.revocation==='unknown'?'撤销状态待核对':
      !projected.paired?(projected.revocation==='confirmed'?'撤销已确认':'未配对'):!projected.enabled?(projected.remoteSuspension==='pending'?'本地已停 · 远端待确认':'已关闭'):!projected.online?'连接中':!projected.reconciled?'对账中':!projected.hostReady?'宿主未就绪':
      projected.siteAuthorization==='revoked'?'网站访问已撤销':projected.siteAuthorization==='none'?'未批准网站范围':projected.siteAuthorization!=='granted'?'网站授权待核对':
      !projected.slotAvailable?cloudSlotStateLabel(projected.slotState):projected.pendingResources!==false?'待处理资源待核对':'可用';
    statusText=summary+`\n已批准任务 ${projected.approvedTasks} 项 · 历史云请求 ${projected.requests.total} 条 · 已确认回执 ${projected.requests.receivedReceipts} 条（最近 ${projected.requests.sampled} 条统计）`;updateStatus();
    const latest=samples[0];
    myState.textContent=brief.textContent+' · 已批准 '+projected.approvedTasks+' 项任务'+
      (projected.pendingResources===true?' · 仍有待处理资源，等待停止、核对及资源释放':projected.pendingResources===false?'':' · 待处理资源状态待核对')+
      (latest?' · 最近请求：'+[latest.title,latest.state,latest.run,latest.result,latest.settlement,latest.receipt,latest.reason].filter(Boolean).join(' · '):'');
    overview.textContent=summary;
    get('cloud-first-run').hidden=!!s.provider;
    get('cloud-approval-section').hidden=!s.provider;
    put('cloud-next-step','先安装或验证任务，再连接可信提供者并选择允许远程调用的任务。');
    put('cloud-overview-provider',projected.paired?'已配对':'未配对');
    put('cloud-overview-connection',projected.online?'已连接':projected.connection==='backoff'?'重连中':'未连接');
    put('cloud-overview-host',projected.hostReady?'已就绪':'不可用');
    put('cloud-overview-slot',cloudSlotStateLabel(projected.slotState));
    put('cloud-overview-tasks',String(projected.approvedTasks));
    put('cloud-overview-requests',String(projected.requests.total));
    hostingEnabled=s.enabled===true;updateResultConsent();
    requestNextOffset=Number.isSafeInteger(s.requestPage?.nextOffset)?s.requestPage.nextOffset:null;
    get('cloud-request-prev').disabled=requestOffset===0;
    get('cloud-request-next').disabled=requestNextOffset===null;
    const total=projected.requests.total,shown=samples.length;
    put('cloud-request-page',total&&shown
      ?'第 '+(requestOffset+1)+'–'+(requestOffset+shown)+' 条 / '+total+' 条':'暂无请求');
    sampleView(samples,shown?s.requests.slice(-shown).reverse():[]);
    lastFullRefresh=Date.now();await refreshTaskChoices(s);
    updateClientTaskChoices(s);
    if(!s.provider){clearClientToken();clientNextOffset=null;
      get('cloud-clients-list').replaceChildren();
      put('cloud-clients-count','按需管理');}
    get('cloud-pair').disabled=projected.paired||projected.revocation==='pending'||projected.revocation==='unknown';
    get('cloud-approve').cloudCanApprove=!!s.provider&&!s.enabled&&projected.revocation!=='pending'&&projected.revocation!=='unknown';
    renderApprovalSummary();get('cloud-stop').disabled=!s.provider||!s.enabled;get('cloud-unpair').disabled=!s.provider;
    return s;
  }
  async function dispatchNext(s){
    if(disposed||!s?.enabled||host.executionPending||starting||!s.online||!s.reconciled)return;
    const next=await cloud.cloudNext({});if(!next||disposed)return;
    starting=true;try{const request=await cloud.cloudResolve(next);await host.start(request);host.completion.catch(operationFail).finally(()=>{starting=false;});}catch(e){starting=false;throw e;}
  }
  async function action(fn,readOnly){if(busy)return;busy=true;updateResultConsent();
    operationFeedback='';updateStatus();
    try{
      if(!readOnly){try{await fn();}catch(error){operationFail(error);return;}}
      try{await refresh();}catch{fail();}
    }finally{busy=false;updateResultConsent();}
  }
  const listeners=[];function click(id,fn){
    const readOnly=id==='cloud-refresh'||id==='cloud-overview-refresh';
    const handler=()=>void action(fn,readOnly);get(id).addEventListener('click',handler);listeners.push([id,handler]);}
  click('cloud-configure',async()=>{get('cloud-hosting').open=true;get('cloud-url').focus?.();});
  click('cloud-pair',()=>cloud.cloudPair({url:get('cloud-url').value,providerId:get('cloud-provider-id').value.trim(),pairingCode:get('cloud-pairing-code').value.trim(),allowLoopback:get('cloud-loopback').checked}).then(()=>{get('cloud-pairing-code').value='';}));
  const onChoiceChange=event=>{
    const input=event?.target,key=input?.dataset?.cloudTaskKey||input?.dataset?.cloudResultKey;
    if(!key)return;
    const row=taskChoices.find(task=>cloudChoiceKey(task)===key);
    if(!row?.eligible)return;
    if(hostingEnabled){if(!input.dataset.cloudResultKey||input.checked||!row.approved||!row.resultAllowed)return;void action(async()=>{try{const result=await cloud.cloudRevokeResults({taskId:row.taskId});lastCatalogAt=0;operationFeedback='所选任务的结果回传授权已撤销；托管状态保持不变。';return result;}catch(error){lastCatalogAt=0;await refresh().catch(()=>fail());throw error;}},false);return;}
    const selection=selections.get(key)||{selected:false,resultAllowed:false};
    if(input.dataset.cloudTaskKey)selection.selected=!!input.checked;
    else selection.resultAllowed=!!input.checked;
    selections.set(key,selection);
    // A user must confirm the exact current selection, not an earlier
    // version of the list or an earlier result-body consent scope.
    get('cloud-consent').checked=false;
    get('cloud-result-consent').checked=false;
    renderApprovalSummary();
  };
  get('cloud-task-list').addEventListener('change',onChoiceChange);
  listeners.push(['cloud-task-list',onChoiceChange,'change']);
  click('cloud-approve',async()=>{
    if(!get('cloud-consent').checked)throw {code:'E_CLOUD_CONSENT_REQUIRED'};
    const selected=selectedTasks();
    if(!selected.length||selected.length>32)throw {code:'E_CLOUD_TASK_SELECTION'};
    if(selected.some(task=>selections.get(cloudChoiceKey(task)).resultAllowed)&&
      !get('cloud-result-consent').checked)throw {code:'E_CLOUD_RESULT_CONSENT_REQUIRED'};
    await cloud.cloudApprove({tasks:selected.map(task=>({
      taskId:task.taskId,version:task.version,manifestHash:task.manifestHash,
      sourceHash:task.sourceHash,siteOrigins:task.siteOrigins,
      installationId:task.installationId,generation:task.generation,
      resultAllowed:selections.get(cloudChoiceKey(task)).resultAllowed===true
    }))});
    get('cloud-consent').checked=false;get('cloud-result-consent').checked=false;
  });
  click('cloud-stop',async()=>{await cloud.cloudStop({});clearClientToken();});
  click('cloud-unpair',async()=>{await cloud.cloudUnpair({});clearClientToken();});
  click('cloud-client-refresh',()=>refreshClientList());
  click('cloud-client-more',()=>refreshClientList({append:true}));
  click('cloud-client-create',async()=>{
    const label=get('cloud-client-name').value.trim();
    if(!label)throw Error('请填写外部应用名称');
    const taskId=get('cloud-client-task').value;
    const selected=activeClientTasks.find(t=>t.taskId===taskId);
    if(!selected)throw Object.assign(Error('Task not approved'),{code:'E_CLIENT_SCOPE'});
    const allowResult=get('cloud-client-result').checked===true;
    if(allowResult&&!selected.resultAllowed)
      throw Object.assign(Error('Result not approved'),{code:'E_CLIENT_SCOPE'});
    clearClientToken();
    const issued=await cloud.cloudClientGrant({label,taskId,allowResult});
    if(!/^[a-f0-9]{64}$/.test(issued?.credential))
      throw Object.assign(Error('Invalid issued credential'),{code:'E_AUTH'});
    oneTimeToken=issued.credential;
    get('cloud-client-token').value=oneTimeToken;
    get('cloud-client-once').hidden=false;
    get('cloud-client-result').checked=false;
    await refreshClientList();
    put('cloud-clients-status','已创建“'+label+'”的专用凭据。请立即复制并通过可信渠道交给外部应用，离开本面板后无法再次查看。');
  });
  click('cloud-client-copy',async()=>{
    if(!oneTimeToken)return;
    if(!globalThis.navigator?.clipboard?.writeText)
      throw Object.assign(Error('Clipboard unavailable'),{code:'E_CLIPBOARD'});
    await globalThis.navigator.clipboard.writeText(oneTimeToken);
    put('cloud-clients-status','密钥已复制；不要发送到公开聊天或日志。');
  });
  const onClientTaskChange=()=>updateClientResultChoice();
  get('cloud-client-task').addEventListener('change',onClientTaskChange);
  listeners.push(['cloud-client-task',onClientTaskChange,'change']);
  const onClientPanelToggle=()=>{if(!get('cloud-clients').open)clearClientToken();};
  get('cloud-clients').addEventListener('toggle',onClientPanelToggle);
  listeners.push(['cloud-clients',onClientPanelToggle,'toggle']);
  // The user's “核对状态” gesture must never itself claim or run a cloud task.
  click('cloud-refresh',async()=>{});
  click('cloud-overview-refresh',async()=>{});
  // Paged reads do not claim, renew, replay or otherwise mutate a Cloud Job.
  click('cloud-request-prev',async()=>{requestOffset=Math.max(0,requestOffset-5);closeRequestDetail();});
  click('cloud-request-next',async()=>{
    if(requestNextOffset!==null){requestOffset=requestNextOffset;closeRequestDetail();}
  });
  click('cloud-request-close',async()=>{closeRequestDetail();});
  click('cloud-request-open-result',async()=>{
    if(!selectedOriginalRunId)return;
    const tab=get('tab-develop'),field=get('script-run-id'),query=get('script-read-run');
    if(!tab?.click||!field||!query?.click)throw {code:'E_CLOUD_RESULT_VIEW'};
    // Reuse the existing authenticated Controller snapshot route and its
    // result-delivery permission checks. Never execute the Task again.
    get('developer-results-panel').open=true;
    get('script-history-panel').open=true;
    field.value=selectedOriginalRunId;
    tab.click();query.click();
  });
  click('cloud-open-console',async()=>{await api.tabs.create({url:api.runtime.getURL('ui/cloud-control.html')});});
  // Preserve the two-second dispatch cadence without scanning cloud history
  // every time. Visibility changes observations, not execution ownership.
  async function poll(){if(disposed)return;try{if(!busy){
    const s=await cloud.cloudStatus({includeRequests:false});
    if(!busy&&!disposed)try{await dispatchNext(s);}catch(error){operationFail(error);}
    const cloudVisible=doc.documentElement?.dataset?.opendeskTab==='cloud';
    if(!busy&&!disposed&&Date.now()-lastFullRefresh>=(cloudVisible?5000:15000))await refresh();
  }}catch(e){if(!disposed)fail(e);}finally{if(!disposed)timer=setTimeout(poll,2000);}}
  void poll();return {refresh,dispose(){disposed=true;clearClientToken();clearTimeout(timer);for(const[id,fn,event='click']of listeners)get(id).removeEventListener(event,fn);}};
}
