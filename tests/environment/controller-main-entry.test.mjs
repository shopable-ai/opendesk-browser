import test from 'node:test';
import assert from 'node:assert/strict';
import {controllerProgramBody,installControlWorker} from '../../src/scripting/sandbox/worker-runtime.js';
import {registerLodash} from '../../src/libs/packages/lodash.js';
import {registerDayjs} from '../../src/libs/packages/dayjs.js';

// These run the Worker compiler contract in Node; they are not native Chrome evidence.
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
async function execute(source, params = {}, page = {}) {
  const compiled = new AsyncFunction('page','params','axiosx','AppStorage','AppLocal','storage', controllerProgramBody(source));
  return compiled(page, params, undefined, undefined, undefined, undefined);
}

test('async main receives page/params lexically without platform arguments', async () => {
  const page = {title: async () => 'Page A', url: async () => 'https://a.example/'};
  assert.deepEqual(await execute('async function main() { return {title: await page.title(), url: await page.url(), value: params.value}; }',
    {value:3}, page), {title:'Page A',url:'https://a.example/',value:3});
});

test('main return preserves falsy values including undefined', async () => {
  assert.equal(await execute('async function main() { return false; }'),false);
  assert.equal(await execute('async function main() { return 0; }'),0);
  assert.equal(await execute('async function main() { return undefined; }'),undefined);
});

test('prior async-body scripts still execute and return correctly', async () => {
  assert.deepEqual(await execute('return {result:params.value};',{value:'legacy'}),{result:'legacy'});
  assert.equal(await execute('return false;'),false);
});

test('main faults are errors rather than silent empty results', async () => {
  await assert.rejects(execute('async function main() { throw new Error("boom"); }'),/boom/);
  await assert.rejects(execute('const main = "not callable";'),/main must be a function/);
});

test('worker fault preserves a bounded raw generated stack without claiming a source mapping',async()=>{
  const listeners=new Map(),channel=new MessageChannel();
  const scope={location:{href:'blob:test',origin:'null'},name:'test',
    addEventListener:(name,callback)=>listeners.set(name,callback),removeEventListener:name=>listeners.delete(name),postMessage:()=>{}};
  const symbols={register:Symbol.for('opendesk.libs.register.v1'),entries:Symbol.for('opendesk.libs.entries.v1')};
  const entries=Object.create(null);
  Object.defineProperty(scope,symbols.entries,{configurable:true,value:entries});
  Object.defineProperty(scope,symbols.register,{configurable:true,value:(id,version,api)=>
    Object.defineProperty(entries,id,{value:Object.freeze({version,api}),enumerable:true})});
  registerLodash(scope);registerDayjs(scope);
  scope[symbols.register]('myUtils','1.0.0',Object.freeze({upper:text=>String(text).toUpperCase()}));
  installControlWorker(scope);
  const identity={runId:'run-stack-test',ownerEpoch:1};
  try {
    listeners.get('message')({data:{kind:'bind',identity,revision:{revision:1,sourceHash:'a'.repeat(64)},
      target:{tabId:1,frameId:0,documentId:'test-document'}},ports:[channel.port2]});
    const failed=new Promise(resolve=>{channel.port1.onmessage=({data})=>{if(data.kind==='error')resolve(data);};});
    channel.port1.postMessage({kind:'execute',...identity,body:'async function main(){throw new Error("runtime fault");}',params:{}});
    const reply=await failed;
    assert.equal(reply.error.code,'E_CONTROL_EXECUTION');assert.equal(reply.error.message,'runtime fault');
    assert.match(reply.error.stack,/Error: runtime fault/);assert.match(reply.error.stack,/<anonymous>/);
    assert.ok(reply.error.stack.length<=4096);assert.equal(reply.error.sourceLocation,undefined);
  }finally{channel.port1.close();channel.port2.close();}
});
