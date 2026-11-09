// Real Chromium layout of the compiled trusted Surface in the actual Host DOM
// and styles. Service/storage stay memory-only; never changes Chrome proxy.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {launchDialogChrome} from './trusted-dialog-cdp.mjs';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createSidebarToolPackage,encodeSidebarToolPackage} from '../../../scripts/build-sidebar-tool.mjs';
const repo=fileURLToPath(new URL('../../..',import.meta.url));
// app-ci.mjs supplies only argv[2] (the evidence directory), not APP_CI_PACKAGE.
const out=resolve(process.argv[2]||'artifacts/app-ci/ai-proxy/chrome');
await mkdir(out,{recursive:true});
const sources={};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function candidateIdentity(){
 const path='artifacts/app-ci/ai-proxy/candidate.opendesk-tool.json';
 const candidateDir=process.env.AI_PROXY_CI_CANDIDATE_DIR||join(repo,'artifacts/app-ci/ai-proxy');
 const bytes=await readFile(join(candidateDir,'candidate.opendesk-tool.json'));
 const receipt=JSON.parse(await readFile(join(candidateDir,'candidate-receipt.json'),'utf8'));
 const canonical=encodeSidebarToolPackage(await createSidebarToolPackage(join(repo,'projects/ai-proxy')));
 const meta=JSON.parse(await readFile(join(repo,'projects/ai-proxy/tool.config.json'),'utf8'));
 const commit=process.env.GITHUB_SHA||execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim();
 assert.equal(bytes.equals(canonical),true,'App CI candidate must match current project compiled inputs');
 assert.equal(receipt.schema,'opendesk.app-ci-candidate.v1');
 assert.equal(receipt.project,'projects/ai-proxy');
 assert.equal(receipt.output,path);
 assert.equal(receipt.kind,'react');
 assert.equal(receipt.id,meta.id);
 assert.equal(receipt.version,meta.version);
 assert.equal(receipt.bytes,bytes.length);
 assert.equal(receipt.sha256,hash(bytes));
 assert.deepEqual(receipt.capabilities,meta.capabilities);
 assert.equal(receipt.sourceCommit,commit,'App CI candidate commit drift');
 return {path,id:meta.id,version:meta.version,sha256:hash(bytes),sourceCommit:commit};
}
const candidate=await candidateIdentity();
async function source(path){const bytes=await readFile(path);sources[relative(repo,path)]=hash(bytes);return bytes.toString();}
const bundle=await build({stdin:{contents:`
 import * as React from 'react';
 import {createRoot} from 'react-dom/client';
 import {createPortal} from 'react-dom';
 import Surface from './projects/ai-proxy/trusted/Surface.jsx';
 import {configureEnvironment} from './projects/ai-proxy/src/environment';
 import {createPreviewBoundary} from './projects/ai-proxy/preview/sdk-preview';
 const container=document.getElementById('sidebar-tool-frame');
 // This Host fixture has no enhanced Header bridge. Exercise the real App's
 // content-action fallback rather than inventing Header business behavior.
 const env=configureEnvironment({root:container,locale:'zh-CN'},null,{trusted:true,preview:createPreviewBoundary()});
 createRoot(document.getElementById('react-root')).render(createPortal(<Surface/>,container));
 addEventListener('pagehide',()=>env.dispose(),{once:true});
 `,resolveDir:repo,loader:'jsx'},bundle:true,write:false,outdir:join(out,'compiled'),format:'iife',jsx:'transform',metafile:true,
 alias:{'@opendesk/ui':join(repo,'src/ui/react/components/ui/button.tsx')},
 define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'surface-css',setup(builder){
  builder.onResolve({filter:/\?(?:inline|raw)$/},args=>({path:resolve(args.resolveDir,args.path.split('?')[0]),namespace:'surface-css'}));
  builder.onLoad({filter:/.*/,namespace:'surface-css'},async args=>{
   if(!args.path.endsWith('.css'))return {contents:await source(args.path),loader:'text'};
   const css=await build({entryPoints:[args.path],bundle:true,write:false,metafile:true});
   for(const path of Object.keys(css.metafile.inputs))await source(resolve(path));
   return {contents:css.outputFiles[0].text,loader:'text'};
  });
 }}]});
