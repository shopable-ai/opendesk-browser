// Copies only explicitly approved, already frozen .opendesk-page.json bytes.
// No compilation, installation, license override or implicit ID migration.
import {readFile,realpath,lstat,mkdir,writeFile,rename,rm} from 'node:fs/promises';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {validatePageInstallPackage,PAGE_INSTALL_INPUT_LIMIT} from '../src/scripting/user-scripts/page-install-package.js';
import {OFFICIAL_PAGE_SOURCE_PATH,OFFICIAL_PAGE_CATALOG_PATH,OFFICIAL_PAGE_RELEASE_SCHEMA,
  officialPagePackagePath,validateOfficialPageSources,validateOfficialPageReleases}
  from '../src/scripting/user-scripts/official-page-catalog.js';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=message=>{throw Error('E_OFFICIAL_PAGE_BUILD: '+message);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
async function fileAt(path,max){
  const info=await lstat(path);
  if(!info.isFile()||info.size<1||info.size>max||await realpath(path)!==path)
    fail('资源不是受限的真实普通文件: '+path);
  return readFile(path);
}
export async function readOfficialPageSources(root=ROOT){
  root=await realpath(root);
  return validateOfficialPageSources(JSON.parse((await fileAt(resolve(root,OFFICIAL_PAGE_SOURCE_PATH),32768)).toString('utf8')));
}
function exactScope(pkg,row){
  return pkg.programId===row.programId&&pkg.version===row.version&&
    pkg.revision===row.revision&&pkg.title===row.title&&
    same(pkg.pageRules.matches,row.sites)&&pkg.pageRules.excludeMatches.length===0&&
    pkg.pageRules.runAt==='document_idle'&&pkg.pageRules.world==='USER_SCRIPT'&&
    pkg.pageRules.allFrames===false;
}
async function approvedFile(root,row){
  if(row.programId==='opendesk.ai-reply-mindmap')
    fail('XMind 资源再分发许可尚未通过独立生产门禁，禁止晋升正式安装');
  const directory=resolve(root,row.project);
  if(await realpath(directory)!==directory||!directory.startsWith(root+'/examples/programs/'))
    fail('项目目录越过许可的 Page 源码范围');
  const path=resolve(directory,row.packageFile);
  if(!path.startsWith(directory+'/'))fail('正式包路径越界');
  return {path,bytes:await fileAt(path,PAGE_INSTALL_INPUT_LIMIT)};
}
export async function officialPageInputs(root=ROOT){
  root=await realpath(root);
  const rows=(await readOfficialPageSources(root)).programs;
  return [OFFICIAL_PAGE_SOURCE_PATH,...await Promise.all(rows.filter(row=>row.publication==='approved')
    .map(async row=>relative(root,(await approvedFile(root,row)).path)))].sort();
}
export async function createOfficialPageResources({root=ROOT}={}){
  root=await realpath(root);
  const source=await readOfficialPageSources(root);
  const inputs=await officialPageInputs(root);
  const before=await Promise.all(inputs.map(async path=>[path,sha(await readFile(resolve(root,path)))]));
  const resources=new Map(),apps=[];
  for(const row of source.programs){
    const descriptor={programId:row.programId,kind:'page-program',version:row.version,revision:row.revision,
      title:row.title,description:row.description,sites:row.sites,
      installationPolicy:row.installationPolicy};
    if(row.publication==='blocked'){
      apps.push({...descriptor,status:'blocked',blockedReason:row.blockedReason});
      continue;
    }
    const {bytes}=await approvedFile(root,row);
    let value;
    try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
    catch{fail('已批准 Page 正式包 JSON 无法解析: '+row.programId);}
    const pkg=await validatePageInstallPackage(value);
    if(!exactScope(pkg,row))fail('正式包身份或网站范围与批准目录不符: '+row.programId);
    const packagePath=officialPagePackagePath(row.programId);
    resources.set(packagePath,bytes);
    apps.push({...descriptor,status:'available',packagePath,bytes:bytes.length,
      sha256:sha(bytes),sourceHash:pkg.sourceHash,packageHash:pkg.packageHash});
  }
  const after=await Promise.all(inputs.map(async path=>[path,sha(await readFile(resolve(root,path)))]));
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
  await mkdir(resolve(outputRoot),{recursive:true});
  const output=await realpath(resolve(outputRoot));
  await safeDir(resolve(output,'official-pages'));
  let previous=null;
  try{
    previous=validateOfficialPageReleases(JSON.parse((await fileAt(resolve(output,OFFICIAL_PAGE_CATALOG_PATH),32768)).toString('utf8')));
  }catch(error){if(error.code!=='ENOENT')throw error;}
  for(const [path,bytes] of result.resources){
    const target=resolve(output,path);
    if(!target.startsWith(output+'/official-pages/'))fail('不安全的官方资源输出路径');
    await safeDir(dirname(target));
    const temp=target+'.'+randomUUID()+'.tmp';
    try{await writeFile(temp,bytes,{flag:'wx'});await rename(temp,target);}
    finally{await rm(temp,{force:true});}
  }
  for(const row of previous?.apps||[]){
    if(row.status!=='available'||result.resources.has(row.packagePath))continue;
    const old=resolve(output,row.packagePath);
    if(await realpath(dirname(old))!==dirname(old))fail('旧输出目录存在符号链接');
    await rm(old,{force:true});
  }
  return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const flag=process.argv.indexOf('--out');
  const result=await buildOfficialPages(flag>=0?process.argv[flag+1]:'artifacts/official-pages-release');
  console.log(JSON.stringify({status:'GENERATED_NOT_INSTALLED',apps:result.catalog.apps},null,2));
}
