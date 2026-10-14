import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {mountTrustedHistoryWorkbench} from '../../src/ui/trusted-history-workbench.js';
import {isActualSidePanelContext} from '../../src/ui/tool-shell.js';

const hostInstanceId='01234567-89ab-4def-8123-456789abcdef';

class Element {
  constructor(tag='div',id='') {
    this.tag=tag;this.id=id;this.children=[];this.hidden=false;this.attributes={};
  }
  append(...children) {
    for(const child of children){child.parentElement=this;this.children.push(child);}
  }
  setAttribute(key,value){this.attributes[key]=value;}
}

function fixture({browserTools=true}={}) {
  const tools=new Element('div','workbench-tools');
  const list=new Element('div','sidebar-tool-list-view');
  const installed=new Element('section','sidebar-tool-my-panel');
  const browser=new Element('section','sidebar-host-browser-tools');
  browser.hidden=true;
  const display=new Element('section','sidebar-tool-display');
  const discovery=new Element('section','sidebar-tool-discover-panel');
  tools.append(list,display);list.append(installed,discovery);
  if(browserTools)installed.append(browser);
  const find=(node,id)=>node.id===id?node:node.children.map(child=>find(child,id)).find(Boolean);
  const doc={getElementById:id=>find(tools,id),createElement:tag=>new Element(tag)};
  const visible=node=>Boolean(node)&&!node.hidden&&(!node.parentElement||visible(node.parentElement));
  return {doc,tools,list,installed,browser,display,discovery,visible};
}

test('host history belongs to the browser-tools list, never the current tool or discovery view',()=>{
  const f=fixture();mountTrustedHistoryWorkbench(f.doc);
  const history=f.doc.getElementById('trusted-history-panel');
  assert.ok(history,'host history must remain available');
  assert.equal(history.parentElement,f.browser);
  assert.equal(history.tag,'details','query stays explicitly expandable');
  assert.equal(f.visible(history),true);
  // The existing tool host hides its list for installed tools, toolId tabs and
  // previewId tabs; no tool-specific ID or privilege can make this UI follow it.
  for(const view of ['installed-tool','toolId-tab','previewId-tab']){
    f.list.hidden=true;f.display.hidden=false;
    assert.equal(f.visible(history),false,view);
    assert.equal(f.display.children.length,0,'mount must not add tool content');
    f.list.hidden=false;f.display.hidden=true;
    assert.equal(f.visible(history),true,'returning to the list restores the entry');
  }
  f.discovery.hidden=false;
  assert.equal(f.discovery.children.length,0,'official discovery never owns history DOM');
  f.tools.hidden=true;
  assert.equal(f.visible(history),false,'other workbench tabs never show history');
});

test('history mount is idempotent and never falls back to the whole tools Tab',()=>{
  const f=fixture();mountTrustedHistoryWorkbench(f.doc);mountTrustedHistoryWorkbench(f.doc);
  assert.equal(f.browser.children.length,1);
  const missing=fixture({browserTools:false});mountTrustedHistoryWorkbench(missing.doc);
  assert.equal(missing.doc.getElementById('trusted-history-panel'),undefined);
  assert.equal(missing.tools.children.length,2);
  assert.doesNotThrow(()=>mountTrustedHistoryWorkbench({getElementById:()=>null}));
});

test('the real shell provides one separately labelled host browser-tools container inside the installed list',async()=>{
  const html=await readFile('src/ui/tool.html','utf8');
  const list=html.slice(html.indexOf('id="sidebar-tool-list-view"'),html.indexOf('id="sidebar-tool-display"'));
  assert.equal((html.match(/id="sidebar-host-browser-tools"/g)||[]).length,1);
  assert.match(list,/<section id="sidebar-host-browser-tools"[^>]*aria-label="浏览器工具"/);
  assert.match(list,/浏览器工具[\s\S]*OpenDesk 内置界面/);
  assert.doesNotMatch(html,/id="trusted-history-panel"/,'only the audited mount creates history DOM');
  assert.match(list,/<section id="sidebar-host-browser-tools"[^>]*\bhidden>/,'unclassified documents never show an empty History region');
});

test('History initializes only after positive Side Panel proof, never from the tab-less fallback',async()=>{
  const href='chrome-extension://test/ui/tool.html?hostInstanceId='+hostInstanceId;
  assert.equal(await isActualSidePanelContext({api:{runtime:{getContexts:async()=>[
    {contextType:'SIDE_PANEL',documentUrl:href,documentId:'real-document'}
  ]}},href}),true);
  assert.equal(await isActualSidePanelContext({api:{runtime:{getContexts:async()=>[
    {contextType:'TAB',documentUrl:href,documentId:'tool-page'}
  ]}},href}),false);
  assert.equal(await isActualSidePanelContext({api:{runtime:{}},href}),false);
  const shell=await readFile('src/ui/tool-shell.js','utf8');
  assert.doesNotMatch(shell.slice(0,shell.indexOf('Promise.resolve(chrome.tabs.getCurrent')),/historyUI\?\.mount\(document\)/);
  assert.match(shell,/if\(actualSidePanel&&!historyClosed\)\{\s*historyUI\?\.mount\(document\);\s*trustedHistoryWorkbench=historyUI\?\.create/);
  assert.match(shell,/historyClosed=true;trustedHistoryWorkbench\?\.dispose\(\)/,'pagehide cancels pending initialization and disposes the live component');
});
