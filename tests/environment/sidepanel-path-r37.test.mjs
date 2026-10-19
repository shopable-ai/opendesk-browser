import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,readdir} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {EventEmitter} from 'node:events';
import {SIDEPANEL_DOCUMENT_PATH,SIDEPANEL_DOCUMENT_PATHNAME,toolDocumentIdentity} from '../../src/tool-document-url.js';
import {isToolSender,resolveToolSender} from '../../src/environment.js';
import {canonicalToolHostUrl,toolPageHref,toolPreviewHref} from '../../src/ui/sidebar-tools/navigation.js';
import {isActualSidePanelContext} from '../../src/ui/sidepanel-context.js';
import {isSidebarToolHostSender} from '../../src/sidebar-tools/sender.js';
import {developmentChanges} from '../../src/development/worker.js';
import {scheduledHostDocumentIds} from '../../src/platform/tasks/schedule-service.js';
import {STATIC_RESOURCES} from '../../scripts/prepare-public.mjs';
import {PACKAGE_ENTRIES,FIXED_OUTPUTS,SIDEPANEL_DOCUMENT_PATH as BUILD_SIDEPANEL_DOCUMENT_PATH} from '../../scripts/build-contract.mjs';
import {inspectHTML,verifyManifest,TOOL_HOST_META_CSP} from '../../scripts/verify-package.mjs';
import {configureDevelopment,closeDevelopment} from '../../scripts/wxt-development.mjs';

// MIGRATE: manifest, static HTML copy/reference contract, navigation and sender path.
// KEEP: fixed classic WXT bundles, CSP, startup order, locators and native identity.
const extension='abcdefghijklmnopabcdefghijklmnop';
const runtime={id:extension,getURL:path=>'chrome-extension://'+extension+'/'+path};
const base=runtime.getURL(SIDEPANEL_DOCUMENT_PATH),host='host-123';
const preview='00000000-0000-4000-8000-000000000001';
const scripts=['sidebar-tool-host','stay-focus-controls','trusted-cookie-ui','tool-shell'].map(name=>'ui/'+name+'.js');

test('R37 one root static document retains existing WXT bundles and rejects the legacy manifest entry',async()=>{
  assert.equal(SIDEPANEL_DOCUMENT_PATH,'sidepanel.html');
  assert.equal(SIDEPANEL_DOCUMENT_PATHNAME,'/sidepanel.html');
  assert.equal(BUILD_SIDEPANEL_DOCUMENT_PATH,SIDEPANEL_DOCUMENT_PATH);
  assert.equal(STATIC_RESOURCES['src/ui/sidepanel.html'],SIDEPANEL_DOCUMENT_PATH);
  assert.equal(STATIC_RESOURCES['src/ui/tool.html'],undefined);
  assert.equal(Object.values(STATIC_RESOURCES).includes('ui/tool.html'),false);
  assert.equal(Object.values(STATIC_RESOURCES).filter(path=>path===SIDEPANEL_DOCUMENT_PATH).length,1);
  assert.equal(PACKAGE_ENTRIES['ui/tool-shell'],'./src/ui/tool-shell.js');
  for(const name of ['tool-shell','sidebar-tool-host','stay-focus-controls','trusted-cookie-ui'])
    assert.equal(FIXED_OUTPUTS[name],'ui/'+name+'.js');
  assert.equal(Object.keys(PACKAGE_ENTRIES).some(name=>name.includes('sidepanel')),false);
  assert.equal((await readdir('src/entrypoints')).some(name=>name.endsWith('.html')),false);
  const manifest=JSON.parse(await readFile('manifest.json','utf8'));
  assert.deepEqual(manifest.side_panel,{default_path:SIDEPANEL_DOCUMENT_PATH});
  assert.doesNotThrow(()=>verifyManifest(manifest,{source:true}));
  assert.throws(()=>verifyManifest({...manifest,side_panel:{default_path:'ui/tool.html'}},{source:true}),/Side Panel entry/);
});

