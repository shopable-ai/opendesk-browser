import test from 'node:test';
import assert from 'node:assert/strict';
import {openPreviewSession,updatePreviewSession,validatePreviewSession,PREVIEW_SESSION_FORMAT} from '../../src/ui/sidebar-tools/preview-session.js';
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

test('hot update cannot switch preview to another Native workspace or tool identity',async()=>{
  const stored=new Map(),writes=[];
  const api={storage:{session:{
    async get(key){return {[key]:structuredClone(stored.get(key))};},
    async set(values){writes.push(values);for(const [k,v] of Object.entries(values))stored.set(k,structuredClone(v));},
    async remove(key){stored.delete(key);}
  }},runtime:{getURL:path=>'chrome-extension://test/'+path},
  tabs:{async create(){return {id:91};}}};
  const opened=await openPreviewSession({api,workspaceId,sourceId,snapshot,id,now:100000});
  assert.equal(opened.tabId,91);
  const newer={...snapshot,sha256:'d'.repeat(64),buildId:'build-2'};
  await assert.rejects(updatePreviewSession({api,previewId:id,workspaceId,
    sourceId:'source-'+('e'.repeat(24)),snapshot:newer,now:100300}),/owner has changed/);
  assert.equal(stored.get(previewStorageKey(id)).sha256,snapshot.sha256);
  const done=await updatePreviewSession({api,previewId:id,workspaceId,sourceId,snapshot:newer,now:100300});
  assert.equal(done.updated,true);
  assert.equal(stored.get(previewStorageKey(id)).sha256,newer.sha256);
  assert.equal(validatePreviewSession(stored.get(previewStorageKey(id)),id,100500).buildId,'build-2');
  const same=await updatePreviewSession({api,previewId:id,workspaceId,sourceId,snapshot:newer,now:100800});
  assert.equal(same.updated,false);
  assert.equal(writes.length,2);
});
