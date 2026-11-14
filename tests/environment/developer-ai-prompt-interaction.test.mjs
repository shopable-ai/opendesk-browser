import test from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import {JSDOM} from 'jsdom';
import {loadSidebarReact} from '../helpers/sidebar-react-fixture.mjs';
import {createDeveloperAIPrompt} from '../../src/ui/developer-ai-prompt.js';
import {translateUiText} from '../../src/i18n/strings.js';

test('development prompt copy preserves business state, recovers failures and fences stale receipts',async t=>{
  const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
  const {window}=dom,{document}=window;
  const globals={window,document,Element:window.Element,HTMLElement:window.HTMLElement,
    SVGElement:window.SVGElement,Node:window.Node,HTMLInputElement:window.HTMLInputElement,
    HTMLTextAreaElement:window.HTMLTextAreaElement,IS_REACT_ACT_ENVIRONMENT:true,navigator:{userAgent:'jsdom',clipboard:{}}};
  const prior=new Map(Object.keys(globals).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const [key,value] of Object.entries(globals))Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
  const [{createRoot},{DeveloperPage,createDeveloperView,createSidebarToolsView}]=await Promise.all([
    import('react-dom/client'),loadSidebarReact()
  ]);
  let root=createRoot(document.getElementById('root'));
  const view=createDeveloperView(),notices=createSidebarToolsView();
  const actions=[];
  for(const id of Object.keys(view.fields))view.actions[id]=()=>actions.push(id);
  const errors=[];window.addEventListener('error',event=>errors.push(event.error));
  t.after(async()=>{
    await React.act(async()=>root.unmount());
    assert.deepEqual(errors,[]);
    assert.equal(view.resourceSnapshot().subscriptions,0);
    view.dispose();notices.dispose();window.close();
    for(const [key,descriptor] of prior){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
  });
  let locale='zh-CN',hidden=false;
  const render=()=>root.render(React.createElement(DeveloperPage,{view,noticeView:notices,locale,hidden}));
  const patch=(id,values)=>React.act(async()=>view.patch(id,values));
  await React.act(async()=>{
    view.patch('script-source',{value:'secret source token'});
    view.patch('script-params',{value:'{"secret":"private"}'});
    view.patch('script-status',{textContent:'原运行状态',data:{state:'running'}});
    render();
  });
  const button=()=>document.getElementById('developer-ai-prompt-copy');
  const fallback=()=>document.getElementById('developer-ai-prompt-text');
  const writes=[];
  const expected=(mode,extra={},language='zh-CN')=>createDeveloperAIPrompt({mode,readOnly:false,
    projectSelected:false,runtimeKind:'unknown',edition:'unknown',...extra},{locale:language});
  const writer=async text=>writes.push(text);
  navigator.clipboard.writeText=writer;
  const receiptCount=()=>notices.getSnapshot().toasts.length;
  const preserved=()=>{
    assert.equal(view.fields['script-source'].value,'secret source token');
    assert.equal(view.fields['script-params'].value,'{"secret":"private"}');
    assert.equal(view.fields['script-status'].textContent,'原运行状态');
    assert.deepEqual(actions,[],'copying dispatches no run, save, install, permission or editing action');
  };
  for(const mode of ['controller','page','react','vue']){
    await React.act(async()=>{
      for(const type of ['javascript','react','vue'])view.patch('page-component-'+type,{checked:type===(['react','vue'].includes(mode)?mode:'javascript')});
      view.patch('script-javascript-world',{value:mode==='page'?'page':'controller'});
    });
    assert.equal(document.querySelectorAll('#developer-ai-prompt-copy').length,1);
    assert.equal(button().getAttribute('aria-label'),'复制 AI 开发提示词');
    button().focus();assert.equal(document.activeElement,button());
    await React.act(async()=>button().click());
    assert.equal(writes.at(-1),expected(mode));
    assert.equal(button().disabled,false);
    const toast=notices.getSnapshot().toasts.at(-1);
    assert.equal(toast.message,'已复制，粘贴到 Codex 等并补充需求');
    assert.equal(toast.position,'bottom-center');
    assert.equal(toast.type,'success');
    assert.equal(fallback(),null);preserved();
  }
  await patch('script-source',{readOnly:true});
  await React.act(async()=>button().click());
  assert.equal(writes.at(-1),expected('vue',{readOnly:true}));
  preserved();
  await React.act(async()=>{
    view.patch('local-project-mode',{checked:true});
    view.patch('local-project-tools',{hidden:false});view.patch('manual-source-editor',{hidden:true});
    view.patch('local-project-select',{value:'private/path?token=secret',data:{promptProjectSelected:true,promptRuntimeKind:'controller'}});
  });
  assert.equal(document.querySelectorAll('#developer-ai-prompt-copy').length,1);
  assert.ok(button().closest('.local-project-controls'));
  await React.act(async()=>button().click());
  assert.equal(writes.at(-1),expected('local',{projectSelected:true,runtimeKind:'controller'}));
  assert.doesNotMatch(writes.at(-1),/private\/path|secret source|token=secret/);preserved();
  await patch('local-project-select',{value:'',data:{promptProjectSelected:false,promptRuntimeKind:'unknown'}});
  await React.act(async()=>button().click());
  assert.equal(writes.at(-1),expected('local'));

  const beforeFailure=receiptCount();
  navigator.clipboard.writeText=async()=>{throw new DOMException('blocked','NotAllowedError');};
  await React.act(async()=>button().click());
  assert.equal(receiptCount(),beforeFailure,'rejection never reports success');
  assert.match(document.querySelector('.developer-prompt-recovery [role=alert]').textContent,/拒绝/);
  assert.equal(fallback().value,expected('local'));
  assert.equal(fallback().readOnly,true);assert.equal(document.activeElement,fallback());
  assert.equal(fallback().selectionStart,0);assert.equal(fallback().selectionEnd,fallback().value.length);
  assert.equal(button().disabled,false);preserved();
  navigator.clipboard={};
  await React.act(async()=>button().click());
  assert.match(document.querySelector('.developer-prompt-recovery [role=alert]').textContent,/不可用/);
  assert.equal(receiptCount(),beforeFailure);
  const close=[...document.querySelectorAll('.developer-prompt-recovery button')].find(node=>node.textContent==='关闭提示词');
  await React.act(async()=>close.click());
  assert.equal(fallback(),null);assert.equal(document.activeElement,button(),'closing recovery restores its copy entry');
  navigator.clipboard.writeText=async()=>{throw Error('write failed');};
  await React.act(async()=>button().click());
  assert.match(document.querySelector('.developer-prompt-recovery [role=alert]').textContent,/失败/);
  navigator.clipboard.writeText=writer;
  for(const language of ['en','ja','zh-TW']){
    locale=language;await React.act(async()=>render());
    assert.equal(button().title,translateUiText('develop.prompt.copy',{},language));
    await React.act(async()=>button().click());
    assert.equal(writes.at(-1),expected('local',{},language));
  }
  locale='zh-CN';await React.act(async()=>render());
  const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
  for(const transition of ['mode','selection','readOnly','locale','subview','hidden','unmount']){
    const wait=deferred(),before=receiptCount();
    navigator.clipboard.writeText=()=>wait.promise;
    await React.act(async()=>button().click());assert.equal(button().disabled,true);
    await React.act(async()=>{
      if(transition==='mode')view.patch('local-project-mode',{checked:false});
      if(transition==='selection')view.patch('local-project-select',{value:'changed-project'});
      if(transition==='readOnly')view.patch('script-source',{readOnly:!view.fields['script-source'].readOnly});
      if(transition==='locale'){locale='en';render();}
      if(transition==='subview')view.navigate('save');
      if(transition==='hidden'){hidden=true;render();}
      if(transition==='unmount')root.unmount();
    });
    await React.act(async()=>transition==='selection'?wait.reject(Error('late failure')):wait.resolve());
    assert.equal(receiptCount(),before,'late completion cannot publish into a changed or disposed context');
    assert.equal(fallback(),null);preserved();
    if(transition==='hidden'){hidden=false;await React.act(async()=>render());}
    if(transition==='locale'){locale='zh-CN';await React.act(async()=>render());}
    if(transition==='subview')await React.act(async()=>view.navigate('editor'));
    if(transition==='unmount'){root=createRoot(document.getElementById('root'));await React.act(async()=>render());}
  }
  navigator.clipboard.writeText=writer;
  await React.act(async()=>button().click());
  assert.equal(button().disabled,false);preserved();
});
