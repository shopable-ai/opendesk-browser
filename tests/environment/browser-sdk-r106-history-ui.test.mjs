import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {BROWSER_OPERATIONS,BROWSER_HOST_PROTOCOL} from '../../src/framework/sdk/browser-contract.js';
import {createTrustedHistoryWorkbench,normalizeTrustedHistoryForm} from '../../src/ui/trusted-history-workbench.js';

const hostInstanceId='01234567-89ab-4def-8123-456789abcdef';

import * as React from 'react';
import {historyReactFixture} from '../helpers/browser-history-react-fixture.mjs';

async function fixture(t,{granted=false,requestResult=true,response,sendMessage}={}){
  const calls=[];
  const api={
    permissions:{
      contains:async request=>{calls.push(['contains',structuredClone(request)]);return granted;},
      request(request){calls.push(['request',structuredClone(request)]);return Promise.resolve(requestResult);}
    },
    runtime:{sendMessage:async envelope=>{
      calls.push(['sendMessage',structuredClone(envelope)]);
      if(sendMessage)return sendMessage(envelope);
      return response??{ok:true,data:{visits:[{url:'https://example.com/path',title:'Example',lastVisitTime:Date.UTC(2026,9,3)}]}};
    }}
  };
  const f=await historyReactFixture(t,{api,hostInstanceId});
  for(const [field,value] of Object.entries({text:'example',startDate:'2026-10-01',endDate:'2026-10-07',limit:'3'}))
    await f.change(field,value);
  calls.length=0;
  return Object.assign(f,{api,calls});
}

test('R10.6 trusted History workbench is optional without a React renderer',()=>{
  assert.doesNotThrow(()=>createTrustedHistoryWorkbench({api:{permissions:{contains(){throw new Error('must not read');}}}}).dispose());
});

test('R10.6 trusted History query requires explicit text, date range and bounded limit',()=>{
  assert.deepEqual(normalizeTrustedHistoryForm({
    text:' example ',startDate:'2026-10-01',endDate:'2026-10-31',limit:'25'
  }),{
    text:'example',
    startTime:Date.parse('2026-10-01T00:00:00'),
    endTime:Date.parse('2026-10-31T00:00:00')+24*60*60*1000-1,
    limit:25
  });
  assert.throws(()=>normalizeTrustedHistoryForm({text:'x',startDate:'2026-10-01',endDate:'2026-11-01',limit:5}),{code:'E_SCHEMA'});
  assert.throws(()=>normalizeTrustedHistoryForm({text:'x',startDate:'',endDate:'2026-10-01',limit:5}),{code:'E_SCHEMA'});
  assert.throws(()=>normalizeTrustedHistoryForm({text:'x',startDate:'2026-10-02',endDate:'2026-10-01',limit:5}),{code:'E_SCHEMA'});
  assert.throws(()=>normalizeTrustedHistoryForm({text:'x',startDate:'2026-10-01',endDate:'2026-10-02',limit:101}),{code:'E_SCHEMA'});
});

test('R10.6 trusted action synchronously requests optional history permission then calls Host route',async t=>{
  const f=await fixture(t);
  await React.act(async()=>{
    const pending=f.actions.search({isTrusted:true});
    assert.deepEqual(f.calls[0],['request',{permissions:['history']}],
      'chrome.permissions.request must start in the trusted click stack');
    await pending;
  });
  const envelope=f.calls.find(([name])=>name==='sendMessage')?.[1];
  assert.equal(envelope.protocol,BROWSER_HOST_PROTOCOL);
  assert.equal(envelope.kind,'host');
  assert.equal(envelope.operation,'browser.history.searchTrusted');
  assert.equal(envelope.hostInstanceId,hostInstanceId);
  assert.deepEqual(envelope.args,normalizeTrustedHistoryForm({text:'example',startDate:'2026-10-01',endDate:'2026-10-07',limit:'3'}));
  assert.equal(f.get('trusted-history-results').querySelectorAll('.trusted-history-result').length,1);
  assert.equal(f.get('trusted-history-search').disabled,false);
});

