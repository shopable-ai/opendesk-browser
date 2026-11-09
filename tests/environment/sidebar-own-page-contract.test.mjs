import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {APP_DOCUMENT_PATH,SIDEPANEL_DOCUMENT_PATH,toolDocumentIdentity} from '../../src/tool-document-url.js';
import {isToolSender,resolveToolSender} from '../../src/environment.js';
import {toolPageHref,normalizeOwnPageTarget,requestedOwnPageTarget,
  requestedAppPageLocator,canonicalToolHostUrl,requestedToolId} from '../../src/ui/sidebar-tools/navigation.js';
import {resolveAppPageTarget} from '../../src/ui/app-page-routes.js';
import {initialToolSurface,verifiedToolSurface} from '../../src/ui/tool-surface.js';
const runtime={getURL:path=>'chrome-extension://abcdefghijklmnopabcdefghijklmnop/'+path};
const appBase=runtime.getURL(APP_DOCUMENT_PATH),sideBase=runtime.getURL(SIDEPANEL_DOCUMENT_PATH);
const proxy={view:'settings',section:'profiles'},scripts={view:'scripts'};
test('one fixed app.html, with no pre-bootstrap sender authority',()=>{
  const raw=toolPageHref(runtime,'ai-proxy',proxy);
  assert.equal(new URL(raw).pathname,'/app.html');
  assert.equal(requestedToolId(raw),'ai-proxy');
  assert.deepEqual(requestedAppPageLocator(raw)?.page,proxy);
  assert.equal(toolDocumentIdentity(appBase,raw),null);
  const canonical=canonicalToolHostUrl(raw,'host-99');
  assert.equal(new URL(canonical).searchParams.get('hostInstanceId'),'host-99');
  assert.deepEqual(requestedOwnPageTarget(canonical),proxy);
  assert.equal(toolDocumentIdentity(appBase,canonical)?.toolId,'ai-proxy');
  assert.equal(toolDocumentIdentity(sideBase,canonical),null);
  assert.equal(new URL(canonical).hash,'');
});
test('app-defined views and closed sections; unregistered Bookmark settings refused',async()=>{
  assert.deepEqual(normalizeOwnPageTarget(scripts),scripts);
  assert.deepEqual(requestedOwnPageTarget(toolPageHref(runtime,'webflow',scripts)),scripts);
  assert.deepEqual(resolveAppPageTarget('webflow',scripts),scripts);
  assert.deepEqual(resolveAppPageTarget('ai-proxy',proxy),proxy);
  assert.equal(resolveAppPageTarget('bookmark-manager',{view:'settings'}),null);
  assert.equal(resolveAppPageTarget('webflow',{view:'scripts',section:'bad'}),null);
  assert.equal(resolveAppPageTarget('ai-proxy',{view:'settings',section:'unknown'}),null);
  assert.equal(requestedAppPageLocator(toolPageHref(runtime,'bookmark-manager'))?.page,null);
  const typescript=await readFile('projects/ai-proxy/src/ui/optionsRoute.ts','utf8');
  const declared=/export const OPTIONS_SECTIONS = \[([^\]]+)\]/.exec(typescript)?.[1]
    ?.match(/'[^']+'/g)?.map(value=>value.slice(1,-1));
  const js=await readFile('projects/ai-proxy/trusted/app-page-routes.js','utf8');
  const registered=/const SECTIONS=Object\.freeze\(\[([^\]]+)\]\)/.exec(js)?.[1]
    ?.match(/'[^']+'/g)?.map(value=>value.slice(1,-1));
  assert.deepEqual(registered,declared,'route mapping must track the real AI Proxy sections');
});
test('invalid parameter shapes, duplicates, fragments, foreign paths fail closed',()=>{
  for(const target of [null,{},[],{view:''},{view:'Scripts'},{view:'../evil'},
    {view:'scripts',section:'bad/path'},{view:'settings',section:''},
    {view:'scripts',url:'https://example.com/'},{view:'scripts',toolId:'ai-proxy'}]){
    assert.equal(normalizeOwnPageTarget(target),null);
    if(target!==null)assert.throws(()=>toolPageHref(runtime,'ai-proxy',target));
  }
  const valid=canonicalToolHostUrl(toolPageHref(runtime,'ai-proxy',proxy),'host-1');
  for(const change of [
    url=>url.searchParams.append('toolId','webflow'),
    url=>url.searchParams.append('view','scripts'),
    url=>url.searchParams.append('section','rules'),
    url=>url.searchParams.set('view','../script'),
    url=>url.searchParams.set('section','PROFILES'),
    url=>url.searchParams.set('extra','anything'),
    url=>url.searchParams.set('previewId','00000000-0000-0000-0000-000000000000'),
    url=>url.hash='#/profiles'
  ]){
    const url=new URL(valid);change(url);
    assert.equal(requestedAppPageLocator(url.href),null);
    assert.equal(toolDocumentIdentity(appBase,url.href),null);
    assert.throws(()=>canonicalToolHostUrl(url.href,'host-2'));
  }
  assert.equal(requestedAppPageLocator('https://example.com/app.html?toolId=ai-proxy'),null);
});
test('saved legacy sidepanel.html settings links remain independently valid',()=>{
  const old=canonicalToolHostUrl(sideBase+'?toolId=ai-proxy&view=settings&section=profiles','host-100');
  assert.equal(toolDocumentIdentity(sideBase,old)?.toolId,'ai-proxy');
  assert.deepEqual(requestedOwnPageTarget(old),proxy);
  assert.equal(toolDocumentIdentity(appBase,old),null);
  assert.equal(new URL(canonicalToolHostUrl(sideBase,'host-panel')).pathname,'/sidepanel.html');
});
test('sender must be this active, top-level Chrome app document',async()=>{
  const api={runtime:{...runtime,id:'abcdefghijklmnopabcdefghijklmnop'}};
  const url=canonicalToolHostUrl(toolPageHref(runtime,'ai-proxy',proxy),'host-300');
  const sender={id:api.runtime.id,url,documentId:'document-1',documentLifecycle:'active',
    frameId:0,tab:{id:3,incognito:false}};
  assert.equal(isToolSender(api,sender),true);
  assert.equal(await resolveToolSender(api,sender),sender);
  for(const variation of [
    {frameId:1},{documentId:null},{tab:{id:3,incognito:true}},
    {tab:null},{url:url+'&toolId=evil'},{url:url+'&section=rules'},
    {url:url+'#route'},{url:url.replace('chrome-extension:','https:')}
  ]){
    const changed={...sender,...variation};
    assert.equal(isToolSender(api,changed),false);
    await assert.rejects(resolveToolSender(api,changed),{code:'E_OWNER'});
  }
});

test('native Side Panel remains compact even with legacy toolId, but tabs keep PC layout',()=>{
  assert.equal(initialToolSurface('/sidepanel.html',true),'page');
  assert.equal(verifiedToolSurface('/sidepanel.html',true,true),'sidebar');
  assert.equal(verifiedToolSurface('/sidepanel.html',true,false),'page');
  assert.equal(verifiedToolSurface('/sidepanel.html',false,true),'sidebar');
  assert.equal(initialToolSurface('/app.html',true),'page');
  assert.equal(verifiedToolSurface('/app.html',true,true),'page',
    'app.html can never masquerade as native Side Panel');
  assert.equal(initialToolSurface('/unknown.html',true),'page');
});
