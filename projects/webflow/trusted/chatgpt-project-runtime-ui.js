// First-party trusted Options UI. It never imports Host internals, uses a
// sandbox bridge, or pretends to be the original ChatGPT MessageSender.
const PROTOCOL='opendesk.chatgpt.project.v1';
const KEYS=['sourceTabId','sourceDocumentId','projectId'];
const sourceKey=source=>JSON.stringify([source.sourceTabId,source.sourceDocumentId]);
const validSource=source=>Number.isSafeInteger(source?.sourceTabId)&&source.sourceTabId>=0&&
  typeof source.sourceDocumentId==='string'&&source.sourceDocumentId.length>0&&
  typeof source.sourceUrl==='string'&&source.sourceUrl.startsWith('https://chatgpt.com/');
const taskKey=task=>JSON.stringify(KEYS.map(k=>task[k]));
const validTask=task=>Number.isSafeInteger(task?.sourceTabId)&&task.sourceTabId>=0&&
  typeof task.sourceDocumentId==='string'&&task.sourceDocumentId.length>0&&
  typeof task.projectId==='string'&&task.projectId.length>0&&
  typeof task.sourceUrl==='string'&&task.sourceUrl.startsWith('https://chatgpt.com/');

export function initChatGPTProjectRuntimeUI({api=globalThis.chrome,document:doc=globalThis.document}={}){
  const byId=id=>doc.getElementById('chatgpt-file-run-'+id);
  const choice=byId('choice'),refresh=byId('refresh'),inspect=byId('inspect'),stop=byId('stop'),
    review=byId('review'),sourceChoice=byId('source-choice'),manualOpen=byId('source-open'),
    status=byId('status'),receipt=byId('receipt');
  if(!choice||!refresh||!inspect||!stop||!review||!sourceChoice||!manualOpen||!status||!receipt)return ()=>{};
  let tasks=[],selected='',sources=[],selectedSource='',busy=false,disposed=false,revision=0;
  let stopSettlement=null,persistentError=false;
  const events=[];
  const listen=(target,type,fn)=>{target.addEventListener(type,fn);events.push(()=>target.removeEventListener(type,fn));};
  const clearReceipt=()=>{receipt.textContent='';receipt.hidden=true;};
  const current=()=>tasks.find(item=>taskKey(item)===selected);
  const render=()=>{
    choice.disabled=busy||tasks.length===0;
    sourceChoice.disabled=busy||sources.length===0;
    manualOpen.disabled=busy||!sources.some(x=>sourceKey(x)===selectedSource);
    refresh.disabled=busy;
    inspect.disabled=stop.disabled=review.disabled=busy||!current();
  };
  const selectTasks=rows=>{
    const previous=selected;
    tasks=rows;
    choice.replaceChildren();
    const placeholder=doc.createElement('option');
    placeholder.value='';placeholder.textContent='请选择原始 ChatGPT 文件任务';
    choice.append(placeholder);
    for(const task of tasks){
      const option=doc.createElement('option');
      option.value=taskKey(task);
      option.textContent=task.sourceUrl+' · '+task.phase;
      choice.append(option);
    }
    selected=tasks.some(t=>taskKey(t)===previous)?previous:'';
    choice.value=selected;
    render();
  };
  const selectSources=rows=>{
    const previous=selectedSource;
    sources=rows;
    sourceChoice.replaceChildren();
    const empty=doc.createElement('option');
    empty.value='';empty.textContent='请选择当前窗口的 ChatGPT 对话';
    sourceChoice.append(empty);
    for(const source of sources){
      const item=doc.createElement('option');
      item.value=sourceKey(source);item.textContent=source.sourceUrl;
      sourceChoice.append(item);
    }
    selectedSource=sources.some(x=>sourceKey(x)===previous)?previous:'';
    sourceChoice.value=selectedSource;render();
  };
  const request=async(action,task)=>{
    const payload={protocol:PROTOCOL,action};
    if(task)for(const key of KEYS)if(task[key]!==undefined)payload[key]=task[key];
    const response=await api.runtime.sendMessage(payload);
    if(response?.ok!==true)throw response?.error||{code:'E_FILE_ACK',message:'没有可信回执，不得重试有副作用的操作'};
    return response.data;
  };
  const errorMessage=error=>(error?.code||'E_FILE_REQUEST')+'：'+(error?.message||'请求结果未确认。');
  const validateStatus=(data,task)=>{
    if(data?.projectId!==task.projectId||data?.sourceTabId!==task.sourceTabId||
      data?.sourceDocumentId!==task.sourceDocumentId||typeof data.phase!=='string')
      throw {code:'E_PROJECT_SOURCE',message:'回执与原任务身份不一致'};
  };
  const showReceipt=(data,task)=>{
    const output={sourceUrl:task.sourceUrl,phase:data.phase,message:data.message,
      projectConnection:data.projectConnection,resultStatus:data.resultStatus,
      result:data.result,resultText:data.resultText,comparison:data.comparison,
      delivery:data.delivery,observed:data.observed};
    receipt.textContent=JSON.stringify(output,null,2);receipt.hidden=false;
  };
  // Stop fences future work; it does not undo already dispatched Native effects.
  const stopMessage=phase=>'停止请求已接收；后续文件操作已阻止；当前阶段：'+phase+'；已派发副作用仍以真实回执为准，不能视作撤回。';
  // A tasks write may be Stop's own persistence, but is never authority to
  // redisplay its cached bytes. Recheck only the same task through the runtime.
  async function reconcileStop(settlement){
    const version=revision;
    const active=()=>!disposed&&version===revision&&stopSettlement===settlement&&selected===settlement.selected;
    try{
      const data=await request('project-status',settlement.task);
      if(!active())return;
      validateStatus(data,settlement.task);
      showReceipt(data,settlement.task);
      tasks=tasks.map(row=>taskKey(row)===selected?{...row,phase:data.phase}:row);
      if(!persistentError)status.textContent=stopMessage(data.phase)+' 已重新核对同一任务；不会重放。';
    }catch(error){
      if(active()){persistentError=true;status.textContent=errorMessage(error)+' 已收到停止请求回执，但当前详情尚未确认；请查询原任务，不要重新派发。';}
    }
  }
  async function refreshList(){
    if(disposed||busy)return;
    const version=++revision;
    stopSettlement=null;persistentError=false;
    busy=true;render();status.textContent='正在读取原任务列表…';clearReceipt();
    try{
      const data=await request('project-list');
      if(disposed||revision!==version)return;
      if(!Array.isArray(data?.tasks)||data.tasks.length>128||data.tasks.some(t=>!validTask(t)))
        throw {code:'E_FILE_SCHEMA',message:'任务列表回执无效'};
      const possible=data.sources||[];
      if(!Array.isArray(possible)||possible.length>32||possible.some(x=>!validSource(x)))
        throw {code:'E_FILE_SCHEMA',message:'原对话来源列表无效'};
      selectTasks(data.tasks);selectSources(possible);
      status.textContent=data.tasks.length?'请选择任务后查询真实状态或停止。':
        '当前没有已有项目任务；可以选择当前窗口的 ChatGPT 对话开启可信人工文件审阅。';
    }catch(error){
      if(!disposed&&revision===version){persistentError=true;selectTasks([]);selectSources([]);status.textContent=errorMessage(error);}
    }finally{busy=false;if(!disposed)render();}
  }
  async function perform(action){
    if(disposed||busy||!current())return;
    const task=current(),selectedAtStart=selected;
    const version=++revision;
    stopSettlement=null;persistentError=false;
    const settlement=action==='project-stop'?{task,selected:selectedAtStart,pending:true,changed:false}:null;
    stopSettlement=settlement;
    busy=true;render();clearReceipt();
    status.textContent=action==='project-stop'?'正在停止原任务；已派发副作用仍按原回执结算…':
      action==='project-review'?'正在打开绑定原对话的可信审阅页…':'正在核验原任务、当前授权及文件结果…';
    try{
      const data=await request(action,task);
      if(disposed||selectedAtStart!==selected||
        (version!==revision&&(!settlement||stopSettlement!==settlement)))return;
      if(action==='project-review'){
        if(data?.opened!==true)throw {code:'E_FILE_HANDOFF',message:'可信审阅页未确认打开'};
        status.textContent='已打开可信文件审阅页；需在该页面独立核对权限与具体修改。';
      }else{
        validateStatus(data,task);
        status.textContent=action==='project-stop'?stopMessage(data.phase):
          '已从原请求查询当前可信状态。仅此页显示经授权的文件详情。';
        if(action==='project-stop')tasks=tasks.map(row=>taskKey(row)===selected?{...row,phase:data.phase}:row);
        if(settlement){
          settlement.pending=false;
          if(settlement.changed)await reconcileStop(settlement);
          else showReceipt(data,task);
        }else showReceipt(data,task);
      }
    }catch(error){
      if(!disposed&&(version===revision||(settlement&&stopSettlement===settlement))){
        stopSettlement=null;persistentError=true;status.textContent=errorMessage(error)+
        (action==='project-stop'||action==='project-review'?' 请先刷新并核对原状态，不要凭未知回执重新操作。':'');
      }
    }finally{busy=false;if(!disposed)render();}
  }
  async function openManual(){
    if(disposed||busy)return;
    const source=sources.find(x=>sourceKey(x)===selectedSource);
    if(!source)return;
    const version=++revision;
    stopSettlement=null;persistentError=false;
    busy=true;render();clearReceipt();
    status.textContent='正在按当前窗口的原会话身份打开可信文件审阅页…';
    try{
      const data=await request('review-source',source);
      if(disposed||revision!==version||selectedSource!==sourceKey(source))return;
      if(data?.opened!==true)throw {code:'E_FILE_HANDOFF',message:'没有取得一次性审阅入口的确认'};
      status.textContent='已打开绑定该 ChatGPT 对话的一次性可信审阅页；文件访问仍须独立审阅授权。';
    }catch(error){
      if(!disposed&&revision===version){persistentError=true;status.textContent=errorMessage(error)+
        ' 请核对是否已打开审阅页；未知结果不得直接重复领取。';}
    }finally{busy=false;if(!disposed)render();}
  }
  listen(refresh,'click',event=>{if(event.isTrusted)void refreshList();});
  listen(choice,'change',event=>{
    if(!event.isTrusted||busy)return;
    revision++;stopSettlement=null;persistentError=false;selected=choice.value;clearReceipt();status.textContent='选择已变化，需重新查询原任务。';render();
  });
  listen(sourceChoice,'change',event=>{
    if(!event.isTrusted||busy)return;
    revision++;stopSettlement=null;persistentError=false;selectedSource=sourceChoice.value;clearReceipt();status.textContent='已选择原对话；打开审阅前会重新核对身份。';render();
  });
  listen(manualOpen,'click',event=>{if(event.isTrusted&&!manualOpen.disabled)void openManual();});
  for(const [button,action] of [[inspect,'project-status'],[stop,'project-stop'],[review,'project-review']])
    listen(button,'click',event=>{if(event.isTrusted&&!button.disabled)void perform(action);});
  // If the original grant or task ledger changes, previously displayed file
  // bytes must not linger in this visible extension document.
  const onStorage=(changes,area)=>{
    if(disposed||area!=='local')return;
    const grantsChanged=Object.hasOwn(changes,'opendesk.chatgpt.files.grants.v1');
    if(grantsChanged||Object.hasOwn(changes,'opendesk.chatgpt.files.tasks.v1')){
      revision++;clearReceipt();
      if(grantsChanged)stopSettlement=null;
      if(stopSettlement){
        stopSettlement.changed=true;
        if(!stopSettlement.pending)void reconcileStop(stopSettlement);
      }else if(!persistentError)status.textContent='授权或任务状态已变化，请重新查询。';
    }
  };
  api.storage?.onChanged?.addListener(onStorage);
  const destroy=()=>{
    if(disposed)return;
    disposed=true;revision++;clearReceipt();
    for(const remove of events)remove();
    api.storage?.onChanged?.removeListener(onStorage);
  };
  listen(doc.defaultView,'pagehide',destroy);
  selectTasks([]);selectSources([]);
  void refreshList();
  return destroy;
}
