#!/usr/bin/env node
// R3.0.5 non-release feasibility. Build the SAME App.jsx with formal SDK mount,
// then use the existing Sidebar Tool v2 validator/encoder. Never touch src or package.
import {build} from 'vite';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createSidebarToolPackage,encodeSidebarToolPackage} from '../../../../../scripts/build-sidebar-tool.mjs';
const here=dirname(fileURLToPath(import.meta.url));
const toolDir=resolve(here,'../..');
const root=resolve(toolDir,'../../..');
const out=join(here,'.opendesk-preview/package-candidate');
const compiled=join(here,'dist-formal');
const sha=x=>createHash('sha256').update(x).digest('hex');
const read=p=>readFile(p,'utf8');
const report={status:'NOT_TESTED',candidateOnly:true,installed:false,
 limits:{js:220000,dependencyEach:96000,dependencyCount:8,css:120000,html:64000,totalPackage:320000}};
try{
 await build({configFile:join(here,'vite.config.mjs'),clearScreen:false,logLevel:'error',
  build:{outDir:compiled,lib:{entry:join(here,'src/formal.jsx'),
   name:'OpenDeskBookmarkReactFormal',formats:['iife'],
   fileName:()=> 'bookmark-formal.js',cssFileName:'bookmark-react'}}});
 const [js,css,tokens,model,service,base]=await Promise.all([
  read(join(compiled,'bookmark-formal.js')),read(join(compiled,'bookmark-react.css')),
  read(join(root,'src/ui/design-tokens.css')),read(join(toolDir,'src/model.js')),
  read(join(toolDir,'src/service.js')),read(join(toolDir,'tool.config.json'))]);
 const files={js,css:tokens+'\n'+css,model,service};
 for(const [name,value] of Object.entries(files)){
  report[name+'Bytes']=Buffer.byteLength(value);report[name+'Sha256']=sha(value);
 }
 report.dependencyOrder=['src/model.js','src/service.js'];
 const baseConfig=JSON.parse(base);
 await mkdir(join(out,'src'),{recursive:true});
 await Promise.all([
  writeFile(join(out,'src/main.js'),js),writeFile(join(out,'src/style.css'),files.css),
  writeFile(join(out,'src/model.js'),model),writeFile(join(out,'src/service.js'),service),
  writeFile(join(out,'src/index.html'),'<main data-bookmark-react-root aria-label="书签管理"></main>'),
  writeFile(join(out,'tool.config.json'),JSON.stringify({...baseConfig,files:{
   html:'src/index.html',css:'src/style.css',js:'src/main.js',dependencies:report.dependencyOrder}},null,2))
 ]);
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
 }
}catch(error){
 report.status='NOT_TESTED';report.error=String(error?.stack||error);
 process.exitCode=1;
}finally{
 await mkdir(join(here,'.opendesk-preview'),{recursive:true});
 await writeFile(join(here,'.opendesk-preview/budget-report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
}
