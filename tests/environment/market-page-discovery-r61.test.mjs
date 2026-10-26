// R6.1 COMPONENT tests. Mock Chrome documents are not native installed evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateDeclaredMarketInstall,discoverCurrentPageMarketInstall,
  captureDeclaredMarketLinks,OPENDESK_INSTALL_REL} from '../../src/marketplace/discovery.js';
import {layout,home} from '../../src/market-site/templates.mjs';

const origin='http://127.0.0.1:43132';
const channel={enabled:true,origin,mode:'development'};
const release={id:'opendesk/markdown-workbench',toolId:'markdown-workbench',kind:'sidebar-tool',
  version:'1.0.5',packageTitle:'Markdown 工作台',description:'离线 Markdown 工具',category:'Markdown',
  title:'Markdown 工作台',summary:'编辑和预览 Markdown',features:['本机编辑'],surfaces:['侧边栏'],sha256:'a'.repeat(64)};
const href=origin+'/install/opendesk/markdown-workbench/versions/1.0.5/';
const page='https://docs.test/path?id=42';
const parse=(value=href,config=channel,releases=[release])=>
  validateDeclaredMarketInstall(value,page,config,releases);

test('R6.1 fixed official install declaration is read-only and version-pinned',()=>{
  assert.equal(OPENDESK_INSTALL_REL,'opendesk-install');
  const result=parse();
  assert.deepEqual(result.subject,{kind:'app',marketId:release.id,version:release.version});
  assert.equal(result.release,release);
  assert.equal(result.pageOrigin,'https://docs.test');
  assert.equal(result.href,href);
  assert.equal(result.subject.kind,'app');
});

test('R6.1 discovery refuses arbitrary origins, ports, queries, fragments and package URLs',()=>{
  for(const value of [
    'https://evil.example/install/opendesk/markdown-workbench/versions/1.0.5/',
    'http://127.0.0.1:43133/install/opendesk/markdown-workbench/versions/1.0.5/',
    href+'?approved=true',href+'#run',
    origin+'/install/opendesk/markdown-workbench/versions/1.0.4/',
    origin+'/install/opendesk/markdown-workbench/versions/01.0.5/',
    origin+'/download/markdown-workbench.opendesk-tool.json',
    origin+'/install/opendesk/markdown-workbench/versions/1.0.5/%2e%2e/',
    'javascript:alert(1)','data:text/plain,test','https://user:pass@docs.test/'
  ])assert.throws(()=>parse(value),error=>error.code?.startsWith('E_DISCOVERY_'),value);
  assert.throws(()=>parse(href,{enabled:false}),{code:'E_CHANNEL_DISABLED'});
  assert.throws(()=>parse(href,channel,[]),{code:'E_DISCOVERY_RELEASE'});
  assert.throws(()=>parse(href,channel,[{...release,kind:'page-program'}]),{code:'E_DISCOVERY_RELEASE'});
  assert.throws(()=>parse(href,channel,[{...release,toolId:'other'}]),{code:'E_DISCOVERY_RELEASE'});
  assert.throws(()=>validateDeclaredMarketInstall(href,'file:///foo',channel,[release]),{code:'E_DISCOVERY_PAGE'});
});

function harness({links=[href],documentUrl=page,documentId='1234abcd',frameId=0,throwInjection=false,change=false}={}){
  const captured={status:'available',windowId:1,tabId:3,documentId:'1234abcd',url:page,origin:'https://docs.test'};
  let injected=null,validated=0;
  const target={ready:Promise.resolve(),capture:()=>captured,async revalidate(received){
    validated++;assert.equal(received,captured);
    if(change)throw Object.assign(new Error('stale'),{code:'E_DOCUMENT_STALE'});
  }};
  const api={scripting:{async executeScript(input){
    injected=input;if(throwInjection)throw Error('permission denied');
    return [{frameId,documentId,result:{documentUrl,links}}];
  }}};
  return {target,api,get injected(){return injected;},get validated(){return validated;}};
}

test('R6.1 scans only the captured top-level Chrome document, revalidates it and never executes page code',async()=>{
  const h=harness(),row=await discoverCurrentPageMarketInstall({
    api:h.api,currentPageTarget:h.target,channel,releases:[release]
  });
  assert.equal(row.subject.marketId,release.id);
  assert.deepEqual(h.injected.target,{tabId:3,documentIds:['1234abcd']});
  assert.equal(h.injected.world,'ISOLATED');
  assert.equal(h.validated,1);
  assert.equal(h.injected.func,captureDeclaredMarketLinks);
  assert(!/sendMessage|storage|fetch\(/.test(h.injected.func.toString()));
});

test('R6.1 rejects missing, duplicate, changed, failed and non-top-document discovery',async()=>{
  const cases=[
    [{links:[]},'E_DISCOVERY_MISSING'],
    [{links:[href,href]},'E_DISCOVERY_AMBIGUOUS'],
    [{links:[href],documentId:'different'},'E_DISCOVERY_DOCUMENT'],
    [{links:[href],frameId:1},'E_DISCOVERY_DOCUMENT'],
    [{links:[href],documentUrl:'https://docs.test/new'},'E_DISCOVERY_DOCUMENT'],
    [{links:[href],change:true},'E_DOCUMENT_STALE'],
    [{links:[href],throwInjection:true},'E_DISCOVERY_UNAVAILABLE']
  ];
  for(const [options,code] of cases){
    const h=harness(options);
    await assert.rejects(discoverCurrentPageMarketInstall({
      api:h.api,currentPageTarget:h.target,channel,releases:[release]
    }),{code});
  }
});

test('R6.1 market lists real review buttons, fixed-version app pages declare one link',()=>{
  const cards=home([release]);
  assert.match(cards,/data-open-review/);
  assert.match(cards,/安装到 OpenDesk/);
  assert.match(cards,/opendesk\/markdown-workbench/);
  const pinned={kind:'app',marketId:release.id,version:release.version};
  const html=layout({title:'工作台',description:'demo',body:'x',path:'/apps/opendesk/markdown-workbench/',
    channel,origin,installSubject:pinned});
  assert.match(html,/<link rel="opendesk-install" href="http:\/\/127\.0\.0\.1:43132\/install\/opendesk\/markdown-workbench\/versions\/1\.0\.5\/">/);
  assert(!layout({title:'列表',description:'demo',body:'',path:'/',channel,origin}).includes('rel="opendesk-install"'));
  assert(!layout({title:'未启用',description:'demo',body:'',path:'/apps/x/',
    channel:{...channel,enabled:false},origin,installSubject:pinned}).includes('rel="opendesk-install"'));
});

test('R6.1 existing React page owns the discovery UI; no alternate installer exists',async()=>{
  const center=await readFile('src/ui/extension-center.js','utf8');
  const pageUI=await readFile('src/ui/react/tabs/tools.tsx','utf8');
  const main=await readFile('src/ui/react/main.tsx','utf8');
  assert.match(center,/renderDiscovery/);
  assert.match(center,/discoverCurrentPageMarketInstall/);
  assert.match(center,/currentPageTarget\.revalidate\(selected\.target\)/);
  assert.match(center,/#\/apps\//);
  assert.match(pageUI,/ExtensionDiscovery/);
  assert.match(pageUI,/extension-center-discover/);
  assert.match(main,/renderDiscovery\(next\)/);
  assert(!pageUI.includes('chrome.runtime.sendMessage'));
});
