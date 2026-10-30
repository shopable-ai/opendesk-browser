#!/usr/bin/env node
// R3.2 real React interactions via native Node CDP. All SDK results are FIXTURE_ONLY.
// No installed extension, native Host, target-page mutation or Mac acceptance is claimed.
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
const profile=await mkdtemp(join(tmpdir(),'fp-r32-chromium-'));
const chrome=spawn(process.env.CHROME_BIN||'chromium',[
  '--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
  '--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'
],{stdio:'ignore'});
const pause=ms=>new Promise(ok=>setTimeout(ok,ms));
const pending=new Map(),exceptions=[];
let ws,id=0;
const evidence={kind:'SOURCE_BOUND_REACT_R32_CHROMIUM_PREVIEW_FIXTURE_ONLY',
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
const q=JSON.stringify;
async function press(key,modifiers=0){
  const codes={Tab:9,Enter:13,Escape:27,ArrowRight:39,Home:36,End:35};
  await call('Input.dispatchKeyEvent',{type:'keyDown',key,code:key,
    windowsVirtualKeyCode:codes[key],modifiers,...(key==='Enter'?{text:'\r'}:{})});
  await call('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,
    windowsVirtualKeyCode:codes[key],modifiers});
}
async function clickSelector(selector){
  const point=await evaluate(`(()=>{
    const el=document.querySelector(${q(selector)});
    if(!el||el.disabled)return null;
    el.scrollIntoView({block:'center'});
    const r=el.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
    const hit=document.elementFromPoint(x,y);
    return hit&&(hit===el||el.contains(hit))?{x,y}:null;
  })()`);
  assert(point,'Control missing, disabled or occluded: '+selector);
  await call('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
  await call('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
}
async function click(label){
  const selector=await evaluate(`(()=>{
    const el=[...document.querySelectorAll('button')].find(el=>!el.disabled&&(
      el.getAttribute('aria-label')===${q(label)}||el.title===${q(label)}||el.textContent.trim()===${q(label)}));
    if(!el)return null;
    el.setAttribute('data-cdp-control','active');return '[data-cdp-control="active"]';
  })()`);
  assert(selector,'Missing/enabled button: '+label);
  try{await clickSelector(selector);}finally{
    await evaluate(`document.querySelector(${q(selector)})?.removeAttribute('data-cdp-control')`);
  }
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
const storeKey='opendesk.fingerprint.r21.preview-only.v1';
const presetsKey='fingerprint.r21.presets.v1';
const stored=`JSON.parse(localStorage.getItem(${q(storeKey)})||'{}')`;
const rows=`(${stored}[${q(presetsKey)}]?.items||[])`;
const fieldValues=`Object.fromEntries(['ua','lang','tz','viewport'].map(k=>[k,document.querySelector('#fp-param-'+k)?.value]))`;
const expected={
  原始:{ua:'native',lang:'system',tz:'system',viewport:'native'},
  美国:{ua:'windows',lang:'en-US',tz:'America/New_York',viewport:'desktop'},
  德国:{ua:'mac',lang:'de-DE',tz:'Europe/Berlin',viewport:'desktop'},
  日本:{ua:'mac',lang:'ja-JP',tz:'Asia/Tokyo',viewport:'mobile'}
};
const mainTabs='.fp-app > .fp-tabs';
async function idle(){await until('[...document.querySelectorAll(".fp-bottom-actions button")].every(b=>!b.disabled || b.textContent.includes("应用"))','form operation settled');}
async function save(name){
  await fill('#fp-environment-name',name);
  const old=await evaluate(rows);
  await clickSelector('.fp-bottom-actions button:first-child');
  await until(`${rows}.some(x=>x.name===${q(name)})&&!document.querySelector('.fp-editor-caption .fp-tag-warn')`,'save readback '+name);
  await idle();
  return {before:old,after:await evaluate(rows)};
}
async function reopen(){
  await call('Page.navigate',{url:'about:blank'});
  await call('Page.navigate',{url});
  await until('!!document.querySelector("#fp-tab-config")&&document.querySelector(".fp-site")?.textContent.includes("qa.example.test")','React reopen/context');
  await evaluate(`(()=>{
    const bridge=OpenDeskTool,original=bridge.request.bind(bridge);
    globalThis.__fpFixtureCalls=[];
    bridge.request=async(operation,args={})=>{
      __fpFixtureCalls.push({operation,args:structuredClone(args)});
      return original(operation,args);
    };
  })()`);
}
async function scenario(name,action){
  try{await action();evidence.checks.push({name,status:'PASS',scope:'FIXTURE_ONLY'});console.error('PASS '+name);}
  catch(error){evidence.checks.push({name,status:'FAIL',error:String(error.stack||error)});console.error('FAIL '+name+': '+error.message);}
}
async function focus(selector){
  assert(await evaluate(`(()=>{const e=document.querySelector(${q(selector)});if(!e)return false;e.focus();return document.activeElement===e;})()`),'Cannot focus '+selector);
}
try{
  // Retain drift as a failed gate, but finish UI diagnostics on the captured snapshot.
  evidence.sourceDrift=[];
  for(const [name,info] of Object.entries({...build.sources,...build.files})){
    const bytes=await readFile(join(project,name));
    const actual=createHash('sha256').update(bytes).digest('hex');
    if(actual!==info.sha256)evidence.sourceDrift.push({file:name,expected:info.sha256,actual});
  }
  evidence.checks.push({name:'SOURCE_BUILD_FRESHNESS',status:evidence.sourceDrift.length?'FAIL':'PASS',scope:'SOURCE_PROVENANCE',drift:evidence.sourceDrift});
  evidence.snapshotOnly=evidence.sourceDrift.length>0;
  const scriptUris=[...html.toString().matchAll(/<script src="data:text\/javascript;base64,([^"]+)"/g)].map(x=>Buffer.from(x[1],'base64'));
  for(const name of ['dist/tool.js','preview/react/sdk-preview.js']){
    const bytes=await readFile(join(project,name));
    assert(scriptUris.some(script=>script.equals(bytes)),'Preview does not embed current '+name);
  }
  await connect();
  evidence.browser=await call('Browser.getVersion');
  await reopen();
  await scenario('R32_DEFAULT_AND_FOUR_PRESETS',async()=>{
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('${mainTabs} [role=tab]')].map(x=>x.textContent.trim())`),['配置','我的环境','检测']);
    assert.equal(await evaluate('document.querySelector("#fp-tab-config").getAttribute("aria-selected")'),'true');
    assert.deepEqual(await evaluate(fieldValues),expected.美国);
    for(const [label,values] of Object.entries(expected)){
      await click(label);assert.deepEqual(await evaluate(fieldValues),values);
      assert.equal(await evaluate('document.querySelector(".fp-bottom-actions button:last-child").disabled'),label==='原始');
    }
  });
  await scenario('DIRECT_EDIT_DRAFT_GUARD_KEYBOARD_FOCUS',async()=>{
    await select('#fp-param-tz','Europe/Berlin');
    await click('美国');
    await until('!!document.querySelector("[role=dialog]")','draft dialog');
    assert.equal(await evaluate('document.activeElement.textContent.trim()'),'取消');
    await press('Tab');
    assert.equal(await evaluate('document.activeElement.textContent.trim()'),'丢弃草稿并继续');
    await press('Tab');assert.equal(await evaluate('document.activeElement.textContent.trim()'),'取消');
    await press('Tab',8);assert.equal(await evaluate('document.activeElement.textContent.trim()'),'丢弃草稿并继续');
    await press('Escape');
    await until('!document.querySelector("[role=dialog]")','Escape cancelled');
    assert.equal(await evaluate('document.activeElement.textContent.trim()'),'美国');
    assert.equal(await evaluate('document.querySelector("#fp-param-tz").value'),'Europe/Berlin');
    await press('Enter');await until('!!document.querySelector("[role=dialog]")','Enter activated preset');
    await click('丢弃草稿并继续');
    assert.deepEqual(await evaluate(fieldValues),expected.美国);
    await focus('#fp-tab-config');await press('ArrowRight');
    assert.equal(await evaluate('document.activeElement.id'),'fp-tab-profiles');
    await press('End');assert.equal(await evaluate('document.activeElement.id'),'fp-tab-detect');
    await press('Home');assert.equal(await evaluate('document.activeElement.id'),'fp-tab-config');
  });
  await scenario('SAVE_READBACK_REOPEN_EDIT_COPY_DELETE',async()=>{
    await select('#fp-param-lang','de-DE');
    await save('回归环境');
    assert.equal(await evaluate(`${rows}.find(x=>x.name==='回归环境').config.lang`),'de-DE');
    await reopen();await click('我的环境');
    await clickSelector('.fp-profile-load');
    assert.equal(await evaluate('document.querySelector("#fp-environment-name").value'),'回归环境');
    assert.equal(await evaluate('document.querySelector("#fp-param-lang").value'),'de-DE');
    await select('#fp-param-tz','Asia/Tokyo');await save('回归环境');
    assert.equal(await evaluate(`${rows}.length`),1);
    await select('#fp-param-lang','ja-JP');
    await click('复制当前配置');
    assert.equal(await evaluate('!!document.querySelector("[role=dialog]")'),false);
    assert.equal(await evaluate('document.querySelector("#fp-param-lang").value'),'ja-JP');
    await save('草稿副本');
    assert.equal(await evaluate(`${rows}.find(x=>x.name==='回归环境').config.lang`),'de-DE');
    await click('我的环境');
    await click('复制环境 回归环境');
    assert.equal(await evaluate('document.querySelector("#fp-param-tz").value'),'Asia/Tokyo');
    await save('档案副本');
    await click('我的环境');
    const before=await evaluate(rows);
    await click('删除环境 档案副本');await click('取消');
    assert.deepEqual(await evaluate(rows),before);
    await click('删除环境 档案副本');await click('删除');
    await until(`${rows}.length===2&&!document.querySelector('[role=dialog]')`,'delete confirmed');
    await reopen();await click('我的环境');
    assert.equal(await evaluate('document.querySelectorAll(".fp-profile-row").length'),2);
  });
  await scenario('RESET_ORIGINAL_FORM_ZERO_BRIDGE_CALLS',async()=>{
    await reopen();await select('#fp-param-lang','zh-CN');
    await evaluate('__fpFixtureCalls.length=0');
    await click('恢复原始参数');
    assert.deepEqual(await evaluate(fieldValues),expected.原始);
    assert.deepEqual(await evaluate('__fpFixtureCalls'),[]);
    assert.equal(await evaluate('document.querySelector(".fp-bottom-actions button:last-child").disabled'),true);
    assert.match(await evaluate('document.querySelector(".fp-notice").textContent'),/没有调用 Host/);
  });
  await scenario('APPLY_FAIL_CLOSED_NO_FAKE_READBACK',async()=>{
    await reopen();await evaluate('__fpFixtureCalls.length=0');
    await click('应用到当前网页');
    await until('document.querySelector(".fp-session-state")?.textContent.includes("环境修改未开放")','fail-closed apply');
    await idle();
    assert.deepEqual(await evaluate('__fpFixtureCalls.filter(x=>x.operation.startsWith("browser.fingerprint."))'),[]);
    assert.equal(await evaluate('!!document.querySelector(".fp-session-head button")'),false);
    await until(`${stored}['fingerprint.r21.runs.v1']?.items.some(x=>x.kind==='apply'&&x.status==='blocked')`,'blocked record');
    await click('设置与诊断');
    await clickSelector('.fp-settings .fp-details:nth-of-type(2) summary');
    assert.equal(await evaluate('document.querySelectorAll(".fp-check").length'),0);
    assert.deepEqual(await evaluate('[...document.querySelectorAll(".fp-report-actions button")].map(x=>x.disabled)'),[true,true]);
  });
  await scenario('FIXTURE_ONLY_UNKNOWN_NO_MUTATION_REPLAY',async()=>{
    await reopen();
    await evaluate(`(()=>{
      const bridge=OpenDeskTool,request=bridge.request.bind(bridge);
      globalThis.__fpFaultCalls=[];
      bridge.request=async(operation,args={})=>{
        if(operation==='browser.capabilities.getStatus'&&args.operation==='browser.fingerprint.apply')
          return {operation:args.operation,implementation:'implemented',authorization:{tool:'granted'},callableNow:true};
        if(operation.startsWith('browser.fingerprint.')){
          __fpFaultCalls.push(operation);
          throw Object.assign(Error('FIXTURE_ONLY injected timeout; no real Host executed'),{code:'E_TIMEOUT'});
        }
        return request(operation,args);
      };
    })()`);
    await click('应用到当前网页');
    await until('document.querySelector(".fp-session-state")?.textContent.includes("执行结果未知")','unknown status');
    await idle();
    assert.equal(await evaluate('document.querySelector(".fp-bottom-actions button:last-child").disabled'),true);
    // An uncertain session has no confirmed sessionRef: the current App hides Stop.
    // Do not require an obsolete restore button or fabricate a restore receipt.
    assert.equal(await evaluate('!!document.querySelector(".fp-session-head button")'),false);
    await until(`${stored}['fingerprint.r21.runs.v1']?.items.some(x=>x.kind==='apply'&&x.status==='unknown')`,'unknown apply record');
    await click('检测');await click('配置');await click('重新检查当前网页身份');
    await idle();
    assert.deepEqual(await evaluate('__fpFaultCalls'),['browser.fingerprint.apply']);
    assert.equal(await evaluate('document.querySelectorAll(".fp-check").length'),0);
    await reopen();await pause(250);
    assert.deepEqual(await evaluate('__fpFixtureCalls.filter(x=>x.operation.startsWith("browser.fingerprint."))'),[]);
  });
  await scenario('PRO_LINKS_AND_DETECTION_ENTRY_FIXTURE_ONLY',async()=>{
    await reopen();await clickSelector('.fp-pro-entry');
    assert.deepEqual(await evaluate('[...document.querySelectorAll(".fp-pro a")].map(x=>({href:x.href,target:x.target,safe:x.relList.contains("noopener")&&x.relList.contains("noreferrer")}))'),[
      {href:'https://gologin.com/',target:'_blank',safe:true},
      {href:'https://www.adspower.com/',target:'_blank',safe:true}]);
    await click('返回配置');await click('检测');
    assert.equal(await evaluate('document.querySelector(".fp-detect a").href'),'http://127.0.0.1:43111/browser-fingerprint.html');
    await evaluate('__fpFixtureCalls.length=0');
    await click('检测当前网页');
    await until('document.querySelector(".fp-detect")?.textContent.includes("演示字段已显示")','fixture diagnostic returned');
    assert.equal(await evaluate('__fpFixtureCalls.filter(x=>x.operation==="browser.page.readEnvironment").length'),1);
    assert.equal(await evaluate('__fpFixtureCalls.filter(x=>x.operation.startsWith("browser.fingerprint.")).length'),0);
  });
  evidence.deferred=['Width/zoom/theme matrix: OUT_OF_SCOPE per latest instruction',
    '20/21 capacity browser operations: deferred; existing Node coverage owned separately'];
  assert.deepEqual(exceptions,[],'Unexpected Chromium JavaScript exceptions');
  evidence.status=evidence.checks.some(x=>x.status==='FAIL')?'FAIL':'PASS_R32_PREVIEW_FIXTURE_ONLY';
  if(evidence.status==='FAIL')process.exitCode=1;
  console.log(JSON.stringify({status:evidence.status,checks:evidence.checks},null,2));
}catch(error){
  evidence.status='FAIL';evidence.error=String(error.stack||error);
  console.error(evidence.error);process.exitCode=1;
}finally{
  await writeFile(join(out,'fingerprint-r32-chromium-evidence.json'),JSON.stringify(evidence,null,2)+'\n');
  try{ws?.close();}catch{}
  chrome.kill('SIGKILL');
  await new Promise(resolve=>server.close(resolve));
  await rm(profile,{recursive:true,force:true});
}
