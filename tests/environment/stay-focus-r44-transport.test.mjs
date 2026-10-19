import test from 'node:test';
import assert from 'node:assert/strict';
import {createSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';
import {SIDEBAR_TOOL_STORE} from '../../src/ui/sidebar-tools/package.js';
import {TOOL_REVOCATION_EPOCHS_STORE} from '../../src/ui/sidebar-tools/lifecycle.js';
import {requestStayFocusOperation,runTrustedStayFocusOperation}
  from '../../examples/sidebar-tools/stay-focus/trusted/tool-host.js';
import {sidebarToolRequestTimeout} from '../../src/sidebar-tools/bridge.js';

test('Stay Focus mutations get a conservative outcome-unknown transport deadline',()=>{
  assert.equal(sidebarToolRequestTimeout('focus.status','stay-focus'),8000);
  assert.equal(sidebarToolRequestTimeout('focus.site.put','stay-focus'),120000);
  assert.equal(sidebarToolRequestTimeout('focus.disable','stay-focus'),120000);
});

async function requestFixture({networkFails=false,expireAfterSend=false}={}){
  const tool=await createSidebarToolPackage('examples/sidebar-tools/stay-focus');
  const api={storage:{local:{get:async()=>({
    [SIDEBAR_TOOL_STORE]:[tool],
    [TOOL_REVOCATION_EPOCHS_STORE]:{'stay-focus':'epoch-r44'}
  })}},runtime:{sendMessage:async()=>{
    if(networkFails)throw Error('transport disconnected after unknown native effect');
    return {ok:true,data:{enabled:true,ruleReceipt:{verified:true,ruleIds:[]}}};
  }}};
  let checked=0;
  const assertCurrent=()=>{
    checked++;
    if(expireAfterSend&&checked>=3)throw Error('retired host');
  };
  const call=()=>requestStayFocusOperation({api,tool,operation:'focus.site.put',
    payload:{site:{host:'example.org',subdomains:true,enabled:true,mode:'limit',
      minutes:10,group:''}},revocationEpoch:'epoch-r44',assertCurrent,
    requestBrowserClick:({run})=>run({isTrusted:true}),openSettings:()=>{}});
  return {api,tool,call};
}

test('lost mutation transport and retired Host after successful write are UNKNOWN, not retryable',async()=>{
  const disconnected=await requestFixture({networkFails:true});
  await assert.rejects(disconnected.call(),{code:'E_OUTCOME_UNKNOWN'});
  const retired=await requestFixture({expireAfterSend:true});
  await assert.rejects(retired.call(),{code:'E_OUTCOME_UNKNOWN'});
  const successful=await requestFixture();
  const result=await successful.call();
  assert.equal(result.ruleReceipt.verified,true);
});

test('trusted enable after transport disconnect is UNKNOWN, not a false permission rejection',async()=>{
  const {api,tool}=await requestFixture({networkFails:true});
  await assert.rejects(runTrustedStayFocusOperation({api,tool,
    operation:'focus.enable',payload:{},event:{isTrusted:true},revocationEpoch:'epoch-r44',assertCurrent:()=>{}}),
    {code:'E_OUTCOME_UNKNOWN'});
});