async function htmlFixture(t,file=SIDEPANEL_DOCUMENT_PATH){
  const root=await mkdtemp(join(tmpdir(),'opendesk-r37-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const html=await readFile(file==='native-agent/workspace.html'?'src/'+file:'src/ui/sidepanel.html','utf8');
  for(const [,asset] of html.matchAll(/(?:href|src)="([^"]+)"/g)){
    const target=join(root,dirname(file),asset);
    await mkdir(dirname(target),{recursive:true});
    await writeFile(target,'');
  }
  await writeFile(join(root,file),html);
  return {root,html};
}

test('R37 root HTML resolves local ui resources with original CSP and external startup order',async t=>{
  const {root,html}=await htmlFixture(t);
  const body=/<body>([\s\S]*?)<\/body>/.exec(html)[1].replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').trim();
  assert.equal(body,'<div id="opendesk-react-app" class="opendesk-react-app"></div>');
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(match=>match[1]),scripts);
  assert.ok(html.includes('content="'+TOOL_HOST_META_CSP+'"'));
  await inspectHTML(root,SIDEPANEL_DOCUMENT_PATH);
  await rm(join(root,'ui/tool-shell.js'));
  await assert.rejects(inspectHTML(root,SIDEPANEL_DOCUMENT_PATH),/ENOENT|Missing/);
});

for(const [name,change] of [
  ['button inside root',html=>html.replace('class="opendesk-react-app"></div>','class="opendesk-react-app"><button>Run</button></div>')],
  ['navigation outside root',html=>html.replace('</body>','<nav>Extensions</nav></body>')],
  ['duplicate roots',html=>html.replace('</body>','<div id="opendesk-react-app"></div></body>')],
  ['hidden template outside root',html=>html.replace('</body>','<template hidden><button>Run</button></template></body>')],
  ['hidden template inside root',html=>html.replace('class="opendesk-react-app"></div>','class="opendesk-react-app"><template hidden><button>Run</button></template></div>')],
  ['head template',html=>html.replace('</head>','<template hidden><nav>Extensions</nav></template></head>')],
  ['SSR text inside root',html=>html.replace('class="opendesk-react-app"></div>','class="opendesk-react-app">Loading tools</div>')],
  ['SSR text outside root',html=>html.replace('</body>','Loading tools</body>')],
  ['missing root',html=>html.replace('id="opendesk-react-app"','id="obsolete-root"')],
  ['nested root',html=>html.replace('<div id="opendesk-react-app" class="opendesk-react-app"></div>','<section><div id="opendesk-react-app"></div></section>')],
  ['entity-encoded duplicate root',html=>html.replace('</body>','<div id="opendesk-react-&#97;pp"></div></body>')]
])test('R37 empty React root gate rejects '+name,async t=>{
  const {root,html}=await htmlFixture(t);
  const changed=change(html);
  assert.notEqual(changed,html,'mutation must exercise the HTML gate');
  await writeFile(join(root,SIDEPANEL_DOCUMENT_PATH),changed);
  await assert.rejects(inspectHTML(root,SIDEPANEL_DOCUMENT_PATH),/one empty React root without static business DOM/);
});

test('R37 empty React root gate accepts parsed attributes, inert comments and resource placement',async t=>{
  const {root,html}=await htmlFixture(t);
  const changed=html.replace('id="opendesk-react-app"',"id = 'opendesk-react-&#97;pp'")
    .replace('<body>','<body>\n<!-- id="opendesk-react-app" is the mount point -->')
    .replace('<link rel="stylesheet" href="ui/extension-center.css">','')
    .replace('<body>','<body><link rel="stylesheet" href="ui/extension-center.css">');
  await writeFile(join(root,SIDEPANEL_DOCUMENT_PATH),changed);
  await inspectHTML(root,SIDEPANEL_DOCUMENT_PATH);
});

test('R37 Workspace HTML shares the empty React root gate',async t=>{
  const file='native-agent/workspace.html';
  const {root,html}=await htmlFixture(t,file);
  await inspectHTML(root,file);
  for(const changed of [
    html.replace('id="workspace-root"></div>','id="workspace-root"><button>Open</button></div>'),
    html.replace('</body>','<nav>Files</nav></body>'),
    html.replace('</body>','<template hidden><div id="workspace-root"></div></template></body>')
  ]){
    await writeFile(join(root,file),changed);
    await assert.rejects(inspectHTML(root,file),/one empty React root without static business DOM/);
  }
});

test('R37 final preloaded sidecar keeps History/Schedule/Cloud/Task preparation before shell startup',async()=>{
  const sidecar=await readFile('src/entrypoints/trusted-cookie-ui.js','utf8');
  assert.match(sidecar,/__opendeskTrustedHistoryUI/);
  for(const name of ['createTrustedHistoryWorkbench','createScheduledTaskHost','createCloudHosting','createTaskWorkbench','createScheduledTaskWorkbench'])
    assert.ok(sidecar.includes(name),name+' remains in the existing audited sidecar');
});