for(const path of Object.keys(bundle.metafile.inputs))if(!path.startsWith('<')&&!path.startsWith('surface-css:')&&!path.includes('node_modules/'))await source(resolve(path));
const css=(await Promise.all(['design-tokens.css','design-system.css','tool-shell.css','react/components/ui/sidebar-shared.css'].map(p=>source(join(repo,'src/ui',p))))).join('\n');
const componentCss=bundle.outputFiles.filter(file=>file.path.endsWith('.css')).map(file=>file.text).join('\n');
const componentJs=bundle.outputFiles.find(file=>file.path.endsWith('.js')).text;
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>${css}\n${componentCss}</style>
<div class="opendesk-react-app"><nav class="workbench-nav"><button>扩展</button></nav>
<main id="workspace-content"><div id="workbench-tools"><div id="sidebar-tools"><div class="sidebar-tool-host"><div id="sidebar-tool-display">
<header class="sidebar-tool-view-head"><h1>AI Proxy</h1></header><div id="sidebar-tool-frame" class="sidebar-tool-frame" data-ai-proxy-trusted="true"></div>
</div></div></div></div></main></div><div id="react-root"></div><script>${componentJs.replaceAll('</script','<\\/script')}</script></html>`;
const server=createServer((_req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);});
let browser,page;
const report={kind:'trusted Surface/Host DOM; memory service; no install or real proxy',candidate,installation:'NOT_TESTED',proxyNetwork:'NOT_TESTED',at:new Date().toISOString(),sources,checks:[],errors:[]};
try{
 assert.ok(process.env.CHROME_BIN,'CHROME_BIN is required; no implicit browser fallback');
 await new Promise((done,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',done);});
 browser=await launchDialogChrome(process.env.CHROME_BIN,report.errors);
 report.browser=browser.version;report.profile=browser.profile;
 page=browser;
 await page.goto(`http://127.0.0.1:${server.address().port}/`);
 await page.locator('#quick-settings').click();
 assert.equal(await page.locator('iframe').count(),0);
 assert.equal(await page.locator('#settings-section option').count(),7);
 const bounds=await page.locator('#sidebar-tool-frame').evaluate(el=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height,viewport:innerHeight};});
 report.frame=bounds;assert.ok(bounds.height>200&&bounds.bottom<=bounds.viewport+1,'trusted frame must fill remaining Host height inside its viewport');
 await page.locator('button','＋ 添加代理').click();
 const dialog=page.locator('.proxyEditorDialog');await dialog.waitFor({state:'visible'});
 assert.equal(await page.locator('#ep-host').evaluate(el=>el===document.activeElement),true);
 await page.locator('.proxyAuthDetails summary').click();
 const geometry=await dialog.evaluate(el=>{const d=el.getBoundingClientRect(),footer=el.querySelector('.editorActions').getBoundingClientRect(),fields=el.querySelector('.proxyEditorFields');return {top:d.top,bottom:d.bottom,footerTop:footer.top,footerBottom:footer.bottom,viewport:innerHeight,scrolls:fields.scrollHeight>fields.clientHeight};});
 report.dialog=geometry;
 assert.ok(geometry.top>=0&&geometry.bottom<=geometry.viewport+1,'dialog must stay inside the real viewport');
 assert.ok(geometry.footerBottom<=geometry.viewport&&geometry.footerTop>=geometry.top,'Save and Cancel must remain visible with expanded fields');
 assert.equal(geometry.scrolls,true,'long editor fields own scrolling while actions remain visible');
 await page.screenshot({path:join(out,'trusted-dialog.png')});
 await page.locator('#ep-host').fill('proxy.example.net');
 await page.locator('#ep-port').fill('8080');
 await page.locator('#ep-name').fill('Memory dialog check');
 await page.locator('#ep-host').press('Escape');
 await page.locator('#proxy-confirm-cancel').click();
 assert.equal(await page.locator('#ep-host').inputValue(),'proxy.example.net');
 await page.locator('#ep-host').press('Escape');await page.locator('#proxy-confirm-accept').click();
 await dialog.waitFor({state:'hidden'});
 assert.equal(await page.locator('button','＋ 添加代理').evaluate(el=>el===document.activeElement),true);
 await page.locator('button','＋ 添加代理').click();
 await page.locator('#ep-host').fill('proxy.example.net');await page.locator('#ep-port').fill('8080');
 await page.locator('#ep-name').fill('Memory dialog check');
 await dialog.locator('button[type="submit"]:not([data-add-another])').click();
 await dialog.waitFor({state:'hidden'});
 await page.locator('*','Memory dialog check').waitFor();
 assert.equal(await page.locator('.proxyApplied').count(),0);
 assert.equal(await page.locator('button','＋ 添加代理').evaluate(el=>el===document.activeElement),true);
 await page.locator('button','＋ 添加代理').click();
 await page.locator('#ep-host').fill('another.example.net');await page.locator('#ep-port').fill('8081');
 await dialog.locator('[data-add-another="true"]').click();
 await page.waitForFunction(()=>document.querySelector('#ep-host')?.value==='');
 assert.equal(await page.locator('#ep-host').evaluate(el=>el===document.activeElement),true);
 await page.locator('#ep-host').press('Escape');await dialog.waitFor({state:'hidden'});
 const sections=await page.locator('#settings-section option').evaluateAll(options=>options.map(o=>o.value));
 for(const section of sections){await page.locator('#settings-section').selectOption(section);await page.locator('.optionsContent--'+section).waitFor();}
 await page.locator('#settings-section').selectOption('general');
 for(const locale of ['en','zh-TW','zh-CN']){await page.locator('#ui-locale').selectOption(locale);await page.waitForFunction(value=>document.querySelector('#ui-locale')?.value===value,locale);}
 await page.locator('#settings-close').click();await page.locator('#quick-settings').waitFor();
 report.checks.push('trusted portal has no iframe; seven settings sections preserved','Host frame fits remaining viewport','expanded editor scrolls fields with visible actions','initial and return focus','Escape Keep retains draft; explicit discard closes','Save creates memory configuration without applying proxy');
 report.checks.push('Save and add another clears fields and focuses host','all seven sections and three locale choices render in the trusted document');
 assert.deepEqual(report.errors,[]);
 assert.deepEqual(await candidateIdentity(),candidate,'candidate changed during browser checks');
 for(const [path,sha256] of Object.entries(sources))assert.equal(hash(await readFile(join(repo,path))),sha256,'component source changed during browser checks: '+path);
 report.result='PASS';
}catch(error){report.result='FAIL';report.failure=error.message;if(page)await page.screenshot({path:join(out,'failure.png')}).catch(()=>{});throw error;}
finally{
 try{await browser?.close();}
 finally{
  if(server.listening)await new Promise((done,reject)=>server.close(error=>error?reject(error):done()));
  await writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
 }
 console.log(JSON.stringify({result:report.result,checks:report.checks,out}));
}
