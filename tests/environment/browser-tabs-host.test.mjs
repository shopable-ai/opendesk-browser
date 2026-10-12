import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrowserTabHost,browserTabUrl} from '../../src/platform/chrome/browser-tabs.js';
const owner=(id='tool-a',epoch='epoch-a')=>({toolId:id,installEpoch:epoch,packageHash:'f'.repeat(64)});
const code=expected=>e=>e?.code===expected;
function fixture(){
 const items=new Map(),removed=[],updated=[],operations=[];
 const api={tabs:{
  onRemoved:{addListener:fn=>removed.push(fn)},
  onUpdated:{addListener:fn=>updated.push(fn)},
  create:async({url})=>{const id=200+items.size;const tab={id,url};items.set(id,tab);operations.push('create');return tab},
  get:async id=>{if(!items.has(id))throw Error('missing');return items.get(id)},
  update:async(id,val)=>{operations.push('focus');items.set(id,{...items.get(id),...val});return items.get(id)},
  remove:async id=>{operations.push('remove');items.delete(id)}
 }};
 return {api,items,operations,navigate:(id,url)=>{items.set(id,{...items.get(id),url});updated.forEach(fn=>fn(id,{url}))},
  close:id=>removed.forEach(fn=>fn(id)),
  emitUpdated:(id,change)=>updated.forEach(fn=>fn(id,change))};
}
const ref='ref_'+('k'.repeat(40));
test('HTTPS open returns only opaque ref and owner can focus it',async()=>{
 const f=fixture();let checks=0;
 const host=createBrowserTabHost({api:f.api,createRef:()=>ref,authorize:async()=>{checks++;return true}});
 assert.deepEqual(await host.open({url:'https://example.org/private?token=secret'},owner()),{tabRef:ref});
 assert.deepEqual(await host.focus({tabRef:ref},owner()),{focused:true});
 assert.equal(checks,4);
 assert(!JSON.stringify({tabRef:ref}).includes('secret'));
});
test('cross-tool, raw tabId, and new install epoch cannot focus',async()=>{
 const f=fixture(),host=createBrowserTabHost({api:f.api,createRef:()=>ref,authorize:async()=>true});
 await host.open({url:'https://example.org'},owner());
 await assert.rejects(host.focus({tabRef:ref},owner('tool-b')),code('E_TAB_REF_INVALID'));
 await assert.rejects(host.focus({tabRef:ref},owner('tool-a','new-epoch')),code('E_TAB_REF_INVALID'));
 await assert.rejects(host.focus({tabId:200},owner()),code('E_SCHEMA'));
});
test('permission denial and post-create revocation block authority',async()=>{
 const f=fixture();let allowed=false;
 const host=createBrowserTabHost({api:f.api,authorize:async()=>allowed});
 await assert.rejects(host.open({url:'https://example.org'},owner()),code('E_SITE_GRANT_REQUIRED'));
 assert.equal(f.operations.length,0);
 let count=0;const other=createBrowserTabHost({api:f.api,authorize:async()=>++count===1});
 await assert.rejects(other.open({url:'https://example.org'},owner()),code('E_SITE_GRANT_REQUIRED'));
 assert.deepEqual(f.operations,['create','remove']);
});
test('navigation, close, revoke and worker restart invalidate refs',async()=>{
 const f=fixture();let n=0;
 const newRef=()=>ref+(++n);
 const host=createBrowserTabHost({api:f.api,createRef:newRef,authorize:async()=>true});
 const a=(await host.open({url:'https://example.org'},owner())).tabRef;
 f.navigate(200,'https://example.org/elsewhere');
 await assert.rejects(host.focus({tabRef:a},owner()),code('E_TAB_REF_INVALID'));
 const b=(await host.open({url:'https://example.org'},owner())).tabRef;
 f.close(201);
 await assert.rejects(host.focus({tabRef:b},owner()),code('E_TAB_REF_INVALID'));
 const c=(await host.open({url:'https://example.org'},owner())).tabRef;
 host.revokeTool('tool-a');
 await assert.rejects(host.focus({tabRef:c},owner()),code('E_TAB_REF_INVALID'));
 const restarted=createBrowserTabHost({api:f.api,authorize:async()=>true});
 await assert.rejects(restarted.focus({tabRef:c},owner()),code('E_TAB_REF_INVALID'));
});
test('invalid URLs and expired references never control arbitrary tabs',async()=>{
 const f=fixture();let at=1000;
 const host=createBrowserTabHost({api:f.api,createRef:()=>ref,clock:{now:()=>at},authorize:async()=>true});
 for(const url of ['javascript:alert(1)','file:///tmp/a','chrome://extensions','https://me:pw@host.test',null])
  await assert.rejects(host.open({url},owner()),code('E_SCHEMA'));
 assert.equal(f.operations.length,0);
 assert.equal(browserTabUrl('https://example.org/').origin,'https://example.org');
 await host.open({url:'https://example.org'},owner());
 at=601001;
 await assert.rejects(host.focus({tabRef:ref},owner()),code('E_TAB_REF_INVALID'));
});

