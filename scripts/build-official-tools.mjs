// Sole official release producer. Reuses the standalone tool packer; no npm,
// arbitrary script execution or remote sources are admitted by this build.
import {readFile,realpath,lstat,mkdir,writeFile,rename,rm} from 'node:fs/promises';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {parse} from 'acorn';
import {createSidebarToolPackage,encodeSidebarToolPackage} from './build-sidebar-tool.mjs';
import {inspectSidebarToolProject} from './stage-sidebar-tool.mjs';
import {validateOfficialSourceCatalog,validateOfficialReleaseCatalog,OFFICIAL_RELEASE_SCHEMA,
  OFFICIAL_CATALOG_PATH,officialPackagePath} from '../src/sidebar-tools/official-catalog.js';

export const REPOSITORY_ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=message=>{throw new Error('E_OFFICIAL_BUILD: '+message);};
async function safeDirectory(path){
  try{
    const info=await lstat(path);
    if(!info.isDirectory()||await realpath(path)!==path)fail('official output directory must not be a symlink');
  }catch(error){
    if(error.code!=='ENOENT')throw error;
    await safeDirectory(dirname(path));await mkdir(path);
  }
}
export async function readOfficialSources(root=REPOSITORY_ROOT){
  const actual=await realpath(root),path=resolve(actual,OFFICIAL_CATALOG_PATH);
  const info=await lstat(path);
  if(!info.isFile()||info.size>32768||await realpath(path)!==path)fail('catalog is not a bounded trusted source file');
  return validateOfficialSourceCatalog(JSON.parse(await readFile(path,'utf8')));
}
async function projectPath(root,row){
  const path=resolve(root,row.project),actual=await realpath(path);
  if(actual!==path||!actual.startsWith(root+'/examples/sidebar-tools/'))fail('official project symlink escaped trusted source: '+row.id);
  return actual;
}
// Include only declared release inputs, including build-ready for a precompiled
// project. This same list feeds build identity and the existing dev watcher.
export async function officialToolInputs(root=REPOSITORY_ROOT){
  root=await realpath(root);
  const catalog=await readOfficialSources(root),paths=[OFFICIAL_CATALOG_PATH];
  for(const row of catalog.tools){
    const project=await projectPath(root,row);
    await inspectSidebarToolProject(project);
    const config=JSON.parse(await readFile(resolve(project,'tool.config.json'),'utf8'));
    const files=['tool.config.json',...Object.values(config.files),...(config.assets||[])];
    if(config.files.js.startsWith('dist/')||config.files.css.startsWith('dist/'))files.push('dist/build-ready.json');
    for(const name of files){
      const declared=resolve(project,name),path=await realpath(declared);
      if(path!==declared||!path.startsWith(project+'/'))fail('official source symlink escaped trusted project');
      paths.push(relative(root,path));
    }
  }
  return [...new Set(paths)].sort();
}
async function fingerprint(root){
  return Promise.all((await officialToolInputs(root)).map(async path=>{
    const bytes=await readFile(resolve(root,path));return {path,bytes:bytes.length,sha256:digest(bytes)};
  }));
}
export async function createOfficialToolResources({root=REPOSITORY_ROOT}={}){
  root=await realpath(root);
  const before=await fingerprint(root),source=await readOfficialSources(root),apps=[],resources=new Map();
  for(const row of source.tools){
    const tool=await createSidebarToolPackage(await projectPath(root,row));
    if(tool.id!==row.id)fail('tool.config.json ID does not match catalog: '+row.id);
    try{parse(tool.js,{ecmaVersion:'latest',sourceType:'script'});}
    catch(error){fail('official tool JavaScript syntax error: '+row.id+' '+error.message);}
    const raster=/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/;
    const assets=[...tool.html.matchAll(/\b(?:src|poster)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)]
      .map(match=>match[1]??match[2]??match[3]);
    assets.push(...[...tool.css.matchAll(/url\s*\(([^)]*)\)/gi)].map(match=>match[1].trim().replace(/^["']|["']$/g,'')));
    if(/\bsrcset\s*=/i.test(tool.html)||assets.some(value=>!raster.test(value)))
      fail('official static assets must be embedded: '+row.id);
    const bytes=encodeSidebarToolPackage(tool),packagePath=officialPackagePath(tool.id);
    resources.set(packagePath,bytes);
    apps.push({id:'opendesk/'+tool.id,toolId:tool.id,kind:row.kind,installationPolicy:row.installationPolicy,
      version:tool.version,packageTitle:tool.title,description:tool.description,
      capabilities:tool.capabilities,packagePath,bytes:bytes.length,sha256:digest(bytes)});
  }
  const after=await fingerprint(root);
  if(JSON.stringify(before)!==JSON.stringify(after))fail('official tool sources changed during packaging');
  const catalog=validateOfficialReleaseCatalog({schema:OFFICIAL_RELEASE_SCHEMA,
    sourceRepository:source.sourceRepository,apps});
  resources.set(OFFICIAL_CATALOG_PATH,Buffer.from(JSON.stringify(catalog,null,2)+'\n'));
  return {catalog,resources,sourceInputs:before};
}
export async function buildOfficialTools(outputRoot,{root=REPOSITORY_ROOT}={}){
  const result=await createOfficialToolResources({root});
  await writeOfficialToolResources(result,outputRoot);return result;
}
export async function writeOfficialToolResources(result,outputRoot){
  // The caller selects the output root; normalize platform aliases such as
  // macOS /var -> /private/var. Everything below that root remains symlink-free.
  await mkdir(resolve(outputRoot),{recursive:true});
  if(!(await lstat(resolve(outputRoot))).isDirectory())fail('official output root must be a directory');
  const output=await realpath(resolve(outputRoot));
  // Build/validate the entire set before publishing any resource. Dev revisions
  // are guarded by its existing serial queue; catalog is published last.
  await safeDirectory(resolve(output,'official-tools'));
  let previous;
  try{
    const prior=resolve(output,OFFICIAL_CATALOG_PATH);
    if(!(await lstat(prior)).isFile())fail('invalid prior official manifest');
    previous=validateOfficialReleaseCatalog(JSON.parse(await readFile(prior,'utf8')));
  }
  catch(error){if(error.code!=='ENOENT')throw error;}
  for(const [path,bytes] of result.resources){
    const target=resolve(output,path);
    if(!target.startsWith(output+'/official-tools/'))fail('unsafe official output');
    await safeDirectory(dirname(target));
    const temp=target+'.'+randomUUID()+'.tmp';
    try{await writeFile(temp,bytes,{flag:'wx'});await rename(temp,target);}
    finally{await rm(temp,{force:true});}
  }
  // Only remove paths named by this generator's previous validated manifest.
  // Never clear unrelated files or another workflow's output tree.
  for(const release of previous?.apps||[]){
    if(result.resources.has(release.packagePath))continue;
    const target=resolve(output,release.packagePath);
    if(await realpath(dirname(target))!==dirname(target))fail('stale output directory is a symlink');
    await rm(target,{force:true});
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const flag=process.argv.indexOf('--out');
  const result=await buildOfficialTools(flag>=0?process.argv[flag+1]:'artifacts/official-tools-release');
  console.log(JSON.stringify({status:'GENERATED_NOT_INSTALLED',apps:result.catalog.apps,
    output:resolve(flag>=0?process.argv[flag+1]:'artifacts/official-tools-release')},null,2));
}
