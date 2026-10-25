// Focused one-shot native Side Panel route tests. Chrome UI itself is NOT_TESTED.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {describeBundle} from '../../scripts/bundle-provenance.mjs';
import {createPanelToolIntent,createPanelToolIntentReceiver,panelToolIntentKey,
  validPanelToolIntent,PANEL_TOOL_INTENT_TTL_MS}
  from '../../src/ui/sidebar-tools/panel-tool-intent.js';
import {handlePromptRailOpen,PROMPT_RAIL_OPEN_PROTOCOL}
  from '../../examples/sidebar-tools/prompt-shortcuts/trusted/rail-open.js';

const id='00000000-0000-4000-8000-000000000001';
const make=(windowId=3)=>createPanelToolIntent({
  windowId,tabId:8,toolId:'prompt-shortcuts',requestId:id,issuedAt:1000
});
const settle=async()=>{await new Promise(resolve=>setImmediate(resolve));
  await new Promise(resolve=>setImmediate(resolve));};

function fakeStorage(){
  const entries=new Map(),listeners=new Set();
  const notify=(key,oldValue,newValue)=>{
    for(const listener of [...listeners])listener({[key]:{oldValue,newValue}},'session');
  };
  return {
    session:{
      async get(key){return {[key]:entries.get(key)};},
      async set(changes){
        for(const [key,value] of Object.entries(changes)){
          const old=entries.get(key);entries.set(key,value);notify(key,old,value);
        }
      },
      async remove(key){const old=entries.get(key);entries.delete(key);notify(key,old,undefined);}
    },
    onChanged:{addListener(listener){listeners.add(listener);},
      removeListener(listener){listeners.delete(listener);}}
  };
}

test('per-window locator is bounded, one-shot and rejects invalid identities',()=>{
  const route=make();
  assert.equal(panelToolIntentKey(3),'opendesk.sidebar.tool-intent.v1.3');
  assert.equal(validPanelToolIntent(route,{windowId:3,now:1000}),true);
  assert.equal(validPanelToolIntent(route,{windowId:4,now:1000}),false);
  assert.equal(validPanelToolIntent(route,{windowId:3,now:1001+PANEL_TOOL_INTENT_TTL_MS}),false);
  assert.equal(validPanelToolIntent({...route,toolId:'../other'},{windowId:3,now:1000}),false);
  assert.equal(validPanelToolIntent({...route,requestId:'invalid'},{windowId:3,now:1000}),false);
  assert.throws(()=>panelToolIntentKey(-1),TypeError);
  assert.throws(()=>createPanelToolIntent({...route,tabId:-1}),TypeError);
});

test('closed-panel startup read opens only its window route and consumes it',async()=>{
  const storage=fakeStorage(),key=panelToolIntentKey(3),other=panelToolIntentKey(4);
  await storage.session.set({[key]:make(),[other]:make(4)});
  const opened=[];
  const receiver=createPanelToolIntentReceiver({api:{storage},now:()=>1100,
    onOpen:async toolId=>opened.push(toolId)});
  receiver.start(3);await settle();
  assert.deepEqual(opened,['prompt-shortcuts']);
  assert.equal((await storage.session.get(key))[key],undefined);
  assert.ok((await storage.session.get(other))[other],'other window remains untouched');
  receiver.dispose();
});

test('already-open panel responds to a new route; repeat and expired routes never reopen',async()=>{
  const storage=fakeStorage(),key=panelToolIntentKey(3),opened=[];
  const receiver=createPanelToolIntentReceiver({api:{storage},now:()=>1150,
    onOpen:async toolId=>opened.push(toolId)});
  receiver.start(3);await settle();
  await storage.session.set({[key]:make()});await settle();
  await storage.session.set({[key]:make()});await settle();
  await storage.session.set({[key]:{...make(),requestId:'00000000-0000-4000-8000-000000000002',
    issuedAt:-100000}});await settle();
  assert.deepEqual(opened,['prompt-shortcuts']);
  receiver.dispose();
  await storage.session.set({[key]:{...make(),requestId:'00000000-0000-4000-8000-000000000003'}});
  await settle();
  assert.deepEqual(opened,['prompt-shortcuts'],'disposed receiver cannot navigate');
});

test('web OD user gesture opens native panel synchronously and writes fixed tool locator',async()=>{
  const storage=fakeStorage(),calls=[];
  const sender={id:'extension',frameId:0,documentLifecycle:'active',
    url:'https://chatgpt.com/c/example',tab:{id:8,windowId:3,
      url:'https://chatgpt.com/c/example',incognito:false}};
  const api={runtime:{id:'extension'},storage,sidePanel:{open(params){
    calls.push('open');assert.deepEqual(params,{windowId:3});return Promise.resolve();
  }}};
  const replies=[];
  assert.equal(handlePromptRailOpen({api,sender,respond:value=>replies.push(value),
    message:{protocol:PROMPT_RAIL_OPEN_PROTOCOL,expectedUrl:sender.url}}),true);
  assert.equal(calls[0],'open','no asynchronous preflight before Chrome user gesture');
  await settle();
  assert.deepEqual(replies,[{ok:true,data:{opened:true}}]);
  const record=(await storage.session.get(panelToolIntentKey(3)))[panelToolIntentKey(3)];
  assert.equal(record.toolId,'prompt-shortcuts');
  assert.equal(record.windowId,3);
});