test('first real Chrome loading event preserves a newly opened ref but later reload invalidates it',async()=>{
 const f=fixture();
 f.api.tabs.create=async({url})=>{
  const tab={id:299,url,status:'loading'};f.items.set(tab.id,tab);return tab;
 };
 const host=createBrowserTabHost({api:f.api,createRef:()=>ref,authorize:async()=>true});
 const tabRef=(await host.open({url:'https://example.org/initial'},owner())).tabRef;
 f.emitUpdated(299,{url:'https://example.org/initial',status:'loading'});
 assert.deepEqual(await host.focus({tabRef},owner()),{focused:true});
 f.items.set(299,{...f.items.get(299),status:'complete'});
 f.emitUpdated(299,{status:'complete'});
 f.emitUpdated(299,{status:'loading'});
 await assert.rejects(host.focus({tabRef},owner()),code('E_TAB_REF_INVALID'));
});

test('R5 security: missed Chrome onUpdated cannot reuse owned TabRef after same-Origin path navigation',async()=>{
 const f=fixture();
 f.api.webNavigation={getFrame:async({tabId})=>({
   documentId:'doc-'+tabId,url:f.items.get(tabId)?.url,documentLifecycle:'active'})};
 const host=createBrowserTabHost({api:f.api,createRef:()=>ref,authorize:async()=>true});
 const {tabRef}=await host.open({url:'https://example.org/initial'},owner());
 // Navigation is real in Chrome state, but this fixture deliberately drops onUpdated.
 f.items.set(200,{...f.items.get(200),url:'https://example.org/other-document'});
 await assert.rejects(host.resolve(tabRef,owner()),code('E_TAB_REF_INVALID'));
 await assert.rejects(host.focus({tabRef},owner()),code('E_TAB_REF_INVALID'));
});
test('R5 security: revoke during asynchronous Chrome document lookup invalidates TabRef',async()=>{
 const f=fixture();let enter,release;
 const entered=new Promise(resolve=>{enter=resolve});
 const blocked=new Promise(resolve=>{release=resolve});
 f.api.webNavigation={getFrame:async({tabId})=>{
   enter();await blocked;return {documentId:'doc-'+tabId,url:f.items.get(tabId)?.url,documentLifecycle:'active'};
 }};
 const host=createBrowserTabHost({api:f.api,createRef:()=>ref,authorize:async()=>true});
 const {tabRef}=await host.open({url:'https://example.org/initial'},owner());
 const pending=host.resolve(tabRef,owner());
 await entered;host.revokeTool('tool-a');release();
 await assert.rejects(pending,code('E_TAB_REF_INVALID'));
});
test('R5 security: revoke during Chrome tabs.get cannot focus a stale owned tab',async()=>{
 const f=fixture();let host;
 f.api.tabs.get=async id=>{host.revokeTool('tool-a');return f.items.get(id)};
 host=createBrowserTabHost({api:f.api,createRef:()=>ref,authorize:async()=>true});
 const {tabRef}=await host.open({url:'https://example.org/initial'},owner());
 await assert.rejects(host.focus({tabRef},owner()),code('E_TAB_REF_INVALID'));
 assert(!f.operations.includes('focus'),'No Chrome focus after authority was revoked');
});

test('R5 owned read/list never enumerates foreign or navigated TabRefs',async()=>{
 const f=fixture();
 f.api.webNavigation={getFrame:async({tabId})=>{
  const tab=f.items.get(tabId);return tab?{url:tab.url,documentId:'doc-'+tabId,documentLifecycle:'active'}:null}};
 const host=createBrowserTabHost({api:f.api,createRef:()=>ref,authorize:async()=>true});
 const {tabRef}=await host.open({url:'https://example.org/own'},owner());
 assert.equal((await host.getOwned({tabRef},owner())).url,'https://example.org/own');
 assert.deepEqual((await host.listOwned({},owner())).tabs,[{tabRef,origin:'https://example.org'}]);
 assert.deepEqual((await host.listOwned({},owner('tool-b'))).tabs,[]);
 await assert.rejects(host.getOwned({tabRef},owner('tool-b')),code('E_TAB_REF_INVALID'));
 f.items.set(200,{...f.items.get(200),url:'https://example.org/other'});
 assert.deepEqual((await host.listOwned({},owner())).tabs,[]);
 await assert.rejects(host.getOwned({tabRef},owner()),code('E_TAB_REF_INVALID'));
});
test('R5 owned close consumes TabRef, with unknown native outcome never retried',async()=>{
 const f=fixture();
 f.api.webNavigation={getFrame:async({tabId})=>{
  const tab=f.items.get(tabId);return tab?{url:tab.url,documentId:'doc-'+tabId,documentLifecycle:'active'}:null}};
 const host=createBrowserTabHost({api:f.api,createRef:()=>ref,authorize:async()=>true});
 const {tabRef}=await host.open({url:'https://example.org/own'},owner());
 let attempts=0;f.api.tabs.remove=async()=>{attempts++;throw Error('lost Chrome response')};
 await assert.rejects(host.closeOwned({tabRef},owner()),code('E_OUTCOME_UNKNOWN'));
 await assert.rejects(host.closeOwned({tabRef},owner()),code('E_TAB_REF_INVALID'));
 assert.equal(attempts,1);
});
