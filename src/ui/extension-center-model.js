// Read-only unified view of existing installed registries and bundled official releases.
import {sidebarToolPackageHash} from './sidebar-tools/package.js';
import {SEND_QUEUE_PIN,admitsPinnedQueuePage} from '../../examples/sidebar-tools/ai-send-queue/trusted/admission.js';
import {SCROLL_CONFIG_PROGRAM_ID,SCROLL_SITE_REVISION_BASE}
  from '../scripting/user-scripts/scroll-config-contract.js';

export async function describeInstalledAppSource(tool,record){
  const sha256=await sidebarToolPackageHash(tool);
  if(record===undefined)return {kind:'unknown',label:'来源未记录',sha256};
  if(record?.marketId==='opendesk/'+tool.id&&record.version===tool.version&&record.sha256===sha256)
    return {kind:'market',label:'OpenDesk 官方市场 · '+record.marketId,sha256};
  return {kind:'unverified',label:'安装来源记录与当前固定包不一致',sha256};
}

const lower=value=>String(value??'').trim().toLocaleLowerCase();
const newer=(a,b)=>{
  const aa=a.split('.').map(Number),bb=b.split('.').map(Number);
  for(let i=0;i<3;i++){if(aa[i]!==bb[i])return aa[i]>bb[i];}
  return false;
};
export function composeExtensionEntries({installed=[],pages=[],official=[],pageReleases=[],enabled={},appStatusKnown=true,pageStatusKnown=true,cleanupPendingIds=[],queueToolHash=null}={}){
  const entries=[],releases=new Map(official.map(row=>[row.toolId,row])),ids=new Set();
  const pendingCleanups=new Set(cleanupPendingIds);
  // Do not hide an installed Page unless the Companion App has the exact
  // source-bound package digest; an arbitrary same-ID Tool earns no ownership.
  const reviewedQueue=installed.some(tool=>
    tool?.id===SEND_QUEUE_PIN.toolId&&tool.version===SEND_QUEUE_PIN.toolVersion)&&
    queueToolHash===SEND_QUEUE_PIN.toolPackageSha256;
  const pageRecord=pages.find(row=>(row?.installed??row)?.programId===SEND_QUEUE_PIN.pageProgramId);
  const page=pageRecord?.installed??pageRecord;
  const status=!pageStatusKnown?'unknown':!page?.manifestHash?'missing':
    !admitsPinnedQueuePage(page)?'version-mismatch':page.enabled!==true?'disabled':
    page.nativeState!=='registered'||page.authorization?.status!=='active'||page.error?
      'restricted':'registered';
  const companion=Object.freeze({programId:SEND_QUEUE_PIN.pageProgramId,
    state:status,revision:page?.revision??null,installed:Boolean(page?.manifestHash)});
  for(const tool of installed){
    if(!tool?.id||ids.has(tool.id))continue;
    ids.add(tool.id);
    const release=releases.get(tool.id)||null;
    entries.push({key:'app:'+tool.id,id:tool.id,kind:'app',title:tool.title,
      description:tool.description,version:tool.version,installed:true,cleanupPending:false,
      enabled:appStatusKnown?enabled[tool.id]!==false:null,stateKnown:appStatusKnown,
      release,update:!!release&&newer(release.version,tool.version),record:tool,
      ...(reviewedQueue&&tool.id===SEND_QUEUE_PIN.toolId?{pageCompanion:companion}:{})});
  }
  const pageIds=new Set(),pageReleaseById=new Map(pageReleases.map(row=>[row.programId,row]));
  // "pages" is the Authority's installed collection, not the development
  // Catalog. Keep a small compatibility normalization for existing callers.
  for(const row of pages){
    const p=row?.installed??row;
    if(!p?.programId||!p.manifestHash||pageIds.has(p.programId)||
      (row?.installed&&(row.programId!==p.programId||row.manifestHash!==p.manifestHash)))continue;
    pageIds.add(p.programId);
    const release=pageReleaseById.get(p.programId)||null;
    // Scope variants have immutable identity keys, not release precedence.
    // Offer the original review even when an official freeze has a lower key.
    const officialReview=p.programId===SCROLL_CONFIG_PROGRAM_ID&&
      p.revision>=SCROLL_SITE_REVISION_BASE&&release?.status==='available'&&
      release.revision<SCROLL_SITE_REVISION_BASE;
    entries.push({key:'page:'+p.programId,id:p.programId,kind:'page',title:p.title||p.programId,
      description:(p.pageRules?.matches||[]).join('、')||'已安装网页增强',version:p.revision,
      installed:true,enabled:pageStatusKnown?p.enabled===true:null,stateKnown:pageStatusKnown,
      release,officialReview,update:Boolean(release?.status==='available'&&
        (release.revision>p.revision||officialReview)),
      record:{programId:p.programId,manifestHash:p.manifestHash,installed:p}});
  }
  // Bundled Page candidates never become installed entries without an Authority record.
  for(const release of pageReleases){
    if(!release?.programId||pageIds.has(release.programId))continue;
    pageIds.add(release.programId);
    entries.push({key:'page:'+release.programId,id:release.programId,kind:'page',title:release.title,
      description:release.description,version:release.version+' · r'+release.revision,
      installed:false,enabled:false,stateKnown:true,release,update:false,record:null});
  }
  for(const release of official){
    if(!release?.toolId||ids.has(release.toolId))continue;
    ids.add(release.toolId);
    entries.push({key:'app:'+release.toolId,id:release.toolId,kind:'app',
      title:release.packageTitle,description:release.description,version:release.version,
      installed:false,cleanupPending:pendingCleanups.has(release.toolId),
      enabled:false,stateKnown:true,release,update:false,record:null});
  }
  return entries.sort((a,b)=>a.title.localeCompare(b.title,'zh-CN')||a.key.localeCompare(b.key));
}
// Search-only aliases: exact IDs, never installation identity or Authority.
// A legacy installation keeps its own ID, title, enablement and record.
const EXTENSION_SEARCH_ALIASES=Object.freeze({
  'prompt-shortcuts':'AI 提示词 快捷按钮 Prompt Shortcuts',
  'opendesk.ai-scroll-navigation':'AI 对话 滚动 导航 回顶 长回复 Scroll Navigation',
  'opendesk.ai-reply-mindmap':'AI 回复 思维导图 Mind Map XMind',
  'opendesk.ai-send-queue':'AI 消息 发送 队列 Send Queue',
  'opendesk.chatgpt-jump-top':'旧版 ChatGPT 滚动导航 回顶',
  'opendesk.chatgpt-mindmap':'旧版 ChatGPT 思维导图 XMind',
  'opendesk.chatgpt-send-queue':'旧版 ChatGPT 消息发送队列 Queue'
});
// Presentation-only metadata for the two independent AI Page Programs.
// Legacy installations remain separate Authority records, never aliases.
const AI_PAGE_LEGACY_IDS=Object.freeze({
  'opendesk.ai-scroll-navigation':'opendesk.chatgpt-jump-top',
  'opendesk.ai-reply-mindmap':'opendesk.chatgpt-mindmap'
});

