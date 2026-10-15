// Deterministic local packer for standalone Sidebar UI tools.
// React/Vue/Tailwind may be compiled BEFORE packing; no npm or remote code runs in Chrome.
import {readFile,writeFile,mkdir,realpath,stat,lstat,readdir,rename,unlink} from 'node:fs/promises';
import {resolve,dirname,join,extname,basename} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {BUILTIN_CATALOG} from '../src/libs/catalog.js';
import {createHash,randomUUID} from 'node:crypto';
import {validateSidebarToolPackage,SIDEBAR_TOOL_FORMAT,SIDEBAR_TOOL_FORMAT_V2,serializeSidebarToolPackage} from '../src/ui/sidebar-tools/package.js';
import {compileSharedToolCss} from './preview/shared-tool-design.mjs';
import {compileToolLocaleCatalog} from '../src/ui/app-localization.js';
const fail=(message)=>{throw new Error('E_TOOL_BUILD: '+message);};
function rel(value) {
  if(typeof value!=='string'||value.length>180||!value||
      !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value) ||
      value.split('/').some(segment=>!segment||segment==='.'||segment==='..'))
    fail('invalid relative path: '+value);
  return value;
}
async function source(root,name,limit=220000,asBytes=false) {
  const path=resolve(root,rel(name));
  if(!path.startsWith(root+'/'))fail('source path escaped project');
  const actual=await realpath(path);
  if(!actual.startsWith(root+'/'))fail('symlink escaped project');
  const info=await stat(actual);
  if(!info.isFile()||info.size>limit)fail('source file exceeds budget: '+name);
  const bytes=await readFile(actual);
  return asBytes?bytes:new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}
