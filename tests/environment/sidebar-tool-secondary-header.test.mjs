// R40 signed official secondary toolbar: source contract and safe fallback.
// Node/static source tests do not claim a live Chrome file-picker result.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {normalizeToolNavigation} from '../../src/sidebar-tools/navigation-state.js';

const read=path=>readFile(path,'utf8');
test('R40 navigation keeps old hints and rejects unbounded or forged secondary action',()=>{
  assert.deepEqual(normalizeToolNavigation({page:'index',title:'列表',canBack:false,primary:'new'}),
    {page:'index',title:'列表',canBack:false,primary:'new'});
  const transfer=normalizeToolNavigation({page:'index',title:'提示词快捷按钮',canBack:false,
    primary:'new',secondary:'transfer',secondaryExpanded:true});
  assert.equal(transfer.secondary,'transfer');
  assert.equal(transfer.secondaryExpanded,true);
  assert(Object.isFrozen(transfer));
  for(const extra of [
    {secondary:'delete'}, {secondary:'transfer',secondaryExpanded:'true'},
    {secondaryExpanded:true},{secondary:'transfer',secondaryExpanded:true,arbitrary:'chrome.cookies'},
    {secondary:'transfer',secondaryExpanded:false,provider:'trusted'}
  ])assert.equal(normalizeToolNavigation({page:'index',title:'列表',canBack:false,...extra}),null);
});
test('R40 Host owns header trigger but sandbox retains actual file and export gestures',async()=>{
  const [tool,toolCSS,formalHTML,bridge,host,react,hostCSS,sharedCSS,preview]=await Promise.all([
    read('projects/prompt-shortcuts/src/main.js'),
    read('projects/prompt-shortcuts/src/style.css'),
    read('projects/prompt-shortcuts/src/index.html'),
    read('src/sidebar-tools/bridge.js'),read('src/ui/sidebar-tools.js'),
    read('src/ui/react/tabs/tool-host.tsx'),read('src/ui/tool-shell.css'),
    read('src/ui/design-system.css'),
    read('projects/prompt-shortcuts/preview/index.html')
  ]);
  assert.match(tool,/secondary:'transfer'/);
  assert.match(tool,/action==='secondary'&&mode==='index'/);
  assert.match(tool,/el\('ps-import-file'\)\.click\(\)/);
  assert.match(tool,/OpenDeskSDK\.browser\.downloads\.prepareText\(async\(\)=>/,
    'JSON export must reserve the user click before the authoritative storage read');
  assert.doesNotMatch(tool,/request\('browser\.downloads\.text'/,
    'a post-await window message is not a verified download gesture');
  assert.match(bridge,/const prepareExport=factory=>/);
  assert.match(host,/const clickDirect=directExportPort!==null/);
  assert.match(bridge,/navigationAllowed&&\(\['back','primary'\]/);
  assert.match(host,/requestBusinessNavigation\('secondary'\)/);
  assert.match(react,/id="sidebar-tool-secondary-action"/);
  assert.match(toolCSS,/\.ps\.ps-host-nav \.ps-head\{position:absolute/);
  assert.match(toolCSS,/\.ps\.ps-host-nav #ps-new,\.ps\.ps-host-nav #ps-transfer/);
  assert.match(hostCSS,/\.sidebar-tool-view-head\{position:relative;z-index:3;gap:2px/);
  assert.match(hostCSS,/\.sidebar-tool-header-actions\{/);
  assert.match(sharedCSS,/\.od-page-head \.od-icon-button\{border-color:transparent;background:transparent/);
  assert.match(preview,/Side Panel 交互预览 R4\.2/);
  assert.match(preview,/id="hostMore"/);
  assert.doesNotMatch(react,/id="sidebar-tool-more-open"/);
  assert.doesNotMatch(react,/id="sidebar-tool-header-enable"/);
  assert.match(react,/id="sidebar-tool-enable"/,
    'Low-frequency enable/disable must remain within trusted Settings');
  assert.match(react,/view\.dispatch\(id, 'click', event\.nativeEvent\)/,
    'Each management icon must retain the original trusted browser event');
  assert.match(host,/listen\(enableButton,'click',event=>/);
  assert.match(host,/hidden:!managed\|\|enableReadError\|\|enableRecordsLoading,\s*disabled:busy\|\|toolSaving\|\|readOnlyPreview/,
    'unknown enable state stays hidden; lifecycle actions stay disabled while busy, saving or previewing');
  assert.equal((react.match(/id="sidebar-tool-settings-open"/g)||[]).length,1);
  assert.equal((react.match(/id="sidebar-tool-secondary-action"/g)||[]).length,1);
  assert.match(react,/returnFocusSelector="#sidebar-tool-remove"/);
  assert.match(formalHTML,/<span id="ps-count" class="ps-sr-only"/);
  assert.doesNotMatch(formalHTML,/ps-list-caption|ps-seed-hint/);
  assert.doesNotMatch(tool,/el\('ps-count'\)\.focus/);
  assert.match(tool,/el\('ps-list'\)\.querySelector\('button:not\(\[disabled\]\)'\)/);
});


// Mounted production JSX tests exercise events and focus, not source strings.
import * as React from 'react';
import {createRoot} from 'react-dom/client';
import {createServer} from 'vite';
import postcss from 'postcss';
import {createSidebarToolsView} from '../../src/ui/sidebar-tools-view.js';
import {mountWorkflowClient} from './workflow-mounted-ui.mjs';
import {tick} from './workflow-react-fixture.mjs';

test('R14 More dispatches captured scope and supports keyboard, disabled reasons and dismissal',async t=>{
  const vite=await createServer({configFile:false,root:process.cwd(),
    appType:'custom',server:{middlewareMode:true,ws:false},logLevel:'error'});
  t.after(()=>vite.close());
  const {ToolHost}=await vite.ssrLoadModule('/src/ui/react/tabs/tool-host.tsx');
  const f=await mountWorkflowClient({activeTab:'tools'});
  const view=createSidebarToolsView();
  for(const id of Object.keys(view.fields))view.patch(id,{hidden:true});
  view.patch('sidebar-tool-display',{hidden:false});
  view.patch('sidebar-tool-settings-open',{hidden:false});
  view.patch('sidebar-tool-remove',{hidden:false});
  const actions=[{id:'refresh',label:'刷新',icon:'refresh',priority:3},
    {id:'edit',label:'编辑',priority:0,disabledReason:'请先保存当前草稿'}];
  view.patch('sidebar-tool-header-actions',{hidden:false,data:{scope:'scope-1',actions}});
  const calls=[];
  view.bind('sidebar-tool-header-actions','activate',payload=>calls.push(payload));
  const mount=f.document.createElement('div');f.document.body.append(mount);
  const root=createRoot(mount);
  let props={view};
  const render=async patch=>React.act(async()=>{
    props={...props,...patch};root.render(React.createElement(ToolHost,props));await tick();
  });
  t.after(async()=>{
    await React.act(async()=>{root.unmount();await tick();});
    mount.remove();view.dispose();await f.close();
  });
  const patch=async(id,values)=>React.act(async()=>{view.patch(id,values);await tick();});
  const trigger=()=>mount.querySelector('#sidebar-tool-header-actions-trigger');
  const menu=()=>mount.querySelector('[role="menu"]');
  const items=()=>[...menu().querySelectorAll('[role="menuitem"]')];
  const key=async value=>{
    const event=new f.window.Event('keydown',{bubbles:true,cancelable:true});
    Object.defineProperty(event,'key',{value});
    await React.act(async()=>{f.document.activeElement.dispatchEvent(event);await tick();});
    return event;
  };
  await render();
  assert.equal(mount.querySelectorAll('#sidebar-tool-settings-open').length,1);
  assert.equal(mount.querySelectorAll('#sidebar-tool-remove').length,1);
  assert.equal(trigger().getAttribute('aria-haspopup'),'menu');
  trigger().focus();await key('ArrowDown');
  assert.deepEqual(items().map(node=>node.firstElementChild.textContent),['刷新','编辑']);
  assert.equal(f.document.activeElement,items()[0]);
  await key('End');assert.equal(f.document.activeElement,items()[1]);
  assert.equal(items()[1].getAttribute('aria-disabled'),'true');
  assert.equal(f.document.getElementById(items()[1].getAttribute('aria-describedby')).textContent,'请先保存当前草稿');
  await f.clickNode(items()[1]);assert.equal(calls.length,0);assert.ok(menu());
  await key('Home');assert.equal(f.document.activeElement,items()[0]);
  await key('ArrowUp');assert.equal(f.document.activeElement,items()[1]);
  await key('Escape');assert.equal(menu(),null);assert.equal(f.document.activeElement,trigger());
  await f.clickNode(trigger());
  await f.clickNode(items()[0]);
  assert.deepEqual(calls,[{actionId:'refresh',scope:'scope-1'}]);
  assert.equal(menu(),null);assert.equal(f.document.activeElement,trigger());
  await f.clickNode(trigger());
  const tab=await key('Tab');
  assert.equal(tab.defaultPrevented,false,'native Tab can advance from the restored trigger');
  assert.equal(menu(),null);assert.equal(f.document.activeElement,trigger());
  await f.clickNode(trigger());
  await React.act(async()=>{
    f.document.body.dispatchEvent(new f.window.Event('pointerdown',{bubbles:true}));await tick();
  });
  assert.equal(menu(),null);
  // Model only host-observable focus events: opaque iframe internals remain
  // inaccessible, and their keyboard events never reach this document.
  const businessInput=f.document.createElement('input');mount.append(businessInput);
  const focusFrame=f.document.createElement('iframe');mount.append(focusFrame);
  const focusListeners=new Set();
  const focusTargets=[[f.document,'focusin'],[f.window,'blur']];
  const originalMethods=focusTargets.map(([target,type])=>{
    const add=target.addEventListener,remove=target.removeEventListener;
    target.addEventListener=function(name,listener,...rest){
      if(name===type)focusListeners.add(listener);
      return add.call(this,name,listener,...rest);
    };
    target.removeEventListener=function(name,listener,...rest){
      if(name===type)focusListeners.delete(listener);
      return remove.call(this,name,listener,...rest);
    };
    return {target,add,remove};
  });
  try{
    assert.equal(focusListeners.size,0,'closed menu has no focus observers');
    for(const [target,eventTarget,eventType] of [
      [focusFrame,f.window,'blur'],
      [businessInput,businessInput,'focusin'],
      // Window blur may precede the browser exposing IFRAME as activeElement.
      [f.document.body,f.window,'blur']
    ]){
      await f.clickNode(trigger());
      assert.equal(focusListeners.size,2,'open menu observes only host focus');
      await React.act(async()=>{
        items()[1].focus();
        items()[1].dispatchEvent(new f.window.Event('focusin',{bubbles:true}));
        await tick();
      });
      assert.ok(menu(),'focus within the menu keeps it open');
      await React.act(async()=>{
        target.focus();
        eventTarget.dispatchEvent(new f.window.Event(eventType,{bubbles:eventType==='focusin'}));
        await tick();
      });
      assert.equal(menu(),null,eventType+' closes More without iframe events');
      assert.equal(f.document.activeElement,target,'dismissal preserves the new business focus');
      assert.equal(focusListeners.size,0,'dismissal removes focus observers');
    }
    await f.clickNode(trigger());
    await key('Escape');
    assert.equal(focusListeners.size,0,'Escape also removes focus observers');
    assert.equal(f.document.activeElement,trigger(),'Escape retains trigger focus restore');
    await f.clickNode(trigger());await render({active:false});
    assert.equal(menu(),null);
    assert.equal(focusListeners.size,0,'hiding the host cleans up open-menu observers');
    await render({active:true});
    businessInput.focus();
    f.window.dispatchEvent(new f.window.Event('blur'));
    assert.equal(f.document.activeElement,businessInput,'closed menu does not steal focus');
  }finally{
    for(const {target,add,remove} of originalMethods){
      target.addEventListener=add;target.removeEventListener=remove;
    }
    businessInput.remove();focusFrame.remove();
  }
  await f.clickNode(trigger());
  await patch('sidebar-tool-header-actions',{data:{scope:'scope-2'}});
  assert.equal(menu(),null,'scope replacement closes old actions');
  assert.equal(f.document.activeElement,trigger());
  await f.clickNode(trigger());await f.clickNode(items()[0]);
  assert.deepEqual(calls.at(-1),{actionId:'refresh',scope:'scope-2'});
  await f.clickNode(trigger());
  await patch('sidebar-tool-header-actions',{data:{actions:[{...actions[0],label:'重新刷新'}]}});
  assert.equal(menu(),null,'a changed action snapshot closes the menu');
  await f.clickNode(trigger());
  await patch('sidebar-tool-header-actions',{disabled:true,data:{disabledReason:'正在保存'}});
  assert.equal(menu(),null);assert.equal(trigger().disabled,true);
  assert.equal(f.document.activeElement,mount.querySelector('#sidebar-tool-settings-open'),
    'disabling the trigger restores focus to an available fixed control');
  assert.equal(trigger().title,'正在保存');
  assert.equal(f.document.getElementById(trigger().getAttribute('aria-describedby')).textContent,'正在保存');
  await patch('sidebar-tool-header-actions',{disabled:false,data:{disabledReason:''}});
  assert.equal(menu(),null,'unlocking does not reopen the menu');
  for(const [id,values,restore] of [
    ['sidebar-tool-header-actions',{hidden:true},{hidden:false}],
    ['sidebar-tool-display',{hidden:true},{hidden:false}],
    ['sidebar-tool-settings-view',{hidden:false},{hidden:true}],
    ['sidebar-tool-preview',{hidden:false},{hidden:true}],
    ['sidebar-tool-import',{hidden:false},{hidden:true}],
    ['sidebar-tool-action-review',{hidden:false},{hidden:true}]
  ]){
    await f.clickNode(trigger());await patch(id,values);
    assert.equal(menu(),null,id);assert.equal(trigger(),null,id);
    await patch(id,restore);assert.equal(menu(),null,id+' stays closed');
  }
  for(const change of [{active:false},{concealed:true}]){
    await f.clickNode(trigger());await render(change);
    assert.equal(menu(),null);assert.equal(trigger(),null);
    await render({active:true,concealed:false});assert.equal(menu(),null);
  }
  await patch('sidebar-tool-header-actions',{data:{actions:[]}});
  assert.equal(trigger(),null,'empty actions have no More button');
  assert.equal(menu(),null);
  const frame=mount.querySelector('#sidebar-tool-frame');
  const businessFrame=f.document.createElement('iframe');frame.append(businessFrame);
  const settings=mount.querySelector('#sidebar-tool-settings-open');
  const remove=mount.querySelector('#sidebar-tool-remove');
  const back=mount.querySelector('#sidebar-tool-back');
  for(const malformed of [null,{},'bad',[null,{id:'bad',label:{}}]]){
    await patch('sidebar-tool-header-actions',{data:{actions:malformed}});
    assert.equal(trigger(),null,'malformed projection is safely hidden');
    assert.equal(mount.querySelector('#sidebar-tool-frame'),frame);
    assert.equal(frame.firstElementChild,businessFrame);
  }
  await patch('sidebar-tool-header-actions',{data:{actions,scope:'fault-scope'}});
  await f.clickNode(trigger());
  const cyclic={};cyclic.self=cyclic;
  const priorError=console.error;
  try{
    console.error=()=>{}; // The intentional render fault is asserted below.
    await patch('sidebar-tool-header-actions',{data:{actions:[{...actions[0],priority:cyclic}]}});
  }finally{console.error=priorError;}
  assert.equal(trigger(),null,'a slot rendering failure hides only its boundary');
  assert.equal(menu(),null);
  for(const [id,node] of [['sidebar-tool-settings-open',settings],['sidebar-tool-remove',remove],['sidebar-tool-back',back]])
    assert.equal(mount.querySelector('#'+id),node,'fixed toolbar remains mounted');
  assert.equal(mount.querySelector('#sidebar-tool-frame'),frame);
  assert.equal(frame.firstElementChild,businessFrame,'business iframe survives the slot failure');
  await patch('sidebar-tool-header-actions',{data:{actions,scope:'recovered-scope'}});
  assert.ok(trigger(),'a new scope recovers the slot');
  assert.equal(menu(),null);
  await f.clickNode(trigger());await f.clickNode(items()[0]);
  assert.deepEqual(calls.at(-1),{actionId:'refresh',scope:'recovered-scope'});
  assert.equal(frame.firstElementChild,businessFrame);
  // Parsed CSS + real component selectors protect the layout contract before
  // Chromium measures actual pixels. This is not a computed-layout assertion.
  const stylesheet=postcss.parse(await read('src/ui/tool-shell.css'));
  const title=mount.querySelector('#sidebar-tool-title');
  const header=title.closest('.sidebar-tool-view-head');
  const declarations=(node,width,coarse)=>{
    const result={};
    stylesheet.walkRules(rule=>{
      let matches=false;
      try{matches=node.matches(rule.selector);}catch{return;}
      if(!matches)return;
      for(let parent=rule.parent;parent;parent=parent.parent){
        if(parent.type!=='atrule'||parent.name!=='media')continue;
        const mediaMatches=parent.params.split(',').some(query=>{
          const min=query.match(/min-width:\s*(\d+)px/),max=query.match(/max-width:\s*(\d+)px/);
          return (!min||width>=Number(min[1]))&&(!max||width<=Number(max[1]))&&
            (!query.includes('pointer:coarse')||coarse)&&
            (!query.includes('pointer:fine')||!coarse);
        });
        if(!mediaMatches)return;
      }
      rule.nodes.filter(node=>node.type==='decl').forEach(decl=>{result[decl.prop]=decl.value;});
    });
    return result;
  };
  for(const width of [320,330]){
    const titleStyle=declarations(title,width,true);
    assert.equal(titleStyle['min-width'],'min(10ch,100%)','coarse '+width+' keeps readable title space');
    assert.equal(titleStyle['flex-basis'],'10ch');
    assert.equal(declarations(header,width,true)['flex-wrap'],'wrap');
    assert.equal(declarations(trigger(),width,true)['min-width'],'44px','core touch target is not shrunk');
  }
  for(const width of [180,240]){
    const titleStyle=declarations(title,width,true);
    assert.equal(titleStyle['min-width'],'0');
    assert.equal(titleStyle.flex,'1 1 calc(100% - max(44px,var(--od-icon-size)) - var(--space-2))',
      'original Back/title first-row reservation is retained at '+width);
    assert.equal(titleStyle['flex-basis'],undefined,'new title basis cannot override <=240px');
  }
  await patch('sidebar-tool-header-actions',{hidden:true});
  assert.equal(declarations(title,320,true)['min-width'],'0','optional slot does not restyle legacy headers');
  await patch('sidebar-tool-header-actions',{hidden:false});
  const icons=['new','edit','settings','diagnostics','subscriptions','library','list','refresh'];
  const renderedPaths=[];
  for(const icon of icons){
    await patch('sidebar-tool-header-actions',{data:{actions:[{id:'icon-action',label:'操作',icon}]}});
    await f.clickNode(trigger());
    const glyph=items()[0].querySelector('svg');
    assert.ok(glyph,icon+' has a local glyph');
    assert.equal(glyph.getAttribute('aria-hidden'),'true');
    renderedPaths.push(glyph.querySelector('path').getAttribute('d'));
    assert.equal(items()[0].textContent,'操作','icon never replaces the accessible label');
  }
  assert.equal(new Set(renderedPaths).size,icons.length,'each supported icon has distinct geometry');
  for(const icon of ['__proto__','M0 0L99 99','https://example.test/icon.svg']){
    await patch('sidebar-tool-header-actions',{data:{actions:[{id:'icon-action',label:'操作',icon}]}});
    await f.clickNode(trigger());
    assert.equal(items()[0].querySelector('svg'),null,'unknown strings cannot supply icon geometry');
  }
});
