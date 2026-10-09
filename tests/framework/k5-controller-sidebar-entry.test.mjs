import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import path from 'node:path';
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
    f=>{f.context.windowId=-1;}]) {
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
  assert.deepEqual(h.actions.map(row=>row.selector), ['#tab-develop','#script-advanced > summary','#developer-results-panel > summary']);
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
