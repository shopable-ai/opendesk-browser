import {validateTaskParams} from '../platform/tasks/contract.js';
import {validateScheduleInput} from '../platform/tasks/schedule-contract.js';
import {permissionPattern} from '../environment.js';
import {decodeValue} from '../platform/page-port/codec.js';
import {presentTaskValue} from './task-run-diagnostics.js';

const fail=(code,message)=>Object.assign(new Error(message),{code});
const allowed=new Set(['list_tasks','get_task','task_history','run_task','stop_task',
  'set_task_enabled','list_schedules','get_schedule','schedule_history',
  'create_schedule','change_schedule']);
const changes=new Set(['run_task','stop_task','set_task_enabled','create_schedule','change_schedule']);
const clip=(value,max=300)=>String(value??'').slice(0,max);
const plain=value=>Boolean(value&&typeof value==='object'&&!Array.isArray(value)&&
  (Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null));
const requireString=(value,label,max=160)=>{
  if(typeof value!=='string'||!value.trim()||value.length>max)
    throw fail('E_AI_SCHEMA',label+'缺失或过长');
  return value.trim();
};
const requireId=(value,name)=>requireString(value,name,120);
const limited=(value,limit=8)=>Number.isInteger(value)&&value>=1&&value<=limit?value:limit;
const stopCheck=signal=>{if(signal?.aborted)throw fail('E_CANCELLED','已停止 AI 后续操作；已启动的任务不会被自动停止');};
const isTerminal=state=>['completed','failed','stopped','interrupted','paused_unknown'].includes(state);

export function validateMyTaskAgentProposal(proposal){
  if(!plain(proposal)||Object.keys(proposal).some(key=>!['actions','question'].includes(key)))
    throw fail('E_AI_SCHEMA','AI 返回了不受支持的操作结构');
  if(typeof proposal.question==='string'&&!Object.hasOwn(proposal,'actions'))
    return {question:requireString(proposal.question,'问题',800),actions:[]};
  if(!Array.isArray(proposal.actions)||proposal.actions.length<1||proposal.actions.length>4)
    throw fail('E_AI_SCHEMA','AI 每轮只能提出一至四个受控操作');
  let writes=0;
  const actions=proposal.actions.map(item=>{
    if(!plain(item)||!allowed.has(item.type))throw fail('E_AI_SCHEMA','包含不受支持的 AI 任务操作');
    const fields={
      list_tasks:['type','query','currentPageOnly'],get_task:['type','taskId'],task_history:['type','taskId','limit'],
      run_task:['type','taskId','params'],stop_task:['type','taskId'],
      set_task_enabled:['type','taskId','enabled'],list_schedules:['type'],
      get_schedule:['type','scheduleId'],schedule_history:['type','scheduleId','limit'],
      create_schedule:['type','taskId','title','params','targetUrl','timezone','triggerKind','triggerSpec','paused'],
      change_schedule:['type','scheduleId','operation']
    }[item.type];
    if(Object.keys(item).some(key=>!fields.includes(key)))
      throw fail('E_AI_SCHEMA','操作包含未授权的额外参数');
    if(changes.has(item.type))writes++;
    if(['get_task','task_history','run_task','stop_task','set_task_enabled','create_schedule'].includes(item.type))
      requireId(item.taskId,'任务 ID');
    if(['get_schedule','schedule_history','change_schedule'].includes(item.type))
      requireId(item.scheduleId,'计划 ID');
    if(item.query!==undefined)requireString(item.query,'搜索词',200);
    if(item.currentPageOnly!==undefined&&typeof item.currentPageOnly!=='boolean')
      throw fail('E_AI_SCHEMA','当前网页筛选条件必须是布尔值');
    if(item.taskId!==undefined)requireId(item.taskId,'任务 ID');
    if(item.scheduleId!==undefined)requireId(item.scheduleId,'计划 ID');
    if(item.limit!==undefined&&(!Number.isInteger(item.limit)||item.limit<1||item.limit>8))
      throw fail('E_AI_SCHEMA','历史数量超出范围');
    if(['run_task','create_schedule'].includes(item.type)&&!plain(item.params))
      throw fail('E_AI_SCHEMA','任务参数必须是明确的对象');
    if(item.type==='set_task_enabled'&&typeof item.enabled!=='boolean')
      throw fail('E_AI_SCHEMA','启停状态必须明确');
    if(item.type==='change_schedule'&&!['pause','resume','delete'].includes(item.operation))
      throw fail('E_AI_SCHEMA','计划操作仅支持暂停、恢复或删除');
    if(item.type==='create_schedule'){
      for(const key of ['title','targetUrl','timezone','triggerKind'])
        requireString(item[key],key,2048);
      if(!plain(item.triggerSpec)||typeof item.paused!=='boolean')
        throw fail('E_AI_SCHEMA','计划时间规则或暂停状态不完整');
    }
    return structuredClone(item);
  });
  if(writes>1)throw fail('E_AI_SCHEMA','每轮最多确认一项可能产生副作用的操作');
  return {actions,question:null};
}

