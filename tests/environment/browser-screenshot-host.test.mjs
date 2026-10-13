import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrowserScreenshotHost} from '../../src/platform/chrome/browser-screenshot.js';
const code=x=>e=>e?.code===x;
const ref='screenshotRef_abcdefghijklmnopqrstuvwxyz';
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAVs7gNYAAAAASUVORK5CYII=';
const target=()=>({tabId:19,windowId:3,url:'https://example.com/page',documentId:'doc-A',incognito:false});
const context={trustedUserActivation:true,toolId:'tool-a'};
function fixture(){
 const state={captures:0,resources:[],discarded:[],allowed:true,active:{...target(),id:19},current:target()};
 const api={tabs:{query:async()=>[state.active],captureVisibleTab:async()=>{state.captures++;return png}}};
 const host=createBrowserScreenshotHost({api,resolveTarget:async()=>state.current,
  authorize:async()=>state.allowed,
  createResource:async row=>{state.resources.push(row);return {resourceRef:'private-asset'}},
  discardResource:async x=>state.discarded.push(x)});
 return {host,state};
}
test('trusted capture stores private PNG and returns only bounded metadata',async()=>{
 const {host,state}=fixture();const result=await host.captureVisible({tabRef:ref},context);
 assert.equal(result.resourceRef,'private-asset');
 assert.equal(Object.hasOwn(result,'downloadId'),false,'Screenshot must never expose a native download ID');
 assert.deepEqual([result.width,result.height],[1,1]);
 assert.equal(state.captures,1);
 assert.equal(state.resources[0].mimeType,'image/png');
 assert(!JSON.stringify(result).includes('base64'));
 assert(!Object.hasOwn(result,'tabId'));
});
test('no real click, arbitrary tabId and extra fields fail closed',async()=>{
 const {host,state}=fixture();
 await assert.rejects(host.captureVisible({tabRef:ref},{userGesture:true}),code('E_USER_GESTURE_REQUIRED'));
 await assert.rejects(host.captureVisible({tabId:19},context),code('E_SCHEMA'));
 await assert.rejects(host.captureVisible({tabRef:ref,all:true},context),code('E_SCHEMA'));
 assert.equal(state.captures,0);
});
test('wrong active tab, restricted page and incognito never call Chrome capture',async()=>{
 const {host,state}=fixture();state.active.id=20;
 await assert.rejects(host.captureVisible({tabRef:ref},context),code('E_TARGET_CHANGED'));
 state.active.id=19;state.current.url='chrome://extensions';
 await assert.rejects(host.captureVisible({tabRef:ref},context),code('E_TARGET'));
 state.current=target();state.current.incognito=true;
 await assert.rejects(host.captureVisible({tabRef:ref},context),code('E_TARGET'));
 assert.equal(state.captures,0);
});
test('site permission refusal blocks the image side effect',async()=>{
 const {host,state}=fixture();state.allowed=false;
 await assert.rejects(host.captureVisible({tabRef:ref},context),code('E_SITE_GRANT_REQUIRED'));
 assert.equal(state.captures,0);
});
test('permission revoked after resource creation discards private image',async()=>{
 const {state}=fixture();let n=0;
 const host=createBrowserScreenshotHost({api:{tabs:{query:async()=>[state.active],captureVisibleTab:async()=>png}},
  resolveTarget:async()=>state.current,authorize:async()=>++n<=2,
  createResource:async()=>({resourceRef:'private-revoked'}),
  discardResource:async id=>state.discarded.push(id)});
 await assert.rejects(host.captureVisible({tabRef:ref},context),code('E_SITE_PERMISSION_REVOKED'));
 assert.deepEqual(state.discarded,['private-revoked']);
});