export async function createSidebarToolPackage(projectPath) {
  const root=await realpath(projectPath);
  const meta=JSON.parse(await source(root,'tool.config.json',16384));
  const v2=meta?.format===SIDEBAR_TOOL_FORMAT_V2;
  if(!meta||typeof meta!=='object'||Array.isArray(meta)||
     Object.keys(meta).some(key=>!(v2
       ?['format','id','version','title','description','capabilities','files','assets','requires','contributes','locales']
       :['id','version','title','description','capabilities','files','assets','locales']).includes(key))||
     (!v2&&Object.hasOwn(meta,'format'))||
     !meta.files||typeof meta.files!=='object'||Array.isArray(meta.files)||
     Object.keys(meta.files).some(key=>!['html','css','js','dependencies'].includes(key))||
     !['html','css','js'].every(key=>Object.hasOwn(meta.files,key))||
     (Object.hasOwn(meta.files,'dependencies')&&!v2))
    
    fail('tool.config.json needs exactly HTML, CSS and JS file paths');
  const html=await source(root,meta.files.html,64000);
  let css=await source(root,meta.files.css,120000);
  // Only opted-in tools import the canonical non-privileged component CSS at build time.
  css=await compileSharedToolCss(css);
  let js=await source(root,meta.files.js,220000);
  // Build-only opt-in: localized resources are embedded into the SAME signed JS
  // package bytes. No package Schema change, network load or second runtime.
  const marker='__OPENDESK_TOOL_MESSAGES__';
  if(meta.locales!==undefined){
    if(typeof meta.locales!=='string'||!js.includes(marker)||js.split(marker).length!==2)
      fail('locales resource or main.js marker invalid');
    let catalog;
    try{catalog=compileToolLocaleCatalog(JSON.parse(await source(root,meta.locales,96000)));}
    catch(error){fail('invalid/stale locale resource: '+String(error?.message||error));}
    js=js.replace(marker,JSON.stringify(catalog));
    if(new TextEncoder().encode(js).byteLength>220000)fail('compiled tool JS exceeds budget');
  }else if(js.includes(marker))fail('tool locale marker without resources');

  const libraries=meta.files.dependencies||[];
  if(!Array.isArray(libraries)||libraries.length>8||
      new Set(libraries).size!==libraries.length||libraries.includes(meta.files.js))
    fail('fixed dependency paths must be unique, ordered, and limited to eight Classic files');
  const scripts=await Promise.all(libraries.map(async name=>{
    // A single explicit fixed asset alias is resolved through the existing
    // Catalog at build time. The installed sandbox still validates its SHA.
    if(name==='@opendesk-lib/papa-parse'){
      const row=BUILTIN_CATALOG.libraries.papaParse;
      if(row?.origin!=='vendor'||!row.source||!row.sha256||!row.bytes||!row.output)
        fail('Pinned Papa Parse catalog identity unavailable');
      const path=resolve(dirname(fileURLToPath(import.meta.url)),'..',row.source);
      const bytes=await readFile(path);
      const sha256=createHash('sha256').update(bytes).digest('hex');
      if(bytes.byteLength!==row.bytes||sha256!==row.sha256)
        fail('Pinned Papa Parse bytes differ from the catalog');
      const code=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
      return {name:row.output,sha256,code};
    }
    const code=await source(root,name,96000);
    const sha256=createHash('sha256').update(Buffer.from(code,'utf8')).digest('hex');
    return {name,sha256,code};
  }));
  let embeddedHtml=html;
  const assets=meta.assets||[];
  if(!Array.isArray(assets)||assets.length>16||new Set(assets).size!==assets.length)fail('invalid asset list');
  for(const name of assets) {
    const extension=extname(rel(name)).toLowerCase();
    const mime={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'}[extension];
    if(!mime)fail('only PNG/JPEG/WebP assets are supported: '+name);
    const bytes=await source(root,name,1024*96,true);
    const placeholder='{{asset:'+name+'}}';
    const uri='data:'+mime+';base64,'+bytes.toString('base64');
    if(!embeddedHtml.includes(placeholder)&&!css.includes(placeholder))fail('declared asset not referenced: '+name);
    embeddedHtml=embeddedHtml.replaceAll(placeholder,uri);
    css=css.replaceAll(placeholder,uri);
  }
  if(/\{\{asset:/.test(embeddedHtml+css))fail('unresolved local asset reference');
  const pkg=validateSidebarToolPackage({format:v2?SIDEBAR_TOOL_FORMAT_V2:SIDEBAR_TOOL_FORMAT,id:meta.id,version:meta.version,
    title:meta.title,description:meta.description,capabilities:meta.capabilities||[],html:embeddedHtml,css,js,
    ...(v2?{requires:meta.requires,contributes:meta.contributes,...(scripts.length?{scripts}:{})}:{})});
  return pkg;
}
// The digest/size must describe the actual portable UTF-8 file, including its
// canonical indentation and final newline, not a different compact encoding.
export function encodeSidebarToolPackage(pkg) {
  const bytes=Buffer.from(serializeSidebarToolPackage(pkg));
  if(bytes.length>320000)fail('encoded tool package exceeds 320 KB');
  return bytes;
}
// A single, stable root package is a deliberate release artifact. An ordinary
// build only writes an ignored candidate; never silently overwrite that package.
async function projectPackageDestination(projectPath,id){
  const root=await realpath(projectPath),filename=id+'.opendesk-tool.json';
  const extras=(await readdir(root)).filter(name=>name.endsWith('.opendesk-tool.json')&&name!==filename);
  if(extras.length)fail('multiple installable packages in tool directory: '+extras.join(', '));
  const output=join(root,filename);
  let existing;
  try{existing=await lstat(output);}
  catch(error){if(error?.code!=='ENOENT')throw error;}
  if(existing&&!existing.isFile())fail('project distributable must be a regular file: '+output);
  return {root,output,exists:Boolean(existing)};
}
function packageDigest(bytes){return createHash('sha256').update(bytes).digest('hex');}
export async function checkSidebarToolProjectPackage(projectPath){
  const pkg=await createSidebarToolPackage(projectPath),expected=encodeSidebarToolPackage(pkg);
  const {output,exists}=await projectPackageDestination(projectPath,pkg.id);
  if(!exists)fail('project installable package is missing; promote the tested candidate');
  const actual=await readFile(output);
  if(!actual.equals(expected))
    fail('project installable package differs from current source; test and promote a fresh candidate');
  return Object.freeze({status:'PROJECT_PACKAGE_MATCH',output,id:pkg.id,version:pkg.version,
    bytes:actual.length,sha256:packageDigest(actual),validated:true,installed:false});
}
export async function promoteSidebarToolPackage(projectPath,{from}={}){
  if(typeof from!=='string'||!from)fail('promotion requires --promote-from <tested-candidate>');
  const candidatePath=resolve(from),info=await lstat(candidatePath);
  if(!info.isFile())fail('candidate package must be a regular file');
  const bytes=await readFile(candidatePath);
  const pkg=await createSidebarToolPackage(projectPath),expected=encodeSidebarToolPackage(pkg);
  if(!bytes.equals(expected))
    fail('candidate is stale or not the same canonical package as current source; rebuild and rerun tests');
  const {root,output,exists}=await projectPackageDestination(projectPath,pkg.id);
  if(exists&&(await readFile(output)).equals(bytes))
    return Object.freeze({status:'PROJECT_PACKAGE_MATCH',output,id:pkg.id,version:pkg.version,
      bytes:bytes.length,sha256:packageDigest(bytes),unchanged:true,validated:true,installed:false});
  // Check the source again immediately before the atomic replacement. Never
  // clear an existing approved package when source or candidate validation fails.
  const latest=encodeSidebarToolPackage(await createSidebarToolPackage(projectPath));
  if(!latest.equals(bytes))fail('tool sources changed during promotion; discard stale candidate');
  const temp=join(root,'.'+pkg.id+'.opendesk-tool-promote-'+randomUUID()+'.tmp');
  try{
    await writeFile(temp,bytes,{flag:'wx',mode:0o644});
    // A replaced regular file stays intact until rename succeeds. Symlinks and
    // directories at the destination are never opened or followed for writing.
    const current=await lstat(output).catch(error=>{
      if(error?.code==='ENOENT')return null;
      throw error;
    });
    if(current&&!current.isFile())fail('project distributable must be a regular file: '+output);
    await rename(temp,output);
  }finally{
    await unlink(temp).catch(error=>{if(error?.code!=='ENOENT')throw error;});
  }
  return Object.freeze({status:'PROJECT_PACKAGE_PROMOTED',output,id:pkg.id,version:pkg.version,
    bytes:bytes.length,sha256:packageDigest(bytes),validated:true,installed:false});
}
export async function buildSidebarTool(projectPath,{out}={}){
  const pkg=await createSidebarToolPackage(projectPath),bytes=encodeSidebarToolPackage(pkg);
  const target=resolve(out||join('artifacts','sidebar-tools',pkg.id,pkg.version,pkg.id+'.opendesk-tool.json'));
  if(out!==undefined&&dirname(target)===await realpath(projectPath)&&target.endsWith('.opendesk-tool.json'))
    fail('do not write an untested installable JSON into the project directory; use --promote-from');
  await mkdir(dirname(target),{recursive:true});
  await writeFile(target,bytes,{flag:'w'});
  return {output:target,bytes:bytes.length,id:pkg.id,version:pkg.version,
    capabilities:pkg.capabilities,validated:true,installed:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const args=process.argv.slice(2);
  const path=args[0]&&!args[0].startsWith('--')?args.shift():'examples/sidebar-tools/quick-notes';
  let operation;
  if(args.length===0)operation=()=>buildSidebarTool(path);
  else if(args.length===2&&args[0]==='--out'&&args[1])
    operation=()=>buildSidebarTool(path,{out:args[1]});
  else if(args.length===2&&args[0]==='--promote-from'&&args[1])
    operation=()=>promoteSidebarToolPackage(path,{from:args[1]});
  else if(args.length===1&&args[0]==='--check-project')
    operation=()=>checkSidebarToolProjectPackage(path);
  else throw Error('Usage: build-sidebar-tool.mjs <project> [--out <candidate> | --promote-from <tested-candidate> | --check-project]');
  operation().then(value=>process.stdout.write(JSON.stringify(value,null,2)+'\n'))
    .catch(error=>{process.stderr.write(String(error.message||error)+'\n');process.exitCode=1;});
}
