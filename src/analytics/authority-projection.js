import {permissionPattern} from '../environment.js';
import {canonical} from '../platform/protocol.js';
import {taskScriptId} from '../platform/tasks/contract.js';
import {SIDEBAR_TOOL_STORE,MAX_INSTALLED_TOOLS,SIDEBAR_TOOL_BACKGROUND_KIND} from '../ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE,requireToolEnableRecords} from '../ui/sidebar-tools/lifecycle.js';
import {readAppServiceInstallation} from '../platform/tasks/app-service-installation.js';
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
const sidebarId=/^[a-z][a-z0-9-]{1,39}$/;
const frozenHash=/^[a-f0-9]{64}$/;
const taskVersion=/^(0|[1-9][0-9]*)[.](0|[1-9][0-9]*)[.](0|[1-9][0-9]*)$/;
const taskIdPattern=/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,59}$/;
const resultStatus=(run,result)=>{
  if(result){
    if(result.tag!=='controller-result'||result.runId!==run.runId||
       result.resultId!==run.resultId||result.namespace!==run.namespace||
       result.state!==run.state)return null;
    return result.state==='completed'&&result.outcome?.ok===true?'completed':
      result.state==='failed'?'failed':'outcome-unknown';
  }
  return ['paused_unknown','stopped','interrupted','failed','completed'].includes(run.state)?
    'outcome-unknown':'dispatched';
};

