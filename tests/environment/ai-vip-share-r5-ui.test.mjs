import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';
import {createAiAccessPermissionControls} from '../../src/ai-smart-access/host-controls.js';

function element(tag){
  return {tag,children:[],attributes:{},listeners:{},hidden:false,disabled:false,
    append(...nodes){this.children.push(...nodes);},
    setAttribute(name,value){this.attributes[name]=value;},
    addEventListener(name,handler){this.listeners[name]=handler;}
  };
}
function find(node,id){
  if(node.id===id)return node;
  for(const child of node.children||[]){
    const result=find(child,id);if(result)return result;
  }
  return null;
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const tool={id:'ai-vip-share',capabilities:['ai.access']};

test('R5 official tool compiles member, redeem and store UI with canonical design',async()=>{
  const pkg=await createSidebarToolPackage('examples/sidebar-tools/ai-vip-share');
  assert.equal(pkg.id,'ai-vip-share');
  assert.equal(pkg.version,'1.3.2');
  assert.equal(pkg.format,'opendesk.sidebar-tool.v2');
  assert.deepEqual(pkg.capabilities,['storage.local','network','browser.tabs','browser.proxy.managed']);
  assert.match(pkg.css,/opendesk\.shared-design\.v1/);
  for(const text of ['AI 会员','兑换激活','预检兑换','查看更多商品','待核验'])
    assert(pkg.html.includes(text),text);
  assert.match(pkg.html,/id="ai-vip-redeem-code"[^>]*type="password"[^>]*data-sensitive/);
  assert.match(pkg.html,/id="ai-vip-redeem"[^>]*disabled/);
  assert.match(pkg.html,/id="ai-vip-shop-open"[^>]*disabled/);
  assert(!pkg.html.includes('id="proxy-toggle"'));
  assert(!pkg.html.includes('1 个月')&&!pkg.html.includes('3 个月'));
  assert(!pkg.js.includes('showModal')&&!pkg.js.includes('window.open('));
  assert.match(pkg.js,/shopSdk\.create\(\{url:catalog\}\)/);
});

test('R5 existing host shows isolated product and a single trusted proxy card',async()=>{
  const host=await readFile('src/ui/sidebar-tools.js','utf8');
  assert.match(host,/frameRoot\.after\?\.\(aiProxyContainer\)/);
  assert.match(host,/container:aiProxyContainer/);
  assert.match(host,/legacyAiProxyTool=managed&&id===AI_ID&&active\?\.capabilities\?\.includes\(AI_CAPABILITY\)/);
  assert.match(host,/aiProxyContainer\.hidden=!\(legacyAiProxyTool&&enabled&&\(frame\|\|nativeUI\)\)/);
  assert(!host.includes('frameRoot.hidden=id===AI_ID'));
  assert.match(host,/const show=managed&&tocSettingsOpen/);
  const css=await readFile('src/ui/tool-shell.css','utf8');
  assert.match(css,/\.sidebar-tool-ai-proxy-native/);
});

test('R5 trusted card uses one genuinely clicked button and no activation field',async()=>{
  const container=element('div'),doc={createElement:element};
  let state={state:'disabled',canStop:false,reason:null};
  const effects=[],notices=[];
  const ui=createAiAccessPermissionControls({api:{},doc,container,
    notice:(...args)=>notices.push(args),
    runOperation:async(op,_payload,event)=>{
      effects.push({op,gesture:event?.isTrusted===true});
      if(op==='aiAccess.enable')state={state:'enabled',canStop:true,reason:null};
      if(op==='aiAccess.disable')state={state:'disabled',canStop:false,reason:null};
      return {...state};
    }});
  ui.render(tool,false,true);
  await flush();
  const nativeCard=find(container,'ai-access-trusted-controls');
  const action=find(container,'ai-access-toggle');
  const walk=node=>[node,...(node.children||[]).flatMap(walk)];
  assert.equal(walk(nativeCard).filter(row=>row.tag==='button').length,1);
  assert.equal(find(container,'ai-access-activation-code'),null);
  assert.equal(action.textContent,'启用代理');
  assert.equal(action.disabled,false);
  action.listeners.click({isTrusted:false});
  await flush();
  assert.equal(effects.some(row=>row.op==='aiAccess.enable'),false);
  action.listeners.click({isTrusted:true});
  await flush();await flush();
  assert(effects.some(row=>row.op==='aiAccess.enable'&&row.gesture));
  assert.equal(action.textContent,'停用代理');
  action.listeners.click({isTrusted:true});
  await flush();await flush();
  assert(effects.some(row=>row.op==='aiAccess.disable'&&row.gesture));
  assert.equal(action.textContent,'启用代理');
  ui.render(tool,true,true);
  assert.equal(nativeCard.hidden,true);
  assert.equal(notices.length,0);
});

test('R5 conflict never enables proxy, but stops outstanding own intent',async()=>{
  const container=element('div');
  let state={state:'conflict',canStop:false,reason:'其他扩展管理'};
  const effects=[];
  const ui=createAiAccessPermissionControls({api:{},doc:{createElement:element},
    container,notice:()=>{},
    runOperation:async(op)=>{
      effects.push(op);
      if(op==='aiAccess.disable')state={state:'conflict',canStop:false,reason:'其他扩展管理'};
      return state;
    }});
  ui.render(tool,false,true);await flush();
  const action=find(container,'ai-access-toggle');
  assert.equal(action.disabled,true);
  action.listeners.click({isTrusted:true});await flush();
  assert.deepEqual(effects,['aiAccess.status']);
  state={state:'conflict',canStop:true,reason:'其他扩展管理'};
  await ui.refresh();
  assert.equal(action.disabled,false);
  assert.equal(action.textContent,'停用代理');
  action.listeners.click({isTrusted:true});await flush();await flush();
  assert(effects.includes('aiAccess.disable'));
  assert(!effects.includes('aiAccess.enable'));
  assert.equal(action.disabled,true);
});

test('R5 no Provider, SKU or shop can invent business success',async()=>{
  const html=await readFile('examples/sidebar-tools/ai-vip-share/src/index.html','utf8');
  const script=await readFile('examples/sidebar-tools/ai-vip-share/src/main.js','utf8');
  assert.match(html,/会员服务尚未配置/);
  assert.match(html,/兑换服务未配置/);
  assert.match(html,/专属激活链接续接尚未接入正式安装与服务验证流程/);
  assert.match(script,/PRODUCT_CATALOG_URL=''/);
  assert.match(script,/shopSdk\.create\(\{url:catalog\}\)/);
  assert(!/fetch\(|showModal\(|window\.open\(/.test(script));
  assert(!/aiAccess\.activate|aiAccess\.enable|chrome\.proxy/.test(script));
});

test('R5.1 STOP is clickable while ENABLE is pending and ignores its late ack',async()=>{
  const container=element('div'),calls=[];
  let finishEnable;
  const disabled={state:'disabled',canStop:false,reason:null};
  const ui=createAiAccessPermissionControls({
    api:{},doc:{createElement:element},container,notice:()=>{},
    runOperation:(operation,_payload,event)=>{
      calls.push({operation,trusted:event?.isTrusted===true});
      if(operation==='aiAccess.status')return Promise.resolve(disabled);
      if(operation==='aiAccess.enable')return new Promise(resolve=>{
        finishEnable=()=>resolve({state:'enabled',canStop:true,reason:null});
      });
      if(operation==='aiAccess.disable')return Promise.resolve(disabled);
      throw Error('Unexpected operation');
    }
  });
  ui.render(tool,false,true);
  await flush();
  const action=find(container,'ai-access-toggle');
  action.listeners.click({isTrusted:true});await flush();
  assert.equal(action.textContent,'停用代理');
  assert.equal(action.disabled,false);
  action.listeners.click({isTrusted:true});await flush();await flush();
  assert.equal(calls.filter(row=>row.operation==='aiAccess.disable').length,1);
  assert.equal(action.textContent,'启用代理');
  assert.equal(action.disabled,false);
  finishEnable();await flush();await flush();
  assert.equal(action.textContent,'启用代理');
  assert(!calls.some(row=>row.operation==='aiAccess.disable'&&!row.trusted));
});
