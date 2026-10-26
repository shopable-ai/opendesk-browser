import {readNativeUserScripts} from './native-access.js';
import {validatePageInstallPackage} from './page-install-package.js';
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
import {buildScrollSiteUpgradePackage} from './scroll-site-upgrade.js';
import {SCROLL_CONFIG_PROGRAM_ID,SCROLL_CONFIG_MIN_REVISION,SCROLL_CONFIG_EMPTY,normalizeScrollConfig} from './scroll-config-contract.js';
import {pageProgramUrlMatches} from './page-program-rules.js';
import {PAGE_FRAME_ACTION} from './page-frame-runtime.js';
// Reuse exact literals within the fixed privileged bundle budget.
const PAGE_STORE="frameworkKV",
  PAGE_INSTALL_TAG="page-installed-v1",
  INSTALL_KEY_KIND="installed",
  PAGE_WRITE="readwrite",
  PAGE_PERMISSION_ERROR="E_PERMISSION",
  PAGE_UNKNOWN_ERROR="E_EFFECT_UNKNOWN",
  PAGE_REVISION_ERROR="E_REVISION";


export const PAGE_BOOT_PROTOCOL='opendesk.page-installed.boot.v1';
export const PAGE_BOOT_WORLD='opendesk-page-installed-bootstrap-v1';
const PREFIX='opendesk-page-boot-';
const ACCESS_CHANGED='访问受限，请检查安装并恢复访问';
const key=(kind,ns,...identity)=>'page-'+kind+':'+canonical([ns,...identity]);
const fields=(value,allowed,required=allowed)=>invariant(value&&typeof value==='object'&&!Array.isArray(value)&&
  Object.keys(value).every(k=>allowed.includes(k))&&required.every(k=>Object.hasOwn(value,k)),
  'E_SCHEMA','页面安装请求字段不完整或包含未知字段');
const identityFields=['builtinIdentity','candidateId','namespace','manifestHash','runtimeKind','entryFormat','programId','revision',
  'sourceHash','dependencyLockId','dependencyManifestDigest','approvedPageRules'];
