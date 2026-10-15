// Deterministic local packer for standalone Sidebar UI tools.
// React/Vue/Tailwind may be compiled BEFORE packing; no npm or remote code runs in Chrome.
import {readFile,writeFile,mkdir,realpath,stat,lstat} from 'node:fs/promises';
import {resolve,dirname,join,extname,basename} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {BUILTIN_CATALOG} from '../src/libs/catalog.js';
import {createHash} from 'node:crypto';
import {validateSidebarToolPackage,SIDEBAR_TOOL_FORMAT,SIDEBAR_TOOL_FORMAT_V2,serializeSidebarToolPackage} from '../src/ui/sidebar-tools/package.js';
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
       ?['format','id','version','title','description','capabilities','files','assets','requires','contributes']
       :['id','version','title','description','capabilities','files','assets']).includes(key))||
     (!v2&&Object.hasOwn(meta,'format'))||
     !meta.files||typeof meta.files!=='object'||Array.isArray(meta.files)||
     Object.keys(meta.files).some(key=>!['html','css','js','dependencies'].includes(key))||
     !['html','css','js'].every(key=>Object.hasOwn(meta.files,key))||
     (Object.hasOwn(meta.files,'dependencies')&&!v2))
    
    fail('tool.config.json needs exactly HTML, CSS and JS file paths');
  const html=await source(root,meta.files.html,64000);
  let css=await source(root,meta.files.css,120000);
  const js=await source(root,meta.files.js,220000);
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
export async function buildSidebarTool(projectPath,{out}={}) {
  const pkg=await createSidebarToolPackage(projectPath),bytes=encodeSidebarToolPackage(pkg);
  const target=resolve(out||join('artifacts','sidebar-tools',pkg.id,pkg.version,pkg.id+'.opendesk-tool.json'));
  await mkdir(dirname(target),{recursive:true});
  await writeFile(target,bytes,{flag:'w'});
  // An existing, regular <id>.opendesk-tool.json is an opt-in portable
  // distribution artifact. Keep the original artifacts/ output for every tool,
  // without automatically creating new generated files in other source dirs.
  // Explicit --out writes only the requested file.
  let projectOutput;
  if(out===undefined){
    const candidate=join(await realpath(projectPath),pkg.id+'.opendesk-tool.json');
    let existing;
    try{existing=await lstat(candidate);}catch(error){if(error?.code!=='ENOENT')throw error;}
    if(existing){
      if(!existing.isFile())fail('project distributable must be a regular file: '+candidate);
      await writeFile(candidate,bytes,{flag:'w'});
      projectOutput=candidate;
    }
  }
  return {output:target,...(projectOutput?{projectOutput}:{}),bytes:bytes.length,id:pkg.id,version:pkg.version,
    capabilities:pkg.capabilities,validated:true,installed:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const path=process.argv[2]||'examples/sidebar-tools/quick-notes';
  const flag=process.argv.indexOf('--out');
  buildSidebarTool(path,{out:flag>=0?process.argv[flag+1]:undefined}).then(value=>
    process.stdout.write(JSON.stringify(value,null,2)+'\n')).catch(error=>{
      process.stderr.write(String(error.message||error)+'\n');process.exitCode=1;
    });
}
