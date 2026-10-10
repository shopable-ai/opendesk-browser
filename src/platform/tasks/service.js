import {canonical, digest, invariant} from '../protocol.js';
import {BUILTIN_ABI} from '../../libs/runtime-contract.js';
import {installedKey, taskKey, taskScriptId, scriptStorageKey,
  validateTaskParams, verifyTaskPackage} from './contract.js';

const candidateStates = new Set(['candidate','verified','available']);
function requireCurrentLibraries(candidate){
  invariant(candidate?.verification?.builtinAbi===BUILTIN_ABI,
    'E_BUILTIN_VERSION_UNAVAILABLE','任务所验证的内置库版本已更改；请创建新任务版本并重新验证');
}
function fields(value,allowed,required=allowed) {
  invariant(value && typeof value==='object' && !Array.isArray(value) &&
    Object.keys(value).every(key=>allowed.includes(key)) &&
    required.every(key=>Object.hasOwn(value,key)),'E_SCHEMA','Unexpected task operation fields');
}
function keyValue(value) {invariant(typeof value==='string' && value.length>0,'E_SCHEMA','Missing task identity');}
function detail(row) {
  return {taskId:row.taskId,version:row.version,manifest:structuredClone(row.package.manifest),
    manifestHash:row.package.manifestHash,stage:row.stage,verifiedAt:row.verification?.verifiedAt ?? null,
    verification:row.verification ? {runId:row.verification.runId,resultId:row.verification.resultId,
      sourceHash:row.verification.sourceHash,origin:row.verification.origin} : null};
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
export async function assertInstalledTask(tx,namespace,{scriptId,contentHash,origin,params,migrate=false,expectedGeneration,expectedInstallationId}) {
  // Run admission invokes this INSIDE its durable revision-pin/slot transaction.
  // Even a direct low-level startControllerRun cannot bypass an installation.
  const installs=(await tx.all('frameworkKV')).filter(row=>row?.tag==='task-installed-v1' &&
    row.namespace===namespace && row.scriptId===scriptId && row.enabled===true);
  invariant(installs.length===1,'E_PERMISSION','Task must be explicitly installed and enabled');
  const install=installs[0];
  if(migrate)invariant(expectedGeneration===(install.authorization?.generation??null)&&
    expectedInstallationId===(install.authorization?.installationId??null),
    'E_REVISION','任务安装或授权在运行准备期间改变，请重新运行');
  const candidate=validCandidate(await tx.get('frameworkKV',taskKey(namespace,install.taskId,install.version)),namespace);
  await verifyTaskPackage(candidate.package);
  requireCurrentLibraries(candidate);
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
    await tx.put('frameworkKV',install,installedKey(namespace,install.taskId));
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

export async function assertRunTaskAuthorization(tx,run) {
  if(!run.scriptId?.startsWith('task:'))return;
  const bound=run.installedTaskAuthorization;
  invariant(bound?.taskId&&bound.authorization,'E_PERMISSION','旧任务运行没有可恢复的安装授权，请重新运行');
  invariant(run.builtinAbi===BUILTIN_ABI,'E_BUILTIN_VERSION_UNAVAILABLE','旧任务运行内置库身份已改变，禁止继续执行');
  const current=await tx.get('frameworkKV',installedKey(run.namespace,bound.taskId));
  invariant(current?.tag==='task-installed-v1'&&current.enabled&&current.scriptId===run.scriptId&&
    current.version===bound.version&&current.manifestHash===bound.manifestHash&&
    canonical(current.authorization)===canonical(bound.authorization),
    'E_PERMISSION','任务已停用、卸载或授权版本改变；旧运行不能恢复');
}

export function taskMethods({storage,assertHost,currentHost,clock={now:()=>Date.now()}}) {
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
  async function scoped(sender,stores,mode,run) {
    const host=await assertHost(sender);
    return storage.transaction([...new Set([...stores,'commandJournal'])],mode,async tx=>{
      await currentHost(tx,host,sender);
      const answer=await run(tx,host.namespace,host);
      await currentHost(tx,host,sender);
      return answer;
    });
  }
  async function importTaskPackage(request,sender) {
    fields(request,['package']);
    const pkg=await verifyTaskPackage(request.package);
    const {taskId,version}=pkg.manifest;
    return scoped(sender,['frameworkKV'],'readwrite',async (tx,ns)=>{
      const key=taskKey(ns,taskId,version), existing=await tx.get('frameworkKV',key);
      if (existing) {
        validCandidate(existing,ns);
        invariant(existing.package.manifestHash===pkg.manifestHash &&
          existing.package.sourceUtf8===pkg.sourceUtf8,'E_REQUEST_CONFLICT','Task version is immutable');
        return detail(existing);
      }
      const row={tag:'task-candidate-v1',namespace:ns,taskId,version,package:pkg,
        stage:'candidate',verification:null,createdAt:clock.now()};
      await tx.put('frameworkKV',row,key);
      return detail(row);
    });
  }
  async function listTaskCatalog(request,sender) {
    fields(request ?? {},[]);
    return scoped(sender,['frameworkKV'],'readonly',async (tx,ns)=>{
      const rows=(await tx.all('frameworkKV')).filter(row=>row?.tag==='task-candidate-v1'&&row.namespace===ns);
      const installed=(await tx.all('frameworkKV')).filter(row=>row?.tag==='task-installed-v1'&&row.namespace===ns);
      const byId=new Map(installed.map(row=>[row.taskId,row]));
      return {catalog:rows.map(row=>({...detail(row),installed:byId.get(row.taskId)?.version===row.version,
        enabled:byId.get(row.taskId)?.version===row.version && byId.get(row.taskId).enabled})),
      installed:installed.map(row=>({taskId:row.taskId,version:row.version,manifestHash:row.manifestHash,
        scriptId:row.scriptId,enabled:row.enabled,installedAt:row.installedAt,
        installationId:row.authorization?.installationId??null,generation:row.authorization?.generation??null}))};
    });
  }
  async function getTaskCandidate(request,sender) {
    fields(request,['taskId','version']);keyValue(request.taskId);keyValue(request.version);
    return scoped(sender,['frameworkKV'],'readonly',async(tx,ns)=>{
      const row=validCandidate(await tx.get('frameworkKV',taskKey(ns,request.taskId,request.version)),ns);
      await verifyTaskPackage(row.package);
      return {...detail(row),package:structuredClone(row.package)};
    });
  }
  async function verifyTaskCandidate(request,sender) {
    fields(request,['taskId','version','runId']);keyValue(request.runId);
    return scoped(sender,['frameworkKV','runs','results'],'readwrite',async(tx,ns)=>{
      const key=taskKey(ns,request.taskId,request.version);
      const row=validCandidate(await tx.get('frameworkKV',key),ns);
      await verifyTaskPackage(row.package);
      if (row.stage!=='candidate') { requireCurrentLibraries(row); return detail(row); }
      const run=await tx.get('runs',request.runId);
      const result=run?.resultId && await tx.get('results',run.resultId);
      const manifest=row.package.manifest, hash=manifest.program.sourceHash;
      invariant(run?.tag==='controller-run' && run.namespace===ns && run.state==='completed' &&
        run.retirementState==='released' && run.workerRetired===true &&
        run.revision?.sourceHash===hash && !run.resultDeliveryRevoked &&
        run.target?.allowedOrigin===manifest.siteOrigins[0] &&
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
            envelope.target?.allowedOrigin!==manifest.siteOrigins[0]) continue;
        const receipt=value.nativeReceipts?.find(item=>item.stage==='result' &&
          item.requestId===envelope.requestId && item.receipt?.requestId===envelope.requestId);
        if (!receipt) continue;
        if (value.requestDigest!==await digest(envelope,{maxDepth:48}) ||
            canonical(value.reply,{maxDepth:48})!==canonical(receipt.receipt,{maxDepth:48})) continue;
        effects.push(value);
      }
      invariant(effects.length>0,'E_VERIFICATION','Exact successful native page-effect receipt is required');
      row.stage='verified';
      row.verification={runId:run.runId,resultId:result.resultId,sourceHash:hash,builtinAbi:run.builtinAbi,
        manifestHash:row.package.manifestHash,origin:run.target.allowedOrigin,
        nativeReceiptCount:effects.length,verifiedAt:clock.now()};
      await tx.put('frameworkKV',row,key);
      return detail(row);
    });
  }
  async function makeTaskAvailable(request,sender) {
    fields(request,['taskId','version','manifestHash']);
    return scoped(sender,['frameworkKV'],'readwrite',async(tx,ns)=>{
      const key=taskKey(ns,request.taskId,request.version),row=validCandidate(await tx.get('frameworkKV',key),ns);
      await verifyTaskPackage(row.package);
      invariant(row.package.manifestHash===request.manifestHash &&
        row.verification?.sourceHash===row.package.manifest.program.sourceHash &&
        row.verification?.manifestHash===row.package.manifestHash &&
        ['verified','available'].includes(row.stage),'E_VERIFICATION','Task lacks trusted local verification');
      requireCurrentLibraries(row);
      row.stage='available';row.availableAt??=clock.now();
      await tx.put('frameworkKV',row,key);return detail(row);
    });
  }
  async function installTask(request,sender) {
    request=structuredClone(request);
    fields(request,['taskId','version','manifestHash','expectedInstalledVersion','expectedGeneration','expectedInstallationId'],
      ['taskId','version','manifestHash','expectedInstalledVersion']);
    invariant(request.expectedInstalledVersion===null || typeof request.expectedInstalledVersion==='string','E_SCHEMA');
    return scoped(sender,['frameworkKV','scriptHeads','scriptRevisions','runs'],'readwrite',async(tx,ns)=>{
      const candidate=validCandidate(await tx.get('frameworkKV',taskKey(ns,request.taskId,request.version)),ns);
      const pkg=await verifyTaskPackage(candidate.package);
      invariant(candidate.stage==='available' && candidate.verification?.manifestHash===pkg.manifestHash &&
        candidate.verification?.sourceHash===pkg.manifest.program.sourceHash &&
        pkg.manifestHash===request.manifestHash,'E_VERIFICATION','Only exact Available task versions can install');
      requireCurrentLibraries(candidate);
      const installKey=installedKey(ns,request.taskId),old=await tx.get('frameworkKV',installKey);
      invariant((old?.version ?? null)===request.expectedInstalledVersion&&
        (!old?(request.expectedGeneration??null)===null&&(request.expectedInstallationId??null)===null:
          request.expectedGeneration===(old.authorization?.generation??null)&&
          request.expectedInstallationId===(old.authorization?.installationId??null)),
        'E_REVISION','Installed version or authorization changed');
      const id=taskScriptId(request.taskId,request.version);
      const headKey=scriptStorageKey(ns,id),revisionKey=scriptStorageKey(ns,id,1);
      const head=await tx.get('scriptHeads',headKey),revision=await tx.get('scriptRevisions',revisionKey);
      if (head || revision) invariant(head?.revision===1 && head.contentHash===pkg.manifest.program.sourceHash &&
        !head.tombstoned && revision?.sourceUtf8===pkg.sourceUtf8 &&
        revision?.contentHash===pkg.manifest.program.sourceHash,'E_HASH','Installed script integrity differs');
      else {
        await tx.put('scriptRevisions',{tag:'script-revision',namespace:ns,scriptId:id,revision:1,
          parentRevision:0,contentHash:pkg.manifest.program.sourceHash,sourceUtf8:pkg.sourceUtf8},revisionKey);
        await tx.put('scriptHeads',{tag:'script-head',namespace:ns,scriptId:id,revision:1,
          contentHash:pkg.manifest.program.sourceHash,tombstoned:false},headKey);
      }
      const row={tag:'task-installed-v1',namespace:ns,taskId:request.taskId,version:request.version,
        scriptId:id,manifestHash:pkg.manifestHash,enabled:true,installedAt:old?.installedAt??clock.now(),
        authorization:installAuthorization(pkg.manifest,old?.authorization)};
      await fenceInstalledRuns(tx,ns,old);
      await tx.put('frameworkKV',row,installKey);
      return {taskId:row.taskId,version:row.version,enabled:row.enabled,manifestHash:row.manifestHash};
    });
  }
  async function setInstalledTaskEnabled(request,sender) {
    request=structuredClone(request);
    fields(request,['taskId','version','enabled','expectedGeneration','expectedInstallationId']);
    invariant(typeof request.enabled==='boolean','E_SCHEMA');
    return scoped(sender,['frameworkKV','runs'],'readwrite',async(tx,ns)=>{
      const key=installedKey(ns,request.taskId),row=await tx.get('frameworkKV',key);
      invariant(row?.tag==='task-installed-v1'&&row.version===request.version&&
        request.expectedGeneration===(row.authorization?.generation??null)&&
        request.expectedInstallationId===(row.authorization?.installationId??null),'E_REVISION','Installed task authorization changed');
      const candidate=validCandidate(await tx.get('frameworkKV',taskKey(ns,row.taskId,row.version)),ns);
      await verifyTaskPackage(candidate.package);
      invariant(candidate.stage==='available'&&candidate.package.manifestHash===row.manifestHash&&
        candidate.verification?.manifestHash===row.manifestHash,'E_PERMISSION','任务安装缺少固定版本验证');
      requireCurrentLibraries(candidate);
      await tx.put('frameworkKV',{...row,enabled:request.enabled,
        authorization:installAuthorization(candidate.package.manifest,row.authorization)},key);
      await fenceInstalledRuns(tx,ns,row);
      return {taskId:row.taskId,version:row.version,enabled:request.enabled};
    });
  }
  async function uninstallTask(request,sender) {
    request=structuredClone(request);
    fields(request,['taskId','version','expectedGeneration','expectedInstallationId']);
    return scoped(sender,['frameworkKV','runs'],'readwrite',async(tx,ns)=>{
      const key=installedKey(ns,request.taskId),row=await tx.get('frameworkKV',key);
      invariant(row?.tag==='task-installed-v1'&&row.version===request.version&&
        request.expectedGeneration===(row.authorization?.generation??null)&&
        request.expectedInstallationId===(row.authorization?.installationId??null),'E_REVISION','Installed task authorization changed');
      // Preserve immutable revision bytes for existing run/result pins and history.
      await tx.delete('frameworkKV',key);
      await fenceInstalledRuns(tx,ns,row);
      return {taskId:row.taskId,version:row.version,uninstalled:true};
    });
  }
  async function resolveInstalledTask(request,sender) {
    fields(request,['taskId']);
    return scoped(sender,['frameworkKV','scriptRevisions'],'readonly',async(tx,ns)=>{
      const row=await tx.get('frameworkKV',installedKey(ns,request.taskId));
      invariant(row?.tag==='task-installed-v1' && row.enabled,'E_PERMISSION','Task is disabled or not installed');
      const stored=validCandidate(await tx.get('frameworkKV',taskKey(ns,row.taskId,row.version)),ns);
      const {candidate}=await assertInstalledTask(tx,ns,{scriptId:row.scriptId,
        contentHash:stored.package.manifest.program.sourceHash,
        origin:stored.package.manifest.siteOrigins[0]});
      return {taskId:row.taskId,version:row.version,scriptId:row.scriptId,revision:1,
        installationId:row.authorization?.installationId??null,generation:row.authorization?.generation??null,
        contentHash:candidate.package.manifest.program.sourceHash,manifest:structuredClone(candidate.package.manifest),
        manifestHash:candidate.package.manifestHash};
    });
  }
  return {importTaskPackage,listTaskCatalog,getTaskCandidate,verifyTaskCandidate,makeTaskAvailable,
    installTask,setInstalledTaskEnabled,uninstallTask,resolveInstalledTask};
}
