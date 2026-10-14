import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {createSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';
import {BROWSER_OPERATIONS} from '../../src/framework/sdk/browser-contract.js';
import {createBrowserSdk} from '../../src/framework/sdk/browser.js';

const project=new URL('../../examples/sidebar-tools/browser-sdk-acceptance/',import.meta.url);
const tool=await createSidebarToolPackage(project.pathname);

test('R10.7 actual installed package admits every public capability but still has no trusted Host-only method',()=>{
  assert.equal(tool.format,'opendesk.sidebar-tool.v2');
  assert.equal(tool.requires.browserSdk,'1.0.0');
  const required=new Set(Object.values(BROWSER_OPERATIONS).flatMap(row=>row.requiredCapabilities));
  for(const capability of required)
    assert(tool.capabilities.includes(capability),'Acceptance tool missing '+capability);
  assert(tool.contributes.contextMenus.some(menu=>menu.actionId==='sdk-check'));
  assert(!tool.js.includes('chrome.runtime.sendMessage('));
  assert(!tool.js.includes('Runtime.evaluate'));
  assert(!tool.js.includes('browser.history.searchTrusted'));
  assert(!tool.js.includes('browser.permissions.requestForTool'));
});

function fixture(){
  const ids=[...tool.html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]);
  const nodes=new Map(ids.map(id=>[id,{
    id,value:'',disabled:false,textContent:'',dataset:{},children:[],listeners:new Map(),
    addEventListener(name,callback){this.listeners.set(name,callback);},
    replaceChildren(){this.children=[];this.value='';},
    appendChild(child){this.children.push(child);if(this.children.length===1)this.value=child.value;}
  }]));
  nodes.get('demo-url').value='http://127.0.0.1:43111/demo-form.html';
  const root={
    querySelector(selector){return nodes.get(selector.slice(1));},
    querySelectorAll(selector){return selector==='button'?ids.map(id=>nodes.get(id)):[];}
  };
  const calls=[];
  const sdk=createBrowserSdk({request:async (operation,args)=>{
    calls.push({operation,args});
    if(operation==='browser.capabilities.list')return Object.values(BROWSER_OPERATIONS).map(row=>({
      operation:row.operation,status:{callableNow:true,reasonCode:null}
    }));
    if(operation==='browser.cookies.get')return {name:'sid',value:'sensitive-cookie-value'};
    return {operation,confirmed:true};
  }});
  runInNewContext(tool.js,{OpenDeskTool:{root,setState(){}},OpenDeskSDK:{browser:sdk},
    document:{createElement(){return {value:'',textContent:''};}},URL},{timeout:1000});
  return {nodes,calls};
}
async function ready(){
  const f=fixture();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.nodes.get('contract-operation').children.length,Object.keys(BROWSER_OPERATIONS).length);
  return f;
}
async function invoke(f,operation,args){
  f.nodes.get('contract-operation').value=operation;
  f.nodes.get('contract-arguments').value=JSON.stringify(args);
  await f.nodes.get('contract-run').listeners.get('click')();
  return JSON.parse(f.nodes.get('contract-output').textContent);
}

test('R10.7 installed UI real SDK wrapper call reports receipt but never claims Chrome PASS',async()=>{
  const f=await ready();
  const returned=await invoke(f,'browser.tabs.create',{url:'https://example.org/acceptance'});
  assert.equal(returned.outcome,'SDK_RETURNED_NATIVE_NOT_VERIFIED');
  assert.equal(returned.receipt.confirmed,true);
  assert.equal(f.calls.at(-1).operation,'browser.tabs.create');
  assert.equal(f.calls.at(-1).args.url,'https://example.org/acceptance');
  const clipboard=await invoke(f,'browser.clipboard.writeText',{text:'small fixture'});
  assert.equal(clipboard.outcome,'SDK_RETURNED_NATIVE_NOT_VERIFIED');
  assert.equal(f.calls.at(-1).operation,'browser.clipboard.writeText');
  assert.equal(f.calls.at(-1).args.text,'small fixture');
  const secret=await invoke(f,'browser.cookies.get',{url:'https://example.org/',name:'sid'});
  assert.equal(secret.receipt.value,'[REDACTED]');
  assert(!f.nodes.get('contract-output').textContent.includes('sensitive-cookie-value'));
});

test('R10.7 UI cannot dispatch unregistered, malformed or unsafe URL calls to request',async()=>{
  const f=await ready();
  const before=f.calls.length;
  const forged=await invoke(f,'browser.history.searchTrusted',{});
  assert.equal(forged.outcome,'REJECTED');
  assert.equal(forged.code,'E_OPERATION');
  const unsafe=await invoke(f,'browser.tabs.create',{url:'javascript:alert(1)'});
  assert.equal(unsafe.outcome,'REJECTED');
  assert.equal(unsafe.code,'E_SCHEMA');
  assert.equal(f.calls.length,before,'Neither request reached the SDK Host callback');
});
