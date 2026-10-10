import {canonical,digest,invariant,FoundationError} from '../../platform/protocol.js';
import {preparePageProgramRegistration} from './page-program-package.js';
import {httpUrl} from '../../environment.js';
import {PAGE_WORLD_CSP} from './execution-source.js';
import {pageInstallScope,pageInstallScopeDelta,assertPageInstallAuthorization,pageInstallAffectedByRemoval} from './page-install-authorization.js';

export const PAGE_BOOT_PROTOCOL='opendesk.page-installed.boot.v1';
export const PAGE_BOOT_WORLD='opendesk-page-installed-bootstrap-v1';
const PREFIX='opendesk-page-boot-';
const key=(kind,ns,...identity)=>'page-'+kind+':'+canonical([ns,...identity]);
const fields=(value,allowed,required=allowed)=>invariant(value&&typeof value==='object'&&!Array.isArray(value)&&
  Object.keys(value).every(k=>allowed.includes(k))&&required.every(k=>Object.hasOwn(value,k)),
  'E_SCHEMA','页面安装请求字段不完整或包含未知字段');
const identityFields=['candidateId','namespace','manifestHash','runtimeKind','entryFormat','programId','revision',
  'sourceHash','dependencyLockId','dependencyManifestDigest','approvedPageRules'];
const equal=(a,b)=>canonical(a)===canonical(b);
function identity(candidate){
  const m=candidate.manifest;
  return {candidateId:candidate.candidateId,namespace:candidate.namespace,manifestHash:candidate.manifestHash,
    runtimeKind:m.runtimeKind,entryFormat:m.entryFormat,programId:m.programId,revision:m.revision,
    sourceHash:m.sourceHash,dependencyLockId:m.dependencyLockId,dependencyManifestDigest:m.dependencyManifestDigest,
    approvedPageRules:m.pageRules};
}
const publicInstall=row=>row?{programId:row.programId,revision:row.revision,manifestHash:row.manifestHash,
  sourceHash:row.sourceHash,pageRules:row.pageRules,enabled:row.enabled,nativeId:row.nativeId,nativeState:row.nativeState,
  authorization:row.authorization?structuredClone(row.authorization):null,
  error:row.error,lastExecution:row.lastExecution?publicExecution(row.lastExecution):null}:null;
function publicExecution(row){const {installationToken,...receipt}=row;return receipt;}

