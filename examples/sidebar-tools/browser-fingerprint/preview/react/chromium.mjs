#!/usr/bin/env node
// R2.1 source-identical React Chromium test; preview SDK only, NOT installed Chrome.
// Focus on new preset CAS + no-fake-apply behavior. Old R1.8 evidence stays in Git history.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';

const project=resolve('examples/sidebar-tools/browser-fingerprint');
const out=resolve(process.argv[2]||'artifacts/app-ci/browser-fingerprint/chrome');
await mkdir(out,{recursive:true});
const html=await readFile(join(project,'preview/react/index.html'));
const build=JSON.parse(await readFile(join(project,'dist/build-ready.json'),'utf8'));
assert.equal(build.format,'opendesk.ui-build-ready.v1');
assert(html.toString('utf8').includes('data:text/javascript;base64,'),
  'preview must reuse compiled React IIFE');
for(const source of ['src/App.jsx','src/ReadOnlyDiagnostics.jsx','src/env-config.js',
  'src/presets.js','src/run-session.js','src/model.js','src/history.js'])
  assert(build.sources[source]?.sha256,'new source omitted from build receipt: '+source);
const server=createServer((req,res)=>{
  if(req.url!=='/'&&req.url!=='/index.html'){
    res.writeHead(404);res.end();return;
  }
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
  res.end(html);
});
await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok);});
const url='http://127.0.0.1:'+server.address().port+'/';
const profile=await mkdtemp(join(tmpdir(),'fp-r21-chromium-'));
const chrome=spawn(process.env.CHROME_BIN||'chromium',[
  '--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
  '--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'
],{stdio:'ignore'});
const pause=ms=>new Promise(ok=>setTimeout(ok,ms));
const pending=new Map(),exceptions=[];
let ws,id=0;
const evidence={kind:'SOURCE_BOUND_REACT_R21_CHROMIUM_PREVIEW_FIXTURE_ONLY',
  sourceCommit:process.env.GITHUB_SHA||null,installed:false,native:false,
  targetPageEnvironmentModified:false,targetPageIndependentReadback:false,
  htmlSha256:createHash('sha256').update(html).digest('hex'),buildId:build.buildId,
  checks:[],screenshots:[],exceptions};
