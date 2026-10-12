import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {requireCloudConsoleSender,requireCloudSidePanelSender} from '../../src/platform/host/cloud-observer.js';
import {initCloudControlConsole} from '../../src/ui/cloud-control-console.js';

const URL='chrome-extension://trusted/ui/cloud-control.html';
const sender=()=>({id:'trusted',url:URL,frameId:0,documentId:'trusted-document',
  documentLifecycle:'active',tab:{id:17,incognito:false}});
const context=()=>({contextType:'TAB',documentUrl:URL,documentId:'trusted-document',
  tabId:17,frameId:0,incognito:false});
const api=()=>({runtime:{id:'trusted',getURL:path=>'chrome-extension://trusted/'+path,
  getContexts:async()=>[context()]}});
test('console Observer requires exact Chrome-confirmed extension document identity',async()=>{
  await assert.doesNotReject(requireCloudConsoleSender(api(),sender()));
  const invalid=[
    {...sender(),id:'untrusted'}, {...sender(),url:URL+'?hostInstanceId=forged'},
    {...sender(),frameId:1},{...sender(),documentLifecycle:'prerender'},
    {...sender(),tab:{id:17,incognito:true}}, {...sender(),tab:undefined},
    {...sender(),documentId:undefined}
  ];
  for(const s of invalid)await assert.rejects(requireCloudConsoleSender(api(),s),{code:'E_OWNER'});
  for(const forged of [{tabId:123}, {documentId:'elsewhere'}, {documentUrl:'chrome-extension://trusted/ui/tool.html'},
    {contextType:'SIDE_PANEL'}, {frameId:1}, {incognito:true}]){
    const a=api();a.runtime.getContexts=async()=>[{...context(),...forged}];
    await assert.rejects(requireCloudConsoleSender(a,sender()),{code:'E_OWNER'});
  }
  const a=api();a.runtime.getContexts=async()=>[];
  await assert.rejects(requireCloudConsoleSender(a,sender()),{code:'E_OWNER'});
});
test('only native Side Panel documents can invoke cloud management and claim routes',async()=>{
  const url='chrome-extension://trusted/ui/tool.html?hostInstanceId=real';
  const a=api(),s={...sender(),url,documentId:'side-panel-document',tab:undefined};
  a.runtime.getContexts=async()=>[{
    contextType:'SIDE_PANEL',documentUrl:url,documentId:'side-panel-document',
    frameId:0,incognito:false
  }];
  await assert.doesNotReject(requireCloudSidePanelSender(a,s));
  const b=api();b.runtime.getContexts=async()=>[{
    contextType:'TAB',documentUrl:url,documentId:'side-panel-document',frameId:0,incognito:false
  }];
  await assert.rejects(requireCloudSidePanelSender(b,s),{code:'E_OWNER'});
  await assert.rejects(requireCloudSidePanelSender(a,{...s,id:'foreign'}),{code:'E_OWNER'});
  await assert.rejects(requireCloudSidePanelSender(a,{...s,documentId:'forged'}),{code:'E_OWNER'});
});
test('console is a fixed registered page and never constructs an executable Host',async()=>{
  const [html,js,broker,build,prepare,verify,side]=await Promise.all([
    readFile('src/ui/cloud-control.html','utf8'),readFile('src/ui/cloud-control-console.js','utf8'),
    readFile('src/platform/host/broker.js','utf8'),readFile('scripts/build-contract.mjs','utf8'),
    readFile('scripts/prepare-public.mjs','utf8'),readFile('scripts/verify-package.mjs','utf8'),
    readFile('src/ui/cloud-hosting.js','utf8')]);
  assert.match(html,/script src="cloud-console\.js"/);
  assert.match(html,/Observer-only/);
  assert.match(build,/'ui\/cloud-console': '\.\/src\/ui\/cloud-control-console\.js'/);
  assert.match(prepare,/'src\/ui\/cloud-control\.html':'ui\/cloud-control\.html'/);
  assert.match(verify,/'ui\/cloud-control\.html': \['design-tokens\.css'/);
  assert.match(broker,/await requireCloudConsoleSender\(api,sender\)/);
  assert.match(broker,/await requireCloudSidePanelSender\(api,sender\)/);
  assert.match(broker,/return authority\.cloud\.cloudObserve\(message\.payload \?\? \{\}\)/);
  assert.doesNotMatch(js,/createHostClient|registerHost|cloudNext|cloudResolve|cloudPair|host\.start/);
  assert.match(side,/api\.tabs\.create\(\{url:api\.runtime\.getURL\('ui\/cloud-control\.html'\)\}\)/);
});
test('console reads only cloudObserve and displays bounded redacted rows via textContent',async()=>{
  const ids=['cc-status','cc-request-list','cc-paired','cc-connection','cc-reconciled','cc-host',
    'cc-slot','cc-enabled','cc-tasks','cc-count','cc-page','cc-stage-counts',
    'cc-prev','cc-next','cc-refresh'];
  const makeNode=()=>({textContent:'',disabled:false,children:[],events:new Map(),
    addEventListener(type,fn){this.events.set(type,fn);},removeEventListener(type){this.events.delete(type);},
    replaceChildren(){this.children=[];},append(...children){this.children.push(...children);}});
  const nodes=new Map(ids.map(id=>[id,makeNode()]));
  const doc={visibilityState:'visible',getElementById:id=>nodes.get(id),createElement:makeNode,
    addEventListener(){},removeEventListener(){}};
  const calls=[],a={runtime:{sendMessage:async message=>{
    calls.push(message);
    return {ok:true,data:{schema:'opendesk.cloud-control.observer.v1',paired:true,enabled:true,
      connection:'authenticated',online:true,reconciled:true,slotAvailable:false,
      approvedTasks:1,requestTotal:1,states:{finished:1},page:{offset:0,limit:20,nextOffset:null},
      rows:[{state:'finished',runState:'completed',retirementReleased:true,receiptConfirmed:true,
        privateKey:'SHOULD-NOT-RENDER'}]}};} }};
  const consoleView=initCloudControlConsole({api:a,doc,refreshIntervalMs:0});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls.length,1);assert.equal(calls[0].type,'cloudObserve');
  assert.deepEqual(calls[0].payload,{offset:0,limit:20});
  assert.equal(nodes.get('cc-count').textContent,'1');
  assert.equal(nodes.get('cc-next').disabled,true);
  assert.match(nodes.get('cc-status').textContent,/只读/);
  assert.match(nodes.get('cc-request-list').children[0].children[2].textContent,/已确认回执/);
  assert.doesNotMatch(JSON.stringify([...nodes.values()].map(x=>x.textContent)),/SHOULD-NOT-RENDER/);
  consoleView.dispose();
});
