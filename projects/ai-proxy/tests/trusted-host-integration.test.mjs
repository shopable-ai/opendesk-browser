import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {TRUSTED_AI_PROXY_VERSION} from '../trusted/admission.js';
const host=await readFile(new URL('../../../src/ui/sidebar-tools.js',import.meta.url),'utf8');
const react=await readFile(new URL('../../../src/ui/react/main.tsx',import.meta.url),'utf8');
// Execute the production closure bodies with controlled dependencies, not a duplicate whitelist.
const requestBody=host.slice(host.indexOf('  async function requestTrustedAIProxy('),host.indexOf('\n  async function admittedNativeBookmark('));
function requester({admit=async()=>true,dispatch=async()=>({status:'available',url:'https://example.com/private?q=secret'})}={}){
 const tool={id:'ai-proxy'};
 return new Function('admittedNativeAIProxy','dispatch',`
 let disposed=false,readOnlyPreview=false,active=arguments[2],instance='session',nativePending=false,nativeUI={kind:'ai-proxy'};
 const trustedAIProxySource=Symbol(),proxyActionGate={begin:()=>({assertCurrent(){}})};
 const destroyFrame=()=>{nativeUI=null},render=()=>{},notice=()=>{};let tocSettingsOpen=false;
 ${requestBody};return (op,payload)=>requestTrustedAIProxy(active,instance,'epoch',op,payload);
 `)(admit,dispatch,tool);
}
test('trusted host accepts current-page read and checks admission on every request without replay',async()=>{
 let checks=0,calls=0,allowed=true;
 const request=requester({admit:async()=>{checks++;return allowed},dispatch:async()=>{calls++;return {status:'available'}}});
 assert.deepEqual(await request('currentPage.info'),{status:'available'});
 allowed=false;
 await assert.rejects(request('storage.get'),{code:'E_TOOL_CHANGED'});
 assert.equal(checks,2);assert.equal(calls,1);
 await assert.rejects(request('browser.tabs.create'),{code:'E_TOOL_CHANGED'});
 const unknown=requester({dispatch:async()=>{calls++;throw Object.assign(Error('unknown'),{code:'E_OUTCOME_UNKNOWN'})}});
 await assert.rejects(unknown('browser.proxy.managed.requestEnable'),{code:'E_OUTCOME_UNKNOWN'});
 assert.equal(calls,2);
 await assert.rejects(requester()('browser.tabs.create'),{code:'E_OPERATION'});
});
const bundle=await build({entryPoints:[new URL('../src/environment.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'});
const {configureEnvironment}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
test('actual portal bridge receives root, emits no URL payload, and removes page listener on disposal',async()=>{
 const doc={},container=new EventTarget();Object.assign(container,{ownerDocument:doc,childNodes:[],dataset:{}});
 const start=react.indexOf('    mountAIProxyPilot('),end=react.indexOf('\n    },',start)+6;
 const method=react.slice(start,end).replace('mountAIProxyPilot(', 'function mountAIProxyPilot(');
 const mount=new Function('doc','configureAIProxyEnvironment',`
 let disposed=false,aiProxyPilot=null;const paint=()=>{};
 ${method};return mountAIProxyPilot;
 `)(doc,configureEnvironment);
 const release=mount({container,locale:'en',onStateChange(){},request:async()=>({status:'available',url:'https://Example.com/private?token=secret'})});
 const {getEnvironment}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
 const env=getEnvironment();let notices=0;
 env.events.addEventListener('ai-proxy-page-changed',event=>{notices++;assert.equal(event.detail,undefined)});
 assert.deepEqual(await env.currentSite(),{status:'available',host:'example.com',source:'currentPage'});
 container.dispatchEvent(new Event('opendesk-page-changed'));assert.equal(notices,1);
 release();container.dispatchEvent(new Event('opendesk-page-changed'));assert.equal(notices,1);
 assert.equal(container.dataset.opendeskReactOwner,undefined);
});
test('active current-page subscription notifies trusted portal once per transition and unsubscribes',()=>{
 const start=host.indexOf('  if(currentPageTarget?.subscribe){'),end=host.indexOf('\n  if(tocLanguageSelect)',start);
 let callback,unsubscribed=false,notifications=0;
 const target={snapshot:{status:'available',url:'https://example.com/private'},subscribe(fn){callback=fn;return ()=>{unsubscribed=true}}};
 const root=new EventTarget();root.addEventListener('opendesk-page-changed',e=>{notifications++;assert.equal(e.detail,undefined)});
 const listeners=[];
 new Function('currentPageTarget','frameRoot','listeners',`
 const render=()=>{},stopVideoSVIPWatch=()=>{},videoDownloader={invalidate(){}},cookieImportGate={revoke(){}},cookieWriteGate=cookieImportGate,cookieClearGate=cookieImportGate,cookieExportGate=cookieImportGate;
 let videoShortcutSession=null,frame=null,active={id:'ai-proxy'},instance='session',nativeUI={kind:'ai-proxy'};
 ${host.slice(start,end)}
 `)(target,root,listeners);
 callback();assert.equal(notifications,0);
 target.snapshot.url='https://other.example/private';callback();assert.equal(notifications,1);
 callback();assert.equal(notifications,1);
 listeners.forEach(fn=>fn());assert.equal(unsubscribed,true);
});
test('trusted release version is the requested 0.3.8',()=>assert.equal(TRUSTED_AI_PROXY_VERSION,'0.3.8'));

test('existing Host permission guard rejects currentPage.info without currentPage.read',()=>{
 const start=host.indexOf("    if(!tool.capabilities.includes(operation.startsWith('storage.')?");
 const end=host.indexOf('    if(TIME_REVIEW_OPERATIONS.includes(operation)){',start);
 const check=new Function('tool','operation',host.slice(start,end));
 assert.throws(()=>check({capabilities:['storage.local','browser.proxy.managed']},'currentPage.info'),/没有被批准/);
 assert.doesNotThrow(()=>check({capabilities:['currentPage.read']},'currentPage.info'));
});