export function describeManagedAiPage(page,installedPrograms=[]){
  const legacyProgramId=AI_PAGE_LEGACY_IDS[page?.programId];
  if(!legacyProgramId)return null;
  const enabledKnown=typeof page.enabled==='boolean';
  const enabled=page.enabled===true;
  const authorization=page.authorization?.status;
  const native=page.nativeState;
  const sitesKnown=Array.isArray(page.pageRules?.matches)&&page.pageRules.matches.length>0;
  const cleanupUnknown=page.managedCleanup?.state==='unknown';
  const error=Boolean(page.error);
  let state='pending',status='运行条件待核对';
  if(!enabledKnown){status='启用状态尚未核实';}
  else if(!enabled){
    if(authorization==='disabled'&&native==='disabled'&&!cleanupUnknown&&!error){
      state='off';status='已停用 · 原生注销已确认';
    }else status='已停用 · 原生清理待核对';
  }else if(sitesKnown&&authorization==='active'&&native==='registered'&&!cleanupUnknown&&!error){
    state='ready';status='自动运行条件已就绪';
  }else if(authorization==='suspended'){
    state='restricted';status='网站访问权限已暂停';
  }else if(native==='blocked'){
    state='restricted';status='Chrome 注册受阻';
  }else if(error||cleanupUnknown){
    state='restricted';status='注册或清理异常，需核对';
  }else status='已请求启用 · 原生状态待核对';
  const legacyInstalled=installedPrograms.some(row=>
    (row?.installed??row)?.programId===legacyProgramId);
  return {
    enabled,enabledKnown,state,status,
    note:'显示的是本机授权和 Chrome 注册读回，并非对当前网页已实际运行的证明。',
    legacyProgramId:legacyInstalled?legacyProgramId:null,
    canRestore:enabledKnown&&enabled&&!cleanupUnknown&&
      (authorization==='suspended'||
        (authorization==='active'&&(native!=='registered'||error)))
  };
}

