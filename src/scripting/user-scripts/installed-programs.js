import {APP_PAGE_ACTION,verifyAppPageTool,readAppPageParent,appPageStorage} from './app-page-contract.js';
import {readPageRecords} from './page-records.js';
import {appPageDispatchSource} from './app-page-runtime.js';
import {PAGE_TASK_ACTION,readPageTaskDelegations} from './page-task-contract.js';
import {sidebarToolPackageHash} from '../../ui/sidebar-tools/package.js';
import {readNativeUserScripts} from './native-access.js';
import {validatePageInstallPackage} from './page-install-package.js';
import {parseUserScriptDependencies} from './dependency-metadata.js';
import {canonical,digest,digestUtf8,invariant,FoundationError} from '../../platform/protocol.js';
import {BUILTIN_ABI,BUILTIN_RUNTIME_CATALOG} from '../../libs/runtime-contract.js';
import {preparePageProgramRegistration} from './page-program-package.js';
import {httpUrl} from '../../environment.js';
import {PAGE_WORLD_CSP,pageWantsJquery,pageSelectedPackagedLibraries,pageOptionalLibraryId} from './execution-source.js';
import {loadPackagedPageFramework} from '../../libs/page-frameworks/loader.js';
import {PAGE_FRAMEWORK_RUNTIMES} from '../../libs/page-frameworks/contract.js';
import {JQUERY_371,loadPackagedJquery} from './packaged-dependencies.js';
import {loadBuiltinPageSource,loadPackagedOptionalPageLibraries} from '../../libs/loader.js';
import {builtinIdentity,assertBuiltinIdentity} from '../../libs/identity.js';
import {pageInstallScope,pageInstallScopeDelta,pageHostPermissionOrigins,assertPageInstallAuthorization,pageInstallAffectedByRemoval} from './page-install-authorization.js';
import {buildScrollSiteUpgradePackage,scrollSiteRevision} from './scroll-site-upgrade.js';
import {SCROLL_CONFIG_PROGRAM_ID,SCROLL_CONFIG_MIN_REVISION,SCROLL_CONFIG_EMPTY,normalizeScrollConfig,scrollSiteInstallMatches,scrollProgramUrlMatches,scrollPathMatches} from './scroll-config-contract.js';
import {pageProgramUrlMatches} from './page-program-rules.js';
import {PAGE_FRAME_ACTION} from './page-frame-runtime.js';
import {SEND_QUEUE_PIN,admitsPinnedQueuePage} from '../../platform/host/send-queue-admission.js';
import {MAX_INSTALLED_DOCUMENT_EXECUTIONS,assertInstalledPageDispatch} from '../../platform/host/preview-admission.js';
// Reuse exact literals within the fixed privileged bundle budget.
const PAGE_STORE="frameworkKV",
  PAGE_INSTALL_TAG="page-installed-v1",
  PAGE_UNINSTALL_TAG="page-uninstalled-v1",
  PAGE_CLEANUP_TAG="page-cleanup-v1",
  INSTALL_KEY_KIND="installed",
  PAGE_WRITE="readwrite",
  PAGE_PERMISSION_ERROR="E_PERMISSION",
  PAGE_UNKNOWN_ERROR="E_EFFECT_UNKNOWN",
  PAGE_REVISION_ERROR="E_REVISION";


export const PAGE_BOOT_PROTOCOL='opendesk.page-installed.boot.v1';
export const PAGE_BOOT_WORLD='opendesk-page-installed-bootstrap-v1';
const PREFIX='opendesk-page-boot-';
const ACCESS_CHANGED='访问受限，请检查安装并恢复访问';
const SEND_QUEUE_PROGRAM_ID=SEND_QUEUE_PIN.pageProgramId;
const key=(kind,ns,...identity)=>'page-'+kind+':'+canonical([ns,...identity]);
const fields=(value,allowed,required=allowed)=>invariant(value&&typeof value==='object'&&!Array.isArray(value)&&
  Object.keys(value).every(k=>allowed.includes(k))&&required.every(k=>Object.hasOwn(value,k)),
  'E_SCHEMA','页面安装请求字段不完整或包含未知字段');
const identityFields=['builtinIdentity','candidateId','namespace','manifestHash','runtimeKind','entryFormat','programId','revision',
  'sourceHash','dependencyLockId','dependencyManifestDigest','approvedPageRules'];
const equal=(a,b)=>canonical(a)===canonical(b);
// Observation is a data-only boundary, including non-enumerable/symbol keys
// and accessors that Object.keys alone would silently overlook.
function scrollObservationFields(value,keys){
  invariant(value&&typeof value==='object'&&!Array.isArray(value)&&
    [Object.prototype,null].includes(Object.getPrototypeOf(value))&&
    Reflect.ownKeys(value).length===keys.length&&keys.every(key=>{
      const descriptor=Object.getOwnPropertyDescriptor(value,key);
      return descriptor?.enumerable&&Object.hasOwn(descriptor,'value');
    }),'E_CONFIG_SCHEMA','网页观察包含无效字段');
}
function boundedScrollObservation(value){
  const state=value&&typeof value==='object'?Object.getOwnPropertyDescriptor(value,'state')?.value:undefined;
  if(state==='busy'||state==='closed'){
    scrollObservationFields(value,['state']);
    throw new FoundationError('E_CONFIG_DOM','网页编辑器正在点选或已关闭');
  }
  scrollObservationFields(value,state==='unavailable'?['state','reason']:['state','candidates']);
  if(value.state==='unavailable'){
    invariant(['NO_STRUCTURE','BUSY','DISPOSED'].includes(value.reason),
      'E_CONFIG_SCHEMA','网页观察状态无效');
    return {state:'unavailable',reason:value.reason};
  }
  invariant(value.state==='observed'&&Array.isArray(value.candidates)&&
    Object.getPrototypeOf(value.candidates)===Array.prototype&&
    value.candidates.length>0&&value.candidates.length<=8&&
    Reflect.ownKeys(value.candidates).length===value.candidates.length+1,
    'E_CONFIG_SCHEMA','网页观察候选数量无效');
  const seen=new Set(),candidates=[];
  for(let index=0;index<value.candidates.length;index++){
    const descriptor=Object.getOwnPropertyDescriptor(value.candidates,String(index));
    invariant(descriptor?.enumerable&&Object.hasOwn(descriptor,'value'),
      'E_CONFIG_SCHEMA','网页观察候选无效');
    const candidate=descriptor.value;
    scrollObservationFields(candidate,['id','mainSelector','scrollSelector','messageSelector','anchorSelector','metrics']);
    invariant(typeof candidate.id==='string'&&/^candidate-[1-8]$/.test(candidate.id)&&
      !seen.has(candidate.id)&&candidate.anchorSelector==='',
      'E_CONFIG_SCHEMA','网页观察候选身份无效');
    seen.add(candidate.id);
    for(const key of ['mainSelector','scrollSelector','messageSelector'])
      invariant(typeof candidate[key]==='string'&&candidate[key].trim().length>0&&
        candidate[key].length<=256&&!/[\u0000-\u001f\u007f{};]/.test(candidate[key]),
        'E_CONFIG_SCHEMA','网页观察 CSS 选择器无效');
    scrollObservationFields(candidate.metrics,['messageCount','scrollable']);
    invariant(Number.isSafeInteger(candidate.metrics.messageCount)&&
      candidate.metrics.messageCount>=1&&candidate.metrics.messageCount<=2000&&
      typeof candidate.metrics.scrollable==='boolean',
      'E_CONFIG_SCHEMA','网页观察指标无效');
    candidates.push({id:candidate.id,mainSelector:candidate.mainSelector,
      scrollSelector:candidate.scrollSelector,messageSelector:candidate.messageSelector,anchorSelector:'',
      metrics:{messageCount:candidate.metrics.messageCount,scrollable:candidate.metrics.scrollable}});
  }
  return {state:'observed',candidates};
}
function installedURLMatches(row,href){
  return row.programId===SCROLL_CONFIG_PROGRAM_ID?scrollProgramUrlMatches(row.pageRules,href):
    pageProgramUrlMatches(row.pageRules,href);
}
// Prove the entire segment prefix, including query URLs and descendants.
// Unsupported glob shapes are deliberately not treated as authorization proof.
function scrollConfigScopeCovered(rules,site){
  let required;try{required=scrollSiteInstallMatches(site.origin,site.pathScope);}catch{return false;}
  const path=pattern=>/^(https?|\*):\/\/([^/]+)(\/.*)$/.exec(pattern);
  const onOrigin=pattern=>{
    const m=path(pattern);
    return m&&pageProgramUrlMatches({...rules,matches:[m[1]+'://'+m[2]+'/*'],excludeMatches:[]},site.origin+'/');
  };
  const prefix=value=>value.split('*')[0];
  return required.every(target=>{
    const wanted=path(target)[3];
    return rules.matches.some(pattern=>{
      const m=path(pattern);
      if(!m||m[1]==='*'||m[2].includes('*')||!onOrigin(pattern)||
        new URL(m[1]+'://'+m[2]).origin!==site.origin)return false;
      const allowed=m[3];
      return allowed===wanted||allowed.endsWith('*')&&allowed.indexOf('*')===allowed.length-1&&
        prefix(wanted).startsWith(prefix(allowed));
    })&&!rules.excludeMatches.some(pattern=>{
      if(!onOrigin(pattern))return false;
      const excluded=prefix(path(pattern)[3]),wantedPrefix=prefix(wanted);
      return excluded.startsWith(wantedPrefix)||wantedPrefix.startsWith(excluded);
    });
  });
}
function identity(candidate){
  const m=candidate.manifest;
  return {builtinIdentity:candidate.builtinIdentity,candidateId:candidate.candidateId,namespace:candidate.namespace,manifestHash:candidate.manifestHash,
    runtimeKind:m.runtimeKind,entryFormat:m.entryFormat,programId:m.programId,revision:m.revision,
    sourceHash:m.sourceHash,dependencyLockId:m.dependencyLockId,dependencyManifestDigest:m.dependencyManifestDigest,
    approvedPageRules:m.pageRules};
}
async function verifiedEnvironment(candidate,receipt){
  // Old Page verification receipts are bound to the original library ABI and
  // catalog bytes. Never upgrade existing user code under an old receipt.
  invariant(receipt?.builtinAbi===BUILTIN_ABI &&
    receipt.builtinCatalogSha256===await digestUtf8(JSON.stringify(BUILTIN_RUNTIME_CATALOG)) &&
    /^[a-f0-9]{64}$/.test(receipt.builtinBundleSha256),
    'E_PAGE_ENVIRONMENT','内置库已更新，请保存新版本并重新验证');
  assertBuiltinIdentity(candidate.builtinIdentity,builtinIdentity(receipt));
  // Older versions treated this opt-in as a comment. Their immutable receipt
  // cannot approve a newly loaded library, even when user source is unchanged.
  invariant(!pageWantsJquery(candidate.sourceUtf8)||receipt.packagedJquerySha256===JQUERY_371.sha256,
    'E_PAGE_ENVIRONMENT','库环境已变化，请重新验证安装');
  const selected=pageSelectedPackagedLibraries(candidate.sourceUtf8);
  const ids=selected.map(pageOptionalLibraryId).filter(Boolean),recorded=receipt.packagedOptionals;
  if(ids.length){
    if(recorded!==undefined)
      invariant(Array.isArray(recorded)&&recorded.length===ids.length&&recorded.every((r,i)=>
        r?.id===ids[i]&&/^[a-f0-9]{64}$/.test(r.sha256)),'E_PAGE_ENVIRONMENT');
    else invariant(ids.length===1&&receipt.packagedOptionalId===ids[0]&&
      /^[a-f0-9]{64}$/.test(receipt.packagedOptionalSha256),'E_PAGE_ENVIRONMENT',
      '旧单库回执不能授权新增组合');
  }else invariant(recorded===undefined&&receipt.packagedOptionalId===undefined,'E_PAGE_ENVIRONMENT');
  const frameworkId=selected.find(id=>id==='react'||id==='vue');
  if(frameworkId)invariant(receipt.packagedFrameworkId===frameworkId&&
    receipt.packagedFrameworkSha256===PAGE_FRAMEWORK_RUNTIMES[frameworkId].sha256,'E_PAGE_ENVIRONMENT');
}
const publicInstall=row=>row?{...(row.appOwner?{appOwner:structuredClone(row.appOwner)}:{}),programId:row.programId,revision:row.revision,manifestHash:row.manifestHash,
  title:row.title??row.programId,
  ...(row.version?{version:row.version}:{}),
  sourceHash:row.sourceHash,pageRules:row.pageRules,enabled:row.enabled,nativeId:row.nativeId,nativeState:row.nativeState,
  authorization:row.authorization?structuredClone(row.authorization):null,
  ...(row.managedCleanup?{managedCleanup:structuredClone(row.managedCleanup)}:{}),
  // This is persisted installation readiness, not a receipt of page execution.
  ready:row.enabled===true&&row.nativeState==='registered'&&
    row.authorization?.status==='active'&&!row.error,
  error:row.error,lastExecution:row.lastExecution?publicExecution(row.lastExecution):null}:null;
function publicExecution(row){const {installationToken,...receipt}=row;return receipt;}

