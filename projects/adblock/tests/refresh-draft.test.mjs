import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import * as React from 'react';
import * as jsx from 'react/jsx-runtime';
import {confirmedSiteWrite} from '../src/model.js';

const bundle=await readFile(new URL('../dist/tool.js',import.meta.url),'utf8');
const status=(host='a.example')=>({enabled:true,exceptions:[],toolEnabled:true,
  permissions:{dnr:true},rules:{verified:true},currentHost:host,
  currentSite:{status:host?'ready':'navigating'},cosmeticRules:[]});
const simple=tag=>({children,variant,label,isSelected,isDisabled,...props})=>React.createElement(tag,
  {...props,...(isDisabled?{disabled:true}:{}),...(label?{'aria-label':label}:{})},children);
const Switch=({isDisabled,isSelected,onChange,...props})=>React.createElement('button',{
  ...props,role:'switch',disabled:isDisabled,'aria-checked':isSelected,onClick:()=>onChange(!isSelected)
});
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};};

async function fixture(t,request,ui){
  const {window}=new JSDOM('<main><div id="tool-app"></div></main>',{runScripts:'outside-only'});
  const previous={window:globalThis.window,document:globalThis.document,IS_REACT_ACT_ENVIRONMENT:globalThis.IS_REACT_ACT_ENVIRONMENT};
  Object.assign(globalThis,{window,document:window.document,IS_REACT_ACT_ENVIRONMENT:true});
  const {createRoot}=await import('react-dom/client');
  t.after(async()=>{
    await React.act(()=>window.dispatchEvent(new window.Event('pagehide')));
    window.close();Object.assign(globalThis,previous);
  });
  const root=window.document.querySelector('main');
  window.OpenDeskPageReact={...React,...jsx,createRoot};
  window.OpenDeskSidebarUI={Card:simple('div'),CardContent:simple('div'),Switch,
    Button:simple('button'),IconButton:simple('button')};
  window.OpenDeskTool={root,request,ui};
  const button=label=>[...root.querySelectorAll('button')].find(el=>el.textContent.includes(label));
  const navigate=(event='opendesk-page-changed')=>root.dispatchEvent(new window.Event(event));
  const typeSelector=input=>{
    input.closest('details').open=true;input.focus();
    const set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
    set.call(input,'.ad-banner');
    input.dispatchEvent(new window.Event('input',{bubbles:true}));
  };
  await React.act(()=>window.eval(bundle));
  return {window,root,button,navigate,typeSelector};
}

test('site rules preserve the draft and focus, invalidate matching, and never write on refresh',async t=>{
  const save=deferred();
  let current=status(),reads=0,checks=0,writes=0,lastRead;
  const {window,root,button,navigate,typeSelector}=await fixture(t,async(op,payload)=>{
    if(op==='adblock.status'){reads++;return lastRead||current;}
    if(op==='adblock.cosmetic.inspect')return {inspection:[]};
    if(op==='adblock.cosmetic.check'){
      checks++;return {...current,inspection:[{selector:payload.selector,matches:1,visible:true}]};
    }
    if(op==='adblock.cosmetic.add'){
      writes++;return save.promise;
    }
    assert.fail('Unexpected Host request '+op);
  });
  await React.act(()=>button('已屏蔽').click());
  const input=root.querySelector('#adblock-selector-input');
  await React.act(()=>typeSelector(input));
  await React.act(()=>button('检查匹配 · 高亮').click());
  assert.equal(button('添加规则').disabled,false);
  let finish;
  lastRead=new Promise(resolve=>{finish=resolve;});
  await React.act(navigate);
  assert.equal(root.querySelector('#adblock-selector-input'),input);
  assert.equal(window.document.activeElement,input);
  assert.equal(input.value,'.ad-banner');
  assert.equal(input.readOnly,true);
  assert.equal(button('添加规则').disabled,true);
  assert.equal(checks,1);
  await React.act(()=>{finish(status(null));lastRead=null;});
  current=status('b.example');await React.act(navigate);
  assert.equal(input.readOnly,true);
  assert.match(root.textContent,/草稿属于 a.example/);
  assert.equal(button('检查匹配 · 高亮').disabled,true);
  current=status();await React.act(navigate);
  assert.equal(input.value,'.ad-banner');
  assert.equal(input.readOnly,false);
  assert.equal(button('添加规则').disabled,true,'a new document needs its own check');
  await React.act(()=>button('检查匹配 · 高亮').click());
  await React.act(()=>button('添加规则').click());
  const readsBefore=reads;
  current=status('b.example');
  await React.act(navigate);
  assert.equal(reads>readsBefore,true);
  await React.act(()=>save.reject(Object.assign(Error('保存结果未知，请核对规则'),{code:'E_OUTCOME_UNKNOWN'})));
  assert.equal(writes,1,'navigation only reads state');
  assert.match(root.textContent,/a[.]example · [.]ad-banner：结果未确认：保存结果未知/);
  assert.equal(input.value,'.ad-banner','unknown receipt must not clear the submitted draft');
});

