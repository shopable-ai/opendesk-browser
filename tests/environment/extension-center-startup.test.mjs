import test from 'node:test';
import assert from 'node:assert/strict';
import {createExtensionCenter} from '../../src/ui/extension-center.js';
import {SIDEBAR_TOOL_FORMAT,SIDEBAR_TOOL_STORE} from '../../src/ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE} from '../../src/ui/sidebar-tools/lifecycle.js';
import {createExtensionCenterDOM} from '../helpers/extension-center-react-dom.mjs';

const app={format:SIDEBAR_TOOL_FORMAT,id:'quick-notes',title:'快速笔记',description:'记录内容',version:'1.0.0',
  capabilities:['storage.local'],html:'<main>Notes</main>',css:'',js:'void 0;'};
const page={programId:'reader',manifestHash:'a'.repeat(64),title:'阅读增强',revision:1,
  enabled:true,nativeState:'registered',pageRules:{matches:['https://example.com/*']},
  authorization:{status:'active',generation:1,installationId:'reader-install'}};
const deferred=()=>Promise.withResolvers();
const until=async predicate=>{
  for(let i=0;i<100&&!predicate();i++)await new Promise(resolve=>setTimeout(resolve,5));
  assert.ok(predicate(),'independent list source did not render while the other source was pending');
};

function fixture(t,{apps=Promise.resolve([app]),pages=Promise.resolve({installed:[page]})}={}){
  const f=createExtensionCenterDOM(t),opened=[],connections=new Set(),calls=[];
  const api={runtime:{getURL:path=>'chrome-extension://fixture/'+path},storage:{
    local:{async get(keys){
      if(!Array.isArray(keys)||!keys.includes(SIDEBAR_TOOL_STORE))return {};
      return {[SIDEBAR_TOOL_STORE]:structuredClone(await (typeof apps==='function'?apps():apps)),[SIDEBAR_TOOL_ENABLE_STORE]:{}};
    }},onChanged:{addListener(){},removeListener(){}}
  }};
  const client={request(name){assert.equal(name,'listPagePrograms');calls.push(name);return typeof pages==='function'?pages():pages;},
    subscribeConnection(fn){connections.add(fn);return()=>connections.delete(fn);}};
  const ui=createExtensionCenter({api,client,doc:f.doc,extensionList:f.adapter,
    sidebarTools:{openTool(id){opened.push(id);return true;}},taskWorkbench:{navigate(){return true;}}});
  t.after(()=>ui.dispose());
  return {...f,ui,opened,calls,connect:(connected=true)=>{for(const fn of connections)fn({connected});},
    row:key=>f.doc.querySelector(`[data-extension-key="${key}"][data-extension-action="main"]`)};
}

test('installed apps render and open without waiting for Page authority',async t=>{
  const pages=deferred(),f=fixture(t,{pages:pages.promise});
  await until(()=>f.row('app:quick-notes'));
  assert.equal(f.state.feedbackModel.showEmpty,false);
  assert.equal(f.row('page:reader'),null,'pending Page state is not guessed');
  f.row('app:quick-notes').dispatch('click');
  assert.deepEqual(f.opened,['quick-notes']);
  pages.resolve({installed:[page]});
  await until(()=>f.row('page:reader'));
  assert.ok(f.row('app:quick-notes'));
});

test('installed Pages render without waiting for app storage and retain source failures',async t=>{
  const apps=deferred(),f=fixture(t,{apps:apps.promise});
  await until(()=>f.row('page:reader'));
  assert.equal(f.state.feedbackModel.showEmpty,false);
  assert.equal(f.row('app:quick-notes'),null);
  apps.reject(Error('app storage unavailable'));
  await until(()=>f.state.statusModel.text.includes('app storage unavailable'));
  assert.ok(f.row('page:reader'));
  assert.match(f.state.statusModel.text,/app storage unavailable/);
});

test('initial Host connection reuses the pending Page read; reconnect refreshes current facts',async t=>{
  const pages=deferred(),f=fixture(t,{pages:pages.promise});
  f.connect();
  assert.equal(f.calls.length,1,'initial request already waits for this Host connection');
  pages.resolve({installed:[page]});
  await until(()=>f.row('page:reader')&&f.row('app:quick-notes'));
  f.connect();
  assert.equal(f.calls.length,2,'a later connection must revalidate installation state');
});

test('a real reconnect refreshes Page facts while the independent app source is still pending',async t=>{
  const apps=deferred(),reads=[Promise.resolve({installed:[page]}),Promise.resolve({installed:[]})];
  const f=fixture(t,{apps:apps.promise,pages:()=>reads.shift()});
  f.connect();
  await until(()=>f.row('page:reader'));
  f.connect(false);f.connect();
  assert.equal(f.calls.length,2);
  await until(()=>!f.row('page:reader'));
  apps.resolve([app]);
  await until(()=>f.row('app:quick-notes'));
});

test('the first successful connection retries a failed Page read even while apps are pending',async t=>{
  const apps=deferred(),reads=[Promise.reject(Error('Host registration failed')),Promise.resolve({installed:[page]})];
  const f=fixture(t,{apps:apps.promise,pages:()=>reads.shift()});
  // The rejected transport settles before the next event-loop turn; catalog
  // fetch diagnostics may independently own the visible status in this fixture.
  await new Promise(resolve=>setImmediate(resolve));
  f.connect();
  assert.equal(f.calls.length,2);
  await until(()=>f.row('page:reader'));
  apps.resolve([app]);
  await until(()=>f.row('app:quick-notes'));
});

test('progressive rendering does not turn a pending or failed full readback into success',async t=>{
  const pages=deferred(),f=fixture(t,{pages:pages.promise});
  let complete=false;
  const readback=f.ui.refresh().then(result=>{complete=true;return result;});
  await until(()=>f.row('app:quick-notes'));
  assert.equal(complete,false,'an early app row is not a completed Page readback');
  pages.reject(Error('Page authority unavailable'));
  assert.equal(await readback,false);
  assert.ok(f.row('app:quick-notes'));
  assert.equal(f.row('page:reader'),null);
  assert.match(f.state.statusModel.text,/Page authority unavailable/);
});

test('empty state waits for both sources, and disposal ignores late Page results',async t=>{
  const pages=deferred(),f=fixture(t,{apps:Promise.resolve([]),pages:pages.promise});
  await new Promise(resolve=>setTimeout(resolve,15));
  assert.equal(f.state.feedbackModel.showEmpty,false);
  f.ui.dispose();pages.resolve({installed:[page]});
  await new Promise(resolve=>setTimeout(resolve,15));
  assert.equal(f.row('page:reader'),null);
});

test('late success or failure from a superseded refresh cannot replace current installed facts',async t=>{
  const oldApps=deferred(),oldPages=deferred();
  const appReads=[oldApps.promise,Promise.resolve([])],pageReads=[oldPages.promise,Promise.resolve({installed:[]})];
  const f=fixture(t,{apps:()=>appReads.shift(),pages:()=>pageReads.shift()});
  assert.equal(await f.ui.refresh(),true);
  assert.equal(f.state.feedbackModel.showEmpty,true);
  oldApps.reject(Error('stale failure'));oldPages.resolve({installed:[page]});
  await new Promise(resolve=>setTimeout(resolve,15));
  assert.equal(f.row('page:reader'),null);
  assert.equal(f.row('app:quick-notes'),null);
  assert.doesNotMatch(f.state.statusModel.text,/stale failure/);
});