export async function readAnalyticsAuthorityProjection({storage,api,now=()=>Date.now(),since=0}={}){
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
  // This is the actual Sidebar installer + enable store, not a second registry.
  // An inaccessible/corrupt snapshot must fail closed as READ_FAILED.
  if(typeof api.storage?.local?.get!=='function')throw new Error('Sidebar authority unavailable');
  const local=await api.storage.local.get([SIDEBAR_TOOL_STORE,SIDEBAR_TOOL_ENABLE_STORE]);
  const sidebarRows=local[SIDEBAR_TOOL_STORE]??[];
  if(!Array.isArray(sidebarRows)||sidebarRows.length>MAX_INSTALLED_TOOLS||
     sidebarRows.some(row=>!sidebarId.test(row?.id||'')||row.id==='opendesk')||
     new Set(sidebarRows.map(row=>row.id)).size!==sidebarRows.length)
    throw new Error('Invalid Sidebar installation authority');
  const sidebarEnabled=requireToolEnableRecords(local[SIDEBAR_TOOL_ENABLE_STORE]);
  const types={sidebar:blank(),page:blank(),task:blank(),
    scheduler:{definitions:0,active:0,paused:0,unknown:0},
    app_service:{bindings:0,enabled:0,disabled:0,unknown:0}};
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
      if(row.paused===true)types.scheduler.paused++;
      else if(row.paused===false)types.scheduler.active++;
      else types.scheduler.unknown++;
    }else if(row.tag==='page-execution-v1'){
      // Explicit user attempts have their own low-frequency, consented events;
      // never transform one into automated daily activity or active DAU.
      if(row.source==='manual')continue;
      if(row.source!==undefined&&row.source!=='page_auto'){
        projectionGap=true;continue;
      }
      const day=asDate(row.createdAt);
      // Historical execution before this installation's effective opt-in is
      // NEVER backfilled merely because a user granted permission today.
      if(typeof row.createdAt==='number'&&row.createdAt<since||
        typeof row.createdAt==='string'&&Date.parse(row.createdAt)<since)continue;
      if(!safeIdentity(row.programId)||!day||!uuid.test(row.receiptId||'')||
         !validStatus.has(row.state)){projectionGap=true;continue;}
      // An admission marked PREPARED is not a Chrome execution. Only a durable
      // DISPATCHED receipt with its original timestamp establishes a real run.
      // A terminal without dispatch proof is uncertain, not a successful run.
      const dispatchedAt=typeof row.dispatchedAt==='string'?
        Date.parse(row.dispatchedAt):row.dispatchedAt;
      if(!Number.isFinite(dispatchedAt)){
        if(row.state!=='prepared')projectionGap=true;
        continue;
      }
      if(row.state==='prepared')continue;
      executions.push({type:'page',identity:row.programId,day,
        status:row.state==='outcome-unknown'?'outcome_unknown':row.state,
        receiptId:row.receiptId,source:'page_auto'});
      // effectConfirmed reflects runtime behavior, NOT independent business proof.
    }
  }
  if(pages.length>4096||tasks.length>4096||executions.length>4096)
    throw new Error('Analytics authority projection exceeds bounded inventory');
  const inventoryItems=[];
  for(const row of sidebarRows){
    const status=sidebarEnabled[row.id]===false?'disabled':'enabled';
    types.sidebar.installed++;types.sidebar[status]++;
    inventoryItems.push({type:'sidebar',identity:row.id,status});
    // Background App Services belong to this Sidebar installation; they are
    // bindings, never extra installed tools or separate census identities.
    if(row.background?.kind===SIDEBAR_TOOL_BACKGROUND_KIND){
      // Original App Service authority validates content hash, capability,
      // generation and binding. A merely present background property cannot
      // be reported as a running service.
      const serviceStatus=status==='disabled'?'disabled':
        await readAppServiceInstallation(api,row.id).then(()=> 'enabled',()=> 'unknown');
      types.app_service.bindings++;types.app_service[serviceStatus]++;
      if(serviceStatus==='unknown')projectionGap=true;
    }
  }
  for(const row of pages){
    const item=types.page;item.installed++;
    let status='unknown';
    if(row.enabled===false||row.authorization?.status==='disabled')status='disabled';
    else if(row.authorization?.status!=='active'||row.nativeState==='blocked')status='blocked';
    else if(row.nativeState==='registered'&&nativeIds?.has(row.nativeId))status='enabled';
    item[status]++;
    inventoryItems.push({type:'page',identity:row.programId,status});
  }
  for(const row of tasks){
    const item=types.task;item.installed++;
    let status='unknown';
    if(row.enabled===false)status='disabled';
    else if(!Number.isSafeInteger(row.authorization?.generation)||
      !uuid.test(row.authorization?.installationId||''))status='blocked';
    else{
      const origins=row.authorization?.scope?.siteOrigins;
      if(Array.isArray(origins)&&origins.length&&typeof api.permissions?.contains==='function'){
        try{status=await api.permissions.contains({origins:origins.map(permissionPattern)})?'enabled':'blocked';}
        catch{status='unknown';}
      }
    }
    item[status]++;
    inventoryItems.push({type:'task',identity:row.taskId,status});
  }
  const runById=new Map(runs.filter(row=>row?.tag==='controller-run'&&row.namespace===namespace)
    .map(row=>[row.runId,row]));
  const resultById=new Map(results.filter(row=>row?.tag==='controller-result'&&row.namespace===namespace)
    .map(row=>[row.resultId,row]));
  const cloudById=new Map();
  for(const row of kv){
    if(row?.tag!=='cloud-request-v1'||row.namespace!==namespace)continue;
    if(!safeIdentity(row.requestId)||cloudById.has(row.requestId)){
      projectionGap=true;continue;
    }
    cloudById.set(row.requestId,row);
  }
  // Use only the persisted original Fire, frozen Run, and terminal Result.
  // Current installations can be upgraded or uninstalled after a valid run.
  const validScheduledRun=(fire,run,result)=>{
    if(!frozenHash.test(run.contentHash||'')||
       run.revision?.sourceHash!==run.contentHash||
       result&&result.revision?.sourceHash!==run.contentHash)return false;
    if(run.profile==='app-service'){
      const binding=run.appBinding;
      return fire.profile==='app-service'&&run.sourceKind==='app-service'&&
        sidebarId.test(binding?.appId||'')&&fire.appId===binding.appId&&
        run.scriptId==='app:'+binding.appId&&
        frozenHash.test(binding.packageHash||'')&&
        binding.codeHash===run.contentHash&&uuid.test(binding.generation||'')&&
        binding.sourceIdentity&&typeof binding.sourceIdentity==='object'&&
        fire.appBinding&&typeof fire.appBinding==='object'&&
        canonical(binding)===canonical(fire.appBinding);
    }
    const grant=run.installedTaskAuthorization;
    return fire.profile!=='app-service'&&run.sourceKind==='saved'&&
      taskIdPattern.test(grant?.taskId||'')&&taskVersion.test(grant?.version||'')&&
      frozenHash.test(grant.manifestHash||'')&&
      run.scriptId===taskScriptId(grant.taskId,grant.version)&&
      uuid.test(grant.authorization?.installationId||'')&&
      Number.isSafeInteger(grant.authorization?.generation)&&grant.authorization.generation>0;
  };
  const processedRuns=new Set();
  const includeRun=(run,receiptId,source)=>{
    if(processedRuns.has(run.runId)){projectionGap=true;return;}
    processedRuns.add(run.runId);
    // A prepared reservation is not a dispatched automatic execution.
    if(run.state==='preparing')return;
    const app=run.profile==='app-service';
    const type=app?'app_service':'task';
    const identity=app?run.appBinding?.appId:run.installedTaskAuthorization?.taskId;
    const day=asDate(run.createdAt);
    if(typeof run.createdAt==='number'&&run.createdAt<since||
       typeof run.createdAt==='string'&&Date.parse(run.createdAt)<since)return;
    if(!safeIdentity(identity)||!day||!uuid.test(run.runId||'')||
       !uuid.test(run.resultId||'')){projectionGap=true;return;}
    const result=run.resultId?resultById.get(run.resultId):null;
    const status=resultStatus(run,result);
    if(!status){projectionGap=true;return;}
    executions.push({type,identity,day,status,receiptId,source});
  };
  for(const fire of kv){
    if(fire?.tag!=='schedule-fire-v1'||fire.namespace!==namespace||!fire.runId)continue;
    const run=runById.get(fire.runId);
    // A Fire is only a scheduler execution when the original Run is bound
    // to that exact Fire and Result. Never count an unbound intention.
    if(!run||run.scheduledFireId!==fire.fireId||
       // The Scheduler persists these three IDs together at admission.
       // A missing ResultId is not a proven execution receipt.
       typeof fire.resultId!=='string'||!fire.resultId||
       fire.resultId!==run.resultId||
       run.cloudRequestId){projectionGap=true;continue;}
    const result=run.resultId?resultById.get(run.resultId):null;
    if(!validScheduledRun(fire,run,result)){projectionGap=true;continue;}
    includeRun(run,fire.fireId,'scheduler');
  }
  for(const run of runById.values()){
    if(!run.cloudRequestId||run.scheduledFireId||run.profile==='app-service')continue;
    const request=cloudById.get(run.cloudRequestId);
    // Cloud initiation is an AUTOMATIC source only after durable Cloud
    // request -> Run binding. The user's manual/AI-run Task stays separate.
    // The original Cloud Authority commits all of these facts atomically
    // at bind(): task installation, exact source, request, Run and Result.
    // A naked requestId/RunId pair is not an authentic cloud execution.
    const task=request?.task,ref=request?.runRef,grant=run.installedTaskAuthorization;
    const result=run.resultId?resultById.get(run.resultId):null;
    if(!request||request.runId!==run.runId||
       request.requestId!==run.cloudRequestId||
       request.storageKey!==run.cloudRequestKey||
       !ref||ref.runId!==run.runId||ref.resultId!==run.resultId||
       ref.requestId!==request.requestId||ref.grantId!==request.grantId||
       ref.sourceHash!==run.contentHash||ref.manifestHash!==grant?.manifestHash||
       !task||task.taskId!==grant?.taskId||
       task.version!==grant?.version||task.scriptId!==run.scriptId||
       !Number.isSafeInteger(task.version)||!safeIdentity(task.scriptId)||
       task.manifestHash!==grant?.manifestHash||
       task.contentHash!==run.contentHash||
       task.installationId!==grant?.authorization?.installationId||
       task.generation!==grant?.authorization?.generation||
       // Require the original admitted source and any result revision to
       // match the Cloud Request. A matching requestId alone is insufficient.
       (run.state!=='preparing'&&run.revision?.sourceHash!==run.contentHash)||
       (result&&result.revision?.sourceHash!==run.contentHash)){
      projectionGap=true;continue;
    }
    includeRun(run,run.runId,'cloud');
  }
  const counts=new Map(),sourceCounts=new Map(),dedup=new Set();
  const add=(type,identity,day,metric,source)=>{
    const key=JSON.stringify([type,identity,day,metric]);
    counts.set(key,(counts.get(key)||0)+1);
    const sources=sourceCounts.get(key)||{};
    sources[source]=(sources[source]||0)+1;
    sourceCounts.set(key,sources);
  };
  for(const row of executions){
    const key=row.type+':'+row.receiptId;
    if(dedup.has(key)){projectionGap=true;continue;}
    dedup.add(key);
    add(row.type,row.identity,row.day,'attempted',row.source);
    if(row.status==='completed')add(row.type,row.identity,row.day,'completed',row.source);
    if(row.status==='failed')add(row.type,row.identity,row.day,'failed',row.source);
    if(row.status==='outcome-unknown')add(row.type,row.identity,row.day,'outcome_unknown',row.source);
  }
  return {inventoryTypes:types,inventoryItems,readState:'fresh',projectionGap,observedAt:now(),
    daily:[...counts].map(([key,total])=>{
      const [type,identity,day,metricType]=JSON.parse(key);
      return {type,identity,day,metricType,total,sourceTotals:sourceCounts.get(key)};
    })};
}
