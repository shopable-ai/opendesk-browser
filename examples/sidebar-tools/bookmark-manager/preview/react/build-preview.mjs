#!/usr/bin/env node
// R3.0.5: JSX is authoritative. Only an ignored offline HTML candidate is
// generated; Chromium-gated CI is the sole approver of preview/index.html.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir,rename,rm} from 'node:fs/promises';
import {watch as fsWatch} from 'node:fs';
import {dirname,resolve,join,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'vite';

const here=dirname(fileURLToPath(import.meta.url));
const toolDir=resolve(here,'../..');
const root=resolve(toolDir,'../../..');
const approved=join(toolDir,'preview/index.html');
const candidateDir=join(toolDir,'preview');
const candidate=join(candidateDir,'dev.html');
const sha=x=>createHash('sha256').update(x).digest('hex');
const read=p=>readFile(p,'utf8');
const manifestPattern=/(<script type="application\/json" id="opendesk-preview-manifest">)([^<]+)(<\/script>)/;
const framePattern=/atob\('[A-Za-z0-9+/=]+'\)/;
const encoded=x=>Buffer.from(x,'utf8').toString('base64');
const inputs=[
 join(toolDir,'src/react/App.jsx'),join(here,'src/main.jsx'),join(toolDir,'src/react/style.css'),
 join(here,'vite.config.mjs'),join(here,'package-lock.json'),
 join(root,'src/ui/design-tokens.css'),join(root,'src/ui/design-system.css'),
 join(root,'scripts/preview/bookmark-manager-mock.js'),
 join(toolDir,'src/model.js'),join(toolDir,'src/service.js')
];
async function inputFingerprint(){
 return sha((await Promise.all(inputs.map(read))).join('\0'));
}
async function generate(){
 for(let attempt=0;attempt<3;attempt++){
  const before=await inputFingerprint();
  await build({configFile:join(here,'vite.config.mjs'),logLevel:'error',clearScreen:false});
  const [out,bundle,style,tokens,designSystem,mock,model,service,main,app]=await Promise.all([
   read(approved),read(join(here,'dist/bookmark-react.js')),
   read(join(here,'dist/bookmark-react.css')),read(join(root,'src/ui/design-tokens.css')),
   read(join(root,'src/ui/design-system.css')),
   read(join(root,'scripts/preview/bookmark-manager-mock.js')),
   read(join(toolDir,'src/model.js')),read(join(toolDir,'src/service.js')),
   read(join(here,'src/main.jsx')),read(join(toolDir,'src/react/App.jsx'))
  ]);
  if(before!==await inputFingerprint())continue;
  const oldManifest=JSON.parse(out.match(manifestPattern)?.[2]||'null');
  assert.equal(oldManifest?.tool,'bookmark-manager');
  assert.match(out,/sandbox="allow-scripts"/);
  assert.doesNotMatch(out,/sandbox="[^"]*allow-same-origin/);
  assert.match(out,/class="preview-device"/);
  assert.match(out,/id="od-preview-bookmark-lab"/);
  assert.match(out,framePattern);
  assert.match(bundle,/__BookmarkReactPreview/);
  assert.match(app,/export default function App/);
  const scripts=[mock,model,service,bundle].map(code=>'<script src="data:text/javascript;base64,'+encoded(code)+'"></script>').join('');
  const frame='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">'+
   '<meta name="viewport" content="width=device-width,initial-scale=1">'+
   '<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; script-src data: &#39;unsafe-inline&#39;; style-src data: &#39;unsafe-inline&#39;; img-src data:; connect-src &#39;none&#39;; object-src &#39;none&#39;; base-uri &#39;none&#39;; form-action &#39;none&#39;">'+
   '<link rel="stylesheet" href="data:text/css;base64,'+encoded(tokens+'\n'+designSystem+'\n'+style)+'">'+
   '<style>html,body{height:100%;width:100%;margin:0;overflow:hidden}</style>'+
   '</head><body><div id="tool-root" data-react-root="bookmark-r304" aria-label="书签管理" style="height:100vh;min-height:0;overflow:hidden"></div>'+
   '<script>globalThis.__opendeskPreviewScenario="success";</script>'+scripts+'</body></html>';
  assert.equal((frame.match(/data:text\/javascript;base64,/g)||[]).length,4);
  const reactFiles={bundle:sha(bundle),css:sha(style),designSystem:sha(designSystem),model:sha(model),service:sha(service),mock:sha(mock),app:sha(app),main:sha(main)};
  const manifest={...oldManifest,previewBuild:'R3.0.5 REACT OFFLINE CANDIDATE',
   reactRuntime:true,reactFiles,reactFrameSha256:sha(frame),
   previewCandidate:'REACT_OFFLINE_MOCK',designStatus:'DESIGN_PROTOTYPE_NOT_SOURCE_BOUND',
   sourceBound:false,nativeVerified:false,previewViewportModes:[360,400,960]};
  const updated=out.replace(framePattern,()=>"atob('"+encoded(frame)+"')")
   .replace(manifestPattern,(_,open,ignored,close)=>open+JSON.stringify(manifest)+close);
  assert.match(updated,/"reactRuntime":true/);
  return {html:updated,sha256:sha(updated),bytes:Buffer.byteLength(updated),
   bundleBytes:Buffer.byteLength(bundle),cssBytes:Buffer.byteLength(style)};
 }
 throw Error('E_R305_SOURCE_CHANGED_DURING_BUILD: preserving last good candidate');
}
async function atomicWrite(value){
 await mkdir(candidateDir,{recursive:true});
 const temporary=join(candidateDir,'.bookmark-'+process.pid+'-'+randomUUID()+'.tmp');
 try{await writeFile(temporary,value,'utf8');await rename(temporary,candidate)}
 finally{await rm(temporary,{force:true})}
}
async function run(mode){
 const result=await generate();
 if(mode==='check'){
  const existing=await read(candidate).catch(()=>null);
  assert.equal(existing,result.html,'R305_CANDIDATE_DRIFT: run npm run preview:build');
 }else await atomicWrite(result.html);
 console.log(JSON.stringify({status:mode==='check'?'PREVIEW_CANDIDATE_MATCH':'PREVIEW_CANDIDATE_BUILT',
  file:candidate,sha256:result.sha256,htmlBytes:result.bytes,
  reactBundleBytes:result.bundleBytes,cssBytes:result.cssBytes,
  approvedHtmlUnchanged:true},null,2));
}
if(process.argv.includes('--watch')){
 let dirty=true,busy=false,closed=false,timer=null;
 async function drain(){
  if(busy||closed)return;
  busy=true;
  do{
   dirty=false;
   try{await run('build');process.exitCode=0}
   catch(error){console.error('R305_WATCH_BUILD_FAILED_KEEP_LAST_GOOD',error);process.exitCode=1}
  }while(dirty&&!closed);
  busy=false;
 }
 const schedule=()=>{if(closed)return;dirty=true;clearTimeout(timer);timer=setTimeout(()=>void drain(),150)};
 const watches=[
  fsWatch(join(here,'src'),{recursive:true},schedule),
  fsWatch(join(toolDir,'src'),{recursive:true},schedule),
  fsWatch(join(root,'scripts/preview'),{},(type,file)=>{if(String(file)==='bookmark-manager-mock.js')schedule()}),
  fsWatch(join(root,'src/ui'),{},(type,file)=>{if(String(file)==='design-tokens.css')schedule()}),
  fsWatch(here,{},(type,file)=>{if(['vite.config.mjs','package-lock.json','package.json'].includes(String(file)))schedule()}),
  fsWatch(dirname(approved),{},(type,file)=>{if(String(file)===basename(approved))schedule()})
 ];
 const close=()=>{closed=true;clearTimeout(timer);watches.forEach(w=>w.close());process.exit(0)};
 process.on('SIGINT',close);process.on('SIGTERM',close);
 await drain();
 console.log('R305_WATCH_READY '+candidate);
}else{
 await run(process.argv.includes('--check')?'check':'build');
}
