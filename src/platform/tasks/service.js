const TASK_STORE="frameworkKV";
import {BUILTIN_TASK_RELEASES,loadPackagedTask,assertPackagedTask,builtinTaskStateKey,taskRemovalKey} from './builtin-releases.js';
import {canonical, digest, invariant} from '../protocol.js';
import {loadBuiltinWorkerSource} from '../../libs/loader.js';
import {builtinIdentity,assertBuiltinIdentity} from '../../libs/identity.js';
import {BUILTIN_ABI} from '../../libs/runtime-contract.js';
import {installedKey, taskKey, taskScriptId, scriptStorageKey,
  validateTaskParams, verifyTaskPackage} from './contract.js';

const candidateStates = new Set(['candidate','verified','available']);
function requireCurrentLibraries(candidate){
  if(candidate?.verification?.kind==='builtin-release'){
    invariant(candidate.verification.source==='packaged' &&
      candidate.verification.manifestHash===candidate.package.manifestHash &&
      candidate.verification.sourceHash===candidate.package.manifest.program.sourceHash,
      'E_VERIFICATION','Invalid packaged release evidence');
  } else if(candidate?.package?.manifest.siteOrigins.length>1)
    invariant(candidate.package.manifest.siteOrigins.includes(candidate.verification?.origin),
      'E_VERIFICATION','Task verification must come from a declared exact origin');
  invariant(candidate?.verification?.builtinAbi===BUILTIN_ABI,
    'E_BUILTIN_VERSION_UNAVAILABLE','任务所验证的内置库版本已更改；请对同一固定任务包重新验证');
}
function identityCurrent(identity,current) {
  try { assertBuiltinIdentity(identity,current); return true; }
  catch(error) { if(error.code==='E_BUILTIN_VERSION_UNAVAILABLE')return false; throw error; }
}
function runtimeCurrent(row,current) {
  return identityCurrent(row.builtinIdentity,current) && (row.stage==='candidate' ||
    row.verification?.builtinAbi===BUILTIN_ABI && identityCurrent(row.verification?.builtinIdentity,current));
}
function fields(value,allowed,required=allowed) {
  invariant(value && typeof value==='object' && !Array.isArray(value) &&
    Object.keys(value).every(key=>allowed.includes(key)) &&
    required.every(key=>Object.hasOwn(value,key)),'E_SCHEMA','Unexpected task operation fields');
}
function keyValue(value) {invariant(typeof value==='string' && value.length>0,'E_SCHEMA','Missing task identity');}
function detail(row,current) {
  return {taskId:row.taskId,version:row.version,runtimeCurrent:runtimeCurrent(row,current),manifest:structuredClone(row.package.manifest),
    manifestHash:row.package.manifestHash,stage:row.stage,verifiedAt:row.verification?.verifiedAt ?? null,
    verification:row.verification ? {...(row.verification.kind ? {kind:row.verification.kind,source:row.verification.source} : {}),
      ...(row.verification.runId ? {runId:row.verification.runId,resultId:row.verification.resultId} : {}),
      sourceHash:row.verification.sourceHash,manifestHash:row.verification.manifestHash,
      ...(row.verification.origin ? {origin:row.verification.origin} : {})} : null};
}
function validCandidate(row,namespace) {
  invariant(row?.tag==='task-candidate-v1' && row.namespace===namespace &&
    candidateStates.has(row.stage),'E_OWNER','Task candidate unavailable');
  return row;
}
function installAuthorization(manifest,previous) {
  return {tag:'task-install-authorization-v1',installationId:previous?.installationId??crypto.randomUUID(),
    generation:(previous?.generation??0)+1,
    scope:{capabilities:structuredClone(manifest.permissions),siteOrigins:structuredClone(manifest.siteOrigins),networkOrigins:[]}};
}
export async function assertInstalledTask(tx,namespace,{scriptId,contentHash,origin,params,migrate=false,expectedGeneration,expectedInstallationId,builtinIdentity:environment}) {
  // Run admission invokes this INSIDE its durable revision-pin/slot transaction.
  // Even a direct low-level startControllerRun cannot bypass an installation.
  // Task IDs cannot contain ':'; resolve by the installedTask primary key.
  // A full frameworkKV scan is unnecessary and makes cloud/schedule admission
  // dependent on unrelated records and can violate bounded-read guarantees.
  const identity=typeof scriptId==='string'&&
    /^task:([a-zA-Z0-9][a-zA-Z0-9._-]{0,59}):((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/.exec(scriptId);
  invariant(identity,'E_PERMISSION','Task must be explicitly installed and enabled');
  const install=await tx.get(TASK_STORE,installedKey(namespace,identity[1]));
  invariant(install?.tag==='task-installed-v1'&&install.namespace===namespace&&
    install.taskId===identity[1]&&install.version===identity[2]&&
    install.scriptId===scriptId&&install.enabled===true,
    'E_PERMISSION','Task must be explicitly installed and enabled');
  if(migrate)invariant(expectedGeneration===(install.authorization?.generation??null)&&
    expectedInstallationId===(install.authorization?.installationId??null),
    'E_REVISION','任务安装或授权在运行准备期间改变，请重新运行');
  const candidate=validCandidate(await tx.get(TASK_STORE,taskKey(namespace,install.taskId,install.version)),namespace);
  await verifyTaskPackage(candidate.package);
  requireCurrentLibraries(candidate);
  assertBuiltinIdentity(candidate.builtinIdentity,environment);
  assertBuiltinIdentity(candidate.verification?.builtinIdentity,environment);
  assertBuiltinIdentity(install.builtinIdentity,environment);
  invariant(candidate.stage==='available' && candidate.verification?.sourceHash===contentHash &&
    candidate.verification?.manifestHash===candidate.package.manifestHash &&
    candidate.package.manifestHash===install.manifestHash &&
    candidate.package.manifest.program.sourceHash===contentHash &&
    candidate.package.manifest.siteOrigins.includes(origin) &&
    taskScriptId(install.taskId,install.version)===scriptId,'E_PERMISSION',
    'Installed task does not match its Available version or website');
  if (params !== undefined) validateTaskParams(candidate.package.manifest.paramsSchema,params);
  if(!install.authorization&&migrate){
    // Only the new-run admission readwrite transaction upgrades a proven old
    // installation. A previous live run cannot acquire this new identity.
    install.authorization=installAuthorization(candidate.package.manifest);
    await tx.put(TASK_STORE,install,installedKey(namespace,install.taskId));
  }
  if(install.authorization){
    const grant=install.authorization;
    invariant(grant.tag==='task-install-authorization-v1'&&typeof grant.installationId==='string'&&
      /^[a-f0-9-]{36}$/.test(grant.installationId)&&Number.isSafeInteger(grant.generation)&&grant.generation>0&&
      canonical(grant.scope)===canonical(installAuthorization(candidate.package.manifest).scope),
      'E_PERMISSION','Installed task authorization scope differs');
  }
  return {candidate,installation:structuredClone(install)};
}

export {assertRunTaskAuthorization} from './run-authorization.js';

async function fenceInstalledRuns(tx,ns,old){
  if(!old)return;
  for(const run of await tx.all('runs')){
    if(run.tag!=='controller-run'||run.namespace!==ns||!['preparing','running','stopping'].includes(run.state)||
      (run.installedTaskAuthorization?.taskId!==old.taskId&&run.scriptId!==old.scriptId))continue;
    run.cancelSeq++;run.ownerEpoch++;run.runRevision++;run.eventSeq++;run.state='stopping';run.terminalReason='E_PERMISSION';
    await tx.put('runs',run,run.runId);
    const leaseKey='controller-pin:'+run.runId,lease=await tx.get('commandJournal',leaseKey);
    if(lease)await tx.put('commandJournal',{...lease,cancelSeq:run.cancelSeq,state:run.state},leaseKey);
  }
}
async function installInTransaction(tx,ns,request,current,clock) {
  const candidate=validCandidate(await tx.get(TASK_STORE,taskKey(ns,request.taskId,request.version)),ns);
  const pkg=await verifyTaskPackage(candidate.package);
  invariant(candidate.stage==='available' && candidate.verification?.manifestHash===pkg.manifestHash &&
    candidate.verification?.sourceHash===pkg.manifest.program.sourceHash &&
    pkg.manifestHash===request.manifestHash,'E_VERIFICATION','Only exact Available task versions can install');
  const installKey=installedKey(ns,request.taskId),old=await tx.get(TASK_STORE,installKey);
  const retainingInstalled=old?.tag==='task-installed-v1'&&old.taskId===request.taskId&&
    old.version===request.version&&old.manifestHash===pkg.manifestHash&&
    old.scriptId===taskScriptId(request.taskId,request.version);
  // A persisted reviewed installation is not pinned to today's catalog.
  // New installations/restores still require exact fixed release bytes.
  if(candidate.verification?.kind==='builtin-release'&&!retainingInstalled)await assertPackagedTask(pkg);
  requireCurrentLibraries(candidate);
  assertBuiltinIdentity(candidate.builtinIdentity,current);
  assertBuiltinIdentity(candidate.verification.builtinIdentity,current);
  invariant((old?.version ?? null)===request.expectedInstalledVersion&&
    (!old?(request.expectedGeneration??null)===null&&(request.expectedInstallationId??null)===null:
      request.expectedGeneration===(old.authorization?.generation??null)&&
      request.expectedInstallationId===(old.authorization?.installationId??null)),
    'E_REVISION','Installed version or authorization changed');
  const id=taskScriptId(request.taskId,request.version);
  const headKey=scriptStorageKey(ns,id),revisionKey=scriptStorageKey(ns,id,1);
  const head=await tx.get('scriptHeads',headKey),revision=await tx.get('scriptRevisions',revisionKey);
  if (head || revision) {
    invariant(head?.revision===1 && head.contentHash===pkg.manifest.program.sourceHash &&
    !head.tombstoned && revision?.sourceUtf8===pkg.sourceUtf8 &&
    revision?.contentHash===pkg.manifest.program.sourceHash,'E_HASH','Installed script integrity differs');
    if(!identityCurrent(revision.builtinIdentity,current)){
      revision.builtinIdentityHistory=[...(revision.builtinIdentityHistory??[]),structuredClone(revision.builtinIdentity)];
      revision.builtinIdentity=current;
      await tx.put('scriptRevisions',revision,revisionKey);
    }
  }
  else {
    await tx.put('scriptRevisions',{tag:'script-revision',namespace:ns,scriptId:id,revision:1,
      parentRevision:0,contentHash:pkg.manifest.program.sourceHash,sourceUtf8:pkg.sourceUtf8,builtinIdentity:current},revisionKey);
    await tx.put('scriptHeads',{tag:'script-head',namespace:ns,scriptId:id,revision:1,
      contentHash:pkg.manifest.program.sourceHash,tombstoned:false},headKey);
  }
  const row={tag:'task-installed-v1',namespace:ns,taskId:request.taskId,version:request.version,
    scriptId:id,manifestHash:pkg.manifestHash,builtinIdentity:current,enabled:old?.enabled??true,installedAt:old?.installedAt??clock.now(),
    authorization:installAuthorization(pkg.manifest,old?.authorization)};
  if(old?.runtimeHistory)row.runtimeHistory=structuredClone(old.runtimeHistory);
  if(old && !identityCurrent(old.builtinIdentity,current)){
    const {runtimeHistory,...prior}=old;
    row.runtimeHistory=[...(row.runtimeHistory??[]),structuredClone(prior)];
  }
  await fenceInstalledRuns(tx,ns,old);
  await tx.put(TASK_STORE,row,installKey);
  await tx.delete(TASK_STORE,taskRemovalKey(ns,request.taskId));
  return {taskId:row.taskId,version:row.version,enabled:row.enabled,manifestHash:row.manifestHash};
}
/** Trusted callers supply their authenticated namespace and current builtinIdentity.
 * Uses one original readwrite transaction; failed means all writes rolled back.
 * ready tasks may be installed, removed or available (legacy recovery).
 * No task is run, no website permission is granted and no native proof is made.
 */
export async function ensureBuiltinTasks({storage,namespace,environment:current,
  loadBuiltinTask=loadPackagedTask,clock={now:()=>Date.now()}}) {
  invariant(typeof namespace==='string'&&namespace.length>0,'E_SCHEMA','Task namespace required');
  assertBuiltinIdentity(current,current);
  let initializingTaskId=null;
  try {
    return await storage.transaction([TASK_STORE,'scriptHeads','scriptRevisions','runs','commandJournal'],'readwrite',async tx=>{
      const ns=namespace;
      const states=[];
      for(const release of BUILTIN_TASK_RELEASES){
        const {taskId,version}=release;
        initializingTaskId=taskId;
        const stateKey=builtinTaskStateKey(ns,taskId);
        const installed=await tx.get(TASK_STORE,installedKey(ns,taskId));
        if(installed){
          // A newer immutable builtin version must be discoverable for an
          // explicit reviewed upgrade; never replace an existing installation
          // or its grant during catalog initialization.
          if(installed.version!==version){
            const key=taskKey(ns,taskId,version),pkg=await assertPackagedTask(await loadBuiltinTask(release));
            const existing=await tx.get(TASK_STORE,key);
            if(existing){
              validCandidate(existing,ns);await verifyTaskPackage(existing.package);
              invariant(existing.taskId===taskId&&existing.version===version&&
                existing.package.manifestHash===pkg.manifestHash&&existing.package.sourceUtf8===pkg.sourceUtf8,
                'E_REQUEST_CONFLICT','New builtin version conflicts with existing candidate');
            }else await tx.put(TASK_STORE,{
              tag:'task-candidate-v1',namespace:ns,taskId,version,createdAt:clock.now(),
              package:pkg,builtinIdentity:current,stage:'available',availableAt:clock.now(),
              verification:{kind:'builtin-release',source:'packaged',sourceHash:pkg.manifest.program.sourceHash,
                manifestHash:pkg.manifestHash,builtinIdentity:current,builtinAbi:BUILTIN_ABI}
            },key);
          }
          if(!await tx.get(TASK_STORE,stateKey))await tx.put(TASK_STORE,
            {tag:'task-builtin-state-v1',namespace:ns,taskId,status:'adopted'},stateKey);
          states.push({taskId,status:'installed',...(installed.version!==version?{updateAvailable:version}:{})});
          continue;
        }
        const removed=await tx.get(TASK_STORE,taskRemovalKey(ns,taskId));
        const state=await tx.get(TASK_STORE,stateKey);
        const prior=(await tx.all(TASK_STORE)).some(row=>row?.namespace===ns&&row.taskId===taskId&&row.tag==='task-candidate-v1');
        // Old candidates without an install cannot distinguish an earlier
        // uninstall from an unfinished import. Never silently install them.
        const automatic=!removed&&!state&& !prior;
        const key=taskKey(ns,taskId,version);
        const existing=await tx.get(TASK_STORE,key);
        const pkg=await assertPackagedTask(await loadBuiltinTask(release));
        invariant(pkg.manifest.taskId===taskId&&pkg.manifest.version===version,
          'E_VERIFICATION','Packaged task identity differs');
        if(existing){
          validCandidate(existing,ns);
          await verifyTaskPackage(existing.package);
          invariant(existing.taskId===taskId&&existing.version===version&&existing.package.manifestHash===pkg.manifestHash&&existing.package.sourceUtf8===pkg.sourceUtf8,
            'E_REQUEST_CONFLICT','Task version is immutable');
        }
        const candidate={...(existing??{tag:'task-candidate-v1',namespace:ns,taskId,version,createdAt:clock.now()}),
          package:pkg,builtinIdentity:current,stage:'available',availableAt:existing?.availableAt??clock.now(),
          verification:{kind:'builtin-release',source:'packaged',sourceHash:pkg.manifest.program.sourceHash,
            manifestHash:pkg.manifestHash,builtinIdentity:current,builtinAbi:BUILTIN_ABI}};
        // Preserve local run evidence; refresh only uninstalled packaged trust.
        if(!existing||existing.stage==='candidate'||existing.verification?.kind==='builtin-release')await tx.put(TASK_STORE,candidate,key);
        if(automatic)await installInTransaction(tx,ns,{taskId,version,manifestHash:pkg.manifestHash,expectedInstalledVersion:null},current,clock);
        const status=automatic?'installed':removed?'removed':'available';
        await tx.put(TASK_STORE,{tag:'task-builtin-state-v1',namespace:ns,taskId,status},stateKey);
        states.push({taskId,status});
      }
      return {status:'ready',tasks:states};
    });
  } catch(error) {
    // The original transaction aborts every write, including install records
    // and revisions. Each subsequent access retries; no success marker leaks.
    if(error.code==='E_OWNER')throw error;
    return {status:'failed',code:'E_TASK_INITIALIZATION',taskId:initializingTaskId,causeCode:error.code??'E_STORAGE',message:error.message};
  }
}

export function taskMethods({storage,api,assertHost,currentHost,clock={now:()=>Date.now()},loadBuiltin=loadBuiltinWorkerSource,loadBuiltinTask=loadPackagedTask}) {
  async function scoped(sender,stores,mode,run) {
    const host=await assertHost(sender);
    return storage.transaction([...new Set([...stores,'commandJournal'])],mode,async tx=>{
      await currentHost(tx,host,sender);
      const answer=await run(tx,host.namespace,host);
      await currentHost(tx,host,sender);
      return answer;
    });
  }
  const environment=async()=>builtinIdentity(await loadBuiltin({runtime:api?.runtime}));
  async function importTaskPackage(request,sender) {
    const current=await environment();
    fields(request,['package']);
    const pkg=await verifyTaskPackage(request.package);
    const {taskId,version}=pkg.manifest;
    return scoped(sender,[TASK_STORE],'readwrite',async (tx,ns)=>{
      const key=taskKey(ns,taskId,version), existing=await tx.get(TASK_STORE,key);
      if (existing) {
        validCandidate(existing,ns);
        invariant(existing.package.manifestHash===pkg.manifestHash &&
          existing.package.sourceUtf8===pkg.sourceUtf8,'E_REQUEST_CONFLICT','Task version is immutable');
        return detail(existing,current);
      }
      const row={tag:'task-candidate-v1',namespace:ns,taskId,version,package:pkg,builtinIdentity:current,
        stage:'candidate',verification:null,createdAt:clock.now()};
      await tx.put(TASK_STORE,row,key);
      return detail(row,current);
    });
  }
  async function initializeBuiltins(sender,current) {
    const host=await assertHost(sender);
    return ensureBuiltinTasks({namespace:host.namespace,environment:current,loadBuiltinTask,clock,
      storage:{transaction:(stores,mode,work)=>scoped(sender,stores,mode,async(tx,ns)=>{
        invariant(ns===host.namespace,'E_OWNER','Task host namespace changed');
        return work(tx);
      })}});
  }
  async function listTaskCatalog(request,sender) {
    const current=await environment();
    fields(request ?? {},[]);
    const initialization=await initializeBuiltins(sender,current);
    return scoped(sender,[TASK_STORE],'readonly',async (tx,ns)=>{
      const rows=(await tx.all(TASK_STORE)).filter(row=>row?.tag==='task-candidate-v1'&&row.namespace===ns);
      const installed=(await tx.all(TASK_STORE)).filter(row=>row?.tag==='task-installed-v1'&&row.namespace===ns);
      const byId=new Map(installed.map(row=>[row.taskId,row]));
      return {initialization,catalog:rows.map(row=>({...detail(row,current),installed:byId.get(row.taskId)?.version===row.version,
        enabled:byId.get(row.taskId)?.version===row.version && byId.get(row.taskId).enabled})),
      installed:installed.map(row=>({taskId:row.taskId,version:row.version,manifestHash:row.manifestHash,
        scriptId:row.scriptId,enabled:row.enabled,installedAt:row.installedAt,runtimeCurrent:identityCurrent(row.builtinIdentity,current),
        installationId:row.authorization?.installationId??null,generation:row.authorization?.generation??null}))};
    });
  }
  async function getTaskCandidate(request,sender) {
    const current=await environment();
    fields(request,['taskId','version']);keyValue(request.taskId);keyValue(request.version);
    return scoped(sender,[TASK_STORE],'readonly',async(tx,ns)=>{
      const row=validCandidate(await tx.get(TASK_STORE,taskKey(ns,request.taskId,request.version)),ns);
      await verifyTaskPackage(row.package);
      return {...detail(row,current),package:structuredClone(row.package)};
    });
  }
  async function verifyTaskCandidate(request,sender) {
    const current=await environment();
    fields(request,['taskId','version','runId']);keyValue(request.runId);
    return scoped(sender,[TASK_STORE,'runs','results'],'readwrite',async(tx,ns)=>{
      const key=taskKey(ns,request.taskId,request.version);
      const row=validCandidate(await tx.get(TASK_STORE,key),ns);
      await verifyTaskPackage(row.package);
      const recovering=!runtimeCurrent(row,current);
      if (row.stage!=='candidate' && !recovering) { requireCurrentLibraries(row); return detail(row,current); }
      const run=await tx.get('runs',request.runId);
      const result=run?.resultId && await tx.get('results',run.resultId);
      const manifest=row.package.manifest, hash=manifest.program.sourceHash;
      invariant(run?.tag==='controller-run' && run.namespace===ns && run.state==='completed' &&
        run.retirementState==='released' && run.workerRetired===true &&
        run.revision?.sourceHash===hash && !run.resultDeliveryRevoked &&
        manifest.siteOrigins.includes(run.target?.allowedOrigin) &&
        result?.tag==='controller-result' && result.resultId===run.resultId &&
        result.namespace===ns && result.runId===run.runId &&
        result.state==='completed' && result.outcome?.ok===true &&
        result.revision?.sourceHash===hash,'E_VERIFICATION','No matching durable completed Controller run');
      invariant(run.builtinAbi===BUILTIN_ABI,'E_BUILTIN_VERSION_UNAVAILABLE','任务验证必须与当前内置库版本一致');
      // A settled run alone is not formal verification. The page effect must
      // have a success receipt bound to this exact host, source and request.
      // Controller admission and the native driver persist these authenticated
      // fields; a caught native error must never qualify a candidate.
      const effects=[];
      for (const value of await tx.all('commandJournal')) {
        const envelope=value?.envelope;
        if (value?.tag!=='controller-operation' || value.runId!==run.runId ||
            value.state!=='durable' || value.reply?.error ||
            value.reply?.requestId!==envelope?.requestId ||
            !['packaged','browser','user-script'].includes(envelope?.operation?.kind) ||
            envelope.identity?.tag!=='controller-run' ||
            envelope.identity.runId!==run.runId || envelope.identity.scriptId!==run.scriptId ||
            envelope.identity.contentHash!==hash ||
            envelope.identity.hostInstanceId!==run.hostInstanceId ||
            envelope.identity.hostDocumentId!==run.hostDocumentId ||
            envelope.revision?.sourceHash!==hash ||
            envelope.target?.allowedOrigin!==run.target.allowedOrigin) continue;
        const receipt=value.nativeReceipts?.find(item=>item.stage==='result' &&
          item.requestId===envelope.requestId && item.receipt?.requestId===envelope.requestId);
        if (!receipt) continue;
        if (value.requestDigest!==await digest(envelope,{maxDepth:48}) ||
            canonical(value.reply,{maxDepth:48})!==canonical(receipt.receipt,{maxDepth:48})) continue;
        effects.push(value);
      }
      invariant(effects.length>0,'E_VERIFICATION','Exact successful native page-effect receipt is required');
      assertBuiltinIdentity(run.builtinIdentity,current);
      assertBuiltinIdentity(result.builtinIdentity,current);
      // This proves fixed-source execution on the recorded origin. Installation
      // reviews the complete manifest scope; it does not claim every site worked.
      if(recovering){
        row.runtimeHistory=[...(row.runtimeHistory??[]),{
          builtinIdentity:structuredClone(row.builtinIdentity),stage:row.stage,
          verification:structuredClone(row.verification),availableAt:row.availableAt}];
        delete row.availableAt;
      }
      row.builtinIdentity=current;
      row.stage='verified';
      row.verification={runId:run.runId,resultId:result.resultId,sourceHash:hash,builtinIdentity:current,builtinAbi:run.builtinAbi,
        manifestHash:row.package.manifestHash,origin:run.target.allowedOrigin,
        nativeReceiptCount:effects.length,verifiedAt:clock.now()};
      await tx.put(TASK_STORE,row,key);
      return detail(row,current);
    });
  }
  async function makeTaskAvailable(request,sender) {
    const current=await environment();
    fields(request,['taskId','version','manifestHash']);
    return scoped(sender,[TASK_STORE],'readwrite',async(tx,ns)=>{
      const key=taskKey(ns,request.taskId,request.version),row=validCandidate(await tx.get(TASK_STORE,key),ns);
      await verifyTaskPackage(row.package);
      invariant(row.package.manifestHash===request.manifestHash &&
        row.verification?.sourceHash===row.package.manifest.program.sourceHash &&
        row.verification?.manifestHash===row.package.manifestHash &&
        ['verified','available'].includes(row.stage),'E_VERIFICATION','Task lacks trusted local verification');
      requireCurrentLibraries(row);
      assertBuiltinIdentity(row.builtinIdentity,current);
      assertBuiltinIdentity(row.verification.builtinIdentity,current);
      row.stage='available';row.availableAt??=clock.now();
      await tx.put(TASK_STORE,row,key);return detail(row,current);
    });
  }
  async function installTask(request,sender) {
    const current=await environment();
    request=structuredClone(request);
    fields(request,['taskId','version','manifestHash','expectedInstalledVersion','expectedGeneration','expectedInstallationId'],
      ['taskId','version','manifestHash','expectedInstalledVersion']);
    invariant(request.expectedInstalledVersion===null || typeof request.expectedInstalledVersion==='string','E_SCHEMA');
    return scoped(sender,[TASK_STORE,'scriptHeads','scriptRevisions','runs'],'readwrite',async(tx,ns)=>{
      return installInTransaction(tx,ns,request,current,clock);
    });
  }
  async function setInstalledTaskEnabled(request,sender) {
    request=structuredClone(request);
    fields(request,['taskId','version','enabled','expectedGeneration','expectedInstallationId']);
    invariant(typeof request.enabled==='boolean','E_SCHEMA');
    const current=await environment();
    return scoped(sender,[TASK_STORE,'runs'],'readwrite',async(tx,ns)=>{
      const key=installedKey(ns,request.taskId),row=await tx.get(TASK_STORE,key);
      invariant(row?.tag==='task-installed-v1'&&row.version===request.version&&
        request.expectedGeneration===(row.authorization?.generation??null)&&
        request.expectedInstallationId===(row.authorization?.installationId??null),'E_REVISION','Installed task authorization changed');
      const candidate=validCandidate(await tx.get(TASK_STORE,taskKey(ns,row.taskId,row.version)),ns);
      await verifyTaskPackage(candidate.package);
      assertBuiltinIdentity(row.builtinIdentity,current);
      assertBuiltinIdentity(candidate.builtinIdentity,current);
      assertBuiltinIdentity(candidate.verification?.builtinIdentity,current);
      invariant(candidate.stage==='available'&&candidate.package.manifestHash===row.manifestHash&&
        candidate.verification?.manifestHash===row.manifestHash,'E_PERMISSION','任务安装缺少固定版本验证');
      requireCurrentLibraries(candidate);
      await tx.put(TASK_STORE,{...row,enabled:request.enabled,
        authorization:installAuthorization(candidate.package.manifest,row.authorization)},key);
      await fenceInstalledRuns(tx,ns,row);
      return {taskId:row.taskId,version:row.version,enabled:request.enabled};
    });
  }
  async function uninstallTask(request,sender) {
    request=structuredClone(request);
    fields(request,['taskId','version','expectedGeneration','expectedInstallationId']);
    return scoped(sender,[TASK_STORE,'runs'],'readwrite',async(tx,ns)=>{
      const key=installedKey(ns,request.taskId),row=await tx.get(TASK_STORE,key);
      invariant(row?.tag==='task-installed-v1'&&row.version===request.version&&
        request.expectedGeneration===(row.authorization?.generation??null)&&
        request.expectedInstallationId===(row.authorization?.installationId??null),'E_REVISION','Installed task authorization changed');
      // Preserve immutable revision bytes for existing run/result pins and history.
      await tx.delete(TASK_STORE,key);
      await tx.put(TASK_STORE,{tag:'task-removed-v1',namespace:ns,taskId:row.taskId,version:row.version,removedAt:clock.now()},taskRemovalKey(ns,row.taskId));
      await fenceInstalledRuns(tx,ns,row);
      return {taskId:row.taskId,version:row.version,uninstalled:true};
    });
  }
  async function resolveInstalledTask(request,sender) {
    const current=await environment();
    fields(request,['taskId']);
    const initialization=await initializeBuiltins(sender,current);
    return scoped(sender,[TASK_STORE,'scriptRevisions'],'readonly',async(tx,ns)=>{
      const row=await tx.get(TASK_STORE,installedKey(ns,request.taskId));
      if(row?.tag!=='task-installed-v1'){
        const removed=await tx.get(TASK_STORE,taskRemovalKey(ns,request.taskId));
        invariant(!removed,'E_TASK_REMOVED','Task was explicitly removed');
        invariant(initialization.status!=='failed'||!BUILTIN_TASK_RELEASES.some(item=>item.taskId===request.taskId),
          'E_TASK_INITIALIZATION',initialization.message);
        invariant(false,'E_TASK_NOT_INSTALLED','Task is not installed');
      }
      invariant(row.enabled,'E_TASK_DISABLED','Task is disabled');
      const stored=validCandidate(await tx.get(TASK_STORE,taskKey(ns,row.taskId,row.version)),ns);
      // Metadata resolution has no execution target. A representative member
      // checks installation integrity here; run admission checks the REAL origin.
      const {candidate}=await assertInstalledTask(tx,ns,{scriptId:row.scriptId,
        contentHash:stored.package.manifest.program.sourceHash,
        origin:stored.package.manifest.siteOrigins[0],builtinIdentity:current});
      return {taskId:row.taskId,version:row.version,scriptId:row.scriptId,revision:1,
        installationId:row.authorization?.installationId??null,generation:row.authorization?.generation??null,
        contentHash:candidate.package.manifest.program.sourceHash,manifest:structuredClone(candidate.package.manifest),
        manifestHash:candidate.package.manifestHash};
    });
  }
  return {importTaskPackage,listTaskCatalog,getTaskCandidate,verifyTaskCandidate,makeTaskAvailable,
    installTask,setInstalledTaskEnabled,uninstallTask,resolveInstalledTask};
}
