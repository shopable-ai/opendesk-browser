import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {selectControllerSidebar, validateControllerSidebarAck} from './k5-controller-sidebar-entry.mjs';

// Unit observer fixtures; never qualify Native input or receipt evidence.
function fixture() {
  const extensionId = 'a'.repeat(32);
  const context = {contextType:'SIDE_PANEL', contextId:'context-a', documentId:'document-a',
    documentUrl:`chrome-extension://${extensionId}/ui/tool.html?hostInstanceId=owner-a`,
    tabId:-1, windowId:8, incognito:false};
  const target = {type:'other', targetId:'target-a', url:context.documentUrl};
  const request = {requestId:'request-a', pid:100, extensionId};
  const ack = {...request, targetId:target.targetId, documentId:context.documentId,
    windowId:8, nativeSidebarOpened:true, noDomAssignment:true, noSyntheticEvent:true};
  return {contexts:[context], targets:[target], extensionId, context, target, request, ack};
}

test('Sidebar binds actual Chrome context, owner URL and exact debugger target', () => {
  const f = fixture(), entry = selectControllerSidebar(f);
  assert.equal(entry.context.documentId, 'document-a');
  assert.equal(validateControllerSidebarAck(f.ack, f.request, entry), entry);
});

test('Chrome Sidebar windowId -1 preserves exact process/document/target and UI witness', () => {
  const f = fixture();
  f.context.windowId = -1;
  f.ack.windowId = -1;
  const entry = selectControllerSidebar(f);
  assert.equal(entry.context.windowId, -1);
  assert.equal(validateControllerSidebarAck(f.ack, f.request, entry), entry);
  assert.throws(() => validateControllerSidebarAck({...f.ack, windowId:8}, f.request, entry));
});

test('catalog tabs, popup contexts, foreign extensions and unbound owner URLs cannot substitute', () => {
  for (const change of [f=>{f.context.contextType='TAB';}, f=>{f.context.contextType='POPUP';},
    f=>{f.context.incognito=true;}, f=>{f.context.documentUrl=f.context.documentUrl.replace('a'.repeat(32),'b'.repeat(32));},
    f=>{f.context.documentUrl=f.context.documentUrl.split('?')[0];}, f=>{f.target.url+='&different=1';}]) {
    const f = fixture();change(f);assert.equal(selectControllerSidebar(f), null);
  }
});

test('ambiguous or invalid native identities fail before any product action', () => {
  for (const change of [f=>{f.contexts.push({...f.context});}, f=>{f.targets.push({...f.target});},
    f=>{f.context.tabId=9;}, f=>{f.context.documentId='';}, f=>{f.context.contextId='';},
    f=>{f.context.windowId=-2;}, f=>{f.context.windowId=0.5;}]) {
    const f = fixture();change(f);assert.throws(()=>selectControllerSidebar(f));
  }
});

test('UI acknowledgement cannot drift to a different request, process, document or target', () => {
  const f = fixture(), entry = selectControllerSidebar(f);
  for (const [key,value] of [['requestId','old'],['pid',101],['extensionId','b'.repeat(32)],
    ['targetId','other'],['documentId','old-document'],['windowId',9],
    ['nativeSidebarOpened',false],['noDomAssignment',false],['noSyntheticEvent',false]])
    assert.throws(()=>validateControllerSidebarAck({...f.ack,[key]:value},f.request,entry));
});

