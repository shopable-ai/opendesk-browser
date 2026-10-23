// Read-only projection of the original Page/Task/Scheduler authorities.
// Raw program/task IDs, URLs, source and execution values MUST NOT leave this module's caller.
const asDate=value=>{
  const time=typeof value==='string'?Date.parse(value):value;
  return Number.isFinite(time)&&time>=0?new Date(time).toISOString().slice(0,10):null;
};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const blank=()=>({installed:0,enabled:0,disabled:0,blocked:0,unknown:0});
const safeIdentity=id=>typeof id==='string'&&id.length>0&&id.length<=256;
const validStatus=new Set(['prepared','dispatched','completed','failed','outcome-unknown']);
const namespaceFor=api=>'tool:'+api.runtime.id;

export async function readAnalyticsAuthorityProjection({storage,api,now=()=>Date.now()}={}){
  if(typeof storage?.transaction!=='function'||typeof api?.runtime?.id!=='string')
    throw new Error('Analytics authority unavailable');
  const namespace=namespaceFor(api);
  // User Scripts may be turned off independently from extension permissions.
  // In that case report UNKNOWN, not a misleading healthy installation.
  let nativeIds=null;
  try{
    if(typeof api.userScripts?.getScripts==='function'){
      const scripts=await api.userScripts.getScripts();
      if(Array.isArray(scripts))nativeIds=new Set(scripts.map(row=>row.id));
    }
  }catch{/* Native registration cannot be established. */}
  const [kv,runs,results]=await storage.transaction(['frameworkKV','runs','results'],'readonly',
    async tx=>Promise.all([tx.all('frameworkKV'),tx.all('runs'),tx.all('results')]));
  if(![kv,runs,results].every(Array.isArray))throw new Error('Invalid authority readback');
  const types={page:blank(),task:blank(),scheduler:{definitions:0}};
  const pages=[],tasks=[],executions=[];
  let projectionGap=false;
  for(const row of kv){
    if(row?.namespace!==namespace)continue;
    if(row.tag==='page-installed-v1'){
      if(!safeIdentity(row.programId)){projectionGap=true;continue;}
      pages.push(row);
    }else if(row.tag==='task-installed-v1'){
      if(!safeIdentity(row.taskId)){projectionGap=true;continue;}
      tasks.push(row);
    }else if(row.tag==='schedule-definition-v1'&&!row.deleted){
      types.scheduler.definitions++;
    }else if(row.tag==='page-execution-v1'){
      const day=asDate(row.createdAt);
      if(!safeIdentity(row.programId)||!day||!uuid.test(row.receiptId||'')||
         !validStatus.has(row.state)){projectionGap=true;continue;}
      // A persisted admission after the native document marker is an actual
      // automated attempt. The bootstrap request alone is never counted.
      executions.push({type:'page',identity:row.programId,day,status:row.state,
        receiptId:row.receiptId});
      // effectConfirmed reflects runtime behavior, NOT independent business proof.
    }
  }
  if(pages.length>4096||tasks.length>4096||executions.length>4096)
    throw new Error('Analytics authority projection exceeds bounded inventory');
  for(const row of pages){
    const item=types.page;item.installed++;
    if(row.enabled===false||row.authorization?.status==='disabled')item.disabled++;
    else if(row.authorization?.status!=='active'||row.nativeState==='blocked')item.blocked++;
    else if(row.nativeState==='registered'&&nativeIds?.has(row.nativeId))item.enabled++;
    else item.unknown++;
  }
  for(const row of tasks){
    const item=types.task;item.installed++;
    if(row.enabled===false)item.disabled++;
    else if(!Number.isSafeInteger(row.authorization?.generation)||
      !uuid.test(row.authorization?.installationId||''))item.blocked++;
    else{
      const origins=row.authorization?.scope?.siteOrigins;
      if(!Array.isArray(origins)||!origins.length||typeof api.permissions?.contains!=='function'){
        item.unknown++;continue;
      }
      try{
        if(await api.permissions.contains({origins}))item.enabled++;
        else item.blocked++;
      }catch{item.unknown++;}
    }
  }
  const runById=new Map(runs.filter(row=>row?.tag==='controller-run'&&row.namespace===namespace)
    .map(row=>[row.runId,row]));
  const resultById=new Map(results.filter(row=>row?.tag==='controller-result'&&row.namespace===namespace)
    .map(row=>[row.resultId,row]));
  for(const fire of kv){
    if(fire?.tag!=='schedule-fire-v1'||fire.namespace!==namespace||!fire.runId)continue;
    const run=runById.get(fire.runId);
    // An unbound Fire is merely a scheduled intention, never a real execution.
    if(!run||run.scheduledFireId!==fire.fireId||
       fire.resultId&&fire.resultId!==run.resultId){projectionGap=true;continue;}
    const app=run.profile==='app-service';
    const type=app?'app_service':'task';
    const identity=app?run.appBinding?.appId:run.installedTaskAuthorization?.taskId;
    const day=asDate(run.createdAt);
    if(!safeIdentity(identity)||!day||!uuid.test(run.runId||'')){projectionGap=true;continue;}
    const result=resultById.get(run.resultId);
    let status='dispatched';
    if(result){
      if(result.runId!==run.runId){projectionGap=true;continue;}
      status=result.state==='completed'&&result.outcome?.ok===true?'completed':
        result.state==='failed'?'failed':'outcome-unknown';
    }else if(['paused_unknown','stopped','interrupted','failed','completed'].includes(run.state)){
      status='outcome-unknown';
    }
    executions.push({type,identity,day,status,receiptId:fire.fireId});
  }
  const counts=new Map(),dedup=new Set();
  const add=(type,identity,day,metric)=>{
    const key=JSON.stringify([type,identity,day,metric]);
    counts.set(key,(counts.get(key)||0)+1);
  };
  for(const row of executions){
    const key=row.type+':'+row.receiptId;
    if(dedup.has(key)){projectionGap=true;continue;}
    dedup.add(key);
    add(row.type,row.identity,row.day,'attempted');
    if(row.status==='completed')add(row.type,row.identity,row.day,'completed');
    if(row.status==='failed')add(row.type,row.identity,row.day,'failed');
    if(row.status==='outcome-unknown')add(row.type,row.identity,row.day,'outcome_unknown');
  }
  return {inventoryTypes:types,readState:'fresh',projectionGap,observedAt:now(),
    daily:[...counts].map(([key,total])=>{
      const [type,identity,day,metricType]=JSON.parse(key);
      return {type,identity,day,metricType,total};
    })};
}
