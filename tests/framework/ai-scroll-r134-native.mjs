// Native UI driver, NOT a mock or a native acceptance result by itself.
// Node 22+. No default browser, extension, evidence directory or external CDP.
// AI_SCROLL_R134_CFT=/absolute/.../Google Chrome for Testing
// AI_SCROLL_R134_EXTENSION=/absolute/isolated-extension-snapshot
// AI_SCROLL_R134_EVIDENCE=/absolute/new-evidence-directory
// node tests/framework/ai-scroll-r134-native.mjs start
// Keep stdin open (e.g. a PTY); one JSON command per line, sequential replies.
// {"command":"panel"} -> {"command":"import"} -> review -> {"command":"confirm"}
// {"command":"manager"} opens chrome://extensions/?id=<real id>. Observe, then
// click the actual userscript toggle using a shadow selector array if needed.
// {"command":"click","target":"manager","selector":["extensions-manager",
//   "extensions-detail-view","#allow-user-scripts"]} (inspect first; versions vary).
// {"command":"read"}, {"command":"targets"}, {"command":"checkpoint"}
// {"command":"navigate","target":"demo","url":"http://127.0.0.1:43111/demo-form.html"}
// Generic click/type use only trusted Input; selectors can traverse open shadow roots.
// {"command":"type","target":"panel","selector":".ec-site-upgrade [name=origin]",
//   "text":"http://127.0.0.1:43111"}
// {"command":"type","target":"panel","selector":".ec-site-upgrade [name=pathScope]","text":"/demo-form.html"}
// Click .ec-site-upgrade button[type=submit], inspect the original review, confirm.
// Demo settings selectors: ['[data-opendesk-ai-scroll-navigation="settings"]','#launch']
// then #main, #scroller, #messages, #test-top, #test-bottom, #save in that shadow root.
// No inferred selector values or invented page content: inspect the live demo first.
// A permission bubble requires leader CUA; NEVER fake a grant or retry confirmation
// automatically. Errors checkpoint and keep the owned process alive. Explicit stop,
// stdin EOF, SIGINT or SIGTERM saves evidence and stops ONLY this launcher's instance.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile, realpath, readdir, lstat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline';
import {launchChrome} from './k5-sdk-native-launcher.mjs';
import {connect, evaluate} from './sidebar-native-session.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const packageFile = path.join(root, 'examples/programs/chatgpt-jump-top/ai-scroll-navigation.opendesk-page.json');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const output = value => console.log(JSON.stringify(value));
async function until(read, label, timeout = 12000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const value = await read(); if (value) return value; await pause(150); }
  throw Error(`CHECKPOINT_REQUIRED: ${label}; use leader CUA; no automatic permission handling`);
}
async function fingerprint(directory) {
  const files = [];
  async function walk(dir) {
    for (const name of (await readdir(dir)).sort()) {
      const file = path.join(dir, name), info = await lstat(file);
      assert(!info.isSymbolicLink(), `Snapshot must not symlink daily files: ${file}`);
      if (info.isDirectory()) await walk(file);
      else if (info.isFile()) files.push({path: path.relative(directory, file), sha256: sha(await readFile(file))});
    }
  }
  await walk(directory);
  return {sha256: sha(JSON.stringify(files)), files};
}
// Fixed read expressions only. No caller-supplied JS, storage writes, permission
// APIs that grant access, developerPrivate, registration, or product method calls.
const installedRead = `(async()=>{
  const result={contexts:await chrome.runtime.getContexts({}),permissions:await chrome.permissions.getAll(),databases:[]};
  try{result.userScripts=await chrome.userScripts.getScripts();}catch(e){result.userScriptsError=String(e);}
  for(const info of await indexedDB.databases()){
    if(!info.name||!info.version)continue;
    const db=await new Promise((resolve,reject)=>{
      const q=indexedDB.open(info.name,info.version);
      q.onupgradeneeded=()=>{q.transaction.abort();reject(Error('DB changed; refusing creation/upgrade'));};
      q.onerror=()=>reject(q.error);q.onsuccess=()=>resolve(q.result);
    });
    try{
      if(!db.objectStoreNames.contains('frameworkKV'))continue;
      const rows=await new Promise((resolve,reject)=>{
        const q=db.transaction('frameworkKV','readonly').objectStore('frameworkKV').getAll();
        q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);
      });
      result.databases.push({name:info.name,version:info.version,rows:rows.filter(r=>
        r?.programId==='opendesk.ai-scroll-navigation'||r?.manifest?.programId==='opendesk.ai-scroll-navigation')});
    }finally{db.close();}
  }
  return result;
})()`;
// >>> splits open shadow roots; values are serialized, never executable input.
const locate = selector => {
  const parts = Array.isArray(selector) ? selector : [selector];
  assert(parts.length && parts.every(s => typeof s === 'string' && s.length && s.length < 2048));
  return `(()=>{let root=document,node;for(const [i,s] of ${JSON.stringify(parts)}.entries()){
    const nodes=root.querySelectorAll(s);if(nodes.length!==1)throw Error('Selector must match exactly once: '+s);
    node=nodes[0];if(i<${parts.length - 1}){root=node.shadowRoot;if(!root)throw Error('Open shadow root missing');}
  }return node;})()`;
};
const domRead = `(()=>{const rows=[];function walk(root,chain=[]){
  for(const e of root.querySelectorAll('*')){
    if(e.matches('button,input,select,textarea,[role=button],[role=switch],[role=alert],[role=status]')){
      const r=e.getBoundingClientRect();if(r.width&&r.height)rows.push({chain,tag:e.localName,id:e.id,
        name:e.getAttribute('name'),label:e.getAttribute('aria-label'),role:e.getAttribute('role'),
        text:e.textContent?.slice(0,600),value:e.value,disabled:e.disabled,checked:e.checked,
        rect:{x:r.x,y:r.y,width:r.width,height:r.height},
        extensionKey:e.getAttribute('data-extension-key'),action:e.getAttribute('data-extension-action')});
    }if(e.shadowRoot)walk(e.shadowRoot,[...chain,e.id?'#'+e.id:e.localName]);
  }}walk(document);return {url:location.href,title:document.title,text:document.body?.innerText.slice(0,18000),
    viewport:{width:innerWidth,height:innerHeight,scale:devicePixelRatio},
    scroll:{top:document.scrollingElement?.scrollTop,height:document.scrollingElement?.scrollHeight,client:document.scrollingElement?.clientHeight},controls:rows};})()`;

