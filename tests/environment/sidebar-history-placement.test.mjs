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
async function fixture({model=TRUSTED_HISTORY_INITIAL_STATE,detail=false,
  activeTab='tools',debugEnabled=true}={}){
  const toolView=createSidebarToolsView();
  toolView.patch('sidebar-tool-display',{hidden:!detail});
  try{
    const {document}=parseHTML(await renderSidebarFixture({
      activeTab,debugEnabled,toolView,browserHistoryModel:model
    }));
    return document;
  }finally{toolView.dispose();}
}

test('Extensions stays focused on extension lifecycle; History is not a bottom entry',async()=>{
  const doc=await fixture({activeTab:'tools'});
  const extension=doc.getElementById('extension-center');
  const history=doc.getElementById('trusted-history-panel');
  assert.ok(extension,'extension list is still present');
  assert.ok(history,'developer diagnostics retain the trusted history tool');
  assert.equal(doc.querySelector('#workbench-tools #trusted-history-panel'),null);
  assert.equal(doc.querySelector('#sidebar-tool-list-view #trusted-history-panel'),null);
  assert.equal(doc.querySelector('#extension-center #trusted-history-panel'),null);
  assert.equal(history.closest('#workbench-debug')?.id,'workbench-debug');
  assert.equal(visible(history),false,'history is not visible from Extensions');
  assert.equal(visible((await fixture({activeTab:'tools',detail:true}))
    .getElementById('trusted-history-panel')),false);
  const release=await fixture({activeTab:'tools',debugEnabled:false});
  assert.equal(release.getElementById('trusted-history-panel'),null,
    'ordinary release never mounts privileged diagnostic UI');
  assert.equal(release.getElementById('sidebar-host-browser-tools'),null);
});

test('Developer Debug page keeps history available behind its deliberate entry',async()=>{
  const doc=await fixture({activeTab:'debug'});
  const region=doc.getElementById('sidebar-host-browser-tools');
  assert.equal(region?.tagName,'SECTION');
  assert.match(region.getAttribute('aria-label'),/浏览器工具/);
  assert.equal(region.closest('#workbench-debug')?.id,'workbench-debug');
  const history=doc.getElementById('trusted-history-panel');
  assert.equal(history?.tagName,'DETAILS');
  assert.equal(visible(history),true);
  assert.equal(doc.querySelectorAll('#trusted-history-panel').length,1);
  const other=await fixture({activeTab:'tasks'});
  assert.equal(visible(other.getElementById('trusted-history-panel')),false);
  const disabled=await fixture({activeTab:'debug',model:null});
  assert.equal(disabled.getElementById('sidebar-host-browser-tools'),null);
  assert.equal(disabled.getElementById('trusted-history-panel'),null);
});

test('Null snapshots remove private history without leaking results into extension rows',async()=>{
  const shown=await fixture({activeTab:'debug',model:{
    ...TRUSTED_HISTORY_INITIAL_STATE,visits:[{url:'https://private.example',title:'Private'}]
  }});
  assert.match(shown.getElementById('trusted-history-results').textContent,/private.example/);
  const removed=await fixture({activeTab:'debug',model:null});
  assert.equal(removed.querySelector('#trusted-history-panel'),null);
  assert.doesNotMatch(removed.body.textContent,/private.example/);
});

test('History Host retains Side Panel identity and developer gate; preview has no authority',async()=>{
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
  assert.match(shell,/if\(actualSidePanel&&debugEnabled\)\{\s*trustedHistoryWorkbench=historyUI\?\.create\(\{[^}]*reactUI:extensionList/);
  assert.match(shell,/shellClosed=true;trustedHistoryWorkbench\?\.dispose\(\)/);
  const sidecar=await readFile('src/entrypoints/trusted-cookie-ui.js','utf8');
  assert.doesNotMatch(sidecar,/mountTrustedHistoryWorkbench|mount:/);
  assert.match(sidecar,/create:createTrustedHistoryWorkbench/);
  const preview=await readFile('scripts/preview/build-sidebar-six-react-preview.mjs','utf8');
  assert.match(preview,/app\.renderBrowserHistory\(\{text:'',startDate:'',endDate:''/);
  assert.match(preview,/app\.connectBrowserHistoryActions\(null\)/);
  assert.match(preview,/UI_PREVIEW_ONLY/);
});
