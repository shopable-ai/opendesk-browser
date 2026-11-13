import test from 'node:test';
import assert from 'node:assert/strict';
import {createExtensionCenterDOM} from '../helpers/extension-center-react-dom.mjs';

test('default extension notice stages settings, read-only check and explicit continuation',t=>{
  const calls=[];
  const f=createExtensionCenterDOM(t,{props:{preinstallModel:{state:'user-scripts-required',
    technical:'E_USER_SCRIPTS_UNAVAILABLE <img src=x>'},
    onPreinstallAction:(action,event)=>calls.push({action,event})}});
  const card=()=>f.doc.getElementById('extension-center-preinstall');
  const action=()=>card().querySelector('button');
  assert.ok(card().compareDocumentPosition(f.doc.getElementById('extension-center-list'))&4);
  assert.equal(card().querySelectorAll('p').length,1);
  assert.equal(card().querySelector('details'),null);
  assert.equal(card().textContent.includes('E_USER_SCRIPTS'),false,'diagnostics stay out of the index');
  assert.equal(card().querySelectorAll('button').length,2,'one main action and info');
  assert.equal(action().getAttribute('aria-label'),'打开扩展设置');
  assert.equal(action().getAttribute('title'),'打开扩展设置');
  assert.ok(action().classList.contains('od-icon-button'));
  assert.equal(action().textContent,'');action().dispatch('click');
  assert.equal(action().textContent,'重新检测');action().dispatch('click');
  assert.deepEqual(calls.map(x=>x.action),['settings','check']);
  assert.ok(calls.every(x=>x.event instanceof f.window.Event));
  f.state.preinstallModel={state:'checking'};f.paint();
  assert.equal(card().getAttribute('aria-busy'),'true');assert.equal(action().disabled,true);
  f.state.preinstallModel={state:'available'};f.paint();
  assert.deepEqual(calls.map(x=>x.action),['settings','check'],'availability never submits automatically');
  assert.equal(action().textContent,'继续安装');action().dispatch('click');
  assert.equal(calls.at(-1).action,'resume');
  f.state.preinstallModel={state:'attention'};f.paint();
  assert.equal(card().querySelectorAll('button').length,1,'unknown outcomes offer info only, never replay');
  f.state.preinstallModel=null;f.paint();assert.equal(card(),null);
});

test('default extension help preserves the list and returns scroll, filters and focus',t=>{
  const f=createExtensionCenterDOM(t,{props:{toolbarModel:{query:'我的搜索',scope:'installed',kind:'page'},
    preinstallModel:{state:'user-scripts-required',technical:'<img src=x> E_USER_SCRIPTS_UNAVAILABLE'}}});
  const list=f.doc.getElementById('extension-center-list-view');
  const search=f.doc.getElementById('extension-center-search');
  const scroll=f.doc.getElementById('workspace-content');scroll.scrollTop=126;
  const info=f.doc.getElementById('extension-preinstall-info');info.focus();info.dispatch('click');
  const help=f.doc.getElementById('extension-preinstall-explanation');
  assert.ok(help);assert.equal(list.hidden,true);
  assert.equal(f.doc.activeElement.id,'extension-preinstall-help-title');
  assert.equal(help.querySelector('img'),null,'diagnostics are literal text');
  assert.ok(help.textContent.includes('<img src=x>'));
  assert.equal(help.querySelectorAll('ol li').length,3);
  scroll.scrollTop=0;
  f.doc.dispatch('keydown',{key:'Escape'});
  assert.equal(f.doc.getElementById('extension-preinstall-explanation'),null);
  assert.equal(f.doc.getElementById('extension-center-search'),search);
  assert.equal(search.value,'我的搜索');assert.equal(f.state.toolbarModel.scope,'installed');
  assert.equal(f.state.toolbarModel.kind,'page');assert.equal(scroll.scrollTop,126);
  assert.equal(f.doc.activeElement,info);
  info.dispatch('click');f.doc.querySelector('#extension-preinstall-explanation button').dispatch('click');
  assert.equal(list.hidden,false);assert.equal(f.doc.activeElement,info);
});

for(const [language,check] of [['zh-CN','重新检测'],['en','Check again'],['ja','再確認'],['zh-TW','重新偵測']])
  test(`default extension recovery follows ${language} and keeps settings failures actionable`,t=>{
    const {doc}=createExtensionCenterDOM(t,{props:{toolbarModel:{language},
      preinstallModel:{state:'check-error',settingsFailed:true,technical:'E_USER_SCRIPTS_NATIVE'}}});
    const card=doc.getElementById('extension-center-preinstall');
    assert.equal(card.querySelector('button').textContent,check);
    doc.getElementById('extension-preinstall-info').dispatch('click');
    const help=doc.getElementById('extension-preinstall-explanation');
    assert.ok(help.querySelector('[role="alert"]').textContent.includes('OpenDesk Browser'));
    assert.equal(help.querySelector('details').hasAttribute('open'),false);
  });


test('hidden default extension help cannot consume Escape or move another view scroll',t=>{
  const f=createExtensionCenterDOM(t,{props:{preinstallModel:{state:'user-scripts-required'}}});
  const scroll=f.doc.getElementById('workspace-content');scroll.scrollTop=24;
  f.doc.getElementById('extension-preinstall-info').dispatch('click');
  f.doc.getElementById('opendesk-react-app').hidden=true;scroll.scrollTop=280;
  const event=f.doc.dispatch('keydown',{key:'Escape'});
  assert.equal(event.defaultPrevented,false);
  assert.ok(f.doc.getElementById('extension-preinstall-explanation'));
  assert.equal(scroll.scrollTop,280);
});

test('default extension action focus continues through busy, attention and completion',async t=>{
  const f=createExtensionCenterDOM(t,{props:{preinstallModel:{state:'available'}}});
  const action=()=>f.doc.querySelector('#extension-center-preinstall .od-button');
  action().focus();f.state.preinstallModel={state:'resuming'};f.paint();
  assert.equal(f.doc.activeElement.id,'extension-preinstall-info');
  f.state.preinstallModel={state:'attention'};f.paint();
  assert.equal(f.doc.activeElement.id,'extension-preinstall-info');
  f.state.preinstallModel={state:'available'};f.paint();action().focus();
  f.state.preinstallModel=null;f.paint();await Promise.resolve();
  assert.equal(f.doc.activeElement.id,'extension-center-search');
  f.state.preinstallModel={state:'available'};f.paint();
  f.doc.getElementById('extension-preinstall-info').dispatch('click');
  f.doc.querySelector('#extension-preinstall-explanation .od-button').focus();
  f.state.preinstallModel={state:'attention'};f.paint();await Promise.resolve();
  assert.equal(f.doc.activeElement.id,'extension-preinstall-help-title');
});
