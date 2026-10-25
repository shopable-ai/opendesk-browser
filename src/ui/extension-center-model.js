// Read-only unified view of existing installed registries and bundled official releases.
import {sidebarToolPackageHash} from './sidebar-tools/package.js';

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
export function composeExtensionEntries({installed=[],pages=[],official=[],pageReleases=[],enabled={},appStatusKnown=true,pageStatusKnown=true,cleanupPendingIds=[]}={}){
  const entries=[],releases=new Map(official.map(row=>[row.toolId,row])),ids=new Set();
  const pendingCleanups=new Set(cleanupPendingIds);
  for(const tool of installed){
    if(!tool?.id||ids.has(tool.id))continue;
    ids.add(tool.id);
    const release=releases.get(tool.id)||null;
    entries.push({key:'app:'+tool.id,id:tool.id,kind:'app',title:tool.title,
      description:tool.description,version:tool.version,installed:true,cleanupPending:false,
      enabled:appStatusKnown?enabled[tool.id]!==false:null,stateKnown:appStatusKnown,
      release,update:!!release&&newer(release.version,tool.version),record:tool});
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
    entries.push({key:'page:'+p.programId,id:p.programId,kind:'page',title:p.title||p.programId,
      description:(p.pageRules?.matches||[]).join('、')||'已安装网页增强',version:p.revision,
      installed:true,enabled:pageStatusKnown?p.enabled===true:null,stateKnown:pageStatusKnown,
      release,update:Boolean(release?.status==='available'&&release.revision>p.revision),
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
export function filterExtensionEntries(entries,{query='',kind='all',scope='smart'}={}){
  const needle=lower(query);
  // Default/legacy scopes project only verified installed entries. Search never
  // escalates into Catalog discovery; uninstalled releases require an explicit scope.
  return entries.filter(row=>(kind==='all'||row.kind===kind)&&
    (scope==='available'?(!row.installed||row.update===true):row.installed===true)&&
    (!needle||[row.title,row.description,row.id,String(row.version),EXTENSION_SEARCH_ALIASES[row.id]].some(s=>lower(s).includes(needle))));
}
