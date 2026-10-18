// Stage byte-identical real tool/build sources into two local preview frames.
// The SDK adapter remains visibly simulated; only installed Chrome validates real RPC.
import {createHash} from 'node:crypto';
import {mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createSidebarToolPackage} from '../../../../scripts/build-sidebar-tool.mjs';
import {PAGE_FRAMEWORK_RUNTIMES} from '../../../../src/libs/page-frameworks/contract.js';
const project=fileURLToPath(new URL('../',import.meta.url));
const repo=resolve(project,'../../..');
const original=resolve(repo,'examples/sidebar-tools/quick-notes');
const output=resolve(project,'.opendesk-preview');
const browserOutput=resolve(output,'browser');
const browserBuild=resolve(repo,process.env.OPENDESK_SHARED_UI_EXTENSION_DIR||'dist/development');
const react=PAGE_FRAMEWORK_RUNTIMES.react;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const record=(path,bytes)=>({path,bytes:bytes.length,sha256:sha(bytes)});
async function write(path,data){
  await mkdir(dirname(path),{recursive:true});
  await writeFile(path,data);
}
const toolInputs=[
 'tool.config.json','package.json','vite.config.mjs','src/main.jsx','src/App.jsx',
 'src/model.js','src/root.html','src/style.css','assets/mark.png',
 'preview/index.html','preview/compare.html','preview/sdk-preview.js',
 'scripts/stage-preview.mjs','scripts/compare.mjs'
];
const nativeInputs=['tool.config.json','src/index.html','src/main.js','src/style.css','assets/mark.png'];
async function readInputs(){
  const rows=[];
  for(const [dir,names,prefix] of [[project,toolInputs,'react'],[original,nativeInputs,'native']]){
    for(const name of names)rows.push(record(prefix+'/'+name,await readFile(resolve(dir,name))));
  }
  return rows;
}
async function run(){
  // A failed stage must never expose the last successful build as current.
  await rm(output,{force:true,recursive:true});
  const before=await readInputs();
  const readyBytes=await readFile(resolve(project,'dist/build-ready.json'));
  const ready=JSON.parse(readyBytes);
  if(ready.format!=='opendesk.ui-build-ready.v1')throw Error('Vite build receipt missing');
  const tools={};
  for(const name of ['tool.js','tool.css']){
    const bytes=await readFile(resolve(project,'dist',name));
    if(!bytes.length||ready.files?.['dist/'+name]?.bytes!==bytes.length||
      ready.files?.['dist/'+name]?.sha256!==sha(bytes))
      throw Error('Stale/invalid compiled React output: '+name);
    tools[name]=record('dist/'+name,bytes);
  }
  const manifest=await readFile(resolve(browserBuild,'manifest.json'));
  if(JSON.parse(manifest).manifest_version!==3)throw Error('Expected existing MV3 output');
  const browserPaths=[react.output,'sidebar-shared-ui.js','ui/design-tokens.css',
    react.licensePath,'licenses/shared-ui-third-party-notices.txt'];
  const staged=[];
  for(const path of browserPaths){
    const bytes=await readFile(resolve(browserBuild,path));
    if(!bytes.length)throw Error('Empty shared runtime asset: '+path);
    if(path===react.output&&(bytes.length!==react.bytes||sha(bytes)!==react.sha256))
      throw Error('Browser pinned React runtime differs from contract');
    await write(resolve(browserOutput,path),bytes);
    staged.push(record(path,bytes));
  }
  // The Vite CSS is a source input; the installed package CSS additionally includes
  // canonical shared design/reset rules. Preview the exact packaged bytes.
  const reactPackage=await createSidebarToolPackage(project);
  if(reactPackage.id!=='quick-notes-react'||reactPackage.uiRuntime!=='opendesk.react-ui.v1')
    throw Error('Unexpected React package identity/runtime');
  await write(resolve(output,'react.css'),reactPackage.css);
  // Only the native official sources are used; no copied native business implementation.
  const pkg=await createSidebarToolPackage(original);
  if(pkg.id!=='quick-notes')throw Error('Native baseline identity changed');
  const nativeHtml='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">'+
    '<meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<title>Quick Notes 原版同源预览</title><link rel="stylesheet" href="./native.css">'+
    '<style>.preview-banner{font:12px system-ui;padding:8px 12px;background:#fff5d6;color:#533c00}</style>'+
    '</head><body style="margin:0">'+
    '<div class="preview-banner">原生正式源码预览 · SDK 为内存模拟，不读取用户笔记。</div>'+
    '<div id="tool-root">'+pkg.html+'</div>'+
    '<script src="../preview/sdk-preview.js"></script>'+
    '<script src="./native.js"></script></body></html>';
  const nativeFiles={'native.html':nativeHtml,'native.css':pkg.css,'native.js':pkg.js};
  for(const [name,contents] of Object.entries(nativeFiles))
    await write(resolve(output,name),contents);
  const after=await readInputs();
  if(JSON.stringify(before)!==JSON.stringify(after)){
    await rm(output,{recursive:true,force:true});
    throw Error('Preview sources changed during staging');
  }
  await write(resolve(output,'receipt.json'),JSON.stringify({
    format:'opendesk.quick-notes-react-preview.v1',
    originalBaseline:{id:pkg.id,version:pkg.version},
    buildReady:record('dist/build-ready.json',readyBytes),
    extensionDir:relative(repo,browserBuild),
    extensionManifest:record('manifest.json',manifest),
    sources:before,toolBuild:Object.values(tools),browserAssets:staged,
    reactPackageCss:record('react.css',Buffer.from(reactPackage.css)),
    nativePreview:Object.entries(nativeFiles).map(([name,data])=>record(name,Buffer.from(data)))
  },null,2)+'\n');
  process.stdout.write('STAGED_SOURCE_BOUND_PREVIEW '+resolve(project,'preview/compare.html')+'\n');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
