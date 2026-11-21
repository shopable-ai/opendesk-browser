import test from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import {JSDOM} from 'jsdom';
import {loadSidebarReact} from '../helpers/sidebar-react-fixture.mjs';
import {createDeveloperStarterSource} from '../../src/ui/developer-starter-source.js';
import browserConfig from '../../src/config/browser-config.json' with {type:'json'};

test('developer native world radios and section navigation preserve drafts and dispatch only explicit owner actions',async t=>{
  const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{pretendToBeVisual:true});
  const {window}=dom,{document}=window;
  // JSDOM has no CSS.escape or layout observer; React Aria uses both even
  // before a menu opens. Hex escapes also handle generated React IDs safely.
  window.CSS??={escape:value=>Array.from(String(value),char=>
    '\\'+(char.codePointAt(0)||0xfffd).toString(16)+' ').join('')};
  window.ResizeObserver??=class {observe(){}unobserve(){}disconnect(){}};
  window.HTMLElement.prototype.scrollTo=function(options){
    this.scrollTop=options?.top??this.scrollTop;this.scrollLeft=options?.left??this.scrollLeft;
  };
  const globals={window,document,HTMLSelectElement:window.HTMLSelectElement,CSS:window.CSS,ResizeObserver:window.ResizeObserver,
    MutationObserver:window.MutationObserver,NodeFilter:window.NodeFilter,
    getComputedStyle:window.getComputedStyle.bind(window),
    requestAnimationFrame:window.requestAnimationFrame.bind(window),
    cancelAnimationFrame:window.cancelAnimationFrame.bind(window),
    navigator:window.navigator,HTMLButtonElement:window.HTMLButtonElement,
    Element:window.Element,HTMLElement:window.HTMLElement,
    SVGElement:window.SVGElement,Node:window.Node,HTMLInputElement:window.HTMLInputElement,
    HTMLTextAreaElement:window.HTMLTextAreaElement,IS_REACT_ACT_ENVIRONMENT:true};
  const previous=new Map(Object.keys(globals).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const [key,value] of Object.entries(globals))
    Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
  const errors=[];
  window.addEventListener('error',event=>errors.push(event.error));
  let root,view;
  t.after(async()=>{
    try{
      if(root)await React.act(async()=>root.unmount());
      if(view)assert.equal(view.resourceSnapshot().subscriptions,0);
      assert.deepEqual(errors,[],'DOM event handlers must not throw uncaught errors');
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
  const starterSource=createDeveloperStarterSource(view);starterSource.fill();
  const calls=[];
  // Observe every action, including Run, installation and permission controls.
  // Only emulate the controller's code-type projection. This test exercises UI
  // bridging, not Controller execution, dependency resolution or authorization.
  for(const id of Object.keys(view.fields))view.actions[id]=event=>{
    calls.push({id,event,value:view.fields[id].value,checked:view.fields[id].checked,
      section:view.getSnapshot().section});
  };
  const frameworks=['javascript','react','vue'];
  for(const framework of frameworks){
    const id='page-component-'+framework,record=view.actions[id];
    view.actions[id]=event=>{
      record(event);
      starterSource.fill(framework,view.fields['script-javascript-world'].value);
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
  assert.equal(world.tagName,'FIELDSET');
  assert.equal(world.getAttribute('role'),'radiogroup');
  const radios=[...world.querySelectorAll('input[type=radio]')];
  assert.deepEqual(radios.map(input=>input.value),['controller','page']);
  assert.deepEqual([...world.querySelectorAll('label span')].map(span=>span.textContent),
    view.fields['script-javascript-world'].options.map(option=>option.label));
  const selectedWorld=()=>world.querySelector('input:checked').value;
  assert.equal(selectedWorld(),'controller');
  assert.equal(source.placeholder,'','examples are real source supplied by the editor owner');
  assert.ok(source.getAttribute('aria-describedby').split(' ').includes('developer-draft-help'),
    'editable source announces its manual-save policy');
  assert.match(source.value,/page.title/,'the example is editable source, not placeholder text');
  assert.equal(source.value,view.fields['script-source'].value);
  assert.equal(calls.length,0,'mounting must not invoke any action');
  const noEditorLibrary=()=>{
    assert.equal(get('developer-script-open-button'),null,'the editor has no Open dropdown');
    assert.equal(document.querySelector('.developer-script-picker'),null,'the editor mounts no saved-script popover');
    assert.equal(document.querySelector('[aria-label="打开已保存脚本"]'),null);
  };
  noEditorLibrary();
  assert.ok(get('developer-more-actions').contains(get('developer-library-entry')),
    'version management belongs to the existing More menu');
  assert.equal(get('developer-more-actions').hidden,true,'saved versions do not occupy the default editor');

  const draft='// 完整中文草稿\nasync function main() {\n  const keep = "你好，网页";\n  return { keep, lines: [1, 2] };\n}\n';
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

  const references=async(key,mode)=>{
    const head=document.querySelector('.developer-editor-head');
    assert.equal(head.querySelector('.developer-editor-filename'),null,'editable drafts have no synthetic filename');
    assert.ok(get('developer-environment-hint').classList.contains('visually-hidden'));
    assert.ok(get('developer-draft-help').classList.contains('visually-hidden'));
    noEditorLibrary();
    assert.equal(head.textContent.includes('当前草稿'),false);
    const before=calls.length;
    for(const [kind,label] of [['examples','示例'],['help','API 文档']]){
      const link=get('developer-source-'+kind);
      assert.equal(link.tagName,'A');
      assert.equal(link.href,new URL(browserConfig.navigation.developerReferences[key][kind]).href);
      assert.equal(link.target,'_blank');
      assert.equal(link.rel,'noopener noreferrer');
      assert.equal(link.title,mode+' · '+label+'（新标签页）');
      assert.equal(link.getAttribute('aria-label'),link.title);
      assert.equal(link.querySelector('svg').getAttribute('aria-hidden'),'true');
      link.focus();
      assert.equal(document.activeElement,link);
      // JSDOM does not implement navigation; browser verification covers the popup.
      link.addEventListener('click',event=>event.preventDefault(),{once:true});
      await React.act(async()=>link.click());
      preserved();
    }
    assert.equal(calls.length,before,'reference links dispatch no editor or execution action');
  };
  await references('controller','自动化 JS');

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
  const select=async value=>{
    const input=radios.find(input=>input.value===value);
    let nativeEvent;
    input.addEventListener('click',event=>{nativeEvent=event;},{once:true});
    const before=calls.length;
    await React.act(async()=>input.click());
    assert.equal(calls.length,before+1);
    assert.equal(calls.at(-1).id,'script-javascript-world');
    assert.equal(calls.at(-1).event,nativeEvent,'forward the original native radio event');
    assert.equal(calls.at(-1).event.target,input);
    assert.equal(calls.at(-1).value,value,'patch before invoking the original action');
    assert.equal(selectedWorld(),value);
    assert.equal(view.getSnapshot().fields['script-javascript-world'].value,value);
    preserved();
  };
  await select('page');
  await references('page','网页 JS');
  assert.equal(source.placeholder,'');
  await select('controller');
  assert.equal(source.placeholder,'');

  // A disabled native radio is not operable. Do not fabricate a change on a
  // disabled node: dispatchEvent bypasses browser interaction restrictions.
  await React.act(async()=>view.patch('script-javascript-world',{disabled:true}));
  assert.equal(world.disabled,true);
  assert.equal(world.matches(':disabled'),true);
  source.focus();
  const beforeBusy=calls.length;
  await React.act(async()=>{radios[1].focus();radios[1].click();});
  assert.equal(document.activeElement,source,'disabled radio cannot take focus');
  assert.equal(calls.length,beforeBusy);
  assert.equal(selectedWorld(),'controller');
  assert.equal(view.fields['script-javascript-world'].value,'controller');
  preserved();
  await React.act(async()=>view.patch('script-javascript-world',{disabled:false}));
  assert.equal(world.disabled,false);

  for(const framework of ['react','vue','javascript']){
    const id='page-component-'+framework;
    const call=await click(get(id),id);
    assert.equal(call.value,framework);
    assert.equal(call.checked,true,'the field is patched before the original action');
    assert.deepEqual(frameworks.map(candidate=>get('page-component-'+candidate).checked),
      frameworks.map(candidate=>candidate===framework));
    assert.equal(source.placeholder,'');
    if(framework!=='javascript')await references(framework,framework==='react'?'React JSX':'Vue SFC');
  }
  assert.deepEqual(calls.map(call=>call.id),[
    'script-source','script-javascript-world','script-javascript-world',
    'page-component-react','page-component-vue','page-component-javascript'
  ],'editing and switching never invoke Run, installation or permission actions');

  const params=get('script-params');
  const parameterDraft='{\n  "关键词": "中文参数",\n  "items": [1, 2],\n  "nested": {"保留": true}\n}';
  await React.act(async()=>{
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set.call(params,parameterDraft);
    params.dispatchEvent(new window.Event('input',{bubbles:true}));
  });
  assert.equal(calls.at(-1).id,'script-params');
  const preservedAll=()=>{
    preserved();
    assert.equal(get('script-source'),source,'navigation keeps the same editor mounted');
    assert.equal(get('script-params'),params);
    assert.equal(params.value,parameterDraft);
    assert.equal(view.fields['script-params'].value,parameterDraft);
    assert.equal(view.getSnapshot().fields['script-params'].value,parameterDraft);
  };
  // Include closed disclosures when testing visibility; JSDOM has no layout.
  const visible=node=>{
    if(node.closest('[hidden]'))return false;
    for(let parent=node.parentElement;parent;parent=parent.parentElement)
      if(parent.tagName==='DETAILS'&&!parent.open&&!parent.querySelector(':scope > summary')?.contains(node))return false;
    return true;
  };
  const button=(container,text)=>[...container.querySelectorAll('button')]
    .find(node=>node.textContent.trim()===text&&visible(node));
  const fixedFile='project/很长的目录名称/'.repeat(8)+'actual-source.js';
  await React.act(async()=>{
    view.patch('script-source',{readOnly:true});
    view.patch('program-source-files',{value:fixedFile});
  });
  assert.equal(source.readOnly,true);
  noEditorLibrary();
  assert.equal(source.getAttribute('aria-describedby').split(' ').includes('developer-draft-help'),false,
    'fixed source does not announce a hidden draft policy');
  assert.equal(document.querySelector('.developer-editor-readonly').textContent,'固定源码 · 只读');
  assert.equal(document.querySelector('.developer-editor-filename').title,fixedFile);
  assert.equal(document.querySelector('.developer-editor-filename').textContent,fixedFile);
  preservedAll();
  await React.act(async()=>view.patch('manual-source-editor',{hidden:true}));
  assert.equal(visible(get('developer-source-examples')),false,'local projection hides references with the manual editor');
  assert.equal(visible(get('developer-source-help')),false);
  await React.act(async()=>{
    view.patch('manual-source-editor',{hidden:false});
    view.patch('script-source',{readOnly:false});
    view.patch('program-source-files',{value:''});
  });
  assert.equal(document.querySelector('.developer-editor-readonly'),null);
  preservedAll();
  const navigate=async node=>{
    assert.ok(node&&visible(node),'navigation entry must be visible');
    const before=calls.length;
    await React.act(async()=>node.click());
    assert.equal(calls.length,before,'section navigation dispatches no business action');
    preservedAll();
  };
  const result=get('developer-results-panel'),history=get('script-history-panel');
  assert.equal(result.parentElement.hidden,false);
  assert.equal(history.parentElement.hidden,true);
  assert.equal(visible(get('script-id')),false);
  assert.equal(visible(get('site-access-grant')),false);
  assert.equal(visible(get('page-program-install')),false);
  await navigate(get('developer-save-entry'));
  assert.equal(view.getSnapshot().section,'save');
  assert.equal(visible(get('script-id')),true);
  assert.equal(visible(get('script-save-version')),true);
  assert.equal(visible(get('script-revision')),false,'Controller save allocates its own next revision');
  assert.equal(visible(get('script-delete')),false,'saving does not expose deletion');
  assert.equal(visible(source),false);
  assert.equal(result.parentElement.hidden,true);
  assert.equal(history.parentElement.hidden,true);
  assert.equal(visible(get('script-list')),false);
  assert.equal(visible(get('page-program-install')),false);
  assert.equal(visible(get('site-access-grant')),false);
  assert.equal(visible(get('script-version')),true,'draft save state belongs beside the save action');
  const back=()=>get('workbench-develop').querySelector('[aria-label="返回编辑"]');
  assert.equal(document.activeElement,back(),'management entry focuses its return action');
  await navigate(back());
  assert.equal(view.getSnapshot().section,'editor');
  assert.equal(document.activeElement,get('developer-save-entry'));
  // UI_PREVIEW_ONLY: this saved-history record is synthetic, not real user history.
  const selectedId='saved-script-with-a-long-name-independent-of-the-editor';
  await React.act(async()=>{
    view.patch('script-list',{options:[{label:'选择已保存脚本',value:''},
      {label:selectedId+' · r12',value:selectedId,scriptId:selectedId,revision:12,
        kind:'controller',typeLabel:'自动化 · Controller JS'}],value:selectedId});
    view.patch('page-program-list',{options:[1,2].map(revision=>({
      label:selectedId+' · r'+revision,value:selectedId+':'+revision,scriptId:selectedId,
      revision,kind:'page',typeLabel:'网页脚本 · Page',manifestHash:'f'.repeat(64)
    })),value:selectedId+':1'});
  });
  noEditorLibrary();
  const managementMore=get('developer-more-button');
  await navigate(managementMore);
  assert.equal(get('developer-more-actions').hidden,false);
  await navigate(get('developer-library-entry'));
  assert.equal(view.getSnapshot().section,'library');
  assert.equal(get('developer-more-actions').hidden,true);
  assert.deepEqual(view.fields['page-program-list'].options.map(option=>option.revision),[1,2],
    'management retains all Page revisions without a duplicate shortcut catalog');
  assert.equal(get('developer-selected-script').textContent,'所选脚本：'+selectedId+' · r12');
  assert.equal(visible(get('script-version')),false,'library never substitutes draft state for the selected saved object');
  assert.equal(get('script-delete').getAttribute('aria-describedby'),'developer-selected-script');
  await React.act(async()=>view.patch('script-version',{textContent:'编辑器中的其他版本'}));
  assert.equal(get('developer-selected-script').textContent,'所选脚本：'+selectedId+' · r12');
  await React.act(async()=>view.patch('script-list',{value:''}));
  assert.equal(get('developer-selected-script').textContent,'请先选择一个已保存脚本。');
  await navigate(back());
  assert.equal(document.activeElement,managementMore,'returning from management restores the persistent More trigger');
  noEditorLibrary();
  await React.act(async()=>{
    view.patch('script-status',{textContent:''});
    view.patch('script-task-status',{textContent:''});
  });
  await navigate(get('developer-save-entry'));
  assert.equal(document.querySelector('.developer-run-area').hidden,true,'empty execution area leaves no gap above save form');
  assert.equal(get('develop-dock').hidden,true,'idle management has no blank action dock');
  await React.act(async()=>view.patch('script-status',{textContent:'运行结果未知，请先核对',data:{state:'unknown'}}));
  assert.equal(visible(get('script-status')),true,'management preserves actual error and unknown feedback');
  await React.act(async()=>view.patch('script-status',{textContent:'',data:{state:'idle'}}));
  await navigate(back());
  await React.act(async()=>view.patch('page-preview-tools',{hidden:false}));
  await navigate(get('developer-save-entry'));
  assert.equal(visible(get('script-revision')),true,'Page save retains its explicit optional version');
  assert.equal(visible(get('script-load')),false,'save form cannot silently replace the current source');
  await navigate(back());
  await React.act(async()=>view.patch('page-preview-tools',{hidden:true}));
  const more=get('develop-dock').querySelector('[aria-label="更多操作"]');
  await navigate(more);
  assert.equal(more.getAttribute('aria-expanded'),'true');
  await navigate(button(get('developer-more-actions'),'运行记录与下载'));
  assert.equal(view.getSnapshot().section,'history');
  assert.equal(get('script-history-panel'),history,'history retains its original field owner');
  assert.equal(history.parentElement.hidden,false);
  assert.equal(result.parentElement.hidden,false,'history exposes the selected result beside its query controls');
  assert.equal(result.querySelector('h2').textContent.trim(),'所选运行结果');
  assert.equal(visible(get('script-id')),false);
  assert.equal(visible(get('page-program-install')),false);
  assert.equal(visible(get('site-access-grant')),false);
  assert.equal(more.getAttribute('aria-expanded'),'false');
  await React.act(async()=>{history.open=true;});
  assert.equal(visible(get('script-history-run')),true);
  await navigate(back());
  assert.equal(document.activeElement,more);
  assert.equal(result.parentElement.hidden,false);
  assert.equal(history.parentElement.hidden,true);
  assert.equal(visible(get('script-history-run')),false);
  preservedAll();

  await React.act(async()=>{
    view.patch('script-copy-result',{disabled:false});
    view.patch('script-task-status',{hidden:false,textContent:'已完成 · 资源已释放'});
  });
  const copy=get('script-copy-result');
  assert.ok(result.querySelector('.developer-result-head').contains(copy),'copy belongs to the result header');
  assert.equal(copy.getAttribute('aria-label'),'复制运行结果');
  assert.equal(copy.textContent.trim(),'');
  assert.ok(copy.querySelector('svg'));
  for(const id of ['developer-result-download','developer-result-detail','developer-result-history'])
    assert.equal(get(id),null,'redundant result action removed: '+id);
  const technical=get('developer-run-technical');
  assert.equal(technical.open,false);
  assert.equal(visible(get('script-task-id')),false,'technical identity stays collapsed inline');
  await React.act(async()=>{technical.open=true;});
  assert.equal(visible(get('script-task-id')),true);
  assert.equal(visible(source),true,'technical details keep the source in view');
  assert.equal(visible(get('script-running-target')),true);
  assert.ok(technical.contains(get('script-task-status')),'resource status belongs in technical details');
  await React.act(async()=>{technical.open=false;});
  assert.equal(visible(get('script-task-status')),false);
  await React.act(async()=>{
    view.patch('script-status',{textContent:'运行结果未知，请先核对',data:{state:'unknown'}});
    view.patch('script-task-status',{data:{state:'paused_unknown',runId:'original-unknown-run'}});
  });
  const originalRunReads=[];
  view.actions['developer-unknown-history']=runId=>{
    originalRunReads.push(runId);
    view.navigate('history',{returnFocusId:'developer-unknown-history'});
  };
  await navigate(get('developer-unknown-history'));
  assert.deepEqual(originalRunReads,['original-unknown-run'],'unknown action passes the rendered identity to its result owner');
  assert.equal(view.getSnapshot().section,'history');
  await navigate(back());
  assert.equal(document.activeElement,get('developer-unknown-history'));
  await React.act(async()=>view.patch('script-status',{textContent:'',data:{state:'idle'}}));

  await React.act(async()=>view.patch('script-task-status',{data:{state:'completed'}}));
  assert.match(get('developer-draft-help').textContent,/未自动保存/);
  const beforeKeys=calls.length;
  // Native keyboard events exercise React handlers. JSDOM does not synthesize
  // browser default typing or Tab focus traversal from dispatchEvent.
  await React.act(async()=>{
    for(const node of [source,params,world]){
      node.focus();
      for(const key of ['Tab','Enter'])for(const type of ['keydown','keyup'])
        node.dispatchEvent(new window.KeyboardEvent(type,{key,bubbles:true}));
    }
  });
  assert.equal(calls.length,beforeKeys,'Tab/Enter do not invoke Run or any other action');
  preservedAll();
  assert.deepEqual(calls.map(call=>call.id),[
    'script-source','script-javascript-world','script-javascript-world',
    'page-component-react','page-component-vue','page-component-javascript','script-params'
  ],'editing and navigation never run, install, save or request permissions');

  assert.equal(get('script-stop'),null,'idle stop is not an extra competing action');
  await React.act(async()=>view.patch('script-stop',{disabled:false}));
  const stop=get('script-stop');
  assert.ok(get('develop-dock').contains(stop));
  assert.equal(visible(stop),true);
  assert.equal(stop.disabled,false);
  assert.equal(document.querySelectorAll('#script-run').length,1);
  assert.equal(document.querySelectorAll('#script-stop').length,1);
  stop.focus();
  assert.equal(document.activeElement,stop,'enabled Stop is keyboard reachable in Dock');
  const beforeStop=calls.length;
  await click(stop,'script-stop');
  assert.equal(calls.length,beforeStop+1,'Stop invokes its original action exactly once');
  assert.equal(calls.filter(call=>call.id==='script-stop').length,1);
  assert.equal(calls.filter(call=>call.id==='script-run').length,0);
  preservedAll();
  await navigate(get('developer-save-entry'));
  assert.equal(get('develop-dock').hidden,false,'running management retains Stop');
  assert.equal(get('develop-dock').dataset.subview,'true');
  assert.equal(visible(stop),true);
  await navigate(back());

  // Explicit execution/save remain the original actions; management cannot
  // hide their result/review because navigation happens before the callback.
  await navigate(get('developer-save-entry'));
  await React.act(async()=>view.patch('script-run',{disabled:false}));
  const runCall=await click(get('script-run'),'script-run');
  assert.equal(runCall.section,'editor','Run navigates before invoking the owner');
  assert.equal(result.parentElement.hidden,false);
  assert.equal(visible(source),true);
  preservedAll();
  await navigate(more);
  await navigate(button(get('developer-more-actions'),'运行记录与下载'));
  await React.act(async()=>view.patch('local-project-mode',{checked:true}));
  const localSave=get('script-save');
  assert.equal(visible(get('developer-save-entry')),false);
  assert.equal(get('developer-library-entry').hidden,true,'local projects do not expose the manual script library');
  assert.equal(visible(localSave),true,'local save remains reachable from history');
  assert.ok(get('develop-dock').contains(localSave));
  const saveCall=await click(localSave,'script-save');
  assert.equal(saveCall.section,'editor','local save navigates before invoking the owner');
  assert.equal(visible(source),true);
  assert.equal(result.parentElement.hidden,false);
  assert.equal(history.parentElement.hidden,true);
  assert.equal(calls.filter(call=>call.id==='script-run').length,1);
  assert.equal(calls.filter(call=>call.id==='script-save').length,1);
  assert.deepEqual(calls.slice(beforeStop).map(call=>call.id),['script-stop','script-run','script-save'],
    'only the three explicit Dock actions invoke owners, once each');
  preservedAll();

  await React.act(async()=>root.render(React.createElement(DeveloperPage,{view,hidden:true})));
  assert.deepEqual(await view.requestConfirmation({title:'迟到的加载',message:'不可显示'}),{action:'cancel',reason:'hidden'});
  assert.equal(view.getSnapshot().confirmation,null,'a late async read cannot queue an invisible dialog');
  await React.act(async()=>root.render(React.createElement(React.Fragment,null,
    React.createElement(DeveloperPage,{view}),React.createElement(DeveloperDock,{view}))));
  assert.equal(view.getSnapshot().confirmation,null,'returning never reveals a stale decision');
  assert.equal(document.querySelector('[role="alertdialog"]'),null);

  await React.act(async()=>view.patch('script-source',{readOnly:true}));
  assert.equal(source.readOnly,true);
  noEditorLibrary();
  assert.equal(source.placeholder,'','read-only source has no editable example hint');
  preserved();
  await React.act(async()=>view.patch('program-source-files',{value:'src/actual-entry.ts'}));
  assert.equal(document.querySelector('.developer-editor-head .od-technical').textContent,'src/actual-entry.ts');
  await React.act(async()=>view.patch('script-run',{textContent:'检查后运行'}));
  assert.equal(get('script-run').textContent,'检查后运行');
  assert.ok(get('script-run').querySelector('svg'),'dynamic owner labels retain their action icon');

  await React.act(async()=>{
    view.patch('local-project-tools',{hidden:false});
    view.patch('local-project-tool-pointer',{hidden:false,textContent:'调试打开失败，请重试'});
  });
  const feedback=get('local-project-tool-pointer');
  assert.equal(feedback.hidden,false);
  assert.equal(Boolean(feedback.closest('details')),false,'preview feedback stays outside optional association settings');
  assert.ok(feedback.parentElement.contains(get('local-project-preview')),
    'feedback remains beside the action that produced it');

  // Deadline choices stay local UI state and never imply Run or permission.
  const deadline=get('script-draft-deadline-ms'),note=get('script-draft-deadline-note');
  assert.equal(deadline.value,'30000');
  assert.equal(note.hidden,true,'ordinary debugging keeps long-run guidance out of the form');
  const beforeDeadline=calls.length;
  for(const value of ['300000','600000','1200000','3600000','43200000','86400000','30000']){
    const event=new window.Event('change',{bubbles:true});
    await React.act(async()=>{deadline.value=value;deadline.dispatchEvent(event);});
    assert.equal(deadline.value,value);
    assert.equal(view.getSnapshot().fields['script-draft-deadline-ms'].value,value);
    assert.equal(note.hidden,Number(value)<3600000);
    for(const id of deadline.getAttribute('aria-describedby').split(' ')){
      assert.ok(get(id));assert.equal(get(id).hidden,false,'every description is available for the current selection');
    }
    assert.equal(calls.at(-1).id,'script-draft-deadline-ms');
    assert.equal(calls.at(-1).event,event);
  }
  assert.deepEqual(calls.slice(beforeDeadline).map(call=>call.id),Array(7).fill('script-draft-deadline-ms'));
  const beforeDeadlineNavigation=calls.length;
  await React.act(async()=>{
    view.patch('local-project-mode',{checked:false});
    view.patch('script-draft-deadline-ms',{value:'86400000'});
  });
  await navigate(get('developer-save-entry'));await navigate(back());
  assert.equal(get('script-draft-deadline-ms').value,'86400000','management navigation preserves the chosen next-run duration');
  assert.equal(calls.length,beforeDeadlineNavigation,'navigation does not execute the duration choice');
  await React.act(async()=>view.patch('script-draft-deadline-ms',{disabled:true}));
  assert.equal(get('script-draft-deadline-ms').disabled,true,'the owner can lock duration during an active run');
  const fresh=createDeveloperView();
  assert.equal(fresh.fields['script-draft-deadline-ms'].value,'30000','long-run choices do not become a global default');
  fresh.dispose();
  preservedAll();
});