const equal=(a,b)=>canonical(a)===canonical(b);
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
const publicInstall=row=>row?{programId:row.programId,revision:row.revision,manifestHash:row.manifestHash,
  title:row.title??row.programId,
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
export function createInstalledPagePrograms({api,storage,assertHost,dependencies,preview,admission,session,clock={now:()=>Date.now()},loadBuiltin=loadBuiltinPageSource}){
  const namespace='tool:'+api.runtime.id;
  let mutations=Promise.resolve(),executions=Promise.resolve();
  const removals=[];
  const permissionEpoch=row=>removals.filter(removed=>pageInstallAffectedByRemoval(row.pageRules,removed)).length;
  const active=row=>row?.enabled&&assertPageInstallAuthorization(row).status==='active';
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
    const compiled=await preparePageProgramRegistration({candidate,sourceUtf8:candidate.sourceUtf8,
      dependencyResolution:resolution,jqueryCode,frameworkSource,optionalSources,authority:{assertAvailable:async()=>({...identity(candidate),status:'Available',...proof,installationEnabled:true})}});
    invariant(compiled.allFrames===false,'E_PAGE_FRAME_SCOPE','本轮正式安装只支持顶层文档；请添加 @noframes');
    invariant(compiled.runAt==='document_idle','E_PAGE_RUN_AT','正式安装仅支持 @run-at document-idle；早期时序尚未验收');
    return {compiled,optionalSources,frameworkSource,jqueryCode};
  }
  async function descriptor(row,{legacy=false}={}){
    const {candidate,resolution}=await material(row.programId,row.revision),proof=await proofFor(candidate,{available:true});
    assertBuiltinIdentity(row.builtinIdentity,candidate.builtinIdentity);
    invariant(row.tag===PAGE_INSTALL_TAG&&row.namespace===namespace&&row.manifestHash===candidate.manifestHash&&
      row.sourceHash===candidate.manifest.sourceHash&&equal(row.pageRules,candidate.manifest.pageRules)&&/^[a-f0-9]{32}$/.test(row.token),
      'E_PAGE_INSTALLATION','安装记录不属于此固定版本');
    if(!legacy)assertPageInstallAuthorization(row);
    const {compiled}=await registration(candidate,resolution,proof);
    const nativeId=PREFIX+(await digest([namespace,row.programId])).slice(0,48);
    invariant(row.nativeId===nativeId,'E_PAGE_INSTALLATION','安装的原生注册身份已改变');
    const marker='__opendesk_page_boot_'+row.token;
    const message={protocol:PAGE_BOOT_PROTOCOL,nativeId,token:row.token};
    return {candidate,resolution,marker,script:{id:nativeId,matches:compiled.matches,excludeMatches:compiled.excludeMatches,
      runAt:compiled.runAt,allFrames:false,world:'USER_SCRIPT',worldId:PAGE_BOOT_WORLD,
      js:[{code:'const '+marker+' = '+JSON.stringify(row.token)+';\n'+
        'chrome.runtime.sendMessage('+JSON.stringify(message)+').catch(error=>console.error("[OpenDesk Page bootstrap]",error));'}]}};
  }
  async function importPageInstallPackage(request,sender){
    fields(request,['package','expectedInstalledManifestHash','expectedGeneration']);
    request=structuredClone(request);
    await scoped(sender,'readonly',()=>{});
    const pkg=await validatePageInstallPackage(request.package);
    const previous=await scoped(sender,'readonly',tx=>tx.get(PAGE_STORE,key(INSTALL_KEY_KIND,namespace,pkg.programId)));
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
      expectedInstalledManifestHash:request.expectedInstalledManifestHash,expectedGeneration:request.expectedGeneration,title:pkg.title},sender);
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
  async function installPageProgram(request,sender){
    request=structuredClone(request);
    fields(request,['programId','revision','manifestHash','expectedInstalledManifestHash','expectedGeneration','title'],
      ['programId','revision','manifestHash','expectedInstalledManifestHash']);
    invariant(request.title===undefined||(typeof request.title==='string'&&request.title.trim().length>0&&request.title.length<=100),
      'E_SCHEMA','工具名称需要 1–100 个字符');
    return ordered(async()=>{
      const {candidate}=await material(request.programId,request.revision);await proofFor(candidate,{available:true});
      invariant(candidate.manifestHash===request.manifestHash,PAGE_REVISION_ERROR,'安装必须引用固定版本');
      const previous=await read(tx=>tx.get(PAGE_STORE,key(INSTALL_KEY_KIND,namespace,request.programId)));
      invariant((previous?.manifestHash??null)===request.expectedInstalledManifestHash&&
        (!previous||request.expectedGeneration===(previous.authorization?.generation??null)),
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
      invariant(!previous?.managedCleanup||previous.managedCleanup.state==='retired',
        'E_PAGE_CLEANUP_PENDING','旧安装的受管界面清理尚未确认；请核对原网页后主动完成清理，不能覆盖恢复记录');
      const scope=pageInstallScope(candidate.manifest.pageRules,candidate.manifest.programId,candidate.manifest.revision),delta=pageInstallScopeDelta(previous?.authorization?.scope,scope);
      const row={tag:PAGE_INSTALL_TAG,namespace,programId:request.programId,revision:request.revision,
        title:request.title?.trim()??previous?.title??request.programId,
        manifestHash:candidate.manifestHash,sourceHash:candidate.manifest.sourceHash,builtinIdentity:candidate.builtinIdentity,pageRules:candidate.manifest.pageRules,enabled:previous?.enabled??true,
        token:crypto.randomUUID().replaceAll('-',''),nativeId:PREFIX+(await digest([namespace,request.programId])).slice(0,48),
        nativeState:'pending',error:null,installedAt:previous?.installedAt??clock.now(),
        authorization:{tag:'page-install-authorization-v1',installationId:previous?.authorization?.installationId??crypto.randomUUID(),
          generation:(previous?.authorization?.generation??0)+1,
          status:previous?.enabled===false?'disabled':'active',scope,
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
        invariant((old?.manifestHash??null)===request.expectedInstalledManifestHash&&old?.token===previous?.token,
          PAGE_REVISION_ERROR,'已安装版本在确认期间改变');
        invariant(permissionEpoch(row)===epoch,PAGE_PERMISSION_ERROR,ACCESS_CHANGED);
        await tx.put(PAGE_STORE,row,installKey);
      });
      await reconcileOne(row);
      return publicInstall(await read(tx=>tx.get(PAGE_STORE,key(INSTALL_KEY_KIND,namespace,row.programId))));
    });
  }
  async function setInstalledPageEnabled(request,sender){
    request=structuredClone(request);
    fields(request,['programId','manifestHash','enabled','expectedGeneration']);
    invariant(typeof request.enabled==='boolean','E_SCHEMA','启用状态必须是布尔值');
    return ordered(async()=>{
      let row;
      const previous=await read(tx=>tx.get(PAGE_STORE,key(INSTALL_KEY_KIND,namespace,request.programId)));
      invariant(previous?.tag===PAGE_INSTALL_TAG&&previous.manifestHash===request.manifestHash&&
        (previous.authorization?.generation??null)===request.expectedGeneration,PAGE_REVISION_ERROR,'安装授权已改变');
      // Restoring or enabling is explicit. Checking permissions cannot itself
      // restore a suspended installation or execute an old document.
      const epoch=permissionEpoch(previous);
      if(request.enabled){
        invariant(!previous?.managedCleanup||previous.managedCleanup.state==='retired',
          'E_PAGE_CLEANUP_PENDING','旧安装受管界面清理待确认，不能直接恢复执行');
        await descriptor(previous);
        invariant(await api.permissions.contains({origins:previous.pageRules.matches}),PAGE_PERMISSION_ERROR,ACCESS_CHANGED);
      }
      await scoped(sender,PAGE_WRITE,async tx=>{
        const installKey=key(INSTALL_KEY_KIND,namespace,request.programId),old=await tx.get(PAGE_STORE,installKey);
        invariant(old?.tag===PAGE_INSTALL_TAG&&old.manifestHash===request.manifestHash&&old.token===previous.token,
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
      // Managed UI retirement has a separate outcome: UNKNOWN is not
      // success. Preserve the disabled installation until the original
      // document is gone or the existing cleanup broker confirms retirement.
      invariant(!after.managedCleanup||after.managedCleanup.state==='retired',
        'E_PAGE_CLEANUP_PENDING','受管网页界面清理未确认；安装已停用，请刷新原网页后重新核对并主动卸载');
      await scoped(sender,PAGE_WRITE,async tx=>{
        const current=await tx.get(PAGE_STORE,installKey);
        invariant(current?.token===row.token&&current.nativeState==='disabled'&&
          current.authorization?.installationId===request.installationId&&
          current.authorization?.generation===row.authorization.generation,
          PAGE_REVISION_ERROR,'最终卸载时安装身份已改变');
        await tx.delete(PAGE_STORE,installKey);
      });
      invariant(!await read(tx=>tx.get(PAGE_STORE,installKey)),
        'E_PAGE_UNINSTALL_PENDING','安装记录删除后读回未确认，请重新核对');
      return {programId:row.programId,manifestHash:row.manifestHash,
        installationId:request.installationId,
        uninstalled:true,nativeState:'unregistered',livePagesNeedRefresh:true,
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
        scope:pageInstallScope(row.pageRules,row.programId,row.revision),approvedAt:row.installedAt};
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
    const rows=await read(async tx=>(await tx.all(PAGE_STORE)).filter(r=>r?.tag===PAGE_INSTALL_TAG&&r.namespace===namespace));
    if(!rows.length)return;
    for(const row of rows)await reconcileOne(await migrateLegacy(row));
  });}
  // Navigation/closure is a wake hint, never proof of document death (BFCache
  // may retain it). Recheck pending cleanup through the existing exact-document
  // broker without registering scripts, dispatching cleanup or restoring grants.
  async function observeManagedCleanup(details){return ordered(async()=>{
    if(!preview.retireInstalled)return;
    const rows=await read(tx=>tx.all(PAGE_STORE));
    const pending=rows.filter(row=>row?.tag===PAGE_INSTALL_TAG&&row.namespace===namespace&&
      row.managedCleanup?.state==='unknown'&&rows.some(execution=>execution?.tag==='page-execution-v1'&&
        execution.namespace===namespace&&execution.programId===row.programId&&
        execution.installationId===row.authorization?.installationId&&execution.tabId===details.tabId&&
        execution.grantGeneration<=row.authorization.generation&&execution.managedUI));
    for(const row of pending){
      const managedCleanup=await preview.retireInstalled(row,{
        includeCurrent:!active(row)||row.nativeState!=='registered',observeOnly:true});
      if(managedCleanup.state!=='retired')continue;
      await storage.transaction([PAGE_STORE],PAGE_WRITE,async tx=>{
        const installKey=key(INSTALL_KEY_KIND,namespace,row.programId),current=await tx.get(PAGE_STORE,installKey);
        if(current?.token===row.token&&current.authorization?.installationId===row.authorization.installationId&&
          current.authorization?.generation===row.authorization.generation&&current.managedCleanup?.state==='unknown')
          await tx.put(PAGE_STORE,{...current,managedCleanup},installKey);
      });
    }
  });}
  async function recoverExecutions(){
    // Called once at worker startup, never on a permission refresh while a
    // live invocation is running. An old pending dispatch must not be replayed.
    const pending=await read(async tx=>(await tx.all(PAGE_STORE)).filter(row=>row?.tag==='page-execution-v1'&&
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
      if(recovered?.receiptNonce&&contextGone)await admission.release({nonce:recovered.receiptNonce});
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
    const rows=await scoped(sender,'readonly',tx=>tx.all(PAGE_STORE));
    const revisions=rows.filter(item=>item?.tag==='page-candidate-v1'&&
      item.namespace===namespace&&item.manifest?.programId===SCROLL_CONFIG_PROGRAM_ID)
      .map(item=>item.manifest.revision);
    const revision=1+Math.max(row.revision,...revisions);
    const pkg=await buildScrollSiteUpgradePackage({installed:row,candidate,
      origin:request.origin,pathScope:request.pathScope,revision});
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
    let registered=new Set(),nativeError;
    try{registered=new Set((await readNativeUserScripts(api)).map(row=>row.id));}
    catch(error){nativeError={code:error.code,message:error.message};}
    return scoped(sender,'readonly',async tx=>{
      const rows=await tx.all(PAGE_STORE),installed=rows.filter(r=>r?.tag===PAGE_INSTALL_TAG&&r.namespace===namespace).map(row=>{
        // Readback only downgrades the public projection, never restores a
        // blocked grant or repairs registrations, source, locks or stored state.
        if(row.nativeState!=='registered')return row;
        if(!row.enabled)return {...row,nativeState:'disabled',error:null};
        const error=nativeError??(!registered.has(row.nativeId)
          ?{code:'E_PAGE_INSTALLATION',message:'原生注册不存在，请主动核对安装状态'}:null);
        return error?{...row,nativeState:'blocked',error}:row;
      });
      const catalog=rows.filter(r=>r?.tag==='page-candidate-v1'&&r.namespace===namespace).map(row=>{
        const proof=rows.find(p=>p?.tag==='page-verification-v1'&&p.namespace===namespace&&p.candidateId===row.candidateId&&p.manifestHash===row.manifestHash);
        return {candidateId:row.candidateId,programId:row.manifest.programId,revision:row.manifest.revision,
          manifestHash:row.manifestHash,sourceHash:row.manifest.sourceHash,pageRules:row.manifest.pageRules,
          entryFormat:row.manifest.entryFormat,sourceProfile:row.manifest.sourceProfile,
          dependencyLockId:row.manifest.dependencyLockId,
          stage:proof?.status??'Candidate',installed:publicInstall(installed.find(i=>i.programId===row.manifest.programId)),
          authorizationChange:pageInstallScopeDelta(installed.find(i=>i.programId===row.manifest.programId)?.authorization?.scope,
            pageInstallScope(row.manifest.pageRules,row.manifest.programId,row.manifest.revision))};
      });return {catalog,installed:installed.map(publicInstall)};
    });
  }
  async function boot(message,sender,source='page_auto',manualReceiptId=null,manualHostDocumentId=null){
    fields(message,['protocol','nativeId','token']);
    invariant(message.protocol===PAGE_BOOT_PROTOCOL&&sender?.id===api.runtime.id&&sender.frameId===0&&
      typeof sender.documentId==='string'&&Number.isSafeInteger(sender.tab?.id)&&!sender.tab.incognito,
      'E_OWNER','仅真实顶层 USER_SCRIPT 引导消息可触发安装脚本');
    const row=await read(async tx=>(await tx.all(PAGE_STORE)).find(r=>r?.tag===PAGE_INSTALL_TAG&&
      r.namespace===namespace&&r.nativeId===message.nativeId&&r.token===message.token&&r.enabled));
    invariant(row,PAGE_PERMISSION_ERROR,'页面脚本未安装、已停用或引导身份已过期');
    invariant(active(row),PAGE_PERMISSION_ERROR,ACCESS_CHANGED);
    const epoch=permissionEpoch(row),dependencyEpoch=removals.length;
    await requireSiteGrant(row);
    const desired=await descriptor(row),native=await nativeAPI();
    const compilationCurrent=()=>!desired.candidate.manifest.compilation||removals.length===dependencyEpoch;
    const tab=await api.tabs.get(sender.tab.id),frames=await api.webNavigation.getAllFrames({tabId:sender.tab.id});
    const frame=frames?.find(f=>f.frameId===0&&f.documentId===sender.documentId);
    invariant(frame&&!frame.errorOccurred&&(!frame.documentLifecycle||frame.documentLifecycle==='active')&&
      tab.url===frame.url&&sender.url===frame.url&&!tab.pendingUrl&&!tab.incognito,'E_DOCUMENT_STALE','自动执行文档已经改变');
    httpUrl(frame.url);
    // A pushState URL can change while the native document bootstrap marker survives.
    invariant(pageProgramUrlMatches(row.pageRules,frame.url),PAGE_PERMISSION_ERROR,
      '当前网页 URL 已离开安装范围或进入排除路径');
    const registered=await native.getScripts({ids:[row.nativeId]});
    invariant(registered.length===1&&nativeEqual(registered[0],desired.script),PAGE_PERMISSION_ERROR,'此安装的原生引导已经改变');
    // Automatic messages need Chrome's original matching bootstrap marker.
    // A separately authenticated Host click can target the already open page:
    // registration does not retroactively inject its bootstrap there. Its
    // current document, rules, grant and native descriptor are checked above;
    // it neither creates a marker nor replays the automatic bootstrap.
    if(source!=='manual'){
      const probe=await native.execute({target:{tabId:tab.id,documentIds:[frame.documentId]},world:'USER_SCRIPT',
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
      const count=(await tx.all(PAGE_STORE)).filter(r=>r?.tag==='page-execution-v1').length;
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
        invariant(!slot?.currentRunId&&slot?.preview?.nonce===receiptNonce&&slot.preview.executionKey===executionKey&&
          slot.preview.browserSessionIncarnation===session,'E_OWNER','最终派发前共享执行入口已经改变');
        await tx.put(PAGE_STORE,{...execution,state:'dispatched',dispatchedAt:clock.now()},executionKey);
      });
      // No asynchronous observation between committing dispatch and invoking
      // Chrome. Disable/replacement use this same queue. Do not hold it until
      // an async main or classic program finishes.
      invariant(permissionEpoch(row)===epoch&&compilationCurrent(),PAGE_PERMISSION_ERROR,ACCESS_CHANGED);
      const completion=Promise.resolve(invoke());completion.catch(()=>{});
      return {completion};
    });
    let result,error;
    try{result=await preview.executeInstalled({...desired,target:{tabId:tab.id,frameId:0,documentId:frame.documentId,
      expectedUrl:frame.url,expectedWindowId:tab.windowId},installation:{...row,executionKey}},authorize,dispatch);}
    catch(e){error={code:e.code||PAGE_UNKNOWN_ERROR,message:String(e.message||e),...(e.effectConfirmed?{effectConfirmed:true}:{}),
      ...(e.pageAccessLost?{pageAccessLost:true}:{})};}
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
    let held=false,dispatched=false,confirmed=false;
    const dispatch=invoke=>ordered(async()=>{
      const current=await authorize();
      const reservation=await admission.reserveInstalled({nonce:message.requestId,tabId:execution.tabId,
        documentId:execution.documentId,sourceHash:execution.sourceHash},
        {...current.grant,executionKey:execution.executionKey,receiptNonce:message.receiptNonce},{resource:true});
      held=reservation?.shared!==true;
      await storage.transaction([PAGE_STORE,'runs'],PAGE_WRITE,async tx=>{
        const grant=await tx.get(PAGE_STORE,key(INSTALL_KEY_KIND,namespace,execution.programId)),
          slot=await tx.get('runs','@slot');
        invariant(grant&&active(grant)&&grant.token===current.grant.token&&
          grant.authorization.generation===execution.grantGeneration&&removals.length===epoch,
          'E_PAGE_AUTHORIZATION','资源最终派发前原安装已改变');
        invariant(!slot?.currentRunId&&slot?.preview?.executionKey===execution.executionKey&&
          slot.preview.nonce===(held?message.requestId:message.receiptNonce),
          'E_OWNER','资源最终派发前共享入口已经改变');
      });
      // Same queue as disable/uninstall. No asynchronous observation between
      // this final epoch check and invoking Chrome; do not hold the queue while
      // an asynchronous resource completes or asks for retirement.
      invariant(removals.length===epoch,'E_PAGE_AUTHORIZATION','权限已撤销');
      dispatched=true;
      const completion=Promise.resolve(invoke());completion.catch(()=>{});
      return {completion};
    });
    // Retirement only observes destruction; it never reauthorizes source.
    const desired=message.operation==='retire'?{candidate:null}:await authorize();
    try{
      const result=await preview.executeFrame({message,sender,candidate:desired.candidate,execution},authorize,dispatch);
      confirmed=true;
      if(message.operation==='retire'&&result.state==='retired')await admission.release({nonce:message.requestId});
      return result;
    }finally{
      if(held&&(confirmed||!dispatched))await admission.release({nonce:message.requestId});
    }
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
        pageProgramUrlMatches(row.pageRules,frame.url),'E_DOCUMENT_STALE','网页已离开批准范围');
      const registered=await (await nativeAPI()).getScripts({ids:[row.nativeId]});
      invariant(registered.length===1&&nativeEqual(registered[0],desired.script),
        'E_PAGE_AUTHORIZATION','原生安装注册内容已经改变');
      invariant(permissionEpoch(row)===epoch,'E_PAGE_AUTHORIZATION',ACCESS_CHANGED);
      const configKey=key('config',namespace,message.programId);
      const snapshot=record=>({value:structuredClone(record?.value??SCROLL_CONFIG_EMPTY),etag:record?.etag??'0'});
      if(!isWrite){
        return snapshot(await read(tx=>tx.get(PAGE_STORE,configKey)));
      }
      invariant(typeof message.etag==='string'&&message.etag.length<=128,
        'E_CONFIG_SCHEMA','缺少配置的版本校验值');
      const value=normalizeScrollConfig(message.value);
      // Config is merely CSS data. A saved rule cannot enlarge frozen pageRules,
      // create an installation, change a grant or revive a disabled Program.
      for(const site of value.sites){
        invariant(pageProgramUrlMatches(row.pageRules,site.origin+site.pathScope),
          'E_PAGE_AUTHORIZATION','该网站未获安装或升级审阅授权');
      }
      const saved=await storage.transaction([PAGE_STORE],PAGE_WRITE,async tx=>{
        const current=await tx.get(PAGE_STORE,installKey);
        invariant(current?.token===row.token&&current.manifestHash===row.manifestHash&&
          current.authorization?.generation===row.authorization.generation&&active(current)&&
          permissionEpoch(row)===epoch,'E_PAGE_AUTHORIZATION','配置提交前安装权限已改变');
        const old=await tx.get(PAGE_STORE,configKey);
        if(old&&equal(old.value,value))return snapshot(old); // idempotent retry
        invariant((old?.etag??'0')===message.etag,'E_CONFIG_CONFLICT',
          '网站规则已被其他窗口修改；请重新读取后合并，草稿仍保留');
        const record={tag:'page-config-v1',namespace,programId:message.programId,
          etag:crypto.randomUUID(),value,updatedAt:clock.now()};
        await tx.put(PAGE_STORE,record,configKey);
        return snapshot(record);
      });
      const confirmed=await read(tx=>tx.get(PAGE_STORE,configKey));
      invariant(confirmed?.etag===saved.etag&&equal(confirmed.value,saved.value),
        'E_CONFIG_UNKNOWN','配置写入后的持久化读回未知；不得当作成功');
      return saved;
    });
  }
  function handleBoot(message,sender,source='page_auto',manualReceiptId=null,manualHostDocumentId=null){
    if(message?.action==='page-config')return handlePageConfig(message,sender);
    if(message?.action===PAGE_FRAME_ACTION)return frameBoot(message,sender);
    const next=executions.then(()=>boot(message,sender,source,manualReceiptId,manualHostDocumentId)).catch(async error=>{
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
    });executions=next.catch(()=>{});return next;
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
  return Object.freeze({importPageInstallPackage,prepareScrollSitePackage,verifyPageCandidate,makePageAvailable,installPageProgram,setInstalledPageEnabled,uninstallPageProgram,
    listPagePrograms,runInstalledPageProgram,recoverExecutions,reconcile,observeManagedCleanup,revokePermissions,handleBoot});
}