test('a rejected Chrome open never persists a stale target route',async()=>{
  const storage=fakeStorage(),responses=[];
  const sender={id:'extension',frameId:0,documentLifecycle:'active',
    url:'https://chatgpt.com/c/example',tab:{id:8,windowId:3,
      url:'https://chatgpt.com/c/example',incognito:false}};
  const api={runtime:{id:'extension'},storage,sidePanel:{
    open:()=>Promise.reject(Error('gesture refused'))
  }};
  assert.equal(handlePromptRailOpen({api,sender,respond:value=>responses.push(value),
    message:{protocol:PROMPT_RAIL_OPEN_PROTOCOL,expectedUrl:sender.url}}),true);
  await settle();
  assert.deepEqual(responses,[{ok:false,error:{code:'E_SIDE_PANEL'}}]);
  const key=panelToolIntentKey(3);
  assert.equal((await storage.session.get(key))[key],undefined);
});

test('a pending native open does not route until Chrome confirms it',async()=>{
  const storage=fakeStorage(),responses=[];
  const sender={id:'extension',frameId:0,documentLifecycle:'active',
    url:'https://chatgpt.com/c/example',tab:{id:8,windowId:3,
      url:'https://chatgpt.com/c/example',incognito:false}};
  let complete;
  const api={runtime:{id:'extension'},storage,sidePanel:{
    open:()=>new Promise(resolve=>{complete=resolve;})
  }};
  handlePromptRailOpen({api,sender,respond:value=>responses.push(value),
    message:{protocol:PROMPT_RAIL_OPEN_PROTOCOL,expectedUrl:sender.url}});
  const key=panelToolIntentKey(3);
  assert.equal((await storage.session.get(key))[key],undefined);
  assert.deepEqual(responses,[]);
  complete();await settle();
  assert.equal((await storage.session.get(key))[key].toolId,'prompt-shortcuts');
  assert.deepEqual(responses,[{ok:true,data:{opened:true}}]);
});

test('Built-in prompt rail has one first OD management entry but no collapsers or transcript arrows',async()=>{
  const source=await readFile('examples/sidebar-tools/prompt-shortcuts/trusted/page.js','utf8');
  assert.ok(source.includes("for(const row of items)"),'saved items remain directly usable');
  assert.ok(source.includes("brand.title='打开提示词快捷按钮管理侧栏'"),
    'the single first OD brand entry has its accessible management purpose');
  assert.ok(source.includes("brand.addEventListener('click',openSidebar)"),
    'the restored brand uses the pre-existing user-gesture Side Panel bridge');
  assert.ok(!source.includes("compactExpanded"),'no collapse state');
  assert.ok(!source.includes("dataset.scrollConversation"),'no transcript up/down buttons in rail');
  assert.ok(!source.includes('data-opendesk-prompts-floating'),
    'Prompt does not create the independent conversation dock');
  assert.ok(!source.includes('navigationClick('),
    'conversation navigation is owned by the separately installed Page Program');
});

test('official native Side Panel controller reuses React ToolHost and does not navigate full-size tabs',async()=>{
  const source=await readFile('src/ui/tool-shell.js','utf8');
  assert.match(source,/createPanelToolIntentReceiver/);
  assert.match(source,/if\(actualSidePanel\|\|!tab\?\.id\)/);
  assert.match(source,/await tabMemory\.restore\(\)/);
  assert.match(source,/panelToolIntents\.start\(currentWindow\.id\)/);
  assert.match(source,/taskWorkbench\.navigate\('tools'\)/);
  assert.match(source,/sidebarTools\.openTool\(toolId\)/);
  const host=await readFile('src/ui/sidebar-tools.js','utf8');
  assert.match(host,/active\?\.id===id&&!readOnlyPreview&&!tocSettingsOpen&&frame\?\.isConnected/);
});

test('reviewed prompt rail bridge is pinned for fixed Service Worker only, never arbitrary tool code',()=>{
  const root=process.cwd(),info={renderedLength:15,originalLength:15};
  const bundle=(fileName,path)=>describeBundle({root,lock:{packages:{}},
    chunk:{fileName,modules:{[resolve(root,path)]:info}}});
  const modulePath='examples/sidebar-tools/prompt-shortcuts/trusted/rail-open.js';
  const trusted=bundle('sw.js',modulePath);
  assert.equal(trusted.modules[0].reviewedFirstPartyBlob,'5f0184b28abe5d8e03855f9c130d45faba807d1e');
  assert.throws(()=>bundle('sw.js','examples/sidebar-tools/prompt-shortcuts/trusted/page.js'),
    /Historical\/user\/vendor code cannot enter/);
  assert.throws(()=>bundle('scripting/user-scripts.js',modulePath),
    /Historical\/user\/vendor code cannot enter/);
});
