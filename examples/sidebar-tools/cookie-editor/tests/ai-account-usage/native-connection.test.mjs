import test from 'node:test';
import assert from 'node:assert/strict';
const moduleURL=new URL('../../ai-account-usage/native-connection.mjs',import.meta.url);
function fixture(){
  const calls=[];
  const server={url:'http://usage-abc.localhost:43210/pair',serviceBinding:{serviceInstanceId:'instance_1',
    createLocalClient(){},request(){},createManagementOpen(){},revokeLocalClient(){}}};
  const providerFactory=options=>{calls.push(options);return {state:()=>({connected:true}),start:async()=>({connected:true}),close:()=>options.onDisconnect()};};
  return {server,calls,providerFactory};
}
test('usage connection explicitly registers fixed service metadata without exposing process secrets',async()=>{
  const {startUsageNativeConnection}=await import(moduleURL),f=fixture();
  const provider=await startUsageNativeConnection({server:f.server,store:{accounts:async()=>[]},providerFactory:f.providerFactory});
  assert.equal(provider.state().connected,true);assert.equal(f.calls.length,1);
  assert.deepEqual(f.calls[0].descriptor,{serviceId:'ai-account-usage',serviceInstanceId:'instance_1',
    productName:'AI Account Usage',origin:'http://usage-abc.localhost:43210',
    capabilities:['usage:manual-binding','policy:metadata-state','management:resource-open']});
  provider.close();
  await assert.rejects(f.calls[0].handler({owner:{extensionId:'a'.repeat(32),toolId:'cookie-editor',packageHash:'b'.repeat(64),installEpoch:'epoch_1'},action:'accounts',payload:{connectionId:'conn_1'}}),{code:'TRANSPORT_RETIRED'});
});
test('unsupported Native rejects opt-in startup and cleans up its adapter without changing the HTTP server',async()=>{
  const {startUsageNativeConnection}=await import(moduleURL),f=fixture();let options,closed=0;
  await assert.rejects(startUsageNativeConnection({server:f.server,store:{accounts:async()=>[]},
    providerFactory:v=>{options=v;return {start:async()=>{throw Object.assign(Error('private'),{code:'E_SERVICE_UNSUPPORTED'});},close:()=>{closed++;v.onDisconnect();}};}}),{code:'E_SERVICE_UNSUPPORTED'});
  assert.equal(closed,1);
  await assert.rejects(options.handler({owner:{extensionId:'a'.repeat(32),toolId:'cookie-editor',packageHash:'b'.repeat(64),installEpoch:'epoch_1'},action:'accounts',payload:{connectionId:'conn_1'}}),{code:'TRANSPORT_RETIRED'});
  assert.equal(f.server.url,'http://usage-abc.localhost:43210/pair');
});
