import test from 'node:test';
import assert from 'node:assert/strict';
import {handleSidebarToolRuntimeQuery,assertSidebarToolRuntime} from '../../src/sidebar-tools/runtime-compatibility.js';
import {SIDEBAR_TOOL_PROTOCOL,sidebarToolPackageContractHash} from '../../src/ui/sidebar-tools/package.js';

function fixture(){
  const api={runtime:{id:'extension',getURL:path=>'chrome-extension://extension/'+path,
    getManifest:()=>({version:'0.1.0'})}};
  const sender={id:'extension',documentId:'real-document',frameId:0,
    url:api.runtime.getURL('sidepanel.html?hostInstanceId=real-host')};
  api.runtime.sendMessage=message=>new Promise(resolve=>{
    assert.equal(handleSidebarToolRuntimeQuery({api,message,sender,respond:resolve}),true);
  });
  return {api,sender};
}

test('a real packaged host can compare its loaded contract with the running Worker',async()=>{
  const {api}=fixture();
  const identity=await assertSidebarToolRuntime(api);
  assert.equal(identity.extensionId,api.runtime.id);
  assert.equal(identity.version,'0.1.0');
  assert.equal(identity.contractHash,await sidebarToolPackageContractHash());
});

test('mismatched or missing running contracts fail before admission with the actual extension identity',async()=>{
  const {api}=fixture();
  api.runtime.sendMessage=async()=>({ok:true,data:{extensionId:'extension',version:'0.1.0',contractHash:'0'.repeat(64)}});
  await assert.rejects(assertSidebarToolRuntime(api),error=>error.code==='E_TOOL_RUNTIME_MISMATCH'&&/extension/.test(error.message));
  api.runtime.sendMessage=async()=>undefined;
  await assert.rejects(assertSidebarToolRuntime(api),error=>error.code==='E_TOOL_RUNTIME_UNAVAILABLE');
  api.runtime.sendMessage=async()=>({ok:true,data:{extensionId:'other',version:'0.1.0',contractHash:await sidebarToolPackageContractHash()}});
  await assert.rejects(assertSidebarToolRuntime(api),error=>error.code==='E_TOOL_RUNTIME_MISMATCH');
});

test('a matching initial check cannot authorize a later Worker version',async()=>{
  const {api}=fixture();await assertSidebarToolRuntime(api);
  api.runtime.sendMessage=async()=>({ok:false,error:{code:'E_DEV_RELOADING',message:'正在安全更新'}});
  await assert.rejects(assertSidebarToolRuntime(api),error=>error.code==='E_DEV_RELOADING');
});

test('sandbox, webpage, foreign extension and malformed requests cannot inspect the trusted runtime',async()=>{
  for(const change of [{id:'other'},{url:'https://example.com/'},{url:'chrome-extension://extension/sidebar-tools/sandbox.html'},{frameId:2}]){
    const {api,sender}=fixture();let reply;
    const done=new Promise(resolve=>{
      assert.equal(handleSidebarToolRuntimeQuery({api,message:{protocol:SIDEBAR_TOOL_PROTOCOL,kind:'runtime-contract'},
        sender:{...sender,...change},respond:value=>{reply=value;resolve();}}),true);
    });
    await done;assert.equal(reply.ok,false);assert.equal(reply.data,undefined);
  }
  const {api,sender}=fixture();let reply;
  handleSidebarToolRuntimeQuery({api,message:{protocol:SIDEBAR_TOOL_PROTOCOL,kind:'runtime-contract',capabilities:['fake']},sender,respond:value=>{reply=value;}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(reply.ok,false);
});
