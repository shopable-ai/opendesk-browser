import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrowserScreenshotResources} from '../../src/platform/chrome/browser-screenshot-resources.js';
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAVs7gNYAAAAASUVORK5CYII=';
const owner=id=>({toolId:id,installEpoch:'install-1',packageHash:'e'.repeat(64)});
const target={tabId:33,documentId:'doc-A',url:'https://example.org/page',incognito:false};
const codeIs=id=>error=>error?.code===id;
function fixture(){
 let now=1000,downloadId=10;
 const calls=[];
 const api={downloads:{download:async options=>{calls.push(options);return downloadId++}}};
 let tokenCount=0;
 const store=createBrowserScreenshotResources({api,clock:{now:()=>now},
  createRef:()=>('screenshot-ref-'+String(++tokenCount).padEnd(22,'X'))});
 const args={data:png,mimeType:'image/png',bytes:68,target,context:owner('tool-a')};
 return {store,args,calls,step:ms=>now+=ms};
}
test('private screenshot storage only returns an opaque receipt and starts a Save As PNG download',async()=>{
 const f=fixture(),created=await f.store.createResource(f.args);
 assert.deepEqual(Object.keys(created),['resourceRef']);
 const got=await f.store.deliver(created.resourceRef,owner('tool-a'),async()=>true);
 assert.deepEqual(got,{resourceRef:created.resourceRef,downloadId:10,bytes:68});
 assert.equal(f.calls.length,1);
 assert.equal(f.calls[0].saveAs,true);
 assert.equal(f.calls[0].conflictAction,'uniquify');
 assert.match(f.calls[0].filename,/^OpenDesk-screenshot-.*\.png$/);
 assert.equal(f.calls[0].url,png);
 assert(!JSON.stringify(got).includes('base64'));
 assert.deepEqual(f.store.inspect(got.resourceRef,owner('tool-a')),
   {downloadId:10,bytes:68,expiresAt:601000});
 assert.deepEqual(f.store.diagnostics(),{pending:0,receipts:1});
 await assert.rejects(f.store.deliver(got.resourceRef,owner('tool-a'),async()=>true),codeIs('E_RESOURCE_REF_INVALID'));
});
test('wrong owner, expired resource, revoked tool and foreign target cannot read image',async()=>{
 const f=fixture(),created=await f.store.createResource(f.args);
 await assert.rejects(f.store.deliver(created.resourceRef,owner('tool-b'),async()=>true),codeIs('E_RESOURCE_REF_INVALID'));
 assert.equal(f.calls.length,0);
 await assert.rejects(f.store.deliver(created.resourceRef,owner('tool-a'),async()=>false),codeIs('E_SITE_PERMISSION_REVOKED'));
 assert.equal(f.calls.length,0);
 f.store.revokeTab(target.tabId);
 await assert.rejects(f.store.deliver(created.resourceRef,owner('tool-a'),async()=>true),codeIs('E_RESOURCE_REF_INVALID'));
 const another=await f.store.createResource(f.args);
 f.step(30001);
 await assert.rejects(f.store.deliver(another.resourceRef,owner('tool-a'),async()=>true),codeIs('E_RESOURCE_REF_INVALID'));
 await assert.rejects(f.store.createResource({...f.args,target:{...target,url:'chrome://extensions'}}),codeIs('E_TARGET'));
});
test('download reference cannot be reused after unconfirmed Chrome outcome',async()=>{
 let calls=0;
 const store=createBrowserScreenshotResources({
  api:{downloads:{download:async()=>{calls++;throw Error('Download uncertain')}}},
  createRef:()=>('receipt-'+('q'.repeat(40)))});
 const row=await store.createResource({data:png,mimeType:'image/png',bytes:68,target,context:owner('tool-a')});
 await assert.rejects(store.deliver(row.resourceRef,owner('tool-a'),async()=>true),codeIs('E_OUTCOME_UNKNOWN'));
 await assert.rejects(store.deliver(row.resourceRef,owner('tool-a'),async()=>true),codeIs('E_RESOURCE_REF_INVALID'));
 assert.equal(calls,1);
});
test('revocation while download is pending never reports success from obsolete authority',async()=>{
 let release,start;
 const signal=new Promise(resolve=>release=resolve);
 const started=new Promise(resolve=>start=resolve);
 const store=createBrowserScreenshotResources({
  api:{downloads:{download:()=>{start();return signal}}},
  createRef:()=>('receipt-'+('r'.repeat(40)))});
 const row=await store.createResource({data:png,mimeType:'image/png',bytes:68,target,context:owner('tool-a')});
 const pending=store.deliver(row.resourceRef,owner('tool-a'),async()=>true);
 await started;
 store.revokeAll();
 release(11);
 await assert.rejects(pending,codeIs('E_OUTCOME_UNKNOWN'));
 assert.deepEqual(store.diagnostics(),{pending:0,receipts:0});
});