// Presentation-only decision. No installed Page UI / candidate-preview entry is verified yet.
// Null is intentional: rows without a real high-frequency action lead to details.
export function resolveExtensionPrimaryAction(row){
  if(row?.kind==='app'&&row.installed===true&&row.enabled===true&&row.stateKnown!==false)
    return {id:'open',label:'打开'};
  return null;
}
export function resolveExtensionRowIntent(row){
  return resolveExtensionPrimaryAction(row)?'launch':'detail';
}
// All installed Page Programs use the same trusted management projection.
// The existing AI projection retains its legacy identity/restore semantics.
export function describeInstalledPageControl(page,installedPrograms=[]){
  const ai=describeManagedAiPage(page,installedPrograms);
  if(ai)return ai;
  const enabledKnown=typeof page?.enabled==='boolean',enabled=page?.enabled===true;
  const authorization=page?.authorization?.status,native=page?.nativeState;
  const sitesKnown=Array.isArray(page?.pageRules?.matches)&&page.pageRules.matches.length>0;
  const cleanupUnknown=page?.managedCleanup?.state==='unknown',error=Boolean(page?.error);
  let state='pending',status='运行条件待核对';
  if(!enabledKnown)status='启用状态尚未核实';
  else if(!enabled){
    if(authorization==='disabled'&&native==='disabled'&&!cleanupUnknown&&!error){
      state='off';status='已停用 · 原生注销已确认';
    }else status='已停用 · 原生清理待核对';
  }else if(sitesKnown&&authorization==='active'&&native==='registered'&&!cleanupUnknown&&!error){
    state='ready';status='自动运行条件已就绪';
  }else if(authorization==='suspended'){
    state='restricted';status='网站访问权限已暂停';
  }else if(native==='blocked'){
    state='restricted';status='Chrome 注册受阻';
  }else if(error||cleanupUnknown){
    state='restricted';status='注册或清理异常，需核对';
  }else status='已请求启用 · 原生状态待核对';
  return {enabled,enabledKnown,state,status,
    note:'状态来自 Page Authority 和 Chrome 注册读回，并非当前网页的运行证明。',
    legacyProgramId:null,
    canRestore:enabledKnown&&enabled&&!cleanupUnknown&&
      (authorization==='suspended'||(authorization==='active'&&(native!=='registered'||error)))
  };
}

export function filterExtensionEntries(entries,{query='',kind='all',scope='smart'}={}){
  const needle=lower(query);
  // Default list: one product. The explicit Page filter retains the
  // original independently revocable Page Authority controls.
  const hasQueueApp=entries.some(row=>row.kind==='app'&&row.installed&&
    row.id===SEND_QUEUE_PIN.toolId&&row.pageCompanion);
  // Default/legacy scopes project only verified installed entries. Search never
  // escalates into Catalog discovery; uninstalled releases require an explicit scope.
  return entries.filter(row=>!(kind==='all'&&hasQueueApp&&
      row.kind==='page'&&row.id===SEND_QUEUE_PIN.pageProgramId)&&
    (kind==='all'||row.kind===kind)&&
    (scope==='available'?(!row.installed||row.update===true):row.installed===true)&&
    (!needle||[row.title,row.description,row.id,String(row.version),EXTENSION_SEARCH_ALIASES[row.id]].some(s=>lower(s).includes(needle))));
}
