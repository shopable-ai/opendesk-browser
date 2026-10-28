import test from 'node:test';
import assert from 'node:assert/strict';
import {controllerMethods} from '../../src/platform/host/controller-methods.js';
import {encodeValue} from '../../src/platform/page-port/codec.js';
import {CONTROLLER_SOURCE_LIMIT,TASK_PACKAGE_LIMIT} from '../../src/platform/source-budgets.js';
import {loadFakeBuiltin} from './builtin-support.mjs';

function fixture() {
  const event={addListener(){},removeListener(){}};
  let hosts=0;
  const methods=controllerMethods({storage:{},api:{runtime:{},tabs:{onActivated:event,onUpdated:event,onRemoved:event},webNavigation:{onBeforeNavigate:event,onCommitted:event,onHistoryStateUpdated:event,onReferenceFragmentUpdated:event}},
    session:'source-test',clock:{now:()=>1000},loadBuiltin:loadFakeBuiltin,
    assertHost:async()=>{hosts++;throw Object.assign(new Error('Reached unchanged host authorization'),{code:'E_TEST_HOST_AUTHORIZATION'});},currentHost:async()=>{}});
  const request=sourceUtf8=>({requestId:'source-budget',source:{kind:'draft',sourceUtf8},paramsWire:encodeValue({}),target:{mode:'owned',url:'https://example.com/'},deadlineAt:90000});
  return {methods,request,get hosts(){return hosts;}};
}
const sourceOf=size=>{const shell='async function main(){return 1;}/*';return shell+'x'.repeat(size-shell.length-2)+'*/';};
test('original Host admits source string at small, actual full candidate size and 2 MiB to unchanged authorization boundary',async()=>{
  const f=fixture();
  for(const size of [128,1146776,CONTROLLER_SOURCE_LIMIT]){
    const request=f.request(sourceOf(size));assert.equal(Buffer.byteLength(request.source.sourceUtf8),size);
    await assert.rejects(f.methods.startControllerRun(request,{}),{code:'E_TEST_HOST_AUTHORIZATION'});
  }
  assert.equal(f.hosts,3);
});
test('Host rejects oversized UTF-8 source and source envelope before authorization',async()=>{
  const f=fixture();
  for(const source of [sourceOf(CONTROLLER_SOURCE_LIMIT+1),'async function main(){}/*'+'中'.repeat(720000)+'*/','async function main(){}/*'+'\u0001'.repeat(800000)+'*/']){
    await assert.rejects(f.methods.startControllerRun(f.request(source),{}),{code:'E_LIMIT'});
  }
  assert.equal(f.hosts,0);
});
test('source budget does not expand ordinary params values, closed source fields, UTF-16 or permission identity',async()=>{
  const f=fixture(),request=f.request(sourceOf(1146776));
  request.paramsWire=encodeValue({text:'x'.repeat(300000)},{maxBytes:TASK_PACKAGE_LIMIT});
  await assert.rejects(f.methods.startControllerRun(request,{}),{code:'E_VALUE_SERIALIZATION'});
  const extra=f.request(sourceOf(128));extra.source.permissions=['tabs'];
  await assert.rejects(f.methods.startControllerRun(extra,{}),{code:'E_SCHEMA'});
  await assert.rejects(f.methods.startControllerRun(f.request('\ud800'),{}),{code:'E_VALUE_SERIALIZATION'});
  assert.equal(f.hosts,0);
});