test('a delayed selector save keeps its original receipt while the new site can be read',async t=>{
  const save=deferred(),newRead=deferred();
  const notifications=[];
  let current=status(),heldRead,inspected=[],writes=[];
  const {root,button,navigate,typeSelector}=await fixture(t,async(op,payload)=>{
    if(op==='adblock.status')return heldRead??current;
    if(op==='adblock.cosmetic.inspect'){inspected.push(payload.host);return {inspection:[]};}
    if(op==='adblock.cosmetic.check')return {...current,inspection:[{selector:payload.selector,matches:1,visible:true}]};
    if(op==='adblock.cosmetic.add'){writes.push(payload.host);return save.promise;}
    assert.fail('Unexpected Host request '+op);
  },{notify:notice=>notifications.push(notice)});
  await React.act(()=>button('已屏蔽').click());
  const input=root.querySelector('#adblock-selector-input');
  await React.act(()=>typeSelector(input));
  await React.act(()=>button('检查匹配 · 高亮').click());
  await React.act(()=>{button('添加规则').click();button('添加规则').click();});
  assert.deepEqual(writes,['a.example']);

  heldRead=newRead.promise;
  await React.act(()=>navigate());
  assert.equal(input.readOnly,true);
  assert.match(root.textContent,/正在确认当前网站，草稿已保留/);
  current={...status('b.example'),cosmeticRules:[{selector:'#sponsor'}]};
  await React.act(()=>{heldRead=null;newRead.resolve(current);});
  assert.match(root.textContent,/#sponsor/,'new site rules appear before write settles');
  assert.equal(inspected.at(-1),'b.example','new site can inspect rules while the write is held');
  assert.equal(button('添加规则').disabled,true);

  await React.act(()=>save.resolve({...status(),cosmeticRules:[{selector:'.ad-banner'}]}));
  assert.match(root.textContent,/a[.]example · [.]ad-banner：高级屏蔽规则已保存并读回确认/);
  assert.equal(notifications[0]?.message,'a.example · .ad-banner：高级屏蔽规则已保存并读回确认。');
  assert.match(root.textContent,/#sponsor/);
  assert.equal(root.querySelector('[title=".ad-banner"]'),null,'old selector did not become a new-site rule');
  assert.equal(input.value,'','clear the submitted draft after its save was confirmed');
  assert.deepEqual(writes,['a.example']);
});

test('late site toggle receipt survives a new site read and permission loss',async t=>{
  const save=deferred();
  let current=status(),writes=[];
  const {root,navigate}=await fixture(t,async(op,payload)=>{
    if(op==='adblock.status')return current;
    if(op==='adblock.site.set'){writes.push({...payload});return save.promise;}
    assert.fail('Unexpected Host request '+op);
  });
  const siteSwitch=()=>root.querySelector('[aria-label="当前网站广告过滤"]');
  await React.act(()=>siteSwitch().click());
  current={...status('b.example'),permissions:{dnr:false}};
  await React.act(()=>navigate('opendesk-tool-state-changed'));
  assert.match(root.textContent,/b[.]example/);
  assert.equal(siteSwitch().disabled,true);
  // An accepted prior write can report the new active tab along with the global exception list.
  await React.act(()=>save.resolve({...status('b.example'),exceptions:['a.example']}));
  assert.match(root.textContent,/a[.]example：过滤设置已由 Chrome 确认/);
  assert.match(root.textContent,/b[.]example/);
  assert.equal(siteSwitch().disabled,true,'a verified old receipt must not restore permission');
  assert.deepEqual(writes,[{host:'a.example',filtering:false}]);
});

test('selector write receipts prove the requested host and final selector state',()=>{
  const target={host:'a.example',selector:'.ad-banner',oldSelector:'#sponsor'};
  const applied={...status(),cosmeticRules:[{selector:target.selector}]};
  const replaced=result=>confirmedSiteWrite(result,'adblock.cosmetic.replace',target);
  assert.equal(replaced(applied),true);
  assert.equal(replaced({...applied,cosmeticRules:[...applied.cosmeticRules,{selector:target.oldSelector}]}),false);
  assert.equal(replaced({...applied,currentHost:'b.example'}),false);
  assert.equal(replaced({...applied,permissions:{dnr:false}}),false);
  const restored=result=>confirmedSiteWrite(result,'adblock.cosmetic.restore',target);
  assert.equal(restored(status()),true);
  assert.equal(restored(applied),false);
  assert.equal(restored({...status(),cosmeticError:'readback failed'}),false);
});
