// Driver-only Node tests. These fixtures never produce native receipts/PASS.
import test from 'node:test';
import assert from 'node:assert/strict';
import {adblockSwitchSelector,assertAdblockManualStep,runAdblockChromeZoom200}
  from './helpers/adblock-layout-native.mjs';

test('React Aria driver locates the native input and its visible switch owner',()=>{
  const selector=adblockSwitchSelector('全局广告拦截');
  assert.match(selector,/:has\(input\[role="switch"\]/);
  assert.match(selector,/\[data-slot="switch"\]\[aria-label=/);
  assert.ok(!selector.includes('aria-checked'));
});

const key='opendesk.adblock.cosmetic.v1',identity={host:'localhost',selector:'#manual-ad-slot'};
const snapshot=(present,hidden)=>({url:'http://localhost:1234/manual',tabId:1,documentId:'chrome-document-1',
  targetPresent:true,targetHidden:hidden,storage:{[key]:{version:1,entries:present?[{...identity}]:[]}}});
const stateKey='opendesk.adblock.state.v1';
const upgrade=()=>({before:{...snapshot(false,false),storage:{[stateKey]:{enabled:true,exceptions:['127.0.0.1'],approvedHash:'3'.repeat(64),approvedEpoch:null}},storageReadKeys:[stateKey,key]},
  after:{...snapshot(false,false),storage:{[stateKey]:{enabled:true,exceptions:['127.0.0.1'],approvedHash:'4'.repeat(64),approvedEpoch:null}},storageReadKeys:[stateKey,key]},
  fromVersion:'1.2.1',toVersion:'1.2.2',runtime:Object.fromEntries(['before','after'].map((phase,i)=>[phase,{
    extensionId:'a'.repeat(32),profile:'/owned/profile',root:'/owned/extension',
    artifactPackageHash:String(i+1).repeat(64),installedPackageHash:String(i+3).repeat(64),installedVersion:i?'1.2.2':'1.2.1'}])),
  screenshots:{before:'before.png',after:'after.png'}});
test('upgrade proves real old global/site state without inventing historical manual rules',()=>{
  assert.doesNotThrow(()=>assertAdblockManualStep('upgrade',upgrade(),identity));
  for(const mutate of [r=>delete r.before.storage[stateKey],r=>r.after.storage[stateKey].exceptions=[],
    r=>r.before.storage[key]={version:1,entries:[identity]},r=>r.after.storageReadKeys=[],
    r=>r.runtime.after.extensionId='b'.repeat(32),r=>r.runtime.after.profile='/different/profile',
    r=>r.runtime.after.root='/different/extension',r=>r.runtime.after.artifactPackageHash='unknown',
    r=>r.runtime.after.installedPackageHash=r.runtime.before.installedPackageHash,
    r=>r.toVersion='1.2.1',r=>r.after.documentId='',r=>r.screenshots.after='before.png',r=>r.after.targetHidden=true]){
    const row=upgrade();mutate(row);assert.throws(()=>assertAdblockManualStep('upgrade',row,identity));
  }
});
test('pick cannot be attested with synthetic input',()=>{
  const row={before:snapshot(false,false),after:snapshot(true,true),input:{type:'pointerdown',isTrusted:false},
    screenshots:{before:'before.png',after:'after.png'}};
  assert.throws(()=>assertAdblockManualStep('pick',row,identity));
  row.input.isTrusted=true;assert.doesNotThrow(()=>assertAdblockManualStep('pick',row,identity));
});
test('only uninstall after a recorded real query requires the cosmetic key to be absent',()=>{
  const row={before:snapshot(true,true),after:{...snapshot(false,false),storage:{},storageReadKeys:[key]},
    screenshots:{before:'before.png',after:'after.png'}};
  assert.doesNotThrow(()=>assertAdblockManualStep('uninstall',row,identity));
  for(const mutate of [r=>r.after.storageReadKeys=[],r=>r.after.storage[key]={version:1,entries:[]},
    r=>delete r.before.storage[key]]){
    const copy=structuredClone(row);mutate(copy);assert.throws(()=>assertAdblockManualStep('uninstall',copy,identity));
  }
  const disable=structuredClone(row);assert.throws(()=>assertAdblockManualStep('disable',disable,identity));
});

// A small protocol double verifies fail-closed driver behavior and restoration;
// it cannot call Chrome or create evidence outside this unit test.
function zoomDouble({frozenDpr=false,overflow=false}={}){
  let zoom=1;const calls=[];
  return {calls,client:{},hostSession:'host',reactSession:'tool',
    async evaluate(client,session,expression){
      calls.push(expression);
      if(expression==='chrome.tabs.getCurrent()')return {id:7};
      if(expression.startsWith('chrome.tabs.getZoom'))return zoom;
      if(expression.startsWith('chrome.tabs.setZoom')){zoom=Number(expression.match(/,([\d.]+)\)/)[1]);return;}
      if(session==='host')return {url:'chrome-extension://test/sidepanel.html',dpr:2*zoom};
      return {url:'opaque-installed-tool',dpr:frozenDpr?2:2*zoom,width:320,scrollWidth:overflow&&zoom===2?400:320};
    },
    async until(job,label){assert.ok(await job(),label);},
    async screenshot(){return {unitTestOnly:true};}};
}
test('Chrome zoom is verified at 200% and restored to the original value',async()=>{
  const context=zoomDouble(),receipt=await runAdblockChromeZoom200(context);
  assert.equal(receipt.at200.getZoom,2);assert.equal(receipt.restored.getZoom,1);
  assert.ok(context.calls.every(code=>!code.includes('pageScaleFactor')));
});
test('unchanged tool DPR and actual overflow both reject, while restoring browser zoom',async()=>{
  for(const options of [{frozenDpr:true},{overflow:true}]){
    const context=zoomDouble(options);
    await assert.rejects(runAdblockChromeZoom200(context));
    assert.equal(context.calls.filter(code=>code.startsWith('chrome.tabs.setZoom')).at(-1),'chrome.tabs.setZoom(7,1)');
  }
});