test('R37 HTML verifier retains resource, startup-order and CSP gates and rejects legacy output',async t=>{
  const {root,html}=await htmlFixture(t);
  for(const [changed,expected] of [
    [html.replace('src="ui/tool-shell.js"','src="https://evil.example/runtime.js"'),/Unsafe HTML resources/],
    [html.replace('src="ui/tool-shell.js"','src="tool-shell.js"'),/ENOENT|Missing/],
    [html.replace('<script src="ui/stay-focus-controls.js"></script>\n<script src="ui/trusted-cookie-ui.js"></script>',
      '<script src="ui/trusted-cookie-ui.js"></script>\n<script src="ui/stay-focus-controls.js"></script>'),/Unapproved HTML resource references/],
    [html.replace(TOOL_HOST_META_CSP,"frame-src *"),/Unexpected HTML CSP/],
    [html.replace('</body>','<script>void 0</script></body>'),/Unsafe HTML/]
  ]){
    await writeFile(join(root,SIDEPANEL_DOCUMENT_PATH),changed);
    await assert.rejects(inspectHTML(root,SIDEPANEL_DOCUMENT_PATH),expected);
  }
  await writeFile(join(root,'ui/tool.html'),html.replaceAll('href="ui/','href="').replaceAll('src="ui/','src="'));
  await assert.rejects(inspectHTML(root,'ui/tool.html'),/Unapproved HTML resource references/);
});

test('R37 navigation keeps locators and host instance while refusing obsolete or foreign-world paths',()=>{
  assert.equal(toolPageHref(runtime,'quick-notes'),base+'?toolId=quick-notes');
  assert.equal(toolPreviewHref(runtime,preview),base+'?previewId='+preview);
  for(const suffix of ['', '?toolId=quick-notes','?previewId='+preview,'?scheduledRunner=1']){
    const canonical=canonicalToolHostUrl(base+suffix,host);
    assert.equal(new URL(canonical).pathname,SIDEPANEL_DOCUMENT_PATHNAME);
    assert.equal(toolDocumentIdentity(base,canonical).hostInstanceId,host);
  }
  for(const address of [runtime.getURL('ui/tool.html'),runtime.getURL('ui/sidepanel.html'),runtime.getURL('ui/marketplace.html'),
    runtime.getURL('sidepanel.html/'),runtime.getURL('sidepanel.html').replace('chrome-extension:','https:')]){
    assert.throws(()=>canonicalToolHostUrl(address,host),/Side Panel document/);
    assert.equal(toolDocumentIdentity(base,address),null);
  }
  const legacy=runtime.getURL('ui/tool.html');
  assert.equal(toolDocumentIdentity(legacy,legacy+'?hostInstanceId='+host),null,'old base cannot restore trust');
});

test('R37 sender gate preserves exact extension/document/frame/lifecycle and parameter validation',async()=>{
  const api={runtime:{...runtime,getContexts:async()=>[]}},url=base+'?hostInstanceId='+host;
  const sender={id:extension,url,frameId:0,documentId:'browser-document',documentLifecycle:'active'};
  assert.equal(isToolSender(api,sender),true);
  assert.equal(await resolveToolSender(api,sender),sender);
  for(const changed of [{id:'other'},{url:runtime.getURL('ui/tool.html')+'?hostInstanceId='+host},
    {url:url.replace(extension,'other')},{url:url.replace('chrome-extension:','https:')},
    {frameId:1},{documentId:''},{documentLifecycle:'cached'},{tab:{id:1,incognito:true}},
    {url:url+'&hostInstanceId='+host},{url:url+'&unknown=1'},{url:url+'#fragment'},
    {url:url+'&toolId=../bad'},{url:url+'&previewId=bad'},{url:url+'&scheduledRunner=0'},
    {url:url+'&scheduledRunner=1&toolId=quick-notes'},{url:url+'&toolId=quick-notes&previewId='+preview}]){
    assert.equal(isToolSender(api,{...sender,...changed}),false,JSON.stringify(changed));
    await assert.rejects(resolveToolSender(api,{...sender,...changed}),{code:'E_OWNER'});
  }
  for(const suffix of ['&toolId=quick-notes','&previewId='+preview,'&scheduledRunner=1']){
    const located={...sender,url:url+suffix,tab:{id:7,incognito:false}};
    assert.equal(isToolSender(api,located),true);
    assert.equal(isToolSender(api,{...located,tab:undefined}),false);
    assert.equal(isToolSender(api,{...located,tab:{id:-1}}),false);
  }
});

