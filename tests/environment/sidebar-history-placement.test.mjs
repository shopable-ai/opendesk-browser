import {renderSidebarFixture} from '../helpers/sidebar-react-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {TRUSTED_HISTORY_INITIAL_STATE} from '../../src/ui/trusted-history-workbench.js';
import {createSidebarToolsView} from '../../src/ui/sidebar-tools-view.js';
import {isActualSidePanelContext} from '../../src/ui/sidepanel-context.js';

const hostInstanceId='01234567-89ab-4def-8123-456789abcdef';
const visible=node=>Boolean(node)&&!node.hidden&&(!node.parentElement||visible(node.parentElement));
async function fixture({model=TRUSTED_HISTORY_INITIAL_STATE,detail=false,activeTab='tools'}={}){
  const toolView=createSidebarToolsView();
  toolView.patch('sidebar-tool-display',{hidden:!detail});
  try{
    const {document}=parseHTML(await renderSidebarFixture({activeTab,toolView,browserHistoryModel:model}));
    return document;
  }finally{toolView.dispose();}
}

test('React host history belongs to the browser-tools list, never current tool or discovery content',async()=>{
  const doc=await fixture(),history=doc.getElementById('trusted-history-panel');
  assert.ok(history,'positive Side Panel model exposes history');
  assert.equal(history.tagName,'DETAILS');
  assert.equal(history.parentElement.id,'sidebar-host-browser-tools');
  assert.equal(history.closest('#sidebar-tool-list-view')?.id,'sidebar-tool-list-view');
  assert.equal(doc.querySelector('#sidebar-tool-display #trusted-history-panel'),null);
  assert.equal(doc.querySelector('#extension-center #trusted-history-panel'),null);
  assert.equal(visible(history),true);
  const detail=await fixture({detail:true});
  assert.equal(visible(detail.getElementById('trusted-history-panel')),false,'opening tools and previews hides the list-owned entry');
  const other=await fixture({activeTab:'tasks'});
  assert.equal(visible(other.getElementById('trusted-history-panel')),false);
  assert.equal(visible((await fixture()).getElementById('trusted-history-panel')),true,'return to the list restores the entry');
});

test('one React owner renders history once and null removes private results',async()=>{
  const shown=await fixture({model:{...TRUSTED_HISTORY_INITIAL_STATE,visits:[{url:'https://private.example',title:'Private'}]}});
  assert.equal(shown.querySelectorAll('#trusted-history-panel').length,1);
  assert.match(shown.getElementById('trusted-history-results').textContent,/private.example/);
  const removed=await fixture({model:null});
  assert.equal(removed.getElementById('trusted-history-panel'),null);
  assert.doesNotMatch(removed.body.textContent,/private.example/);
});

test('the real React shell labels browser tools and omits the region before trusted admission',async()=>{
  const doc=await fixture();
  assert.equal(doc.querySelectorAll('#sidebar-host-browser-tools').length,1);
  const region=doc.getElementById('sidebar-host-browser-tools');
  assert.equal(region.tagName,'SECTION');
  assert.match(region.getAttribute('aria-label'),/浏览器工具/);
  assert.equal(region.closest('#sidebar-tool-list-view')?.id,'sidebar-tool-list-view');
  const unclassified=await fixture({model:null});
  assert.equal(unclassified.getElementById('sidebar-host-browser-tools'),null);
  assert.equal(unclassified.getElementById('trusted-history-panel'),null);
});

test('History initializes only after positive Side Panel proof and receives the existing React renderer',async()=>{
  const href='chrome-extension://test/sidepanel.html?hostInstanceId='+hostInstanceId;
  const api=contexts=>({runtime:{getURL:path=>'chrome-extension://test/'+path,getContexts:async()=>contexts}});
  assert.equal(await isActualSidePanelContext({api:api([
    {contextType:'SIDE_PANEL',documentUrl:href,documentId:'real-document'}
  ]),href}),true);
  assert.equal(await isActualSidePanelContext({api:api([
    {contextType:'TAB',documentUrl:href,documentId:'tool-page'}
  ]),href}),false);
  assert.equal(await isActualSidePanelContext({api:api([
    {contextType:'SIDE_PANEL',documentUrl:href,documentId:'private-document',incognito:true}
  ]),href}),false);
  assert.equal(await isActualSidePanelContext({api:{runtime:{}},href}),false);
  const shell=await readFile('src/ui/tool-shell.js','utf8');
  assert.doesNotMatch(shell,/historyUI\?\.mount/);
  assert.match(shell,/if\(actualSidePanel&&!historyClosed\)\{\s*trustedHistoryWorkbench=historyUI\?\.create\(\{[^}]*reactUI:extensionList/);
  assert.match(shell,/historyClosed=true;trustedHistoryWorkbench\?\.dispose\(\)/,'pagehide cancels pending initialization and disposes private UI');
  const sidecar=await readFile('src/entrypoints/trusted-cookie-ui.js','utf8');
  assert.doesNotMatch(sidecar,/mountTrustedHistoryWorkbench|mount:/);
  assert.match(sidecar,/create:createTrustedHistoryWorkbench/);
});
