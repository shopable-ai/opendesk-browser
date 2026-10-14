// Read-only unified view of existing installed registries and bundled official releases.
const lower=value=>String(value??'').trim().toLocaleLowerCase();
const newer=(a,b)=>{
  const aa=a.split('.').map(Number),bb=b.split('.').map(Number);
  for(let i=0;i<3;i++){if(aa[i]!==bb[i])return aa[i]>bb[i];}
  return false;
};
export function composeExtensionEntries({installed=[],pages=[],official=[],enabled={}}={}){
  const entries=[],releases=new Map(official.map(row=>[row.toolId,row])),ids=new Set();
  for(const tool of installed){
    if(!tool?.id||ids.has(tool.id))continue;
    ids.add(tool.id);
    const release=releases.get(tool.id)||null;
    entries.push({key:'app:'+tool.id,id:tool.id,kind:'app',title:tool.title,
      description:tool.description,version:tool.version,installed:true,
      enabled:enabled[tool.id]!==false,release,update:!!release&&newer(release.version,tool.version),record:tool});
  }
  const pageIds=new Set();
  for(const row of pages){
    if(!row?.programId||pageIds.has(row.programId)||!row.installed||
      row.installed.manifestHash!==row.manifestHash)continue;
    pageIds.add(row.programId);
    const p=row.installed;
    entries.push({key:'page:'+row.programId,id:row.programId,kind:'page',title:p.title||row.programId,
      description:(p.pageRules?.matches||[]).join('、')||'已安装网页增强',version:p.revision,
      installed:true,enabled:p.enabled===true,release:null,update:false,record:row});
  }
  for(const release of official){
    if(!release?.toolId||ids.has(release.toolId))continue;
    ids.add(release.toolId);
    entries.push({key:'app:'+release.toolId,id:release.toolId,kind:'app',
      title:release.packageTitle,description:release.description,version:release.version,
      installed:false,enabled:false,release,update:false,record:null});
  }
  return entries.sort((a,b)=>a.title.localeCompare(b.title,'zh-CN')||a.key.localeCompare(b.key));
}
export function filterExtensionEntries(entries,{query='',kind='all',scope='smart'}={}){
  const needle=lower(query);
  return entries.filter(row=>(kind==='all'||row.kind===kind)&&
    (scope!=='local'||row.installed)&&
    (scope!=='available'||!row.installed||row.update)&&
    (scope!=='smart'||!!needle||row.installed)&&
    (!needle||[row.title,row.description,row.id,String(row.version)].some(s=>lower(s).includes(needle))));
}
