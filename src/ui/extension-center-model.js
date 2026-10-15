// Read-only unified view of existing installed registries and bundled official releases.
import {sidebarToolPackageHash} from './sidebar-tools/package.js';

export async function describeInstalledAppSource(tool,record){
  const sha256=await sidebarToolPackageHash(tool);
  if(record===undefined)return {kind:'local',label:'本地工具包导入（无官方市场安装记录）',sha256};
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
export function composeExtensionEntries({installed=[],pages=[],official=[],enabled={},appStatusKnown=true,pageStatusKnown=true}={}){
  const entries=[],releases=new Map(official.map(row=>[row.toolId,row])),ids=new Set();
  for(const tool of installed){
    if(!tool?.id||ids.has(tool.id))continue;
    ids.add(tool.id);
    const release=releases.get(tool.id)||null;
    entries.push({key:'app:'+tool.id,id:tool.id,kind:'app',title:tool.title,
      description:tool.description,version:tool.version,installed:true,
      enabled:appStatusKnown?enabled[tool.id]!==false:null,stateKnown:appStatusKnown,
      release,update:!!release&&newer(release.version,tool.version),record:tool});
  }
  const pageIds=new Set();
  for(const row of pages){
    if(!row?.programId||pageIds.has(row.programId)||!row.installed||
      row.installed.manifestHash!==row.manifestHash)continue;
    pageIds.add(row.programId);
    const p=row.installed;
    entries.push({key:'page:'+row.programId,id:row.programId,kind:'page',title:p.title||row.programId,
      description:(p.pageRules?.matches||[]).join('、')||'已安装网页增强',version:p.revision,
      installed:true,enabled:pageStatusKnown?p.enabled===true:null,stateKnown:pageStatusKnown,
      release:null,update:false,record:row});
  }
  for(const release of official){
    if(!release?.toolId||ids.has(release.toolId))continue;
    ids.add(release.toolId);
    entries.push({key:'app:'+release.toolId,id:release.toolId,kind:'app',
      title:release.packageTitle,description:release.description,version:release.version,
      installed:false,enabled:false,stateKnown:true,release,update:false,record:null});
  }
  return entries.sort((a,b)=>a.title.localeCompare(b.title,'zh-CN')||a.key.localeCompare(b.key));
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
export function filterExtensionEntries(entries,{query='',kind='all',scope='smart'}={}){
  const needle=lower(query);
  return entries.filter(row=>(kind==='all'||row.kind===kind)&&
    (scope!=='local'||row.installed)&&
    (scope!=='available'||!row.installed||row.update)&&
    (scope!=='smart'||!!needle||row.installed||row.release?.installationPolicy==='preinstalled')&&
    (!needle||[row.title,row.description,row.id,String(row.version)].some(s=>lower(s).includes(needle))));
}
