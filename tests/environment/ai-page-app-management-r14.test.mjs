import test from 'node:test';
import assert from 'node:assert/strict';
import {describeManagedAiPage,composeExtensionEntries} from '../../src/ui/extension-center-model.js';
import {installedPageEnableAction,setInstalledPageProgramEnabled}
  from '../../src/ui/installed-page-tools.js';

const SHA='a'.repeat(64);
const installed=(programId='opendesk.ai-scroll-navigation',overrides={})=>({
  programId,manifestHash:SHA,revision:2,sourceHash:'b'.repeat(64),
  enabled:true,nativeState:'registered',
  authorization:{status:'active',generation:3,installationId:'install-1'},
  pageRules:{matches:['https://chatgpt.com/*']},...overrides
});

test('R1.4 only the two new AI Page identities receive the compact master-switch model',()=>{
  for(const id of ['opendesk.ai-scroll-navigation','opendesk.ai-reply-mindmap']){
    const view=describeManagedAiPage(installed(id));
    assert.equal(view.enabled,true);assert.equal(view.enabledKnown,true);
    assert.equal(view.state,'ready');assert.equal(view.canRestore,false);
    assert.match(view.note,/并非对当前网页已实际运行的证明/);
  }
  for(const id of ['opendesk.chatgpt-jump-top','opendesk.chatgpt-mindmap','reader']){
    assert.equal(describeManagedAiPage(installed(id)),null);
  }
});

test('R1.4 disabled intent is distinct from native unregister and unknown cleanup',()=>{
  const stopped=installed(undefined,{enabled:false,
    nativeState:'disabled',authorization:{status:'disabled',generation:4}});
  assert.equal(describeManagedAiPage(stopped).state,'off');
  assert.match(describeManagedAiPage(stopped).status,/原生注销已确认/);
  assert.equal(describeManagedAiPage(installed(undefined,{enabled:false,nativeState:'registered'})).state,'pending');
  assert.equal(describeManagedAiPage(installed(undefined,{managedCleanup:{state:'unknown'}})).state,'restricted');
  assert.equal(describeManagedAiPage(installed(undefined,{enabled:undefined})).enabledKnown,false);
});

test('R1.4 suspended grant does not turn master-switch OFF into restore ON',async()=>{
  const row=installed(undefined,{authorization:{status:'suspended',generation:6}});
  const view=describeManagedAiPage(row);
  assert.equal(view.enabled,true);
  assert.equal(view.state,'restricted');
  assert.equal(view.canRestore,true);
  assert.deepEqual(installedPageEnableAction(row),{enabled:true,label:'恢复自动运行'});
  let permissionChecks=0;
  const calls=[];
  const api={permissions:{contains:async()=>{permissionChecks++;return true;}}};
  const client={request:async(method,args)=>{calls.push({method,args});return {enabled:args.enabled};}};
  await setInstalledPageProgramEnabled({api,client,row:{programId:row.programId,
    manifestHash:row.manifestHash,installed:row},enabled:false});
  assert.equal(permissionChecks,0,'switch OFF never requests a permission check for restore');
  assert.equal(calls[0].args.enabled,false);
  assert.equal(calls[0].args.expectedGeneration,6);
  await setInstalledPageProgramEnabled({api,client,row:{programId:row.programId,
    manifestHash:row.manifestHash,installed:row}});
  assert.equal(permissionChecks,1,'the existing restore action still checks the approved origin');
  assert.equal(calls[1].args.enabled,true);
  assert.equal(calls[1].args.programId,'opendesk.ai-scroll-navigation');
});

test('R1.4 invalid toggle intent and changed installation never reach the Host',async()=>{
  let writes=0;
  const row=installed();
  const api={permissions:{contains:async()=>true}};
  const client={request:async()=>{writes++;return {enabled:true};}};
  for(const invalid of ['false',0,null]){
    await assert.rejects(setInstalledPageProgramEnabled({api,client,
      row:{programId:row.programId,manifestHash:SHA,installed:row},enabled:invalid}),error=>
      error.code==='E_PAGE_ENABLED');
  }
  await assert.rejects(setInstalledPageProgramEnabled({api,client,
    row:{programId:row.programId,manifestHash:'c'.repeat(64),installed:row},enabled:false}),error=>
    error.code==='E_PAGE_CHANGED');
  assert.equal(writes,0);
});

test('R1.4 legacy Page installations remain individually visible without inheriting grants',()=>{
  const old=installed('opendesk.chatgpt-jump-top');
  const current=installed('opendesk.ai-scroll-navigation');
  const rows=composeExtensionEntries({pages:[old,current],pageReleases:[]});
  assert.deepEqual(new Set(rows.map(row=>row.id)),
    new Set([old.programId,current.programId]));
  const view=describeManagedAiPage(current,[old,current]);
  assert.equal(view.legacyProgramId,old.programId);
  assert.equal(describeManagedAiPage(current,[current]).legacyProgramId,null);
  assert.equal(rows.every(row=>row.installed===true),true);
});

test('R1.4 absent native registration cannot be labelled as a running page',()=>{
  const noSite=describeManagedAiPage(installed(undefined,{pageRules:{matches:[]}}));
  assert.equal(noSite.state,'pending','no approved site cannot be labelled ready');
  const pending=describeManagedAiPage(installed(undefined,{nativeState:'unregistered'}));
  assert.equal(pending.state,'pending');
  assert.match(pending.status,/待核对/);
  const blocked=describeManagedAiPage(installed(undefined,{nativeState:'blocked'}));
  assert.equal(blocked.canRestore,true);
  assert.equal(blocked.state,'restricted');
});
