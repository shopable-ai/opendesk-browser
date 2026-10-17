// Thin Developer UI bridge for the existing Page / Task installation authorities.
// The only persistent installed state is still the original Page or Task registry.
import {createChromePermissionConsent} from '../platform/chrome/permission-gate.js';
import {permissionPattern} from '../environment.js';
import {prepareLocalProjectInstallation,assertLocalInstallVersion,assertLocalInstallTitle,
  commitLocalProjectInstallation,readLocalInstallOutcome,sourceContract,
  localProjectInstallId,getInstalledLocalProject} from './local-project-install.js';

const hash=/^[a-f0-9]{64}$/;
const issue=(code,message)=>Object.assign(new Error(message),{code});
export function createLocalInstallUI({client,api,doc,currentPageTarget,getProject,readControllerRun,isBusy=()=>false,retireManagedPreview,onState=()=>{}}){
  const find=id=>doc.getElementById(id);
  const panel=find('local-install-review'),summary=find('local-install-summary'),
    title=find('local-install-title'),version=find('local-install-version'),
    warning=find('local-install-warning'),status=find('local-install-status'),
    confirmButton=find('local-install-confirm'),cancelButton=find('local-install-cancel');
  let verified=null,review=null,preparing=false,installing=false,unknown=false,installed=null,disposed=false;
  let unknownReview=null,reconciling=false,lookupKey='',lookupToken=0,checking=false,verificationReason='';
  const selected=()=>{const local=project();return local?.active()&&local.selectedBindingId()?local:null;};
  const isSelected=()=>!!selected();
  let onInstalled=()=>{};
  const message=error=>(error?.code||'E_INSTALL')+'：'+(error?.message||String(error));
  const say=(text,state='info')=>{status.textContent=text;status.dataset.state=state;};
  const consent=createChromePermissionConsent({api,onChange(){
    if(disposed||installing)return;
    review=null;panel.hidden=true;onState();
  }});
  function reveal(){
    panel.hidden=false;
    panel.scrollIntoView?.({block:'nearest'});
    panel.focus?.();
  }
  const project=()=>getProject?.();
  const permissionRequest=planned=>({origins:planned.kind==='page-userscript'
    ?planned.siteOrigins:planned.siteOrigins.map(permissionPattern)});
  function sourceCurrent(){
    const local=project();
    return !disposed&&!!verified&&!!local?.active()&&local.connected()&&
      verified.binding.bindingId===local.selectedBindingId()&&
      verified.binding.providerEpoch===local.providerEpoch()&&
      verified.preparationIdentity===local.preparationIdentity();
  }
  function current(){
    const target=currentPageTarget?.snapshot;
    return sourceCurrent()&&
      target?.status==='available'&&target.tabId===verified.target.tabId&&
      target.windowId===verified.target.windowId&&(target.frameId??0)===(verified.target.frameId??0)&&
      target.documentId===verified.target.documentId&&target.url===verified.target.url;
  }
  const canSave=()=>unknown?!!unknownReview&&!reconciling&&!installing&&!preparing:
    current()&&!preparing&&!installing;
  const sameInstalled=()=>installed&&verified&&installed.exact===true&&
    installed.sourceHash===verified.source.sourceHash&&installed.inputHash===verified.source.inputHash;
  function hide(){review=null;panel.hidden=true;confirmButton.disabled=true;}
  function pendingFor(local){
    const attempt=local?.previousInstallAttempt?.();
    return attempt?.bindingId===local?.selectedBindingId()&&
      attempt?.projectSourceId===(local?.selectedProject()?.sourceId||'')&&
      ['controller','page-userscript'].includes(attempt?.kind)&&
      /^local-[a-f0-9]{24}$/.test(attempt?.id||'')&&
      typeof attempt.attemptedVersion==='string'?attempt:null;
  }
  function reset(){
    verified=null;installed=null;lookupKey='';++lookupToken;
    // A lost install acknowledgement is not cleared by another Run or UI reset.
    unknownReview=pendingFor(selected());unknown=!!unknownReview;
    hide();onState();
  }
  const sameTarget=(a,b)=>a&&b&&b.status==='available'&&a.tabId===b.tabId&&
    a.windowId===b.windowId&&(a.frameId??0)===(b.frameId??0)&&
    a.documentId===b.documentId&&a.url===b.url;
  function rememberInstalled(row,local){
    local?.rememberInstallation?.({kind:row.kind,id:row.id,bindingId:local.selectedBindingId(),
      sourceId:local.selectedProject()?.sourceId||''});
  }
  // A stored reference is a lookup hint only. Only original ledgers prove Run
  // success or installation. Never execute Page or Controller during recovery.
  async function inspect(token,local){
    const same=()=>!disposed&&lookupToken===token&&selected()===local;
    let source=null,binding=null;
    const hint=local.previousInstallation?.();
    verificationReason='当前源码尚无可复用的可信运行证明';
    try{
      if(local.connected()&&!isBusy()){
        binding=local.capture();source=await local.resolve(binding);
        if(!same())return;
        // A project switch or stale Provider result must never borrow the
        // previous binding's Run/result evidence, even if a UI fixture or
        // delayed adapter returns internally consistent old bytes.
        if(binding?.bindingId!==local.selectedBindingId()||
            source?.bindingId!==binding?.bindingId||
            (source?.providerEpoch!==undefined&&source.providerEpoch!==binding.providerEpoch))
          throw issue('E_DEV_CONFLICT','本地项目来源绑定已变化，旧验证不得复用');
        local.assertCaptured(binding);
      }
      let ref=null;
      if(source)ref={kind:source.runtimeKind,id:await localProjectInstallId({
        binding,source,project:local.selectedProject()})};
      else if(hint?.bindingId===local.selectedBindingId()&&
          hint?.sourceId===(local.selectedProject()?.sourceId||'')&&
          ['controller','page-userscript'].includes(hint?.kind)&&
          /^local-[a-f0-9]{24}$/.test(hint?.id||''))ref={kind:hint.kind,id:hint.id};
      if(ref){
        const existing=await getInstalledLocalProject({client,review:ref});
        if(!same())return;
        if(existing){
          let installedHash=existing.sourceHash||null;
          if(source&&ref.kind==='controller'){
            const catalog=await client.request('listTaskCatalog',{});
            if(!same())return;
            const candidate=(catalog?.catalog||[]).find(row=>row.taskId===ref.id&&
              row.version===existing.version&&row.manifestHash===existing.manifestHash);
            installedHash=candidate?.manifest?.program?.sourceHash||null;
          }
          let pageVersionChanged=null;
          if(source?.runtimeKind==='page-userscript'&&
              currentPageTarget?.snapshot?.status==='available'){
            // The existing Page preparer owns normalized site rules and
            // dependency lock equality. This read does not verify or execute.
            try{
              const planned=await prepareLocalProjectInstallation({client,source,binding,
                project:local.selectedProject(),target:currentPageTarget.snapshot});
              if(!same())return;
              pageVersionChanged=!planned.alreadyInstalled;
            }catch{
              // Unknown preparation state is not evidence of an upgrade.
            }
          }
          installed={...ref,version:String(existing.version??existing.revision??''),
            sourceHash:installedHash,exact:false,
            changed:!!source&&(pageVersionChanged===true||
              !!installedHash&&installedHash!==source.sourceHash)};
          rememberInstalled(installed,local);
        }else installed=null;
      }else installed=null;
      if(!same()||verified||unknown||unknownReview||isBusy()||!source)return;
      if(source.runtimeKind==='page-userscript'){
        verificationReason='Page 预览没有跨 Side Panel 持久证明；请主动再次运行，系统不会静默重放';
        return;
      }
      const proof=local.previousVerification?.();
      if(!proof||proof.kind!=='controller'||proof.bindingId!==binding.bindingId||
          proof.sourceId!==(local.selectedProject()?.sourceId||''))return;
      if(!sameTarget(proof.target,currentPageTarget?.snapshot)){
        verificationReason='原成功运行绑定的网页文档已经变化，不能复用';return;
      }
      if(typeof readControllerRun!=='function'||!proof.runId||!proof.resultId){
        verificationReason='上次运行缺少可核对的 runId / resultId';return;
      }
      assertLocalInstallVersion({kind:proof.kind,bindingId:proof.bindingId,
        providerEpoch:proof.providerEpoch,sourceHash:proof.sourceHash,
        inputHash:proof.inputHash,sourceBytes:proof.sourceBytes,
        sourceContract:proof.sourceContract},source,binding);
      const snapshot=await readControllerRun({runId:proof.runId});
      if(!same())return;
      const run=(snapshot?.runs||[]).find(row=>row.runId===proof.runId)||
        (snapshot?.run?.runId===proof.runId?snapshot.run:null);
      const result=(snapshot?.results||[]).find(row=>row.runId===proof.runId&&
        row.resultId===proof.resultId&&row.revision?.sourceHash===source.sourceHash&&
        row.state==='completed'&&row.outcome?.ok===true);
      // Validate the original Authority-owned target, not merely the editable
      // recovery pointer. A successful Run on another document is never proof.
      const nativeTarget=run?.target;
      const targetMatches=nativeTarget?.mode==='borrowed'&&
        nativeTarget.tabId===proof.target.tabId&&
        (nativeTarget.frameId??0)===(proof.target.frameId??0)&&
        nativeTarget.documentId===proof.target.documentId&&
        nativeTarget.url===proof.target.url&&
        nativeTarget.windowId===proof.target.windowId;
      if(run?.state!=='completed'||run.retirementState!=='released'||
        run.revision?.sourceHash!==source.sourceHash||run.resultId!==proof.resultId||
        !targetMatches||nativeTarget?.allowedOrigin!==new URL(proof.target.url).origin||
        snapshot?.resultDeliveryDenied?.includes(proof.runId)||!result){
        verificationReason='原运行结果、成功终态或资源释放回执未能确认';return;
      }
      if(!same()||!sameTarget(proof.target,currentPageTarget?.snapshot))return;
      succeeded({source,binding,target:currentPageTarget.snapshot,
        runId:proof.runId,resultId:proof.resultId},{remember:false});
      verificationReason='原持久运行结果已只读核验';
    }catch(error){
      if(!same())return;
      verificationReason=error?.code==='E_DEV_CONFLICT'
        ?'项目或来源版本改变，不能复用旧运行证明'
        :(error?.code||'E_RECOVERY')+'：'+(error?.message||'状态暂不可用');
    }finally{if(same()){checking=false;onState();}}
  }
  function inspectSelection(){
    // User-initiated prepare/confirm owns the frozen source transaction.
    // Do not start a second passive Provider.resolve while reviewing or
    // committing; status will be refreshed after the active step settles.
    if(preparing||installing||reconciling||review)return;
    const local=selected(),target=currentPageTarget?.snapshot;
    const key=JSON.stringify([local?.selectedBindingId()||'',local?.providerEpoch()||'',
      local?.connected()||false,local?.preparationIdentity()||'',
      local?.selectedProject()?.sourceId||'',local?.previousVerification?.()?.runId||'',
      local?.previousInstallation?.()?.id||'',
      local?.previousInstallAttempt?.()?.attemptedVersion||'',isBusy(),
      target?.status||'',target?.windowId,target?.tabId,target?.documentId,target?.url]);
    if(key===lookupKey)return;
    if(!unknown&&!unknownReview&&sameInstalled()&&current()){
      // A newly installed, receipt-confirmed exact version is already stronger
      // evidence than a passive registry lookup. Keep Management immediately
      // available; do not replace it with an intermediate "checking" state.
      lookupKey=key;++lookupToken;checking=false;return;
    }
    lookupKey=key;const token=++lookupToken;installed=null;checking=!!local;
    if(!installing&&!reconciling){
      const pending=pendingFor(local);
      if(pending){unknownReview=pending;unknown=true;}
      else if(!unknownReview||unknownReview.bindingId!==local?.selectedBindingId()||
          unknownReview.projectSourceId!==(local?.selectedProject()?.sourceId||'')){
        // Preserve an in-memory unknown outcome for the same project even if
        // storage is temporarily unavailable. Never interpret read failure as
        // proof that an earlier installation had no effect.
        unknownReview=null;unknown=false;
      }
    }
    if(local)void inspect(token,local);else verificationReason='请选择已授权项目';
  }
  function update(){
    inspectSelection();
    const target=currentPageTarget?.snapshot;
    // Block Save while a passive refresh resolves identity; retain the original
    // proof only until the same window's actual document can be compared again.
    const resolvingSameWindow=sourceCurrent()&&target?.status==='resolving'&&
      target.windowId===verified.target.windowId;
    if(verified&&!current()&&!resolvingSameWindow&&!unknown){
      verified=null;hide();onState();
    }
    confirmButton.disabled=unknown?!unknownReview||reconciling||installing:
      !review||preparing||installing||!current();
    confirmButton.textContent=reconciling?'正在核对…':installing?'正在保存…':
      unknown?'只读核对已安装状态':'确认安装固定版本';
    cancelButton.disabled=preparing||installing||reconciling;
    title.readOnly=version.readOnly=unknown||preparing||installing||reconciling;
  }
  function succeeded({source,binding,target,runId=null,resultId=null,previewId=null},{remember=true}={}){
    if(!hash.test(source?.sourceHash)||!hash.test(source?.inputHash)||
      !Number.isSafeInteger(source?.sourceBytes)||source?.bindingId!==binding?.bindingId)
      return reset(); // Provider must identify exact build inputs before Save becomes available.
    verified={source:structuredClone(source),binding:structuredClone(binding),
      target:structuredClone(target),runId,previewId,preparationIdentity:project()?.preparationIdentity()};
    // An additional successful Run cannot resolve an ambiguous installation.
    unknownReview=pendingFor(project());unknown=!!unknownReview;
    hide();onState();
    if(remember&&runId&&resultId&&source.runtimeKind==='controller'){
      project()?.rememberVerification?.({kind:'controller',bindingId:binding.bindingId,
        sourceId:project()?.selectedProject()?.sourceId||'',providerEpoch:binding.providerEpoch,
        projectId:source.projectId,sourceHash:source.sourceHash,inputHash:source.inputHash,
        sourceBytes:source.sourceBytes,sourceContract:sourceContract(source),
        target:structuredClone(target),runId,resultId});
    }
    // Read the ORIGINAL authoritative Page/Task catalog to recover the exact
    // installed version across Sidebar restarts; no parallel installation DB.
    const snapshot=verified;
    void prepareLocalProjectInstallation({client,source,binding,
      project:project()?.selectedProject(),target,runId})
      .then(row=>{
        if(disposed||verified!==snapshot||!current())return;
        if(row.installedVersion!==null){
          installed={kind:row.kind,id:row.id,version:String(row.installedVersion),
            sourceHash:row.alreadyInstalled?source.sourceHash:null,
            inputHash:row.alreadyInstalled?source.inputHash:null,
            exact:row.alreadyInstalled,changed:!row.alreadyInstalled};
          rememberInstalled(installed,project());
        }
        onState();
      }).catch(()=>{ /* Read failure is not evidence of an installation. */ });
  }
  async function reconcileUnknown(){
    if(!unknown||!unknownReview||reconciling||disposed)return;
    const pending=unknownReview;reconciling=true;
    say('正在读取已安装版本；不会重新运行或安装…','pending');
    reveal();update();onState();
    try{
      const observed=await readLocalInstallOutcome({client,review:pending,
        version:pending.attemptedVersion});
      if(disposed||unknownReview!==pending)return;
      if(observed.state==='confirmed'){
        installed={...observed,sourceHash:pending.sourceHash,inputHash:pending.inputHash,exact:true};
        rememberInstalled(installed,project());
        unknown=false;unknownReview=null;project()?.rememberInstallAttempt?.(null);hide();
        say('已从原持久安装记录确认确定版本，不会再次执行脚本或提交安装。','success');
        onInstalled({kind:observed.kind,id:observed.id,version:observed.version,focus:true});
      }else{
        const stateText={
          'not-installed':'没有查到这个确定版本的安装记录',
          'baseline-unchanged':'当前仍是此前安装的旧版本',
          unconfirmed:'安装记录存在，但版本、源码或原生注册状态尚未全部确认'
        }[observed.state]||'安装状态尚未确认';
        say(stateText+'；未执行、未重新安装。效果未知时禁止盲目重试。','unknown');
        panel.hidden=false;
      }
    }catch(error){
      if(!disposed)say(message(error)+'；只读核对失败，尚未重试任何安装或验证。','unknown');
    }finally{reconciling=false;if(!disposed){update();onState();}}
  }
  async function prepare(){
    if(disposed||preparing||installing||reconciling)return;
    if(unknown&&unknownReview)return reconcileUnknown();
    if(!isSelected())return;
    if(checking&&!verified){
      say('正在只读核对已安装状态与历史证明；不会执行项目。','pending');
      reveal();return;
    }
    if(!canSave()){
      if(installed&&!installed.changed){
        onInstalled({kind:installed.kind,id:installed.id,version:installed.version,focus:true});return;
      }
      summary.textContent=installed?'旧版本保留在原安装目录；更新前需要验证当前源码。':'当前项目还没有可复用的成功验证。';
      warning.textContent=verificationReason||'请主动运行本地项目；Page 运行可能产生网页副作用。';
      say('安装入口仍可使用；当前源码尚未取得安装资格。','unknown');
      confirmButton.disabled=true;reveal();return;
    }
    if(sameInstalled()){onInstalled({kind:installed.kind,id:installed.id,focus:true});return;}
    if(review){reveal();return;}
    const before=verified;
    preparing=true;
    say('正在准备保存，请稍候…','pending');reveal();update();onState();
    try{
      const local=project(),binding=local.capture();
      const source=await local.resolve(binding);
      assertLocalInstallVersion({kind:before.source.runtimeKind,bindingId:before.binding.bindingId,
        providerEpoch:before.binding.providerEpoch,sourceHash:before.source.sourceHash,
        inputHash:before.source.inputHash,sourceBytes:before.source.sourceBytes,
        sourceContract:sourceContract(before.source)},source,binding);
      await currentPageTarget.revalidate(before.target);local.assertCaptured(binding);
      const planned=await prepareLocalProjectInstallation({client,source,binding,
        project:local.selectedProject(),target:before.target,runId:before.runId});
      if(planned.alreadyInstalled){
        if(disposed||before!==verified||!current())throw issue('E_DEV_CONFLICT','已安装状态核对期间项目或网页改变');
        installed={kind:planned.kind,id:planned.id,sourceHash:source.sourceHash,
          inputHash:source.inputHash,exact:true};
        rememberInstalled(installed,local);
        onInstalled({kind:planned.kind,id:planned.id,focus:true});
        return;
      }
      const access=await consent.prepare(permissionRequest(planned));
      if(!access||before!==verified||!current())throw issue('E_DEV_CONFLICT','项目、页面或权限状态在审阅期间改变，请重新运行');
      review={planned,source:structuredClone(source),binding:structuredClone(binding),target:structuredClone(before.target),previewId:before.previewId};
      title.value=planned.defaultTitle;
      title.readOnly=false;
      version.value=planned.version;
      summary.textContent=(planned.kind==='page-userscript'?'网页增强':'自动化任务')+
        (planned.installedVersion?' · 更新 '+planned.installedVersion+' → ':' · 安装 ')+planned.version+
        (planned.installedVersion?'\n原网站范围：'+planned.installedSiteOrigins.join('、'):'')+
        '\n适用网站：'+planned.siteOrigins.join('、')+
        '\n源码 SHA-256：'+planned.sourceHash+'\n输入版本：'+planned.inputHash;
      warning.textContent=(planned.scopeChanged?'网站/权限范围与旧版不同，必须审阅后重新确认。\n':'')+(planned.needsReexecution
        ?'确认安装会在当前文档再次执行相同的冻结 Page 程序以完成正式验证，可能再次产生网页效果；验证成功后才安装。'
        :'本次安装只核对原 Controller 持久结果与原生页面操作回执，不再运行脚本。');
      say('尚未安装。请先核对网站、版本和可能的再次执行。');
      panel.hidden=false;
      // The Save action lives in the sticky bottom dock while this review is
      // in the source area. Move keyboard focus to the actual visible review
      // so narrow Side Panels and screen readers do not miss confirmation.
      reveal();
    }catch(error){
      if(!disposed){say(message(error)+'。尚未提交安装，请检查后重试。','error');reveal();}
      throw error;
    }finally{preparing=false;if(!disposed){update();onState();}}
  }
  function confirm(event){
    if(!event?.isTrusted)return;
    if(unknown&&unknownReview){void reconcileUnknown();return;}
    if(!review||installing||!current())return;
    const selected=review;
    // Freeze user-reviewed labels and version synchronously with the real click:
    // editing fields while an asynchronous permission prompt is open cannot
    // swap the Task version or title after approval.
    let approvedTitle;
    try{approvedTitle=assertLocalInstallTitle(title.value);}catch(error){say(message(error),'error');title.focus();return;}
    const approvedVersion=version.value.trim();
    const validVersion=selected.planned.kind==='page-userscript'
      ?/^[1-9]\d*$/.test(approvedVersion)&&Number.isSafeInteger(Number(approvedVersion))
      :/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(approvedVersion);
    if(!validVersion||approvedVersion.length>24){
      say(selected.planned.kind==='page-userscript'?'版本必须为正整数，例如 1。':
        '版本必须为三段数字，例如 1.0.0，最多 24 个字符。','error');
      version.focus();return;
    }
    // Permission request is made synchronously from a trusted confirmation click.
    const permission=consent.confirm(event,permissionRequest(selected.planned));
    installing=true;update();onState();say('正在验证已确认的固定源码和安装基线…','pending');
    let dispatched=false,attemptedManifestHash=null;
    void (async()=>{
      await permission;
      if(disposed||review!==selected)throw issue('E_DEV_CONFLICT','安装确认已失效');
      const local=project(),binding=local.capture(),source=await local.resolve(binding);
      assertLocalInstallVersion(selected.planned,source,binding);
      if((local.selectedProject()?.sourceId||'')!==selected.planned.projectSourceId)
        throw issue('E_DEV_CONFLICT','原本审阅的项目来源身份已变化，请重新运行');
      await currentPageTarget.revalidate(selected.target);local.assertCaptured(binding);
      if(!current())throw issue('E_DEV_CONFLICT','网页或来源已变化，不得使用旧验证安装');
      if(source.runtimeKind==='page-userscript'&&source.managedUI){
        if(typeof retireManagedPreview!=='function'||!selected.previewId)
          throw issue('E_UI_RETIRE_REQUIRED','需要原本地预览的清理入口，才能正式验证固定版本');
        say('正在清理本次运行的原受管预览；确认回执后再正式验证固定源码…','pending');
        dispatched=true;
        const retired=await retireManagedPreview({source,binding,target:selected.target,previewId:selected.previewId});
        if(retired?.previewId!==selected.previewId||retired.sourceHash!==source.sourceHash||
          retired.state!=='preview-retired'||retired.receipt?.ok!==true||
          retired.receipt.scope!=='managed-ui-only')
          throw issue('E_EFFECT_UNKNOWN','原受管预览清理回执未确认，不得继续验证或安装');
        await currentPageTarget.revalidate(selected.target);local.assertCaptured(binding);
        if(review!==selected||verified?.previewId!==selected.previewId||!current())
          throw issue('E_DEV_CONFLICT','清理期间来源、预览或网页已变化，原安装保留');
      }
      // The following workflow may persist a Candidate or replay Page Verify.
      // Only errors before this boundary are guaranteed not to have an effect.
      dispatched=true;
      const result=await commitLocalProjectInstallation({client,review:selected.planned,source,
        target:selected.target,title:approvedTitle,version:approvedVersion,
        onCandidate:value=>{attemptedManifestHash=value;}});
      if(disposed)return;
      installed={...result,sourceHash:source.sourceHash,inputHash:source.inputHash,exact:true};
      local.rememberInstallAttempt?.(null);
      rememberInstalled(installed,local);
      hide();say('已安装固定版本；修改本地源码不会自动更新已安装内容。','success');
      onInstalled({kind:result.kind,id:result.id,version:result.version});
    })().catch(error=>{
      if(disposed)return;
      const rejectedBeforeDispatch=!dispatched&&
        ['E_PERMISSION','E_GESTURE','E_PERMISSION_CHECK_REQUIRED'].includes(error?.code);
      // Explicitly denied permissions cannot leave an ambiguous install receipt;
      // allow a fresh, deliberate review without requiring a second business Run.
      // After any possible candidate/verify/install effect, fail closed.
      unknown=!rejectedBeforeDispatch;
      unknownReview=unknown?{...selected.planned,attemptedVersion:approvedVersion,
        attemptedManifestHash,attemptedTitle:approvedTitle}:null;
      project()?.rememberInstallAttempt?.(unknownReview);
      review=null;confirmButton.disabled=true;
      say(rejectedBeforeDispatch
        ?message(error)+'。尚未提交安装；检查网站访问后可以再次点击底部保存进行审阅。'
        :message(error)+'。原有安装保留；先在正式列表只读核对持久状态，禁止盲目重试。',
        rejectedBeforeDispatch?'error':'unknown');
      panel.hidden=false;
    }).finally(()=>{installing=false;if(!disposed){update();onState();}});
  }
  const cancel=()=>{
    if(preparing||installing||reconciling)return;
    hide();
    // Closing the inline review must return keyboard focus to the original
    // action (or project picker if that action has become unavailable).
    const save=find('script-save');
    const focus=save&&!save.hidden&&!save.disabled?save:find('local-project-select');
    focus?.focus?.();onState();
  };
  const onConfirm=event=>confirm(event),onCancel=()=>cancel();
  const onReviewKeyDown=event=>{
    if(event?.key!=='Escape'||panel.hidden||preparing||installing||reconciling)return;
    event.preventDefault?.();cancel();
  };
  panel.addEventListener('keydown',onReviewKeyDown);
  confirmButton.addEventListener('click',onConfirm);
  cancelButton.addEventListener('click',onCancel);
  return Object.freeze({canSave,hasSelection:isSelected,saveLabel:()=>reconciling?'正在核对…':installing?'正在安装…':
    preparing?'正在准备安装…':unknown?'核对安装状态':checking?'正在核对…':
    installed&&(sameInstalled()||!current()&&!installed.changed)?'管理已安装':
    installed?'更新':review?'继续确认安装':
    (verified?.source.runtimeKind==='page-userscript'||project()?.selectedProject()?.runtimeKind==='page-userscript')
      ?'安装网页增强':'保存为任务',
    update,reset,succeeded,prepare,confirm,setOnInstalled(fn){onInstalled=fn||(()=>{});},
    dispose(){disposed=true;consent.dispose();panel.removeEventListener('keydown',onReviewKeyDown);confirmButton.removeEventListener('click',onConfirm);
      cancelButton.removeEventListener('click',onCancel);}});
}
