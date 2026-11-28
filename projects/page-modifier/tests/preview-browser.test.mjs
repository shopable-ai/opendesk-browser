import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const chromePath = process.env.CHROME_BIN || 'google-chrome';
const previewPath = resolve('projects/page-modifier/preview/index.html');
const outputDir = resolve('artifacts/page-modifier-preview');
const profileDir = await mkdtemp(join(tmpdir(),'page-modifier-chrome-'));
await mkdir(outputDir,{recursive:true});

let chrome;
let socket;
let nextId = 0;
const pending = new Map();
const browserErrors = [];

function delay(ms){return new Promise(resolve=>setTimeout(resolve,ms));}

async function waitForDebugger(){
  for(let attempt=0;attempt<100;attempt++){
    try{
      const response = await fetch('http://127.0.0.1:9222/json/version');
      if(response.ok) return await response.json();
    }catch{}
    await delay(100);
  }
  throw new Error('Chrome remote debugging endpoint did not become ready');
}

async function connectPage(){
  const response = await fetch('http://127.0.0.1:9222/json/new?about:blank',{method:'PUT'});
  if(!response.ok) throw new Error('Chrome could not create a page target: '+response.status);
  const target = await response.json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{
    socket.addEventListener('open',resolve,{once:true});
    socket.addEventListener('error',reject,{once:true});
  });
  socket.addEventListener('message',event=>{
    let message;
    try{message=JSON.parse(event.data);}catch{return;}
    if(message.id && pending.has(message.id)){
      const waiter=pending.get(message.id);
      pending.delete(message.id);
      if(message.error) waiter.reject(new Error(message.error.message || JSON.stringify(message.error)));
      else waiter.resolve(message.result || {});
      return;
    }
    if(message.method==='Runtime.exceptionThrown'){
      browserErrors.push(message.params?.exceptionDetails?.text || 'Runtime exception');
    }
    if(message.method==='Runtime.consoleAPICalled' && message.params?.type==='error'){
      browserErrors.push((message.params.args || []).map(arg=>arg.value || arg.description || '').join(' '));
    }
  });
}

function send(method,params={}){
  const id=++nextId;
  return new Promise((resolve,reject)=>{
    pending.set(id,{resolve,reject});
    socket.send(JSON.stringify({id,method,params}));
    setTimeout(()=>{
      if(pending.has(id)){pending.delete(id);reject(new Error('CDP timeout: '+method));}
    },8000);
  });
}

async function evaluate(expression){
  const result=await send('Runtime.evaluate',{
    expression,returnByValue:true,awaitPromise:true,userGesture:true
  });
  if(result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Page evaluation failed');
  return result.result?.value;
}

async function waitFor(expression,label,timeout=3500){
  const started=Date.now();
  while(Date.now()-started<timeout){
    const value=await evaluate(expression);
    if(value) return value;
    await delay(60);
  }
  throw new Error('Timed out waiting for '+label);
}

async function setViewport(width,height){
  await send('Page.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
  await delay(100);
}

async function click(selector){
  const rect=await evaluate("(()=>{const node=document.querySelector("+JSON.stringify(selector)+");if(!node)return null;const box=node.getBoundingClientRect();return {x:box.left+box.width/2,y:box.top+box.height/2,w:box.width,h:box.height,disabled:!!node.disabled};})()");
  assert.ok(rect && rect.w>0 && rect.h>0,'Visible control not found: '+selector);
  assert.equal(rect.disabled,false,'Control is disabled: '+selector);
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:rect.x,y:rect.y});
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:rect.x,y:rect.y,button:'left',clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:rect.x,y:rect.y,button:'left',clickCount:1});
  await delay(90);
}

async function setValue(selector,value){
  const result=await evaluate("(()=>{const node=document.querySelector("+JSON.stringify(selector)+");if(!node)throw new Error('Input not found');node.focus();node.value="+JSON.stringify(value)+";node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));return node.value;})()");
  assert.equal(result,value,'Could not set '+selector);
}

async function press(key){
  const codes={Escape:27,Enter:13,Tab:9};
  const code=codes[key];
  await send('Input.dispatchKeyEvent',{type:'keyDown',key,code:key,windowsVirtualKeyCode:code});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,windowsVirtualKeyCode:code});
  await delay(100);
}

async function screenshot(name){
  const result=await send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
  await writeFile(join(outputDir,name),Buffer.from(result.data,'base64'));
}

async function openTestMenuAndClick(selector){
  if(await evaluate("document.querySelector('#testMenu').hidden")) await click('#testMenuToggle');
  await click(selector);
}