// One installed-program consumer of the existing DB, Host authority, compiler,
// USER_SCRIPT evaluator and shared execution slot. The registered code below
// contains no user source. A less-trusted message can only request its exact
// persisted installation; it cannot call any Host/SDK/Controller operation.
export function createInstalledPagePrograms({api,storage,assertHost,dependencies,preview,admission,session,clock={now:()=>Date.now()}}){
  const namespace='tool:'+api.runtime.id;
  let mutations=Promise.resolve(),executions=Promise.resolve();
  const removals=[];
  const permissionEpoch=row=>removals.filter(removed=>pageInstallAffectedByRemoval(row.pageRules,removed)).length;
  const active=row=>row?.enabled&&assertPageInstallAuthorization(row).status==='active';
  const ordered=work=>{const next=mutations.then(work,work);mutations=next.catch(()=>{});return next;};
  const read=work=>storage.transaction(['frameworkKV'],'readonly',work);
  async function scoped(sender,mode,work){
    const host=await assertHost(sender);
    invariant(host.namespace===namespace,'E_OWNER','安装属于其他扩展');
    return storage.transaction(['frameworkKV','commandJournal'],mode,async tx=>{
      const current=await tx.get('commandJournal','host:'+host.registrationId);
      invariant(current?.active&&!current.revoked&&['hostDocumentId','hostInstanceId','browserSessionIncarnation','hostUrl']
        .every(k=>current[k]===host[k]),'E_OWNER','安装操作的工具宿主已失效');
      return work(tx,host);
    });
  }
  async function nativeAPI(){
    try{const native=api.userScripts;await native.getScripts();return native;}
    catch{throw new FoundationError('E_USER_SCRIPTS_UNAVAILABLE','请开启扩展的「允许用户脚本」后重新核对安装状态');}
  }
  async function requireSiteGrant(row){
    if(await api.permissions.contains({origins:row.pageRules.matches})!==true)
      throw Object.assign(new FoundationError('E_PERMISSION','网站权限已撤销，请主动恢复访问'),{pageAccessLost:true});
  }
  async function material(programId,revision){
    return dependencies.readStoredPageCandidate(namespace,programId,revision);
  }
  async function proofFor(candidate,{available=false}={}){
    const proof=await read(tx=>tx.get('frameworkKV',key('verification',namespace,candidate.manifest.programId,candidate.manifest.revision)));
    invariant(proof?.tag==='page-verification-v1'&&['Verified','Available'].includes(proof.status)&&
      identityFields.every(k=>equal(proof[k],identity(candidate)[k]))&&
      proof.receipt?.state==='preview-evaluated'&&proof.receipt.world==='USER_SCRIPT'&&
      proof.receipt.sourceHash===candidate.manifest.sourceHash&&typeof proof.receipt.documentId==='string'&&
      proof.receiptHash===await digest(proof.receipt),'E_PAGE_VERIFICATION','缺少此固定 Page 版本的真实验证回执');
    invariant(!available||proof.status==='Available','E_NOT_AVAILABLE','请先将验证版本设为本机可安装');
    return proof;
  }
  async function descriptor(row,{legacy=false}={}){
    const {candidate,resolution}=await material(row.programId,row.revision),proof=await proofFor(candidate,{available:true});
    invariant(row.tag==='page-installed-v1'&&row.namespace===namespace&&row.manifestHash===candidate.manifestHash&&
      row.sourceHash===candidate.manifest.sourceHash&&equal(row.pageRules,candidate.manifest.pageRules)&&/^[a-f0-9]{32}$/.test(row.token),
      'E_PAGE_INSTALLATION','安装记录不属于此固定版本');
    if(!legacy)assertPageInstallAuthorization(row);
    const compiled=await preparePageProgramRegistration({candidate,sourceUtf8:candidate.sourceUtf8,
      dependencyResolution:resolution,authority:{assertAvailable:async()=>({...proof,installationEnabled:true})}});
    invariant(compiled.allFrames===false,'E_PAGE_FRAME_SCOPE','本轮正式安装只支持顶层文档；请添加 @noframes');
    invariant(compiled.runAt==='document_idle','E_PAGE_RUN_AT','正式安装仅支持 @run-at document-idle；早期时序尚未验收');
    const nativeId=PREFIX+(await digest([namespace,row.programId])).slice(0,48);
    invariant(row.nativeId===nativeId,'E_PAGE_INSTALLATION','安装的原生注册身份已改变');
    const marker='__opendesk_page_boot_'+row.token;
    const message={protocol:PAGE_BOOT_PROTOCOL,nativeId,token:row.token};
    return {candidate,resolution,marker,script:{id:nativeId,matches:compiled.matches,excludeMatches:compiled.excludeMatches,
      runAt:compiled.runAt,allFrames:false,world:'USER_SCRIPT',worldId:PAGE_BOOT_WORLD,
      js:[{code:'const '+marker+' = '+JSON.stringify(row.token)+';\n'+
        'chrome.runtime.sendMessage('+JSON.stringify(message)+').catch(error=>console.error("[OpenDesk Page bootstrap]",error));'}]}};
  }
  async function verifyPageCandidate(request,sender){
    fields(request,['programId','revision','target']);
    await scoped(sender,'readonly',()=>{});
    const {candidate}=await material(request.programId,request.revision);
    const m=candidate.manifest;
    const existing=await read(tx=>tx.get('frameworkKV',key('verification',namespace,m.programId,m.revision)));
    if(existing){const proof=await proofFor(candidate);return {stage:proof.status,manifestHash:candidate.manifestHash,receipt:proof.receipt};}
    // The exact frozen source is executed again by an explicit user action.
    // A preview before generated @match metadata cannot verify this new hash.
    const receipt=await preview.preview({sourceUtf8:candidate.sourceUtf8,entryFormat:m.entryFormat,
      importSourceUrl:m.sourceProfile.importSourceUrl,lockId:m.dependencyLockId,target:request.target},sender);
    invariant(receipt.state==='preview-evaluated'&&receipt.sourceHash===m.sourceHash&&receipt.world==='USER_SCRIPT',
      'E_PAGE_VERIFICATION','Page 类型验证身份不一致');
    const proof={tag:'page-verification-v1',...identity(candidate),status:'Verified',
      receipt,receiptHash:await digest(receipt),verifiedAt:clock.now()};
    return scoped(sender,'readwrite',async tx=>{
      const proofKey=key('verification',namespace,m.programId,m.revision),old=await tx.get('frameworkKV',proofKey);
      if(old){invariant(identityFields.every(k=>equal(old[k],proof[k])),'E_REVISION','验证身份已改变');return {stage:old.status,manifestHash:candidate.manifestHash};}
      await tx.put('frameworkKV',proof,proofKey);
      return {stage:'Verified',manifestHash:candidate.manifestHash,receipt};
    });
  }
  async function makePageAvailable(request,sender){
    fields(request,['programId','revision','manifestHash']);
    const {candidate}=await material(request.programId,request.revision),proof=await proofFor(candidate);
    invariant(candidate.manifestHash===request.manifestHash,'E_REVISION','冻结版本已改变');
    return scoped(sender,'readwrite',async tx=>{
      const proofKey=key('verification',namespace,request.programId,request.revision),current=await tx.get('frameworkKV',proofKey);
      invariant(current?.receiptHash===proof.receiptHash,'E_REVISION','验证版本已改变');
      await tx.put('frameworkKV',{...current,status:'Available'},proofKey);
      return {stage:'Available',manifestHash:candidate.manifestHash};
    });
  }
  async function installPageProgram(request,sender){
    request=structuredClone(request);
    fields(request,['programId','revision','manifestHash','expectedInstalledManifestHash','expectedGeneration'],
      ['programId','revision','manifestHash','expectedInstalledManifestHash']);
    return ordered(async()=>{
      const {candidate}=await material(request.programId,request.revision);await proofFor(candidate,{available:true});
      invariant(candidate.manifestHash===request.manifestHash,'E_REVISION','安装必须引用固定版本');
      const previous=await read(tx=>tx.get('frameworkKV',key('installed',namespace,request.programId)));
      invariant((previous?.manifestHash??null)===request.expectedInstalledManifestHash&&
        (!previous||request.expectedGeneration===(previous.authorization?.generation??null)),
        'E_REVISION','安装授权在确认期间改变；请刷新后核对');
      if(previous?.authorization)assertPageInstallAuthorization(previous);
      const scope=pageInstallScope(candidate.manifest.pageRules),delta=pageInstallScopeDelta(previous?.authorization?.scope,scope);
      const row={tag:'page-installed-v1',namespace,programId:request.programId,revision:request.revision,
        manifestHash:candidate.manifestHash,sourceHash:candidate.manifest.sourceHash,pageRules:candidate.manifest.pageRules,enabled:true,
        token:crypto.randomUUID().replaceAll('-',''),nativeId:PREFIX+(await digest([namespace,request.programId])).slice(0,48),
        nativeState:'pending',error:null,installedAt:previous?.installedAt??clock.now(),
        authorization:{tag:'page-install-authorization-v1',installationId:previous?.authorization?.installationId??crypto.randomUUID(),
          generation:(previous?.authorization?.generation??0)+1,status:'active',scope,
          approvedAt:delta.requiresConfirmation?clock.now():previous.authorization.approvedAt}};
      const epoch=permissionEpoch(row);
      const desired=await descriptor(row);
      invariant(await api.permissions.contains({origins:desired.script.matches}),'E_PERMISSION','安装的网站范围尚未获得授权');
      await scoped(sender,'readwrite',async tx=>{
        const installKey=key('installed',namespace,row.programId),old=await tx.get('frameworkKV',installKey);
        invariant((old?.manifestHash??null)===request.expectedInstalledManifestHash&&old?.token===previous?.token,
          'E_REVISION','已安装版本在确认期间改变');
        invariant(permissionEpoch(row)===epoch,'E_PERMISSION','安装确认期间权限已撤销，请主动恢复访问');
        await tx.put('frameworkKV',row,installKey);
      });
      await reconcileOne(row);
      return publicInstall(await read(tx=>tx.get('frameworkKV',key('installed',namespace,row.programId))));
    });
  }
  async function setInstalledPageEnabled(request,sender){
    request=structuredClone(request);
    fields(request,['programId','manifestHash','enabled','expectedGeneration']);
    invariant(typeof request.enabled==='boolean','E_SCHEMA','启用状态必须是布尔值');
    return ordered(async()=>{
      let row;
      const previous=await read(tx=>tx.get('frameworkKV',key('installed',namespace,request.programId)));
      invariant(previous?.tag==='page-installed-v1'&&previous.manifestHash===request.manifestHash&&
        (previous.authorization?.generation??null)===request.expectedGeneration,'E_REVISION','安装授权已改变');
      // Restoring or enabling is explicit. Checking permissions cannot itself
      // restore a suspended installation or execute an old document.
      const epoch=permissionEpoch(previous);
      if(request.enabled){
        await descriptor(previous);
        invariant(await api.permissions.contains({origins:previous.pageRules.matches}),'E_PERMISSION','访问受限，请先恢复此程序的网站访问');
      }
      await scoped(sender,'readwrite',async tx=>{
        const installKey=key('installed',namespace,request.programId),old=await tx.get('frameworkKV',installKey);
        invariant(old?.tag==='page-installed-v1'&&old.manifestHash===request.manifestHash&&old.token===previous.token,
          'E_REVISION','安装身份已改变');
        if(request.enabled)invariant(permissionEpoch(old)===epoch,'E_PERMISSION','恢复期间权限再次改变');
        const authorization=assertPageInstallAuthorization(old);
        row={...old,enabled:request.enabled,token:crypto.randomUUID().replaceAll('-',''),nativeState:'pending',error:null,
          authorization:{...authorization,generation:authorization.generation+1,status:request.enabled?'active':'disabled'}};
        await tx.put('frameworkKV',row,installKey);
      });
      await reconcileOne(row);
      return publicInstall(await read(tx=>tx.get('frameworkKV',key('installed',namespace,row.programId))));
    });
  }
  function nativeEqual(actual,expected){return actual&&['id','matches','excludeMatches','runAt','allFrames','world','worldId','js']
    .every(k=>equal(actual[k]??(k==='excludeMatches'?[]:null),expected[k]));}
  async function reconcileOne(row){
    let state='blocked',error=null;
    try{
      const native=await nativeAPI(),existing=await native.getScripts({ids:[row.nativeId]});
      if(!active(row)){if(existing.length)await native.unregister({ids:[row.nativeId]});
        invariant((await native.getScripts({ids:[row.nativeId]})).length===0,'E_EFFECT_UNKNOWN','原生注册撤销尚未确认');
        state=row.enabled?'blocked':'disabled';error=row.enabled?row.error??{code:'E_PERMISSION',message:'访问受限，请主动恢复访问'}:null;}
      else{
        const epoch=permissionEpoch(row);
        const desired=await descriptor(row);
        invariant(await api.permissions.contains({origins:desired.script.matches}),'E_PERMISSION','原网站权限已撤销');
        await native.configureWorld({worldId:PAGE_BOOT_WORLD,csp:PAGE_WORLD_CSP,messaging:true});
        invariant(permissionEpoch(row)===epoch,'E_PERMISSION','注册期间权限已撤销');
        if(!nativeEqual(existing[0],desired.script)){
          if(existing.length)await native.unregister({ids:[row.nativeId]});
          await native.register([desired.script]);
        }
        const actual=await native.getScripts({ids:[row.nativeId]});
        invariant(permissionEpoch(row)===epoch,'E_PERMISSION','注册期间权限已撤销');
        invariant(actual.length===1&&nativeEqual(actual[0],desired.script),'E_EFFECT_UNKNOWN','原生注册内容尚未确认');state='registered';
      }
    }catch(e){error={code:e.code||'E_EFFECT_UNKNOWN',message:String(e.message||e)};
      // Revoke a stale native bootstrap where possible. The message admission
      // independently checks the persistent grant and frozen proof each time.
      try{const native=await nativeAPI();await native.unregister({ids:[row.nativeId]});}catch{ /* Keep blocked/unknown visible. */ }
    }
    await storage.transaction(['frameworkKV'],'readwrite',async tx=>{
      const installKey=key('installed',namespace,row.programId),current=await tx.get('frameworkKV',installKey);
      if(current?.token===row.token&&current.enabled===row.enabled){
        const suspend=current.authorization?.status==='active'&&
          ['E_PERMISSION','E_USER_SCRIPTS_UNAVAILABLE','E_PAGE_AUTHORIZATION'].includes(error?.code);
        await tx.put('frameworkKV',{...current,nativeState:state,error,...(suspend?{
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
      const granted=await api.permissions.contains({origins:row.pageRules.matches});
      const status=!row.enabled?'disabled':granted&&row.nativeState==='registered'&&!row.error?'active':'suspended';
      authorization={tag:'page-install-authorization-v1',installationId:crypto.randomUUID(),generation:1,status,
        scope:pageInstallScope(row.pageRules),approvedAt:row.installedAt};
      if(status==='suspended')error={code:'E_PERMISSION',message:'原安装访问受限，请主动恢复访问'};
    }catch(cause){error={code:cause.code||'E_PAGE_AUTHORIZATION',message:'旧安装无法验证，请重新核对并安装固定版本'};}
    const next={...row,authorization,nativeState:authorization?.status==='active'?row.nativeState:'blocked',error,
      ...(authorization?.status==='active'?{}:{token:crypto.randomUUID().replaceAll('-','')})};
    await storage.transaction(['frameworkKV'],'readwrite',tx=>tx.put('frameworkKV',next,key('installed',namespace,row.programId)));
    return next;
  }
  function revokePermissions(removed){
    const snapshot=structuredClone(removed);
    removals.push(snapshot); // Synchronous dispatch fence, before any DB await.
    return ordered(async()=>{
      const changed=await storage.transaction(['frameworkKV'],'readwrite',async tx=>{
        const rows=(await tx.all('frameworkKV')).filter(row=>row?.tag==='page-installed-v1'&&row.namespace===namespace&&
          row.authorization?.status==='active'&&pageInstallAffectedByRemoval(row.pageRules,snapshot));
        for(const row of rows){
          row.token=crypto.randomUUID().replaceAll('-','');
          row.authorization={...row.authorization,generation:row.authorization.generation+1,status:'suspended'};
          row.nativeState='blocked';row.error={code:'E_PERMISSION',message:'访问已撤销，请主动恢复访问'};
          await tx.put('frameworkKV',row,key('installed',namespace,row.programId));
        }return rows;
      });
      for(const row of changed)await reconcileOne(row);
    });
  }
  async function reconcile(){return ordered(async()=>{
    const rows=await read(async tx=>(await tx.all('frameworkKV')).filter(r=>r?.tag==='page-installed-v1'&&r.namespace===namespace));
    if(!rows.length)return;
    for(const row of rows)await reconcileOne(await migrateLegacy(row));
  });}
  async function recoverExecutions(){
    // Called once at worker startup, never on a permission refresh while a
    // live invocation is running. An old pending dispatch must not be replayed.
    const pending=await read(async tx=>(await tx.all('frameworkKV')).filter(row=>row?.tag==='page-execution-v1'&&
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
      const recovered=await storage.transaction(['frameworkKV'],'readwrite',async tx=>{
        const current=await tx.get('frameworkKV',row.executionKey);
        if(!current||!['prepared','dispatched','outcome-unknown'].includes(current.state))return null;
        const completed={...current,state:'outcome-unknown',error:{code:'E_EFFECT_UNKNOWN',
          message:'执行期间后台中断；原效果未知，不自动重放'},result:null,finishedAt:current.finishedAt??clock.now(),
          contextGone:current.contextGone||contextGone};
        await tx.put('frameworkKV',completed,row.executionKey);
        const installKey=key('installed',namespace,row.programId),installed=await tx.get('frameworkKV',installKey);
        if(installed?.token===row.installationToken&&(!installed.lastExecution||installed.lastExecution.createdAt<=row.createdAt))
          await tx.put('frameworkKV',{...installed,lastExecution:completed},installKey);
        return completed;
      });
      // Only a trusted exact-document absence releases the original reservation.
      // A live or cached unknown context fences
      // the shared Controller/Page slot; changing installations cannot free it.
      if(recovered?.receiptNonce&&contextGone)await admission.release({nonce:recovered.receiptNonce});
    }
  }
  async function listPagePrograms(request,sender){
    fields(request,[]);
    return scoped(sender,'readonly',async tx=>{
      const rows=await tx.all('frameworkKV'),installed=rows.filter(r=>r?.tag==='page-installed-v1'&&r.namespace===namespace);
      const catalog=rows.filter(r=>r?.tag==='page-candidate-v1'&&r.namespace===namespace).map(row=>{
        const proof=rows.find(p=>p?.tag==='page-verification-v1'&&p.namespace===namespace&&p.candidateId===row.candidateId&&p.manifestHash===row.manifestHash);
        return {candidateId:row.candidateId,programId:row.manifest.programId,revision:row.manifest.revision,
          manifestHash:row.manifestHash,sourceHash:row.manifest.sourceHash,pageRules:row.manifest.pageRules,
          stage:proof?.status??'Candidate',installed:publicInstall(installed.find(i=>i.programId===row.manifest.programId)),
          authorizationChange:pageInstallScopeDelta(installed.find(i=>i.programId===row.manifest.programId)?.authorization?.scope,
            pageInstallScope(row.manifest.pageRules))};
      });return {catalog,installed:installed.map(publicInstall)};
    });
  }
  async function boot(message,sender){
    fields(message,['protocol','nativeId','token']);
    invariant(message.protocol===PAGE_BOOT_PROTOCOL&&sender?.id===api.runtime.id&&sender.frameId===0&&
      typeof sender.documentId==='string'&&Number.isSafeInteger(sender.tab?.id)&&!sender.tab.incognito,
      'E_OWNER','仅真实顶层 USER_SCRIPT 引导消息可触发安装脚本');
    const row=await read(async tx=>(await tx.all('frameworkKV')).find(r=>r?.tag==='page-installed-v1'&&
      r.namespace===namespace&&r.nativeId===message.nativeId&&r.token===message.token&&r.enabled));
    invariant(row,'E_PERMISSION','页面脚本未安装、已停用或引导身份已过期');
    invariant(active(row),'E_PERMISSION','程序访问受限，请主动恢复访问');
    const epoch=permissionEpoch(row);
    await requireSiteGrant(row);
    const desired=await descriptor(row),native=await nativeAPI();
    const tab=await api.tabs.get(sender.tab.id),frames=await api.webNavigation.getAllFrames({tabId:sender.tab.id});
    const frame=frames?.find(f=>f.frameId===0&&f.documentId===sender.documentId);
    invariant(frame&&!frame.errorOccurred&&(!frame.documentLifecycle||frame.documentLifecycle==='active')&&
      tab.url===frame.url&&sender.url===frame.url&&!tab.pendingUrl&&!tab.incognito,'E_DOCUMENT_STALE','自动执行文档已经改变');
    httpUrl(frame.url);
    const registered=await native.getScripts({ids:[row.nativeId]});
    invariant(registered.length===1&&nativeEqual(registered[0],desired.script),'E_PERMISSION','此安装的原生引导已经改变');
    // The random global lexical marker proves Chrome injected THIS bootstrap
    // in THIS document according to native match/exclude rules. Payloads cannot
    // choose a URL, provide code, grant permissions, or invent a document ack.
    const probe=await native.execute({target:{tabId:tab.id,documentIds:[frame.documentId]},world:'USER_SCRIPT',
      worldId:PAGE_BOOT_WORLD,js:[{code:'typeof '+desired.marker+' === "string" ? '+desired.marker+' : null'}]});
    invariant(probe.length===1&&probe[0]?.frameId===0&&probe[0]?.documentId===frame.documentId&&
      probe[0].error===undefined&&probe[0].result===row.token,'E_PERMISSION','缺少匹配文档的真实安装引导标记');
    const executionKey=key('execution',namespace,row.manifestHash,frame.documentId),receiptId=crypto.randomUUID();
    const admitted=await storage.transaction(['frameworkKV'],'readwrite',async tx=>{
      const current=await tx.get('frameworkKV',key('installed',namespace,row.programId));
      invariant(current&&active(current)&&current.token===row.token&&permissionEpoch(row)===epoch,'E_PERMISSION','准入前脚本已停用或撤权');
      const previous=await tx.get('frameworkKV',executionKey);
      if(previous)return false;
      const count=(await tx.all('frameworkKV')).filter(r=>r?.tag==='page-execution-v1').length;
      invariant(count<4096,'E_QUOTA','页面执行回执已达上限；保留原始证据后再维护');
      await tx.put('frameworkKV',{tag:'page-execution-v1',namespace,receiptId,programId:row.programId,
        revision:row.revision,manifestHash:row.manifestHash,sourceHash:row.sourceHash,
        installationToken:row.token,installationId:row.authorization.installationId,grantGeneration:row.authorization.generation,
        executionKey,browserSessionIncarnation:session,
        tabId:tab.id,documentId:frame.documentId,state:'prepared',createdAt:clock.now()},executionKey);return true;
    });
    invariant(admitted,'E_REQUEST_CONFLICT','此固定版本已在本 document 准入；不会自动重放');
    const authorize=async()=>{
      const current=await read(tx=>tx.get('frameworkKV',key('installed',namespace,row.programId)));
      invariant(current&&active(current)&&current.token===row.token&&current.manifestHash===row.manifestHash&&
        permissionEpoch(row)===epoch,'E_PERMISSION','安装已停用、撤权或版本已改变');
      await requireSiteGrant(row);
      await proofFor(desired.candidate,{available:true});
      const latest=await read(tx=>tx.get('frameworkKV',key('installed',namespace,row.programId)));
      invariant(latest&&active(latest)&&latest.token===row.token&&permissionEpoch(row)===epoch,
        'E_PERMISSION','权限检查期间安装授权已改变');
    };
    const dispatch=(receiptNonce,invoke)=>ordered(async()=>{
      await authorize();
      await storage.transaction(['frameworkKV','runs'],'readwrite',async tx=>{
        const grant=await tx.get('frameworkKV',key('installed',namespace,row.programId)),execution=await tx.get('frameworkKV',executionKey);
        invariant(grant&&active(grant)&&grant.token===row.token&&grant.manifestHash===row.manifestHash&&permissionEpoch(row)===epoch&&
          execution?.state==='prepared'&&execution.receiptNonce===receiptNonce&&execution.browserSessionIncarnation===session,
          'E_PERMISSION','最终派发前脚本已停用或执行身份已改变');
        const slot=await tx.get('runs','@slot');
        invariant(!slot?.currentRunId&&slot?.preview?.nonce===receiptNonce&&slot.preview.executionKey===executionKey&&
          slot.preview.browserSessionIncarnation===session,'E_OWNER','最终派发前共享执行入口已经改变');
        await tx.put('frameworkKV',{...execution,state:'dispatched',dispatchedAt:clock.now()},executionKey);
      });
      // No asynchronous observation between committing dispatch and invoking
      // Chrome. Disable/replacement use this same queue. Do not hold it until
      // an async main or classic program finishes.
      invariant(permissionEpoch(row)===epoch,'E_PERMISSION','原生派发前权限已撤销');
      const completion=Promise.resolve(invoke());completion.catch(()=>{});
      return {completion};
    });
    let result,error;
    try{result=await preview.executeInstalled({...desired,target:{tabId:tab.id,frameId:0,documentId:frame.documentId,
      expectedUrl:frame.url,expectedWindowId:tab.windowId},installation:{...row,executionKey}},authorize,dispatch);}
    catch(e){error={code:e.code||'E_EFFECT_UNKNOWN',message:String(e.message||e),...(e.effectConfirmed?{effectConfirmed:true}:{}),
      ...(e.pageAccessLost?{pageAccessLost:true}:{})};}
    await storage.transaction(['frameworkKV'],'readwrite',async tx=>{
      const installKey=key('installed',namespace,row.programId),current=await tx.get('frameworkKV',installKey);
      if(!error&&(!current||!active(current)||current.token!==row.token||permissionEpoch(row)!==epoch))
        error={code:'E_PERMISSION',message:'原网页执行已完成，但安装授权已改变；不交付旧授权的成功结果',effectConfirmed:true};
      const execution=await tx.get('frameworkKV',executionKey),completed={...execution,
        state:error?(error.code==='E_EFFECT_UNKNOWN'?'outcome-unknown':'failed'):'completed',
        result:error?null:result??null,error:error??null,effectConfirmed:!!result||error?.effectConfirmed===true,finishedAt:clock.now()};
      await tx.put('frameworkKV',completed,executionKey);
      if(current?.token===row.token)await tx.put('frameworkKV',{...current,lastExecution:completed},installKey);
    });
    if(error)throw Object.assign(new FoundationError(error.code,error.message),error.pageAccessLost?{pageAccessLost:true}:{});
    return {receiptId,state:'completed'};
  }
  function handleBoot(message,sender){
    const next=executions.then(()=>boot(message,sender)).catch(async error=>{
      // Chrome's User Scripts toggle does not necessarily emit permissions
      // onRemoved. A real access failure must durably suspend this installation
      // too. Forged markers, stale documents and ordinary source errors cannot
      // revoke another program. Do not re-enter this queue from reconcileOne.
      if(error.code==='E_USER_SCRIPTS_UNAVAILABLE'||error.pageAccessLost===true)await ordered(async()=>{
        const changed=await storage.transaction(['frameworkKV'],'readwrite',async tx=>{
          const row=(await tx.all('frameworkKV')).find(value=>value?.tag==='page-installed-v1'&&value.namespace===namespace&&
            value.nativeId===message.nativeId&&value.token===message.token&&value.authorization?.status==='active');
          if(!row)return null;
          const revoked={...row,token:crypto.randomUUID().replaceAll('-',''),nativeState:'blocked',
            error:{code:error.code,message:'访问权限或执行环境已改变，请主动恢复访问'},
            authorization:{...row.authorization,generation:row.authorization.generation+1,status:'suspended'}};
          await tx.put('frameworkKV',revoked,key('installed',namespace,row.programId));return revoked;
        });
        if(changed)await reconcileOne(changed);
      });
      throw error;
    });executions=next.catch(()=>{});return next;
  }
  return Object.freeze({verifyPageCandidate,makePageAvailable,installPageProgram,setInstalledPageEnabled,
    listPagePrograms,recoverExecutions,reconcile,revokePermissions,handleBoot});
}
