import test from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {createDebugWorkbench} from '../../src/ui/debug-workbench.js';
function fixture(){
  const names=['debug-refresh','debug-copy','debug-feedback','debug-cloud-summary',
    'debug-pairing','debug-connection','debug-reconcile','debug-slot',
    'debug-task-count','debug-request-count','debug-snapshot'];
  const nodes=new Map(names.map(id=>[id,{
    textContent:'unchanged',disabled:false,listeners:new Map(),
    addEventListener(type,fn){this.listeners.set(type,fn)},
    removeEventListener(type){this.listeners.delete(type)}
  }]));
  return {nodes,doc:{getElementById:id=>nodes.get(id)}};
}
test('Debug React renders escaped text, not injected HTML',async t=>{
  const vite=await createServer({configFile:false,root:process.cwd(),
    appType:'custom',server:{middlewareMode:true},logLevel:'error'});
  t.after(()=>vite.close());
  const {DebugDiagnosticText}=await vite.ssrLoadModule('/src/ui/react/tabs/debug.tsx');
  const html=renderToStaticMarkup(React.createElement(DebugDiagnosticText,{
    value:'<img src=x onerror=alert(1)>'
  }));
  assert.equal(html,'&lt;img src=x onerror=alert(1)&gt;');
});
test('Debug bridge has one text writer, sanitized readback and no Cloud authority',async()=>{
  const {nodes,doc}=fixture();const views=[];let calls=0,fail=false,copied='';
  const forbidden=()=>assert.fail('Debug cannot pair/claim/approve/execute');
  const client={cloud:{
    cloudStatus:async arg=>{
      assert.deepEqual(arg,{});calls++;
      if(fail)throw Error('SECRET untrusted error');
      return {provider:{url:'https://SECRET.invalid'},enabled:true,online:true,
        connection:'authenticated',reconciled:true,hostReady:true,
        slotState:'available',slotAvailable:true,siteAuthorization:'granted',
        tasks:[{taskId:'SECRET'}],requests:[{requestId:'SECRET',state:'finished'}]};
    },cloudNext:forbidden,cloudApprove:forbidden,cloudPair:forbidden
  }};
  const debug=createDebugWorkbench({document:doc,client,host:{start:forbidden},
    reactUI:{debugMounted:true,renderDebugDiagnostics:next=>views.push({...next})},
    clipboard:{writeText:async value=>{copied=value}},
    api:{runtime:{getManifest:()=>({version:'1.2.3'})}}});
  try{
    await debug.refresh();assert.equal(calls,1);
    assert.equal(views.at(-1).pairing,'已配对');
    assert.equal(views.at(-1).taskCount,'1');
    assert.match(views.at(-1).snapshot,/opendesk.cloud-control.diagnostics.v1/);
    assert.doesNotMatch(views.at(-1).snapshot,/SECRET|https?:\/\//);
    assert.equal(nodes.get('debug-pairing').textContent,'unchanged');
    nodes.get('debug-copy').listeners.get('click')();await Promise.resolve();
    assert.match(copied,/opendesk.cloud-control.diagnostics.v1/);
    assert.doesNotMatch(copied,/SECRET|https?:\/\//);
    fail=true;await debug.refresh();
    assert.equal(views.at(-1).snapshot,'未获得可信诊断快照。');
    assert.equal(views.at(-1).pairing,'未知');
    assert.doesNotMatch(JSON.stringify(views.at(-1)),/SECRET|https?:\/\//);
    assert.equal(nodes.get('debug-snapshot').textContent,'unchanged');
  }finally{debug.dispose();}
  assert.equal(nodes.get('debug-refresh').listeners.size,0);
  assert.equal(nodes.get('debug-copy').listeners.size,0);
});
test('Debug without React preserves original DOM fallback',async()=>{
  const {nodes,doc}=fixture();
  const debug=createDebugWorkbench({document:doc,client:{cloud:{
    cloudStatus:async()=>({connection:'offline'})
  }}});
  try{await debug.refresh();assert.equal(nodes.get('debug-connection').textContent,'offline');}
  finally{debug.dispose();}
});