const source = await readFile(new URL('./k5-controller-product-native.mjs', import.meta.url), 'utf8');
const openSource = source.slice(source.indexOf('  async function openTool()'), source.indexOf('  async function newPage('));
function openHarness({headless=false, catalog=false, staleAck=false}={}) {
  const f = fixture(), actions=[], writes=[];
  if (catalog) f.context.contextType='TAB';
  const report = {pid:f.request.pid, extensionId:f.extensionId, actualSW:{url:`chrome-extension://${f.extensionId}/sw.js`}};
  const worker = {type:'service_worker',targetId:'worker-a',url:report.actualSW.url};
  const open = vm.runInNewContext(`(async()=>{let tool,toolId;${openSource};return openTool;})()`, {
    assert, path, report, selectControllerSidebar, validateControllerSidebarAck,
    args:headless?[]:['--headed','--native-ui-assist'], mode:'production', label:'155', absolute:'/unit-observer', directory:'unit',
    randomUUID:()=>f.request.requestId, option:()=>100,
    log:()=>{}, json:async(name,value)=>{writes.push({name,value});},
    targets:async()=>[worker,f.target],
    attach:async id=>({id,send:async()=>{},close(){}}),
    evaluate:async(client,expression)=>{
      assert(!/dispatchEvent|\.hidden\s*=|\.value\s*=/.test(expression));
      if(expression.includes('chrome.runtime.getContexts'))return f.contexts;
      if(expression.includes('#script-status')) {
        assert(expression.includes('#script-history'));
        assert(expression.includes('opendeskSurface'));
        return true;
      }
      return true;
    },
    until:async fn=>{const value=await fn();if(!value)throw Error('unit observation pending');return value;},
    readFile:async()=>JSON.stringify({...f.ack, documentId:staleAck?'old-document':f.context.documentId}),
    click:async(client,id,selector)=>{actions.push({id,selector});},
  });
  return {open:open.then(fn=>fn()), actions, writes, report};
}

test('actual runner opens observed Sidebar developer UI without creating a catalog tab', async () => {
  const h = openHarness();
  const entry = await h.open;
  assert.equal(entry.targetId, 'target-a');
  assert.deepEqual(h.actions.map(row=>row.selector), ['#tab-develop','#script-library-tools > summary','.developer-params > summary','#script-advanced > summary','#developer-results-panel > summary']);
  assert(h.actions.every(row=>row.id==='target-a'));
  assert.equal(h.report.sidebarEntry.context.documentId, 'document-a');
});

test('actual runner has no product actions for headless/catalog/stale-document entry', async () => {
  for (const options of [{headless:true},{catalog:true},{staleAck:true}]) {
    const h = openHarness(options);
    await assert.rejects(h.open);
    assert.equal(h.actions.length, 0);
  }
});

// Component execution of the actual assist branches. These fixtures provide
// no Native evidence; they prevent CDP or DOM fallbacks after a native cue.
const inputSource = source.slice(source.indexOf('  async function click('), source.indexOf('  async function select('));
function inputHarness({ackChange={}, observedChange={}}={}) {
  const writes=[], records=[], report={pid:100, sidebarEntry:{context:{documentId:'document-a'}}};
  let request;
  const helpers=vm.runInNewContext(`(()=>{${inputSource};return{click,fill};})()`, {
    assert,path,report,toolId:'target-a',nativeSelection:'assist',args:['--native-ui-assist'],
    mode:'production',label:'155',directory:'unit',absolute:'/unit-observer',
    randomUUID:()=> 'current-request',option:()=>100,log:()=>{},
    json:async(name,value)=>{request=value;writes.push({name,value});},
    readFile:async()=>JSON.stringify({...request,nativeClickComplete:true,nativeInputComplete:true,
      noDomAssignment:true,noSyntheticEvent:true,...ackChange}),
    until:async fn=>{const value=await fn();if(!value)throw Error('unit observation pending');return value;},
    evaluate:async(client,expression)=>{
      assert(!/dispatchEvent|\.hidden\s*=|\.value\s*=/.test(expression));
      return{focused:true,value:request.desired,...observedChange};
    },
    appendFileSync:(name,value)=>records.push({name,value}),
    browserClient:{send(){throw Error('Native assist cannot use a CDP fallback');}}
  });
  return{helpers,writes,records};
}

test('actual runner uses native click/input witness and focused exact field readback', async () => {
  const h=inputHarness(),client={send(){throw Error('No CDP input during native assist');}};
  await h.helpers.click(client,'target-a','#tab-develop');
  await h.helpers.fill(client,'target-a','#script-id','current-script');
  assert.deepEqual(h.writes.map(x=>x.value.state),['native-click-assist','native-input-assist']);
  assert(h.writes.every(x=>x.value.documentId==='document-a'));
  assert.equal(JSON.parse(h.records[0].value).actual,'current-script');
});