// One installed-program consumer of the existing DB, Host authority, compiler,
// USER_SCRIPT evaluator and shared execution slot. The registered code below
// contains no user source. A less-trusted message can only request its exact
// persisted installation; it cannot call any Host/SDK/Controller operation.
export function createInstalledPagePrograms({api,storage,assertHost,dependencies,preview,admission,session,clock={now:()=>Date.now()},loadBuiltin=loadBuiltinPageSource,onPageTask}){
  const namespace='tool:'+api.runtime.id;
  const taskAuthorityInstance=crypto.randomUUID();
  let mutations=Promise.resolve();
  const executions=[],runningDocuments=new Map();
  const documentKey=sender=>canonical([session,namespace,sender?.tab?.id,sender?.documentId]);
  function drainExecutions(releasedDocument){
    if([...runningDocuments.values()].some(job=>job.exclusive))return;
    while(executions.length&&runningDocuments.size<MAX_INSTALLED_DOCUMENT_EXECUTIONS){
      const barrier=executions.findIndex(job=>job.exclusive);
      const eligible=(job,index)=>(barrier<0||index<=barrier)&&!runningDocuments.has(job.documentKey);
      let index=executions.findIndex(eligible);
      if(index<0)return;
      // Rotate a freed lease to another waiting document before repeating the
      // same page's backlog. Same-document order and the manual barrier remain.
      if(releasedDocument&&executions[index].documentKey===releasedDocument){
        const other=executions.findIndex((job,index)=>eligible(job,index)&&!job.exclusive&&job.documentKey!==releasedDocument);
        if(other>=0)index=other;
      }
      const job=executions[index];
      // A waiting manual Run is a FIFO barrier, including later resources.
      if(job.exclusive&&runningDocuments.size)return;
      executions.splice(index,1);runningDocuments.set(job.documentKey,job);
      releasedDocument=undefined;
      Promise.resolve().then(job.work).then(job.resolve,job.reject).finally(async()=>{
        try{
          do{
            await Promise.allSettled([...job.dependents]);
            await admission.waitInstalledDocument(job.target);
          }while(job.dependents.size);
        }finally{runningDocuments.delete(job.documentKey);drainExecutions(job.documentKey);}
      }).catch(()=>{});
      if(job.exclusive)return;
    }
  }
  function scheduleDocument(sender,work,{exclusive=false}={}){
    invariant(executions.length<256,'E_QUOTA','页面启动等待队列已满');
    return new Promise((resolve,reject)=>{
      executions.push({documentKey:documentKey(sender),target:{tabId:sender?.tab?.id,documentId:sender?.documentId},
        work,resolve,reject,exclusive,dependents:new Set()});drainExecutions();
    });
  }
  let preparing=0;
  const preparationWaiters=[];
  // Pure successful compiler facts only; no code, asset bytes or authority.
  const registrationFacts=new Map();
  // Only immutable reads/validation use this pool. World/Authority admission,
  // native execution uses bounded exact-document leases in the original slot.
  const prepare=work=>new Promise((resolve,reject)=>{
    const start=()=>{
      preparing++;
      Promise.resolve().then(work).then(resolve,reject).finally(()=>{
        preparing--;preparationWaiters.shift()?.();
      });
    };
    if(preparing<4)start();else preparationWaiters.push(start);
  });
  const removals=[];
  const permissionEpoch=row=>removals.filter(removed=>pageInstallAffectedByRemoval(row.pageRules,removed)).length;
  const active=row=>row?.tag===PAGE_INSTALL_TAG&&row.enabled&&assertPageInstallAuthorization(row).status==='active';
  const cleanupKey=row=>key('cleanup',namespace,row.programId,row.authorization.installationId,row.authorization.generation);
  const recordKey=row=>row.tag===PAGE_CLEANUP_TAG?cleanupKey(row):key(INSTALL_KEY_KIND,namespace,row.programId);
  const cleanupOnly=row=>[PAGE_UNINSTALL_TAG,PAGE_CLEANUP_TAG].includes(row?.tag);
  const ordered=work=>{const next=mutations.then(work,work);mutations=next.catch(()=>{});return next;};
  const read=work=>storage.transaction([PAGE_STORE],'readonly',work);
  async function scoped(sender,mode,work){
    const host=await assertHost(sender);
    invariant(host.namespace===namespace,'E_OWNER','安装属于其他扩展');
    return storage.transaction([PAGE_STORE,'commandJournal'],mode,async tx=>{
      const current=await tx.get('commandJournal','host:'+host.registrationId);
      invariant(current?.active&&!current.revoked&&['hostDocumentId','hostInstanceId','browserSessionIncarnation','hostUrl']
        .every(k=>current[k]===host[k]),'E_OWNER','安装操作的工具宿主已失效');
      return work(tx,host);
    });
  }
  async function nativeAPI(){
    await readNativeUserScripts(api);return api.userScripts;
  }
  async function requireSiteGrant(row){
    if(await api.permissions.contains({origins:pageHostPermissionOrigins(row.pageRules.matches)})!==true)
      throw Object.assign(new FoundationError(PAGE_PERMISSION_ERROR,ACCESS_CHANGED),{pageAccessLost:true});
  }
  async function material(programId,revision){
    const material=await dependencies.readStoredPageCandidate(namespace,programId,revision);
    assertBuiltinIdentity(material.candidate.builtinIdentity,builtinIdentity(await loadBuiltin({runtime:api.runtime})));
    return material;
  }
  async function revalidateCompilation(candidate){
    if(!candidate.manifest.compilation)return;
    const current=await material(candidate.manifest.programId,candidate.manifest.revision);
    invariant(current.candidate.manifestHash===candidate.manifestHash,'E_REVISION','固定 import 候选身份已改变');
  }
  async function proofFor(candidate,{available=false}={}){
    const proof=await read(tx=>tx.get(PAGE_STORE,key('verification',namespace,candidate.manifest.programId,candidate.manifest.revision)));
    invariant(proof?.tag==='page-verification-v1'&&['Verified','Available'].includes(proof.status)&&
      identityFields.every(k=>equal(proof[k],identity(candidate)[k]))&&
      ((proof.receipt?.state==='preview-evaluated'&&typeof proof.receipt.documentId==='string')||
        (proof.receipt?.state==='package-validated'&&proof.receipt.manifestHash===candidate.manifestHash&&
          /^[a-f0-9]{64}$/.test(proof.receipt.packageHash)))&&proof.receipt.world==='USER_SCRIPT'&&
      proof.receipt.sourceHash===candidate.manifest.sourceHash&&
      proof.receiptHash===await digest(proof.receipt),'E_PAGE_VERIFICATION','缺少此 Page 程序的固定版本校验回执');
    await verifiedEnvironment(candidate,proof.receipt);
    invariant(!available||proof.status==='Available','E_NOT_AVAILABLE','请先将验证版本设为本机可安装');
    return proof;
  }
  async function registration(candidate,resolution,proof){
    const jqueryCode=pageWantsJquery(candidate.sourceUtf8)
      ? (await loadPackagedJquery({runtime:api.runtime})).code : undefined;
    const selected=pageSelectedPackagedLibraries(candidate.sourceUtf8);
    const ids=selected.map(pageOptionalLibraryId).filter(Boolean);
    const frameworkId=selected.find(id=>id==='react'||id==='vue');
    const frameworkSource=frameworkId?await loadPackagedPageFramework(frameworkId,{runtime:api.runtime}):undefined;
    const optionalSources=ids.length?await loadPackagedOptionalPageLibraries(ids,{runtime:api.runtime}):[];
    for(let i=0;proof&&i<optionalSources.length;i++){
      const asset=optionalSources[i],record=proof.receipt.packagedOptionals?.[i];
      invariant(record?record.id===asset.id&&record.sha256===asset.sha256:
        optionalSources.length===1&&proof.receipt.packagedOptionalId===asset.id&&
          proof.receipt.packagedOptionalSha256===asset.sha256,'E_PAGE_ENVIRONMENT');
    }
    // material() has freshly checked source/manifest and locked dependency
    // bytes. The loaders above freshly check each packaged asset, and proofFor
    // is never cached. Reuse only the unchanged compiler's successful rules.
    const factKey=proof?canonical({namespace:candidate.namespace,candidateId:candidate.candidateId,
      manifestHash:candidate.manifestHash,builtinIdentity:candidate.builtinIdentity,receiptHash:proof.receiptHash,
      resolution:{world:resolution.world,lockId:resolution.lockId,manifestDigest:resolution.manifestDigest,
        entries:resolution.entries.map(({order,url,world,sha256,byteLength})=>
          ({order,url,world,sha256,byteLength:byteLength??null}))},
      jquery:jqueryCode===undefined?null:JQUERY_371.sha256,
      framework:frameworkSource?{id:frameworkSource.id,version:frameworkSource.version,
        sha256:frameworkSource.sha256,bytes:PAGE_FRAMEWORK_RUNTIMES[frameworkId].bytes}:null,
      optional:optionalSources.map(({id,version,abi,catalogSha256,sha256,bytes})=>
        ({id,version,abi,catalogSha256,sha256,bytes}))}):null;
    const cached=factKey&&registrationFacts.get(factKey);
    if(cached)return {compiled:structuredClone(cached),optionalSources,frameworkSource,jqueryCode,cacheHit:1};
    const compiled=await preparePageProgramRegistration({candidate,sourceUtf8:candidate.sourceUtf8,
      dependencyResolution:resolution,jqueryCode,frameworkSource,optionalSources,authority:{assertAvailable:async()=>({...identity(candidate),status:'Available',...proof,installationEnabled:true})}});
    invariant(compiled.allFrames===false,'E_PAGE_FRAME_SCOPE','本轮正式安装只支持顶层文档；请添加 @noframes');
    invariant(['document_end','document_idle'].includes(compiled.runAt),'E_PAGE_RUN_AT',
      '正式安装仅支持 @run-at document-end 或 document-idle；document-start 尚未开放');
    if(factKey){
      registrationFacts.set(factKey,structuredClone({matches:compiled.matches,excludeMatches:compiled.excludeMatches,
        runAt:compiled.runAt,allFrames:compiled.allFrames,world:compiled.world}));
      if(registrationFacts.size>8)registrationFacts.delete(registrationFacts.keys().next().value);
    }
    return {compiled,optionalSources,frameworkSource,jqueryCode,cacheHit:0};
  }
  async function assertAppParent(row,{requireEnabled=row.enabled!==false}={}){
    if(!row.appOwner){invariant(!row.programId?.startsWith('app.'),'E_APP_PAGE_OWNER','Reserved companion identity');return;}
    const tool=await readAppPageParent(api,row.appOwner,{requireEnabled});
    invariant(tool.pageModule.programId===row.programId&&tool.pageModule.sourceHash===row.sourceHash&&
      tool.pageModule.revision===row.revision&&equal(tool.pageModule.pageRules,row.pageRules),'E_APP_PAGE_OWNER','Companion source changed');
  }
  async function descriptor(row,{legacy=false}={}){
    await assertAppParent(row);
    const {candidate,resolution}=await material(row.programId,row.revision),proof=await proofFor(candidate,{available:true});
    assertBuiltinIdentity(row.builtinIdentity,candidate.builtinIdentity);
    invariant(row.tag===PAGE_INSTALL_TAG&&row.namespace===namespace&&row.manifestHash===candidate.manifestHash&&
      row.sourceHash===candidate.manifest.sourceHash&&equal(row.pageRules,candidate.manifest.pageRules)&&/^[a-f0-9]{32}$/.test(row.token),
      'E_PAGE_INSTALLATION','安装记录不属于此固定版本');
    if(!legacy)assertPageInstallAuthorization(row);
    const {compiled,cacheHit}=await registration(candidate,resolution,proof);
    return {candidate,resolution,proofReceiptHash:proof.receiptHash,registrationCacheHit:cacheHit,
      marker:'__opendesk_page_boot_'+row.token,script:await nativeDescriptor(row,compiled)};
  }
  async function nativeDescriptor(row,rules){
    const nativeId=PREFIX+(await digest([namespace,row.programId])).slice(0,48);
    invariant(row.nativeId===nativeId,'E_PAGE_INSTALLATION','安装的原生注册身份已改变');
    const marker='__opendesk_page_boot_'+row.token;
    const message={protocol:PAGE_BOOT_PROTOCOL,nativeId,token:row.token};
    return {id:nativeId,matches:rules.matches,excludeMatches:rules.excludeMatches,
      runAt:rules.runAt,allFrames:false,world:'USER_SCRIPT',worldId:PAGE_BOOT_WORLD,
      js:[{code:'const '+marker+' = '+JSON.stringify(row.token)+';\n'+
        'chrome.runtime.sendMessage('+JSON.stringify(message)+').then(result=>{if(result?.ok!==true)console.error("[OpenDesk Page bootstrap]",result?.error?.code||"E_PAGE_BOOT_RESPONSE");}).catch(error=>console.error("[OpenDesk Page bootstrap]",error));'}]};
  }
  async function importPageInstallPackage(request,sender,appOwner=null){
    fields(request,['package','expectedInstalledManifestHash','expectedGeneration']);
    request=structuredClone(request);
    await scoped(sender,'readonly',()=>{});
    const pkg=await validatePageInstallPackage(request.package);
    invariant(!pkg.programId.startsWith('app.')||appOwner&&pkg.programId==='app.'+appOwner.toolId,'E_APP_PAGE_OWNER','Companions require parent installation');
    const stored=await scoped(sender,'readonly',tx=>tx.get(PAGE_STORE,key(INSTALL_KEY_KIND,namespace,pkg.programId)));
    const previous=stored?.tag===PAGE_UNINSTALL_TAG?null:stored;
    invariant((previous?.manifestHash??null)===request.expectedInstalledManifestHash&&
      (previous?previous.authorization?.generation===request.expectedGeneration:request.expectedGeneration===null),
      PAGE_REVISION_ERROR,'安装授权在确认期间改变；请刷新后核对');
    const saved=await dependencies.importPageCandidate({programId:pkg.programId,revision:pkg.revision,
      sourceUtf8:pkg.sourceUtf8,entryFormat:pkg.entryFormat,importSourceUrl:null,lockId:null,pageRules:pkg.pageRules},sender);
    const {candidate,resolution}=await material(pkg.programId,pkg.revision);
    invariant(saved.manifestHash===candidate.manifestHash,
      PAGE_REVISION_ERROR,'固定安装身份已改变');
    const proofKey=key('verification',namespace,pkg.programId,pkg.revision);
    const existing=await read(tx=>tx.get(PAGE_STORE,proofKey));
    if(!existing){
      const builtin=await loadBuiltin({runtime:api.runtime});
      assertBuiltinIdentity(candidate.builtinIdentity,builtinIdentity(builtin));
      const {optionalSources,frameworkSource,jqueryCode}=await registration(candidate,resolution);
      const receipt={state:'package-validated',world:'USER_SCRIPT',sourceHash:pkg.sourceHash,
        manifestHash:candidate.manifestHash,packageHash:pkg.packageHash,
        builtinAbi:builtin.abi,builtinCatalogSha256:builtin.catalogSha256,builtinBundleSha256:builtin.sha256,
        ...(jqueryCode?{packagedJquerySha256:JQUERY_371.sha256}:{}),
        ...(frameworkSource?{packagedFrameworkId:frameworkSource.id,packagedFrameworkSha256:frameworkSource.sha256}:{}),
        ...(optionalSources.length?{packagedOptionals:optionalSources.map(({id,sha256})=>({id,sha256}))}:{})};
      await verifiedEnvironment(candidate,receipt);
      const proof={tag:'page-verification-v1',...identity(candidate),status:'Verified',
        receipt,receiptHash:await digest(receipt),verifiedAt:clock.now()};
      await scoped(sender,PAGE_WRITE,async tx=>{
        const old=await tx.get(PAGE_STORE,proofKey);
        if(old)invariant(identityFields.every(k=>equal(old[k],proof[k])),PAGE_REVISION_ERROR,'验证身份已改变');
        else await tx.put(PAGE_STORE,proof,proofKey);
      });
    }
    const proof=await proofFor(candidate);
    if(proof.status!=='Available')await makePageAvailable({programId:pkg.programId,revision:pkg.revision,manifestHash:candidate.manifestHash},sender);
    return installPageProgram({programId:pkg.programId,revision:pkg.revision,manifestHash:candidate.manifestHash,
      expectedInstalledManifestHash:request.expectedInstalledManifestHash,expectedGeneration:request.expectedGeneration,title:pkg.title},sender,appOwner);
  }
  async function verifyPageCandidate(request,sender){
    fields(request,['programId','revision','target']);
    await scoped(sender,'readonly',()=>{});
    const {candidate}=await material(request.programId,request.revision);
    const m=candidate.manifest;
    const existing=await read(tx=>tx.get(PAGE_STORE,key('verification',namespace,m.programId,m.revision)));
    if(existing){const proof=await proofFor(candidate);return {stage:proof.status,manifestHash:candidate.manifestHash,receipt:proof.receipt};}
    // The exact frozen source is executed again by an explicit user action.
    // A preview before generated @match metadata cannot verify this new hash.
    const dependencyEpoch=removals.length;
    const authorize=async()=>{
      await revalidateCompilation(candidate);
      invariant(!m.compilation||removals.length===dependencyEpoch,'E_DEPENDENCY_PERMISSION','依赖权限在验证期间已变化');
    };
    await authorize();
    const receipt=await preview.preview({sourceUtf8:candidate.sourceUtf8,entryFormat:m.entryFormat,
      importSourceUrl:m.sourceProfile.importSourceUrl,lockId:m.dependencyLockId,target:request.target},sender,authorize,{managedVerification:true});
    invariant(receipt.state==='preview-evaluated'&&receipt.sourceHash===m.sourceHash&&receipt.world==='USER_SCRIPT',
      'E_PAGE_VERIFICATION','Page 类型验证身份不一致');
    await verifiedEnvironment(candidate,receipt);
    await revalidateCompilation(candidate);
    invariant(!m.compilation||removals.length===dependencyEpoch,'E_DEPENDENCY_PERMISSION','依赖权限在验证期间已变化');
    const proof={tag:'page-verification-v1',...identity(candidate),status:'Verified',
      receipt,receiptHash:await digest(receipt),verifiedAt:clock.now()};
    return scoped(sender,PAGE_WRITE,async tx=>{
      const proofKey=key('verification',namespace,m.programId,m.revision),old=await tx.get(PAGE_STORE,proofKey);
      if(old){invariant(identityFields.every(k=>equal(old[k],proof[k])),PAGE_REVISION_ERROR,'验证身份已改变');return {stage:old.status,manifestHash:candidate.manifestHash};}
      await tx.put(PAGE_STORE,proof,proofKey);
      return {stage:'Verified',manifestHash:candidate.manifestHash,receipt};
    });
  }
  async function makePageAvailable(request,sender){
    fields(request,['programId','revision','manifestHash']);
    const {candidate}=await material(request.programId,request.revision),proof=await proofFor(candidate);
    invariant(candidate.manifestHash===request.manifestHash,PAGE_REVISION_ERROR,'冻结版本已改变');
    return scoped(sender,PAGE_WRITE,async tx=>{
      const proofKey=key('verification',namespace,request.programId,request.revision),current=await tx.get(PAGE_STORE,proofKey);
      invariant(current?.receiptHash===proof.receiptHash,PAGE_REVISION_ERROR,'验证版本已改变');
      await tx.put(PAGE_STORE,{...current,status:'Available'},proofKey);
      return {stage:'Available',manifestHash:candidate.manifestHash};
    });
  }
  async function installPageProgram(request,sender,appOwner=null){
    invariant(!request?.programId?.startsWith('app.')||appOwner&&request.programId==='app.'+appOwner.toolId,'E_APP_PAGE_OWNER','Companions require parent installation');
    request=structuredClone(request);
    fields(request,['programId','revision','manifestHash','expectedInstalledManifestHash','expectedGeneration','title'],
      ['programId','revision','manifestHash','expectedInstalledManifestHash']);
    invariant(request.title===undefined||(typeof request.title==='string'&&request.title.trim().length>0&&request.title.length<=100),
      'E_SCHEMA','工具名称需要 1–100 个字符');
    return ordered(async()=>{
      const {candidate}=await material(request.programId,request.revision);await proofFor(candidate,{available:true});
      invariant(candidate.manifestHash===request.manifestHash,PAGE_REVISION_ERROR,'安装必须引用固定版本');
      const installKey=key(INSTALL_KEY_KIND,namespace,request.programId);
      const stored=await read(tx=>tx.get(PAGE_STORE,installKey));
      // A revoked installation is cleanup evidence, not an active grant or an
      // installation lock. Preserve its exact identity atomically below.
      if(stored?.tag===PAGE_UNINSTALL_TAG){
        assertPageInstallAuthorization(stored);
        invariant(stored.enabled===false&&stored.nativeState==='disabled'&&stored.authorization.status==='disabled',
          'E_PAGE_UNINSTALL_PENDING','旧安装的原生撤销尚未确认');
      }
      const previous=stored?.tag===PAGE_UNINSTALL_TAG?null:stored;
      invariant((previous?.manifestHash??null)===request.expectedInstalledManifestHash&&
        (previous?request.expectedGeneration===(previous.authorization?.generation??null):(request.expectedGeneration??null)===null),
        PAGE_REVISION_ERROR,'安装授权在确认期间改变；请刷新后核对');
      if(previous?.authorization)assertPageInstallAuthorization(previous);
      if(previous?.manifestHash===candidate.manifestHash){
        // Reimport does not create a second grant, but an old registered flag
        // cannot attest that Chrome still has the approved source and scope.
        if(previous.enabled){
          invariant(active(previous)&&previous.nativeState==='registered'&&!previous.error,
            'E_PAGE_INSTALL_PENDING','原安装尚未就绪；请通过原安装入口恢复访问');
          await requireSiteGrant(previous);
          const expected=await descriptor(previous);
          const registered=await readNativeUserScripts(api,{ids:[previous.nativeId]});
          invariant(registered.length===1&&nativeEqual(registered[0],expected.script),
            'E_PAGE_INSTALLATION','原生注册身份、来源或网站范围不一致；请恢复原安装');
        }
        await scoped(sender,'readonly',async tx=>{
          const current=await tx.get(PAGE_STORE,key(INSTALL_KEY_KIND,namespace,request.programId));
          invariant(current?.token===previous.token&&current.authorization?.generation===request.expectedGeneration,
            PAGE_REVISION_ERROR,'安装授权在确认期间改变');
        });
        // Re-import never revives a disabled or suspended installation.
        return publicInstall(previous);
      }
      const delegatedTasks=readPageTaskDelegations(candidate.sourceUtf8);
      const scope=pageInstallScope(candidate.manifest.pageRules,candidate.manifest.programId,candidate.manifest.revision,delegatedTasks),delta=pageInstallScopeDelta(previous?.authorization?.scope,scope);
      const parentEnabled=appOwner?(await readAppPageParent(api,appOwner,{requireEnabled:false,withState:true})).enabled:true;
      const row={tag:PAGE_INSTALL_TAG,namespace,...(appOwner?{appOwner:structuredClone(appOwner)}:{}),programId:request.programId,revision:request.revision,
        ...(delegatedTasks.length?{delegatedTasks}:{}),
        title:request.title?.trim()??previous?.title??request.programId,
        manifestHash:candidate.manifestHash,sourceHash:candidate.manifest.sourceHash,builtinIdentity:candidate.builtinIdentity,pageRules:candidate.manifest.pageRules,enabled:parentEnabled&&(previous?.enabled??true),
        token:crypto.randomUUID().replaceAll('-',''),nativeId:PREFIX+(await digest([namespace,request.programId])).slice(0,48),
        nativeState:'pending',error:null,installedAt:previous?.installedAt??clock.now(),
        authorization:{tag:'page-install-authorization-v1',installationId:previous?.authorization?.installationId??crypto.randomUUID(),
          generation:(previous?.authorization?.generation??0)+1,
          status:!parentEnabled||previous?.enabled===false?'disabled':'active',scope,
          approvedAt:delta.requiresConfirmation?clock.now():previous.authorization.approvedAt}};
      const epoch=permissionEpoch(row);
      const desired=await descriptor(row);
      invariant(await api.permissions.contains({origins:pageHostPermissionOrigins(desired.script.matches)}),PAGE_PERMISSION_ERROR,'安装的网站范围尚未获得授权');
      // Chrome's User Scripts opt-in is a prerequisite, never a second
      // OpenDesk approval after "install success". Do not persist a new
      // active row until its native API is accessible. Disabled updates keep
      // their intentional disabled lifecycle and make no runtime promise.
      if(row.enabled)await nativeAPI();
      await scoped(sender,PAGE_WRITE,async tx=>{
        const installKey=key(INSTALL_KEY_KIND,namespace,row.programId),old=await tx.get(PAGE_STORE,installKey);
        invariant(old?.tag===stored?.tag&&old?.token===stored?.token&&
          old?.manifestHash===stored?.manifestHash&&old?.enabled===stored?.enabled&&old?.nativeState===stored?.nativeState&&
          old?.authorization?.status===stored?.authorization?.status&&
          old?.authorization?.installationId===stored?.authorization?.installationId&&
          old?.authorization?.generation===stored?.authorization?.generation&&
          (previous?.manifestHash??null)===request.expectedInstalledManifestHash,
          PAGE_REVISION_ERROR,'已安装版本在确认期间改变');
        invariant(permissionEpoch(row)===epoch,PAGE_PERMISSION_ERROR,ACCESS_CHANGED);
        if(stored?.tag===PAGE_UNINSTALL_TAG){
          const archiveKey=cleanupKey(stored),archive=await tx.get(PAGE_STORE,archiveKey);
          invariant(!archive||equal(archive,{...stored,tag:PAGE_CLEANUP_TAG}),
            PAGE_REVISION_ERROR,'旧安装的清理身份已改变');
          await tx.put(PAGE_STORE,{...stored,tag:PAGE_CLEANUP_TAG},archiveKey);
        }
        await tx.put(PAGE_STORE,row,installKey);
      });
      await reconcileOne(row);
      const confirmed=await read(tx=>tx.get(PAGE_STORE,key(INSTALL_KEY_KIND,namespace,row.programId)));
      if(previous&&(confirmed?.error||!['registered','disabled'].includes(confirmed?.nativeState))){
        // Retain the previous immutable version and config on upgrade failure.
        // Rotate the failed generation before restoring only its old bootstrap;
        // no program source or unknown execution is replayed. A failed native
        // rollback remains explicitly blocked under the original installation.
        const failure=confirmed?.error??{code:PAGE_UNKNOWN_ERROR,message:'新安装的原生注册未确认'};
        const rollback={...previous,token:crypto.randomUUID().replaceAll('-',''),nativeState:'pending',error:null,
          authorization:{...previous.authorization,generation:(confirmed?.authorization?.generation??row.authorization.generation)+1}};
        // Internal compensation is independent of the review Host lifetime.
        // Only the unchanged failed grant may be restored, never a revoked one.
        const restored=await storage.transaction([PAGE_STORE],PAGE_WRITE,async tx=>{
          const installKey=key(INSTALL_KEY_KIND,namespace,row.programId),current=await tx.get(PAGE_STORE,installKey);
          if(current?.token!==row.token||current.manifestHash!==row.manifestHash||
            current.authorization?.installationId!==row.authorization.installationId||
            current.authorization?.generation!==row.authorization.generation||
            current.authorization?.status!==row.authorization.status||permissionEpoch(row)!==epoch)return false;
          await tx.put(PAGE_STORE,rollback,installKey);return true;
        });
        if(restored)await reconcileOne(rollback);
        throw new FoundationError(failure.code,failure.message);
      }
      return publicInstall(confirmed);
    });
  }
  async function setInstalledPageEnabled(request,sender){
    invariant(!request?.programId?.startsWith('app.'),'E_APP_PAGE_OWNER','Manage companion through parent');
    request=structuredClone(request);
    fields(request,['programId','manifestHash','installationId','enabled','expectedGeneration']);
    invariant(typeof request.enabled==='boolean','E_SCHEMA','启用状态必须是布尔值');
    return ordered(async()=>{
      let row;
      const previous=await read(tx=>tx.get(PAGE_STORE,key(INSTALL_KEY_KIND,namespace,request.programId)));
      invariant(previous?.tag===PAGE_INSTALL_TAG&&previous.manifestHash===request.manifestHash&&
        previous.authorization?.installationId===request.installationId&&
        (previous.authorization?.generation??null)===request.expectedGeneration,PAGE_REVISION_ERROR,'安装授权已改变');
      // Restoring or enabling is explicit. Checking permissions cannot itself
      // restore a suspended installation or execute an old document.
      const epoch=permissionEpoch(previous);
      if(request.enabled){
        await descriptor(previous);
        invariant(await api.permissions.contains({origins:pageHostPermissionOrigins(previous.pageRules.matches)}),PAGE_PERMISSION_ERROR,ACCESS_CHANGED);
      }
      await scoped(sender,PAGE_WRITE,async tx=>{
        const installKey=key(INSTALL_KEY_KIND,namespace,request.programId),old=await tx.get(PAGE_STORE,installKey);
        invariant(old?.tag===PAGE_INSTALL_TAG&&old.manifestHash===request.manifestHash&&old.token===previous.token&&
          old.authorization?.installationId===request.installationId&&
          old.authorization?.generation===request.expectedGeneration,
          PAGE_REVISION_ERROR,'安装身份已改变');
        if(request.enabled)invariant(permissionEpoch(old)===epoch,PAGE_PERMISSION_ERROR,ACCESS_CHANGED);
        const authorization=assertPageInstallAuthorization(old);
        row={...old,enabled:request.enabled,token:crypto.randomUUID().replaceAll('-',''),nativeState:'pending',error:null,
          authorization:{...authorization,generation:authorization.generation+1,status:request.enabled?'active':'disabled'}};
        await tx.put(PAGE_STORE,row,installKey);
      });
      await reconcileOne(row);
      return publicInstall(await read(tx=>tx.get(PAGE_STORE,key(INSTALL_KEY_KIND,namespace,row.programId))));
    });
  }
  // Explicit native uninstall uses the same owner, revision CAS and serialized
  // registration fence as disable. Persist the disabled generation *before*
  // unregister so even a delayed old bootstrap cannot dispatch user source.
  // A failed native unregister leaves a disabled recoverable record, never an
  // apparent successful uninstall. This does not undo effects in live pages.
  async function uninstallPageProgram(request,sender){
    invariant(!request?.programId?.startsWith('app.'),'E_APP_PAGE_OWNER','Manage companion through parent');
    request=structuredClone(request);
    fields(request,['programId','manifestHash','installationId','expectedGeneration']);
    return ordered(async()=>{
      const installKey=key(INSTALL_KEY_KIND,namespace,request.programId);
      const previous=await read(tx=>tx.get(PAGE_STORE,installKey));
      invariant(previous?.tag===PAGE_INSTALL_TAG&&previous.manifestHash===request.manifestHash&&
        previous.authorization?.installationId===request.installationId&&
        (previous.authorization?.generation??null)===request.expectedGeneration,
        PAGE_REVISION_ERROR,'卸载必须针对当前真实安装版本、安装身份和授权代数');
      const authorization=assertPageInstallAuthorization(previous);
      const row={...previous,enabled:false,token:crypto.randomUUID().replaceAll('-',''),
        nativeState:'pending',error:null,authorization:{...authorization,
          generation:authorization.generation+1,status:'disabled'}};
      await scoped(sender,PAGE_WRITE,async tx=>{
        const current=await tx.get(PAGE_STORE,installKey);
        invariant(current?.tag===PAGE_INSTALL_TAG&&current.token===previous.token&&
          current.manifestHash===previous.manifestHash&&
          current.authorization?.installationId===request.installationId&&
          current.authorization?.generation===request.expectedGeneration,
          PAGE_REVISION_ERROR,'卸载期间安装身份已改变');
        await tx.put(PAGE_STORE,row,installKey);
      });
      await reconcileOne(row);
      const after=await read(tx=>tx.get(PAGE_STORE,installKey));
      invariant(after?.token===row.token&&
        after.authorization?.installationId===request.installationId&&
        after.authorization?.generation===row.authorization.generation,
        PAGE_REVISION_ERROR,'原生撤销后的安装身份已改变');
      invariant(after.nativeState==='disabled','E_PAGE_UNINSTALL_PENDING',
        '自动运行已停用，但原生注销尚未确认；修复 Chrome 用户脚本访问后重试卸载');
      const native=await nativeAPI();
      invariant((await native.getScripts({ids:[row.nativeId]})).length===0,
        'E_PAGE_UNINSTALL_PENDING','原生注册仍存在，不能标记已卸载');
      // Revoked installation and old document cleanup have separate outcomes.
      // Keep uncertain effects under the same Authority as a tombstone. A new
      // grant archives it atomically, retaining the old document execution fence.
      const cleanupPending=Boolean(after.managedCleanup&&after.managedCleanup.state!=='retired');
      await scoped(sender,PAGE_WRITE,async tx=>{
        const current=await tx.get(PAGE_STORE,installKey);
        invariant(current?.token===row.token&&current.nativeState==='disabled'&&
          current.authorization?.installationId===request.installationId&&
          current.authorization?.generation===row.authorization.generation,
          PAGE_REVISION_ERROR,'最终卸载时安装身份已改变');
        if(cleanupPending)await tx.put(PAGE_STORE,{...current,tag:PAGE_UNINSTALL_TAG,uninstalledAt:clock.now()},installKey);
        else await tx.delete(PAGE_STORE,installKey);
      });
      const removed=await read(tx=>tx.get(PAGE_STORE,installKey));
      invariant(cleanupPending?removed?.tag===PAGE_UNINSTALL_TAG&&removed.token===row.token:!removed,
        'E_PAGE_UNINSTALL_PENDING','安装记录删除后读回未确认，请重新核对');
      return {programId:row.programId,manifestHash:row.manifestHash,
        installationId:request.installationId,
        uninstalled:true,nativeState:'unregistered',livePagesNeedRefresh:true,
        ...(cleanupPending?{cleanupPending:true}:{}),
        ...(after.managedCleanup?{managedCleanup:after.managedCleanup}:{})};
    });
  }
  function nativeEqual(actual,expected){return actual&&['id','matches','excludeMatches','runAt','allFrames','world','worldId','js']
    .every(k=>{
      const value=actual[k]??(k==='excludeMatches'?[]:null);
      // Chrome may reorder match ranges on readback; every other field stays exact.
      return k==='matches'||k==='excludeMatches'
        ? Array.isArray(value)&&equal([...value].sort(),[...expected[k]].sort())
        : equal(value,expected[k]);
    });}
  async function reconcileOne(row){
    let state='blocked',error=null,managedCleanup;
    try{
      const native=await nativeAPI(),existing=await native.getScripts({ids:[row.nativeId]});
      if(!active(row)){if(existing.length)await native.unregister({ids:[row.nativeId]});
        invariant((await native.getScripts({ids:[row.nativeId]})).length===0,PAGE_UNKNOWN_ERROR,'原生注册撤销尚未确认');
        state=row.enabled?'blocked':'disabled';error=row.enabled?row.error??{code:PAGE_PERMISSION_ERROR,message:ACCESS_CHANGED}:null;}
      else{
        const epoch=permissionEpoch(row);
        const desired=await descriptor(row);
        invariant(await api.permissions.contains({origins:pageHostPermissionOrigins(desired.script.matches)}),PAGE_PERMISSION_ERROR,'原网站权限已撤销');
        await native.configureWorld({worldId:PAGE_BOOT_WORLD,csp:PAGE_WORLD_CSP,messaging:true});
        invariant(permissionEpoch(row)===epoch,PAGE_PERMISSION_ERROR,ACCESS_CHANGED);
        if(!nativeEqual(existing[0],desired.script)){
          if(existing.length)await native.unregister({ids:[row.nativeId]});
          await native.register([desired.script]);
        }
        const actual=await native.getScripts({ids:[row.nativeId]});
        invariant(permissionEpoch(row)===epoch,PAGE_PERMISSION_ERROR,ACCESS_CHANGED);
        invariant(actual.length===1&&nativeEqual(actual[0],desired.script),PAGE_UNKNOWN_ERROR,'原生注册内容尚未确认');state='registered';
      }
    }catch(e){error={code:e.code||PAGE_UNKNOWN_ERROR,message:String(e.message||e)};
      // Revoke a stale native bootstrap where possible. The message admission
      // independently checks the persistent grant and frozen proof each time.
      try{const native=await nativeAPI();await native.unregister({ids:[row.nativeId]});}catch{ /* Keep blocked/unknown visible. */ }
    }
    // Revoking a registration only fences future boots. Retire resources of
    // older grants in their original worlds even when no result was delivered.
    // This fixed internal control cannot restore permission or replay source.
    if(preview.retireInstalled)try{
      managedCleanup=await preview.retireInstalled(row,{includeCurrent:!active(row)||state!=='registered'});
    }catch(cause){managedCleanup={scope:'managed-ui-only',state:'unknown',error:{code:cause.code||PAGE_UNKNOWN_ERROR,
      message:String(cause.message||cause).slice(0,1024)}};}
    await storage.transaction([PAGE_STORE],PAGE_WRITE,async tx=>{
      const installKey=key(INSTALL_KEY_KIND,namespace,row.programId),current=await tx.get(PAGE_STORE,installKey);
      if(current?.token===row.token&&current.enabled===row.enabled){
        const suspend=current.authorization?.status==='active'&&
          [PAGE_PERMISSION_ERROR,'E_USER_SCRIPTS_UNAVAILABLE','E_PAGE_AUTHORIZATION','E_PAGE_ENVIRONMENT'].includes(error?.code);
        await tx.put(PAGE_STORE,{...current,nativeState:state,error,...(managedCleanup?{managedCleanup}:{}),...(suspend?{
          token:crypto.randomUUID().replaceAll('-',''),authorization:{...current.authorization,
            generation:current.authorization.generation+1,status:'suspended'}}:{})},installKey);
      }
    });
  }
  async function migrateLegacy(row){
    if(row.authorization)return row;
    let authorization,error=row.error;
    try{
      // Migrate only a proven existing DOM installation. Metadata, a candidate,
      // or an unverified legacy record cannot create a program authorization.
      await descriptor(row,{legacy:true});
      const granted=await api.permissions.contains({origins:pageHostPermissionOrigins(row.pageRules.matches)});
      const status=!row.enabled?'disabled':granted&&row.nativeState==='registered'&&!row.error?'active':'suspended';
      authorization={tag:'page-install-authorization-v1',installationId:crypto.randomUUID(),generation:1,status,
        scope:pageInstallScope(row.pageRules,row.programId,row.revision,row.delegatedTasks),approvedAt:row.installedAt};
      if(status==='suspended')error={code:PAGE_PERMISSION_ERROR,message:ACCESS_CHANGED};
    }catch(cause){error={code:cause.code||'E_PAGE_AUTHORIZATION',message:'旧安装无法验证，请重新核对并安装固定版本'};}
    const next={...row,authorization,nativeState:authorization?.status==='active'?row.nativeState:'blocked',error,
      ...(authorization?.status==='active'?{}:{token:crypto.randomUUID().replaceAll('-','')})};
    await storage.transaction([PAGE_STORE],PAGE_WRITE,tx=>tx.put(PAGE_STORE,next,key(INSTALL_KEY_KIND,namespace,row.programId)));
    return next;
  }
  function revokePermissions(removed){
    const snapshot=structuredClone(removed);
    removals.push(snapshot); // Synchronous dispatch fence, before any DB await.
    return ordered(async()=>{
      const changed=await storage.transaction([PAGE_STORE],PAGE_WRITE,async tx=>{
        const rows=(await tx.all(PAGE_STORE)).filter(row=>row?.tag===PAGE_INSTALL_TAG&&row.namespace===namespace&&
          row.authorization?.status==='active'&&pageInstallAffectedByRemoval(row.pageRules,snapshot));
        for(const row of rows){
          row.token=crypto.randomUUID().replaceAll('-','');
          row.authorization={...row.authorization,generation:row.authorization.generation+1,status:'suspended'};
          row.nativeState='blocked';row.error={code:PAGE_PERMISSION_ERROR,message:'访问已撤销，请主动恢复访问'};
          await tx.put(PAGE_STORE,row,key(INSTALL_KEY_KIND,namespace,row.programId));
        }return rows;
      });
      for(const row of changed)await reconcileOne(row);
    });
  }
  async function reconcile(){return ordered(async()=>{
    const rows=await read(async tx=>[...await readPageRecords(tx,'installed'),...await readPageRecords(tx,'cleanup')]
      .filter(r=>r.namespace===namespace));
    if(!rows.length)return;
    for(const row of rows){
      if(cleanupOnly(row))await observeInstallationCleanup(row);
      else await reconcileOne(await migrateLegacy(row));
    }
  });}
  async function observeInstallationCleanup(row){
    if(!row||row.managedCleanup?.state!=='unknown'||!preview.retireInstalled)return;
    let managedCleanup;
    try{managedCleanup=await preview.retireInstalled(row,{
      includeCurrent:!active(row)||row.nativeState!=='registered',observeOnly:true});}
    catch{return;} // Failed observation cannot release the original fence.
    await storage.transaction([PAGE_STORE],PAGE_WRITE,async tx=>{
      const installKey=recordKey(row),current=await tx.get(PAGE_STORE,installKey);
      if(current?.tag!==row.tag||current.token!==row.token||
        current.enabled!==row.enabled||current.nativeState!==row.nativeState||
        current.authorization?.status!==row.authorization?.status||
        current.authorization?.installationId!==row.authorization?.installationId||
        current.authorization?.generation!==row.authorization?.generation||current.managedCleanup?.state!=='unknown')return;
      if(managedCleanup.state==='retired'&&cleanupOnly(current)&&current.nativeState==='disabled')
        await tx.delete(PAGE_STORE,installKey);
      else if(!equal(current.managedCleanup,managedCleanup))await tx.put(PAGE_STORE,{...current,managedCleanup},installKey);
    });
  }
  // Navigation/closure is a wake hint, never proof of document death (BFCache
  // may retain it). Recheck pending cleanup through the existing exact-document
  // broker without registering scripts, dispatching cleanup or restoring grants.
  async function observeManagedCleanup(details){return ordered(async()=>{
    if(!preview.retireInstalled)return;
    const pending=await read(async tx=>{
      const installed=[...await readPageRecords(tx,'installed'),...await readPageRecords(tx,'cleanup')].filter(row=>
        row.namespace===namespace&&
        row.managedCleanup?.state==='unknown');
      if(!installed.length)return [];
      const executions=await readPageRecords(tx,'execution');
      return installed.filter(row=>executions.some(execution=>execution?.tag==='page-execution-v1'&&
        execution.namespace===namespace&&execution.programId===row.programId&&
        execution.installationId===row.authorization?.installationId&&execution.tabId===details.tabId&&
        execution.grantGeneration<=row.authorization.generation&&execution.managedUI));
    });
    for(const row of pending)await observeInstallationCleanup(row);
  });}
  async function recoverExecutions(){
    // Called once at worker startup, never on a permission refresh while a
    // live invocation is running. An old pending dispatch must not be replayed.
    await admission.recoverInstalled(async row=>{
      const resourceGone=async nonce=>{
        const execution=await read(tx=>tx.get(PAGE_STORE,row.executionKey));
        if(execution?.namespace!==row.namespace||execution.documentId!==row.documentId||
          execution.tabId!==row.tabId||execution.receiptNonce!==(row.parentNonce||row.nonce))return false;
        const child=execution.managedUI?.lifecycle?.frames?.find(frame=>frame.requestId===nonce);
        if(!child?.documentId)return false;
        const frame=await api.webNavigation.getFrame({documentId:child.documentId});
        return frame===undefined||frame===null;
      };
      if(row.resourceNonce)return resourceGone(row.resourceNonce);
      const frame=await api.webNavigation.getFrame({documentId:row.documentId});
      if(frame!==undefined&&frame!==null)return false;
      for(const child of row.children)if(!await resourceGone(child.nonce))return false;
      return true;
    });
    const pending=await read(async tx=>(await readPageRecords(tx,'execution')).filter(row=>row?.tag==='page-execution-v1'&&
      row.namespace===namespace&&['prepared','dispatched','outcome-unknown'].includes(row.state)));
    for(const row of pending){
      let contextGone=false;
      try{
        // storage.session also resets on extension reload; session mismatch
        // does not prove the page died. Frame enumeration omits BFCache. Ask
        // Chrome about the original document UUID, including cached documents.
        const frame=await api.webNavigation.getFrame({documentId:row.documentId});
        contextGone=frame===undefined||frame===null;
      }catch{ /* An observation error cannot prove that the context is gone. */ }
      const recovered=await storage.transaction([PAGE_STORE],PAGE_WRITE,async tx=>{
        const current=await tx.get(PAGE_STORE,row.executionKey);
        if(!current||!['prepared','dispatched','outcome-unknown'].includes(current.state))return null;
        const completed={...current,state:'outcome-unknown',error:{code:PAGE_UNKNOWN_ERROR,
          message:'执行期间后台中断；原效果未知，不自动重放'},result:null,finishedAt:current.finishedAt??clock.now(),
          contextGone:current.contextGone||contextGone};
        await tx.put(PAGE_STORE,completed,row.executionKey);
        const installKey=key(INSTALL_KEY_KIND,namespace,row.programId),installed=await tx.get(PAGE_STORE,installKey);
        if(installed?.token===row.installationToken&&(!installed.lastExecution||installed.lastExecution.createdAt<=row.createdAt))
          await tx.put(PAGE_STORE,{...installed,lastExecution:completed},installKey);
        return completed;
      });
      // Only a trusted exact-document absence releases the original reservation.
      // A live or cached unknown context fences
      // the shared Controller/Page slot; changing installations cannot free it.
      if(recovered?.receiptNonce&&contextGone)await admission.release({nonce:recovered.receiptNonce,legacyOnly:true});
    }
  }
  // Read-only. New websites receive no authority until an independent
  // user-clicked review installs the returned immutable Page package.
  async function prepareScrollSitePackage(request,sender){
    fields(request,['programId','expectedInstalledManifestHash','expectedGeneration','origin','pathScope']);
    invariant(request.programId===SCROLL_CONFIG_PROGRAM_ID&&
      typeof request.expectedInstalledManifestHash==='string'&&
      Number.isSafeInteger(request.expectedGeneration),
      'E_PAGE_AUTHORIZATION','站点申请须绑定已安装导航的身份与授权代数');
    const row=await scoped(sender,'readonly',tx=>tx.get(PAGE_STORE,
      key(INSTALL_KEY_KIND,namespace,SCROLL_CONFIG_PROGRAM_ID)));
    invariant(row?.manifestHash===request.expectedInstalledManifestHash&&
      row.authorization?.generation===request.expectedGeneration,
      PAGE_REVISION_ERROR,'授权身份变化；请重新进入已安装应用详情');
    assertPageInstallAuthorization(row);
    invariant(active(row)&&row.nativeState==='registered'&&!row.error,
      'E_PAGE_AUTHORIZATION','异常或停用的安装不能申请扩权');
    const epoch=permissionEpoch(row);
    await requireSiteGrant(row);
    const desired=await descriptor(row);
    const registered=await readNativeUserScripts(api,{ids:[row.nativeId]});
    invariant(registered.length===1&&nativeEqual(registered[0],desired.script),
      'E_PAGE_AUTHORIZATION','尚未确认 Chrome 原生注册内容');
    const {candidate}=await material(row.programId,row.revision);
    const revision=await scrollSiteRevision(row.manifestHash,[...row.pageRules.matches,
      ...scrollSiteInstallMatches(request.origin,request.pathScope)]);
    const pkg=await buildScrollSiteUpgradePackage({installed:row,candidate,
      origin:request.origin,pathScope:request.pathScope,revision});
    const rows=await scoped(sender,'readonly',tx=>tx.all(PAGE_STORE));
    const occupied=rows.find(item=>item?.tag==='page-candidate-v1'&&item.namespace===namespace&&
      item.manifest?.programId===row.programId&&item.manifest.revision===revision);
    invariant(!occupied||(occupied.sourceUtf8===pkg.sourceUtf8&&
      canonical(occupied.manifest.pageRules)===canonical(pkg.pageRules)),
      PAGE_REVISION_ERROR,'网站候选修订身份冲突；保留原安装，请重新核对');
    const fresh=await scoped(sender,'readonly',tx=>tx.get(PAGE_STORE,
      key(INSTALL_KEY_KIND,namespace,SCROLL_CONFIG_PROGRAM_ID)));
    invariant(fresh?.token===row.token&&fresh.manifestHash===row.manifestHash&&
      fresh.authorization?.generation===request.expectedGeneration&&
      active(fresh)&&fresh.nativeState==='registered'&&!fresh.error&&
      permissionEpoch(row)===epoch,'E_PAGE_AUTHORIZATION','候选生成期间授权已改变');
    return pkg;
  }
  async function listPagePrograms(request,sender){
    fields(request,[]);
    // Observe Chrome outside the transaction; then read current Host/install
    // authority so a concurrent disable cannot be replaced by an old snapshot.
    let registered=new Map(),nativeError;
    try{registered=new Map((await readNativeUserScripts(api)).map(row=>[row.id,row]));}
    catch(error){nativeError={code:error.code,message:error.message};}
    return scoped(sender,'readonly',async tx=>{
      const rows=await tx.all(PAGE_STORE),installed=await Promise.all(rows.filter(r=>r?.tag===PAGE_INSTALL_TAG&&r.namespace===namespace).map(async stored=>{
        // Descriptive compatibility metadata comes from this installation's
        // immutable candidate, never the current catalog or an import's title.
        // Old installations need no migration, new grant or source execution.
        const candidate=rows.find(r=>r?.tag==='page-candidate-v1'&&r.namespace===namespace&&
          r.manifestHash===stored.manifestHash&&r.manifest?.programId===stored.programId&&
          r.manifest.revision===stored.revision&&r.manifest.sourceHash===stored.sourceHash);
        const fixed=typeof candidate?.sourceUtf8==='string'&&await digestUtf8(candidate.sourceUtf8)===stored.sourceHash;
        const metadata=fixed?parseUserScriptDependencies(candidate.sourceUtf8):null;
        const versions=metadata?.directives.filter(r=>r.name==='version')||[];
        const version=metadata?.headerComplete&&!metadata.diagnostics.some(r=>r.severity==='error')&&
          versions.length===1&&versions[0].value.length<=128?versions[0].value:null;
        const row={...stored,version};
        // Readback only downgrades the public projection, never restores a
        // blocked grant or repairs registrations, source, locks or stored state.
        if(!['registered','disabled'].includes(row.nativeState)||row.authorization?.status==='suspended')return row;
        let error=nativeError;
        if(!error)try{
          const expected=await nativeDescriptor(row,row.pageRules);
          invariant(row.enabled?nativeEqual(registered.get(row.nativeId),expected):!registered.has(expected.id),
            'E_PAGE_INSTALLATION','原生注册内容不一致，请主动核对安装状态');
        }catch(cause){error={code:cause.code,message:cause.message};}
        return error?{...row,nativeState:'blocked',error}:row.enabled?row:{...row,nativeState:'disabled'};
      }));
      const catalog=rows.filter(r=>r?.tag==='page-candidate-v1'&&r.namespace===namespace).map(row=>{
        const proof=rows.find(p=>p?.tag==='page-verification-v1'&&p.namespace===namespace&&p.candidateId===row.candidateId&&p.manifestHash===row.manifestHash);
        return {candidateId:row.candidateId,programId:row.manifest.programId,revision:row.manifest.revision,
          manifestHash:row.manifestHash,sourceHash:row.manifest.sourceHash,pageRules:row.manifest.pageRules,
          delegatedTasks:readPageTaskDelegations(row.sourceUtf8),
          entryFormat:row.manifest.entryFormat,sourceProfile:row.manifest.sourceProfile,
          dependencyLockId:row.manifest.dependencyLockId,
          stage:proof?.status??'Candidate',installed:publicInstall(installed.find(i=>i.programId===row.manifest.programId)),
          authorizationChange:pageInstallScopeDelta(installed.find(i=>i.programId===row.manifest.programId)?.authorization?.scope,
            pageInstallScope(row.manifest.pageRules,row.manifest.programId,row.manifest.revision,readPageTaskDelegations(row.sourceUtf8)))};
      });return {catalog,installed:installed.map(publicInstall),cleanupPending:rows.filter(row=>
        cleanupOnly(row)&&row.namespace===namespace).map(row=>({
          programId:row.programId,title:row.title??row.programId,revision:row.revision,
          managedCleanup:structuredClone(row.managedCleanup)}))};
    });
  }
  function assertBootSender(message,sender){
    fields(message,['protocol','nativeId','token']);
    invariant(message.protocol===PAGE_BOOT_PROTOCOL&&sender?.id===api.runtime.id&&sender.frameId===0&&
      typeof sender.documentId==='string'&&Number.isSafeInteger(sender.tab?.id)&&!sender.tab.incognito,
      'E_OWNER','仅真实顶层 USER_SCRIPT 引导消息可触发安装脚本');
  }
  async function bootInstallation(message){
    const lookup=()=>read(async tx=>(await readPageRecords(tx,'installed')).find(r=>r?.tag===PAGE_INSTALL_TAG&&
      r.namespace===namespace&&r.nativeId===message.nativeId&&r.token===message.token&&r.enabled));
    let row=await lookup();
    // Only an active pending registration may wait for its installation.
    // Disable/revocation must reject immediately, even during slow unregister.
    if(row?.nativeState==='pending'&&active(row)){
      await mutations;
      row=await lookup();
    }
    invariant(row,PAGE_PERMISSION_ERROR,'页面脚本未安装、已停用或引导身份已过期');
    invariant(active(row)&&row.nativeState==='registered'&&!row.error,PAGE_PERMISSION_ERROR,ACCESS_CHANGED);
    return row;
  }
  async function bootDocument(row,sender){
    const [tab,frames]=await Promise.all([api.tabs.get(sender.tab.id),api.webNavigation.getAllFrames({tabId:sender.tab.id})]);
    const frame=frames?.find(f=>f.frameId===0&&f.documentId===sender.documentId);
    invariant(frame&&!frame.errorOccurred&&(!frame.documentLifecycle||frame.documentLifecycle==='active')&&
      tab.url===frame.url&&sender.url===frame.url&&!tab.pendingUrl&&!tab.incognito,'E_DOCUMENT_STALE','自动执行文档已经改变');
    httpUrl(frame.url);
    // A pushState URL can change while the native document bootstrap marker survives.
    invariant(installedURLMatches(row,frame.url),PAGE_PERMISSION_ERROR,
      '当前网页 URL 已离开安装范围或进入排除路径');
    return {tab,frame};
  }
  async function prepareBoot(message,sender,queuedAt){
    const startedAt=performance.now();
    assertBootSender(message,sender);
    const row=await bootInstallation(message),epoch=permissionEpoch(row),dependencyEpoch=removals.length;
    await requireSiteGrant(row);
    // A document already gone must not consume frozen-source preparation.
    await bootDocument(row,sender);
    const desired=await descriptor(row);
    const preparation=await preview.prepareInstalled(desired);
    return {row,epoch,dependencyEpoch,desired,preparation,preflightQueueMs:startedAt-queuedAt,
      preflightMs:performance.now()-startedAt,readyAt:performance.now()};
  }
  async function boot(message,sender,source,manualReceiptId,manualHostDocumentId,prepared){
    const prepareStartedAt=performance.now(),queueWaitMs=prepareStartedAt-prepared.readyAt;
    assertBootSender(message,sender);
    const row=await bootInstallation(message),epoch=permissionEpoch(row),dependencyEpoch=prepared.dependencyEpoch;
    invariant(row.token===prepared.row.token&&row.manifestHash===prepared.row.manifestHash&&
      row.sourceHash===prepared.row.sourceHash&&row.revision===prepared.row.revision&&
      equal(row.pageRules,prepared.row.pageRules)&&equal(row.builtinIdentity,prepared.row.builtinIdentity)&&
      row.authorization.installationId===prepared.row.authorization.installationId&&
      row.authorization.generation===prepared.row.authorization.generation&&epoch===prepared.epoch,
      PAGE_PERMISSION_ERROR,ACCESS_CHANGED);
    await requireSiteGrant(row);
    // Preparation is not authority. Recheck the exact current document before
    // reading fresh material or probing Chrome, then recheck proof/dependencies.
    const {tab,frame}=await bootDocument(row,sender);
    const current=await material(row.programId,row.revision),proof=await proofFor(current.candidate,{available:true});
    invariant(current.candidate.manifestHash===prepared.desired.candidate.manifestHash&&
      proof.receiptHash===prepared.desired.proofReceiptHash,'E_PAGE_VERIFICATION','准备期间固定候选或验证回执已经改变');
    const desired={...prepared.desired,...current},native=await nativeAPI();
    const compilationCurrent=()=>!desired.candidate.manifest.compilation||removals.length===dependencyEpoch;
    const registered=await native.getScripts({ids:[row.nativeId]});
    invariant(registered.length===1&&nativeEqual(registered[0],desired.script),PAGE_PERMISSION_ERROR,'此安装的原生引导已经改变');
    // Automatic messages need Chrome's original matching bootstrap marker.
    // A separately authenticated Host click can target the already open page:
    // registration does not retroactively inject its bootstrap there. Its
    // current document, rules, grant and native descriptor are checked above;
    // it neither creates a marker nor replays the automatic bootstrap.
    if(source!=='manual'){
      const probe=await native.execute({target:{tabId:tab.id,documentIds:[frame.documentId]},world:'USER_SCRIPT',
        ...(['document_end','document_idle'].includes(row.pageRules.runAt)?{injectImmediately:true}:{}),
        worldId:PAGE_BOOT_WORLD,js:[{code:'typeof '+desired.marker+' === "string" ? '+desired.marker+' : null'}]});
      invariant(probe.length===1&&probe[0]?.frameId===0&&probe[0]?.documentId===frame.documentId&&
        probe[0].error===undefined&&probe[0].result===row.token,PAGE_PERMISSION_ERROR,'缺少匹配文档的真实安装引导标记');
    }
    const receiptId=manualReceiptId??crypto.randomUUID();
    const executionKey=source==='manual'?
      key('execution',namespace,row.manifestHash,frame.documentId,receiptId):
      key('execution',namespace,row.manifestHash,frame.documentId);
    const admitted=await storage.transaction([PAGE_STORE],PAGE_WRITE,async tx=>{
      const current=await tx.get(PAGE_STORE,key(INSTALL_KEY_KIND,namespace,row.programId));
      invariant(current&&active(current)&&current.token===row.token&&permissionEpoch(row)===epoch&&compilationCurrent(),PAGE_PERMISSION_ERROR,ACCESS_CHANGED);
      const previous=await tx.get(PAGE_STORE,executionKey);
      if(previous)return false;
      const count=typeof tx.countPrefix==='function'?await tx.countPrefix(PAGE_STORE,'page-execution:'):
        (await readPageRecords(tx,'execution')).filter(r=>r?.tag==='page-execution-v1').length;
      invariant(count<4096,'E_QUOTA','页面执行回执已达上限；保留原始证据后再维护');
      await tx.put(PAGE_STORE,{tag:'page-execution-v1',namespace,receiptId,source,
        ...(source==='manual'?{manualHostDocumentId}:{}),programId:row.programId,
        revision:row.revision,manifestHash:row.manifestHash,sourceHash:row.sourceHash,
        installationToken:row.token,installationId:row.authorization.installationId,grantGeneration:row.authorization.generation,
        executionKey,browserSessionIncarnation:session,
        tabId:tab.id,documentId:frame.documentId,state:'prepared',createdAt:clock.now()},executionKey);return true;
    });
    invariant(admitted,'E_REQUEST_CONFLICT','此固定版本已在本 document 准入；不会自动重放');
    const authorize=async()=>{
      await assertAppParent(row);
      const current=await read(tx=>tx.get(PAGE_STORE,key(INSTALL_KEY_KIND,namespace,row.programId)));
      invariant(current&&active(current)&&current.token===row.token&&current.manifestHash===row.manifestHash&&
        permissionEpoch(row)===epoch&&compilationCurrent(),PAGE_PERMISSION_ERROR,ACCESS_CHANGED);
      await requireSiteGrant(row);
      await proofFor(desired.candidate,{available:true});
      await revalidateCompilation(desired.candidate);
      const latest=await read(tx=>tx.get(PAGE_STORE,key(INSTALL_KEY_KIND,namespace,row.programId)));
      invariant(latest&&active(latest)&&latest.token===row.token&&permissionEpoch(row)===epoch&&compilationCurrent(),
        PAGE_PERMISSION_ERROR,ACCESS_CHANGED);
    };
    const dispatch=(receiptNonce,invoke)=>ordered(async()=>{
      await authorize();
      await storage.transaction([PAGE_STORE,'runs'],PAGE_WRITE,async tx=>{
        if(desired.candidate.manifest.compilation){
          const fixed=await dependencies.readStoredPageCandidate(namespace,row.programId,row.revision,tx);
          invariant(fixed.candidate.manifestHash===row.manifestHash,PAGE_REVISION_ERROR,'派发时固定 import 候选身份已改变');
        }
        const grant=await tx.get(PAGE_STORE,key(INSTALL_KEY_KIND,namespace,row.programId)),execution=await tx.get(PAGE_STORE,executionKey);
        invariant(grant&&active(grant)&&grant.token===row.token&&grant.manifestHash===row.manifestHash&&permissionEpoch(row)===epoch&&compilationCurrent()&&
          execution?.state==='prepared'&&execution.receiptNonce===receiptNonce&&execution.browserSessionIncarnation===session,
          PAGE_PERMISSION_ERROR,ACCESS_CHANGED);
        const slot=await tx.get('runs','@slot');
        assertInstalledPageDispatch(slot,{nonce:receiptNonce,executionKey,session,namespace,
          tabId:tab.id,documentId:frame.documentId});
        await tx.put(PAGE_STORE,{...execution,state:'dispatched',dispatchedAt:clock.now()},executionKey);
      });
      // No asynchronous observation between committing dispatch and invoking
      // Chrome. Disable/replacement use this same queue. Do not hold it until
      // an async main or classic program finishes.
      invariant(permissionEpoch(row)===epoch&&compilationCurrent(),PAGE_PERMISSION_ERROR,ACCESS_CHANGED);
      admission.assertDispatch();
      const completion=Promise.resolve(invoke());completion.catch(()=>{});
      return {completion};
    });
    const prepareMs=performance.now()-prepareStartedAt;
    let result,error;
    try{result=await preview.executeInstalled({...desired,preparation:prepared.preparation,exclusive:source==='manual',runAtReached:source==='page_auto',target:{tabId:tab.id,frameId:0,documentId:frame.documentId,
      expectedUrl:frame.url,expectedWindowId:tab.windowId},installation:{...row,executionKey}},authorize,dispatch);}
    catch(e){error={code:e.code||PAGE_UNKNOWN_ERROR,message:String(e.message||e),...(e.effectConfirmed?{effectConfirmed:true}:{}),
      ...(e.pageAccessLost?{pageAccessLost:true}:{})};}
    if(result)result={...result,startupTimings:{...result.startupTimings,
      preflightQueueMs:prepared.preflightQueueMs,preflightMs:prepared.preflightMs,
      registrationCacheHit:prepared.desired.registrationCacheHit,queueWaitMs,prepareMs}};
    await storage.transaction([PAGE_STORE],PAGE_WRITE,async tx=>{
      const installKey=key(INSTALL_KEY_KIND,namespace,row.programId),current=await tx.get(PAGE_STORE,installKey);
      if(!error&&(!current||!active(current)||current.token!==row.token||permissionEpoch(row)!==epoch||!compilationCurrent()))
        error={code:PAGE_PERMISSION_ERROR,message:'原网页执行已完成，但安装授权已改变；不交付旧授权的成功结果',effectConfirmed:true};
      const execution=await tx.get(PAGE_STORE,executionKey),completed={...execution,
        state:error?(error.code===PAGE_UNKNOWN_ERROR?'outcome-unknown':'failed'):'completed',
        result:error?null:result??null,error:error??null,effectConfirmed:!!result||error?.effectConfirmed===true,finishedAt:clock.now()};
      await tx.put(PAGE_STORE,completed,executionKey);
      if(current?.token===row.token)await tx.put(PAGE_STORE,{...current,lastExecution:completed},installKey);
    });
    if(error)throw Object.assign(new FoundationError(error.code,error.message),error.pageAccessLost?{pageAccessLost:true}:{});
    return {receiptId,state:'completed'};
  }
  async function frameBoot(message,sender){
    const job=runningDocuments.get(documentKey(sender));
    if(!job)return scheduleDocument(sender,()=>executeFrameBoot(message,sender));
    // A child of an earlier main may be needed to complete that main. Keep
    // its document lease even when main itself has already returned.
    invariant(job.dependents.size<16,'E_QUOTA','此文档的子帧等待预算已满');
    const pending=executeFrameBoot(message,sender);job.dependents.add(pending);
    try{return await pending;}finally{job.dependents.delete(pending);}
  }
  async function executeFrameBoot(message,sender){
    const epoch=removals.length;
    const common=['protocol','action','executionKey','receiptNonce','operation','requestId'];
    fields(message,message.operation==='retire'?common:[...common,'resourceId','url','portToken','data']);
    invariant(message.protocol===PAGE_BOOT_PROTOCOL&&message.action===PAGE_FRAME_ACTION&&
      sender?.id===api.runtime.id&&sender.frameId===0&&typeof sender.documentId==='string'&&
      Number.isSafeInteger(sender.tab?.id)&&!sender.tab.incognito&&
      typeof message.executionKey==='string'&&message.executionKey.length<=2048&&
      typeof message.requestId==='string'&&/^[a-f0-9-]{36}$/.test(message.requestId),
      'E_OWNER','子帧只接受原安装父文档的用户脚本消息');
    const execution=await read(tx=>tx.get(PAGE_STORE,message.executionKey));
    invariant(execution?.tag==='page-execution-v1'&&execution.namespace===namespace&&
      execution.executionKey===message.executionKey&&execution.receiptNonce===message.receiptNonce&&
      execution.tabId===sender.tab.id&&execution.documentId===sender.documentId&&
      execution.browserSessionIncarnation===session&&execution.managedUI,'E_FRAME_IDENTITY','子帧父执行已失效');
    const authorize=async()=>{
      const row=await read(tx=>tx.get(PAGE_STORE,key(INSTALL_KEY_KIND,namespace,execution.programId)));
      invariant(row&&active(row)&&row.manifestHash===execution.manifestHash&&row.sourceHash===execution.sourceHash&&
        row.authorization.installationId===execution.installationId&&row.authorization.generation===execution.grantGeneration&&
        ['dispatched','completed'].includes(execution.state),'E_PAGE_AUTHORIZATION','原安装授权已变化');
      await requireSiteGrant(row);
      const desired=await descriptor(row),frames=await api.webNavigation.getAllFrames({tabId:sender.tab.id}),
        frame=frames?.find(f=>f.frameId===0&&f.documentId===sender.documentId),tab=await api.tabs.get(sender.tab.id);
      // MessageSender keeps the injection URL across same-document history.
      // The exact document and current approved URL remain authoritative.
      invariant(frame&&!frame.errorOccurred&&frame.documentLifecycle==='active'&&
        httpUrl(frame.url).origin===httpUrl(sender.url).origin&&
        frame.url===tab.url&&!tab.incognito&&!tab.pendingUrl&&pageProgramUrlMatches(row.pageRules,frame.url),
        'E_DOCUMENT_STALE','原父文档已经改变');
      const native=await nativeAPI(),registered=await native.getScripts({ids:[row.nativeId]});
      invariant(registered.length===1&&nativeEqual(registered[0],desired.script),'E_PAGE_AUTHORIZATION','原安装引导已撤销');
      const latest=await read(tx=>tx.get(PAGE_STORE,key(INSTALL_KEY_KIND,namespace,execution.programId)));
      invariant(latest&&active(latest)&&latest.token===row.token&&latest.authorization.generation===execution.grantGeneration,
        'E_PAGE_AUTHORIZATION','子帧派发前授权已变化');
      invariant(removals.length===epoch,'E_PAGE_AUTHORIZATION','子帧准备期间权限已变化');
      return {...desired,grant:latest};
    };
    let reserved=false,dispatched=false,confirmed=false;
    const dispatch=invoke=>ordered(async()=>{
      const current=await authorize();
      await storage.transaction([PAGE_STORE,'runs'],PAGE_WRITE,async tx=>{
        const grant=await tx.get(PAGE_STORE,key(INSTALL_KEY_KIND,namespace,execution.programId)),
          slot=await tx.get('runs','@slot');
        invariant(grant&&active(grant)&&grant.token===current.grant.token&&
          grant.authorization.generation===execution.grantGeneration&&removals.length===epoch,
          'E_PAGE_AUTHORIZATION','资源最终派发前原安装已改变');
        assertInstalledPageDispatch(slot,{nonce:message.requestId,executionKey:execution.executionKey,
          session,namespace,tabId:execution.tabId,documentId:execution.documentId});
      });
      // Same queue as disable/uninstall. No asynchronous observation between
      // this final epoch check and invoking Chrome; do not hold the queue while
      // an asynchronous resource completes or asks for retirement.
      invariant(removals.length===epoch,'E_PAGE_AUTHORIZATION','权限已撤销');
      admission.assertDispatch();
      dispatched=true;
      const completion=Promise.resolve(invoke());completion.catch(()=>{});
      return {completion};
    });
    // Retirement only observes destruction; it never reauthorizes source.
    try{
      const desired=message.operation==='retire'?{candidate:null}:await ordered(async()=>{
        const current=await authorize();
        await admission.reserveInstalled({nonce:message.requestId,tabId:execution.tabId,
          documentId:execution.documentId,sourceHash:execution.sourceHash},
          {...current.grant,executionKey:execution.executionKey,receiptNonce:message.receiptNonce},{resource:true});
        reserved=true;return current;
      });
      const result=await preview.executeFrame({message,sender,candidate:desired.candidate,execution,
        onUnknown:()=>admission.blockInstalled(message.requestId)},authorize,dispatch);
      confirmed=true;
      if(message.operation==='retire'&&result.state==='retired')await admission.release({nonce:message.requestId});
      return result;
    }catch(error){
      if(dispatched&&!confirmed)admission.blockInstalled(message.requestId);
      throw error;
    }finally{
      if(reserved)await admission.settleInstalled({nonce:message.requestId,dispatched,confirmed});
    }
  }

  const scrollConfigKey=key('config',namespace,SCROLL_CONFIG_PROGRAM_ID);
  const scrollSnapshot=record=>({value:structuredClone(record?.value??SCROLL_CONFIG_EMPTY),etag:record?.etag??'0'});
  const readScrollConfig=async()=>scrollSnapshot(await read(tx=>tx.get(PAGE_STORE,scrollConfigKey)));
  // USER_SCRIPT and the authenticated Side Panel write the SAME persistent CAS
  // record, with the same no-scope-widening and unknown-result semantics.
  async function persistScrollConfig(row,input,etag,epoch,sender){
    invariant(typeof etag==='string'&&etag.length<=128,'E_CONFIG_SCHEMA','缺少配置的版本校验值');
    const normalized=normalizeScrollConfig(input);
    const legacyPageWrite=sender===undefined&&!Object.hasOwn(input,'navigation');
    await requireSiteGrant(row);
    let writeAttempted=false;
    const commit=async tx=>{
      const current=await tx.get(PAGE_STORE,key(INSTALL_KEY_KIND,namespace,SCROLL_CONFIG_PROGRAM_ID));
      invariant(current?.token===row.token&&current.manifestHash===row.manifestHash&&
        current.authorization?.installationId===row.authorization.installationId&&
        current.authorization?.generation===row.authorization.generation&&
        current.nativeState==='registered'&&!current.error&&active(current)&&
        permissionEpoch(row)===epoch,'E_PAGE_AUTHORIZATION','配置提交前安装权限已改变');
      const old=await tx.get(PAGE_STORE,scrollConfigKey);
      // Frozen Page sources only know {version,sites}. Omission must not erase
      // newer settings; explicit navigation keeps its normal replacement rules.
      const value=legacyPageWrite&&Object.hasOwn(old?.value??{},'navigation')?
        normalizeScrollConfig({...normalized,navigation:old.value.navigation}):normalized;
      for(const site of value.sites)invariant(scrollConfigScopeCovered(row.pageRules,site)||
        old?.value.sites.some(previous=>equal(previous,site)||
          !site.enabled&&equal({...previous,enabled:false},site)),
        'E_PAGE_AUTHORIZATION','该网站未获安装或升级审阅授权');
      if(old&&equal(old.value,value))return scrollSnapshot(old);
      invariant((old?.etag??'0')===etag,'E_CONFIG_CONFLICT',
        '网站规则已被其他窗口修改；请重新读取后合并，草稿仍保留');
      const record={tag:'page-config-v1',namespace,programId:SCROLL_CONFIG_PROGRAM_ID,
        etag:crypto.randomUUID(),value,updatedAt:clock.now()};
      writeAttempted=true;
      await tx.put(PAGE_STORE,record,scrollConfigKey);
      return scrollSnapshot(record);
    };
    let saved;
    try{
      saved=await (sender?scoped(sender,PAGE_WRITE,commit):
        storage.transaction([PAGE_STORE],PAGE_WRITE,commit));
    }catch(error){
      if(!writeAttempted&&['E_OWNER','E_PAGE_AUTHORIZATION','E_CONFIG_CONFLICT'].includes(error?.code))throw error;
      throw new FoundationError('E_CONFIG_UNKNOWN','配置写入结果未知；请只读核对，不要自动重试');
    }
    // After a possible commit, authorization/owner failures cannot prove that
    // nothing was written. Keep every confirmation failure behind one fence.
    try{
      const confirmed=await read(tx=>tx.get(PAGE_STORE,scrollConfigKey));
      invariant(confirmed?.etag===saved.etag&&equal(confirmed.value,saved.value),
        'E_CONFIG_UNKNOWN','配置写入后的持久化读回未知；不得当作成功');
      await requireSiteGrant(row);
      const check=tx=>tx.get(PAGE_STORE,key(INSTALL_KEY_KIND,namespace,row.programId));
      const current=await (sender?scoped(sender,'readonly',check):read(check));
      invariant(current?.token===row.token&&current.authorization?.generation===row.authorization.generation&&
        active(current)&&permissionEpoch(row)===epoch,'E_PAGE_AUTHORIZATION','配置读回前安装权限已改变');
    }catch(error){
      throw new FoundationError('E_CONFIG_UNKNOWN','配置写入后的核验失败；请只读核对，不要自动重试');
    }
    return saved;
  }
  // Same native USER_SCRIPT broker, same persistent Page Authority; no page-facing
  // generic storage API. Exact execution nonce and document bind each request.
  async function handlePageConfig(message,sender) {
    const isWrite=message?.operation==='write';
    fields(message,isWrite?
      ['protocol','action','programId','operation','executionKey','receiptNonce','value','etag']:
      ['protocol','action','programId','operation','executionKey','receiptNonce']);
    invariant(message.protocol===PAGE_BOOT_PROTOCOL&&message.action==='page-config'&&
      ['read','write'].includes(message.operation)&&message.programId===SCROLL_CONFIG_PROGRAM_ID&&
      typeof message.executionKey==='string'&&message.executionKey.length<2048&&
      typeof message.receiptNonce==='string'&&message.receiptNonce.length>0&&message.receiptNonce.length<=128&&
      sender?.id===api.runtime.id&&sender.frameId===0&&typeof sender.documentId==='string'&&
      Number.isSafeInteger(sender.tab?.id)&&!sender.tab.incognito,
      'E_OWNER','配置请求必须来自原安装的顶层隔离执行文档');
    return ordered(async()=>{
      const execution=await read(tx=>tx.get(PAGE_STORE,message.executionKey));
      invariant(execution?.tag==='page-execution-v1'&&execution.namespace===namespace&&
        execution.programId===message.programId&&execution.executionKey===message.executionKey&&
        execution.receiptNonce===message.receiptNonce&&
        ['dispatched','completed'].includes(execution.state)&&
        execution.tabId===sender.tab.id&&execution.documentId===sender.documentId&&
        execution.browserSessionIncarnation===session,
        'E_PAGE_AUTHORIZATION','配置执行身份不匹配或已过期');
      const installKey=key(INSTALL_KEY_KIND,namespace,message.programId);
      const row=await read(tx=>tx.get(PAGE_STORE,installKey));
      invariant(row?.revision>=SCROLL_CONFIG_MIN_REVISION&&row.nativeState==='registered'&&
        active(row)&&row.manifestHash===execution.manifestHash&&row.sourceHash===execution.sourceHash&&
        row.authorization.installationId===execution.installationId&&
        row.authorization.generation===execution.grantGeneration,
        'E_PAGE_AUTHORIZATION','未批准此安装的可信配置能力');
      const epoch=permissionEpoch(row);
      await requireSiteGrant(row);
      const [tab,frames,desired]=await Promise.all([
        api.tabs.get(sender.tab.id),api.webNavigation.getAllFrames({tabId:sender.tab.id}),descriptor(row)]);
      const frame=frames?.find(f=>f.frameId===0&&f.documentId===sender.documentId);
      invariant(frame&&!frame.errorOccurred&&
        (!frame.documentLifecycle||frame.documentLifecycle==='active')&&
        tab?.url===frame.url&&!tab.pendingUrl&&!tab.incognito&&
        new URL(sender.url).origin===new URL(frame.url).origin&&
        installedURLMatches(row,frame.url),'E_DOCUMENT_STALE','网页已离开批准范围');
      const registered=await (await nativeAPI()).getScripts({ids:[row.nativeId]});
      invariant(registered.length===1&&nativeEqual(registered[0],desired.script),
        'E_PAGE_AUTHORIZATION','原生安装注册内容已经改变');
      invariant(permissionEpoch(row)===epoch,'E_PAGE_AUTHORIZATION',ACCESS_CHANGED);
      if(!isWrite)return readScrollConfig();
      return persistScrollConfig(row,message.value,message.etag,epoch);
    });
  }
  // Fixed, audited Side Panel operations: installed identity and native
  // registration remain authoritative. UI never receives an arbitrary evaluator.
  async function scrollHostInstall(request,sender){
    const row=await scoped(sender,'readonly',tx=>tx.get(PAGE_STORE,
      key(INSTALL_KEY_KIND,namespace,SCROLL_CONFIG_PROGRAM_ID)));
    invariant(request.programId===SCROLL_CONFIG_PROGRAM_ID&&
      row?.tag===PAGE_INSTALL_TAG&&row.manifestHash===request.manifestHash&&
      row.authorization?.installationId===request.installationId&&
      row.authorization?.generation===request.expectedGeneration,
      PAGE_REVISION_ERROR,'网站设置引用的安装身份已经改变');
    invariant(row.revision>=SCROLL_CONFIG_MIN_REVISION&&row.nativeState==='registered'&&
      active(row)&&!row.error,'E_PAGE_AUTHORIZATION','网站配置需要已启用并注册的安装');
    const epoch=permissionEpoch(row);
    await requireSiteGrant(row);
    const descriptorValue=await descriptor(row),native=await nativeAPI();
    const scripts=await native.getScripts({ids:[row.nativeId]});
    invariant(scripts.length===1&&nativeEqual(scripts[0],descriptorValue.script),
      'E_PAGE_AUTHORIZATION','原生安装注册内容发生变化');
    const current=await scoped(sender,'readonly',tx=>tx.get(PAGE_STORE,
      key(INSTALL_KEY_KIND,namespace,SCROLL_CONFIG_PROGRAM_ID)));
    await requireSiteGrant(row);
    invariant(current?.token===row.token&&current.manifestHash===row.manifestHash&&
      current.authorization?.installationId===row.authorization.installationId&&
      current.authorization?.generation===row.authorization.generation&&active(current)&&
      current.nativeState==='registered'&&!current.error&&permissionEpoch(row)===epoch,
      'E_PAGE_AUTHORIZATION','网站配置核验期间安装权限已改变');
    return row;
  }
  async function readScrollSiteConfig(request,sender){
    fields(request,['programId','manifestHash','installationId','expectedGeneration']);
    await scrollHostInstall(request,sender);
    return readScrollConfig();
  }
  async function saveScrollNavigationSettings(request,sender){
    fields(request,['programId','manifestHash','installationId','expectedGeneration','etag','navigation']);
    invariant(request.navigation&&typeof request.navigation==='object'&&!Array.isArray(request.navigation),
      'E_CONFIG_SCHEMA','导航设置必须是布尔选项对象');
    const row=await scrollHostInstall(request,sender),epoch=permissionEpoch(row);
    const before=await readScrollConfig();
    invariant(before.etag===request.etag,'E_CONFIG_CONFLICT','配置已被其他窗口修改，请读取并核对');
    return persistScrollConfig(row,{...before.value,navigation:request.navigation},request.etag,epoch,sender);
  }
  async function executeScrollSiteEditor(row,target,operation,payload,sender){
    const epoch=permissionEpoch(row);
    fields(target,['tabId','frameId','documentId','expectedUrl','expectedWindowId']);
    invariant(Number.isSafeInteger(target.tabId)&&target.tabId>=0&&
      target.frameId===0&&typeof target.documentId==='string'&&
      typeof target.expectedUrl==='string'&&Number.isSafeInteger(target.expectedWindowId),
      'E_SCHEMA','必须选择一个可核验的活动网页');
    const [tab,frames,selected]=await Promise.all([
      api.tabs.get(target.tabId),api.webNavigation.getAllFrames({tabId:target.tabId}),
      api.tabs.query({active:true,windowId:target.expectedWindowId})]);
    const frame=frames?.find(value=>value.frameId===0&&value.documentId===target.documentId);
    invariant(tab?.id===target.tabId&&tab.windowId===target.expectedWindowId&&
      tab.active===true&&tab.incognito===false&&tab.url===target.expectedUrl&&!tab.pendingUrl&&
      selected?.length===1&&selected[0]?.id===tab.id&&
      frame?.url===target.expectedUrl&&!frame.errorOccurred&&
      (!frame.documentLifecycle||frame.documentLifecycle==='active')&&
      installedURLMatches(row,frame.url),'E_DOCUMENT_STALE','当前页已改变或不在批准范围内');
    // Each open AI tab owns a different installed execution world. Never
    // assume the installation's lastExecution points to the active document.
    const execution=(await read(tx=>tx.all(PAGE_STORE)))
      .filter(entry=>entry?.tag==='page-execution-v1'&&entry.namespace===namespace&&
        entry.programId===row.programId&&entry.tabId===tab.id&&
        entry.documentId===frame.documentId)
      .sort((a,b)=>(b.createdAt||0)-(a.createdAt||0))[0];
    invariant(execution?.state==='completed'&&execution.programId===row.programId&&
      execution.manifestHash===row.manifestHash&&
      execution.installationId===row.authorization.installationId&&
      execution.grantGeneration===row.authorization.generation&&
      execution.tabId===tab.id&&execution.documentId===frame.documentId&&
      execution.browserSessionIncarnation===session&&
      typeof execution.managedUI?.worldId==='string',
      'E_SCROLL_PAGE_NOT_READY','此网页尚未运行当前安装版本，请刷新目标网页后再试');
    invariant(['pick','validate','observe'].includes(operation),'E_SCHEMA','未知网页编辑操作');
    const method=operation;
    const js='(()=>{const editor=globalThis.__opendeskAiScrollEditorV1;'+
      'return editor?editor.'+method+'('+JSON.stringify(payload)+'):'+
      JSON.stringify(operation==='observe'?{state:'unavailable',reason:'DISPOSED'}:
        {state:'unavailable',ok:false,error:'网页编辑能力未运行'})+';})()';
    // Serialized with disable/revoke mutations; do NOT await the pointer
    // interaction while holding the Authority mutation queue.
    const pending=await ordered(async()=>{
      const latest=await scoped(sender,'readonly',tx=>tx.get(PAGE_STORE,
        key(INSTALL_KEY_KIND,namespace,SCROLL_CONFIG_PROGRAM_ID)));
      const currentExecution=await read(tx=>tx.get(PAGE_STORE,execution.executionKey));
      invariant(latest?.token===row.token&&latest.manifestHash===row.manifestHash&&
        latest.authorization?.generation===row.authorization.generation&&
        currentExecution?.state==='completed'&&
        currentExecution.managedUI?.worldId===execution.managedUI.worldId&&
        currentExecution.installationId===row.authorization.installationId&&
        currentExecution.grantGeneration===row.authorization.generation&&
        permissionEpoch(row)===epoch&&active(latest),
        'E_PAGE_AUTHORIZATION','网页点选前安装身份已变化');
      await requireSiteGrant(latest);
      const native=await nativeAPI();
      invariant(permissionEpoch(row)===epoch,'E_PAGE_AUTHORIZATION','网页操作派发前网站权限已撤销');
      const completion=Promise.resolve(native.execute({target:{tabId:tab.id,
        documentIds:[frame.documentId]},world:'USER_SCRIPT',
        worldId:execution.managedUI.worldId,js:[{code:js}]}));
      completion.catch(()=>{});
      return {completion};
    });
    const results=await pending.completion;
    invariant(Array.isArray(results)&&results.length===1&&results[0]?.frameId===0&&
      results[0]?.documentId===frame.documentId&&results[0]?.error===undefined,
      'E_SCROLL_PAGE_NOT_READY','目标网页未返回真实 USER_SCRIPT 执行结果');
    const current=await scrollHostInstall({
      programId:SCROLL_CONFIG_PROGRAM_ID,manifestHash:row.manifestHash,
      installationId:row.authorization.installationId,
      expectedGeneration:row.authorization.generation},sender);
    const confirmedExecution=await read(tx=>tx.get(PAGE_STORE,execution.executionKey));
    invariant(current.token===row.token&&confirmedExecution?.state==='completed'&&
      confirmedExecution.managedUI?.worldId===execution.managedUI.worldId&&
      confirmedExecution.installationId===row.authorization.installationId&&
      confirmedExecution.grantGeneration===row.authorization.generation&&permissionEpoch(row)===epoch,
      'E_PAGE_AUTHORIZATION','点选期间安装执行身份已发生变化');
    const [renewedTab,renewedFrames]=await Promise.all([
      api.tabs.get(target.tabId),api.webNavigation.getAllFrames({tabId:target.tabId})]);
    const selectedAgain=await api.tabs.query({active:true,windowId:target.expectedWindowId});
    invariant(renewedTab?.url===target.expectedUrl&&!renewedTab.pendingUrl&&
      renewedTab.active===true&&renewedTab.incognito===false&&renewedTab.windowId===target.expectedWindowId&&
      selectedAgain?.length===1&&selectedAgain[0]?.id===target.tabId&&
      renewedFrames?.some(value=>value.frameId===0&&
        value.documentId===target.documentId&&value.url===target.expectedUrl&&
        !value.errorOccurred&&(!value.documentLifecycle||value.documentLifecycle==='active')),
      'E_DOCUMENT_STALE','点选期间网页已经导航，不能采用旧结果');
    return results[0].result;
  }
  async function pickScrollSiteElement(request,sender){
    fields(request,['programId','manifestHash','installationId','expectedGeneration','target','field','mainSelector']);
    invariant(['main','scroller','messages','anchor'].includes(request.field)&&
      typeof request.mainSelector==='string'&&request.mainSelector.length<=256,
      'E_CONFIG_SCHEMA','点选字段或主区域选择器无效');
    const row=await scrollHostInstall(request,sender);
    const value=await executeScrollSiteEditor(row,request.target,'pick',
      {field:request.field,mainSelector:request.mainSelector},sender);
    invariant(value&&typeof value.state==='string','E_SCROLL_PAGE_NOT_READY','网页点选没有确定结果');
    if(value.state==='selected')invariant(typeof value.selector==='string'&&
      value.selector.length>0&&value.selector.length<=256,
      'E_CONFIG_SCHEMA','网页返回的 CSS 选择器无效');
    return value;
  }
  async function observeScrollSitePage(request,sender){
    scrollObservationFields(request,['programId','manifestHash','installationId','expectedGeneration','target']);
    scrollObservationFields(request.target,['tabId','frameId','documentId','expectedUrl','expectedWindowId']);
    const row=await scrollHostInstall(request,sender);
    return boundedScrollObservation(await executeScrollSiteEditor(row,request.target,'observe',{},sender));
  }
  async function saveScrollSiteRule(request,sender){
    fields(request,['programId','manifestHash','installationId','expectedGeneration','target','etag','editKey','rule'],
      ['programId','manifestHash','installationId','expectedGeneration','etag','editKey','rule']);
    invariant(request.editKey===null||
      typeof request.editKey==='string'&&request.editKey.length<=800,
      'E_CONFIG_SCHEMA','编辑目标无效');
    const row=await scrollHostInstall(request,sender),epoch=permissionEpoch(row);
    const before=await readScrollConfig();
    invariant(before.etag===request.etag,'E_CONFIG_CONFLICT','规则已被其他窗口修改，请读取并核对');
    const source=request.editKey===null?null:before.value.sites.find(r=>
      r.origin+'\n'+r.pathScope===request.editKey);
    invariant(request.editKey===null||source,'E_CONFIG_CONFLICT','原始规则已经改变');
    if(request.rule===null){
      invariant(source,'E_CONFIG_SCHEMA','删除必须指向已存在的规则');
      return persistScrollConfig(row,{...before.value,sites:before.value.sites.filter(r=>r!==source)},request.etag,epoch,sender);
    }
    const rule=normalizeScrollConfig({version:1,sites:[request.rule]}).sites[0];
    const key=rule.origin+'\n'+rule.pathScope;
    invariant(!before.value.sites.some(r=>r.origin+'\n'+r.pathScope===key&&r!==source),
      'E_CONFIG_CONFLICT','同一网站路径已经有规则');
    // Existing inert selectors are already reviewed data. Only an enabled
    // toggle may bypass a live DOM check, never an origin/path/selector edit.
    const management=source&&equal({...source,enabled:rule.enabled},rule);
    if(management&&rule.enabled)invariant(scrollConfigScopeCovered(row.pageRules,rule),
      'E_SCROLL_RESTORE_SCOPE','无法安全恢复：当前安装未授权完整网站路径，请先审阅并恢复安装范围');
    if(!management){
      fields(request.target,['tabId','frameId','documentId','expectedUrl','expectedWindowId']);
      let page;try{page=new URL(request.target.expectedUrl);}catch{}
      invariant(page&&rule.origin===page.origin&&scrollPathMatches(rule.pathScope,page.pathname),
        'E_CONFIG_SCOPE','请在目标网站的适用路径中保存');
      const verified=await executeScrollSiteEditor(row,request.target,'validate',rule,sender);
      invariant(verified?.ok===true,'E_CONFIG_DOM',verified?.error||'真实网页选择器未通过校验');
    }
    const next={...before.value,sites:[...before.value.sites.filter(r=>r!==source),rule]};
    return persistScrollConfig(row,next,request.etag,epoch,sender);
  }
  // Fixed, authenticated USER_SCRIPT dispatch: no caller-provided code or browser world.
  async function sendQueueOperation(request,sender){
    const operation=request?.operation,mutating=operation!=='snapshot';
    invariant(['snapshot','pause','resume','now','edit','remove','move'].includes(operation),
      'E_QUEUE_SCHEMA','未知队列操作');
    fields(request,mutating?
      ['operation','target','instance','revision','id',...(operation==='move'?['index']:[])]:
      ['operation','target']);
    const target=request.target;
    fields(target,['tabId','frameId','documentId','expectedUrl','expectedWindowId']);
    invariant(Number.isSafeInteger(target.tabId)&&target.tabId>=0&&target.frameId===0&&
      typeof target.documentId==='string'&&target.documentId.length>0&&target.documentId.length<=256&&
      typeof target.expectedUrl==='string'&&target.expectedUrl.length<=2048&&
      Number.isSafeInteger(target.expectedWindowId)&&target.expectedWindowId>=0,
      'E_QUEUE_SCHEMA','目标网页文档无效');
    if(mutating){
      invariant(typeof request.instance==='string'&&/^[A-Za-z0-9-]{1,128}$/.test(request.instance)&&
        Number.isSafeInteger(request.revision)&&request.revision>=0&&
        typeof request.id==='string'&&/^q[1-9]\d{0,8}$/.test(request.id),
        'E_QUEUE_SCHEMA','消息身份或队列版本无效');
      if(operation==='move')invariant(Number.isInteger(request.index)&&
        request.index>=0&&request.index<20,'E_QUEUE_SCHEMA','队列位置无效');
    }
    const row=await scoped(sender,'readonly',tx=>tx.get(PAGE_STORE,
      key(INSTALL_KEY_KIND,namespace,SEND_QUEUE_PROGRAM_ID)));
    invariant(row?.tag===PAGE_INSTALL_TAG&&row.programId===SEND_QUEUE_PROGRAM_ID&&
      admitsPinnedQueuePage(row)&&active(row)&&row.nativeState==='registered'&&!row.error,
      'E_QUEUE_PAGE_NOT_READY','网页队列需要安装和启用新版受信 USER_SCRIPT');
    const epoch=permissionEpoch(row);
    await requireSiteGrant(row);
    const [tab,frames,selected]=await Promise.all([
      api.tabs.get(target.tabId),api.webNavigation.getAllFrames({tabId:target.tabId}),
      api.tabs.query({active:true,windowId:target.expectedWindowId})]);
    const frame=frames?.find(value=>value.frameId===0&&value.documentId===target.documentId);
    invariant(tab?.id===target.tabId&&tab.windowId===target.expectedWindowId&&tab.active===true&&
      !tab.incognito&&!tab.pendingUrl&&tab.url===target.expectedUrl&&
      selected?.length===1&&selected[0].id===tab.id&&
      frame?.url===target.expectedUrl&&!frame.errorOccurred&&
      (!frame.documentLifecycle||frame.documentLifecycle==='active')&&
      new URL(target.expectedUrl).origin==='https://chatgpt.com'&&
      installedURLMatches(row,frame.url),'E_DOCUMENT_STALE','当前 ChatGPT 主文档已变化');
    const execution=(await read(tx=>tx.all(PAGE_STORE))).filter(value=>
      value?.tag==='page-execution-v1'&&value.namespace===namespace&&
      value.programId===SEND_QUEUE_PROGRAM_ID&&value.tabId===tab.id&&
      value.documentId===frame.documentId&&value.browserSessionIncarnation===session)
      .sort((a,b)=>(b.createdAt||0)-(a.createdAt||0))[0];
    invariant(execution?.state==='completed'&&execution.manifestHash===row.manifestHash&&
      execution.sourceHash===row.sourceHash&&
      execution.installationId===row.authorization.installationId&&
      execution.grantGeneration===row.authorization.generation&&
      typeof execution.managedUI?.worldId==='string',
      'E_QUEUE_PAGE_NOT_READY','当前网页未执行获准的队列程序，请刷新后检查');
    const input={operation,...(mutating?{instance:request.instance,revision:request.revision,
      id:request.id,...(operation==='move'?{index:request.index}:{})}:{})};
    const js='(()=>{const fn=globalThis.__opendeskAiSendQueueV1;return typeof fn==="function"?'+
      'fn('+JSON.stringify(input)+'):'+
      JSON.stringify({status:'unavailable',reason:'队列程序尚未初始化'})+';})()';
    const launched=await ordered(async()=>{
      const latest=await scoped(sender,'readonly',tx=>tx.get(PAGE_STORE,
        key(INSTALL_KEY_KIND,namespace,SEND_QUEUE_PROGRAM_ID)));
      invariant(latest?.token===row.token&&latest.manifestHash===row.manifestHash&&
        latest.authorization?.generation===row.authorization.generation&&
        latest.nativeState==='registered'&&active(latest)&&permissionEpoch(latest)===epoch,
        'E_PAGE_AUTHORIZATION','队列授权或安装已发生改变');
      await requireSiteGrant(latest);
      const native=await nativeAPI(),desired=await descriptor(latest);
      const scripts=await native.getScripts({ids:[latest.nativeId]});
      invariant(scripts.length===1&&nativeEqual(scripts[0],desired.script),
        'E_PAGE_AUTHORIZATION','原生 USER_SCRIPT 注册身份不一致');
      // Re-read immediately before the native dispatch: the Side Panel can
      // switch tabs while a storage/permission/native read is pending. A
      // readback *after* executing would be too late to prevent the effect.
      const [dispatchTab,dispatchFrames,dispatchSelected]=await Promise.all([
        api.tabs.get(tab.id),api.webNavigation.getAllFrames({tabId:tab.id}),
        api.tabs.query({active:true,windowId:target.expectedWindowId})]);
      const dispatchFrame=dispatchFrames?.find(value=>value.frameId===0&&
        value.documentId===target.documentId);
      invariant(dispatchTab?.id===target.tabId&&
        dispatchTab.windowId===target.expectedWindowId&&dispatchTab.active===true&&
        dispatchTab.incognito===false&&!dispatchTab.pendingUrl&&
        dispatchTab.url===target.expectedUrl&&dispatchSelected?.length===1&&
        dispatchSelected[0]?.id===target.tabId&&
        dispatchFrame?.url===target.expectedUrl&&!dispatchFrame.errorOccurred&&
        (!dispatchFrame.documentLifecycle||dispatchFrame.documentLifecycle==='active')&&
        permissionEpoch(latest)===epoch,
        'E_DOCUMENT_STALE','队列操作前活动标签页或原文档已改变');
      const completion=Promise.resolve(native.execute({target:{tabId:tab.id,
        documentIds:[frame.documentId]},world:'USER_SCRIPT',
        worldId:execution.managedUI.worldId,js:[{code:js}]}));
      completion.catch(()=>{});
      return {completion};
    });
    let results;
    try{results=await launched.completion;}
    catch(error){
      if(mutating)throw new FoundationError(PAGE_UNKNOWN_ERROR,
        '队列操作回执未知，请读取最新状态，禁止自动重复');
      throw error;
    }
    invariant(Array.isArray(results)&&results.length===1&&results[0]?.frameId===0&&
      results[0]?.documentId===frame.documentId&&results[0]?.error===undefined,
      mutating?PAGE_UNKNOWN_ERROR:'E_QUEUE_PAGE_NOT_READY',
      '网页未返回有效的队列执行回执');
    const value=results[0].result;
    invariant(value&&typeof value==='object'&&
      ['ready','stale','unavailable','wrong-session'].includes(value.status)&&
      JSON.stringify(value).length<=48000,'E_QUEUE_RESULT','队列结果格式或长度无效');
    const [latest,afterTab,afterFrames,afterSelected]=await Promise.all([
      scoped(sender,'readonly',tx=>tx.get(PAGE_STORE,
        key(INSTALL_KEY_KIND,namespace,SEND_QUEUE_PROGRAM_ID))),
      api.tabs.get(tab.id),api.webNavigation.getAllFrames({tabId:tab.id}),
      api.tabs.query({active:true,windowId:target.expectedWindowId})]);
    invariant(latest?.token===row.token&&latest.manifestHash===row.manifestHash&&
      latest.authorization?.generation===row.authorization.generation&&
      latest.nativeState==='registered'&&active(latest)&&permissionEpoch(latest)===epoch&&
      afterTab?.id===target.tabId&&afterTab.windowId===target.expectedWindowId&&
      afterTab.url===target.expectedUrl&&!afterTab.pendingUrl&&afterTab.active===true&&
      afterSelected?.length===1&&afterSelected[0]?.id===target.tabId&&
      afterFrames?.some(value=>value.frameId===0&&value.documentId===frame.documentId&&
        value.url===target.expectedUrl&&!value.errorOccurred),
      'E_DOCUMENT_STALE','队列回执后网页或授权已变化');
    await requireSiteGrant(latest);
    return value;
  }
  function handleBoot(message,sender,source='page_auto',manualReceiptId=null,manualHostDocumentId=null){
    if(message?.action===PAGE_TASK_ACTION)return handlePageTaskBridge(message,sender);
    if(message?.action===APP_PAGE_ACTION)return handleAppPageBridge(message,sender);
    if(message?.action==='page-config')return handlePageConfig(message,sender);
    if(message?.action===PAGE_FRAME_ACTION)return frameBoot(message,sender);
    // A queued invocation keeps Chrome's original sender and bootstrap input,
    // never mutable references supplied by a later caller.
    message=structuredClone(message);sender=structuredClone(sender);
    const queuedAt=performance.now();
    const failed=async error=>{
      // Chrome's User Scripts toggle does not necessarily emit permissions
      // onRemoved. A real access failure must durably suspend this installation
      // too. Forged markers, stale documents and ordinary source errors cannot
      // revoke another program. Do not re-enter this queue from reconcileOne.
      if(error.code==='E_USER_SCRIPTS_UNAVAILABLE'||error.code==='E_PAGE_ENVIRONMENT'||error.pageAccessLost===true)await ordered(async()=>{
        const changed=await storage.transaction([PAGE_STORE],PAGE_WRITE,async tx=>{
          const row=(await tx.all(PAGE_STORE)).find(value=>value?.tag===PAGE_INSTALL_TAG&&value.namespace===namespace&&
            value.nativeId===message.nativeId&&value.token===message.token&&value.authorization?.status==='active');
          if(!row)return null;
          const revoked={...row,token:crypto.randomUUID().replaceAll('-',''),nativeState:'blocked',
            error:{code:error.code,message:error.code==='E_PAGE_ENVIRONMENT'?error.message:ACCESS_CHANGED},
            authorization:{...row.authorization,generation:row.authorization.generation+1,status:'suspended'}};
          await tx.put(PAGE_STORE,revoked,key(INSTALL_KEY_KIND,namespace,row.programId));return revoked;
        });
        if(changed)await reconcileOne(changed);
      });
      throw error;
    };
    invariant(executions.length<256,'E_QUOTA','页面启动等待队列已满');
    // Reserve FIFO position before asynchronous preparation can reorder arrivals.
    const ready=prepare(()=>prepareBoot(message,sender,queuedAt)).then(value=>({value}),error=>({error}));
    return scheduleDocument(sender,async()=>{
      try{
        const prepared=await ready;if(prepared.error)throw prepared.error;
        return await boot(message,sender,source,manualReceiptId,manualHostDocumentId,prepared.value);
      }catch(error){return failed(error);}
    },{exclusive:source==='manual'});
  }
  // An authenticated first-party Developer click can ask the *same* installed
  // USER_SCRIPT executor for one explicit invocation. It never replays the
  // native bootstrap, changes a grant, or invents a page sender from UI input.
  async function runInstalledPageProgram(request,sender){
    request=structuredClone(request);
    fields(request,['programId','manifestHash','installationId','expectedGeneration','target']);
    const target=request.target;
    fields(target,['tabId','frameId','documentId','expectedUrl','expectedWindowId']);
    invariant(Number.isSafeInteger(target.tabId)&&target.tabId>=0&&target.frameId===0&&
      typeof target.documentId==='string'&&target.documentId.length>0&&target.documentId.length<=256&&
      typeof target.expectedUrl==='string'&&Number.isSafeInteger(target.expectedWindowId),
      'E_SCHEMA','手动运行必须指定当前可信网页文档');
    const row=await scoped(sender,'readonly',async tx=>tx.get(PAGE_STORE,
      key(INSTALL_KEY_KIND,namespace,request.programId)));
    invariant(row?.tag===PAGE_INSTALL_TAG&&row.manifestHash===request.manifestHash&&
      row.authorization?.installationId===request.installationId&&
      row.authorization?.generation===request.expectedGeneration,
      PAGE_REVISION_ERROR,'手动运行引用的安装身份或授权代数已改变');
    invariant(active(row),PAGE_PERMISSION_ERROR,'程序已停用或网站授权不可用');
    const [tab,frames]=await Promise.all([api.tabs.get(target.tabId),
      api.webNavigation.getAllFrames({tabId:target.tabId})]);
    const frame=frames?.find(value=>value.frameId===0&&value.documentId===target.documentId);
    invariant(tab?.id===target.tabId&&tab.windowId===target.expectedWindowId&&tab.active===true&&
      tab.incognito===false&&tab.url===target.expectedUrl&&!tab.pendingUrl&&
      frame?.url===target.expectedUrl&&!frame.errorOccurred&&
      (!frame.documentLifecycle||frame.documentLifecycle==='active'),
      'E_DOCUMENT_STALE','手动运行目标已不再是活动网页文档');
    const receiptId=crypto.randomUUID(),executionKey=
      key('execution',namespace,row.manifestHash,frame.documentId,receiptId);
    // Only the original Broker can synthesize these sender facts after its
    // Host + Chrome readbacks; an untrusted page cannot call this RPC.
    const frameSender={id:api.runtime.id,frameId:0,documentId:frame.documentId,
      url:frame.url,tab:{id:tab.id,incognito:false}};
    let response;
    try{
      response=await handleBoot({protocol:PAGE_BOOT_PROTOCOL,nativeId:row.nativeId,token:row.token},
        frameSender,'manual',receiptId,sender.documentId);
    }catch(error){
      const execution=await read(tx=>tx.get(PAGE_STORE,executionKey));
      if(execution?.source!=='manual'||execution.receiptId!==receiptId||
        !['failed','outcome-unknown'].includes(execution.state))throw error;
      return {receiptId,state:execution.state,error:{code:error.code||PAGE_UNKNOWN_ERROR,
        message:String(error.message||error)}};
    }
    return {...response,receiptId};
  }
  async function prepareAppPage(request,sender){
    fields(request,['tool']);await scoped(sender,'readonly',()=>{});
    const tool=await verifyAppPageTool(request.tool),pkg=tool.pageModule;
    await nativeAPI();
    invariant(await api.permissions.contains({origins:pageHostPermissionOrigins(pkg.pageRules.matches)}),
      PAGE_PERMISSION_ERROR,'Companion sites require Chrome permission');
    await scoped(sender,'readonly',async tx=>{
      if(!await tx.get(PAGE_STORE,key('candidate',namespace,pkg.programId,pkg.revision)))return;
      const {candidate}=await dependencies.readStoredPageCandidate(namespace,pkg.programId,pkg.revision,tx);
      const manifest=candidate.manifest;
      invariant(candidate.sourceUtf8===pkg.sourceUtf8&&manifest.entryFormat===pkg.entryFormat&&
        equal(manifest.pageRules,pkg.pageRules)&&manifest.sourceProfile.importSourceUrl===null&&
        manifest.dependencyLockId===null&&!manifest.dependencyScope&&!manifest.compilation&&!candidate.authoring,
        'E_REQUEST_CONFLICT','网页模块的固定 Revision 已用于其他源码或规则；请使用新 Revision 重新打包，原安装与数据未改变');
      assertBuiltinIdentity(candidate.builtinIdentity,builtinIdentity(await loadBuiltin({runtime:api.runtime})));
    });
    return {status:'prepared',toolId:tool.id,packageHash:await sidebarToolPackageHash(tool),programId:pkg.programId,sourceHash:pkg.sourceHash};
  }
  const appOwnerOf=request=>({toolId:request.toolId,packageHash:request.packageHash,installEpoch:request.installEpoch});
  async function importAppPage(request,sender){
    fields(request,['toolId','packageHash','installEpoch']);await scoped(sender,'readonly',()=>{});
    const owner=appOwnerOf(request),tool=await readAppPageParent(api,owner,{requireEnabled:false});
    const previous=await read(tx=>tx.get(PAGE_STORE,key(INSTALL_KEY_KIND,namespace,tool.pageModule.programId)));
    // Never revive or overwrite another parent incarnation, including same-source upgrades.
    if(previous?.tag===PAGE_UNINSTALL_TAG){
      assertPageInstallAuthorization(previous);
      invariant(previous.enabled===false&&previous.nativeState==='disabled'&&previous.authorization.status==='disabled',
        'E_PAGE_UNINSTALL_PENDING','旧网页功能的原生撤销尚未确认');
    }else if(previous)invariant(previous.appOwner&&equal(previous.appOwner,owner),'E_APP_PAGE_OWNER','Retire previous parent companion first');
    const baseline=previous?.tag===PAGE_UNINSTALL_TAG?null:previous;
    await importPageInstallPackage({package:tool.pageModule,expectedInstalledManifestHash:baseline?.manifestHash??null,
      expectedGeneration:baseline?.authorization?.generation??null},sender,owner);
    return {...await verifyAppPage(request,sender),status:'installed'};
  }
  async function verifyAppPage(request,sender){
    fields(request,['toolId','packageHash','installEpoch']);await scoped(sender,'readonly',()=>{});
    const owner=appOwnerOf(request),tool=await readAppPageParent(api,owner,{requireEnabled:false});
    const row=await read(tx=>tx.get(PAGE_STORE,key(INSTALL_KEY_KIND,namespace,tool.pageModule.programId)));
    invariant(row?.appOwner&&equal(row.appOwner,owner)&&row.tag===PAGE_INSTALL_TAG,
      'E_APP_PAGE_OWNER','Companion installation missing or changed');
    const desired=await descriptor(row),scripts=await (await nativeAPI()).getScripts({ids:[row.nativeId]});
    if(row.enabled){
      invariant(active(row)&&row.nativeState==='registered'&&!row.error&&scripts.length===1&&nativeEqual(scripts[0],desired.script),
        'E_PAGE_INSTALLATION','Companion native registration unverified');await requireSiteGrant(row);
    }else invariant(row.authorization?.status==='disabled'&&row.nativeState==='disabled'&&!scripts.length,
      'E_PAGE_INSTALLATION','Companion disable not confirmed');
    await readAppPageParent(api,owner,{requireEnabled:row.enabled});
    await scoped(sender,'readonly',async tx=>{
      const latest=await tx.get(PAGE_STORE,key(INSTALL_KEY_KIND,namespace,row.programId));
      invariant(latest?.token===row.token&&latest.authorization?.generation===row.authorization.generation&&
        latest.nativeState===row.nativeState,'E_PAGE_INSTALLATION','Companion changed during verification');
    });
    return {status:'verified',appOwner:owner,programId:row.programId,manifestHash:row.manifestHash,
      sourceHash:row.sourceHash,nativeState:row.enabled?'registered':'disabled',ready:true};
  }
  async function synchronizeAppPages(request={},sender){
    fields(request,['toolId'],[]);if(sender)await scoped(sender,'readonly',()=>{});
    return ordered(async()=>{
      const {installed,executions,cleanup}=await read(async tx=>{
        const records=[...await readPageRecords(tx,'installed'),...await readPageRecords(tx,'cleanup')].filter(row=>
          row.namespace===namespace&&row.appOwner&&(!request.toolId||row.appOwner.toolId===request.toolId));
        const installed=records.filter(row=>row.tag===PAGE_INSTALL_TAG);
        const executions=!preview.retireInstalled&&installed.some(row=>row.enabled===false&&row.managedCleanup==null)
          ?await readPageRecords(tx,'execution'):[];
        return {installed,executions,cleanup:records.filter(cleanupOnly)};
      }),retired=[],cleanupPending=[],revocationPending=[];
      for(const row of cleanup){
        if(row.managedCleanup&&row.managedCleanup.state!=='retired')cleanupPending.push(row.programId);
        if(row.enabled!==false||row.nativeState!=='disabled'||row.authorization?.status!=='disabled')
          revocationPending.push(row.programId);
      }
      for(const previous of installed){
        try{
          await assertAppParent(previous,{requireEnabled:previous.enabled!==false});
          if(previous.enabled!==false)continue;
          // A queued wake after a disabled parent update must retain its inert
          // companion. Disabled flags alone cannot prove native/resource cleanup.
          assertPageInstallAuthorization(previous);
          if(previous.authorization.status==='disabled'&&previous.nativeState==='disabled'&&!previous.error){
            const scripts=await (await nativeAPI()).getScripts({ids:[previous.nativeId]});
            if(!scripts.length){
              try{
                const cleanup=preview.retireInstalled
                  ?await preview.retireInstalled(previous,{includeCurrent:true,observeOnly:true})
                  :previous.managedCleanup??{state:executions.some(execution=>execution?.tag==='page-execution-v1'&&
                    execution.namespace===namespace&&execution.programId===previous.programId&&
                    execution.installationId===previous.authorization.installationId)?'unknown':'retired'};
                if(cleanup.state!=='retired')cleanupPending.push(previous.programId);
              }catch{cleanupPending.push(previous.programId);}
              // The exact parent's intentional disabled grant stays installed.
              // Unobserved DOM disposal does not restore or revoke that grant.
              continue;
            }
          }
        }catch{/* Only revoke; never infer retirement from an unknown read. */}
        const row={...previous,enabled:false,token:crypto.randomUUID().replaceAll('-',''),nativeState:'pending',
          authorization:{...previous.authorization,generation:previous.authorization.generation+1,status:'disabled'}};
        await storage.transaction([PAGE_STORE],PAGE_WRITE,async tx=>{
          const current=await tx.get(PAGE_STORE,key(INSTALL_KEY_KIND,namespace,row.programId));
          invariant(current?.token===previous.token,PAGE_REVISION_ERROR,'Companion changed during cleanup');
          await tx.put(PAGE_STORE,row,key(INSTALL_KEY_KIND,namespace,row.programId));
        });
        await reconcileOne(row);
        const after=await read(tx=>tx.get(PAGE_STORE,key(INSTALL_KEY_KIND,namespace,row.programId)));
        let revoked=false;
        if(after?.token===row.token&&after.enabled===false&&after.nativeState==='disabled'&&
          after.authorization?.status==='disabled'&&!after.error)try{
          revoked=(await (await nativeAPI()).getScripts({ids:[row.nativeId]})).length===0;
        }catch{/* A failed native read cannot attest revocation. */}
        if(!revoked){
          revocationPending.push(row.programId);cleanupPending.push(row.programId);continue;
        }
        const pending=Boolean(after.managedCleanup&&after.managedCleanup.state!=='retired');
        await storage.transaction([PAGE_STORE],PAGE_WRITE,async tx=>{
          const current=await tx.get(PAGE_STORE,key(INSTALL_KEY_KIND,namespace,row.programId));
          invariant(current?.tag===PAGE_INSTALL_TAG&&current.token===row.token&&current.enabled===false&&
            current.nativeState==='disabled'&&current.authorization?.status==='disabled'&&
            current.authorization?.installationId===row.authorization.installationId&&
            current.authorization?.generation===row.authorization.generation,
            PAGE_REVISION_ERROR,'旧网页功能的撤销身份已改变');
          if(pending)await tx.put(PAGE_STORE,{...current,tag:PAGE_UNINSTALL_TAG,uninstalledAt:clock.now()},
            key(INSTALL_KEY_KIND,namespace,row.programId));
          else await tx.delete(PAGE_STORE,key(INSTALL_KEY_KIND,namespace,row.programId));
        });
        if(pending)cleanupPending.push(row.programId);else retired.push(row.programId);
      }
      return {status:'synchronized',retired,cleanupPending:[...new Set(cleanupPending)],
        revocationPending:[...new Set(revocationPending)]};
    });
  }
  // This validator is shared by the Page message boundary and original Host
  // approval/Run fences. Its identity is loaded from the installed execution,
  // never supplied as a Host or an authorization flag by a webpage.
  async function assertPageTaskSourceInTransaction(tx,source){
    invariant(source?.namespace===namespace&&source.browserSessionIncarnation===session,'E_PAGE_AUTHORIZATION');
    const row=await tx.get(PAGE_STORE,key(INSTALL_KEY_KIND,namespace,source.programId));
    const execution=await tx.get(PAGE_STORE,source.executionKey);
    invariant(row&&active(row)&&!row.appOwner&&row.nativeState==='registered'&&!row.error&&
      row.token===source.installationToken&&row.revision===source.revision&&
      row.manifestHash===source.manifestHash&&row.sourceHash===source.sourceHash&&
      row.authorization.installationId===source.installationId&&row.authorization.generation===source.generation&&
      row.delegatedTasks?.length&&equal(row.delegatedTasks,source.delegatedTasks)&&
      permissionEpoch(row)===(source.authorityInstance===taskAuthorityInstance?source.permissionEpoch:0)&&
      execution?.tag==='page-execution-v1'&&execution.namespace===namespace&&
      execution.programId===row.programId&&execution.executionKey===source.executionKey&&
      execution.receiptNonce===source.receiptNonce&&execution.managedUI?.worldId===source.worldId&&
      ['dispatched','completed'].includes(execution.state)&&execution.browserSessionIncarnation===session&&
      execution.installationToken===row.token&&execution.installationId===source.installationId&&
      execution.grantGeneration===source.generation&&execution.manifestHash===row.manifestHash&&
      execution.sourceHash===row.sourceHash&&execution.tabId===source.tabId&&
      execution.documentId===source.documentId&&source.frameId===0,'E_PAGE_AUTHORIZATION','Installed Page task source expired');
    return row;
  }
  async function assertPageTaskSource(source){
    const row=await read(tx=>assertPageTaskSourceInTransaction(tx,source));
    await requireSiteGrant(row);
    const [tab,frames,desired]=await Promise.all([api.tabs.get(source.tabId),
      api.webNavigation.getAllFrames({tabId:source.tabId}),descriptor(row)]);
    const frame=frames?.find(item=>item.frameId===0&&item.documentId===source.documentId);
    invariant(frame&&!frame.errorOccurred&&(!frame.documentLifecycle||frame.documentLifecycle==='active')&&
      !tab.incognito&&!tab.pendingUrl&&tab.url===frame.url&&frame.url===source.url&&
      tab.windowId===source.windowId&&installedURLMatches(row,frame.url),
      'E_DOCUMENT_STALE','Original Page task document changed');
    invariant(equal(readPageTaskDelegations(desired.candidate.sourceUtf8),row.delegatedTasks),'E_PAGE_TASK_SCOPE');
    const scripts=await (await nativeAPI()).getScripts({ids:[row.nativeId]});
    invariant(scripts.length===1&&nativeEqual(scripts[0],desired.script),'E_PAGE_AUTHORIZATION','Native Page registration changed');
    await read(tx=>assertPageTaskSourceInTransaction(tx,source));
    return true;
  }
  async function handlePageTaskBridge(message,sender){
    fields(message,['protocol','action','programId','executionKey','receiptNonce','worldId','operation','payload']);
    invariant(message.protocol===PAGE_BOOT_PROTOCOL&&sender?.id===api.runtime.id&&sender.frameId===0&&
      typeof sender.documentId==='string'&&Number.isSafeInteger(sender.tab?.id)&&!sender.tab.incognito&&
      ['request','read','restore'].includes(message.operation)&&typeof onPageTask==='function',
      'E_OWNER','Page task requests require the original installed USER_SCRIPT sender');
    const row=await read(tx=>tx.get(PAGE_STORE,key(INSTALL_KEY_KIND,namespace,message.programId)));
    invariant(row?.delegatedTasks?.length&&!row.appOwner,'E_PAGE_TASK_SCOPE');
    const [tab,frames]=await Promise.all([api.tabs.get(sender.tab.id),api.webNavigation.getAllFrames({tabId:sender.tab.id})]);
    const frame=frames?.find(item=>item.frameId===0&&item.documentId===sender.documentId);
    invariant(frame&&httpUrl(frame.url).origin===httpUrl(sender.url).origin,'E_DOCUMENT_STALE');
    const source={namespace,programId:row.programId,revision:row.revision,manifestHash:row.manifestHash,
      sourceHash:row.sourceHash,installationId:row.authorization?.installationId,generation:row.authorization?.generation,
      installationToken:row.token,executionKey:message.executionKey,receiptNonce:message.receiptNonce,worldId:message.worldId,
      browserSessionIncarnation:session,authorityInstance:taskAuthorityInstance,permissionEpoch:permissionEpoch(row),
      tabId:sender.tab.id,frameId:0,documentId:sender.documentId,url:frame.url,windowId:tab.windowId,
      delegatedTasks:structuredClone(row.delegatedTasks)};
    invariant(sender.userScriptWorldId===undefined||sender.userScriptWorldId===source.worldId,'E_PAGE_AUTHORIZATION');
    await assertPageTaskSource(source);
    return onPageTask({operation:message.operation,payload:structuredClone(message.payload)},source);
  }
  async function appExecution(row,executionKey,receiptNonce,target){
    await assertAppParent(row);await requireSiteGrant(row);
    const current=await read(tx=>tx.get(PAGE_STORE,key(INSTALL_KEY_KIND,namespace,row.programId)));
    const execution=await read(tx=>tx.get(PAGE_STORE,executionKey));
    invariant(current?.token===row.token&&active(current)&&current.nativeState==='registered'&&!current.error&&
      execution?.tag==='page-execution-v1'&&execution.namespace===namespace&&execution.programId===row.programId&&
      execution.executionKey===executionKey&&execution.receiptNonce===receiptNonce&&
      ['dispatched','completed'].includes(execution.state)&&execution.browserSessionIncarnation===session&&
      execution.installationToken===row.token&&execution.installationId===row.authorization.installationId&&
      execution.grantGeneration===row.authorization.generation&&execution.manifestHash===row.manifestHash&&
      execution.sourceHash===row.sourceHash&&typeof execution.managedUI?.worldId==='string'&&
      execution.tabId===target.tabId&&execution.documentId===target.documentId,
      'E_PAGE_AUTHORIZATION','Companion execution expired');
    const [tab,frames,desired]=await Promise.all([api.tabs.get(target.tabId),api.webNavigation.getAllFrames({tabId:target.tabId}),descriptor(row)]);
    const frame=frames?.find(frame=>frame.frameId===0&&frame.documentId===target.documentId);
    invariant(frame&&!frame.errorOccurred&&(!frame.documentLifecycle||frame.documentLifecycle==='active')&&
      !tab.incognito&&!tab.pendingUrl&&tab.url===frame.url&&frame.url===target.expectedUrl&&
      (target.expectedWindowId===undefined||tab.windowId===target.expectedWindowId)&&installedURLMatches(row,frame.url),
      'E_DOCUMENT_STALE','Companion document changed');
    const scripts=await (await nativeAPI()).getScripts({ids:[row.nativeId]});
    invariant(scripts.length===1&&nativeEqual(scripts[0],desired.script),'E_PAGE_AUTHORIZATION','Native companion changed');
    await assertAppParent(row);
    const latest=await read(tx=>tx.get(PAGE_STORE,key(INSTALL_KEY_KIND,namespace,row.programId)));
    invariant(latest?.token===row.token&&active(latest)&&latest.nativeState==='registered'&&!latest.error,
      'E_PAGE_AUTHORIZATION','Companion changed during authorization');
    return execution;
  }
  async function handleAppPageBridge(message,sender){
    fields(message,['protocol','action','programId','executionKey','receiptNonce','worldId','operation','payload']);
    invariant(message.protocol===PAGE_BOOT_PROTOCOL&&sender?.id===api.runtime.id&&sender.frameId===0&&
      typeof sender.documentId==='string'&&Number.isSafeInteger(sender.tab?.id)&&!sender.tab.incognito,
      'E_OWNER','Companion requires original USER_SCRIPT sender');
    const row=await read(tx=>tx.get(PAGE_STORE,key(INSTALL_KEY_KIND,namespace,message.programId)));
    invariant(row?.appOwner,'E_APP_PAGE_OWNER','Missing companion');
    const authorize=async()=>{
      const frames=await api.webNavigation.getAllFrames({tabId:sender.tab.id});
      const frame=frames?.find(frame=>frame.frameId===sender.frameId&&frame.documentId===sender.documentId);
      // MessageSender retains the injection URL across same-document history.
      // Re-resolve the exact document and current URL on every authorization.
      invariant(frame&&httpUrl(frame.url).origin===httpUrl(sender.url).origin,
        'E_DOCUMENT_STALE','Companion sender document changed');
      return appExecution(row,message.executionKey,message.receiptNonce,
        {tabId:sender.tab.id,documentId:sender.documentId,expectedUrl:frame.url});
    };
    const execution=await authorize();
    invariant(message.worldId===execution.managedUI.worldId&&
      (sender.userScriptWorldId===undefined||sender.userScriptWorldId===message.worldId),
      'E_PAGE_AUTHORIZATION','Companion world changed');
    if(message.operation==='authorize')return {ready:true};
    return appPageStorage({api,owner:row.appOwner,operation:message.operation,payload:message.payload,authorize});
  }
  async function requestAppPage(request,sender){
    fields(request,['toolId','packageHash','installEpoch','target','operation','payload']);
    await verifyAppPage(appOwnerOf(request),sender);
    await readAppPageParent(api,appOwnerOf(request));
    fields(request.target,['tabId','frameId','documentId','expectedUrl','expectedWindowId']);
    invariant(request.target.frameId===0&&typeof request.operation==='string'&&
      /^[a-zA-Z][a-zA-Z0-9._-]{0,79}$/.test(request.operation),'E_SCHEMA','Invalid companion request');
    invariant(new TextEncoder().encode(canonical(request.payload)).byteLength<=32768,'E_LIMIT','Companion request too large');
    const row=await read(tx=>tx.get(PAGE_STORE,key(INSTALL_KEY_KIND,namespace,'app.'+request.toolId)));
    const executions=await read(tx=>tx.all(PAGE_STORE));
    const documentExecutions=executions.filter(value=>value?.tag==='page-execution-v1'&&value.programId===row.programId&&
      value.installationToken===row.token&&value.documentId===request.target.documentId&&value.tabId===request.target.tabId&&
      ['dispatched','completed'].includes(value.state));
    const matches=documentExecutions.filter(value=>value.browserSessionIncarnation===session);
    // A surviving page may retain a previous browser session's bridge. Never
    // reauthorize or re-execute it: a normal page reload establishes a new document.
    invariant(matches.length!==0||documentExecutions.length===0,'E_APP_PAGE_RELOAD_REQUIRED',
      'Page module belongs to an earlier browser session. Save your work, wait for ongoing actions to finish, then reload the webpage.');
    invariant(matches.length===1,'E_PAGE_AUTHORIZATION','No unique live companion execution');
    const execution=matches[0];
    await appExecution(row,execution.executionKey,execution.receiptNonce,request.target);
    let results;
    try{results=await (await nativeAPI()).execute({target:{tabId:request.target.tabId,documentIds:[request.target.documentId]},
      ...(row.pageRules.runAt==='document_end'?{injectImmediately:true}:{}),
      world:'USER_SCRIPT',worldId:execution.managedUI.worldId,
      js:[{code:appPageDispatchSource(execution.receiptNonce,request.operation,request.payload)}]});}
    catch(cause){throw new FoundationError(PAGE_UNKNOWN_ERROR,'Companion request outcome unknown; do not replay: '+String(cause.message||cause));}
    invariant(results?.length===1&&results[0].frameId===0&&results[0].documentId===request.target.documentId&&
      results[0].error===undefined,'E_EFFECT_UNKNOWN','Companion result unknown; do not replay');
    await appExecution(row,execution.executionKey,execution.receiptNonce,request.target);
    invariant(new TextEncoder().encode(canonical(results[0].result)).byteLength<=131072,'E_LIMIT','Companion result too large');
    return results[0].result;
  }
  return Object.freeze({prepareAppPage,importAppPage,verifyAppPage,synchronizeAppPages,requestAppPage,importPageInstallPackage,prepareScrollSitePackage,verifyPageCandidate,makePageAvailable,installPageProgram,setInstalledPageEnabled,uninstallPageProgram,
    listPagePrograms,runInstalledPageProgram,sendQueueOperation,readScrollSiteConfig,pickScrollSiteElement,observeScrollSitePage,saveScrollSiteRule,saveScrollNavigationSettings,recoverExecutions,reconcile,observeManagedCleanup,revokePermissions,handleBoot,
    assertPageTaskSource,assertPageTaskSourceInTransaction});
}