test('R37 every duplicate identity/locator key is rejected, including encoded names, while single locators remain valid',async()=>{
  const api={runtime:{...runtime,getContexts:async()=>[]}};
  for(const [key,value,other] of [
    ['hostInstanceId',host,'host-other'],['toolId','quick-notes','knowledge-inbox'],
    ['previewId',preview,'00000000-0000-4000-8000-000000000002'],['scheduledRunner','1','0']
  ]){
    const address=new URL(base);address.searchParams.set('hostInstanceId',host);address.searchParams.set(key,value);
    const sender={id:extension,url:address.href,frameId:0,documentId:'locator-document',
      documentLifecycle:'active',tab:{id:7,incognito:false}};
    assert.equal(isToolSender(api,sender),true,key+' single locator');
    for(const pair of [key+'='+value,key+'='+other,'%'+key.charCodeAt(0).toString(16)+key.slice(1)+'='+value]){
      const duplicate={...sender,url:address.href+'&'+pair};
      assert.equal(toolDocumentIdentity(base,duplicate.url),null,key+' '+pair);
      assert.equal(isToolSender(api,duplicate),false,key+' '+pair);
      await assert.rejects(resolveToolSender(api,duplicate),{code:'E_OWNER'});
    }
  }
});

test('R37 missing document ID resolves only one exact native Side Panel and never a locator tab',async()=>{
  const url=base+'?hostInstanceId='+host,sender={id:extension,url};
  const context={contextType:'SIDE_PANEL',documentUrl:url,documentId:'native-document',frameId:0,incognito:false};
  let contexts=[context],queries=0;
  const api={runtime:{...runtime,getContexts:async query=>{
    queries++;assert.deepEqual(query,{contextTypes:['SIDE_PANEL'],documentUrls:[url]});return contexts;
  }}};
  assert.equal((await resolveToolSender(api,sender)).documentId,'native-document');
  for(const rows of [[],[context,context],[{...context,frameId:1}],[{...context,incognito:true}],
    [{...context,documentId:''}],[{...context,contextType:'TAB'}],[{...context,documentUrl:url+'&unknown=1'}]]){
    contexts=rows;
    await assert.rejects(resolveToolSender(api,sender),{code:'E_OWNER'});
  }
  const count=queries;
  for(const address of [runtime.getURL('ui/tool.html')+'?hostInstanceId='+host,url+'&toolId=quick-notes',url+'&scheduledRunner=1'])
    await assert.rejects(resolveToolSender(api,{...sender,url:address}),{code:'E_OWNER'});
  assert.equal(queries,count,'legacy paths and locators never use native fallback');
});

test('R37 Side Panel classification also refuses old/foreign paths, frames, inactive or incognito contexts',async()=>{
  const href=base+'?hostInstanceId='+host;
  let row={contextType:'SIDE_PANEL',documentUrl:href,documentId:'native-document',frameId:0,incognito:false};
  const api={runtime:{...runtime,getContexts:async()=>[row]}};
  assert.equal(await isActualSidePanelContext({api,href}),true);
  for(const changed of [{frameId:1},{incognito:true},{documentLifecycle:'cached'},{documentId:''},{contextType:'TAB'}]){
    const original=row;row={...row,...changed};
    assert.equal(await isActualSidePanelContext({api,href}),false);
    row=original;
  }
  for(const address of [runtime.getURL('ui/tool.html')+'?hostInstanceId='+host,href.replace(extension,'other'),href+'&unknown=1']){
    row={...row,documentUrl:address};
    assert.equal(await isActualSidePanelContext({api,href:address}),false);
  }
});

