import test from 'node:test';
import assert from 'node:assert/strict';
import {SIDEPANEL_DOCUMENT_PATH,toolDocumentIdentity} from '../../src/tool-document-url.js';
import {isToolSender,resolveToolSender} from '../../src/environment.js';
import {toolPageHref,normalizeOwnPageTarget,requestedOwnPageTarget,
  canonicalToolHostUrl,requestedToolId} from '../../src/ui/sidebar-tools/navigation.js';

const runtime={getURL:path=>'chrome-extension://abcdefghijklmnopabcdefghijklmnop/'+path};
const base=runtime.getURL(SIDEPANEL_DOCUMENT_PATH);
const page={view:'settings',section:'profiles'};

test('own PC page URL keeps the exact installed tool locator and a bounded navigation hint',()=>{
  const raw=toolPageHref(runtime,'ai-proxy',page);
  assert.equal(requestedToolId(raw),'ai-proxy');
  assert.deepEqual(requestedOwnPageTarget(raw),page);
  const canonical=canonicalToolHostUrl(raw,'host-99');
  const url=new URL(canonical);
  assert.equal(url.origin,new URL(base).origin);
  assert.equal(url.pathname,'/sidepanel.html');
  assert.equal(url.searchParams.get('hostInstanceId'),'host-99');
  assert.deepEqual(requestedOwnPageTarget(canonical),page);
  assert.equal(toolDocumentIdentity(base,canonical)?.toolId,'ai-proxy');
  assert.equal(toolDocumentIdentity(base,canonical)?.hostInstanceId,'host-99');
  assert.equal(url.hash,'');
});

test('legacy tool pages and preview locators remain valid without a new page hint',()=>{
  const legacy=canonicalToolHostUrl(toolPageHref(runtime,'header-actions-demo'),'host-100');
  assert.equal(requestedOwnPageTarget(legacy),null);
  assert.equal(toolDocumentIdentity(base,legacy)?.toolId,'header-actions-demo');
});

test('foreign IDs, URLs, extra keys, malformed and duplicate fields cannot become tool-page authority',()=>{
  const invalid=[
    null,{},[],{view:'settings'},{view:'settings',section:''},
    {view:'settings',section:'../../evil'},
    {view:'settings',section:'credentials?token=x'},
    {view:'settings',section:'Profiles'},
    {view:'external',section:'profiles'},
    {view:'settings',section:'profiles',url:'https://example.com/'},
    {view:'settings',section:'x'.repeat(41)}
  ];
  for(const value of invalid)assert.equal(normalizeOwnPageTarget(value),null);
  for(const value of invalid.filter(value=>value!==null))
    assert.throws(()=>toolPageHref(runtime,'ai-proxy',value));
  const good=canonicalToolHostUrl(toolPageHref(runtime,'ai-proxy',page),'host-111');
  for(const attack of [
    u=>u.searchParams.append('view','settings'),
    u=>u.searchParams.append('section','rules'),
    u=>u.searchParams.set('section','../evil'),
    u=>u.searchParams.set('toolId','not_a_valid_tool_id'),
    u=>u.searchParams.set('view','external'),
    u=>u.searchParams.set('other','https://example.com'),
    u=>u.searchParams.append('previewId','00000000-0000-0000-0000-000000000000')
  ]){
    const changed=new URL(good);attack(changed);
    assert.equal(toolDocumentIdentity(base,changed.href),null);
  }
  assert.equal(toolDocumentIdentity(base,'https://example.com/sidepanel.html?toolId=ai-proxy'),null);
});

test('canonical navigation drops foreign parameters and never carries fragment or arbitrary path',()=>{
  const url=new URL(toolPageHref(runtime,'ai-proxy',page));
  url.searchParams.set('token','secret');
  url.hash='#/other';
  const canonical=new URL(canonicalToolHostUrl(url.href,'host-44'));
  assert.equal(canonical.searchParams.has('token'),false);
  assert.equal(canonical.hash,'');
  assert.deepEqual(requestedOwnPageTarget(canonical.href),page);
  assert.throws(()=>canonicalToolHostUrl('https://example.com/sidepanel.html','host-44'));
});

test('actual Host sender resolution permits only the canonical top-level own-tool page',async()=>{
  const api={runtime:{...runtime,id:'abcdefghijklmnopabcdefghijklmnop'}};
  const url=canonicalToolHostUrl(toolPageHref(runtime,'ai-proxy',page),'host-300');
  const sender={id:api.runtime.id,url,documentId:'document-1',documentLifecycle:'active',
    frameId:0,tab:{id:3,incognito:false}};
  assert.equal(isToolSender(api,sender),true);
  assert.equal(await resolveToolSender(api,sender),sender);
  for(const variation of [
    {frameId:1},{documentId:null},{tab:{id:3,incognito:true}},
    {tab:null},{url:url+'&toolId=evil'},{url:url+'&section=rules'},
    {url:url+'#route'},{url:url.replace('chrome-extension:','https:')}
  ]){
    const altered={...sender,...variation};
    assert.equal(isToolSender(api,altered),false);
    await assert.rejects(resolveToolSender(api,altered),{code:'E_OWNER'});
  }
});
