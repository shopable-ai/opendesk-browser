import {validateRequestPath,WORKSPACE_ID} from './workspace-chat-request.js';

// Pure scope selection only: natural language and saved mappings NEVER grant
// authority. Callers supply current authorized Native workspace metadata, then
// recheck authority/lease, existence via files.read, and review before writing.
// No search, creation, dispatch, or filesystem existence claim happens here.
const encoder=new TextEncoder();
const MAX_BYTES=32*1024;
const fail=(code,message)=>{throw {code,message,outcome:'NOT_DISPATCHED'};};
const clarify=()=>fail('E_PROJECT_CLARIFY','请明确一个已授权项目的准确名称和一个已有文本文件的相对路径。');
const review=message=>fail('E_PROJECT_REVIEW',message);
const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const quoted=/`([^`\n]+)`|"([^"\n]+)"|'([^'\n]+)'|“([^”\n]+)”|‘([^’\n]+)’|「([^」\n]+)」/g;

function ordinaryPath(path){
  if(typeof path!=='string')review('请指定受支持的普通文本文件。');
  const words=path.replace(/([a-z])([A-Z])/g,'$1_$2');
  if(/(?:^|[\/._-])(?:env|credentials?|secrets?|auth|keys?|private)(?=$|[\/._-])/i.test(words)||
    /(?:^|\/)(?:package\.json|npm-shrinkwrap\.json|(?:[^/]+[-.]lock|lockfile|lock)(?:\.[^/]*)?|[^/]*\.lock|(?:tsconfig|jsconfig)(?:\.[^/]*)?\.json|[^/]*config\.[^/]+|Dockerfile|Makefile)$/i.test(path))
    review('敏感文件和影响范围较广的配置不属于普通文件任务。');
  try{validateRequestPath(path);}catch{review('请使用授权项目内受支持文本文件的安全相对路径。');}
  return path;
}

function taskPaths(task){
  const paths=new Set();
  // Mask quoted strings so a quoted path with spaces stays one path, and a
  // quoted project name cannot accidentally become an unquoted file reference.
  const rest=task.replace(quoted,(match,...args)=>{
    const value=args.slice(0,6).find(value=>value!==undefined);
    if(!value.includes('.')&&!value.includes('/')&&!value.includes('\\'))return match;
    paths.add(value);
    return ' '.repeat(match.length);
  });
  const scope=rest.replace(/[A-Za-z0-9_.~/%:+\\-]+/g,match=>{
    const value=match.replace(/[.,;!?]+$/,'');
    if(!value.includes('.')||! /\.[A-Za-z0-9]+$/.test(value))return match;
    paths.add(value);
    return ' '.repeat(match.length);
  });
  return {paths:[...paths],scope};
}

function validWorkspace(row){
  return row&&WORKSPACE_ID.test(row.workspaceId||'')&&typeof row.name==='string'&&
    !!row.name.trim()&&row.name.length<=160&&!/[\x00-\x1f\x7f]/.test(row.name)&&
    ['read-only','read-write'].includes(row.access)&&
    (row.sourceId===undefined||row.sourceId===''||/^source-[a-f0-9]{24}$/.test(row.sourceId));
}

function namePattern(name){
  if(/[^\x00-\x7f]/.test(name))
    return new RegExp(`(?:^|[^\\p{L}\\p{N}_-]|读取|查看|编辑|修改|替换|更新|写入|在)${escape(name)}(?=$|[^\\p{L}\\p{N}_-]|项目|的)`,'gu');
  return new RegExp(`(?<![A-Za-z0-9_-])${escape(name)}(?![A-Za-z0-9_-])`,'gu');
}

function explicitUnknownProject(task,rows){
  // Explicit names outside the authorized catalog must not fall back to a
  // conversation mapping. Unrecognized grammar is clarified conservatively.
  for(const row of [...rows].sort((a,b)=>b.name.length-a.name.length))
    task=task.replace(namePattern(row.name),'__known_project__');
  const patterns=[/\bproject\s+["'`“「]?([^\s"'`”」,，。]+)/gi,
    /["'`“「]([^"'`”」]+)["'`”」]\s*(?:project\b|项目)/gi,
    /\b([A-Za-z0-9_-]+)\s+project\b/gi,
    /([^\s"'`“”「」,，。]+)\s*项目/g];
  return patterns.some(pattern=>[...task.matchAll(pattern)].some(match=>{
    const name=match[1].replace(/^(?:请|在|读取|查看|编辑|修改|替换|更新|写入)+/u,'');
    return !/^(?:__known_project__|the|this|that|current|该|当前|这个)$/i.test(name);
  }));
}

export function resolveProjectTask({task,workspaces,mapping}={}){
  if(typeof task==='string'&&encoder.encode(task).length>4096)review('任务说明最多 4 KiB，请缩短后重试。');
  if(typeof task!=='string'||!task.trim()||!task.isWellFormed())clarify();
  if(/\b(?:create|delete|remove|rename|shell|exec|execute)\b|\brun\s+(?:npm|node|bash|sh|command)\b|新增|新建|创建|删除|移除|重命名|运行命令|执行命令|全项目|整个项目|所有文件|批量|\b(?:all\s+files|whole\s+project|entire\s+project)\b/i.test(task))
    review('本轮只支持读取或局部修改一个已有文本文件。');
  const rows=Array.isArray(workspaces)?workspaces.filter(validWorkspace):[];
  const {paths,scope}=taskPaths(task);
  const named=rows.filter(row=>namePattern(row.name).test(scope));
  if(explicitUnknownProject(scope,rows))clarify();
  let candidates=named;
  if(!named.length){
    const keys=mapping&&typeof mapping==='object'?Object.keys(mapping):[];
    if(keys.length!==2||!keys.includes('workspaceId')||!keys.includes('sourceId')||
      typeof mapping.sourceId!=='string'||mapping.sourceId!==''&&!/^source-[a-f0-9]{24}$/.test(mapping.sourceId))clarify();
    candidates=rows.filter(row=>row.workspaceId===mapping.workspaceId&&row.sourceId===mapping.sourceId);
  }
  if(candidates.length!==1)clarify();
  const workspace=candidates[0];
  if(paths.length!==1)clarify();
  const path=ordinaryPath(paths[0]);
  // Names and paths identify scope, never an action. An explicit read-only
  // instruction caps this task even when its explanation mentions editing.
  const intent=scope.replace(namePattern(workspace.name),' ');
  const readOnly=/只读|仅(?:需)?(?:读取|查看)|\bread[- ]only\b|\bonly\s+(?:read|inspect|view)\b|\b(?:do\s+not|don['’]t|never|without)\s+(?:edit|update|modify|change|replace|write)\b|(?:不(?:要|得|允许|需要|用)?|禁止|无需)(?:进行)?(?:编辑|修改|替换|更新|写入)/i.test(intent);
  const write=!readOnly&&/\b(?:update|modify|change|replace)\b(?!\s+(?:handler|function|method)\b)|编辑|修改|替换|改为|更新|写入/i.test(intent);
  if(write&&workspace.access!=='read-write')review('该项目当前只有读取权限。');
  return {workspace,path,write,task};
}

export function assertOrdinaryProjectEdit({path,before,content}={}){
  ordinaryPath(path);
  for(const value of [before,content]){
    if(typeof value!=='string'||!value.isWellFormed()||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)||encoder.encode(value).length>MAX_BYTES)
      review('仅支持不超过 32 KiB 的普通文本内容。');
  }
  if(!content.trim()||(before.length>256&&content.length<before.length*0.4))
    review('清空或删除大部分内容需要单独审阅。');
  return true;
}
