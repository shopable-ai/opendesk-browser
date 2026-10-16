// No dev server or build tool. Requires Node >=22 and real Chrome/Chromium.
// Run: node examples/sidebar-tools/adblock/preview/acceptance.mjs
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {existsSync, mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir, platform} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:net';

const preview = dirname(new URL(import.meta.url).pathname);
const root = resolve(preview, '../../../..');
const reactFile = join(root, 'src/libs/page-frameworks/react-19.2.0.js');
const reactHash = 'd1eec2e96ed42046ad543a10af7de992aee633ac06017f44f6b917e36451c758';
const src = readFileSync(join(preview, 'index.html'), 'utf8');
const app = readFileSync(join(preview, 'app.js'), 'utf8');
const htm = readFileSync(join(preview, 'vendor/htm-3.1.1.js'), 'utf8');
assert.match(src, /src="\.\.\/\.\.\/\.\.\/\.\.\/src\/libs\/page-frameworks\/react-19\.2\.0\.js"/);
assert.match(src, /src="vendor\/htm-3\.1\.1\.js"/);
assert.match(src, /src="app\.js"/);
assert.doesNotMatch(src, /<script[^>]+(?:https?:|type="module")/i);
assert.doesNotMatch(src + app, /https?:\/\/(?:cdn|unpkg|esm\.sh|skypack)/i);
assert.doesNotMatch(app, /document\.createElement|innerHTML|replaceChildren|chrome\.declarativeNetRequest/i);
assert.match(app, /React\.createRoot/);
assert.match(app, /React\.useState/);
assert.match(htm, /OpenDeskPreviewHTM/);
assert.ok(src.includes('src/ui/design-tokens.css'));
assert.ok(src.includes('src/ui/design-system.css'));
assert.ok(app.includes('od-surface') && app.includes('od-icon-button'));
assert.ok(app.includes('React.useRef'));
assert.ok(existsSync(join(root,'src/ui/design-tokens.css')));
assert.ok(existsSync(join(root,'src/ui/design-system.css')));
assert.ok(existsSync(join(preview, 'vendor/LICENSE-htm.txt')));
assert.ok(existsSync(join(root, 'src/libs/page-frameworks/react-LICENSE.txt')));
assert.equal(createHash('sha256').update(readFileSync(reactFile)).digest('hex'), reactHash);
console.log('STATIC_GUARDS_PASS · React 19.2.0 pinned, local HTM, plain file scripts, no CDN');