// Only verified Host/Controller observations become agent context. LLM output
// can propose an operation but never acquires a Client, Chrome or RunHost handle.
export function createMyTaskAgent({client,taskWorkbench,provider,currentPageTarget,
  api=globalThis.chrome,onScheduleChange=()=>{}}){
  if(!client?.request||!taskWorkbench?.runInstalledForAgent||!provider?.request)
    throw fail('E_AI_UNAVAILABLE','现有任务、Provider 或 RunHost 尚未连接');
  let snapshot={open:false,rows:[],draft:'',status:'idle',pending:null,step:'',busy:false};
  const subscribers=new Set();
  let disposed=false,session=null,sequence=0,verifiedHistory=[];
  const publish=patch=>{
    if(disposed)return;
    snapshot={...snapshot,...patch};
    for(const listener of [...subscribers])listener();
  };
  const add=(speaker,message)=>{
    const row={id:'my-agent-'+(++sequence),speaker,message:clip(message,2400)};
    publish({rows:[...snapshot.rows,row].slice(-32)});
  };
  const currentPage=()=>{
    const row=currentPageTarget?.snapshot;
    return row?.status==='available'?{origin:row.origin,url:clip(row.url,2048)}:
      {status:row?.status||'unknown'};
  };
  const catalog=async()=>await client.request('listTaskCatalog',{});
  const tasks=async()=>{const result=await catalog();return {
    installed:result.installed||[],catalog:result.catalog||[]
  };};
  const taskInfo=(data,id)=>{
    const row=data.installed.find(value=>value.taskId===id);
    if(!row)throw fail('E_TASK_NOT_FOUND','没有找到已安装任务：'+id);
    const candidate=data.catalog.find(v=>v.taskId===row.taskId&&v.version===row.version);
    if(!candidate||candidate.manifestHash!==row.manifestHash)
      throw fail('E_REVISION','安装的任务版本或清单已变化，请刷新任务');
    return {row,candidate};
  };
  const summarizeTask=({row,candidate})=>({
    taskId:row.taskId,title:clip(candidate.manifest?.title||row.taskId,100),
    description:clip(candidate.manifest?.description,220),
    enabled:row.enabled===true,version:row.version,
    stage:candidate.stage,siteOrigins:candidate.manifest?.siteOrigins||[],
    paramsSchema:candidate.manifest?.paramsSchema
  });
  async function runHistory(taskId,limit){
    const {row}=taskInfo(await tasks(),taskId);
    const journal=await client.controller.snapshotControllerRun({});
    const runs=(journal.runs||[]).filter(v=>v.revision?.scriptId===row.scriptId)
      .slice(-limited(limit)).reverse();
    return runs.map(run=>{
      const result=(journal.results||[]).find(r=>r.runId===run.runId);
      let outcome='结果尚未持久化';
      if(result?.outcome?.ok){
        try{outcome=clip(presentTaskValue(decodeValue(result.outcome.valueWire)).text,280);}
        catch{outcome='结果格式暂不可读取';}
      }else if(result?.outcome?.error)outcome=clip(result.outcome.error?.message||result.outcome.error?.code,240);
      return {runId:run.runId,state:run.state,outcome,hasResult:Boolean(result?.outcome)};
    });
  }
  async function schedules(){const result=await client.request('listSchedules',{});return result.schedules||[];}
  async function read(action){
    switch(action.type){
      case 'list_tasks': {
        const data=await tasks(),origin=currentPage().origin;
        const rows=data.installed.slice(0,100).map(row=>summarizeTask(taskInfo(data,row.taskId)));
        const mapped=rows.map(({paramsSchema,...v})=>({...v,
          appliesToCurrentPage:Boolean(origin&&v.enabled&&v.siteOrigins.includes(origin))}));
        const needle=action.query?.trim().toLocaleLowerCase();
        const filtered=mapped.filter(v=>(!action.currentPageOnly||v.appliesToCurrentPage)&&
          (!needle||(v.title+' '+v.description+' '+v.taskId).toLocaleLowerCase().includes(needle)));
        filtered.sort((a,b)=>Number(b.appliesToCurrentPage)-Number(a.appliesToCurrentPage));
        return {total:data.installed.length,matches:filtered.length,origin,
          items:filtered.slice(0,30)};
      }
      case 'get_task':return summarizeTask(taskInfo(await tasks(),action.taskId));
      case 'task_history':return {taskId:action.taskId,
        records:await runHistory(action.taskId,action.limit)};
      case 'list_schedules':return {schedules:(await schedules()).slice(0,100).map(v=>({
        scheduleId:v.scheduleId,title:v.title,taskId:v.taskId,paused:v.paused,
        timezone:v.timezone,triggerKind:v.triggerKind,triggerSpec:v.triggerSpec,
        targetUrl:v.targetUrl,generation:v.generation,needsAttention:v.needsAttention
      }))};
      case 'get_schedule': {
        const row=(await schedules()).find(v=>v.scheduleId===action.scheduleId);
        if(!row)throw fail('E_SCHEDULE_NOT_FOUND','找不到该计划：'+action.scheduleId);
        return row;
      }
      case 'schedule_history': {
        const row=(await schedules()).find(v=>v.scheduleId===action.scheduleId);
        if(!row)throw fail('E_SCHEDULE_NOT_FOUND','找不到该计划：'+action.scheduleId);
        const history=await client.request('listScheduleHistory',{
          scheduleId:action.scheduleId,offset:0,limit:limited(action.limit)});
        return {scheduleId:action.scheduleId,
          records:(history?.history||[]).slice(0,8).map(v=>({
            fireId:v.fireId,status:v.status,scheduledAt:v.scheduledAt,
            error:clip(v.error?.message||v.error,180)
          }))};
      }
      default:throw fail('E_AI_SCHEMA','该操作需要单次用户确认');
    }
  }
  const explain=action=>{
    switch(action.type){
      case 'run_task':return '运行已安装任务 '+action.taskId+'；参数 '+clip(JSON.stringify(action.params),700);
      case 'stop_task':return '停止当前正在运行的任务 '+action.taskId+'（不同于停止 AI）';
      case 'set_task_enabled':return (action.enabled?'启用':'停用')+'任务 '+action.taskId;
      case 'create_schedule':return '创建计划「'+action.title+'」：'+action.taskId+
        ' · '+action.targetUrl+' · '+action.timezone+' · '+action.triggerKind+
        ' '+clip(JSON.stringify(action.triggerSpec),300);
      case 'change_schedule':return ({pause:'暂停',resume:'恢复',delete:'删除'})[action.operation]+
        '计划 '+action.scheduleId;
      default:return action.type;
    }
  };
  async function write(action,event,signal){
    stopCheck(signal);
    if(!event?.isTrusted)throw fail('E_USER_GESTURE','只有点击可信确认按钮才能修改真实任务或计划');
    if(action.type==='run_task'){
      const {row,candidate}=taskInfo(await tasks(),action.taskId);
      if(!row.enabled||candidate.stage!=='available')
        throw fail('E_PERMISSION','该任务未启用或尚未验证');
      const params=validateTaskParams(candidate.manifest.paramsSchema,action.params);
      const expected=currentPage();
      if(!candidate.manifest.siteOrigins.includes(expected.origin))
        throw fail('E_TARGET','当前网页不在该任务允许的网站范围内');
      stopCheck(signal);
      const completed=await taskWorkbench.runInstalledForAgent({taskId:row.taskId,params,event});
      const history=await runHistory(row.taskId,3);
      const observed=history.find(v=>v.runId===completed.runId);
      if(!observed||!observed.hasResult)throw fail('E_OUTCOME_UNKNOWN','任务已提交，但尚未读取到持久结果；请核查历史，不要重新运行');
      return {taskId:row.taskId,runId:completed.runId,state:observed.state,result:observed.outcome,
        verified:isTerminal(observed.state)&&observed.hasResult};
    }
    if(action.type==='stop_task'){
      const stopped=await taskWorkbench.stopAgentTask({taskId:action.taskId,event});
      return {taskId:action.taskId,stopRequested:true,
        note:'停止请求已发出，需通过运行历史核对最终状态',receipt:clip(stopped?.state||'',60)};
    }
    if(action.type==='set_task_enabled'){
      const {row,candidate}=taskInfo(await tasks(),action.taskId);
      if(row.enabled===action.enabled)return {taskId:row.taskId,enabled:row.enabled,unchanged:true};
      const patterns=candidate.manifest.siteOrigins.map(origin=>permissionPattern(origin));
      if(action.enabled&&!await api.permissions.contains({origins:patterns}))
        throw fail('E_PERMISSION','网站访问权限不足，请先使用原任务管理界面授权');
      stopCheck(signal);
      await client.request('setInstalledTaskEnabled',{
        taskId:row.taskId,version:row.version,enabled:action.enabled,
        expectedGeneration:row.generation??null,expectedInstallationId:row.installationId??null
      });
      const verified=taskInfo(await tasks(),action.taskId).row;
      if(verified.enabled!==action.enabled)throw fail('E_OUTCOME_UNKNOWN','任务启停结果需要重新核对');
      return {taskId:row.taskId,enabled:verified.enabled,verified:true};
    }
    if(action.type==='create_schedule'){
      const {row,candidate}=taskInfo(await tasks(),action.taskId);
      if(row.enabled!==true||candidate.stage!=='available'||!row.installationId)
        throw fail('E_PERMISSION','计划要求已启用、已验证且具安装身份的任务');
      const params=validateTaskParams(candidate.manifest.paramsSchema,action.params);
      const resolved=await client.request('resolveInstalledTask',{taskId:row.taskId});
      if(resolved.version!==row.version||resolved.manifestHash!==row.manifestHash||
        resolved.installationId!==row.installationId||resolved.generation!==row.generation)
        throw fail('E_REVISION','保存前任务安装身份发生变化');
      const target=new URL(action.targetUrl);
      if(!candidate.manifest.siteOrigins.includes(target.origin))
        throw fail('E_TARGET','计划目标网站不在固定任务允许的网站范围');
      if(!await api.permissions.contains({origins:[permissionPattern(action.targetUrl)]}))
        throw fail('E_PERMISSION','创建计划前须使用原计划界面授予网站访问权限');
      const input=validateScheduleInput({
        title:action.title.trim(),taskId:resolved.taskId,version:resolved.version,
        manifestHash:resolved.manifestHash,sourceHash:resolved.contentHash,
        installationId:resolved.installationId,taskGeneration:resolved.generation,
        params,targetUrl:action.targetUrl,openIfMissing:false,
        timezone:action.timezone,triggerKind:action.triggerKind,triggerSpec:action.triggerSpec,
        misfirePolicy:'skip',startDeadlineMs:300000,paused:action.paused
      });
      stopCheck(signal);
      const saved=await client.request('saveSchedule',input);
      const actual=(await schedules()).find(p=>p.scheduleId===saved?.scheduleId);
      if(!actual||actual.taskId!==row.taskId||actual.title!==input.title||
        actual.timezone!==input.timezone||actual.targetUrl!==input.targetUrl)
        throw fail('E_OUTCOME_UNKNOWN','计划写入结果尚未核实；请刷新计划列表，勿重复创建');
      onScheduleChange();
      return {scheduleId:actual.scheduleId,title:actual.title,paused:actual.paused,verified:true};
    }
    if(action.type==='change_schedule'){
      const before=(await schedules()).find(p=>p.scheduleId===action.scheduleId);
      if(!before)throw fail('E_SCHEDULE_NOT_FOUND','该计划不存在，未执行修改');
      if((action.operation==='pause'&&before.paused)||(action.operation==='resume'&&!before.paused))
        return {scheduleId:before.scheduleId,paused:before.paused,unchanged:true};
      stopCheck(signal);
      await client.request('changeSchedule',{scheduleId:before.scheduleId,
        expectedGeneration:before.generation,action:action.operation});
      const after=(await schedules()).find(p=>p.scheduleId===before.scheduleId);
      const verified=action.operation==='delete'?!after:
        Boolean(after&&after.paused===(action.operation==='pause'));
      if(!verified)throw fail('E_OUTCOME_UNKNOWN','计划修改结果无法确认；请刷新后再决定，不要重复提交');
      onScheduleChange();
      return {scheduleId:before.scheduleId,operation:action.operation,verified:true};
    }
    throw fail('E_AI_SCHEMA','不允许的修改操作');
  }
  const limitContext=records=>records.slice(-8).map(row=>({
    action:row.action,observation:clip(JSON.stringify(row.observation),2300)
  }));
  async function loop(session,originalRequest,context=[],continuation=false){
    const {event,signal}=session,goal=session.goal;
    for(let turn=0;turn<6;turn++){
      stopCheck(signal);
      publish({busy:true,status:'thinking',step:'正在核对任务与计划…'});
      let proposal,auth;
      // First provider permission request must begin in the actual Send gesture.
      const incoming=provider.request({request:originalRequest,context:{
        goal,currentPage:currentPage(),
        selectedTaskId:taskWorkbench.myView?.field('task-installed-list')?.value||null,
        verifiedObservations:limitContext(context)
      },event,signal,continuation:continuation||turn>0});
      const response=await incoming;
      auth=response.authorization;
      try{proposal=validateMyTaskAgentProposal(response.proposal);}
      finally{auth?.release?.();}
      stopCheck(signal);
      if(proposal.question){
        add('助手',proposal.question);
        publish({busy:false,status:'idle',step:''});session.active=false;return;
      }
      for(const action of proposal.actions){
        stopCheck(signal);
        if(changes.has(action.type)){
          if(session.confirmed?.has(JSON.stringify(action))){
            add('系统','这一操作在当前请求中已确认过，拒绝再次自动执行。');
            publish({busy:false,status:'idle',pending:null,step:''});
            session.active=false;return;
          }
          const pending={action,summary:explain(action)};
          session.context=context;
          publish({busy:false,status:'review',step:'请检查目标与影响',pending});
          add('助手','准备执行：'+pending.summary+'。确认后才会修改真实数据。');
          return;
        }
        publish({busy:true,status:'reading',step:'正在读取真实 '+action.type});
        try{
          const observation=await read(action);
          context.push({action:action.type,observation});
          verifiedHistory=context.slice(-8);
          add('助手',action.type==='list_tasks'
            ?'已检查 '+observation.total+' 个已安装任务。'+
               observation.items.filter(x=>x.appliesToCurrentPage).map(x=>x.title).slice(0,6).join('、')
            :action.type==='list_schedules'
              ?'已读取 '+observation.schedules.length+' 项定时计划。'
              :action.type==='task_history'?'已读取 '+observation.records.length+' 条实际执行记录。'
              :'已读取 '+(action.taskId||action.scheduleId||'')+' 的实际信息。');
        }catch(error){
          context.push({action:action.type,observation:{error:clip(error.message,280),code:error.code||'E_TOOL'}});
          verifiedHistory=context.slice(-8);
          add('系统',clip(error.message,360));
        }
      }
      continuation=true;originalRequest=goal;
    }
    add('系统','已到达本轮自动检查上限。没有继续猜测或重复执行；可以发送后续指令。');
    publish({busy:false,status:'idle',step:''});session.active=false;
  }
  async function start(request,event){
    if(disposed||session?.active)throw fail('E_AI_BUSY','当前 AI 请求还未结束');
    if(!event?.isTrusted)throw fail('E_USER_GESTURE','请使用可信对话发送按钮');
    const goal=clip(request.trim(),4000);
    if(!goal)throw fail('E_AI_REQUEST','请输入需要完成的任务');
    const controller=new AbortController();
    const current={active:true,event,goal,signal:controller.signal,controller,
      context:verifiedHistory.slice(-8),confirmed:new Set()};
    session=current;
    publish({busy:true,pending:null,status:'thinking',step:'正在理解请求'});
    add('你',goal);
    try{await loop(current,goal,current.context);}
    catch(error){
      if(session!==current)return;
      add('系统',error?.code==='E_CANCELLED'?'AI 后续操作已停止；已启动的任务不会自动停止。':
        clip(error?.message||error,600));
      publish({busy:false,pending:null,status:'idle',step:''});
      current.active=false;
    }
  }
  async function confirm(event){
    if(!event?.isTrusted||!session?.active||!snapshot.pending||snapshot.busy)return;
    const current=session,pending=snapshot.pending;
    // Consume exactly once before any asynchronous operation. A duplicate
    // confirmation can never start the same effect a second time.
    publish({pending:null,busy:true,status:'executing',step:'正在执行并验证：'+pending.summary});
    const record={action:pending.action.type,observation:null};
    current.confirmed.add(JSON.stringify(pending.action));
    try{
      const observation=await write(pending.action,event,current.signal);
      if(session!==current||current.signal.aborted)return;
      record.observation=observation;
      current.context.push(record);
      verifiedHistory=current.context.slice(-8);
      add('助手','已读取真实回执：'+clip(JSON.stringify(observation),750));
      stopCheck(current.signal);
      await loop(current,current.goal,current.context,true);
    }catch(error){
      if(session!==current)return;
      add('系统',(['E_OUTCOME_UNKNOWN','E_EFFECT_UNKNOWN','E_TIMEOUT','E_DISCONNECTED'].includes(error?.code)
        ?'操作结果未知，禁止自动重试。请在原业务界面核实。 '
        :'操作未确认完成。 ')+clip(error?.message||error,500));
      publish({busy:false,status:'idle',pending:null,step:''});
      current.active=false;
    }
  }
  function stop(){
    if(!session?.active)return;
    session.controller.abort(fail('E_CANCELLED','用户停止 AI'));
    void provider.cancel({signal:session.signal}).catch(()=>{});
    publish({busy:false,pending:null,status:'idle',step:''});
    session.active=false;
  }
  return Object.freeze({
    subscribe(fn){subscribers.add(fn);return ()=>subscribers.delete(fn);},
    getSnapshot(){return snapshot;},
    toggle(){publish({open:!snapshot.open});},
    setDraft(value){publish({draft:clip(value,4000)});},
    async send(request,event){return start(request,event);},
    confirm,stop,
    dispose(){if(disposed)return;stop();disposed=true;subscribers.clear();}
  });
}