test('actual native input rejects drifted witnesses, wrong values and lost focus', async () => {
  for(const options of [
    {ackChange:{requestId:'old'}},{ackChange:{pid:101}},{ackChange:{targetId:'other'}},
    {ackChange:{documentId:'old'}},{ackChange:{selector:'#wrong'}},{ackChange:{desired:'wrong'}},
    {ackChange:{nativeInputComplete:false}},{ackChange:{noDomAssignment:false}},
    {ackChange:{noSyntheticEvent:false}},{observedChange:{value:'wrong'}},{observedChange:{focused:false}}
  ]) {
    const h=inputHarness(options);
    await assert.rejects(h.helpers.fill({},'target-a','#script-id','current-script'));
    assert.equal(h.records.length,0);
  }
  for(const ackChange of [{requestId:'old'},{pid:101},{documentId:'old'},
    {targetId:'other'},{selector:'#wrong'},{nativeClickComplete:false},{noDomAssignment:false},{noSyntheticEvent:false}]) {
    const h=inputHarness({ackChange});
    await assert.rejects(h.helpers.click({},'target-a','#tab-develop'));
  }
});

const commitSource=source.slice(source.indexOf('  async function commit('),source.indexOf('  async function chooseOwned('));
function commitHarness({savedChange={}, rowChange={}, formChange={}, afterChange={}}={}) {
  const scriptId='unit-saved-script', program='return 7;', params={value:0};
  const digest=bytes=>createHash('sha256').update(bytes).digest('hex'),hash=digest(Buffer.from(program));
  let snapshots=0,saved=false;const actions=[],records=[];
  const commit=vm.runInNewContext(`(()=>{${commitSource};return commit;})()`, {
    assert,path,Buffer,digest,tool:{},toolId:'target-a',absolute:'/unit-observer',directory:'unit',randomUUID:()=>scriptId,
    fill:async()=>{},click:async(client,id,selector)=>{saved=true;actions.push(selector);},
    snapshot:async()=>({rows:{scriptRevisions:snapshots++===0?[]:[{value:{scriptId,revision:1,contentHash:hash,sourceUtf8:program,...rowChange}}]}}),
    evaluate:async(client,expression)=>{
      if(expression.includes('selectedOptions'))return{value:scriptId,text:`${scriptId} · r1 · ${hash}`,...savedChange};
      if(expression.includes('#script-revision'))return 1;
      return{scriptId,source:program,params:JSON.stringify(params),...formChange,...(saved?afterChange:{})};
    },
    ui:async()=>({version:'已保存 r1 · 可运行草稿；不自动创建新 revision'}),
    appendFileSync:(name,value)=>records.push({name,value}),json:async()=>{},
    until:async fn=>{const value=await fn();if(!value)throw Error('unit observation pending');return value;}
  });
  return{commit,scriptId,program,params,actions,records,hash};
}

test('actual save observer binds current selected library identity and immutable row without a hash toast', async()=>{
  const h=commitHarness(),actual=await h.commit(h.program,h.params,{},'target-a',h.scriptId);
  assert.equal(actual.sourceHash,h.hash);assert.equal(actual.revision,1);
  assert.deepEqual(h.actions,['#script-save']);assert.equal(h.records.length,2);
});

test('save observer rejects changed complete input, foreign UI identity and missing immutable revision',async()=>{
  for(const options of [{formChange:{source:'other'}},{afterChange:{params:'{}'}},
    {savedChange:{value:'other'}},{savedChange:{text:'stale hash'}},{rowChange:{revision:0}},
    {rowChange:{contentHash:'stale'}},{rowChange:{sourceUtf8:'other'}}]) {
    const h=commitHarness(options);await assert.rejects(h.commit(h.program,h.params,{},'target-a',h.scriptId));
    if(options.formChange)assert.equal(h.actions.length,0);
  }
});
