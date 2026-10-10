import test from 'node:test';
import assert from 'node:assert/strict';
import {openPreviewSession,validatePreviewSession,PREVIEW_SESSION_FORMAT} from '../../src/ui/sidebar-tools/preview-session.js';
import {previewStorageKey} from '../../src/native-agent/tool-snapshot.js';
const id='00000000-0000-4000-8000-000000000001';
const tool={format:'opendesk.sidebar-tool.v1',id:'demo-preview',version:'1.0.0',
  title:'Preview',description:'readonly',capabilities:['storage.local'],html:'<main>Preview</main>',css:'',js:'void 0;'};
const sourceId='source-'+('b'.repeat(24)),workspaceId='workspace-00000000-0000-4000-8000-000000000002';
const snapshot={tool,sha256:'c'.repeat(64),buildId:'build-1'};
test('preview stores only an expiring validated local UI package and never installs',async()=>{
  const stored=new Map(),opened=[],now=100000;
  const api={runtime:{getURL:path=>'chrome-extension://test/'+path},storage:{session:{
    async set(items){for(const [k,v] of Object.entries(items))stored.set(k,v);},
    async remove(key){stored.delete(key);}
  }},tabs:{async create(row){opened.push(row);}}};
  const result=await openPreviewSession({api,workspaceId,sourceId,snapshot,now,id});
  assert.equal(result.readOnly,true);assert.equal(result.installed,false);
  assert.equal(opened[0].url,'chrome-extension://test/ui/tool.html?previewId='+id);
  const row=stored.get(previewStorageKey(id));
  assert.equal(row.format,PREVIEW_SESSION_FORMAT);
  assert.equal(validatePreviewSession(row,id,now+2000).tool.id,tool.id);
  assert.throws(()=>validatePreviewSession(row,id,now+600001),/expired/);
  assert.throws(()=>validatePreviewSession({...row,tool:{...tool,capabilities:['chrome.tabs']}},id,now),/能力/);
});
test('failed tab creation revokes its transient preview payload',async()=>{
  const keys=new Set();
  const api={runtime:{getURL:p=>'chrome-extension://test/'+p},
    storage:{session:{set:async row=>Object.keys(row).forEach(x=>keys.add(x)),
      remove:async key=>{keys.delete(key);}}},
    tabs:{create:async()=>{throw new Error('tab not available');}}};
  await assert.rejects(openPreviewSession({api,workspaceId,sourceId,snapshot,id}),/tab not available/);
  assert.equal(keys.size,0);
});
