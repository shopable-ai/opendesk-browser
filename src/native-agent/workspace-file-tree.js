import {validateRequestPath} from './workspace-chat-request.js';

// Native remains authoritative: no filesystem scan or guessed paths.
export const MAX_WORKSPACE_TREE_ENTRIES=512;
export const MAX_WORKSPACE_TREE_EXPANSIONS=40;
export const MAX_WORKSPACE_TREE_REFRESH=24;

export function validateWorkspaceTreeListing(data,workspaceId,path){
  if(!data||data.workspaceId!==workspaceId||data.path!==path||
    !Array.isArray(data.entries)||data.entries.length>MAX_WORKSPACE_TREE_ENTRIES||
    typeof data.truncated!=='boolean')
    throw {code:'E_FILES_PROTOCOL',message:'目录列表的工作区身份或格式无效'};
  validateRequestPath(path,{directory:true});
  const seen=new Set(),entries=[];
  for(const entry of data.entries){
    if(!entry||typeof entry.path!=='string'||typeof entry.name!=='string'||
      !['directory','file'].includes(entry.kind)||!entry.name||
      entry.path!==(path?path+'/':'')+entry.name||seen.has(entry.name))
      throw {code:'E_FILES_PROTOCOL',message:'目录列表包含无效或重复的子路径'};
    try{validateRequestPath(entry.path,{directory:entry.kind==='directory'});}
    catch{throw {code:'E_FILES_PROTOCOL',message:'目录返回了工作区之外或不支持的路径'};}
    seen.add(entry.name);
    entries.push({kind:entry.kind,path:entry.path,name:entry.name});
  }
  const collator=new Intl.Collator('zh-CN',{numeric:true,sensitivity:'base'});
  entries.sort((a,b)=>a.kind===b.kind?collator.compare(a.name,b.name):
    a.kind==='directory'?-1:1);
  return {entries,truncated:data.truncated};
}

export function parentDirectoriesForFile(path){
  validateRequestPath(path);
  const parts=path.split('/'),parents=[''];
  for(let i=1;i<parts.length;i++)parents.push(parts.slice(0,i).join('/'));
  return parents;
}
