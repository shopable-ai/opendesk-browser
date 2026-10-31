import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {admitsTrustedAIProxy,TRUSTED_AI_PROXY_ID,TRUSTED_AI_PROXY_VERSION,
  trustedAIProxyProvenanceChanged} from '../trusted/admission.js';
import {serializeSidebarToolPackage,validateSidebarToolPackage} from '../../../src/ui/sidebar-tools/package.js';

function fixture(){
  const tool=validateSidebarToolPackage({format:'opendesk.sidebar-tool.v2',
    id:TRUSTED_AI_PROXY_ID,version:TRUSTED_AI_PROXY_VERSION,title:'AI Proxy',
    description:'Reviewed static UI',capabilities:['storage.local','browser.proxy.managed'],
    requires:{browserSdk:'1.0.0'},contributes:{contextMenus:[]},
    html:'<main></main>',css:'',js:'void 0;'});
  const bytes=Buffer.from(serializeSidebarToolPackage(tool));
  const sha256=createHash('sha256').update(bytes).digest('hex');
  const release={id:'opendesk/ai-proxy',toolId:tool.id,version:tool.version,
    packagePath:'official-tools/ai-proxy/ai-proxy.opendesk-tool.json',bytes:bytes.length,sha256};
  return {tool,installed:[structuredClone(tool)],release,expectedEpoch:'approved',
    epochs:{'ai-proxy':'approved'},enableRecords:{'ai-proxy':true},
    provenance:{'ai-proxy':{marketId:release.id,version:tool.version,sha256}}};
}

test('exact reviewed normalized package and independently installed identity admit static UI',async()=>{
  assert.equal(await admitsTrustedAIProxy(fixture()),true);
  assert.equal(await admitsTrustedAIProxy(),false);
});

test('spoofed identity, executable bytes, release path, version and digest fail closed',async()=>{
  const good=fixture();
  for(const change of [
    {tool:{...good.tool,id:'ai-vip-share'}},
    {tool:{...good.tool,version:'0.1.1'}},
    {tool:{...good.tool,capabilities:['storage.local']}},
    {tool:{...good.tool,js:'malicious()'}},
    {installed:[]},
    {installed:[{...good.tool,html:'<main>tampered</main>'}]},
    {release:{...good.release,id:'other/ai-proxy'}},
    {release:{...good.release,toolId:'ai-vip-share'}},
    {release:{...good.release,version:'0.1.1'}},
    {release:{...good.release,packagePath:'projects/ai-vip-share/tool.json'}},
    {release:{...good.release,sha256:good.release.sha256.toUpperCase()}},
    {release:{...good.release,sha256:'0'.repeat(64)}},
    {release:{...good.release,bytes:good.release.bytes+1}}
  ])assert.equal(await admitsTrustedAIProxy({...good,...change}),false,JSON.stringify(change));
  // Even matching self-reported provenance cannot replace the release's byte digest.
  assert.equal(await admitsTrustedAIProxy({...good,
    tool:{...good.tool,js:'malicious()'},installed:[{...good.tool,js:'malicious()'}]}),false);
});

test('enable state, null first-install epoch, rotated generations and provenance are enforced',async()=>{
  const good=fixture();
  assert.equal(await admitsTrustedAIProxy({...good,expectedEpoch:null,epochs:{}}),true);
  for(const change of [
    {enableRecords:{'ai-proxy':false}}, {enableRecords:{'ai-proxy':'true'}},
    {epochs:{'ai-proxy':'rotated'}}, {expectedEpoch:null}, {expectedEpoch:undefined},
    {epochs:{'ai-proxy':''},expectedEpoch:''},
    {epochs:{'ai-proxy':12},expectedEpoch:12},
    {provenance:{}},
    {provenance:{'ai-proxy':{...good.provenance['ai-proxy'],marketId:'other/ai-proxy'}}},
    {provenance:{'ai-proxy':{...good.provenance['ai-proxy'],version:'0.1.1'}}},
    {provenance:{'ai-proxy':{...good.provenance['ai-proxy'],sha256:'0'.repeat(64)}}},
    {provenance:{'ai-proxy':{...good.provenance['ai-proxy'],extra:true}}}
  ])assert.equal(await admitsTrustedAIProxy({...good,...change}),false,JSON.stringify(change));
});

test('unrelated provenance changes preserve AI Proxy; own edits, removal and corruption revoke',async()=>{
  const {provenance}=fixture();
  const unrelated={marketId:'opendesk/other',version:'1.0.0',sha256:'f'.repeat(64)};
  assert.equal(trustedAIProxyProvenanceChanged({oldValue:provenance,
    newValue:{...provenance,other:unrelated}}),false);
  assert.equal(trustedAIProxyProvenanceChanged({oldValue:{...provenance,other:unrelated},
    newValue:provenance}),false);
  assert.equal(await admitsTrustedAIProxy({...fixture(),provenance:{...provenance,other:unrelated}}),true);
  for(const newValue of [{},null,[],{'ai-proxy':null},
    {'ai-proxy':{...provenance['ai-proxy'],sha256:'f'.repeat(64)}},
    {'ai-proxy':{...provenance['ai-proxy'],version:'0.3.0'}},
    {'ai-proxy':{...provenance['ai-proxy'],marketId:'other/ai-proxy'}},
    {'ai-proxy':{...provenance['ai-proxy'],extra:true}}])
    assert.equal(trustedAIProxyProvenanceChanged({oldValue:provenance,newValue}),true);
  assert.equal(trustedAIProxyProvenanceChanged({newValue:provenance}),true);
});
