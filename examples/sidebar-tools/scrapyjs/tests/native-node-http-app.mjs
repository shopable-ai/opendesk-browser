// Run with Node 24 only after native-core has installed the new fixed Task and closed its CFT.
// node <this-file> --seed=<native-core/report.json> --candidate=<App.json> --invite-file=<private file> --relay-state-dir=<parent-owned dir> --out=<NEW artifacts/scrapyjs/...>
// Parent owns relay 43122; the supplied state dir authorizes authenticated CLI lifecycle checks/stop.
// This driver owns only echo 43121 and its cloned CFT; it never sends process kill signals.
// Invitation file: raw invitation token or JSON {invitation:<token>}; never persisted in evidence.
// No direct Node target HTTP client, direct tasks calls, model requests, storage writes or unknown-start retries.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,realpath,lstat} from 'node:fs/promises';
import {resolve,join,dirname,basename,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {launchOwned,openNativePanel,click as nativeClick,fill,fileInput,until,pause,sha,treeIdentity} from './native-session.mjs';
import {createHttpEchoServer,origin} from '../fixtures/http-echo-server.mjs';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {decodeValue} from '../../../../src/platform/page-port/codec.js';


const root = fileURLToPath(new URL('../../../../', import.meta.url));
const opt = name => process.argv.find(x => x.startsWith('--'+name+'='))?.slice(name.length+3);
const redirectOnly=process.argv.includes('--redirect-only');
const execFileAsync=promisify(execFile);
let invitation='';
function redacted(value) {
  const serialized=JSON.stringify(value);
  return JSON.parse(invitation ? serialized.split(invitation).join('[REDACTED]') : serialized);
}
async function listenerPid(allowMissing=false) {
  let stdout;
  try { ({stdout}=await execFileAsync('/usr/sbin/lsof',['-nP','-t','-iTCP:43122','-sTCP:LISTEN'])); }
  catch(error) {
    if(allowMissing && error.code===1 && !String(error.stdout??'').trim())return null;
    throw error;
  }
  const pids=[...new Set(stdout.trim().split(/\s+/).map(Number))];
  assert.equal(pids.length,1,'Exactly one parent-owned relay listener required');
  assert(Number.isSafeInteger(pids[0])&&pids[0]>0); return pids[0];
}
// Tab changes and result disclosures publish an OOPIF height asynchronously.
// Settle layout before one trusted click; Start itself is never retried.
async function click(...args){await pause(180);await nativeClick(...args);await pause(180);}
for (const name of ['seed','candidate','invite-file','relay-state-dir','out']) assert(opt(name), 'Required --'+name+'=');
const out = resolve(opt('out')), seedPath = resolve(opt('seed')), candidate = resolve(opt('candidate'));
const relayStatePath=resolve(opt('relay-state-dir'));
const relayStateStat=await lstat(relayStatePath);
assert(relayStateStat.isDirectory() && !relayStateStat.isSymbolicLink(),
  'Relay state must be the explicit parent-owned directory, not a symlink');
const relayStateDir=await realpath(relayStatePath);
const relayCli=join(root,'native-agent/http-relay/cli.mjs');
const allowed = await realpath(join(root,'artifacts/scrapyjs'));
assert(out.startsWith(allowed+sep), 'Output must stay in artifacts/scrapyjs');
await mkdir(dirname(out), {recursive:true});
assert((await realpath(dirname(out))).startsWith(allowed+sep) || await realpath(dirname(out)) === allowed);
await mkdir(out); // EEXIST is intentional: never overwrite prior evidence.
const report = {status:'RUNNING',mode:'STATIC_DEVELOPMENT_NO_SERVE',production:'BLOCKED',
  productionHttp:'BLOCKED',realAi:'NOT_TESTED',physicalMacUi:'NOT_TESTED',
  startedAt:new Date().toISOString(),events:[],scenarios:Object.fromEntries([
    'headers-A','headers-B','headers-deleted','three-pages-bound','stop-stream',
    'timeout-stream','host-500','redirect-refused','early-close','service-down','revocation'].map(name=>[name,'NOT_TESTED']))};
const fixture = createHttpEchoServer();
let browser, view, frame, relayPage, blockRuleId, baselineRules, previousRunId = null, resultSelector;
const identities = {runId:new Set(),resultId:new Set(),clientRequestId:new Set(),requestId:new Set()};
const persist = () => writeFile(join(out,'report.json'), JSON.stringify(redacted({...report,server:fixture.snapshot()}),null,2)+'\n');
const record = async (label,value) => { report.events.push({label,value,at:new Date().toISOString()}); await persist(); };
const ui = () => frame.read(`(()=>{const g=id=>document.getElementById(id);return {
  error:g('app-error')?.textContent,configError:g('config-error')?.textContent,
  notice:g('app-notice')?.textContent,summary:g('run-summary')?.textContent,
  config:g('config-json')?.value,result:(()=>{const e=document.querySelector(${JSON.stringify(resultSelector || '#result')});return e?.value??e?.textContent})()};})()`);
async function snapshot() {
  const state = await ui();
  if (state.error) throw Error('Original App: '+state.error);
  try { return JSON.parse(state.result); } catch { return null; }
}
async function editConfig(config) {
  await click(frame,'#tab-json'); await fill(frame,'#config-json',JSON.stringify(config));
  assert.equal((await ui()).configError,'');
}
async function currentConfig() { return JSON.parse((await ui()).config); }
async function clearField(selector) {
  await click(frame,selector);
  await frame.read(`document.querySelector(${JSON.stringify(selector)}).select()`);
  for(const type of ['keyDown','keyUp']) await view.panel.call('Input.dispatchKeyEvent',{
    type,key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});
  assert.equal(await frame.read(`document.querySelector(${JSON.stringify(selector)}).value`),'');
}
async function start(label) {
  await browser.call('Target.activateTarget',{targetId:view.target.targetId});
  await click(frame,'#refresh-target');
  await until(() => frame.read('document.querySelector("#start")?.disabled===false'),'original Start ready');
  await pause(200);
  // Persist intent BEFORE the only click. A failure after this point never retries Start.
  await record(label+'-start-intent',{previousRunId,config:await currentConfig(),seenOffset:fixture.seen.length});
  const inputOffset=await frame.read('globalThis.__httpUiInputs.length');
  await click(frame,'#start');
  const inputs=await frame.read(`globalThis.__httpUiInputs.slice(${inputOffset})`);
  assert.equal(inputs.filter(e=>e.type==='click'&&e.id==='start'&&e.trusted).length,1,'Exactly one trusted original Start click');
  await record(label+'-original-start',{trusted:true,count:1});
}
function identity(result) {
  assert(result?.runId && result.resultId, 'Host runId/resultId required');
  for(const key of ['runId','resultId','clientRequestId']) {
    assert(result[key] && !identities[key].has(result[key]),'Unique Host '+key);
    identities[key].add(result[key]);
  }
  assert.notEqual(result.runId,previousRunId);
  assert.equal(result.retirementState,'released');
  assert.equal(result.retired,true);
  assert.equal(result.durableResult?.resultId,result.resultId);
  assert.equal(result.durableResult?.runId,result.runId);
  assert.equal(result.durableResult?.tag,'controller-result');
  assert.equal(result.durableResult?.state,result.state);
  assert.equal(result.durableResult?.revision?.sourceHash,report.package.delegatedTasks[0].contentHash);
}
async function terminal(label) {
  const result = await until(async () => {
    const r = await snapshot();
    return r?.runId && r.runId !== previousRunId && r.retirementState === 'released' ? r : null;
  },label+' Host result and retirement',60000);
  await record(label+'-terminal',result); identity(result); previousRunId = result.runId;
  const resources=await view.bootstrap.read(`(async()=>({rules:(await chrome.declarativeNetRequest.getSessionRules()).sort((a,b)=>a.id-b.id),tabs:(await chrome.tabs.query({})).filter(t=>t.url?.startsWith(chrome.runtime.getURL('network-request.html')+'#'))}))()`);
  assert.deepEqual(resources,{rules:baselineRules,tabs:[]},'No leaked/changed rules or Chrome HTTP helper tabs');await record(label+'-transport-released',resources);
  await click(frame,'#tab-results');
  // Visibility setup uses the same disclosure preparation as nativeClick, without
  // a brittle pointer click on a readonly/large JSON result textarea.
  await frame.read(`(()=>{const e=document.querySelector(${JSON.stringify(resultSelector)});
    for(let p=e?.parentElement;p;p=p.parentElement)if(p.matches('details'))p.open=true;
    e?.scrollIntoView({block:'center'});})()`);
  assert.equal(await frame.read(`(()=>{const e=document.querySelector(${JSON.stringify(resultSelector)});return !!e&&e.getClientRects().length>0})()`),true);
  return result;
}
function raw(row,name) {
  const values=[];
  for (let i=0;i<row.rawHeaders.length;i+=2) if(row.rawHeaders[i].toLowerCase()===name) values.push(row.rawHeaders[i+1]);
  return values;
}
function correlate(result,rows) {
  assert(rows.length,'Real App must reach independent echo server');
  const ids = new Set();
  for (const row of rows) {
    assert.equal(row.method,'GET'); assert.equal(row.runId,result.runId);
    assert.equal(raw(row,'x-opendesk-run-id').length,1);
    assert.equal(raw(row,'x-opendesk-request-id').length,1);
    assert(row.requestId && !ids.has(row.requestId) && !identities.requestId.has(row.requestId),'Unique internal transport request identity');
    ids.add(row.requestId); identities.requestId.add(row.requestId);
  }
}
function headers(rows,expected) {
  for (const row of rows) {
    for (const [name,value] of Object.entries(expected)) assert.deepEqual(raw(row,name),value===null?[]:[value]);
    if (expected['x-client-tag']===null) {
      assert(!['ScrapyJS-UA-A/1.0','ScrapyJS-UA-B/1.0'].includes(row.headers['user-agent']));
      assert.equal(row.headers['user-agent'],'OpenDesk-NativeHTTP/1.0','Deleted override must use Node default UA');
    }
  }
}
async function success(label,expected,count=1,lock=false) {
  const offset = fixture.seen.length; await start(label);
  if (lock) {
    await until(() => fixture.seen.length>offset,'first bound page observed');
    await click(frame,'#tab-rules');
    const ids=['http-user-agent','http-headers','http-fields','http-max-pages','execution-mode','load-http-example','target-url'];
    const locked = await frame.read(`Object.fromEntries(${JSON.stringify(ids)}.map(id=>[id,Boolean(document.getElementById(id)?.matches(':disabled'))]))`);
    await record(label+'-running-lock',locked);
    for (const id of ids) assert.equal(locked[id],true,'Running editor must be disabled: '+id);
    await click(frame,'#tab-json');
    assert.equal(await frame.read('document.querySelector("#config-json").matches(":disabled")'),true);
    await click(frame,'#tab-results');
  }
  const result = await terminal(label), rows = fixture.seen.slice(offset);
  assert.equal(result.state,'completed'); assert.equal(rows.length,count);
  assert.equal(result.durableResult.outcome?.ok,true);
  assert.deepEqual(result.result,decodeValue(result.durableResult.outcome.valueWire));
  correlate(result,rows); headers(rows,expected);
  await executorProof(label,result,rows);
  // The existing JSON extractor omits absent/null paths, including a deleted
  // optional header. Compare the real echo using that unchanged contract.
  assert.deepEqual(result.result.data,rows.map(row=>Object.fromEntries(
    Object.entries(JSON.parse(row.body).data[0]).filter(([_key,value])=>value!==null))));
  assert.equal(result.result.stats.pages,count);
  if(count===3) assert.deepEqual(rows.map(row=>Number(new URL(row.url,origin).searchParams.get('page'))),[1,2,3]);
  report.scenarios[label]='PASS'; await persist();
}
async function negative(label,config,stop=false,revoke=false) {
  await editConfig(config);
  const offset=fixture.seen.length; await start(label);
  if (stop || revoke) {
    await until(() => fixture.seen[offset]?.firstChunkAt,'stream first chunk');
    await until(async () => {
      const r=await snapshot(); return r?.runId && r.runId!==previousRunId && !r.retired && r;
    },'original active run before '+(revoke?'revocation':'Stop'));
    if(revoke) {
      await browser.call('Target.activateTarget',{targetId:relayPage.targetId});
      await click(relayPage,'#relay-revoke');
      await until(()=>relayPage.read('document.querySelector("#relay-status")?.dataset.state==="unpaired"'),
        'trusted relay revocation receipt');
      await record('trusted-revocation',{page:'native-agent/http-relay.html',paired:false});
      await browser.call('Target.activateTarget',{targetId:view.target.targetId});
    } else await click(frame,'#stop');
  }
  const result=await terminal(label),rows=fixture.seen.slice(offset);
  assert.equal(rows.length,1,'No second request after Stop/timeout/error/redirect'); correlate(result,rows);
  if(stop) assert(['stopped','cancelled'].includes(result.state),'Stop must have a real Host terminal state');
  else {
    assert.equal(result.state,'failed','HTTP/timeout failures must fail the real Host');
    assert.equal(result.durableResult.outcome?.ok,false);
    assert(result.durableResult.error || result.durableResult.outcome?.error,'Real Host error receipt required');
  }
  if(config.url.endsWith('/error')) assert.equal(rows[0].status,500);
  if(config.url.endsWith('/early-close')) {
    assert.equal(rows[0].status,200);
    await until(()=>rows[0].closed,'early-close socket retired');
    assert.equal(rows[0].prematureClose,true);
  }
  if(config.url.endsWith('/redirect')) assert.equal(rows[0].status,302);
  if(config.url.includes('/slow')) {
    await until(() => rows[0].closed,'server observes connection close',5000);
    assert.equal(rows[0].prematureClose,true); assert(!rows[0].lastChunkAt,'Connection must close before 10s suffix');
    // Wait past the scheduled suffix: prove no delayed second page is dispatched.
    await pause(Math.max(0,Date.parse(rows[0].firstChunkAt)+10500-Date.now()));
    assert.equal(fixture.seen.length,offset+1);
  }
  if(revoke) {
    assert.equal(result.result==null,true,'Revoked run must not deliver a body');
    const late=await snapshot();
    assert.equal(late.runId,result.runId);assert.equal(late.state,'failed');
    assert.equal(late.result==null,true,'Late stream body must not reach original App');
    await record(label+'-late-body-fenced',{runId:result.runId,socketClosed:rows[0].closed,
      prematureClose:rows[0].prematureClose,lastChunkAt:rows[0].lastChunkAt??null,targetRequests:fixture.seen.length-offset});
  }
  assert.equal(fixture.snapshot().redirectTargetHits,0);
  report.scenarios[label]='PASS'; await persist();
}

async function pairRelay(token,label='trusted-pairing') {
  if(token===undefined) {
    const invitePath=resolve(opt('invite-file')),stat=await lstat(invitePath);
    assert(stat.isFile()&&!stat.isSymbolicLink(),'Invitation must be a private regular file');
    assert.equal(stat.mode&0o077,0,'Invitation file must not be group/world readable');
    // Read at the last responsible moment: invitations expire quickly.
    const text=(await readFile(invitePath,'utf8')).trim();
    try { invitation=text.startsWith('{')?JSON.parse(text).invitation:text; }
    catch { throw Error('Invitation file must contain a token or valid JSON invitation'); }
  } else invitation=token;
  assert(typeof invitation==='string'&&/^[A-Za-z0-9_-]+$/.test(invitation),'Invalid invitation token');
  relayPage??=await browser.attach((await browser.call('Target.createTarget',{
    url:'chrome-extension://'+view.extensionId+'/native-agent/http-relay.html'})).targetId);
  await until(()=>relayPage.read('!!document.querySelector("#relay-invite")&&!!document.querySelector("#relay-pair")'),'real trusted relay pairing page');
  await browser.call('Target.activateTarget',{targetId:relayPage.targetId});
  await fill(relayPage,'#relay-invite',invitation);
  await click(relayPage,'#relay-pair'); // One attempt; never replay an unknown pairing.
  await until(()=>relayPage.read(`(()=>{const e=document.querySelector('#relay-status');
    if(!e)return false;if(e.dataset.state)return e.dataset.state==='paired';try{const s=JSON.parse(e.textContent);return s.paired===true||s.status?.paired===true;}catch{return /已配对|paired|connected/i.test(e.textContent)&&!/unpaired|not paired|未配对|未连接/i.test(e.textContent);}})()`),'trusted relay paired receipt');
  // No invitation value, credential, DOM dump or pairing secret enters the report.
  await relayPage.read('document.querySelector("#relay-invite").value=""');
  await record(label,{page:'native-agent/http-relay.html',paired:true,servicePid:report.service.pid});
}
async function relayCommand(command) {
  assert(['status','invite','stop'].includes(command));
  const {stdout}=await execFileAsync(process.execPath,[relayCli,command,'--state-dir',relayStateDir],
    {cwd:root,timeout:20000,maxBuffer:16384});
  return JSON.parse(stdout.trim());
}
async function serviceDown(base) {
  // A revoked/missing key would fail without contacting Node. Restore pairing
  // through the trusted UI first so this scenario exercises real unavailability.
  const status=await relayCommand('status');
  assert.equal(status.pid,report.service.pid,'State-dir authenticated status must identify the original relay PID');
  assert.equal(await listenerPid(),report.service.pid,'Original relay must still own 43122');
  const fresh=await relayCommand('invite');
  assert(typeof fresh.invitation==='string','Authenticated CLI must return a fresh invitation');
  await pairRelay(fresh.invitation,'trusted-repair-before-service-down');
  const beforeStop=await relayCommand('status');
  assert.equal(beforeStop.pid,report.service.pid,'Do not stop a replacement relay');
  assert.equal(beforeStop.paired,true);
  assert.equal(await listenerPid(),report.service.pid,'Do not stop a replacement listener');
  await record('relay-authenticated-stop-intent',{stateDir:relayStateDir,pid:beforeStop.pid});
  const stopped=await relayCommand('stop');
  assert.equal(stopped.status,'stopping','CLI must acknowledge authenticated stop');
  await until(async()=>await listenerPid(true)===null,'original relay listener closed',10000);
  await record('relay-authenticated-stop',{pid:beforeStop.pid,receipt:stopped,listenerClosed:true});
  await editConfig({...base,url:origin+'/http-echo?pages=3&page=1'});
  const offset=fixture.seen.length;
  await start('service-down');
  const result=await terminal('service-down');
  assert.equal(result.state,'failed');assert.equal(result.durableResult.outcome?.ok,false);
  assert(result.durableResult.error || result.durableResult.outcome?.error,'Real Host service-down error receipt required');
  assert.match(JSON.stringify(result.durableResult),/E_NATIVE_UNAVAILABLE/,'Failure must identify offline Node, not missing pairing');
  assert.equal(result.result==null,true,'Offline relay must not fabricate a result');
  await pause(2000);
  const late=await snapshot();
  assert.equal(late.runId,result.runId);assert.equal(late.state,'failed');assert.equal(late.result==null,true);
  assert.equal(fixture.seen.length,offset,'Offline Node must produce zero target requests and no browser fallback');
  assert.equal(await listenerPid(true),null,'Driver must never restart the parent relay');
  await record('service-down-zero-target',{runId:result.runId,targetRequests:0,listenerClosed:true});
  report.scenarios['service-down']='PASS';await persist();
}
async function proveChromeBlocked(label) {
  const offset=fixture.seen.length, probes=[];
  const worker=(await browser.call('Target.getTargets')).targetInfos.find(t=>t.type==='service_worker'&&t.url.startsWith('chrome-extension://'+view.extensionId+'/'));
  assert(worker,'Real extension service worker required for egress proof');
  const workerSession=await browser.attach(worker.targetId);
  for(const [name,session]of [['extension',view.bootstrap],['target-page',view.target],['service-worker',workerSession]]){
    await session.call('Network.enable');
    const eventOffset=browser.events.length;
    const probe=await session.read(`(async()=>{try{const r=await fetch(${JSON.stringify(origin+'/http-echo?chrome-block-probe=1')},{cache:'no-store'});return {blocked:false,status:r.status};}catch{return {blocked:true};}})()`);
    assert.equal(probe.blocked,true,name+' Chrome fetch must fail while Node transport succeeds');
    const failure=await until(()=>{
      const events=browser.events.slice(eventOffset).filter(e=>e.sessionId===session.sessionId);
      const ids=new Set(events.filter(e=>e.method==='Network.requestWillBeSent'&&e.params.request.url===origin+'/http-echo?chrome-block-probe=1').map(e=>e.params.requestId));
      return events.find(e=>e.method==='Network.loadingFailed'&&ids.has(e.params.requestId)&&/ERR_BLOCKED_BY_CLIENT/.test(e.params.errorText));
    },name+' DNR blocked-by-client network event');
    probes.push({name,...probe,networkFailure:failure.params});
  }
  assert.equal(fixture.seen.length,offset,'Blocked Chrome probes must never reach echo');
  const rules=await view.bootstrap.read('chrome.declarativeNetRequest.getSessionRules()');
  assert(rules.some(rule=>rule.id===blockRuleId),'Owned egress rule must remain active');
  await record('chrome-egress-block-'+label,{probes,rule:rules.find(r=>r.id===blockRuleId)});
}
async function blockChromeEgress() {
  // openNativePanel already navigated the target origin before any blocking.
  const before=await view.bootstrap.read('chrome.declarativeNetRequest.getSessionRules()');
  blockRuleId=2000000000;
  while(before.some(rule=>rule.id===blockRuleId))blockRuleId--;
  // No initiator restriction: this covers the extension SW, OOPIF and any new
  // Chrome target using XHR/fetch. RPC on 43122 remains outside the exact origin.
  const rule={id:blockRuleId,priority:1000000,action:{type:'block'},condition:{
    regexFilter:'^http://127[.]0[.]0[.]1:43121/',resourceTypes:['xmlhttprequest']}};
  await view.bootstrap.read(`chrome.declarativeNetRequest.updateSessionRules({addRules:[${JSON.stringify(rule)}]})`);
  baselineRules=await view.bootstrap.read('(async()=>(await chrome.declarativeNetRequest.getSessionRules()).sort((a,b)=>a.id-b.id))()');
  await proveChromeBlocked('before-app-start');
}
async function relaySourceIdentity() {
  const hash=createHash('sha256'),files={};
  for(const name of ['service.mjs','protocol.mjs']) {
    const bytes=await readFile(join(root,'native-agent/http-relay',name));
    files[name]={bytes:bytes.length,sha256:sha(bytes)};
    hash.update(name+'\0').update(bytes);
  }
  return {algorithm:'sha256',framing:'service.mjs\0<service bytes>protocol.mjs\0<protocol bytes>',
    files,combinedSha256:hash.digest('hex')};
}

async function executorProof(label,result,rows) {
  assert.equal(result.result.engine?.transport,'native-http','Original Task must use Node transport');
  const requests=result.result.audit?.requests;
  assert.equal(requests?.length,rows.length,'One executor receipt per actual target request');
  for(let i=0;i<rows.length;i++){
    const receipt=requests[i],row=rows[i],executor=receipt.executor;
    assert.equal(receipt.runId,result.runId,'Transport receipt must bind Host run');
    assert.equal(receipt.requestId,row.requestId,'Transport receipt must bind server request');
    assert.equal(receipt.url,new URL(row.url,origin).href);
    assert.equal(executor?.pid,report.service.pid,'Executor must be the parent relay listener PID');
    assert.match(executor.nodeVersion,/^v\d+\./);
    assert.equal(executor.sourceHash,report.relaySource.combinedSha256,'Executor must hash its actual service/protocol implementation');
    assert.equal(executor.localPort,row.peer.port,'Executor socket must be the server-observed peer');
    assert.equal(executor.localAddress,row.peer.address);
    assert.equal(executor.remotePort,row.peer.localPort);
    assert.equal(executor.remotePort,43121);
    assert.equal(executor.remoteAddress,'127.0.0.1');
  }
  await record(label+'-node-executor-proof',{servicePid:report.service.pid,runId:result.runId,resultId:result.resultId,
    clientRequestId:result.clientRequestId,taskSourceHash:result.durableResult.revision.sourceHash,executorSourceHash:report.relaySource.combinedSha256,requests});
}

try {
  await persist();
  const seedBytes=await readFile(seedPath),seed=JSON.parse(seedBytes);
  assert.equal(seed.ownedBrowserReleased,true,'Seed owner must already have closed its browser');
  assert.equal(seed.taskInstall,'PASS_UI_RECEIPT','native-core must install the real fixed Task first');
  const owned=seed.events?.find(e=>e.label==='owned-browser')?.value;
  assert(owned?.profile && owned?.binary && owned?.snapshot,'native-core owned browser evidence required');
  const profile=await realpath(owned.profile),extension=await realpath(owned.loadedExtension||owned.snapshot);
  assert(profile.startsWith(allowed+sep) && extension.startsWith(allowed+sep));
  assert(basename(dirname(profile)).startsWith('cft-') && basename(profile)==='profile','Only task-owned native-session seed');
  assert.equal(extension,await realpath(owned.snapshot),'Retain original seed snapshot path and extension ID');
  assert(!out.startsWith(dirname(profile)+sep),'Output must be separate from seed resources');
  report.seed={path:seedPath,sha256:sha(seedBytes),taskInstall:seed.taskInstall,
    taskPackage:seed.events.filter(e=>['task-package-input','task-installed'].includes(e.label))};
  const bytes=await readFile(candidate),pkg=JSON.parse(bytes);
  assert.equal(pkg.id,'scrapyjs'); assert.equal(pkg.delegatedTasks?.length,1);
  report.package={path:candidate,id:pkg.id,version:pkg.version,sha256:sha(bytes),delegatedTasks:pkg.delegatedTasks};
  report.source={};
  for(const dir of ['src','controller','adapters']) report.source[dir]=await treeIdentity(join(root,'examples/sidebar-tools/scrapyjs',dir));
  // Binding failure (including EADDRINUSE) aborts; never reuse someone else's server.
  await fixture.listen(); await record('exclusive-echo-server',{origin});
  report.service={pid:await listenerPid(),port:43122};
  report.relaySource=await relaySourceIdentity();
  browser=await launchOwned({root,out,binary:owned.binary,extension,seedProfile:profile,headless:false});
  report.browser=browser.metadata; report.chrome=await browser.call('Browser.getVersion');
  view=await openNativePanel(browser,origin+'/'); report.extensionId=view.extensionId;
  await record('real-sidepanel',{context:view.context,extensionId:view.extensionId});
  await pairRelay();
  await blockChromeEgress();
  await browser.call('Target.activateTarget',{targetId:view.target.targetId});
  await click(view.panel,'#tab-tools');
  await click(view.panel,'#extension-center-more'); await click(view.panel,'#extension-center-import');
  await fileInput(view.panel,'#sidebar-tool-file',candidate);
  const review=await until(() => view.panel.read('(()=>{const e=document.querySelector("#sidebar-tool-preview");return e&&!e.hidden&&!document.querySelector("#sidebar-tool-install").disabled?e.innerText:null})()'),'original candidate review');
  await record('install-review',review); assert.equal(sha(await readFile(candidate)),sha(bytes));
  await click(view.panel,'#sidebar-tool-install');
  await click(view.panel,'button[data-extension-key="app:scrapyjs"][data-extension-action="main"]');
  const target=await until(async () => {
    const ts=(await browser.call('Target.getTargets')).targetInfos.filter(t=>t.type==='iframe'&&t.url.startsWith('chrome-extension://'+view.extensionId+'/')&&t.url.includes('/sidebar-tools/sandbox.html'));
    return ts.length===1?ts[0]:null;
  },'installed original App iframe');
  frame=await browser.attach(target.targetId); frame.inputHost=view.panel; frame.inputOwnerSelector='iframe.sidebar-tool-iframe';
  await until(() => frame.read('document.querySelector("#app-notice")?.textContent.includes("已读取保存配置")'),'App storage readback');
  assert.equal(await frame.read('origin'),'null');
  resultSelector=await frame.read('document.querySelector("#result-json")?"#result-json":document.querySelector("#result")?"#result":null');
  assert(resultSelector,'Original UI JSON snapshot required'); report.resultSelector=resultSelector;
  await record('installation-open',{packageSha256:sha(bytes),sandboxOrigin:'null',resultSelector,ui:await ui()});
  await frame.read(`(()=>{globalThis.__httpUiInputs=[];for(const type of ['click','keydown','input'])document.addEventListener(type,event=>globalThis.__httpUiInputs.push({type,id:event.target.id,key:event.key,trusted:event.isTrusted}),true);})()`);
  await click(frame,'#tab-rules');
  await pause(200); // Let the real tab commit and OOPIF hit-test publication settle.
  await click(frame,'#load-http-example');
  if(await frame.read('!document.querySelector("#profile-confirm").hidden')) await click(frame,'#profile-confirm-accept');
  await until(() => frame.read('!!document.querySelector("#http-user-agent")'),'visible HTTP form');
  const fields={userAgent:'userAgent',accept:'accept',clientTag:'clientTag',requestId:'requestId',runId:'runId'};
  const base={executionMode:'http-local',url:origin+'/http-echo?pages=3&page=1&delay=5000',maxPages:3,timeoutMs:15000,
    itemConfig:fields,http:{userAgent:'ScrapyJS-UA-A/1.0',headers:{Accept:'application/json','X-Client-Tag':'A'}}};
  if(!redirectOnly){
  await fill(frame,'#http-fields',JSON.stringify(fields));
  await fill(frame,'#http-user-agent','ScrapyJS-UA-A/1.0');
  await fill(frame,'#http-headers',JSON.stringify({Accept:'application/json','X-Client-Tag':'A'}));
  await success('headers-A',{'user-agent':'ScrapyJS-UA-A/1.0',accept:'application/json','x-client-tag':'A'});
  await click(frame,'#tab-rules');
  await fill(frame,'#http-user-agent','ScrapyJS-UA-B/1.0');
  await fill(frame,'#http-headers',JSON.stringify({Accept:'application/json; profile=B','X-Client-Tag':'B'}));
  await success('headers-B',{'user-agent':'ScrapyJS-UA-B/1.0',accept:'application/json; profile=B','x-client-tag':'B'});
  await click(frame,'#tab-rules');
  await clearField('#http-user-agent'); await fill(frame,'#http-headers','{}');
  await success('headers-deleted',{'user-agent':'OpenDesk-NativeHTTP/1.0',accept:null,'x-client-tag':null});
  await editConfig(base);
  await success('three-pages-bound',{'user-agent':'ScrapyJS-UA-A/1.0',accept:'application/json','x-client-tag':'A'},3,true);
  await negative('stop-stream',{...base,url:origin+'/slow?pages=3&page=1',timeoutMs:30000},true);
  await negative('timeout-stream',{...base,url:origin+'/slow?pages=3&page=1',timeoutMs:1500});
  await negative('host-500',{...base,url:origin+'/error'});
  }
  await negative('redirect-refused',{...base,url:origin+'/redirect'});
  if(!redirectOnly)await negative('early-close',{...base,url:origin+'/early-close'});
  await proveChromeBlocked('after-app-runs');
  assert.equal(await listenerPid(),report.service.pid,'Parent relay listener changed');
  assert.deepEqual(await relaySourceIdentity(),report.relaySource,'Relay implementation changed during proof');
  assert.equal(sha(await readFile(candidate)),report.package.sha256,'Candidate changed during test');
  report.sourceAfter={};
  for(const dir of Object.keys(report.source)) {
    report.sourceAfter[dir]=await treeIdentity(join(root,'examples/sidebar-tools/scrapyjs',dir));
    assert.equal(report.sourceAfter[dir].sha256,report.source[dir].sha256,'Source drift: '+dir);
  }
  if(!redirectOnly) {
    await negative('revocation',{...base,url:origin+'/slow?pages=3&page=1'},false,true);
    await serviceDown(base);
  }
  report.status=redirectOnly?'PASS_REAL_APP_NODE_REDIRECT_LOCAL':'PASS_REAL_APP_NODE_HTTP_LOCAL';
  report.notes={serviceDown:report.scenarios['service-down'],revocation:report.scenarios.revocation};
} catch(error) {
  report.status='FAIL'; report.error={message:error.message,stack:error.stack}; process.exitCode=1;
  if(frame) report.lastUI=await ui().catch(error=>({readError:error.message}));
  if(frame) report.uiInputs=await frame.read('globalThis.__httpUiInputs').catch(()=>null);
  if(browser) report.runtimeErrors=browser.events.filter(e=>e.method==='Runtime.exceptionThrown');
  if(view) report.hostText=await view.panel.read('document.body.innerText').catch(()=>null);
} finally {
  // Capture actual partial output before cleanup; never retry an unknown Start.
  await persist().catch(error=>{ console.error(error); process.exitCode=1; });
  if(view) try {
    const shot=await view.panel.call('Page.captureScreenshot',{format:'png'});
    await writeFile(join(out,'panel.png'),Buffer.from(shot.data,'base64'));
  } catch(error) { report.screenshotError=error.message; }
  const cleanupErrors=[];
  if(view && blockRuleId)try {
    await view.bootstrap.read(`chrome.declarativeNetRequest.updateSessionRules({removeRuleIds:[${blockRuleId}]})`);
    const rules=await view.bootstrap.read('chrome.declarativeNetRequest.getSessionRules()');
    assert(!rules.some(r=>r.id===blockRuleId));
    report.chromeEgressBlockReleased=true;
  }catch(error){cleanupErrors.push('owned DNR rule: '+error.message);}
  if(browser) try { await browser.close(); report.ownedBrowserReleased=true; }
  catch(error) { cleanupErrors.push('browser: '+error.message); }
  try { await fixture.close(); report.ownedServerReleased=true; }
  catch(error) { cleanupErrors.push('server: '+error.message); }
  if(cleanupErrors.length) { report.functionalStatus=report.status; report.status='FAIL_CLEANUP'; report.cleanupErrors=cleanupErrors; process.exitCode=1; }
  report.finishedAt=new Date().toISOString(); await persist();
  console.log(JSON.stringify(redacted({status:report.status,out,error:report.error?.message})));
}
