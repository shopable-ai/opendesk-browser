import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash,randomUUID,webcrypto} from 'node:crypto';
import {PassThrough} from 'node:stream';
import {runControllerVm} from './controller-vm.mjs';
import {createLocalFixture} from '../../dev/local-test/local-fixture-server.mjs';

const base='examples/sidebar-tools/ai-vip-share/';
const [html,script]=await Promise.all(['src/App.jsx','src/main.js'].map(p=>readFile(base+p,'utf8')));
const ORIGIN='http://127.0.0.1:7898',EXTENSION_ORIGIN='chrome-extension://ccfcjegpkdlgbclopjmadlcjedelidmf';
const PREFERENCE='aiVipLocalDevelopmentR136',RECOVERY='aiVipRedeemR52';
const domains=['chatgpt.com','openai.com','claude.ai','anthropic.com','gemini.google.com',
  'generativelanguage.googleapis.com','perplexity.ai'];
const profile={endpoint:{scheme:'http',host:'127.0.0.1',port:7897},domains};
const released={state:'disabled',permission:true,canStop:false,control:'controllable_by_this_extension',reason:null};
const owned={...released,state:'enabled',canStop:true,control:'controlled_by_this_extension'};
const clone=value=>JSON.parse(JSON.stringify(value));
const etag=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const flush=async()=>{for(let i=0;i<12;i++)await new Promise(resolve=>setImmediate(resolve));};
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done});return {promise,resolve}};
function node(id=''){
  let disabled=false;
  return {id,hidden:false,get disabled(){return disabled;},set disabled(value){disabled=Boolean(value);},
    value:'',textContent:'',type:'password',style:{},attributes:{},
    children:[],listeners:{},classList:{toggle(){}},append(...xs){this.children.push(...xs)},
    replaceChildren(...xs){this.children=xs},addEventListener(name,fn){this.listeners[name]=fn},
    setAttribute(name,value){this.attributes[name]=String(value)},removeAttribute(name){delete this.attributes[name]},focus(){}};
}
// Exercise the real fixture handler in memory. No port, browser or background service starts.
function fixtureRequest(fixture,{method,url,data,headers}){
  return new Promise(resolve=>{
    const request=new PassThrough();request.method=method;request.url=new URL(url).pathname;
    request.headers={origin:EXTENSION_ORIGIN,...Object.fromEntries(Object.entries(headers).map(([k,v])=>[k.toLowerCase(),v]))};
    const response={headersSent:false,writeHead(status){this.status=status;this.headersSent=true},
      end(body){resolve({status:this.status,data:JSON.parse(body)})}};
    fixture.server.emit('request',request,response);
    request.end(data===undefined?'':JSON.stringify(data));
  });
}
async function runtime({store=new Map(),fixture=createLocalFixture({extensionOrigin:EXTENSION_ORIGIN}),
  developmentProfile=profile,getStatus,network,beforeStorageGet,afterStorageSet,receiptTransform,cookieSetMany,
  performanceClock=performance,cookieScopeOverride,currentPage,pollTimers=false,
  developmentControls=false,ordinaryNetwork}={}){
  // Historical VM business tests simulate a development panel that now exists
  // ONLY in the test harness, not in the installable React product DOM.
  const testOnly=['ai-vip-local-development','ai-vip-local-connect','ai-vip-local-status',
    'ai-vip-service-mode','ai-vip-demo-availability','ai-vip-feature-member',
    'ai-vip-feature-redeem','ai-vip-feature-cookie','ai-vip-feature-shop',
    'ai-vip-feature-proxy','ai-vip-shared-section','ai-vip-shared-account',
    'ai-vip-shared-status'];
  const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(([,id])=>id));
  assert(testOnly.every(id=>!ids.has(id)),
    'Development/account allocation diagnostics must not appear in shipped App.jsx');
  const nodes=new Map([...ids,...testOnly].map(id=>[id,node(id)]));
  let rootReady=!developmentControls,createdControls=0,removedControls=0,release;
  if(developmentControls)for(const id of ['ai-vip-local-development','ai-vip-local-connect','ai-vip-local-status'])nodes.delete(id);
  const calls=[],storageCalls=[],proxyCalls=[],cookieCalls=[],tabCalls=[],pageCalls=[],timers=[],toolStates=[];
  let page=currentPage??{status:'unavailable'};
  let current={...released,...(developmentProfile?{developmentProfile}: {})};
  const storage=async(operation,payload)=>{
    if(operation==='currentPage.info'){
      pageCalls.push(operation);return clone(typeof page==='function'?await page():page);
    }
    storageCalls.push({operation,...clone(payload)});
    const before=store.get(payload.key)??null;
    if(operation==='storage.get'){
      await beforeStorageGet?.(payload);
      return {value:clone(before),etag:etag(before)};
    }
    assert.equal(operation,'storage.set');assert.equal(payload.ifMatch,etag(before));
    store.set(payload.key,clone(payload.value));
    await afterStorageSet?.(payload,store);
    return {saved:true};
  };
  const request=async args=>{
    calls.push(clone(args));
    if(ordinaryNetwork&&new URL(args.url).origin!==ORIGIN)return ordinaryNetwork(args);
    assert.equal(args.config.headers?.['X-OpenDesk-Local-Test'],'1');
    assert.equal(new URL(args.url).origin,ORIGIN);
    assert(['/api/member','/api/preview','/api/redeem','/api/status'].includes(new URL(args.url).pathname));
    if(network)return network(args,fixture);
    const result=await fixtureRequest(fixture,{...args,headers:args.config.headers});
    if(cookieScopeOverride&&result.data?.sharedAccounts)for(const row of result.data.sharedAccounts.accounts)row.cookieScope=clone(cookieScopeOverride);
    if(receiptTransform&&result.data?.cookieDelivery)result.data=receiptTransform(clone(result.data));
    return result;
  };
  const managed={getStatus:async()=>getStatus?getStatus():clone(current),
    requestEnable:async args=>{proxyCalls.push({action:'enable',...clone(args)});current={...owned,developmentProfile};return clone(current)},
    requestDisable:async()=>{proxyCalls.push({action:'disable'});current={...released,developmentProfile};return clone(current)}};
  const window={OpenDeskTool:{root:{querySelector:id=>rootReady?nodes.get(id.slice(1)):null},request:storage,
    setState:state=>toolStates.push(clone(state))},
    OpenDeskSDK:{browser:{network:{request},proxy:{managed},cookies:{setMany:async args=>{
      cookieCalls.push(clone(args));return cookieSetMany?cookieSetMany(args):{
        saved:args.cookies.length,verified:args.cookies.length,
        results:args.cookies.map((_,index)=>({index,saved:true,verified:true}))};
    }},tabs:{create:async args=>{tabCalls.push(clone(args));return {tabRef:'fixture-tab'};}}}}};
  // Capture polling without creating timers; each check is driven explicitly below.
  if(pollTimers)window.setInterval=(callback,ms)=>{timers.push({callback,ms});return timers.length;};
  // Test-only instrumentation remains INSIDE mountController after the React
  // lifecycle wrapper; do not add testing exports to production code.
  const anchor='  return release;\n  }\n  // Legacy Node VM fixtures';
  assert.ok(script.includes(anchor),'AI VIP controller instrumentation anchor changed');
  const instrumented=script.replace(anchor,
    '  window.__activationTests={activationCodeFromPage,checkActivationPage,claimActivation:value=>claimActivation(value,serviceRevision)};\n'+anchor);
  await runControllerVm(instrumented,{window,document:{createElement:()=>node()},URL,Date,Intl,performance:performanceClock,
    TextEncoder,Uint8Array,crypto:{randomUUID,subtle:webcrypto.subtle}}, {timeout:2000});
  if(developmentControls){
    rootReady=true;
    release=window.__OpenDeskVipStart({createDevelopmentControls(){
      createdControls++;
      for(const id of ['ai-vip-local-development','ai-vip-local-connect','ai-vip-local-status'])nodes.set(id,node(id));
      return {section:nodes.get('ai-vip-local-development'),button:nodes.get('ai-vip-local-connect'),
        status:nodes.get('ai-vip-local-status'),dispose(){removedControls++;}};
    }});
  }
  await flush();
  const get=name=>nodes.get('ai-vip-'+name);
  const click=async(name,trusted=true)=>{get(name).listeners.click({isTrusted:trusted});await flush()};
  return {store,fixture,get,click,calls,storageCalls,proxyCalls,cookieCalls,tabCalls,pageCalls,timers,toolStates,
    release,developmentView:()=>({created:createdControls,removed:removedControls}),
    activation:window.__activationTests,setPage(value){page=value},
    async checkPage(){await window.__activationTests.checkActivationPage();await flush();},
    async preview(value='DEMO-VIP-01'){
      get('redeem-code').value=value;get('redeem-code').listeners.input();
      get('redeem-form').listeners.submit({isTrusted:true,preventDefault(){}});await flush();
    },setStatus(value){current=value},flush};
}


export {runtime,profile,domains,released,owned,flush,deferred,clone,ORIGIN,EXTENSION_ORIGIN,PREFERENCE,RECOVERY,fixtureRequest};
