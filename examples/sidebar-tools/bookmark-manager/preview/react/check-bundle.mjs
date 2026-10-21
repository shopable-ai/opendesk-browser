#!/usr/bin/env node
// R3.0.5 non-release feasibility. Build the SAME App.jsx with formal SDK mount,
// then use the existing Sidebar Tool v2 validator/encoder. Never overwrite Classic src/main.js or the official package.
import {build} from 'vite';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createSidebarToolPackage,encodeSidebarToolPackage} from '../../../../../scripts/build-sidebar-tool.mjs';
const here=dirname(fileURLToPath(import.meta.url));
const toolDir=resolve(here,'../..');
const root=resolve(toolDir,'../../..');
const out=join(here,'.opendesk-preview/package-candidate');
const compiled=join(here,'.opendesk-preview/formal-dist');
const sha=x=>createHash('sha256').update(x).digest('hex');
const read=p=>readFile(p,'utf8');
const sourceFiles=Object.freeze({
 'inputs/BookmarkReactApp.jsx':join(toolDir,'src/react/App.jsx'),
 'inputs/bookmark-style.css':join(toolDir,'src/react/style.css'),
 'inputs/conversation.tsx':join(root,'src/ui/react/components/conversation.tsx'),
 'inputs/conversation-dock.css':join(root,'src/ui/react/components/conversation-dock.css'),
 'inputs/bookmark-actions.js':join(root,'src/ui/conversation/bookmark-actions.js'),
 'inputs/button.tsx':join(root,'src/ui/react/components/ui/button.tsx'),
 'inputs/formal.jsx':join(here,'src/formal.jsx'),
 'inputs/vite.config.mjs':join(here,'vite.config.mjs'),
 'inputs/tool.config.json':join(toolDir,'tool.config.json')
});
const fingerprints=async()=>Object.fromEntries(await Promise.all(
 Object.entries(sourceFiles).map(async([name,file])=>[name,sha(await readFile(file))])));
const fileReceipt=bytes=>({bytes:Buffer.byteLength(bytes),sha256:sha(bytes)});
const report={status:'NOT_TESTED',candidateOnly:true,installed:false,
 limits:{js:220000,dependencyEach:96000,dependencyCount:8,css:120000,html:64000,totalPackage:320000}};
try{
 const sourceBefore=await fingerprints();
 // Only this independent non-release sandbox feasibility candidate externalizes
 // the EXISTING shared page React runtime. The production trusted Bookmark Host,
 // preview UI and their React/CSS compilation paths remain unchanged.
 await build({configFile:join(here,'vite.config.mjs'),clearScreen:false,logLevel:'error',
  build:{outDir:compiled,lib:{entry:join(here,'src/formal.jsx'),
   name:'OpenDeskBookmarkReactFormal',formats:['iife'],
   fileName:()=> 'bookmark-formal.js',cssFileName:'bookmark-react'},
   rollupOptions:{external:['react','react-dom/client','react/jsx-runtime'],
    output:{inlineDynamicImports:true,globals:{react:'OpenDeskPageReact',
     'react-dom/client':'OpenDeskPageReact','react/jsx-runtime':'OpenDeskPageReact'}}}}});
 assert.deepEqual(await fingerprints(),sourceBefore,
  'React sources changed during the standalone budget build; no candidate was approved');
 const [js,css,tokens,model,service,base,runtime]=await Promise.all([
  read(join(compiled,'bookmark-formal.js')),read(join(compiled,'bookmark-react.css')),
  read(join(root,'src/ui/design-tokens.css')),read(join(toolDir,'src/model.js')),
  read(join(toolDir,'src/service.js')),read(join(toolDir,'tool.config.json')),
  read(join(root,'src/libs/page-frameworks/react-19.2.0.js'))]);
 assert.match(runtime,/Object\.defineProperty\(globalThis,"OpenDeskPageReact"/,
  'Existing page runtime must still provide the reviewed immutable React global');
 assert.match(js,/OpenDeskPageReact/,
  'Compiled sandbox candidate must use the existing shared runtime');
 const files={js,css:tokens+'\n'+css,model,service};
 for(const [name,value] of Object.entries(files)){
  report[name+'Bytes']=Buffer.byteLength(value);report[name+'Sha256']=sha(value);
 }
 report.dependencyOrder=['src/model.js','src/service.js'];
 report.uiRuntime='opendesk.react-ui.v1';
 report.runtime={path:'src/libs/page-frameworks/react-19.2.0.js',
  bytes:Buffer.byteLength(runtime),sha256:sha(runtime),
  global:'OpenDeskPageReact',installed:false,verification:'SCHEMA_AND_BUDGET_ONLY'};
 const baseConfig=JSON.parse(base);
 const stagedFiles={
  'dist/bookmark-formal.js':js,
  'dist/bookmark-react.css':files.css
 };
 await Promise.all(['src','dist','inputs'].map(name=>mkdir(join(out,name),{recursive:true})));
 await Promise.all([
  ...Object.entries(stagedFiles).map(([name,value])=>writeFile(join(out,name),value)),
  writeFile(join(out,'src/model.js'),model),writeFile(join(out,'src/service.js'),service),
  writeFile(join(out,'src/index.html'),'<main data-bookmark-react-root aria-label="书签管理"></main>'),
  writeFile(join(out,'tool.config.json'),JSON.stringify({...baseConfig,uiRuntime:report.uiRuntime,files:{
   html:'src/index.html',css:'dist/bookmark-react.css',js:'dist/bookmark-formal.js',
   dependencies:report.dependencyOrder}},null,2))
 ]);
 // An opted-in compiled tool is not packable without a source-bound receipt.
 // Copy the exact audited inputs into the ignored candidate. The stock package
 // validator checks every listed digest and both output bytes on every read.
 const sources={};
 for(const [name,original] of Object.entries(sourceFiles)){
  const bytes=await readFile(original);
  assert.equal(sha(bytes),sourceBefore[name],'Source changed before receipt: '+name);
  await writeFile(join(out,name),bytes);
  sources[name]=fileReceipt(bytes);
 }
 assert.deepEqual(await fingerprints(),sourceBefore,
  'React sources changed while generating build provenance');
 const emitted=Object.fromEntries(Object.entries(stagedFiles)
  .map(([name,value])=>[name,fileReceipt(value)]));
 const ready={format:'opendesk.ui-build-ready.v1',
  buildId:sha(Buffer.from(JSON.stringify({sources,files:emitted}))),
  sources,files:emitted};
 await writeFile(join(out,'dist/build-ready.json'),JSON.stringify(ready,null,2)+'\n');
 report.buildId=ready.buildId;
 report.sourceBound=true;
 try{
  const pkg=await createSidebarToolPackage(out);
  const bytes=encodeSidebarToolPackage(pkg);
  report.status='SCHEMA_BUNDLE_READY_NOT_INSTALLED';
  report.packageBytes=bytes.byteLength;report.packageSha256=sha(bytes);
  report.packageVersion=pkg.version;
 }catch(error){
  if(!/exceeds budget|exceeds 320 KB|source file exceeds/i.test(String(error)))
   throw error;
  report.status='BUDGET_BLOCKED';report.blocker=String(error?.message||error);
  process.exitCode=1;
 }
}catch(error){
 report.status='NOT_TESTED';report.error=String(error?.stack||error);
 process.exitCode=1;
}finally{
 await mkdir(join(here,'.opendesk-preview'),{recursive:true});
 await writeFile(join(here,'.opendesk-preview/budget-report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
}