test('R37 shared sidebar sender gate retains its UUID/tool locator contract and rejects the old path',()=>{
  const uuid='12345678-1234-4123-8123-123456789abc';
  const url=base+'?hostInstanceId='+uuid,sender={id:extension,url};
  assert.equal(isSidebarToolHostSender({runtime},sender),true);
  assert.equal(isSidebarToolHostSender({runtime},{...sender,url:url+'&toolId=knowledge-inbox'},'knowledge-inbox'),true);
  for(const changed of [{id:'other'},{url:url.replace('/sidepanel.html','/ui/tool.html')},
    {url:url.replace(extension,'other')},{url:url+'#fragment'},{url:url+'&unknown=1'},
    {url:url+'&hostInstanceId='+uuid},{url:base+'?hostInstanceId=not-a-uuid'},
    {url:url+'&toolId=knowledge-inbox'},{url:url+'&toolId=knowledge-inbox&toolId=knowledge-inbox'}])
    assert.equal(isSidebarToolHostSender({runtime},{...sender,...changed}),false,JSON.stringify(changed));
  assert.equal(isSidebarToolHostSender({runtime},{...sender,url:url+'&toolId=other-tool'},'knowledge-inbox'),false);
  for(const pair of ['toolId=knowledge-inbox','toolId=other-tool','%74oolId=knowledge-inbox'])
    assert.equal(isSidebarToolHostSender({runtime},{...sender,url:url+'&toolId=knowledge-inbox&'+pair},'knowledge-inbox'),false);
});

test('R37 scheduler selects only root Side Panel or explicit runner, never legacy/catalog/preview documents',async()=>{
  const url=base+'?hostInstanceId='+host;
  const contexts=[
    {contextType:'SIDE_PANEL',documentId:'side',documentUrl:url},
    {contextType:'TAB',documentId:'runner',documentUrl:url+'&scheduledRunner=1'},
    {contextType:'SIDE_PANEL',documentId:'old-side',documentUrl:url.replace('/sidepanel.html','/ui/tool.html')},
    {contextType:'TAB',documentId:'old-runner',documentUrl:url.replace('/sidepanel.html','/ui/tool.html')+'&scheduledRunner=1'},
    {contextType:'TAB',documentId:'catalog',documentUrl:url},
    {contextType:'TAB',documentId:'preview',documentUrl:url+'&previewId='+preview},
    {contextType:'TAB',documentId:'tool',documentUrl:url+'&toolId=quick-notes'},
    {contextType:'TAB',documentId:'forged',documentUrl:url+'&scheduledRunner=1&unknown=1'},
    {contextType:'TAB',documentId:'inactive',documentUrl:url+'&scheduledRunner=1',documentLifecycle:'cached'}
  ];
  const api={runtime:{...runtime,getContexts:async()=>contexts}};
  assert.deepEqual([...await scheduledHostDocumentIds(api)].sort(),['runner','side']);
});

test('R37 development changes classify root HTML as a safe page refresh without retaining a legacy alias',()=>{
  for(const file of [SIDEPANEL_DOCUMENT_PATH,'ui/tool-shell.js','ui/tool-shell.css','ui/tool.html']){
    const changes=developmentChanges({files:{[file]:'old'}},{files:{[file]:'new'}});
    assert.equal(changes.page,[SIDEPANEL_DOCUMENT_PATH,'ui/tool-shell.js'].includes(file));
    assert.equal(changes.css,file==='ui/tool-shell.css');
    assert.equal(changes.extension,file==='ui/tool.html');
  }
});

test('R37 static development sync watches and copies root HTML through the existing publication queue',async t=>{
  const root=await mkdtemp(join(tmpdir(),'opendesk-r37-sync-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const source=join(root,'src/ui/sidepanel.html'),publicDir=join(root,'public');
  await mkdir(dirname(source),{recursive:true});await writeFile(source,'<main>root change</main>');
  const watcher=new EventEmitter(),watched=[],events=[],errors=[];
  watcher.add=paths=>watched.push(...paths);
  watcher.on('all',(event,path)=>events.push({event,path}));
  const wxt={config:{root,publicDir,outDir:join(root,'dist')},
    builder:{async build(){},async importEntrypoints(){}},logger:{info(){},error:error=>errors.push(error)}};
  const server={watcher,currentOutput:{publicAssets:[],steps:[]}};
  configureDevelopment(wxt,server);
  try{
    assert.ok(watched.includes(source));
    assert.equal(watched.includes(join(root,'src/ui/tool.html')),false);
    watcher.emit('all','change',source);
    await closeDevelopment(wxt,server);
    assert.equal(await readFile(join(publicDir,'sidepanel.html'),'utf8'),'<main>root change</main>');
    assert.ok(events.some(row=>row.event==='change'&&row.path===join(publicDir,'sidepanel.html')));
    assert.deepEqual(errors,[]);
  }finally{await closeDevelopment(wxt,server);}
});