function chromeExecutable() {
  const preferred = [process.env.CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean);
  for (const p of preferred) if (existsSync(p)) return p;
  // Resolve PATH without a shell.
  for (const dir of (process.env.PATH || '').split(':')) {
    for (const name of ['google-chrome', 'chromium', 'chromium-browser']) {
      const p = join(dir, name);
      if (existsSync(p)) return p;
    }
  }
  throw Error('REAL_CHROME_BLOCKED: set CHROME_BIN to a real Chrome/Chromium binary');
}
async function reservePort() {
  const listener = createServer();
  await new Promise((ok, bad) => {listener.once('error',bad); listener.listen(0,'127.0.0.1',ok);});
  const port = listener.address().port;
  await new Promise(ok => listener.close(ok));
  return port;
}
const sleep = ms => new Promise(ok => setTimeout(ok,ms));
async function until(fn, label, ms=9000) {
  const end=Date.now()+ms;
  let last;
  while (Date.now()<end) {
    try {const value=await fn(); if(value) return value;} catch(e){last=e;}
    await sleep(70);
  }
  throw Error('TIMEOUT: '+label+(last?' · '+last.message:''));
}
const profile = mkdtempSync(join(tmpdir(), 'adblock-r2-chrome-'));
let browser, socket;
let browserLog='';
// Prevent a stuck macOS Chrome/CDP process from holding CI indefinitely.
const watchdog=setTimeout(()=>{console.error('E_CHROME_WATCHDOG · last stderr: '+browserLog);process.exit(124);},75000);
const exceptions = [];
const requests = [];
let counter = 1;
const waiting = new Map();
try {
  const port=await reservePort();
  const flags=[
    '--headless=new','--disable-gpu','--disable-extensions','--no-first-run',
    '--no-default-browser-check','--remote-debugging-port='+port,
    '--user-data-dir='+join(profile,'profile'),
    '--window-size=1000,950','--disable-dev-shm-usage',
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost'
  ];
  if (platform() === 'linux') flags.push('--no-sandbox'); // GitHub's shared runners may restrict user namespaces.
  flags.push(pathToFileURL(join(preview,'index.html')).href);
  browser = spawn(chromeExecutable(),flags,{stdio:['ignore','ignore','pipe']});
  browser.stderr.on('data',part=>{browserLog=(browserLog+String(part)).slice(-6000);});
  let target;
  try { target = await until(async () => {
    if (browser.exitCode != null) throw Error('Chromium exited '+browser.exitCode);
    const res=await fetch('http://127.0.0.1:'+port+'/json/list');
    const tabs=await res.json();
    return tabs.find(t=>t.type==='page' && t.url.startsWith('file:'));
  },'CDP real file:// page'); }
  catch(e) {throw Error(e.message + '\nCHROME_DIAGNOSTICS: ' + browserLog);}
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok,bad)=>{socket.addEventListener('open',ok,{once:true});socket.addEventListener('error',bad,{once:true});});
  socket.addEventListener('message',event=>{
    const msg=JSON.parse(event.data);
    if (msg.id && waiting.has(msg.id)) {
      const {ok,bad}=waiting.get(msg.id);waiting.delete(msg.id);
      msg.error?bad(Error(JSON.stringify(msg.error))):ok(msg.result||{});
    }
    if (msg.method==='Runtime.exceptionThrown') exceptions.push(msg.params.exceptionDetails?.text||'JS exception');
    if (msg.method==='Runtime.consoleAPICalled' && msg.params.type==='error')
      exceptions.push((msg.params.args||[]).map(a=>a.value||a.description).join(' '));
    if (msg.method==='Network.requestWillBeSent' && /^https?:/i.test(msg.params.request.url))
      requests.push(msg.params.request.url);
  });
  function send(method, params={}) {
    return new Promise((ok,bad)=>{
      const id=counter++; waiting.set(id,{ok,bad});
      socket.send(JSON.stringify({id,method,params}));
    });
  }
  async function evaluate(expression) {
    const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(result.exceptionDetails) throw Error('PAGE_EVAL: '+result.exceptionDetails.text);
    return result.result?.value;
  }
  async function query(expression, expected) {
    return until(async()=> (await evaluate(expression)) === expected,'expected '+expression+' = '+JSON.stringify(expected));
  }
  async function click(id) {
    assert.equal(await evaluate('!!document.getElementById('+JSON.stringify(id)+')'),true,'element exists '+id);
    await evaluate('document.getElementById('+JSON.stringify(id)+').click()');
    await sleep(80);
  }
  async function selectDomain(domain) {
    await evaluate('(()=>{const e=document.getElementById("domain-select"); e.value='+JSON.stringify(domain)+';e.dispatchEvent(new Event("change",{bubbles:true}));return true})()');
    await query('document.getElementById("site-host")?.textContent',domain);
  }
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Network.setBlockedURLs',{urls:['http://*','https://*']});
  await send('Page.reload',{ignoreCache:true});
  await query('document.getElementById("global-switch")?.getAttribute("aria-checked")','true');
  assert.equal(await evaluate('OpenDeskPageReact.version'), '19.2.0');
  assert.equal(await evaluate('typeof OpenDeskPageReact.useState'), 'function');
  assert.equal(await evaluate('document.querySelectorAll(".frame").length'), 1);
  console.log('01 REACT_FILE_BOOT_PASS');
  await click('reset-button');
  await query('document.getElementById("blocked-count")?.textContent','18');
  await click('global-switch');
  await query('document.getElementById("global-switch")?.getAttribute("aria-checked")','false');
  assert.equal(await evaluate('document.getElementById("site-switch").disabled'),true);
  await click('global-switch');
  await query('document.getElementById("site-switch")?.getAttribute("aria-checked")','true');
  console.log('02 GLOBAL_SYNC_PASS');
  await click('site-switch');
  await query('document.getElementById("allow-count")?.textContent','1');
  await query('document.getElementById("site-switch")?.getAttribute("aria-checked")','false');
  await click('global-switch');
  await click('global-switch');
  await query('document.getElementById("allow-count")?.textContent','1');
  await query('document.getElementById("site-switch")?.getAttribute("aria-checked")','false');
  await click('open-allowlist');
  assert.equal(await evaluate('document.querySelector("#allow-rows strong")?.textContent'),'news.example.com');
  await click('reset-button'); // Preview-only controls remain accessible outside Side Panel.
  await query('document.getElementById("site-switch")?.getAttribute("aria-checked")','true');
  await click('site-switch');
  await click('open-allowlist');
  await evaluate('document.querySelector("button[data-restore]")?.click()');
  await query('document.getElementById("allow-summary")?.textContent','0 个网站');
  await click('reset-button');
  console.log('03 EXCEPTION_RESTORE_PASS');
  await selectDomain('video.example.com');
  await query('document.getElementById("blocked-count")?.textContent','42');
  await click('site-switch');
  await selectDomain('shop.example.com');
  await query('document.getElementById("blocked-count")?.textContent','26');
  await selectDomain('video.example.com');
  await query('document.getElementById("site-switch")?.getAttribute("aria-checked")','false');
  await selectDomain('chrome://settings');
  assert.equal(await evaluate('document.getElementById("site-switch").disabled'),true);
  await query('document.getElementById("blocked-count")?.textContent','—');
  await click('open-settings');
  assert.equal(await evaluate('document.querySelector("#settings .page-heading h2")?.textContent'),'设置');
  await click('settings-allowlist');
  assert.equal(await evaluate('document.querySelector("#allow-rows strong")?.textContent'),'video.example.com');
  await evaluate('document.querySelector("#allowlist .back").click()');
  assert.equal(await evaluate('!!document.querySelector("#settings .page-heading")'),true,
    'Back must restore the Settings origin');
  assert.equal(await evaluate('document.activeElement?.id'),'settings-allowlist',
    'Back must restore focus to origin action');
  await evaluate('document.querySelector("#settings .back").click()');
  await query('document.getElementById("site-host")?.textContent','chrome://settings');
  assert.equal(await evaluate('document.activeElement?.id'),'open-settings');
  console.log('04 NAVIGATION_RESTRICTED_PASS');
  async function selectScenario(value) {
    await evaluate('(()=>{const e=document.getElementById("scenario-select");e.value='+JSON.stringify(value)+';e.dispatchEvent(new Event("change",{bubbles:true}));return true})()');
  }
  await selectScenario('error');
  await query('document.getElementById("scenario-notice")?.getAttribute("role")','alert');
  assert.equal(await evaluate('document.getElementById("global-switch").disabled'),true);
  assert.equal(await evaluate('document.getElementById("blocked-count").textContent'),'—');
  await click('scenario-retry');
  await query('document.getElementById("scenario-notice")===null',true);
  await selectScenario('permission-denied');
  assert.equal(await evaluate('document.getElementById("site-switch").disabled'),true);
  await selectScenario('untrusted');
  assert.equal(await evaluate('document.querySelector("#scenario-notice img")===null'),true);
  assert.equal(await evaluate('document.querySelector("#scenario-notice")?.textContent.includes("<img src=x")'),true);
  await selectScenario('loading');
  assert.equal(await evaluate('document.getElementById("scenario-retry")===null'),true);
  await selectScenario('ready');
  await query('document.getElementById("global-switch").disabled',false);
  console.log('04B ERROR_PERMISSION_UNTRUSTED_LOADING_PASS');
  await click('theme-button');
  assert.equal(await evaluate('document.querySelector(".stage").classList.contains("night")'),true);
  await selectDomain('video.example.com');
  const storageWorks=await evaluate('(()=>{try{return !!localStorage.getItem("opendesk.adblock.preview.r2")}catch{return false}})()');
  await send('Page.reload',{ignoreCache:true});
  await until(async()=>await evaluate('!!document.getElementById("global-switch")'),'re-mounted');
  if (storageWorks) {
    await query('document.getElementById("site-host")?.textContent','video.example.com');
    await query('document.querySelector(".stage").classList.contains("night")',true);
    await query('document.getElementById("site-switch")?.getAttribute("aria-checked")','false');
  } else {
    await query('document.getElementById("site-host")?.textContent','news.example.com');
  }
  await click('reset-button');
  await query('document.getElementById("site-host")?.textContent','news.example.com');
  await query('document.querySelector(".stage").classList.contains("night")',false);
  console.log('05 STORAGE_RESET_PASS · '+(storageWorks?'persisted':'file-storage graceful fallback'));
  for (const width of [320,360]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:850,deviceScaleFactor:1,mobile:false});
    await sleep(200);
    const dimension=await evaluate('({scroll:document.documentElement.scrollWidth,view:innerWidth,frame:document.querySelector(".frame").getBoundingClientRect().width})');
    assert.ok(dimension.scroll <= dimension.view+1,'overflow at '+width+': '+JSON.stringify(dimension));
    assert.ok(dimension.frame <=360,'frame wider than 360px');
  }
  await send('Emulation.clearDeviceMetricsOverride');
  console.log('06 WIDTH_320_360_PASS');

  // Copy only the minimum repository tree. Editing this copy proves save-refresh is build-free.
  const sandbox=join(profile,'isolated-repo');
  const replica=join(sandbox,'examples/sidebar-tools/adblock/preview');
  const vendor=join(replica,'vendor');
  mkdirSync(vendor,{recursive:true});
  const copy=(relative)=>copyFileSync(join(preview,relative),join(replica,relative));
  for(const file of ['index.html','style.css','app.js','vendor/htm-3.1.1.js'])copy(file);
  const replicaRuntime=join(sandbox,'src/libs/page-frameworks/react-19.2.0.js');
  mkdirSync(dirname(replicaRuntime),{recursive:true});
  copyFileSync(reactFile,replicaRuntime);
  for (const relative of ['src/ui/design-tokens.css','src/ui/design-system.css']) {
    const destination=join(sandbox,relative);
    mkdirSync(dirname(destination),{recursive:true});
    copyFileSync(join(root,relative),destination);
  }
  const isolated=pathToFileURL(join(replica,'index.html')).href;
  await send('Page.navigate',{url:isolated});
  await query('document.getElementById("global-switch")?.getAttribute("aria-checked")','true');
  const updated=readFileSync(join(replica,'app.js'),'utf8').replace(
    '可交互产品原型 · React R2',
    '可交互产品原型 · React R2 · 保存即生效'
  );
  assert.notEqual(updated,app,'edit must be real');
  writeFileSync(join(replica,'app.js'),updated);
  await send('Page.reload',{ignoreCache:true});
  await until(async()=>String(await evaluate('document.querySelector(".demo-flag")?.textContent||""')).includes('保存即生效'),'zero-build edit reload');
  console.log('07 ZERO_BUILD_SAVE_REFRESH_PASS');
  assert.deepEqual(requests,[],'no remote network requests');
  assert.deepEqual(exceptions,[],'no uncaught React/browser errors');
  console.log('08 OFFLINE_NO_CONSOLE_ERRORS_PASS');
  console.log('BROWSER_RESULT PASS · genuine Chromium file:// interactions · no build/no server');
} finally {
  try {socket?.close();}catch{}
  if (browser) {
    try {browser.kill('SIGKILL');}catch{}
    browser.stderr?.destroy();
    browser.unref();
  }
  rmSync(profile,{recursive:true,force:true,maxRetries:4,retryDelay:100});
  clearTimeout(watchdog);
}
