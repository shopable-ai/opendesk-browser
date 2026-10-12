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
  close:id=>removed.forEach(fn=>fn(id))};
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
