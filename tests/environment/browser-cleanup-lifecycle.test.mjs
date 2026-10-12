import test from 'node:test';
import assert from 'node:assert/strict';
import {BROWSER_CLEANUP_INTERRUPTED,BROWSER_SHUTDOWN_MESSAGE,PASSIVE_BROWSER_CLEANUPS,reportBrowserCleanupError} from '../../src/platform/chrome/lifecycle-errors.js';
import {assertBrowserCleanupEvidence} from '../helpers/browser-cleanup-evidence.mjs';

test('only exact native shutdown rejection in an allowed passive cleanup becomes an interruption warning',()=>{
  for(const phase of PASSIVE_BROWSER_CLEANUPS){
    const calls=[],error=new Error(BROWSER_SHUTDOWN_MESSAGE),logger={warn:(...args)=>calls.push(['warning',...args]),error:(...args)=>calls.push(['error',...args])};
    assert.equal(reportBrowserCleanupError(error,{phase,label:'cleanup',logger}),undefined);
    assert.deepEqual(calls,[['warning',BROWSER_CLEANUP_INTERRUPTED,phase,error]]);
    for(const rejected of [new Error(BROWSER_SHUTDOWN_MESSAGE+' extra'),new Error('the browser is shutting down.'),
      Object.assign(new Error('Host not available'),{code:'E_OWNER'}),Object.assign(new Error('World not isolated'),{code:'E_WORLD_ISOLATION'})]){
      calls.length=0;reportBrowserCleanupError(rejected,{phase,label:'cleanup',logger});
      assert.deepEqual(calls,[['error','cleanup',rejected]]);
    }
  }
  for(const phase of ['startup','permission-revocation','install','bind-host',undefined]){
    const calls=[],error=new Error(BROWSER_SHUTDOWN_MESSAGE),logger={warn:()=>assert.fail('active operation must not be downgraded'),error:(...args)=>calls.push(args)};
    reportBrowserCleanupError(error,{phase,label:'active',logger});assert.deepEqual(calls,[['active',error]]);
  }
});

test('cleanup warning evidence requires the exact source, operation and successfully completed close window',()=>{
  const id='a'.repeat(32),life=[{generation:1,closeRequestedAt:100,exitObservedAt:200,normalExit:true,exit:{code:0,signal:null}}];
  const event={generation:1,type:'warning',timestamp:150,args:[{value:BROWSER_CLEANUP_INTERRUPTED},{value:'context-menu-tab-removed'},
    {subtype:'error',className:'Error',preview:{properties:[{name:'message',value:BROWSER_SHUTDOWN_MESSAGE}]}}],
    stackTrace:{callFrames:[{url:'chrome-extension://'+id+'/platform/context-menus.js'}]}};
  assert.doesNotThrow(()=>assertBrowserCleanupEvidence(event,life,id));
  for(const mutation of [row=>row.timestamp=99,row=>row.timestamp=201,row=>row.generation=2,
    row=>row.args[1].value='install',row=>row.args[2].preview.properties[0].value+=' extra',
    row=>row.stackTrace.callFrames[0].url='https://example.test/sw.js',row=>row.stackTrace.callFrames[0].url='chrome-extension://'+id+'/ui/tool-shell.js']){
    const changed=structuredClone(event);mutation(changed);assert.throws(()=>assertBrowserCleanupEvidence(changed,life,id));
  }
  for(const mutation of [row=>row.normalExit=false,row=>delete row.closeRequestedAt,row=>delete row.exitObservedAt,
    row=>row.exit.code=1,row=>row.exit.signal='SIGKILL']){
    const changed=structuredClone(life);mutation(changed[0]);assert.throws(()=>assertBrowserCleanupEvidence(event,changed,id));
  }
});
