import {canonical, invariant} from '../protocol.js';
import {createTaskPackage, installedKey, taskKey, taskScriptId, scriptStorageKey,
  validateTaskManifest, validateTaskParams, verifyTaskPackage} from './contract.js';

const candidateStates = new Set(['candidate','verified','available']);
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
export async function assertInstalledTask(tx,namespace,{scriptId,contentHash,origin,params}) {
  // Run admission invokes this INSIDE its durable revision-pin/slot transaction.
  // Even a direct low-level startControllerRun cannot bypass an installation.
  const installs=(await tx.all('frameworkKV')).filter(row=>row?.tag==='task-installed-v1' &&
    row.namespace===namespace && row.scriptId===scriptId && row.enabled===true);
  invariant(installs.length===1,'E_PERMISSION','Task must be explicitly installed and enabled');
  const install=installs[0];
  const candidate=validCandidate(await tx.get('frameworkKV',taskKey(namespace,install.taskId,install.version)),namespace);
  await verifyTaskPackage(candidate.package);
  invariant(candidate.stage==='available' && candidate.verification?.sourceHash===contentHash &&
    candidate.verification?.manifestHash===candidate.package.manifestHash &&
    candidate.package.manifestHash===install.manifestHash &&
    candidate.package.manifest.program.sourceHash===contentHash &&
    candidate.package.manifest.siteOrigins.includes(origin) &&
    taskScriptId(install.taskId,install.version)===scriptId,'E_PERMISSION',
    'Installed task does not match its Available version or website');
  validateTaskParams(candidate.package.manifest.paramsSchema,params);
  return candidate;
}

export function taskMethods({storage,assertHost,currentHost,clock={now:()=>Date.now()}}) {
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
        scriptId:row.scriptId,enabled:row.enabled,installedAt:row.installedAt}))};
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
      if (row.stage!=='candidate') return detail(row);
      const run=await tx.get('runs',request.runId);
      const result=run?.resultId && await tx.get('results',run.resultId);
      const manifest=row.package.manifest, hash=manifest.program.sourceHash;
      invariant(run?.tag==='controller-run' && run.namespace===ns && run.state==='completed' &&
        run.retirementState==='released' && run.revision?.sourceHash===hash && !run.resultDeliveryRevoked &&
        run.target?.allowedOrigin===manifest.siteOrigins[0] &&
        result?.tag==='controller-result' && result.namespace===ns && result.runId===run.runId &&
        result.state==='completed' && result.outcome?.ok===true &&
        result.revision?.sourceHash===hash,'E_VERIFICATION','No matching durable completed Controller run');
      const effects=(await tx.all('commandJournal')).filter(value=>value?.runId===run.runId &&
        value.tag==='controller-operation' && value.state==='durable' &&
        ['browser','user-script'].includes(value.envelope?.operation?.kind) &&
        value.nativeReceipts?.some(receipt=>receipt.stage==='result'));
      invariant(effects.length>0,'E_VERIFICATION','A native page operation receipt is required; no mock verification');
      row.stage='verified';
      row.verification={runId:run.runId,resultId:result.resultId,sourceHash:hash,
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
      row.stage='available';row.availableAt??=clock.now();
      await tx.put('frameworkKV',row,key);return detail(row);
    });
  }
  async function installTask(request,sender) {
    fields(request,['taskId','version','manifestHash','expectedInstalledVersion']);
    invariant(request.expectedInstalledVersion===null || typeof request.expectedInstalledVersion==='string','E_SCHEMA');
    return scoped(sender,['frameworkKV','scriptHeads','scriptRevisions'],'readwrite',async(tx,ns)=>{
      const candidate=validCandidate(await tx.get('frameworkKV',taskKey(ns,request.taskId,request.version)),ns);
      const pkg=await verifyTaskPackage(candidate.package);
      invariant(candidate.stage==='available' && candidate.verification?.manifestHash===pkg.manifestHash &&
        candidate.verification?.sourceHash===pkg.manifest.program.sourceHash &&
        pkg.manifestHash===request.manifestHash,'E_VERIFICATION','Only exact Available task versions can install');
      const installKey=installedKey(ns,request.taskId),old=await tx.get('frameworkKV',installKey);
      invariant((old?.version ?? null)===request.expectedInstalledVersion,'E_REVISION','Installed version changed');
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
        scriptId:id,manifestHash:pkg.manifestHash,enabled:true,installedAt:clock.now()};
      await tx.put('frameworkKV',row,installKey);
      return {taskId:row.taskId,version:row.version,enabled:row.enabled,manifestHash:row.manifestHash};
    });
  }
  async function setInstalledTaskEnabled(request,sender) {
    fields(request,['taskId','version','enabled']);
    invariant(typeof request.enabled==='boolean','E_SCHEMA');
    return scoped(sender,['frameworkKV'],'readwrite',async(tx,ns)=>{
      const key=installedKey(ns,request.taskId),row=await tx.get('frameworkKV',key);
      invariant(row?.tag==='task-installed-v1' && row.version===request.version,'E_REVISION','Installed task changed');
      await tx.put('frameworkKV',{...row,enabled:request.enabled},key);
      return {taskId:row.taskId,version:row.version,enabled:request.enabled};
    });
  }
  async function uninstallTask(request,sender) {
    fields(request,['taskId','version']);
    return scoped(sender,['frameworkKV'],'readwrite',async(tx,ns)=>{
      const key=installedKey(ns,request.taskId),row=await tx.get('frameworkKV',key);
      invariant(row?.tag==='task-installed-v1' && row.version===request.version,'E_REVISION','Installed task changed');
      // Preserve immutable revision bytes for existing run/result pins and history.
      await tx.delete('frameworkKV',key);
      return {taskId:row.taskId,version:row.version,uninstalled:true};
    });
  }
  async function resolveInstalledTask(request,sender) {
    fields(request,['taskId']);
    return scoped(sender,['frameworkKV','scriptRevisions'],'readonly',async(tx,ns)=>{
      const row=await tx.get('frameworkKV',installedKey(ns,request.taskId));
      invariant(row?.tag==='task-installed-v1' && row.enabled,'E_PERMISSION','Task is disabled or not installed');
      const candidate=await assertInstalledTask(tx,ns,{scriptId:row.scriptId,
        contentHash:(await tx.get('frameworkKV',taskKey(ns,row.taskId,row.version))).package.manifest.program.sourceHash,
        origin:(await tx.get('frameworkKV',taskKey(ns,row.taskId,row.version))).package.manifest.siteOrigins[0],
        params:{} /* validate separately at Run admission */});
      return {taskId:row.taskId,version:row.version,scriptId:row.scriptId,revision:1,
        contentHash:candidate.package.manifest.program.sourceHash,manifest:structuredClone(candidate.package.manifest),
        manifestHash:candidate.package.manifestHash};
    });
  }
  return {importTaskPackage,listTaskCatalog,getTaskCandidate,verifyTaskCandidate,makeTaskAvailable,
    installTask,setInstalledTaskEnabled,uninstallTask,resolveInstalledTask};
}