test('R10.6 React synthetic click and invalid ranges never request permission or reach Host',async t=>{
  const f=await fixture(t);
  await React.act(async()=>f.get('trusted-history-search').dispatchEvent(new f.window.Event('click',{bubbles:true})));
  assert.deepEqual(f.calls,[]);
  await f.change('endDate','2026-11-10');
  await f.search();
  assert.deepEqual(f.calls,[]);
  assert.match(f.get('trusted-history-status').textContent,/最多 31 天/);
});

test('R10.6 trusted History UI is not exposed through ordinary Browser SDK tool operations',async()=>{
  assert.equal(Object.keys(BROWSER_OPERATIONS).some(name=>name.startsWith('browser.history.')),false);
  const source=await readFile('src/ui/trusted-history-workbench.js','utf8');
  assert.match(source,/kind:'host'/);
  assert.match(source,/browser\.history\.searchTrusted/);
  assert.doesNotMatch(source,/kind:'tool'|iframe|createElement\('script'\)|innerHTML|eval\(|new Function/);
});

test('R37 React history keeps disclosure, labels and escaped result primitives',async t=>{
  const f=await fixture(t,{granted:true,response:{ok:true,data:{visits:[{url:'https://example.com/<b>',title:'<img src=x onerror=alert(1)>',typedCount:99,privateExtra:'not for UI'}]}}});
  await f.search();
  assert.equal(f.calls.some(([name])=>name==='request'),false);
  assert.equal(f.get('trusted-history-panel').tagName,'DETAILS');
  assert.equal(f.get('trusted-history-panel').dataset.historyPermission,'granted');
  assert.equal(f.get('trusted-history-results').querySelectorAll('.od-surface').length,1);
  assert.equal(f.get('trusted-history-results').querySelector('strong').textContent,'<img src=x onerror=alert(1)>');
  assert.equal(f.get('trusted-history-results').querySelector('img'),null);
  assert.equal(f.get('trusted-history-results').querySelector('small').textContent,'未知时间');
  assert.deepEqual(Object.keys(f.model.visits[0]),['url','title','lastVisitTime']);
  assert.equal(Object.isFrozen(f.model.visits[0]),true);
  assert.equal(f.get('trusted-history-status').getAttribute('role'),'status');
  assert.equal(f.get('trusted-history-results').getAttribute('aria-live'),'polite');
  const source=await readFile('src/ui/react/tabs/browser-history.tsx','utf8');
  assert.doesNotMatch(source,/style\.(?:width|minWidth|maxWidth)|width:\s*\d|dangerouslySetInnerHTML/);
});

test('R37 permission denial and document/owner errors clear private results without echoing backend messages',async t=>{
  for(const code of ['E_DOCUMENT_CHANGED','E_OWNER','E_CHROME_PERMISSION_REQUIRED','E_BROWSER']){
    await t.test(code,async t=>{
      const f=await fixture(t,{granted:true});
      await f.search();
      f.api.runtime.sendMessage=async()=>({ok:false,error:{code,message:'PRIVATE URL https://secret.example'}});
      await f.search();
      assert.equal(f.get('trusted-history-results').children.length,0);
      assert.doesNotMatch(f.get('trusted-history-status').textContent,/PRIVATE|secret/);
      assert.equal(f.get('trusted-history-search').disabled,false);
    });
  }
  await t.test('denied optional permission',async t=>{
    const f=await fixture(t,{requestResult:false});await f.search();
    assert.deepEqual(f.calls.map(([name])=>name),['request']);
    assert.equal(f.model.permission,'missing');
    assert.match(f.model.status,/需要 Chrome history/);
  });
});

test('R37 input invalidates pending search and keeps composition input nodes',async t=>{
  let resolve;
  const f=await fixture(t,{granted:true,sendMessage:()=>new Promise(done=>{resolve=done;})});
  const input=f.get('trusted-history-text');
  const panel=f.get('trusted-history-panel');panel.setAttribute('open','');
  let pending;
  await React.act(async()=>{pending=f.actions.search({isTrusted:true});});
  assert.equal(f.get('trusted-history-search').disabled,true);
  const callCount=f.calls.length;
  await f.search();
  assert.equal(f.calls.length,callCount,'busy query does not duplicate requests');
  await React.act(async()=>{
    input.value='拼音';
    const event=new f.window.Event('input',{bubbles:true});event.isComposing=true;input.dispatchEvent(event);
  });
  assert.equal(f.model.text,'拼音');
  assert.equal(f.get('trusted-history-text'),input);
  assert.equal(f.get('trusted-history-panel'),panel);
  assert.equal(panel.hasAttribute('open'),true,'state updates preserve disclosure state');
  await React.act(async()=>{resolve({ok:true,data:{visits:[{url:'https://stale.example',title:'stale'}]}});await pending;});
  assert.equal(f.model.visits,null);
  assert.equal(f.get('trusted-history-results').children.length,0);
  assert.equal(f.get('trusted-history-search').disabled,false);
  assert.equal(f.get('trusted-history-text'),input);
});

test('R37 dispose disconnects actions, unmounts results and ignores late replies',async t=>{
  let resolve;
  const f=await fixture(t,{granted:true,sendMessage:()=>new Promise(done=>{resolve=done;})});
  const actions=f.actions;let pending;
  await React.act(async()=>{pending=actions.search({isTrusted:true});});
  await React.act(async()=>f.ui.dispose());
  assert.equal(f.model,null);assert.equal(f.actions,null);
  assert.equal(f.get('trusted-history-panel'),null);
  const count=f.snapshots.length;
  await React.act(async()=>{resolve({ok:true,data:{visits:[{url:'https://late.example'}]}});await pending;actions.change('text','late');await actions.search({isTrusted:true});});
  assert.equal(f.snapshots.length,count);
});

test('R37 empty and malformed results remain distinct from an unqueried form',async t=>{
  const f=await fixture(t,{granted:true,response:{ok:true,data:{visits:[]}}});
  assert.equal(f.get('trusted-history-results').textContent,'');
  await f.search();assert.match(f.get('trusted-history-results').textContent,/没有匹配/);
  f.api.runtime.sendMessage=async()=>({ok:true,data:{visits:{url:'https://bad.example'}}});
  await f.search();assert.equal(f.get('trusted-history-results').textContent,'');
  assert.match(f.model.status,/浏览器未能完成/);
});

test('R37 React forwards the original native click without recreating a gesture',async t=>{
  const f=await fixture(t),events=[];
  await React.act(async()=>f.reactUI.connectBrowserHistoryActions({...f.actions,search:event=>events.push(event)}));
  const event=new f.window.Event('click',{bubbles:true});
  f.get('trusted-history-search').dispatchEvent(event);
  assert.deepEqual(events,[event]);
  assert.equal(events[0].isTrusted,undefined,'the fixture must not manufacture native trust');
});

test('R37 a late contains response cannot replace a newer permission request result',async t=>{
  let resolveContains;
  const f=await historyReactFixture(t,{hostInstanceId,api:{
    permissions:{contains:()=>new Promise(done=>{resolveContains=done;}),request:()=>Promise.resolve(true)},
    runtime:{sendMessage:async()=>({ok:true,data:{visits:[]}})}
  }});
  for(const [field,value] of Object.entries({text:'term',startDate:'2026-10-01',endDate:'2026-10-01'}))await f.change(field,value);
  await f.search();
  await React.act(async()=>{resolveContains(false);});
  assert.equal(f.model.permission,'granted');
});

test('R37 disposing during permission request cannot reach Host or republish private state',async t=>{
  let grant;const calls=[];
  const f=await historyReactFixture(t,{hostInstanceId,api:{
    permissions:{contains:async()=>false,request:()=>new Promise(done=>{grant=done;})},
    runtime:{sendMessage:async()=>{calls.push('host');return {ok:true,data:{visits:[]}};}}
  }});
  for(const [field,value] of Object.entries({text:'term',startDate:'2026-10-01',endDate:'2026-10-01'}))await f.change(field,value);
  let pending;
  await React.act(async()=>{pending=f.actions.search({isTrusted:true});f.ui.dispose();});
  const count=f.snapshots.length;
  await React.act(async()=>{grant(true);await pending;});
  assert.deepEqual(calls,[]);assert.equal(f.snapshots.length,count);assert.equal(f.model,null);
});