try{
  chrome=spawn(chromePath,[
    '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--remote-debugging-port=9222','--remote-allow-origins=*',
    '--user-data-dir='+profileDir,'--no-first-run','--no-default-browser-check','about:blank'
  ],{stdio:['ignore','ignore','pipe']});
  let chromeLog='';
  chrome.stderr.on('data',chunk=>{chromeLog+=chunk.toString();});
  await waitForDebugger();
  await connectPage();
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Input.enable');
  await setViewport(360,900);
  await send('Page.navigate',{url:pathToFileURL(previewPath).href});
  await waitFor("document.readyState==='complete' && !!document.querySelector('#sideView')",'initial Side Panel render');

  assert.equal(await evaluate("document.body.dataset.view"),'side');
  assert.equal(await evaluate("Math.round(document.querySelector('#deviceFrame').getBoundingClientRect().width)"),360);
  assert.ok(await evaluate("document.documentElement.scrollWidth<=360"),'Side Panel must not overflow horizontally at 360px');
  await screenshot('side-panel-360.png');

  // Create a normal text rule through the visible form and save button.
  await click('#sideAddRule');
  assert.equal(await evaluate("!document.querySelector('#editorPanel').hidden"),true);
  await setValue('#ruleName','测试规则：品牌别名');
  await setValue('#ruleFind','OldLabel');
  await setValue('#ruleReplace','NewLabel');
  await click('#saveRule');
  await waitFor("document.querySelectorAll('#sideRuleList .rule-item').length===4",'new rule saved');
  assert.equal(await evaluate("document.querySelector('#sideRuleList .rule-title').textContent"),'测试规则：品牌别名');

  // Edit the new rule and verify the existing values are retained.
  await click('#sideRuleList .rule-item:first-child button[aria-label="编辑规则"]');
  assert.equal(await evaluate("document.querySelector('#ruleFind').value"),'OldLabel');
  await setValue('#ruleReplace','UpdatedLabel');
  await click('#saveRule');
  await waitFor("document.querySelector('#sideRuleList .rule-mapping').textContent.includes('UpdatedLabel')",'edited rule saved');

  // Move a rule, then toggle its enabled state.
  const beforeMove=await evaluate("document.querySelector('#sideRuleList .rule-title').textContent");
  await click('#sideRuleList .rule-item:first-child button[aria-label="下移规则"]');
  const afterMove=await evaluate("document.querySelector('#sideRuleList .rule-title').textContent");
  assert.notEqual(afterMove,beforeMove,'Rule order must change after moving down');
  const toggleSelector='#sideRuleList .rule-item:first-child .rule-toggle';
  const beforeToggle=await evaluate("document.querySelector("+JSON.stringify(toggleSelector)+").getAttribute('aria-checked')");
  await click(toggleSelector);
  const afterToggle=await evaluate("document.querySelector("+JSON.stringify(toggleSelector)+").getAttribute('aria-checked')");
  assert.notEqual(afterToggle,beforeToggle,'Rule enable state must change');

  // Regex mode: match count, replacement preview and invalid-expression feedback.
  const regexIndex=await evaluate("Array.from(document.querySelectorAll('#sideRuleList .rule-item')).findIndex(node=>node.querySelector('.rule-title')?.textContent==='统一产品系列格式')");
  assert.ok(regexIndex>=0,'Seed regex rule must be present');
  await click('#sideRuleList .rule-item:nth-child('+(regexIndex+1)+') button[aria-label="编辑规则"]');
  assert.equal(await evaluate("document.querySelector('#matchMode').value"),'regex');
  await setValue('#ruleFind','Product\\s+([A-Z])');
  await setValue('#ruleReplace','Item-$1');
  await setValue('#testText','Product A and Product B');
  assert.equal(await evaluate("document.querySelector('#matchCount').textContent"),'2 处匹配');
  assert.equal(await evaluate("document.querySelector('#testOutput').textContent"),'Item-A and Item-B');
  await setValue('#ruleFind','[');
  assert.equal(await evaluate("!document.querySelector('#regexError').hidden"),true);
  await click('#saveRule');
  assert.equal(await evaluate("!document.querySelector('#formError').hidden"),true,'Invalid regex must block saving');
  await setValue('#ruleFind','Product\\s+([A-Z])');
  await click('#saveRule');
  await waitFor("document.querySelector('#editorPanel').hidden",'regex editor closed after save');

  // Global and current-site switches are independent.
  await click('#sideGlobalSwitch');
  assert.equal(await evaluate("document.querySelector('#sideGlobalSwitch').getAttribute('aria-checked')"),'false');
  assert.equal(await evaluate("document.querySelector('#sideSiteSwitch').getAttribute('aria-checked')"),'true');
  await click('#sideSiteSwitch');
  assert.equal(await evaluate("document.querySelector('#sideSiteSwitch').getAttribute('aria-checked')"),'false');
  await click('#sideGlobalSwitch');
  assert.equal(await evaluate("document.querySelector('#sideGlobalSwitch').getAttribute('aria-checked')"),'true');
  assert.equal(await evaluate("document.querySelector('#sideSiteSwitch').getAttribute('aria-checked')"),'false');
  await click('#sideSiteSwitch');

  // Switch to the full PC workspace and test search at desktop width.
  await setViewport(1440,1000);
  await click('[data-view-choice="pc"]');
  assert.equal(await evaluate("document.body.dataset.view"),'pc');
  assert.equal(await evaluate("Math.round(document.querySelector('#deviceFrame').getBoundingClientRect().width)"),1200);
  await screenshot('pc-management-1440.png');
  await setValue('#ruleSearch','OldBrand');
  assert.equal(await evaluate("document.querySelectorAll('#pcRuleList .rule-item').length"),1);
  await setValue('#ruleSearch','');

  // Empty state and restore controls.
  await openTestMenuAndClick('#clearRules');
  assert.equal(await evaluate("!document.querySelector('#dialogLayer').hidden"),true);
  await click('#dialogConfirm');
  await waitFor("document.querySelector('#pcRuleList .list-empty')?.textContent.includes('还没有替换规则')",'empty list state');
  await openTestMenuAndClick('#restoreRules');
  assert.equal(await evaluate("document.querySelectorAll('#pcRuleList .rule-item').length"),3);

  // Simulated save failure must retain user input and keep the editor open.
  await openTestMenuAndClick('#failNextSave');
  await click('#pcAddRule');
  await setValue('#ruleName','保存失败保留输入');
  await setValue('#ruleFind','KeepThisInput');
  await setValue('#ruleReplace','KeepThisOutput');
  await click('#saveRule');
  await waitFor("!document.querySelector('#formError').hidden",'simulated save error');
  assert.equal(await evaluate("document.querySelector('#ruleFind').value"),'KeepThisInput');
  assert.equal(await evaluate("!document.querySelector('#editorPanel').hidden"),true);

  // Cancel with a dirty form asks before discarding; deletion names the target.
  await click('#cancelEdit');
  assert.equal(await evaluate("!document.querySelector('#dialogLayer').hidden"),true);
  await click('#dialogConfirm');
  await click('#pcRuleList .rule-item:first-child button[aria-label="删除规则"]');
  assert.equal(await evaluate("!document.querySelector('#dialogLayer').hidden"),true);
  assert.ok((await evaluate("document.querySelector('#dialogMessage').textContent")).includes('品牌名称统一替换'));
  await click('#dialogConfirm');
  assert.equal(await evaluate("document.querySelectorAll('#pcRuleList .rule-item').length"),2);

  // Keyboard Escape protects unsaved changes; Enter opens a form action.
  await click('#pcAddRule');
  await setValue('#ruleFind','UnsavedDraft');
  await press('Escape');
  assert.equal(await evaluate("!document.querySelector('#dialogLayer').hidden"),true);
  await click('#dialogCancel');
  await press('Escape');
  await click('#dialogConfirm');
  assert.equal(await evaluate("document.querySelector('#editorPanel').hidden"),true);

  await click('[data-view-choice="side"]');
  await evaluate("document.querySelector('#sideAddRule').focus()");
  await press('Enter');
  assert.equal(await evaluate("!document.querySelector('#editorPanel').hidden"),true);
  await press('Escape');
  assert.equal(await evaluate("document.querySelector('#editorPanel').hidden"),true);
  await setViewport(360,900);
  assert.ok(await evaluate("document.documentElement.scrollWidth<=360"),'Side Panel remains horizontally contained after all interactions');
  await screenshot('side-panel-360-final.png');

  assert.deepEqual(browserErrors,[],'Browser console/runtime errors: '+browserErrors.join(' | '));
  console.log(JSON.stringify({
    status:'PASS',
    browser:'Chrome headless via CDP',
    viewportChecks:['360px Side Panel','1440px PC management'],
    interactions:[
      'create text rule','edit rule','reorder rule','enable/disable rule',
      'regex match count and replacement preview','invalid regex validation',
      'independent global/site switches','PC search','empty state','restore examples',
      'simulated save failure retains inputs','delete confirmation','unsaved-change warning',
      'Enter/Escape keyboard handling'
    ],
    screenshots: ['side-panel-360.png','pc-management-1440.png','side-panel-360-final.png'],
    consoleErrors:browserErrors
  },null,2));
} catch(error){
  console.error('PAGE_MODIFIER_BROWSER_TEST_FAILED',error);
  console.error('Browser console/runtime errors:',browserErrors);
  process.exitCode=1;
} finally {
  try{socket?.close();}catch{}
  try{chrome?.kill('SIGTERM');}catch{}
  await delay(150);
  try{await rm(profileDir,{recursive:true,force:true});}catch{}
}
