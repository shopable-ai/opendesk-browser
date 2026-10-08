// Deterministic local packer for standalone Sidebar UI tools.
// React/Vue/Tailwind may be compiled BEFORE packing; no npm or remote code runs in Chrome.
import {readFile,writeFile,mkdir,realpath,stat} from 'node:fs/promises';
import {resolve,dirname,join,extname,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {validateSidebarToolPackage,SIDEBAR_TOOL_FORMAT} from '../src/ui/sidebar-tools/package.js';
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
export async function buildSidebarTool(projectPath,{out}={}) {
  const root=await realpath(projectPath);
  const meta=JSON.parse(await source(root,'tool.config.json',16384));
  if(!meta||typeof meta!=='object'||Array.isArray(meta)||
     Object.keys(meta).some(key=>!['id','version','title','description','capabilities','files','assets'].includes(key))||
     !meta.files||typeof meta.files!=='object'||Array.isArray(meta.files)||
     Object.keys(meta.files).sort().join(',')!=='css,html,js')
    fail('tool.config.json needs exactly HTML, CSS and JS file paths');
  const html=await source(root,meta.files.html,64000);
  let css=await source(root,meta.files.css,120000);
  const js=await source(root,meta.files.js,220000);
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
  const pkg=validateSidebarToolPackage({format:SIDEBAR_TOOL_FORMAT,id:meta.id,version:meta.version,
    title:meta.title,description:meta.description,capabilities:meta.capabilities||[],html:embeddedHtml,css,js});
  const target=resolve(out||join('artifacts','sidebar-tools',pkg.id,pkg.version,pkg.id+'.opendesk-tool.json'));
  await mkdir(dirname(target),{recursive:true});
  await writeFile(target,JSON.stringify(pkg,null,2)+'\n',{flag:'w'});
  return {output:target,bytes:Buffer.byteLength(JSON.stringify(pkg)),id:pkg.id,version:pkg.version,
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
