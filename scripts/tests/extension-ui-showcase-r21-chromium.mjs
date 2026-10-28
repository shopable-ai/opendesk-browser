#!/usr/bin/env node
// R2.1 source-bound React gallery smoke. CDP hardware-like pointer and keyboard.
// An offline preview is NOT installed Chrome, permission/Host or macOS acceptance.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {readFile,mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const chromeBin=process.env.CHROME_BIN||
  ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome','/usr/bin/chromium'].find(existsSync);
assert.ok(chromeBin&&existsSync(chromeBin),'Set CHROME_BIN to a real Chromium executable');
const preview=resolve('prototypes/sidebar/react-preview/index.html');
assert.ok(existsSync(preview),'Build the source-bound React preview before review');
const artifactDir=resolve(process.env.ARTIFACTS_DIR||'artifacts/extension-center-r541/preview');
await mkdir(artifactDir,{recursive:true});
const profile=await mkdtemp(join(tmpdir(),'opendesk-ui-gallery-'));
const source=await readFile(preview,'utf8');
assert.match(source,/UI_PREVIEW_ONLY/);
assert.match(source,/od-preview-gallery/);
const report={grade:'SOURCE_BOUND_UI_PREVIEW_ONLY',previewSha256:createHash('sha256').update(source).digest('hex'),
  realHost:false,realPermission:false,realInstaller:false,installedMV3:'NOT_TESTED',macChrome:'NOT_TESTED',
  widths:[],checks:[],exceptions:[]};
let chrome,socket,exit,seq=0;
const pending=new Map();
const pause=ms=>new Promise(done=>setTimeout(done,ms));
function cdp(method,params={}){
 return new Promise((resolve,reject)=>{
   const id=++seq;
   const timeout=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},12000);
   pending.set(id,{ok:result=>{clearTimeout(timeout);resolve(result);},
     bad:error=>{clearTimeout(timeout);reject(error);}});
   socket.send(JSON.stringify({id,method,params}));
 });
}
async function evalJs(expression){
 const result=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
 if(result.exceptionDetails)throw Error('Runtime JS exception '+JSON.stringify(result.exceptionDetails));
 return result.result.value;
}
async function waitFor(expression){
 for(let i=0;i<100;i++){
   try{if(await evalJs(expression))return;}catch{}
   await pause(100);
 }
 let diagnostic;
 try{diagnostic=await evalJs('({boot:document.documentElement.dataset.previewBootScript,'+
  'error:document.documentElement.dataset.previewBootError,gallery:document.getElementById("od-preview-gallery")?.outerHTML?.slice(0,600)})');}
 catch(error){diagnostic=String(error);}
 throw Error('Timed out: '+expression+'; '+JSON.stringify(diagnostic)+'; '+report.exceptions.join('; '));
}
async function navigate(width,theme='light'){
 await cdp('Emulation.setDeviceMetricsOverride',{width:Math.max(560,width+80),height:980,
   deviceScaleFactor:1,mobile:false});
 await cdp('Page.navigate',{url:pathToFileURL(preview).href+'?tab=tools&ui=showcase&width='+width+'&theme='+theme});
 await waitFor('document.documentElement.dataset.previewBootScript==="ready" && '+
    '!!document.getElementById("extension-center-more")');
  await pointer('#extension-center-more');
  await waitFor('document.getElementById("extension-center-menu")?.hidden===false');
  await pointer('#extension-center-language-settings');
  await waitFor('document.querySelectorAll("#od-locale-global option").length===5 && '+
    '!!document.querySelector("#od-locale-tool-language")');
  const languageState=await evalJs('(()=>({options:[...document.querySelectorAll("#od-locale-tool-language option")].map(x=>x.value),'+
    'current:document.getElementById("od-locale-tool-language")?.value,'+
    'preview:!!document.querySelector(".od-locale-manager"),'+
    'inline:getComputedStyle(document.querySelector("#od-locale-global").closest(".od-locale-field")).gridTemplateColumns}))()');
  assert.ok(languageState.preview,'Production LocaleManager never rendered');
  assert.ok(languageState.options.includes('follow'),'Extension language must support following OpenDesk');
  assert.ok(languageState.options.length>=2,'Demo tool must expose valid installed source locale');
  assert.match(languageState.inline,/76px/,'360px settings must retain R5.23 inline form layout');
  report.checks.push('R5.26 LocaleManager renders five global choices, follow and inline fields');
  {
    const shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    await writeFile(join(artifactDir,'locale-settings-360-light.png'),Buffer.from(shot.data,'base64'));
  }
  await pointer('.od-locale-nav');
  await waitFor('!!document.getElementById("od-locale-pack-tool") && '+
    '!!document.querySelector("button.od-locale-drop-zone")');
  const packs=await evalJs('(()=>({zone:!!document.querySelector("button.od-locale-drop-zone"),'+
    'file:!!document.querySelector("input[type=file]"),target:!!document.getElementById("od-locale-target")}))()');
  assert.equal(packs.zone,true,'Entire dashed import area must be a clickable button');
  assert.equal(packs.file,true,'Pack page must preserve the native JSON file picker');
  assert.equal(packs.target,false,'Composer target must stay hidden by default');
  {
    const shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    await writeFile(join(artifactDir,'locale-packs-360-light.png'),Buffer.from(shot.data,'base64'));
  }
  await pointer('.od-locale-compose-toggle');
  await waitFor('document.querySelector(".od-locale-compose-toggle")?.getAttribute("aria-expanded")==="true" && '+
    '!!document.querySelector("#od-locale-target")');
  report.checks.push('R5.26 clickable JSON drop zone and collapsed language-template composer');
  await key('Escape',27);
  await waitFor('!!document.getElementById("od-locale-global")');
  report.checks.push('Escape returns from pack subpage to language settings');
  await key('Escape',27);
  await waitFor('!document.querySelector(".od-locale-manager")');
  report.checks.push('final Escape closes trusted React language page');
 assert.deepEqual(report.exceptions,[],'React runtime raised unexpected exceptions');
 report.result='PASS';
 await writeFile(join(artifactDir,'gallery-result.json'),JSON.stringify(report,null,2)+'\n');
 console.log('EXTENSION_UI_R21_GALLERY_CHROMIUM_PASS '+JSON.stringify(report));
}catch(error){
 report.result='FAIL';report.error=String(error?.stack||error);
 try{const screenshot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
   await writeFile(join(artifactDir,'gallery-failure.png'),Buffer.from(screenshot.data,'base64'));}
 catch{}
 await writeFile(join(artifactDir,'gallery-result.json'),JSON.stringify(report,null,2)+'\n');
 console.error('EXTENSION_UI_R21_GALLERY_CHROMIUM_FAIL '+JSON.stringify(report));
 throw error;
}finally{
 try{socket?.close();}catch{}
 chrome?.kill('SIGTERM');
 if(exit)await exit;
 await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});
}
