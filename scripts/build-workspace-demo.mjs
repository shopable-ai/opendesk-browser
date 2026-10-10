import {build} from 'vite';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {DEMO_FILES} from '../src/native-agent/file-workspace-demo.js';

// The standalone UI uses the SAME view/preview modules with an explicitly
// labelled in-memory backend. Native access exists only in the extension.
const output=resolve('examples/ui/webcodex-workspace-demo.html');
const built=await build({configFile:false,logLevel:'error',build:{write:false,minify:'esbuild',
  lib:{entry:resolve('examples/ui/webcodex-demo-entry.js'),formats:['iife'],name:'OpenDeskWorkspaceDemo'},
  rollupOptions:{output:{inlineDynamicImports:true}}}});
const result=Array.isArray(built)?built[0]:built;
const js=result.output.find(part=>part.type==='chunk').code.replace(/<\/script/gi,'<\\/script');
const css=await readFile('src/native-agent/workspace.css','utf8');
const source=await readFile('src/native-agent/workspace.html','utf8');
const html=source.replace('<link rel="stylesheet" href="workspace.css">','<style>'+css+'</style>')
  .replace('<script src="settings.js"></script>','<script>'+js+'</script>')
  .replace('<title>OpenDesk · 本地文件工作区</title>','<title>OpenDesk · 本地工作区交互 Demo（内存演示）</title>');
await writeFile(output,html);
for(const [path,content] of Object.entries(DEMO_FILES)){
  const dest=resolve('examples/local-workspace',path);await mkdir(resolve(dest,'..'),{recursive:true});await writeFile(dest,content);
}
console.log(JSON.stringify({demo:output,bytes:Buffer.byteLength(html),backend:'memory-only',native:false}));
