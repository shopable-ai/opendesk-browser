import {build} from 'vite';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {DEMO_FILES} from '../src/native-agent/file-workspace-demo.js';
import {compileWorkspaceStyle} from './build-workspace-style.mjs';

// The standalone UI uses the SAME view/preview modules with an explicitly
// labelled in-memory backend. Native access exists only in the extension.
export async function buildWorkspaceDemo({output=resolve('examples/ui/webcodex-workspace-demo.html'),
  fixtureRoot=resolve('examples/local-workspace')}={}) {
  const styleRoot=await mkdtemp(resolve(tmpdir(),'opendesk-workspace-demo-style-'));
  try {
    const built=await build({configFile:false,logLevel:'error',build:{write:false,minify:'esbuild',
      lib:{entry:resolve('examples/ui/webcodex-demo-entry.js'),formats:['iife'],name:'OpenDeskWorkspaceDemo'},
      rollupOptions:{output:{inlineDynamicImports:true}}}});
    const result=Array.isArray(built)?built[0]:built;
    const js=result.output.find(part=>part.type==='chunk').code.replace(/<\/script/gi,'<\\/script');
    const style=await compileWorkspaceStyle(styleRoot);
    const css=await readFile(resolve(styleRoot,style.path),'utf8');
    const source=await readFile('src/native-agent/workspace.html','utf8');
    const html=source.replace('<link rel="stylesheet" href="workspace.css">','<style>'+css+'</style>')
      .replace('<script src="settings.js"></script>','<script>'+js+'</script>')
      .replace('<title>OpenDesk · 本地文件工作区</title>','<title>OpenDesk · 本地工作区交互 Demo（内存演示）</title>');
    await mkdir(dirname(output),{recursive:true});
    await writeFile(output,html);
    for(const [path,content] of Object.entries(DEMO_FILES)){
      const dest=resolve(fixtureRoot,path);await mkdir(dirname(dest),{recursive:true});await writeFile(dest,content);
    }
    return {demo:output,bytes:Buffer.byteLength(html),backend:'memory-only',native:false,cssSha256:style.sha256};
  } finally {await rm(styleRoot,{recursive:true,force:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  console.log(JSON.stringify(await buildWorkspaceDemo()));
