import test from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import {JSDOM} from 'jsdom';
import {loadSidebarReact} from '../helpers/sidebar-react-fixture.mjs';

test('developer radios bridge native events without running or replacing source; placeholders follow snapshots',async t=>{
  const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
  const {window}=dom,{document}=window;
  const globals={window,document,IS_REACT_ACT_ENVIRONMENT:true};
  const previous=new Map(Object.keys(globals).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const [key,value] of Object.entries(globals))
    Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
  let root,view;
  t.after(async()=>{
    try{
      if(root)await React.act(async()=>root.unmount());
      if(view)assert.equal(view.resourceSnapshot().subscriptions,0);
    }finally{
      view?.dispose();dom.window.close();
      for(const [key,descriptor] of previous){
        if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
      }
    }
  });
  const [{createRoot},{DeveloperPage,DeveloperDock,createDeveloperView}]=await Promise.all([
    import('react-dom/client'),loadSidebarReact()
  ]);
  view=createDeveloperView();
  const calls=[];
  // Observe every action, including Run, installation and permission controls.
  // Only emulate the controller's code-type projection. This test exercises UI
  // bridging, not Controller execution, dependency resolution or authorization.
  for(const id of Object.keys(view.fields))view.actions[id]=event=>{
    calls.push({id,event,value:view.fields[id].value,checked:view.fields[id].checked});
  };
  const frameworks=['javascript','react','vue'];
  for(const framework of frameworks){
    const id='page-component-'+framework,record=view.actions[id];
    view.actions[id]=event=>{
      record(event);
      for(const candidate of frameworks)
        view.patch('page-component-'+candidate,{checked:candidate===framework},{immediate:true});
      view.patch('script-javascript-world-row',{hidden:framework!=='javascript'});
    };
  }
  root=createRoot(document.getElementById('root'));
  await React.act(async()=>root.render(React.createElement(React.Fragment,null,
    React.createElement(DeveloperPage,{view}),React.createElement(DeveloperDock,{view}))));
  const get=id=>document.getElementById(id);
  const source=get('script-source'),world=get('script-javascript-world');
  const radios=[...world.querySelectorAll('input[type="radio"]')];
  assert.equal(world.tagName,'FIELDSET');
  assert.deepEqual(radios.map(radio=>radio.value),['controller','page']);
  assert.equal(new Set(radios.map(radio=>radio.name)).size,1);
  assert.ok(radios[0].name);
  for(const [index,option] of view.fields['script-javascript-world'].options.entries())
    assert.equal(radios[index].getAttribute('aria-label'),option.label);
  assert.deepEqual(radios.map(radio=>radio.checked),[true,false]);
  const controllerPlaceholder=source.placeholder;
  assert.ok(controllerPlaceholder.trim());
  assert.equal(source.value,'','examples are placeholders, not initial source');
  assert.equal(view.fields['script-source'].value,'');
  assert.equal(calls.length,0,'mounting must not invoke any action');

  const draft='// authored draft\nconst keep = "my source";';
  const inputEvent=new window.Event('input',{bubbles:true});
  await React.act(async()=>{
    // Use the native setter so React observes a genuine DOM edit.
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set.call(source,draft);
    source.dispatchEvent(inputEvent);
  });
  assert.equal(calls.length,1);
  assert.equal(calls[0].id,'script-source');
  assert.equal(calls[0].event,inputEvent);
  const preserved=()=>{
    assert.equal(source.value,draft);
    assert.equal(view.fields['script-source'].value,draft);
    assert.equal(view.getSnapshot().fields['script-source'].value,draft);
  };
  preserved();

  const click=async(node,id)=>{
    let nativeClick;
    node.addEventListener('click',event=>{nativeClick=event;},{once:true});
    const before=calls.length;
    await React.act(async()=>node.click());
    assert.ok(nativeClick instanceof window.MouseEvent);
    assert.equal(calls.length,before+1,'one DOM click invokes only the intended action');
    const call=calls.at(-1);
    assert.equal(call.id,id);
    assert.equal(call.event,nativeClick,'forward event.nativeEvent, not the React synthetic event');
    assert.equal(call.event.target,node);
    preserved();
    return call;
  };
  const pageCall=await click(radios[1],'script-javascript-world');
  assert.equal(pageCall.value,'page','patch the original field before invoking its action');
  assert.equal(view.getSnapshot().fields['script-javascript-world'].value,'page');
  assert.deepEqual(radios.map(radio=>radio.checked),[false,true]);
  const pagePlaceholder=source.placeholder;
  assert.ok(pagePlaceholder.trim());
  assert.notEqual(pagePlaceholder,controllerPlaceholder);
  const controllerCall=await click(radios[0],'script-javascript-world');
  assert.equal(controllerCall.value,'controller');
  assert.equal(view.getSnapshot().fields['script-javascript-world'].value,'controller');
  assert.deepEqual(radios.map(radio=>radio.checked),[true,false]);
  assert.equal(source.placeholder,controllerPlaceholder);

  // Project the same disabled field that the controller publishes while busy.
  await React.act(async()=>view.patch('script-javascript-world',{disabled:true}));
  assert.equal(world.disabled,true);
  for(const radio of radios)assert.equal(radio.matches(':disabled'),true);
  const beforeBusy=calls.length;
  await React.act(async()=>{for(const radio of radios)radio.click();});
  assert.equal(calls.length,beforeBusy,'disabled native radios cannot switch environments');
  assert.equal(view.fields['script-javascript-world'].value,'controller');
  assert.deepEqual(radios.map(radio=>radio.checked),[true,false]);
  preserved();
  await React.act(async()=>view.patch('script-javascript-world',{disabled:false}));
  assert.equal(world.disabled,false);

  const placeholders=[controllerPlaceholder,pagePlaceholder];
  for(const framework of ['react','vue','javascript']){
    const id='page-component-'+framework;
    const call=await click(get(id),id);
    assert.equal(call.value,framework);
    assert.equal(call.checked,true,'the field is patched before the original action');
    assert.deepEqual(frameworks.map(candidate=>get('page-component-'+candidate).checked),
      frameworks.map(candidate=>candidate===framework));
    assert.ok(source.placeholder.trim());
    if(framework==='javascript')assert.equal(source.placeholder,controllerPlaceholder);
    else placeholders.push(source.placeholder);
  }
  assert.equal(new Set(placeholders).size,4,'JS environments, React and Vue have distinct example hints');
  assert.deepEqual(calls.map(call=>call.id),[
    'script-source','script-javascript-world','script-javascript-world',
    'page-component-react','page-component-vue','page-component-javascript'
  ],'editing and switching never invoke Run, installation or permission actions');

  await React.act(async()=>view.patch('script-source',{readOnly:true}));
  assert.equal(source.readOnly,true);
  assert.equal(source.placeholder,'','read-only source has no editable example hint');
  preserved();

  await React.act(async()=>{
    view.patch('local-project-tools',{hidden:false});
    view.patch('local-project-tool-pointer',{hidden:false,textContent:'调试打开失败，请重试'});
  });
  const feedback=get('local-project-tool-pointer');
  assert.equal(feedback.hidden,false);
  assert.equal(Boolean(feedback.closest('details')),false,'preview feedback stays outside optional association settings');
  assert.ok(feedback.parentElement.contains(get('local-project-preview')),
    'feedback remains beside the action that produced it');
});
