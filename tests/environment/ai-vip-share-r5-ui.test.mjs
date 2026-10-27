import {settingsReactFixture} from '../helpers/trusted-settings-react-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';
import {createAiAccessPermissionControls} from '../../examples/sidebar-tools/ai-vip-share/trusted/host-controls.js';

function find(node,id){
  if(node.id===id)return node;
  for(const child of node.children||[]){
    const result=find(child,id);if(result)return result;
  }
  return null;
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const tool={id:'ai-vip-share',capabilities:['ai.access']};

test('R5 official tool compiles member, redeem and store UI with canonical design',async t=>{
  const pkg=await createSidebarToolPackage('examples/sidebar-tools/ai-vip-share');
  assert.equal(pkg.id,'ai-vip-share');
  assert.equal(pkg.version,'1.4.2');
  const view=await readFile('examples/sidebar-tools/ai-vip-share/src/App.jsx','utf8');
  const script=await readFile('examples/sidebar-tools/ai-vip-share/src/main.js','utf8');
  assert.equal(pkg.format,'opendesk.sidebar-tool.v2');
  assert.deepEqual(pkg.capabilities,['storage.local','network','browser.tabs','browser.proxy.managed','browser.cookies.write','currentPage.read']);
  assert.match(pkg.css,/opendesk\.shared-design\.v1/);
  for(const text of ['AI 会员','兑换激活','预检激活','查看更多商品','AI 网站访问'])
    assert(view.includes(text),text);
  assert.match(view,/id="ai-vip-redeem-code"[^>]*type="password"[^>]*data-sensitive/);
  assert.match(view,/id="ai-vip-redeem"[^>]*disabled/);
  assert.match(view,/id="ai-vip-shop-open"[^>]*disabled/);
  assert(!view.includes('id="proxy-toggle"'));
  assert.equal(pkg.html.trim(),'<div id="tool-app"></div>');
  assert(!view.includes('1 个月')&&!view.includes('3 个月'));
  assert.match(pkg.js,/OpenDeskPageReact/);
  assert.match(pkg.js,/OpenDeskSidebarUI/);
  assert(!pkg.js.includes('showModal')&&!pkg.js.includes('window.open('));
  assert.match(script,/shopSdk\.create\(\{url:catalog\}\)/);
});

test('R5 existing host shows isolated product and a single trusted proxy card',async t=>{
  const host=await readFile('src/ui/sidebar-tools.js','utf8');
  assert.match(host,/ui:trustedSettingsUI\?\.aiAccess/);
  assert.doesNotMatch(host,/aiProxyContainer/);
  assert.match(host,/legacyAiProxyTool=managed&&id===AI_ID&&active\?\.capabilities\?\.includes\(AI_CAPABILITY\)/);
  assert.match(host,/aiPermissions\?\.render\(active,readOnlyPreview,enabled,Boolean\(legacyAiProxyTool&&enabled&&\(frame\|\|nativeUI\)\)\)/);
  assert(!host.includes('frameRoot.hidden=id===AI_ID'));
  assert.match(host,/const show=managed&&tocSettingsOpen/);
  const css=await readFile('src/ui/tool-shell.css','utf8');
  assert.match(css,/\.sidebar-tool-ai-proxy-native/);
});

test('R5 trusted card uses one genuinely clicked button and no activation field',async t=>{
  const f=settingsReactFixture('aiAccess',t),container=f.root;
  let state={state:'disabled',canStop:false,reason:null};
  const effects=[],notices=[];
  const ui=createAiAccessPermissionControls({api:{},ui:f.ui,
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
  assert.equal(walk(nativeCard).filter(row=>row.tagName==='BUTTON').length,1);
  assert.equal(find(container,'ai-access-activation-code'),null);
  assert.equal(action.textContent,'启用代理');
  assert.equal(action.disabled,false);
  f.invoke(action.id,{isTrusted:false});
  await flush();
  assert.equal(effects.some(row=>row.op==='aiAccess.enable'),false);
  f.invoke(action.id,{isTrusted:true});
  await flush();await flush();
  assert(effects.some(row=>row.op==='aiAccess.enable'&&row.gesture));
  assert.equal(action.textContent,'停用代理');
  f.invoke(action.id,{isTrusted:true});
  await flush();await flush();
  assert(effects.some(row=>row.op==='aiAccess.disable'&&row.gesture));
  assert.equal(action.textContent,'启用代理');
  ui.render(tool,true,true);
  assert.equal(nativeCard.hidden,true);
  assert.equal(notices.length,0);
});

test('R5 conflict never enables proxy, but stops outstanding own intent',async t=>{
  const f=settingsReactFixture('aiAccess',t),container=f.root;
  let state={state:'conflict',canStop:false,reason:'其他扩展管理'};
  const effects=[];
  const ui=createAiAccessPermissionControls({api:{},ui:f.ui,notice:()=>{},
    runOperation:async(op)=>{
      effects.push(op);
      if(op==='aiAccess.disable')state={state:'conflict',canStop:false,reason:'其他扩展管理'};
      return state;
    }});
  ui.render(tool,false,true);await flush();
  const action=find(container,'ai-access-toggle');
  assert.equal(action.disabled,true);
  f.invoke(action.id,{isTrusted:true});await flush();
  assert.deepEqual(effects,['aiAccess.status']);
  state={state:'conflict',canStop:true,reason:'其他扩展管理'};
  await ui.refresh();
  assert.equal(action.disabled,false);
  assert.equal(action.textContent,'停用代理');
  f.invoke(action.id,{isTrusted:true});await flush();await flush();
  assert(effects.includes('aiAccess.disable'));
  assert(!effects.includes('aiAccess.enable'));
  assert.equal(action.disabled,true);
});

test('R5 no Provider, SKU or shop can invent business success',async t=>{
  const html=await readFile('examples/sidebar-tools/ai-vip-share/src/App.jsx','utf8');
  const script=await readFile('examples/sidebar-tools/ai-vip-share/src/main.js','utf8');
  assert.match(html,/暂无法查询账号与会员权益/);
  assert.match(html,/会员服务接入后可使用激活码/);
  assert.doesNotMatch(html,/id="ai-vip-remaining">—|id="ai-vip-remaining-unit">待核验/);
  assert.doesNotMatch(html,/专属激活链接与安装续接|功能与接入状态|本地开发|ai-vip-local-connect|<h1\b/);
  assert.match(script,/const ACTIVATION_URLS=Object\.freeze\(\[\]\)/);
  assert.match(script,/const APPROVED_PROXY_ENDPOINT=null/);
  assert.match(script,/PRODUCT_CATALOG_URL=''/);
  assert.match(script,/shopSdk\.create\(\{url:catalog\}\)/);
  assert(!/fetch\(|showModal\(|window\.open\(/.test(script));
  assert(!/aiAccess\.activate|aiAccess\.enable|chrome\.proxy/.test(script));
});

test('R5.1 STOP is clickable while ENABLE is pending and ignores its late ack',async t=>{
  const f=settingsReactFixture('aiAccess',t),container=f.root,calls=[];
  let finishEnable;
  const disabled={state:'disabled',canStop:false,reason:null};
  const ui=createAiAccessPermissionControls({
    api:{},ui:f.ui,notice:()=>{},
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
  f.invoke(action.id,{isTrusted:true});await flush();
  assert.equal(action.textContent,'停用代理');
  assert.equal(action.disabled,false);
  f.invoke(action.id,{isTrusted:true});await flush();await flush();
  assert.equal(calls.filter(row=>row.operation==='aiAccess.disable').length,1);
  assert.equal(action.textContent,'启用代理');
  assert.equal(action.disabled,false);
  finishEnable();await flush();await flush();
  assert.equal(action.textContent,'启用代理');
  assert(!calls.some(row=>row.operation==='aiAccess.disable'&&!row.trusted));
});
