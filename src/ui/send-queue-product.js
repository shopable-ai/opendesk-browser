// Product presentation and fixed candidate verification only. Queue state stays in Page.
import {SEND_QUEUE_PIN,admitsPinnedQueuePage} from '../platform/host/send-queue-admission.js';
import {loadBundledOfficialResource} from '../sidebar-tools/official-catalog.js';
import {officialPagePackagePath} from '../scripting/user-scripts/official-page-catalog.js';
import {validatePageInstallPackage,PAGE_INSTALL_INPUT_LIMIT} from '../scripting/user-scripts/page-install-package.js';

export function describeSendQueueProduct({toolInstalled=false,toolEnabled=false,appStatusKnown=true,
  page,pageStatusKnown=true,cleanupPending=false}={}){
  const pageInstalled=Boolean(page?.manifestHash);
  const pageState=!pageStatusKnown?'unknown':!pageInstalled?'missing':
    !admitsPinnedQueuePage(page)?'version-mismatch':
    page.managedCleanup?.state==='unknown'?'restricted':
    page.enabled!==true?(page.nativeState==='disabled'&&page.authorization?.status==='disabled'&&
      !page.error?'disabled':'restricted'):!queuePageIdentity(page)?'restricted':page.nativeState!=='registered'||
    page.authorization?.status!=='active'||page.error?'restricted':'registered';
  const state=!appStatusKnown||!pageStatusKnown?'unknown':cleanupPending?'cleanup-pending':
    !toolInstalled||!pageInstalled?'partial':pageState==='version-mismatch'?'version-mismatch':
    !toolEnabled||pageState!=='registered'?'restricted':'ready';
  return {state,pageState,toolInstalled,pageInstalled,
    summary:'侧栏：'+(!appStatusKnown?'待核对':!toolInstalled?'未安装':toolEnabled?'已启用':'已停用')+
      '；网页能力：'+({unknown:'待核对',missing:'未安装','version-mismatch':'版本不匹配',
        disabled:'已停用',restricted:'授权、注册或清理待核对',registered:'已注册'}[pageState])+
      '。两份独立安装记录；唯一消息队列保留在网页内存，更新和恢复不迁移或重发消息。'};
}

// Explicit pre-release review is separate from official publication. Do not use
// loadOfficialPagePackage: blocked releases must never acquire available status.
export async function loadSendQueuePageCandidate({api,fetcher=globalThis.fetch}={}){
  const bytes=await loadBundledOfficialResource(officialPagePackagePath(SEND_QUEUE_PIN.pageProgramId),
    PAGE_INSTALL_INPUT_LIMIT,{api,fetcher});
  const pkg=await validatePageInstallPackage(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));
  if(!admitsPinnedQueuePage(pkg)||pkg.version!==SEND_QUEUE_PIN.pageVersion||
    pkg.packageHash!==SEND_QUEUE_PIN.pagePackageHash)throw Object.assign(new Error('网页候选与当前已审阅 PIN 不一致'),
    {code:'E_QUEUE_CANDIDATE'});
  return pkg;
}

export function queuePageIdentity(page){
  if(!page?.manifestHash||!page.authorization?.installationId||
    !Number.isSafeInteger(page.authorization.generation))return null;
  return {programId:page.programId,manifestHash:page.manifestHash,
    installationId:page.authorization.installationId,expectedGeneration:page.authorization.generation};
}
export function sameQueuePageIdentity(page,expected){
  const actual=queuePageIdentity(page);
  return Boolean(actual&&expected&&Object.keys(actual).every(key=>actual[key]===expected[key]));
}