function call(method,params={}){
  return new Promise((ok,fail)=>{
    const rid=++id,timeout=setTimeout(()=>{
      pending.delete(rid);fail(Error('CDP timeout: '+method));
    },12000);
    pending.set(rid,{ok:v=>{clearTimeout(timeout);ok(v);},
      fail:e=>{clearTimeout(timeout);fail(e);}});
    ws.send(JSON.stringify({id:rid,method,params}));
  });
}
async function evaluate(expression){
  const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);
  return r.result?.value;
}
async function until(expr,label){
  for(let i=0;i<100;i++){
    if(await evaluate(expr))return;
    await pause(110);
  }
  throw Error('Timed out: '+label);
}
async function click(label){
  const ok=await evaluate('('+function(text){
    const buttons=[...document.querySelectorAll('button')];
    const button=buttons.find(el=>!el.disabled&&(
      el.getAttribute('aria-label')===text||el.title===text||el.textContent.trim()===text));
    if(!button)return false;
    button.click();return true;
  }.toString()+')('+JSON.stringify(label)+')');
  assert(ok,'Missing/enabled button: '+label);
}
async function select(selector,value){
  const ok=await evaluate('('+function(s,v){
    const el=document.querySelector(s);
    if(!el||el.disabled)return false;
    el.value=v;el.dispatchEvent(new Event('change',{bubbles:true}));
    return true;
  }.toString()+')('+JSON.stringify(selector)+','+JSON.stringify(value)+')');
  assert(ok,'Cannot select '+selector);
}
async function fill(selector,text){
  const ok=await evaluate('('+function(s,v){
    const el=document.querySelector(s);
    if(!el)return false;
    const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;
    setter.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));return true;
  }.toString()+')('+JSON.stringify(selector)+','+JSON.stringify(text)+')');
  assert(ok,'Cannot fill '+selector);
}
async function connect(){
  let port;
  for(let i=0;i<100;i++){
    if(chrome.exitCode!==null)throw Error('Chromium terminated before CDP');
    try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);}catch{}
    if(port)break;
    await pause(100);
  }
  assert(port,'Chrome CDP port unavailable');
  const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  const page=targets.find(x=>x.type==='page');
  assert(page?.webSocketDebuggerUrl);
  ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok,fail)=>{
    ws.addEventListener('open',ok,{once:true});
    ws.addEventListener('error',fail,{once:true});
  });
  ws.addEventListener('message',event=>{
    const message=JSON.parse(event.data);
    if(message.method==='Runtime.exceptionThrown')
      exceptions.push(message.params?.exceptionDetails?.exception?.description||'Runtime exception');
    const waiter=pending.get(message.id);
    if(!waiter)return;
    pending.delete(message.id);
    message.error?waiter.fail(Error(message.error.message)):waiter.ok(message.result);
  });
  await call('Page.enable');await call('Runtime.enable');
}
try{
  await connect();
  await call('Page.navigate',{url});
  await until('document.querySelectorAll(".fp-app").length===1','React rendered');
  assert.deepEqual(await evaluate('[...document.querySelectorAll(".fp-tabs button")].map(x=>x.textContent.trim())'),
    ['环境设置','运行记录']);
  assert.equal(await evaluate('document.querySelector(".fp-tabs button.active")?.textContent'),
    '环境设置');
  assert.equal(await evaluate('document.querySelector("select[aria-label=\'选择环境预设\']")?.value'),'us');
  await until('document.querySelector(".fp-context")?.textContent.includes("qa.example.test")',
    'trusted-context fixture read');
  assert.deepEqual(await evaluate('[...document.querySelectorAll(".fp-bottom-actions button")].map(x=>x.textContent.trim())'),
    ['应用配置','停止 / 恢复']);
  evidence.checks.push('TWO_TABS_CONFIG_DEFAULT_TWO_CORE_ACTIONS_AND_VALID_CONTEXT');

  // Changing a builtin creates a draft. A preset switch must not silently lose it.
  await select('#fp-param-tz','Europe/Berlin');
  await until('document.querySelector(".fp-tag-warn")?.textContent.includes("未保存")','dirty draft');
  await select('select[aria-label="选择环境预设"]','jp');
  await until('document.querySelector("[role=dialog]")?.textContent.includes("尚未保存")','draft guard');
  await click('取消');
  assert.equal(await evaluate('document.querySelector("#fp-param-tz")?.value'),'Europe/Berlin');
  await select('select[aria-label="选择环境预设"]','jp');
  await click('丢弃修改并继续');
  await until('document.querySelector("#fp-param-tz")?.value==="Asia/Tokyo"','draft discarded explicitly');
  evidence.checks.push('DRAFT_GUARD_PRESERVES_EDIT_UNTIL_EXPLICIT_DISCARD');

  await click('新建自定义预设');
  await until('document.querySelector("select[aria-label=\'选择环境预设\']")?.value==="custom"','new custom draft');
  await select('#fp-param-lang','de-DE');
  await click('保存当前预设');
  await fill('#fp-save-name','东京 · 德语 QA');
  await click('保存');
  await until('JSON.parse(localStorage.getItem("opendesk.fingerprint.r21.preview-only.v1")||"{}")["fingerprint.r21.presets.v1"]?.items?.length===1',
    'custom preset persisted');
  assert.equal(await evaluate('JSON.parse(localStorage.getItem("opendesk.fingerprint.r21.preview-only.v1"))["fingerprint.r21.presets.v1"].items[0].name'),'东京 · 德语 QA');
  assert.equal(await evaluate('document.querySelector(".fp-tag-warn")?.textContent.includes("未保存")||false'),false);
  evidence.checks.push('CUSTOM_PRESET_REAL_APP_CAS_PREVIEW_STORAGE_READBACK');

  // Real native interface was NOT approved; the same production App must fail closed.
  await click('应用配置');
  await until('document.querySelector(".fp-status-title")?.textContent.includes("环境修改未开放")',
    'blocked native apply');
  assert.equal(await evaluate('document.querySelector(".fp-status-note")?.textContent.includes("配置保存不代表环境已生效")'),true);
  assert.equal(await evaluate('document.querySelectorAll(".fp-bottom-actions button")[1]?.disabled'),true);
  // Saving a custom preset already records a separate history row. The blocked
  // apply must be present, but the history must not be constrained to one row.
  await until('JSON.parse(localStorage.getItem("opendesk.fingerprint.r21.preview-only.v1")||"{}")["fingerprint.r21.runs.v1"]?.items?.some(row=>row.kind==="apply"&&row.status==="blocked")',
    'blocked-operation event durably recorded');
  assert.equal(await evaluate('JSON.parse(localStorage.getItem("opendesk.fingerprint.r21.preview-only.v1"))["fingerprint.r21.runs.v1"].items.filter(row=>row.kind==="apply"&&row.status==="blocked").length'),1);
  evidence.checks.push('NATIVE_APPLY_BLOCKED_NO_FALSE_SUCCESS_NO_RETRY');

  assert.equal(await evaluate('document.querySelectorAll(".fp-check").length'),0);
  const reportDetails='[...document.querySelectorAll("details")].find(x=>x.querySelector("summary")?.textContent.trim()==="核验详情与报告")';
  assert.equal(await evaluate('('+reportDetails+')?.open'),false);
  // Open the disclosure through its summary, as a user would; no fake rows exist.
  assert.equal(await evaluate('(()=>{const details='+reportDetails+';if(!details)return false;details.querySelector("summary").click();return true;})()'),true);
  await until('('+reportDetails+')?.open===true','verification disclosure opened');
  assert.equal(await evaluate('('+reportDetails+')?.textContent.includes("尚无可信读回")'),true);
  assert.equal(await evaluate('document.querySelectorAll(".fp-check").length'),0);
  assert.deepEqual(await evaluate('[...document.querySelectorAll(".fp-report-actions button")].map(x=>({label:x.textContent.trim(),disabled:x.disabled}))'),
    [{label:'复制报告',disabled:true},{label:'导出 JSON',disabled:true}]);
  evidence.checks.push('NO_FAKE_PAGE_JS_OR_NETWORK_INDEPENDENT_READBACK');

  await click('运行记录');
  await until('document.querySelectorAll(".fp-log").length>=1','run record');
  assert.equal(await evaluate('document.querySelector(".fp-log")?.textContent.includes("未对网页执行操作")'),true);
  assert.equal(await evaluate('document.querySelector(".fp-legacy")?.textContent.includes("旧版只读检测")'),true);
  evidence.checks.push('PERSISTED_OPERATIONS_AND_LEGACY_DIAGNOSTICS_RETAINED');

  await call('Page.reload',{ignoreCache:true});
  await until('document.querySelectorAll(".fp-app").length===1','React reload');
  await until('document.querySelectorAll("select[aria-label=\'选择环境预设\'] option").length>=6',
    'saved preset options after reload');
  await click('运行记录');
  await until('document.querySelectorAll(".fp-log").length>=1','run restart-readback');
  evidence.checks.push('RESTART_READS_STORED_PRESETS_AND_RUN_HISTORY');
  await click('环境设置');

  // Explicit fault injection tests unknown-outcome UI only. The normal preview
  // fixture above remains fail-closed; no native success/readback is fabricated.
  await evaluate('('+function(){
    const bridge=globalThis.OpenDeskTool,request=bridge.request.bind(bridge);
    globalThis.__fpPreviewFaultCalls=[];
    bridge.request=async(operation,args={})=>{
      if(operation==='browser.capabilities.getStatus'&&args.operation==='browser.fingerprint.apply')
        return {operation:args.operation,implementation:'implemented',
          authorization:{tool:'granted'},callableNow:true};
      if(operation.startsWith('browser.fingerprint.')){
        globalThis.__fpPreviewFaultCalls.push(operation);
        throw Object.assign(Error('Injected preview timeout; no native operation executed'),{code:'E_TIMEOUT'});
      }
      return request(operation,args);
    };
  }.toString()+')()');
  await click('应用配置');
  await until('document.querySelector(".fp-status-title")?.textContent.includes("执行结果未知")',
    'unknown apply is not success');
  await until('document.querySelectorAll(".fp-bottom-actions button")[1]?.disabled===false',
    'unknown apply finished');
  assert.equal(await evaluate('document.querySelectorAll(".fp-bottom-actions button")[0]?.disabled'),true);
  assert.equal(await evaluate('document.querySelectorAll(".fp-check").length'),0);
  await click('停止 / 恢复');
  await until('document.querySelector(".fp-status-title")?.textContent.includes("恢复结果未知")',
    'unknown restore never claims recovery');
  await until('JSON.parse(localStorage.getItem("opendesk.fingerprint.r21.preview-only.v1")||"{}")["fingerprint.r21.runs.v1"]?.items?.some(row=>row.kind==="restore"&&row.status==="restore_unknown")',
    'unknown restoration recorded');
  assert.deepEqual(await evaluate('globalThis.__fpPreviewFaultCalls'),['browser.fingerprint.apply']);
  evidence.checks.push('INJECTED_TIMEOUT_UNKNOWN_NO_APPLY_RETRY_OR_RESTORE_REPLAY');

  // Capture the normal default window, without a width/zoom emulation test.
  const viewport=await evaluate('({width:innerWidth,height:innerHeight})');
  const capture=await call('Page.captureScreenshot',{format:'png'});
  const bytes=Buffer.from(capture.data,'base64');
  await writeFile(join(out,'fingerprint-r21-default.png'),bytes);
  evidence.screenshots.push({...viewport,sha256:createHash('sha256').update(bytes).digest('hex')});
  assert.deepEqual(exceptions,[],'Unexpected Chromium JavaScript exceptions');
  evidence.status='PASS_R21_PREVIEW_FIXTURE_ONLY';
  console.log(JSON.stringify(evidence,null,2));
}catch(error){
  evidence.status='FAIL';evidence.error=String(error.stack||error);
  console.error(evidence.error);process.exitCode=1;
}finally{
  await writeFile(join(out,'fingerprint-r21-chromium-evidence.json'),
    JSON.stringify(evidence,null,2)+'\n');
  try{ws?.close();}catch{}
  chrome.kill('SIGKILL');
  await new Promise(resolve=>server.close(resolve));
  await rm(profile,{recursive:true,force:true});
}
