import test from 'node:test';
import assert from 'node:assert/strict';
import {isActualSidePanelContext} from '../../src/ui/tool-shell.js';

const href='chrome-extension://abcdefghijklmnopabcdefghijklmnop/ui/tool.html?hostInstanceId=owner-123';
function fixture(contexts){
  return {runtime:{getContexts:async options=>{
    assert.deepEqual(options,{contextTypes:['SIDE_PANEL'],documentUrls:[href]});
    return contexts;
  }}};
}
test('R24.3 authentic Side Panel context wins over tab-like getCurrent heuristics',async()=>{
  const api=fixture([{contextType:'SIDE_PANEL',documentUrl:href,documentId:'doc-sidepanel',tabId:32}]);
  assert.equal(await isActualSidePanelContext({api,href}),true);
});
test('R24.3 other extension tabs, catalogs and unrelated Side Panels never inherit authority',async()=>{
  for(const item of [
    {contextType:'TAB',documentUrl:href,documentId:'doc-tab'},
    {contextType:'SIDE_PANEL',documentUrl:href+'&other=1',documentId:'other'},
    {contextType:'SIDE_PANEL',documentUrl:href,documentId:''}
  ])assert.equal(await isActualSidePanelContext({api:fixture([item]),href}),false);
  assert.equal(await isActualSidePanelContext({api:fixture([]),href}),false);
});
test('R24.3 unavailable context API fails closed for tab classification',async()=>{
  assert.equal(await isActualSidePanelContext({api:{runtime:{}},href}),false);
  const api={runtime:{getContexts:async()=>{throw Error('Chrome context list unavailable')}}};
  assert.equal(await isActualSidePanelContext({api,href}),false);
});
