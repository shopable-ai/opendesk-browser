// Copies only explicitly approved, already frozen .opendesk-page.json bytes.
// No compilation, installation, license override or implicit ID migration.
import {readFile,realpath,lstat,mkdir,writeFile,rename,rm} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {validatePageInstallPackage,PAGE_INSTALL_INPUT_LIMIT} from '../src/scripting/user-scripts/page-install-package.js';
import {OFFICIAL_PAGE_SOURCE_PATH,OFFICIAL_PAGE_CATALOG_PATH,OFFICIAL_PAGE_RELEASE_SCHEMA,
  officialPagePackagePath,validateOfficialPageSources,validateOfficialPageReleases}
  from '../src/scripting/user-scripts/official-page-catalog.js';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
// Retired generated resource only; never an accepted source or install identity.
const RETIRED_QUEUE_PATH='official-pages/opendesk.ai-send-queue/opendesk.ai-send-queue.opendesk-page.json';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=message=>{throw Error('E_OFFICIAL_PAGE_BUILD: '+message);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
async function fileAt(path,max){
  const info=await lstat(path);
  if(!info.isFile()||info.size<1||info.size>max||await realpath(path)!==path)
    fail('资源不是受限的真实普通文件: '+path);
  return readFile(path);
}
const parseSources=bytes=>validateOfficialPageSources(JSON.parse(bytes.toString('utf8')));
const sourceFile=root=>fileAt(resolve(root,OFFICIAL_PAGE_SOURCE_PATH),32768);
export async function readOfficialPageSources(root=ROOT){
  return parseSources(await sourceFile(await realpath(root)));
}
function exactScope(pkg,row){
  return pkg.programId===row.programId&&pkg.version===row.version&&
    pkg.revision===row.revision&&pkg.title===row.title&&
    same(pkg.pageRules.matches,row.sites)&&pkg.pageRules.excludeMatches.length===0&&
    ['document_end','document_idle'].includes(pkg.pageRules.runAt)&&pkg.pageRules.world==='USER_SCRIPT'&&
    pkg.pageRules.allFrames===false;
}
async function approvedInputs(row,read){
  if(row.programId==='opendesk.ai-reply-mindmap'&&row.publication==='approved')
    fail('XMind 资源再分发许可尚未通过独立生产门禁，禁止晋升正式安装');
  // Project and package paths were checked against the fixed allowlist by parseSources.
  const projectPath=row.publication==='approved'?row.project+'/'+row.packageFile:null;
  if(row.installationPolicy!=='preinstalled')return {path:projectPath};

  // Candidate metadata can advance without changing the last approved release.
  const prefix='official-pages/preinstalled/'+row.programId+'/';
  const releasePath=prefix+'release.json';
  const release=JSON.parse((await read(releasePath)).toString('utf8'));
  if(!release||Object.keys(release).length!==3||typeof release.version!=='string'||
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(release.version)||
    !Number.isSafeInteger(release.revision)||release.revision<1||typeof release.sha256!=='string'||
    !/^[a-f0-9]{64}$/.test(release.sha256))fail('已批准预装记录无效: '+row.programId);
  const {version,revision}=release;
  const candidate=row.version.split('.').map(BigInt),approved=version.split('.').map(BigInt);
  const diff=approved.findIndex((part,index)=>part!==candidate[index]);
  if(projectPath?(version!==row.version||revision!==row.revision):
    (revision>=row.revision||diff!==-1&&approved[diff]>candidate[diff])){
    fail('已批准预装版本与候选状态不符: '+row.programId);
  }
  return {path:prefix+version+'-r'+revision+'.opendesk-page.json',projectPath,releasePath,release};
}
const readInput=(root,path)=>fileAt(resolve(root,path),path.endsWith('.opendesk-page.json')?PAGE_INSTALL_INPUT_LIMIT:32768);
export async function officialPageInputs(root=ROOT){
  root=await realpath(root);
  const rows=(await readOfficialPageSources(root)).programs;
  const entries=await Promise.all(rows.map(row=>approvedInputs(row,path=>readInput(root,path))));
  return [OFFICIAL_PAGE_SOURCE_PATH,...entries.flatMap(({path,projectPath,releasePath})=>
    [path,projectPath,releasePath].filter(Boolean))].sort();
}
export async function createOfficialPageResources({root=ROOT}={}){
  root=await realpath(root);
  const sourceBytes=await sourceFile(root),source=parseSources(sourceBytes);
  const inputs=new Map([[OFFICIAL_PAGE_SOURCE_PATH,sha(sourceBytes)]]);
  const read=async path=>{
    const bytes=await readInput(root,path);
    inputs.set(path,sha(bytes));
    return bytes;
  };
  const resources=new Map(),apps=[];
  for(const row of source.programs){
    const descriptor={programId:row.programId,kind:'page-program',version:row.version,revision:row.revision,
      title:row.title,description:row.description,sites:row.sites,
      installationPolicy:row.installationPolicy};
    const {path,projectPath,release}=await approvedInputs(row,read);
    if(!path){
      apps.push({...descriptor,status:'blocked',blockedReason:row.blockedReason});
      continue;
    }
    // A blocked candidate cannot remove or replace the last approved default.
    if(release){
      descriptor.version=release.version;
      descriptor.revision=release.revision;
    }
    const bytes=await read(path);
    if(release&&inputs.get(path)!==release.sha256)
      fail('已批准预装包 SHA-256 不符: '+row.programId);
    if(release&&projectPath&&!bytes.equals(await read(projectPath)))
      fail('已批准预装包与项目正式包不一致: '+row.programId);
    let value;
    try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
    catch{fail('已批准 Page 正式包 JSON 无法解析: '+row.programId);}
    const pkg=await validatePageInstallPackage(value);
    if(!exactScope(pkg,descriptor))fail('正式包身份或网站范围与批准目录不符: '+row.programId);
    const packagePath=officialPagePackagePath(row.programId);
    resources.set(packagePath,bytes);
    apps.push({...descriptor,status:'available',packagePath,bytes:bytes.length,
      sha256:inputs.get(path),sourceHash:pkg.sourceHash,packageHash:pkg.packageHash});
  }
  const before=[...inputs].sort(([a],[b])=>a.localeCompare(b));
  const after=await Promise.all(before.map(async ([path])=>[path,sha(await readInput(root,path))]));
  if(!same(before,after))fail('发布过程中受信任的 Page 输入发生变化');
  const catalog=validateOfficialPageReleases({schema:OFFICIAL_PAGE_RELEASE_SCHEMA,
    sourceRepository:source.sourceRepository,apps});
  resources.set(OFFICIAL_PAGE_CATALOG_PATH,Buffer.from(JSON.stringify(catalog,null,2)+'\n'));
  return {catalog,resources,inputs:before};
}
async function safeDir(path){
  try{const info=await lstat(path);if(!info.isDirectory()||await realpath(path)!==path)fail('输出目录存在符号链接');}
  catch(error){if(error.code!=='ENOENT')throw error;await safeDir(dirname(path));await mkdir(path);}
}
export async function buildOfficialPages(outputRoot,{root=ROOT}={}){
  const result=await createOfficialPageResources({root});
  await writeOfficialPageResources(result,outputRoot);
  return result;
}
export async function writeOfficialPageResources(result,outputRoot,{ownedPaths=[]}={}){
  await mkdir(resolve(outputRoot),{recursive:true});
  const output=await realpath(resolve(outputRoot));
  await safeDir(resolve(output,'official-pages'));
  let previous=null;
  try{
    const value=JSON.parse((await fileAt(resolve(output,OFFICIAL_PAGE_CATALOG_PATH),32768)).toString('utf8'));
    // Existing build output may still have the retired descriptor. Ignore that
    // exact ID for regeneration; all remaining metadata is still validated.
    if(Array.isArray(value?.apps))value.apps=value.apps.filter(row=>row?.programId!=='opendesk.ai-send-queue');
    previous=validateOfficialPageReleases(value);
  }catch(error){if(error.code!=='ENOENT')throw error;}
  for(const [path,bytes] of result.resources){
    const target=resolve(output,path);
    if(!target.startsWith(output+'/official-pages/'))fail('不安全的官方资源输出路径');
    await safeDir(dirname(target));
    const temp=target+'.'+randomUUID()+'.tmp';
    try{await writeFile(temp,bytes,{flag:'wx'});await rename(temp,target);}
    finally{await rm(temp,{force:true});}
  }
  const allowed=new Set([RETIRED_QUEUE_PATH,...result.catalog.apps.map(row=>officialPagePackagePath(row.programId))]);
  const obsolete=new Set([RETIRED_QUEUE_PATH,...ownedPaths,...(previous?.apps||[]).filter(row=>row.status==='available').map(row=>row.packagePath)]);
  for(const path of obsolete){
    if(result.resources.has(path)||path===OFFICIAL_PAGE_CATALOG_PATH)continue;
    if(!allowed.has(path))fail('不安全的旧官方资源路径');
    const old=resolve(output,path);
    await safeDir(dirname(old));
    await rm(old,{force:true});
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const flag=process.argv.indexOf('--out');
  const result=await buildOfficialPages(flag>=0?process.argv[flag+1]:'artifacts/official-pages-release');
  console.log(JSON.stringify({status:'GENERATED_NOT_INSTALLED',apps:result.catalog.apps},null,2));
}
