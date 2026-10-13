// Targeted macOS CFT driver for ordinary Page import persistence.
// It uses the real product controls only: trusted keyboard/pointer input,
// Save, close/reopen, Load source, rerun, Verify and Install. CDP Runtime and
// IndexedDB access are read-only evidence collection. This file intentionally
// does not build the extension, alter daily Chrome/Native pairing, write product
// databases, call foundation routes, dispatch DOM synthetic events, or forge ACKs.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {WebSocket} from 'ws';
import {compileStaticESM} from '../../src/ui/static-esm-linker.mjs';
import {PAGE_BROWSER_COMPILER} from '../../src/libs/page-frameworks/contract.js';
import {DEFAULT_MACOS_LAUNCHER, launchLocalDevChrome} from './local-dev-cft-launcher.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const defaultCandidate = path.join(root, '.runtime/tests/page-import-persistence-01a130cc-09d5/candidate/dist/production');
const defaultOutput = path.join(root, 'docs/framework/workstreams/evidence/page-import-persistence-01a130cc-09d5');
const defaultBinary = path.join(root, 'tests/.cache/m5-browsers/155.0.8059.39/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const dependencyURL = 'https://cdn.jsdelivr.net/npm/d3-array@3.2.4/src/max.js';
const evidenceScope = path.join(root, 'docs/framework/workstreams/evidence/page-import-persistence-01a130cc-09d5');

const args = Object.fromEntries(process.argv.slice(2).map(arg => {
  assert(arg.startsWith('--'), 'Use named options, for example --preflight or --real');
  const eq = arg.indexOf('=');
  return eq < 0 ? [arg.slice(2), true] : [arg.slice(2, eq), arg.slice(eq + 1)];
}));
const allowed = new Set(['preflight', 'real', 'package', 'output', 'chrome', 'headed', 'keep-profile', 'external-site-revoke', 'skip-site-revoke']);
for (const key of Object.keys(args)) assert(allowed.has(key), 'Unknown option ' + key);
assert(!(args.preflight && args.real), 'Choose either --preflight or --real');
const realMode = Boolean(args.real);
const output = path.resolve(args.output || path.join(defaultOutput, realMode ? 'real' : 'preflight-' + new Date().toISOString().replace(/[:.]/g, '-')));
const packageRoot = path.resolve(args.package || process.env.OPENDESK_PAGE_IMPORT_PERSISTENCE_PACKAGE || defaultCandidate);
const chromeBinary = path.resolve(args.chrome || process.env.CHROME_FOR_TESTING_BIN || defaultBinary);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const node = selector => 'document.querySelector(' + JSON.stringify(selector) + ')';
const text = selector => node(selector) + '?.textContent';

const babelContext = vm.createContext({TextEncoder, TextDecoder});
vm.runInContext(fs.readFileSync(PAGE_BROWSER_COMPILER.source, 'utf8'), babelContext, {timeout: 5000});
const Babel = babelContext.Babel;

const authorSource = `import max from '${dependencyURL}';
async function main(){
  const value=max([3,11,4]);
  let el=document.getElementById('opendesk-page-import-persistence-proof');
  if(!el){
    el=document.createElement('section');
    el.id='opendesk-page-import-persistence-proof';
    el.setAttribute('data-opendesk-proof','page-import-persistence');
    document.body.appendChild(el);
  }
  el.setAttribute('data-executions',String(Number(el.getAttribute('data-executions')||0)+1));
  el.textContent='Page import persistence proof '+value+' '+new URL(location.href).pathname;
  return {value, marker:el.textContent, href:location.href, title:document.title};
}
`;

function write(name, value) {
  const target = path.join(output, name);
  fs.mkdirSync(path.dirname(target), {recursive: true});
  fs.writeFileSync(target, typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value, null, 2) + '\n');
}
function append(name, value) {
  fs.mkdirSync(output, {recursive: true});
  fs.appendFileSync(path.join(output, name), JSON.stringify(value) + '\n');
}
function errorRecord(error) {
  return {name: error.name, code: error.code, message: error.message, stack: error.stack};
}
function fingerprint(directory) {
  const files = [];
  const walk = (dir, prefix = '') => {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      const name = path.join(prefix, entry.name);
      const full = path.join(dir, entry.name);
      assert(!entry.isSymbolicLink(), 'Candidate package cannot contain symlink: ' + name);
      if (entry.isDirectory()) walk(full, name);
      else {
        assert(entry.isFile(), 'Candidate package entry must be file: ' + name);
        const bytes = fs.readFileSync(full);
        files.push({path: name, bytes: bytes.length, sha256: hash(bytes)});
      }
    }
  };
  walk(directory);
  files.sort((a, b) => a.path.localeCompare(b.path));
  return {packageHash: hash(JSON.stringify(files)), files, hashRecipe: 'SHA256(JSON.stringify(path-sorted [{path,bytes,sha256}])) over exact candidate bytes'};
}
async function until(fn, label, timeout = 20000) {
  append('stages.jsonl',{at:new Date().toISOString(),label});
  const end = Date.now() + timeout;
  let cause;
  while (Date.now() < end) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      cause = error;
    }
    await pause(100);
  }
  throw Error(label + ' timed out' + (cause ? ': ' + cause.message : ''));
}
async function connect(uri, label) {
  const socket = new WebSocket(uri);
  const pending = new Map();
  const handlers = new Map();
  let serial = 0;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.terminate();
      reject(Error('CDP connect timed out: ' + label));
    }, 10000);
    socket.once('open', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once('error', error => {
      clearTimeout(timer);
      reject(error);
    });
  });
  socket.on('message', bytes => {
    const row = JSON.parse(String(bytes));
    append('raw-cdp.jsonl', {at: new Date().toISOString(), target: label, direction: 'received', row});
    if (row.id) {
      const task = pending.get(row.id);
      if (!task) return;
      pending.delete(row.id);
      clearTimeout(task.timer);
      if (row.error) task.reject(Object.assign(Error(row.error.message), {code: row.error.code}));
      else task.resolve(row.result);
    } else {
      for (const handler of handlers.get(row.method) || []) handler(row.params);
    }
  });
  const rejectPending = () => {
    for (const task of pending.values()) {
      clearTimeout(task.timer);
      task.reject(Error('CDP closed: ' + label));
    }
    pending.clear();
  };
  socket.on('close', rejectPending);
  socket.on('error', rejectPending);
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++serial;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(Error('CDP timed out: ' + method));
    }, 30000);
    pending.set(id, {resolve, reject, timer});
    append('raw-cdp.jsonl', {at: new Date().toISOString(), target: label, direction: 'sent', id, method, params});
    socket.send(JSON.stringify({id, method, params}));
  });
  const read = async expression => {
    const result = await call('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
  };
  const on = (method, handler) => {
    const rows = handlers.get(method) || new Set();
    rows.add(handler);
    handlers.set(method, rows);
    return () => rows.delete(handler);
  };
  return {label, call, read, on, close: () => socket.close(), open: () => socket.readyState === WebSocket.OPEN};
}
async function clickReal(session, expression) {
  if(await session.read('(()=>{const e=('+expression+'),p=e?.closest("details:not([open])"),s=p?.querySelector(":scope > summary");return !!p&&!!s&&e!==s&&!s.contains(e);})()')){
    await clickReal(session,'('+expression+').closest("details:not([open])").querySelector(":scope > summary")');
  }
  for(let scroll=0;scroll<16;scroll++){
    const box=await session.read('(()=>{const e=('+expression+');if(!e||e.disabled||e.hidden)return null;const r=e.getBoundingClientRect();let scroll=null;for(let p=e.parentElement;p;p=p.parentElement){if(p.scrollHeight>p.clientHeight+1&&/auto|scroll/.test(getComputedStyle(p).overflowY)){const a=p.getBoundingClientRect();scroll={x:Math.max(4,a.left+4),y:(Math.max(64,a.top)+Math.min(innerHeight-80,a.bottom))/2,id:p.id,top:p.scrollTop,max:p.scrollHeight-p.clientHeight};break;}}return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height,vw:innerWidth,vh:innerHeight,scroll,text:e.textContent||e.value||e.id}})()');
    assert(box?.w>0&&box.h>0,'Visible enabled real control: '+expression);
    const devtools=expression.includes('console-prompt')||expression.includes('cm-content')||expression.includes('role');
    const header=expression.includes('#tab-develop')||devtools?8:64;
    if(box.y>=header&&box.y<box.vh-(devtools?8:80)&&box.x>=0&&box.x<box.vw){
      append('trusted-input.jsonl',{at:new Date().toISOString(),target:session.label,expression,box});
      for(const type of ['mousePressed','mouseReleased'])await session.call('Input.dispatchMouseEvent',{type,x:box.x,y:box.y,button:'left',clickCount:1});
      return;
    }
    await session.call('Input.dispatchMouseEvent',{type:'mouseWheel',x:box.scroll?.x??box.vw/2,y:box.scroll?.y??box.vh/2,deltaX:0,deltaY:Math.max(-600,Math.min(600,box.y-box.vh/2))});
    await pause(120);
  }
  for(let tab=0;tab<80;tab++){
    const focused=await session.read('(()=>{let e=document.activeElement;while(e?.shadowRoot?.activeElement)e=e.shadowRoot.activeElement;return e===('+expression+');})()');
    if(focused){
      append('trusted-input.jsonl',{at:new Date().toISOString(),target:session.label,expression,keyboard:'Tab then Space'});
      if(!await session.read('('+expression+').matches("textarea,input:not([type=checkbox]):not([type=radio])")'))for(const type of ['keyDown','keyUp'])await session.call('Input.dispatchKeyEvent',{type,key:' ',code:'Space',windowsVirtualKeyCode:32});
      return;
    }
    for(const type of ['keyDown','keyUp'])await session.call('Input.dispatchKeyEvent',{type,key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
  }
  throw Error('Real control could not be reached with wheel or Tab: '+expression);
}
async function typeIntoFocused(session, source) {
  await session.call('Input.dispatchKeyEvent', {type: 'keyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 4, commands: ['selectAll']});
  await session.call('Input.dispatchKeyEvent', {type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 4});
  await session.call('Input.insertText', {text: source});
}
async function typeSource(sidebar, source) {
  await clickReal(sidebar, node('#script-source'));
  await typeIntoFocused(sidebar, source);
  await until(() => sidebar.read(node('#script-source') + '.value===' + JSON.stringify(source)), 'Trusted text input preserved author source');
}
async function expand(sidebar, selector) {
  if (await sidebar.read(node(selector) + '?.open')) return;
  await clickReal(sidebar, node(selector) + '.querySelector("summary")');
  await until(() => sidebar.read(node(selector) + '?.open'), 'Expanded ' + selector);
}
async function terminal(sidebar, previousReceipt) {
  return until(async () => {
    const state = await sidebar.read('(()=>{const e=document.querySelector("#page-preview-status");return {state:e?.dataset.state,text:e?.textContent,receipt:document.querySelector("#page-preview-technical")?.textContent}})()');
    if (state.state === 'error' || state.state === 'completed' && state.receipt !== previousReceipt) return state;
    return null;
  }, 'New Page preview terminal status', 45000);
}
async function runPreview(sidebar, expectedSourceHash, name) {
  await expand(sidebar, '#page-preview-tools');
  await until(() => sidebar.read('!' + node('#page-preview-run') + '.disabled'), 'Page preview Run enabled');
  const before = await sidebar.read(text('#page-preview-technical'));
  await clickReal(sidebar, node('#page-preview-run'));
  const state = await terminal(sidebar, before);
  assert.equal(state.state, 'completed', state.text);
  const raw = await sidebar.read(text('#page-preview-technical'));
  const receipt = JSON.parse(raw);
  assert.equal(receipt.state, 'preview-evaluated');
  assert.equal(receipt.world, 'USER_SCRIPT');
  assert.equal(receipt.sourceHash, expectedSourceHash);
  write(name + '-receipt.json', receipt);
  return receipt;
}
async function readInstalledRows(session, programId) {
  return session.read('(async()=>{const rows=[];for(const info of await indexedDB.databases()){'+
    'if(!info.name)continue;const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(info.name);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});'+
    'try{if(db.objectStoreNames.contains("frameworkKV"))rows.push(...await new Promise((resolve,reject)=>{const r=db.transaction("frameworkKV","readonly").objectStore("frameworkKV").getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)}))}finally{db.close()}}'+
    'return rows.filter(r=>r.programId==='+JSON.stringify(programId)+'||r.manifest?.programId==='+JSON.stringify(programId)+').map(r=>Object.fromEntries(['+
    '"tag","programId","revision","manifest","manifestHash","candidateId","stage","sourceHash","pageRules","enabled","nativeId","nativeState","authorization","status","receiptHash","receipt","state","documentId","installationId","grantGeneration","lastExecution","result","receiptId","receiptNonce","world","tabId","effectConfirmed","error"].filter(k=>r[k]!==undefined).map(k=>[k,r[k]])))})()');
}
const deepNode = test => `(()=>{const seen=new Set(),roots=[document];while(roots.length){const root=roots.pop();if(seen.has(root))continue;seen.add(root);for(const el of root.querySelectorAll('*')){if(${test})return el;if(el.shadowRoot)roots.push(el.shadowRoot);}}return null;})()`;
async function readDependencyAsset(session, sha256) {
  const key='userscript-asset:v1:sha256:'+sha256;
  return session.read(`(async()=>{const key=${JSON.stringify(key)};for(const info of await indexedDB.databases()){const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(info.name);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});try{if(!db.objectStoreNames.contains('frameworkKV'))continue;const row=await new Promise((resolve,reject)=>{const r=db.transaction('frameworkKV','readonly').objectStore('frameworkKV').get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});if(row){const bytes=new Uint8Array(row.bytes);const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');return {database:info.name,key,sha256:row.sha256,actualSha256:digest,byteLength:bytes.length};}}finally{db.close();}}return null;})()`);
}
async function visibleConsoleCommand(browser,base,attach,panel,command,label,observe) {
  const native=await browser.call('Target.openDevTools',{targetId:panel.id,panelId:'console'});
  assert(native.targetId,'Chrome returned its real DevTools target');
  const info=await until(async()=>{const rows=await (await fetch(base+'/json/list')).json();return rows.find(row=>row.id===native.targetId&&row.webSocketDebuggerUrl);},'Native DevTools target available');
  write('devtools-'+label+'-frontend.json',{targetId:panel.id,devtoolsTarget:info,entry:'Target.openDevTools'});
  const opened={info,session:await attach(info,'visible-devtools-'+label)};
  const devtools=opened.session;
  await browser.call('Target.activateTarget',{targetId:opened.info.id});
  const consoleTab=deepNode('el.getAttribute("role")==="tab"&&/Console|控制台/.test(el.getAttribute("aria-label")||el.textContent||"")');
  await until(()=>devtools.read('('+consoleTab+')!==null'),'Visible DevTools Console tab');
  await until(async()=>{if(await devtools.read('('+consoleTab+')?.getAttribute("aria-selected")==="true"'))return true;await clickReal(devtools,consoleTab);return null;},'DevTools Console selected after layout settled');
  write('devtools-'+label+'-editables.json',await devtools.read('(()=>{const roots=[document],rows=[];while(roots.length){for(const e of roots.pop().querySelectorAll("*")){if(e.shadowRoot)roots.push(e.shadowRoot);if(e.hasAttribute("contenteditable")||e.matches("textarea,input"))rows.push({tag:e.tagName,id:e.id,class:e.className,editable:e.getAttribute("contenteditable"),role:e.getAttribute("role"),html:e.outerHTML.slice(0,500)});}}return rows;})()'));
  const readyShot=await devtools.call('Page.captureScreenshot',{format:'png'});write('devtools-'+label+'-ready.png',Buffer.from(readyShot.data,'base64'));
  const prompt=deepNode('(el.id==="console-prompt"||el.classList.contains("cm-content")&&el.getAttribute("contenteditable")==="true")&&el.getBoundingClientRect().height>0');
  await until(()=>devtools.read('('+prompt+')!==null'),'Visible DevTools Console prompt');
  await clickReal(devtools,prompt);
  write('devtools-'+label+'-typed-command.js',command);
  await devtools.call('Input.insertText',{text:command});
  for(const type of ['keyDown','keyUp'])await devtools.call('Input.dispatchKeyEvent',{type,key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  let after;
  try{after=await until(observe,'Real Console action completed: '+label);}
  catch(error){const shot=await devtools.call('Page.captureScreenshot',{format:'png'});write('devtools-'+label+'-failure.png',Buffer.from(shot.data,'base64'));write('devtools-'+label+'-messages.json',await devtools.read('(()=>{const roots=[document],rows=[];while(roots.length){for(const e of roots.pop().querySelectorAll("*")){if(e.shadowRoot)roots.push(e.shadowRoot);if(e.classList.contains("console-message-text"))rows.push(e.textContent);}}return rows;})()'));throw error;}
  const shot=await devtools.call('Page.captureScreenshot',{format:'png'});write('devtools-'+label+'.png',Buffer.from(shot.data,'base64'));
  await browser.call('Target.closeTarget',{targetId:opened.info.id});
  return {after,entry:'visible DevTools Console with trusted keyboard input'};
}
async function faultDependencyThroughDevTools(browser, base, attach, panel, asset, mode) {
  assert(['corrupt','delete'].includes(mode));
  const operation=mode==='delete'?'store.delete(key)':'request.onsuccess=()=>{const row=request.result;if(row?.sha256!==expected||!(row.bytes instanceof ArrayBuffer)){tx.abort();return;}const bytes=new Uint8Array(row.bytes.slice(0));bytes[0]^=1;store.put({...row,bytes:bytes.buffer},key);}';
  const command=`(async()=>{const key=${JSON.stringify(asset.key)},expected=${JSON.stringify(asset.sha256)};const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(${JSON.stringify(asset.database)});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});try{await new Promise((resolve,reject)=>{const tx=db.transaction('frameworkKV','readwrite'),store=tx.objectStore('frameworkKV'),request=store.get(key);${operation};tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||Error('asset identity mismatch'));tx.onerror=()=>reject(tx.error);});console.info('OPENDESK_OWN_CACHE_${mode.toUpperCase()}_DONE');}finally{db.close();}})()`;
  const action=await visibleConsoleCommand(browser,base,attach,panel,command,mode,async()=>{const row=await readDependencyAsset(panel.session,asset.sha256);return mode==='delete'?(row===null?{missing:true}:null):(row?.actualSha256!==asset.sha256?row:null);});
  return {mode,asset,...action};
}
async function expectSavedLoadBlocked(sidebar, website, browser, websiteId, label) {
  await browser.call('Target.activateTarget',{targetId:websiteId});
  const before=await website.read('document.getElementById("opendesk-page-import-persistence-proof")?.getAttribute("data-executions")||null');
  await until(()=>sidebar.read('!'+node('#page-program-load')+'.disabled'),'Load enabled for '+label);
  await clickReal(sidebar,node('#page-program-load'));
  const errorPattern='^E_DEPENDENCY';
  const status=await until(()=>sidebar.read('(()=>{const text=document.querySelector("#page-program-status")?.textContent;return new RegExp('+JSON.stringify(errorPattern)+').test(text||"")?{state:"error",text}:null})()'),'Saved import Load blocked for '+label);
  assert.equal(await sidebar.read(node('#script-source')+'.value'),authorSource,'Refusal retains author source');
  assert.equal(await website.read('document.getElementById("opendesk-page-import-persistence-proof")?.getAttribute("data-executions")||null'),before,'Refused Load executes no user code');
  write(label+'-blocked.json',{status,authorSourceHash:hash(authorSource),executionsBefore:before,executionsAfter:before});
  return status;
}
async function expectPreviewBlocked(sidebar,website,label) {
  await expand(sidebar,'#page-preview-tools');
  const before=await website.read('document.getElementById("opendesk-page-import-persistence-proof")?.getAttribute("data-executions")||null');
  let state;
  if(await sidebar.read('!'+node('#page-preview-run')+'.disabled')){
    const receipt=await sidebar.read(text('#page-preview-technical'));
    await clickReal(sidebar,node('#page-preview-run'));
    state=await terminal(sidebar,receipt);assert.equal(state.state,'error',state.text);
  }else state={state:'disabled',text:await sidebar.read(text('#network-js-status'))};
  assert.equal(await website.read('document.getElementById("opendesk-page-import-persistence-proof")?.getAttribute("data-executions")||null'),before,'Guard executes no user code');
  write(label+'-preview-blocked.json',{state,executionsBefore:before,executionsAfter:before});
  return state;
}
async function enableUserScripts(browser, base, extensionId, attach) {
  const response = await fetch(base + '/json/new?about%3Ablank', {method: 'PUT'});
  assert.equal(response.status, 200);
  const info = await response.json();
  const settings = await attach(info, 'chrome-extensions');
  await settings.call('Page.enable');
  await settings.call('Page.navigate', {url: 'chrome://extensions/?id=' + extensionId});
  const detail = node('extensions-manager') + '?.shadowRoot?.querySelector("extensions-detail-view")';
  const toggle = '(' + detail + ')?.shadowRoot?.querySelector("#allow-user-scripts")?.shadowRoot?.querySelector("cr-toggle#crToggle")';
  await until(() => settings.read('(' + toggle + ')!=null'), 'Chrome real userScripts toggle');
  await browser.call('Target.activateTarget', {targetId: info.id});
  if (!await settings.read('(' + toggle + ').checked')) await clickReal(settings, toggle);
  await until(() => settings.read('(' + toggle + ').checked===true'), 'Real userScripts opt-in');
  return {info, session: settings};
}
async function createTab(base, attach, url, label) {
  const response = await fetch(base + '/json/new?about%3Ablank', {method: 'PUT'});
  assert.equal(response.status, 200);
  const info = await response.json();
  const session = await attach(info, label || info.id);
  await session.call('Page.enable');
  await session.call('Runtime.enable');
  await session.call('Page.navigate', {url});
  return {info, session};
}
async function openDevSidebar(browser, base, extensionId, attach, websiteUrl) {
  const site = await createTab(base, attach, websiteUrl, 'website');
  await until(() => site.session.read('document.readyState==="complete"'), 'demo-form loaded');
  const catalog = await createTab(base, attach, 'chrome-extension://' + extensionId + '/ui/tool.html', 'catalog');
  await until(() => catalog.session.read('(()=>{const e=' + node('#catalog-open-dev-sidebar') + ';const r=e?.getBoundingClientRect();return !!r?.width&&!!r?.height&&!e.disabled})()'), 'Catalog develop sidebar button');
  await browser.call('Target.activateTarget', {targetId: catalog.info.id});
  await clickReal(catalog.session, node('#catalog-open-dev-sidebar'));
  const panel = await until(async () => {
    const list = await (await fetch(base + '/json/list')).json();
    return list.find(target => target.id !== catalog.info.id && target.url?.startsWith('chrome-extension://' + extensionId + '/ui/tool.html') && target.webSocketDebuggerUrl);
  }, 'Side Panel target opened');
  const sidebar = await attach(panel, 'sidebar');
  await sidebar.call('Runtime.enable');
  await until(() => sidebar.read(node('#tab-develop') + '&&location.href.includes("hostInstanceId=")'), 'Develop sidebar ready');
  await browser.call('Target.activateTarget',{targetId:site.info.id});
  await clickReal(sidebar, node('#tab-develop'));
  await until(() => sidebar.read(node('#tab-develop') + '.getAttribute("aria-selected")==="true"'), 'Develop tab selected');
  await browser.call('Target.activateTarget',{targetId:site.info.id});
  await until(() => sidebar.read(node('#script-current-page-status') + '?.dataset.state==="available"'), 'Current page target available');
  return {site, catalog, panel, sidebar};
}

async function revokeDependencyOriginViaExtensions(browser,base,extensionId,attach,sidebar) {
  const originPattern=new URL(dependencyURL).origin+'/*';
  assert(await sidebar.read('chrome.permissions.contains({origins:['+JSON.stringify(originPattern)+']})'),'Source permission active before withdrawal');
  const settings=await createTab(base,attach,'chrome://extensions/?id='+extensionId,'chrome-source-access');
  await browser.call('Target.activateTarget',{targetId:settings.info.id});
  const select=deepNode('el.id==="newHostAccess"');
  await until(()=>settings.session.read('('+select+')!==null'),'Chrome site access select ready');
  if(args['external-site-revoke']){
    await clickReal(settings.session,select);
    write('native-site-revoke-ready.json',{chromePid:JSON.parse(fs.readFileSync(path.join(output,'chrome-launcher-report.json'),'utf8')).pid,extensionId,settingsTarget:settings.info.id});
  }else{
    for(let i=0;i<60;i++){
      if(await settings.session.read('(()=>{let e=document.activeElement;while(e?.shadowRoot?.activeElement)e=e.shadowRoot.activeElement;return e===('+select+');})()'))break;
      for(const type of ['keyDown','keyUp'])await settings.session.call('Input.dispatchKeyEvent',{type,key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
    }
    assert(await settings.session.read('(()=>{let e=document.activeElement;while(e?.shadowRoot?.activeElement)e=e.shadowRoot.activeElement;return e===('+select+');})()'),'Native Tab focused the site access selector');
    for(const type of ['keyDown','keyUp'])await settings.session.call('Input.dispatchKeyEvent',{type,key:'Home',code:'Home',windowsVirtualKeyCode:36});
  }
  write('chrome-site-access-after-input.json',{selected:await settings.session.read('('+select+').value'),permissions:await sidebar.read('chrome.permissions.getAll()')});
  await until(async()=>!(await sidebar.read('chrome.permissions.contains({origins:['+JSON.stringify(originPattern)+']})')),'Actual source access withdrawn by Chrome UI',args['external-site-revoke']?300000:15000);
  return {status:'PASS',originPattern,entry:args['external-site-revoke']?'Chrome native site access menu through CUA':'Chrome site access selector via native Tab and Home keys',permissionsAfter:await sidebar.read('chrome.permissions.getAll()')};
}
async function reapproveDependencyAfterChromeRevocation(sidebar) {
  const originPattern = new URL(dependencyURL).origin + '/*';
  await expand(sidebar, '#network-js-review');
  if (await sidebar.read('!' + node('#network-js-prepare') + '.disabled').catch(() => false)) {
    await clickReal(sidebar, node('#network-js-prepare'));
    await until(() => sidebar.read(text('#network-js-status') + '?.includes("下载准备完成")||' + text('#network-js-status') + '?.includes("已显示固定缓存原文")||' + text('#network-js-status') + '?.includes("已批准")'), 'Dependency review ready after permission revocation', 180000);
  }
  if (await sidebar.read('document.querySelectorAll("#network-js-sources button").length>0')) {
    await clickReal(sidebar, node('#network-js-sources button'));
    await until(() => sidebar.read(node('#network-js-sources textarea') + '?.hidden===false'), 'Cached dependency source visible after revocation');
  }
  if (!await sidebar.read(node('#network-js-consent') + '?.checked').catch(() => false)) await clickReal(sidebar, node('#network-js-consent'));
  await until(() => sidebar.read('!' + node('#network-js-approve') + '.disabled'), 'Reapproval enabled after real Chrome API removal');
  await clickReal(sidebar, node('#network-js-approve'));
  await until(() => sidebar.read('chrome.permissions.contains({origins:[' + JSON.stringify(originPattern) + ']})'), 'CDN host permission restored by real approval UI',300000);
  return {status: 'PASS', originPattern};
}
function buildReportSkeleton(expectedBuiltSource) {
  return {
    status: 'IN_PROGRESS',
    scope: 'page-import-persistence-cft-20261012',
    startedAt: new Date().toISOString(),
    mode: realMode ? 'real' : 'preflight',
    repo: root,
    packageRoot,
    candidateExpected: defaultCandidate,
    output,
    evidenceScope,
    authorSourceHash: hash(authorSource),
    compiledSourceHash: hash(expectedBuiltSource),
    dependencyURL,
    tests: [],
    limits: [
      'No extension build is performed by this driver.',
      'No daily Chrome profile, daily dist/development, Native/MCP manifest, Git branch, worktree, commit or PR is modified.',
      'Cache faults are entered with real keyboard input in visible DevTools Console, scoped to this disposable profile and exact downloaded asset; no CDP Runtime DB writes.',
      'Required host permissions are withheld through Chrome site access UI, never forged or removed with the optional permission API. Restoration uses explicit product review and approval.'
    ]
  };
}

async function main() {
  assert(output.startsWith(evidenceScope + path.sep) || output === evidenceScope, 'Evidence must stay under docs/framework/workstreams/evidence/page-import-persistence-01a130cc-09d5');
  assert(!output.startsWith(path.join(root, 'docs/framework/evidence') + path.sep), 'Use workstreams/evidence, not framework/evidence');
  assert(!output.startsWith(packageRoot + path.sep), 'Evidence cannot be placed inside candidate package');
  assert(!fs.existsSync(output), 'Preserve previous evidence; choose a fresh --output');
  fs.mkdirSync(output, {recursive: true});
  const expectedBuiltSource = compileStaticESM({sourceUtf8: authorSource, entries: [{url: dependencyURL, code: 'export default function max(values){let value;for(const item of values){if(value===undefined||item>value)value=item;}return value;}'}], sourceFormat: 'esm-page', babel: Babel}).sourceUtf8;
  const report = buildReportSkeleton(expectedBuiltSource);
  write('driver-source.mjs', fs.readFileSync(fileURLToPath(import.meta.url), 'utf8'));
  write('author-source.js', authorSource);
  write('expected-offline-compiled-source.js', expectedBuiltSource);
  try {
    report.gitHead = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim();
    report.gitStatus = execFileSync('git', ['status', '--porcelain'], {cwd: root, encoding: 'utf8'});
  } catch (error) {
    report.gitError = errorRecord(error);
  }
  report.driverSha256 = hash(fs.readFileSync(fileURLToPath(import.meta.url)));
  report.compiler = {source: PAGE_BROWSER_COMPILER.source, sha256: hash(fs.readFileSync(PAGE_BROWSER_COMPILER.source))};
  report.candidateExists = fs.existsSync(packageRoot);
  if (!realMode) {
    report.status = report.candidateExists ? 'PREFLIGHT_READY_NOT_RUN' : 'CANDIDATE_PENDING';
    if (report.candidateExists) report.package = fingerprint(packageRoot);
    else report.pending = 'Coordinator has not provided a real candidate package yet; real CFT flow intentionally not launched. Default private path is .runtime/tests/page-import-persistence-01a130cc-09d5/candidate/dist/production; --package or OPENDESK_PAGE_IMPORT_PERSISTENCE_PACKAGE may point at the coordinator-selected final candidate.';
    report.tests.push({name: 'preflight-static-identity-and-scope', status: 'PASS', details: {authorSourceHash: report.authorSourceHash, compiledSourceHash: report.compiledSourceHash, output}});
    report.tests.push({name: 'real-save-reopen-load-rerun-verify-install', status: 'NOT_TESTED', reason: 'Requires --real and built candidate package'});
    write('acceptance.json', report);
    return;
  }

  assert.equal(process.platform, 'darwin', 'Real flow uses the pinned macOS isolated CFT launcher');
  assert(fs.existsSync(packageRoot), 'Candidate package is missing: ' + packageRoot);
  report.candidateSelection = {explicitPackage: Boolean(args.package || process.env.OPENDESK_PAGE_IMPORT_PERSISTENCE_PACKAGE), defaultCandidate};
  assert(!process.env.OPENDESK_DEV_CFT_LAUNCHER || process.env.OPENDESK_DEV_CFT_LAUNCHER === DEFAULT_MACOS_LAUNCHER, 'Use original isolated macOS launcher only');
  report.packageBefore = fingerprint(packageRoot);
  report.manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'manifest.json'), 'utf8'));
  report.chromeBinary = fs.realpathSync(chromeBinary);
  report.chromeVersion = execFileSync(chromeBinary, ['--version'], {encoding: 'utf8'}).trim();
  write('package-before.json', report.packageBefore);

  const sample = fs.readFileSync(path.join(root, 'examples/tasks/demo-form.html'));
  const site = http.createServer((req, res) => {
    append('http.jsonl', {at: new Date().toISOString(), method: req.method, url: req.url});
    if (req.url?.split('?')[0] !== '/demo-form.html') {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store'});
    res.end(sample);
  });
  const sessions = [];
  let launched, browser;
  try {
    await new Promise((resolve, reject) => {
      site.once('error', reject);
      site.listen(0, '127.0.0.1', resolve);
    });
    report.httpPort = site.address().port;
    report.websiteURL = 'http://127.0.0.1:' + report.httpPort + '/demo-form.html';
    launched = await launchLocalDevChrome({root, out: output, binary: chromeBinary, argv: [
      '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--disable-background-networking', '--disable-sync', '--remote-debugging-port=0', '--disable-extensions-except=' + packageRoot, '--load-extension=' + packageRoot, args.headed ? undefined : '--headless=new'
    ].filter(Boolean)});
    report.launch = launched.launch;
    assert.equal(report.launch.launcher, DEFAULT_MACOS_LAUNCHER);
    const cdpPort = Number(launched.lines[0]);
    const base = 'http://127.0.0.1:' + cdpPort;
    browser = await connect('ws://127.0.0.1:' + cdpPort + launched.lines[1], 'browser');
    sessions.push(browser);
    report.browserVersion = await browser.call('Browser.getVersion');
    const attach = async (info, label) => {
      const session = await connect(info.webSocketDebuggerUrl, label || info.id);
      sessions.push(session);
      session.on('Runtime.exceptionThrown', params => append('runtime-exceptions.jsonl', {at: new Date().toISOString(), target: label || info.id, params}));
      return session;
    };
    const list = async () => (await (await fetch(base + '/json/list')).json());
    const workerTarget = await until(async () => (await list()).find(target => target.type === 'service_worker' && /^chrome-extension:\/\/[a-p]{32}\/sw\.js$/.test(target.url)), 'Real packaged service worker');
    report.extensionId = workerTarget.url.split('/')[2];
    report.workerTarget = workerTarget;
    await enableUserScripts(browser, base, report.extensionId, attach);
    const opened = await openDevSidebar(browser, base, report.extensionId, attach, report.websiteURL);
    let {site: website, sidebar, panel} = opened;
    report.initialTargets = {website: website.info, sidebar: panel};

    await typeSource(sidebar, authorSource);
    await expand(sidebar, '#network-js-review');
    await until(() => sidebar.read('!' + node('#network-js-prepare') + '.disabled'), 'Dependency prepare button enabled');
    await clickReal(sidebar, node('#network-js-prepare'));
    await until(() => sidebar.read(text('#network-js-status') + '?.includes("下载准备完成")'), 'Dependency bytes prepared', 45000);
    await clickReal(sidebar, node('#network-js-sources button'));
    await until(() => sidebar.read(node('#network-js-sources textarea') + '?.hidden===false&&' + text('#network-js-status') + '?.includes("已显示固定缓存原文")'), 'Cached source legally displayed');
    const cached = await sidebar.read(node('#network-js-sources textarea') + '.value');
    const realBuiltSource = compileStaticESM({sourceUtf8: authorSource, entries: [{url: dependencyURL, code: cached}], sourceFormat: 'esm-page', babel: Babel}).sourceUtf8;
    const realBuiltHash = hash(realBuiltSource);
    write('cached-dependency-source.js', cached);
    write('real-offline-compiled-source.js', realBuiltSource);
    await clickReal(sidebar, node('#network-js-consent'));
    await until(() => sidebar.read(node('#network-js-consent') + '.checked&&!' + node('#network-js-approve') + '.disabled'), 'Explicit approval enabled');
    await clickReal(sidebar, node('#network-js-approve'));
    await until(() => sidebar.read(text('#network-js-status') + '?.includes("已明确批准")'), 'Fixed bytes approved');

    const firstReceipt = await runPreview(sidebar, realBuiltHash, 'initial-run');
    await until(() => website.session.read('document.getElementById("opendesk-page-import-persistence-proof")?.textContent.includes("11")'), 'Initial visible author effect');
    await until(() => sidebar.read('!' + node('#page-candidate-save') + '.disabled'), 'Candidate Save enabled');
    await clickReal(sidebar, node('#page-candidate-save'));
    await until(() => sidebar.read(node('#page-candidate-status') + '?.dataset.state==="saved"'), 'Candidate saved');
    const programId = await sidebar.read(node('#script-id') + '.value.trim()');
    const savedRows = await readInstalledRows(sidebar, programId);
    const savedCandidate = savedRows.find(row => row.tag === 'page-candidate-v1' && row.stage === 'Candidate' && row.manifest?.sourceHash === realBuiltHash);
    assert(savedCandidate, 'Saved candidate row must bind the frozen compiled sourceHash');
    assert.equal(savedCandidate.manifest.compilation.authorSourceHash,hash(authorSource));
    assert(savedCandidate.manifest.compilation.dependencyLockId);
    assert(savedCandidate.manifest.compilation.compilerProfile.length>0);
    assert(!savedRows.some(row => row.tag === 'page-installed-v1'), 'Save must not install');
    write('saved-candidate.json', {programId, savedCandidate, rows: savedRows});

    await browser.call('Target.closeTarget', {targetId: panel.id});
    await until(async () => !(await list()).some(target => target.id === panel.id), 'Side Panel target closed');
    await website.session.call('Page.navigate', {url: report.websiteURL + '?reopened=1'});
    await until(() => website.session.read('location.search==="?reopened=1"&&document.readyState==="complete"'), 'Website reopened/navigated before Load');
    const reopened = await openDevSidebar(browser, base, report.extensionId, attach, report.websiteURL + '?reopened=1');
    website = reopened.site;
    sidebar = reopened.sidebar;
    panel = reopened.panel;
    report.reopenedTargets = {website: reopened.site.info, sidebar: panel};
    await until(() => sidebar.read('!' + node('#page-program-load') + '.disabled'), 'Load source button enabled after reopen');
    await clickReal(sidebar, node('#page-program-load'));
    await until(() => sidebar.read(node('#script-source') + '.value===' + JSON.stringify(authorSource)), 'Loaded author source exactly after reopen');
    write('loaded-author-source.js', await sidebar.read(node('#script-source') + '.value'));
    assert.equal(hash(await sidebar.read(node('#script-source') + '.value')), hash(authorSource));

    const sourcePermissionRevocation = args['skip-site-revoke'] ? {status:'NOT_TESTED',reason:'Separate cache/installation case; real source revocation has its own candidate-bound evidence'} : await revokeDependencyOriginViaExtensions(browser,base,report.extensionId,attach,sidebar);
    await browser.call('Target.activateTarget',{targetId:website.info.id});
    await until(()=>sidebar.read(node('#script-current-page-status')+'?.dataset.state==="available"'),'Website active again after source permission control');
    if (sourcePermissionRevocation.status === 'PASS') {
      await browser.call('Target.activateTarget',{targetId:website.info.id});
      sourcePermissionRevocation.previewBlocked=await expectPreviewBlocked(sidebar,website.session,'revoked-origin');
      sourcePermissionRevocation.loadBlocked=await expectSavedLoadBlocked(sidebar,website.session,browser,website.info.id,'revoked-origin');
      sourcePermissionRevocation.reapproval = await reapproveDependencyAfterChromeRevocation(sidebar);
      await clickReal(sidebar,node('#page-program-load'));
      await until(()=>sidebar.read(text('#page-program-status')+'?.includes("已载入固定 Page 源码")'),'Load reapproved original author lock');
      const websiteURL=new URL(report.websiteURL);
      const websiteOrigin=websiteURL.protocol+'//'+websiteURL.hostname+'/*';
      if(!await sidebar.read('chrome.permissions.contains({origins:['+JSON.stringify(websiteOrigin)+']})')){
        await clickReal(sidebar,node('#page-program-restore'));
        write('native-website-restore-ready.json',{originPattern:websiteOrigin,entry:'Saved Page restore access button'});
        await until(()=>sidebar.read('chrome.permissions.contains({origins:['+JSON.stringify(websiteOrigin)+']})'),'Original test website permission restored through product',300000);
      }
      sourcePermissionRevocation.websiteRestored=await sidebar.read('chrome.permissions.contains({origins:['+JSON.stringify(websiteOrigin)+']})');
    }
    write('source-permission-revocation.json', sourcePermissionRevocation);
    report.tests.push({name: 'real-chrome-site-access-revocation-and-product-reapproval', status: sourcePermissionRevocation.status === 'PASS' ? 'PASS' : 'NOT_TESTED', details: sourcePermissionRevocation});

    const rerunReceipt = await runPreview(sidebar, realBuiltHash, 'rerun-after-load');
    assert.equal(rerunReceipt.sourceHash, firstReceipt.sourceHash);
    await until(() => sidebar.read('!' + node('#page-program-verify') + '.disabled'), 'Verify frozen version enabled');
    await clickReal(sidebar, node('#page-program-verify'));
    await until(() => sidebar.read('!' + node('#page-program-install') + '.disabled'), 'Verify completed and Install enabled');
    const afterVerify = await readInstalledRows(sidebar, programId);
    const verification = afterVerify.find(row => row.tag === 'page-verification-v1' && row.sourceHash === realBuiltHash);
    assert(verification, 'Verification row must bind frozen sourceHash');
    assert.equal(verification.receipt?.sourceHash, realBuiltHash);
    write('verification.json', verification);
    await clickReal(sidebar, node('#page-program-install'));
    const installedRows = await until(async () => {
      const rows = await readInstalledRows(sidebar, programId);
      return rows.find(row => row.tag === 'page-installed-v1' && row.nativeState === 'registered') ? rows : null;
    }, 'Program installed through real Install button');
    write('installation.json', installedRows);
    const installedUrl = report.websiteURL + '?installed=1';
    await website.session.call('Page.navigate', {url: installedUrl});
    await until(() => website.session.read('location.href===' + JSON.stringify(installedUrl) + '&&document.readyState==="complete"'), 'Fresh installed document loaded');
    await until(() => website.session.read('document.getElementById("opendesk-page-import-persistence-proof")?.textContent.includes("11")'), 'Installed auto-run visible effect');
    await until(() => sidebar.read('!' + node('#page-program-refresh') + '.disabled'), 'Refresh status button enabled after install');
    await clickReal(sidebar, node('#page-program-refresh'));
    const executionRows = await until(async () => {
      const rows = await readInstalledRows(sidebar, programId);
      return rows.find(row => row.tag === 'page-execution-v1' && row.sourceHash === realBuiltHash && row.state === 'completed') ? rows : null;
    }, 'Installed auto-run receipt recorded');
    const execution = executionRows.find(row => row.tag === 'page-execution-v1' && row.sourceHash === realBuiltHash && row.state === 'completed');
    assert.equal(execution.result?.sourceHash, realBuiltHash);
    write('installed-execution.json', execution);
    report.tests.push({name: 'real-save-reopen-load-author-source-rerun-verify-install', status: 'PASS', programId, authorSourceHash: hash(authorSource), sourceHash: realBuiltHash, initialReceipt: firstReceipt, rerunReceipt, verificationReceipt: verification.receipt, installedExecution: {documentId: execution.documentId, receiptId: execution.receiptId, sourceHash: execution.sourceHash}});
    const asset=await readDependencyAsset(sidebar,hash(cached));
    assert.equal(asset?.actualSha256,hash(cached),'Own downloaded dependency cache identity');
    for(const mode of ['corrupt','delete']){
      const fault=await faultDependencyThroughDevTools(browser,base,attach,{...panel,session:sidebar},asset,mode);
      await browser.call('Target.activateTarget',{targetId:website.info.id});
      fault.loadBlocked=await expectSavedLoadBlocked(sidebar,website.session,browser,website.info.id,'cache-'+mode);
      fault.previewBlocked=await expectPreviewBlocked(sidebar,website.session,'cache-'+mode);
      const url=report.websiteURL+'?cache-'+mode+'=1';
      await website.session.call('Page.navigate',{url});
      await until(()=>website.session.read('location.href==='+JSON.stringify(url)+'&&document.readyState==="complete"'),'Fresh document for cache '+mode);
      const frame=await sidebar.read('(async()=>{const tab=(await chrome.tabs.query({url:'+JSON.stringify(url)+'}))[0];return chrome.webNavigation.getFrame({tabId:tab.id,frameId:0});})()');
      fault.documentId=frame.documentId;
      fault.freshLoadBlocked=await expectSavedLoadBlocked(sidebar,website.session,browser,website.info.id,'cache-'+mode+'-fresh');
      assert.equal(await website.session.read('document.getElementById("opendesk-page-import-persistence-proof")'),null,'Installed author effect absent after cache fault');
      fault.rows=await readInstalledRows(sidebar,programId);
      assert(!fault.rows.some(row=>row.tag==='page-execution-v1'&&row.documentId===frame.documentId&&row.state==='completed'),'No success receipt for faulted document');
      write('cache-'+mode+'-acceptance.json',fault);
      report.tests.push({name:'real-visible-devtools-cache-'+mode+'-load-preview-installed-guard',status:'PASS',details:fault});
    }
    report.status = report.tests.every(row=>row.status==='PASS')?'PASS':'PARTIAL';
  } catch (error) {
    report.status = 'FAIL';
    report.error = errorRecord(error);
    for(const session of sessions.filter(row=>row.label!=='browser'))try{write('failure-ui-'+session.label+'.json',await session.read('(()=>{const roots=[document],rows=[];while(roots.length){const root=roots.pop();for(const e of root.querySelectorAll("*")){if(e.shadowRoot)roots.push(e.shadowRoot);if(e.matches("button,input,select,cr-button,cr-radio-button")||e.id.includes("status"))rows.push({tag:e.tagName,id:e.id,text:(e.textContent||e.getAttribute("aria-label")||"").slice(0,500),disabled:e.disabled,checked:e.checked});}}return rows;})()'));}catch{}
    throw error;
  } finally {
    report.finishedAt = new Date().toISOString();
    if (fs.existsSync(packageRoot)) report.packageAfter = fingerprint(packageRoot);
    write('acceptance.json', report);
    if(launched&&!args['keep-profile']){
      try{await browser?.call('Browser.close');}catch{}
      try{write('chrome-cleanup.json',await launched.chrome.cleanup?.());}catch(error){write('chrome-cleanup-error.json',errorRecord(error));}
    }
    for (const session of sessions.reverse()) {
      try { session.close(); } catch {}
    }
    try { site.close(); } catch {}
  }
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
