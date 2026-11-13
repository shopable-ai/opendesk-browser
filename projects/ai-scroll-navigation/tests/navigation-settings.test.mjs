import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {flushSync} from 'react-dom';
import {createExtensionCenterDOM} from '../../../tests/helpers/extension-center-react-dom.mjs';

// Exercise the actual shared Switch and business manager. Native browser
// input is checked separately; fixture isTrusted only tests the save guard.
const compiled=await build({entryPoints:[fileURLToPath(new URL('../trusted/react-controls.tsx',import.meta.url))],
  bundle:true,write:false,packages:'external',format:'esm',loader:{'.css':'text'}});
let code=compiled.outputFiles[0].text;
for(const name of ['react','react-dom','react-aria-components'])
  code=code.replaceAll(JSON.stringify(name),JSON.stringify(import.meta.resolve(name)));
const {ScrollSiteManager}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const settle=async()=>{await new Promise(resolve=>setImmediate(resolve));
  await new Promise(resolve=>setImmediate(resolve));};
const initial={regionTop:true,regionBottom:true,conversationTop:true,conversationBottom:true,
  turnPaging:true,showTurnCount:false,floatingTop:true};
const labels={regionTop:'回到回复顶部',regionBottom:'跳到回复底部',conversationTop:'回到对话顶部',
  conversationBottom:'跳到对话底部',turnPaging:'按对话轮次翻页',showTurnCount:'显示轮次数字',floatingTop:'滚动后悬浮回顶'};

async function fixture(t,{save}={}){
  let stored={value:{version:1,sites:[],navigation:{...initial}},etag:'initial'},navigation;
  const writes=[];
  const model={identityKey:'settings-installation',turnPagingSupported:true,showTurnCountSupported:true,
    onRead:async()=>structuredClone(stored),onDraftChange(){},
    async onSaveNavigation(flags,etag,event){
      writes.push({flags,etag,event});
      assert.equal(event.isTrusted,true);assert.equal(etag,stored.etag);
      if(save)return save(flags,etag,event);
      stored={value:{...stored.value,navigation:structuredClone(flags)},etag:'saved-'+writes.length};
      return structuredClone(stored);
    }};
  const f=createExtensionCenterDOM(t,{component:ScrollSiteManager,
    props:{model,onNavigation:value=>{navigation=value;}}});
  await settle();navigation.openSettings();await settle();
  const toggle=key=>f.doc.querySelector('input[aria-label="'+labels[key]+'"]');
  // Linkedom lacks native checkbox activation and React's change plugin.
  // Supply that change to the real React Aria input handler after capture.
  // Actual pointer/Space activation is covered by the browser checks.
  const click=(key,trusted=true)=>{
    const node=toggle(key);if(node.disabled)return;
    node.dispatch('click',{isTrusted:trusted});
    node.checked=!node.checked;
    const props=node[Object.keys(node).find(key=>key.startsWith('__reactProps$'))];
    flushSync(()=>props.onChange({target:node,stopPropagation(){}}));
  };
  return {...f,toggle,click,writes,get stored(){return structuredClone(stored);}};
}

test('each of seven switches saves its value while retaining the other flags and restores after reread',async t=>{
  const f=await fixture(t),expected={...initial};
  for(const key of Object.keys(initial)){
    const label=f.doc.querySelector('label[for="'+f.toggle(key).id+'"]');
    assert.equal(label?.textContent,labels[key],'visible setting text labels the actual switch');
    expected[key]=!expected[key];f.click(key);await settle();
    assert.equal(f.writes.length,Object.keys(initial).indexOf(key)+1,key);
    assert.deepEqual(f.stored.value.navigation,expected,key);
    assert.equal(f.toggle(key).checked,expected[key],key);
  }
  assert.equal(f.doc.querySelector('.ec-scroll-content [role="status"]'),null,
    'success is outside the scrollable settings content');
  const receipt=f.doc.querySelector('.ec-scroll-actionbar [role="status"]');
  assert.match(receipt.textContent,/已保存并读回/);
  f.state.model={...f.state.model,identityKey:'reopened-settings'};f.paint();await settle();
  for(const key of Object.keys(initial))assert.equal(f.toggle(key).checked,expected[key],key);
});

test('synthetic switch input does not write navigation settings',async t=>{
  const f=await fixture(t);f.click('regionTop',false);await settle();
  assert.equal(f.writes.length,0);assert.deepEqual(f.stored.value.navigation,initial);
});

test('pending and unknown saves stay visible, preserve stored settings and prevent another write',async t=>{
  let fail;
  const f=await fixture(t,{save:()=>new Promise((_,reject)=>{fail=reject;})});
  f.click('floatingTop');await settle();
  assert.match(f.doc.querySelector('.ec-scroll-actionbar [role="status"]').textContent,/处理/);
  assert.ok(Object.keys(labels).every(key=>f.toggle(key).disabled));
  fail(Object.assign(Error('receipt lost'),{code:'E_CONFIG_UNKNOWN'}));await settle();
  assert.match(f.doc.querySelector('.ec-scroll-actionbar [role="alert"]').textContent,/E_CONFIG_UNKNOWN/);
  assert.deepEqual(f.stored.value.navigation,initial);
  assert.ok(Object.keys(labels).every(key=>f.toggle(key).disabled));
  assert.ok([...f.doc.querySelectorAll('button')].some(node=>node.textContent.includes('重新读取')));
  f.click('regionTop');await settle();assert.equal(f.writes.length,1);
});
