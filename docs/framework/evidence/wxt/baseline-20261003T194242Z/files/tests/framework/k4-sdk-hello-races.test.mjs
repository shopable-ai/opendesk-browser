import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {createWindowTransport} from '../../src/framework/sdk/transport.js';
import {installPageRelay} from '../../src/agents/page-relay.js';
import {installPageSdk} from '../../src/framework/sdk/entry.js';
import {PROTOCOL, SDK_VERSION, SDK_HELLO_EVENT, SDK_READY_EVENT} from '../../src/framework/sdk/registry.js';
import {encodeValue} from '../../src/platform/page-port/codec.js';

const require = createRequire(import.meta.url), webpack = require('webpack'), config = require('../../webpack.config.cjs');
const turn = () => new Promise(resolve => setImmediate(resolve));
class DetailEvent extends Event { constructor(type,{detail}={}) {super(type);this.detail=detail;} }
const ready = methods => ({ok:true,data:{sdkVersion:SDK_VERSION,ready:true,methods}});
function fixture() {
  const window = new EventTarget(), timers = new Map(), callbacks = [], events = [];
  let sequence = 0;
  const setTimer = (fn,ms) => {const id=++sequence;timers.set(id,{fn,ms});return id;};
  const clearTimer = id => timers.delete(id);
  const api = {runtime:{sendMessage(message,callback) {callbacks.push({message:JSON.parse(JSON.stringify(message)),callback});}}};
  window.addEventListener(SDK_READY_EVENT,event => events.push(JSON.parse(event.detail)));
  const options = {window,CustomEvent:DetailEvent,setTimer,clearTimer};
  return {window,timers,callbacks,events,api,options,fire(id) {const task=timers.get(id);assert.ok(task);timers.delete(id);task.fn();}};
}
async function race(f, install, variant, denied) {
  const sdk = install(), first = sdk.ready().then(value=>({value}),error=>({error:error.code}));
  await turn(); assert.equal(f.callbacks.length,1);
  const [mainTimer,relayTimer] = [...f.timers.keys()];
  assert.equal(install(),sdk);
  let settled = false;
  const fresh = sdk.ready().then(value=>{settled=true;return {value};},error=>{settled=true;return {error:error.code};});
  await turn(); assert.equal(f.callbacks.length,1);
  f.fire(mainTimer); await turn(); assert.equal(f.callbacks.length,2);
  for(const {message} of f.callbacks) assert.deepEqual(message,{protocol:PROTOCOL,type:'SDK_HELLO',payload:{sdkVersion:SDK_VERSION}});
  if(variant==='relay-timeout') f.fire(relayTimer);
  else f.callbacks[0].callback(variant==='late-success' ? ready(['APPLOCAL_GETITEM']) : {ok:false,error:{code:'E_PERMISSION'}});
  await turn(); assert.equal(settled,false,'Old Hello cannot settle fresh readiness');
  assert.match(f.events[0].helloId,/^[a-f0-9]{32}$/);
  f.callbacks[1].callback(denied ? {ok:false,error:{code:'E_GRANT_REVOKED'}} : ready(['APPSTORAGE_CLEAR']));
  const outcome = await fresh;
  assert.deepEqual(JSON.parse(JSON.stringify(outcome)),denied ? {error:'E_GRANT_REVOKED'} : {value:ready(['APPSTORAGE_CLEAR']).data});
  assert.notEqual(f.events[0].helloId,f.events[1].helloId);
  assert.deepEqual(await first,{error:'E_TIMEOUT'});
  sdk.dispose(); assert.equal(f.timers.size,0);
  return sdk;
}

for(const variant of ['relay-timeout','late-success','late-failure']) for(const denied of [false,true])
  test(`Hello incarnation: ${variant} cannot replace fresh ${denied?'denial':'success'}`,async()=>{
    const f=fixture(), page={window:f.window,CustomEvent:DetailEvent};
    const relay=installPageRelay({...f.options,api:f.api});
    try {await race(f,()=>installPageSdk({global:page,transport:createWindowTransport(f.options)}),variant,denied);}
    finally {page.OpenDeskSDK?.dispose();relay.removeEventListeners();assert.equal(relay.diagnostics().pending,0);}
  });

test('a request ID named hello uses the final-result channel, never Hello readiness',async()=>{
  const f=fixture(), transport=createWindowTransport(f.options), relay=installPageRelay({...f.options,api:f.api});
  try {
    const hello=transport.hello(); await turn();f.callbacks[0].callback(ready(['APPLOCAL_GETITEM']));await hello;
    const request=transport.request({requestId:'hello',method:'APPLOCAL_GETITEM',args:{key:'literal'},deadlineAt:Date.now()+10000});
    await turn();f.callbacks[1].callback({ok:true,data:{valueWire:encodeValue({PageBrigeCode:0,message:'',data:false})}});
    assert.deepEqual(await request,{requestId:'hello',result:{PageBrigeCode:0,message:'',data:false}});
  } finally {transport.dispose();relay.removeEventListeners();assert.equal(f.timers.size,0);}
});

test('uncorrelated Ready events do not settle a current Hello; pagehide is terminal',async()=>{
  const f=fixture(), transport=createWindowTransport(f.options);
  const pending=transport.hello().then(()=>assert.fail('Ready must not be synthesized'),error=>error.code);
  f.window.dispatchEvent(new DetailEvent(SDK_READY_EVENT,{detail:JSON.stringify({protocol:PROTOCOL,response:ready([])})}));
  assert.equal(transport.diagnostics().pending,1);
  f.window.dispatchEvent(new Event('pagehide'));assert.equal(await pending,'E_CANCELLED');assert.equal(f.timers.size,0);
});

for(const mode of ['production','development']) test(`${mode} exact fixed MAIN/ISOLATED bundles correlate every reinjected Hello`,async()=>{
  const compiler=webpack({...config(mode),entry:{'framework/sdk-main':'./src/framework/sdk/entry.js','agents/page-relay':'./src/agents/page-relay.js'},
    output:{...config(mode).output,clean:false},cache:false});
  compiler.hooks.shouldEmit.tap('HelloRaceNoProductWrites',()=>false);
  let stats;
  try {stats=await new Promise((resolve,reject)=>compiler.run((error,value)=>error||value.hasErrors()?reject(error??Error(value.toString({all:false,errors:true}))):resolve(value)));}
  finally {await new Promise((resolve,reject)=>compiler.close(error=>error?reject(error):resolve()));}
  const main=stats.compilation.assets['framework/sdk-main.js'].source().toString(), isolated=stats.compilation.assets['agents/page-relay.js'].source().toString();
  for(const variant of ['relay-timeout','late-success','late-failure']) for(const denied of [false,true]) {
    const f=fixture(), globals={window:f.window,CustomEvent:DetailEvent,TextEncoder,TextDecoder,URL,crypto,btoa,atob,setTimeout:f.options.setTimer,clearTimeout:f.options.clearTimer};
    const relay=vm.createContext({...globals,chrome:f.api}), page=vm.createContext({...globals,document:{},navigator:{userAgent:''}});
    vm.runInContext(isolated,relay);
    try {await race(f,()=>{vm.runInContext(main,page);return page.OpenDeskSDK;},variant,denied);}
    finally {page.OpenDeskSDK?.dispose();f.window.dispatchEvent(new Event('pagehide'));assert.equal(f.timers.size,0);}
  }
});