async function start() {
  assert.equal(process.argv[2], 'start', 'Use start; browser is never started on import');
  const envPath = async name => { assert(process.env[name] && path.isAbsolute(process.env[name]), `${name} must be an explicit absolute path`); return realpath(process.env[name]); };
  const binary = await envPath('AI_SCROLL_R134_CFT');
  const extension = await envPath('AI_SCROLL_R134_EXTENSION');
  assert(/Google Chrome for Testing(?:\.exe)?$/.test(binary), 'Explicit CFT executable required');
  const dist = path.join(root, 'dist');
  const within = (parent, child) => child === parent || child.startsWith(parent + path.sep);
  assert(!within(dist, extension), 'Do not load repository dist/daily extension');
  try { assert(!within(await realpath(dist), extension), 'Do not load resolved daily dist'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  assert(process.env.AI_SCROLL_R134_EVIDENCE && path.isAbsolute(process.env.AI_SCROLL_R134_EVIDENCE), 'Explicit evidence directory required');
  const directory = path.resolve(process.env.AI_SCROLL_R134_EVIDENCE);
  // Exclusive directory prevents concurrent drivers from clobbering a live session.
  assert(!within(dist, directory) && !within(extension, directory), 'Evidence must be outside dist and snapshot');
  await mkdir(directory);
  const actualDirectory = await realpath(directory);
  assert(!within(extension, actualDirectory) && !within(dist, actualDirectory), 'Resolved evidence path is protected');
  const bytes = await readFile(packageFile), pkg = JSON.parse(bytes);
  assert.equal(pkg.programId, 'opendesk.ai-scroll-navigation');
  assert.equal(sha(Buffer.from(pkg.sourceUtf8)), pkg.sourceHash, 'Package sourceHash must match actual UTF-8');
  const manifest = JSON.parse(await readFile(path.join(extension, 'manifest.json')));
  const report = {scope: 'R134_REAL_HEADFUL_CFT_ORIGINAL_UI', status: 'NOT_TESTED',
    driverPid: process.pid, directory, extension, binary,
    package: {file: packageFile, sha256: sha(bytes), sourceHash: pkg.sourceHash,
      programId: pkg.programId, revision: pkg.revision, version: pkg.version},
    extensionFingerprint: await fingerprint(extension), stages: [], inputs: [],
    nativeAcceptance: 'NOT_TESTED; checkpoints are observations, not PASS'};
  let launched, client, worker, stopping, lines, signal, sequence = 0;
  const onSignal = value => { signal = value; lines?.close(); };
  const int = () => onSignal('SIGINT'), term = () => onSignal('SIGTERM');
  const targets = new Map();
  const record = (stage, details = {}) => { report.stages.push({at: new Date().toISOString(), stage, ...details}); report.status = stage; };
  const save = () => writeFile(path.join(directory, 'session.json'), JSON.stringify({...report,
    targets: Object.fromEntries(targets)}, null, 2) + '\n');
  const attach = async targetId => ({targetId, sessionId: (await client.send('Target.attachToTarget', {targetId, flatten: true})).sessionId});
  const read = (expression, sessionId) => evaluate(client, expression, sessionId);
  async function target(name) {
    assert(targets.has(name), `Unknown target alias: ${name}; use targets or navigate`);
    return targets.get(name);
  }
  async function shot(name, row) {
    const prefix = `${String(++sequence).padStart(4, '0')}-${name}`;
    await writeFile(path.join(directory, prefix + '.json'), JSON.stringify(await read(domRead, row.sessionId), null, 2));
    try {
      const image = await client.send('Page.captureScreenshot', {format: 'png'}, row.sessionId);
      await writeFile(path.join(directory, prefix + '.png'), Buffer.from(image.data, 'base64'));
    } catch (error) { record('SCREENSHOT_UNAVAILABLE', {target: name, error: String(error)}); }
  }
  async function checkpoint(reason) {
    record('CHECKPOINT', {reason, next: 'Leader CUA may operate only this owned CFT. Keep stdin open; stop when finished.'});
    for (const [name, row] of targets) {
      try { await shot(name, row); } catch (error) { record('TARGET_UNAVAILABLE', {target: name, error: String(error)}); }
    }
    if (worker) try { report.installedObservation = await read(installedRead, worker.sessionId); }
    catch (error) { report.observationError = String(error); }
    await save();
    return {sessionFile: path.join(directory, 'session.json'), endpoint: launched?.endpoint, status: report.status};
  }
  async function stop(reason) {
    if (stopping) return stopping;
    stopping = (async () => {
      try { await checkpoint(reason); } finally {
        client?.close();
        try { if (launched) { await launched.copyLog(); } }
        finally { if (launched) report.cleanup = await launched.stop(); }
        record('STOPPED', {reason}); await save();
      }
      return {stopped: true, cleanup: report.cleanup};
    })();
    return stopping;
  }
  async function navigate(name, url) {
    assert(/^[a-z][a-z0-9-]{0,30}$/.test(name) && name !== 'panel', 'Use a named tab, never navigate SIDE_PANEL');
    const parsed = new URL(url);
    assert((['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password) ||
      url === `chrome://extensions/?id=${report.extensionId}` ||
      url === `chrome-extension://${report.extensionId}/sidepanel.html`, 'Navigation URL not allowed');
    let row = targets.get(name);
    if (!row) { row = await attach((await client.send('Target.createTarget', {url})).targetId); targets.set(name, row); }
    else await client.send('Page.navigate', {url}, row.sessionId);
    await client.send('Target.activateTarget', {targetId: row.targetId});
    return row;
  }
  async function click(name, selector) {
    const row = await target(name), node = locate(selector);
    await client.send('Target.activateTarget', {targetId: row.targetId});
    const point = await read(`(()=>{const e=${node},r=e.getBoundingClientRect();
      if(e.disabled||r.width<=0||r.height<=0)throw Error('Control not available');
      const x=r.x+r.width/2,y=r.y+r.height/2;if(x<0||y<0||x>=innerWidth||y>=innerHeight)throw Error('Control outside viewport; use trusted wheel/CUA');
      const hit=e.getRootNode().elementFromPoint(x,y);if(hit!==e&&!e.contains(hit))throw Error('Control obscured');
      return {x,y};})()`, row.sessionId);
    // Observation only, no synthetic event or handler call. The listener reports
    // the event from Chrome's Input path and never prevents or changes it.
    const proof = read(`new Promise(resolve=>{const e=window;let timer;
      const done=event=>{clearTimeout(timer);e.removeEventListener('click',done,true);
        resolve({isTrusted:event.isTrusted,type:event.type,active:navigator.userActivation.isActive});};
      e.addEventListener('click',done,{capture:true,once:true});
      timer=setTimeout(()=>{e.removeEventListener('click',done,true);resolve({isTrusted:false,error:'No click observed'});},4000);
    })`, row.sessionId);
    // A subsequent command reply on this session ensures the observer was installed.
    await read('document.readyState', row.sessionId);
    await client.send('Input.dispatchMouseEvent', {type: 'mousePressed', button: 'left', clickCount: 1, ...point}, row.sessionId);
    await client.send('Input.dispatchMouseEvent', {type: 'mouseReleased', button: 'left', clickCount: 1, ...point}, row.sessionId);
    const trusted = await proof;
    report.inputs.push({at: new Date().toISOString(), target: name, selector, point, ...trusted});
    assert.equal(trusted.isTrusted, true, 'Real trusted click required');
    record('TRUSTED_UI_CLICK', {target: name, selector}); await save();
    return trusted;
  }
  async function panel() {
    await click('catalog', '#catalog-open-dev-sidebar');
    const row = await until(async () => {
      const contexts = await read('chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"]})', worker.sessionId);
      const infos = (await client.send('Target.getTargets')).targetInfos;
      for (const context of contexts.filter(c => c.documentId && c.documentUrl?.startsWith(`chrome-extension://${report.extensionId}/`))) {
        for (const info of infos.filter(t => t.url === context.documentUrl && !['service_worker', 'iframe'].includes(t.type) && t.targetId !== targets.get('catalog').targetId)) {
          const attached = await attach(info.targetId);
          const identity = await read('(async()=>({url:location.href,tab:await chrome.tabs.getCurrent(),ready:!!document.querySelector("#tab-tools")}))()', attached.sessionId);
          if (identity.tab?.id || !identity.ready) continue;
          report.nativePanel = {context, target: info, identity}; return attached;
        }
      }
      return null;
    }, 'genuine SIDE_PANEL runtime context and non-tab document');
    targets.set('panel', row); record('VERIFIED_SIDE_PANEL', report.nativePanel);
    return checkpoint('Side panel verified; next command import');
  }
  async function command(cmd) {
    switch (cmd.command) {
      case 'targets': {
        const infos = (await client.send('Target.getTargets')).targetInfos;
        return {aliases: Object.fromEntries(targets), targets: infos};
      }
      case 'panel': return panel();
      case 'manager': await navigate('manager', `chrome://extensions/?id=${report.extensionId}`); return checkpoint('Chrome original details UI; observe userscript state before trusted toggle');
      case 'navigate': await navigate(cmd.target, cmd.url); return checkpoint('Navigated named owned tab');
      case 'click': return click(cmd.target, cmd.selector);
      case 'type': {
        assert(typeof cmd.text === 'string' && cmd.text.length <= 4096, 'Bounded input text required');
        const row = await target(cmd.target);
        assert(await read(`(()=>{const e=${locate(cmd.selector)};return e.matches('input:not([type=file]),textarea')&&!e.disabled&&!e.readOnly;})()`, row.sessionId), 'Editable native input required');
        await click(cmd.target, cmd.selector);
        // Native select-all + typing; no value setter, dispatchEvent or JS focus.
        const modifiers = process.platform === 'darwin' ? 4 : 2;
        await client.send('Input.dispatchKeyEvent', {type: 'keyDown', key: 'a', code: 'KeyA', modifiers, commands: ['selectAll']}, row.sessionId);
        await client.send('Input.dispatchKeyEvent', {type: 'keyUp', key: 'a', code: 'KeyA', modifiers}, row.sessionId);
        await client.send('Input.insertText', {text: cmd.text}, row.sessionId);
        record('TRUSTED_INPUT_TEXT', {target: cmd.target, selector: cmd.selector, text: cmd.text}); await save();
        return {typed: true};
      }
      case 'wheel': {
        const row = await target(cmd.target);
        for (const key of ['x', 'y', 'deltaY']) assert(Number.isFinite(cmd[key]) && Math.abs(cmd[key]) <= 10000);
        await client.send('Input.dispatchMouseEvent', {type: 'mouseWheel', x: cmd.x, y: cmd.y, deltaX: 0, deltaY: cmd.deltaY}, row.sessionId);
        record('TRUSTED_WHEEL', {target: cmd.target, x: cmd.x, y: cmd.y, deltaY: cmd.deltaY}); await save(); return {scrolled: true};
      }
      case 'import': {
        const row = await target('panel');
        assert.equal(sha(await readFile(packageFile)), report.package.sha256, 'Package changed after fingerprint');
        await click('panel', '#tab-tools');
        await client.send('Page.setInterceptFileChooserDialog', {enabled: true}, row.sessionId);
        await click('panel', '#extension-center-more'); await click('panel', '#extension-center-import');
        await client.send('DOM.enable', {}, row.sessionId);
        const document = (await client.send('DOM.getDocument', {}, row.sessionId)).root;
        const {nodeId} = await client.send('DOM.querySelector', {nodeId: document.nodeId, selector: '#sidebar-tool-file'}, row.sessionId);
        assert(nodeId, 'Original import file input required');
        await client.send('DOM.setFileInputFiles', {nodeId, files: [packageFile]}, row.sessionId);
        record('REAL_FILE_INPUT', {file: packageFile, sha256: report.package.sha256});
        report.preview = await until(() => read(`(()=>{const p=document.querySelector('#sidebar-tool-preview'),b=document.querySelector('#sidebar-tool-install');
          return p&&!p.hidden&&b&&!b.disabled?{text:p.innerText,button:b.innerText}:null;})()`, row.sessionId), 'original package preview');
        return checkpoint('Review shown; explicit confirm command invokes original install button');
      }
      case 'confirm':
        await click('panel', '#sidebar-tool-install');
        // Do not poll/replay an operation with uncertain permission side effects.
        return checkpoint('Original confirmation clicked ONCE; inspect permission bubble with leader CUA, then read');
      case 'read': case 'checkpoint': return checkpoint(cmd.command === 'read' ? 'Read-only installed state and live UI' : 'Leader handoff');
      default: throw Error('Commands: panel, import, confirm, manager, targets, navigate, click, type, wheel, read, checkpoint, stop. No eval/raw CDP.');
    }
  }
  process.on('SIGINT', int); process.on('SIGTERM', term);
  try {
    await save();
    launched = await launchChrome({root, binary, extension, headed: true, directory, label: 'ai-scroll-r134'});
    if (signal) throw Error(`Startup interrupted by ${signal}`);
    report.launcher = launched.metadata; report.endpoint = launched.endpoint;
    client = await connect(launched.endpoint);
    report.browser = await client.send('Browser.getVersion');
    assert(!/HeadlessChrome/i.test(report.browser.product + report.browser.userAgent));
    const sw = await until(async () => (await client.send('Target.getTargets')).targetInfos.find(t =>
      t.type === 'service_worker' && t.url.startsWith('chrome-extension://') &&
      t.url.endsWith('/' + manifest.background.service_worker)), 'snapshot service worker');
    report.extensionId = new URL(sw.url).host; worker = await attach(sw.targetId);
    await navigate('catalog', `chrome-extension://${report.extensionId}/sidepanel.html`);
    await until(() => read('document.readyState==="complete"&&!!document.querySelector("#catalog-open-dev-sidebar")', targets.get('catalog').sessionId), 'original catalog opener');
    output({ready: true, ...(await checkpoint('Owned headful CFT ready; send panel command'))});
    if (signal) throw Error(`Startup interrupted by ${signal}`);
    lines = createInterface({input: process.stdin, terminal: false});
    try {
      for await (const line of lines) {
        if (signal) break;
        if (!line.trim()) continue;
        let cmd;
        try {
          cmd = JSON.parse(line);
          if (cmd.command === 'stop') { output(await stop('explicit stop')); break; }
          output({command: cmd.command, result: await command(cmd)});
        } catch (error) {
          record('NEEDS_LEADER_CUA', {command: cmd?.command, error: String(error)});
          output({error: String(error), ...(await checkpoint('Operation stopped; no automatic retry; owned process retained'))});
        }
      }
    } finally { lines.close(); await stop(signal || 'stdin ended'); }
  } catch (error) {
    record('DRIVER_FAILED', {error: String(error)});
    try { await stop('driver failure'); } finally { throw error; }
  } finally { process.off('SIGINT', int); process.off('SIGTERM', term); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await start();
