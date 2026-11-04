import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {admitsTrustedAIProxy,TRUSTED_AI_PROXY_ID,TRUSTED_AI_PROXY_VERSION} from '../trusted/admission.js';
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

test('AI Proxy admission rejects absent, duplicate, altered and invalid installations or missing capability',async()=>{
  const good=fixture();
  const missing={...good.tool,capabilities:['storage.local']};
  const malformed={...good.tool,extra:true};
  for(const change of [
    {tool:{...good.tool,id:'ai-vip-share'}},
    {tool:{...good.tool,version:'0.1.1'}},
    {tool:missing,installed:[missing]},
    {tool:{...good.tool,js:'malicious()'}},
    {installed:[]},{installed:undefined},{installed:{}},
    {installed:[good.tool,good.tool]},
    {installed:[good.tool,{...good.tool,js:'void 1;'}]},
    {installed:[{...good.tool,html:'<main>different package</main>'}]},
    {tool:malformed,installed:[malformed]}
  ])assert.equal(await admitsTrustedAIProxy({...good,...change}),false,JSON.stringify(change));
});

test('AI Proxy admission ignores Catalog, source records and fixed version for actual local installs',async()=>{
  const good=fixture();
  const local={...good.tool,version:'0.1.1',html:'<main>Custom proxy</main>',css:'',
    js:'throw new Error("installed JS must remain in the sandbox");'};
  for(const change of [
    {release:undefined,provenance:undefined},{release:null,provenance:{}},
    {release:{...good.release,id:'other/ai-proxy',toolId:'other-tool',version:'99.0.0',
      packagePath:'local.json',sha256:'invalid',bytes:1}},
    {provenance:{'ai-proxy':{marketId:'local',version:'0.0.1',extra:true}}},
    {tool:local,installed:[local]}
  ])assert.equal(await admitsTrustedAIProxy({...good,...change}),true);
  const unreadable={...good};
  for(const key of ['release','provenance'])Object.defineProperty(unreadable,key,{
    get(){throw new Error('distribution metadata must not be read');}
  });
  assert.equal(await admitsTrustedAIProxy(unreadable),true);
});

test('AI Proxy admission enforces enable state and exact epoch including initial null',async()=>{
  const good=fixture();
  assert.equal(await admitsTrustedAIProxy({...good,expectedEpoch:null,epochs:{}}),true);
  assert.equal(await admitsTrustedAIProxy({...good,expectedEpoch:null,epochs:undefined}),true);
  for(const change of [
    {enableRecords:{'ai-proxy':false}}, {enableRecords:{'ai-proxy':'true'}},
    {enableRecords:[]},{enableRecords:null},
    {epochs:{'ai-proxy':'rotated'}}, {expectedEpoch:null}, {expectedEpoch:undefined},
    {epochs:[]},{epochs:null},
    {epochs:{'ai-proxy':''},expectedEpoch:''},
    {epochs:{'ai-proxy':12},expectedEpoch:12}
  ])assert.equal(await admitsTrustedAIProxy({...good,...change}),false,JSON.stringify(change));
});
