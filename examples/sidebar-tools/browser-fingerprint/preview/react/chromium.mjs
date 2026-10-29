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
  assert.equal(await evaluate('document.querySelectorAll(".fp-tabs button").length'),3);
  assert.equal(await evaluate('document.querySelector(".fp-tabs button.active")?.textContent'),
    '环境设置');
  assert.equal(await evaluate('document.querySelector("select[aria-label=\'选择环境预设\']")?.value'),'us');
  await until('document.querySelector(".fp-context")?.textContent.includes("qa.example.test")',
    'trusted-context fixture read');
  evidence.checks.push('R20_THREE_PAGES_CONFIG_DEFAULT_AND_VALID_CONTEXT');

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
  assert.equal(await evaluate('document.querySelectorAll(".fp-bottom-actions button")[2]?.disabled'),true);
  // Saving a custom preset already records a separate history row. The blocked
  // apply must be present, but the history must not be constrained to one row.
  await until('JSON.parse(localStorage.getItem("opendesk.fingerprint.r21.preview-only.v1")||"{}")["fingerprint.r21.runs.v1"]?.items?.some(row=>row.kind==="apply"&&row.status==="blocked")',
    'blocked-operation event durably recorded');
  assert.equal(await evaluate('JSON.parse(localStorage.getItem("opendesk.fingerprint.r21.preview-only.v1"))["fingerprint.r21.runs.v1"].items.filter(row=>row.kind==="apply"&&row.status==="blocked").length'),1);
  evidence.checks.push('NATIVE_APPLY_BLOCKED_NO_FALSE_SUCCESS_NO_RETRY');

  await click('网页验证');
  await until('document.querySelectorAll(".fp-check").length===8','verification rows');
  assert.equal(await evaluate('[...document.querySelectorAll(".fp-check")].every(x=>x.textContent.includes("无法验证"))'),true);
  assert.equal(await evaluate('[...document.querySelectorAll(".fp-report-actions button")].every(x=>x.disabled)'),true);
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

  // Supplemental one-width layout evidence, not a substitute for Native testing.
  await call('Emulation.setDeviceMetricsOverride',
    {width:380,height:850,deviceScaleFactor:1,mobile:false});
  const m=await evaluate('('+function(){
    return {documentWidth:document.documentElement.clientWidth,
      scrollWidth:document.documentElement.scrollWidth};
  }.toString()+')()');
  assert(m.scrollWidth<=m.documentWidth+1,'main UI horizontal overflow: '+JSON.stringify(m));
  const capture=await call('Page.captureScreenshot',{format:'png'});
  const bytes=Buffer.from(capture.data,'base64');
  await writeFile(join(out,'fingerprint-r21-380.png'),bytes);
  evidence.screenshots.push({width:380,sha256:createHash('sha256').update(bytes).digest('hex')});
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
