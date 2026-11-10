// First-party trusted Options UI. It never imports Host internals, uses a
// sandbox bridge, or pretends to be the original ChatGPT MessageSender.
const PROTOCOL='opendesk.chatgpt.project.v1';
const KEYS=['sourceTabId','sourceDocumentId','projectId'];
const taskKey=task=>JSON.stringify(KEYS.map(k=>task[k]));
const validTask=task=>Number.isSafeInteger(task?.sourceTabId)&&task.sourceTabId>=0&&
  typeof task.sourceDocumentId==='string'&&task.sourceDocumentId.length>0&&
  typeof task.projectId==='string'&&task.projectId.length>0&&
  typeof task.sourceUrl==='string'&&task.sourceUrl.startsWith('https://chatgpt.com/');

export function initChatGPTProjectRuntimeUI({api=globalThis.chrome,document:doc=globalThis.document}={}){
  const byId=id=>doc.getElementById('chatgpt-file-run-'+id);
  const choice=byId('choice'),refresh=byId('refresh'),inspect=byId('inspect'),stop=byId('stop'),
    review=byId('review'),status=byId('status'),receipt=byId('receipt');
  if(!choice||!refresh||!inspect||!stop||!review||!status||!receipt)return ()=>{};
  let tasks=[],selected='',busy=false,disposed=false,revision=0;
  const events=[];
  const listen=(target,type,fn)=>{target.addEventListener(type,fn);events.push(()=>target.removeEventListener(type,fn));};
  const clearReceipt=()=>{receipt.textContent='';receipt.hidden=true;};
  const current=()=>tasks.find(item=>taskKey(item)===selected);
  const render=()=>{
    choice.disabled=busy||tasks.length===0;
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
  const request=async(action,task)=>{
    const payload={protocol:PROTOCOL,action};
    if(task)for(const key of KEYS)payload[key]=task[key];
    const response=await api.runtime.sendMessage(payload);
    if(response?.ok!==true)throw response?.error||{code:'E_FILE_ACK',message:'没有可信回执，不得重试有副作用的操作'};
    return response.data;
  };
  const errorMessage=error=>(error?.code||'E_FILE_REQUEST')+'：'+(error?.message||'请求结果未确认。');
  async function refreshList(){
    if(disposed||busy)return;
    const version=++revision;
    busy=true;render();status.textContent='正在读取原任务列表…';clearReceipt();
    try{
      const data=await request('project-list');
      if(disposed||revision!==version)return;
      if(!Array.isArray(data?.tasks)||data.tasks.length>128||data.tasks.some(t=>!validTask(t)))
        throw {code:'E_FILE_SCHEMA',message:'任务列表回执无效'};
      selectTasks(data.tasks);
      status.textContent=data.tasks.length?'请选择任务后查询真实状态或停止。':'当前没有可管理的项目文件任务。';
    }catch(error){
      if(!disposed&&revision===version){selectTasks([]);status.textContent=errorMessage(error);}
    }finally{busy=false;if(!disposed)render();}
  }
  async function perform(action){
    if(disposed||busy||!current())return;
    const task=current(),selectedAtStart=selected;
    const version=++revision;
    busy=true;render();clearReceipt();
    status.textContent=action==='project-stop'?'正在停止原任务；已派发副作用仍按原回执结算…':
      action==='project-review'?'正在打开绑定原对话的可信审阅页…':'正在核验原任务、当前授权及文件结果…';
    try{
      const data=await request(action,task);
      if(disposed||version!==revision||selectedAtStart!==selected)return;
      if(action==='project-review'){
        if(data?.opened!==true)throw {code:'E_FILE_HANDOFF',message:'可信审阅页未确认打开'};
        status.textContent='已打开可信文件审阅页；需在该页面独立核对权限与具体修改。';
      }else{
        if(data?.projectId!==task.projectId||data?.sourceTabId!==task.sourceTabId||
          data?.sourceDocumentId!==task.sourceDocumentId||typeof data.phase!=='string')
          throw {code:'E_PROJECT_SOURCE',message:'回执与原任务身份不一致'};
        status.textContent=action==='project-stop'?'原文件任务已停止；不自动重新派发。':
          '已从原请求查询当前可信状态。仅此页显示经授权的文件详情。';
        const output={sourceUrl:task.sourceUrl,phase:data.phase,message:data.message,
          projectConnection:data.projectConnection,resultStatus:data.resultStatus,
          result:data.result,resultText:data.resultText,comparison:data.comparison,
          delivery:data.delivery,observed:data.observed};
        receipt.textContent=JSON.stringify(output,null,2);
        receipt.hidden=false;
        if(action==='project-stop')tasks=tasks.map(row=>taskKey(row)===selected?{...row,phase:data.phase}:row);
      }
    }catch(error){
      if(!disposed&&version===revision)status.textContent=errorMessage(error)+
        (action==='project-stop'||action==='project-review'?' 请先刷新并核对原状态，不要凭未知回执重新操作。':'');
    }finally{busy=false;if(!disposed)render();}
  }
  listen(refresh,'click',event=>{if(event.isTrusted)void refreshList();});
  listen(choice,'change',event=>{
    if(!event.isTrusted||busy)return;
    selected=choice.value;clearReceipt();status.textContent='选择已变化，需重新查询原任务。';render();
  });
  for(const [button,action] of [[inspect,'project-status'],[stop,'project-stop'],[review,'project-review']])
    listen(button,'click',event=>{if(event.isTrusted&&!button.disabled)void perform(action);});
  // If the original grant or task ledger changes, previously displayed file
  // bytes must not linger in this visible extension document.
  const onStorage=(changes,area)=>{
    if(disposed||area!=='local')return;
    if(Object.hasOwn(changes,'opendesk.chatgpt.files.grants.v1')||
      Object.hasOwn(changes,'opendesk.chatgpt.files.tasks.v1')){
      revision++;clearReceipt();status.textContent='授权或任务状态已变化，请重新查询。';
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
  selectTasks([]);
  void refreshList();
  return destroy;
}
