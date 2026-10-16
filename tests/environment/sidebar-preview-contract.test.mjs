import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {resolve} from 'node:path';
import vm from 'node:vm';
import {createSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';
import {generatePreview,buildPreview,previewReviewContext,PREVIEW_CONTEXT_FORMAT,PREVIEW_SCENARIOS} from '../../scripts/preview/build-preview.mjs';
import {assertLayoutOnly,compileSharedToolCss,officialDesignSources,SHARED_DESIGN_MARKER} from '../../scripts/preview/shared-tool-design.mjs';
import {PREVIEW_INPUTS,previewSourceHashes,assertPreviewLock} from '../../scripts/preview/check-preview-contract.mjs';

const read=path=>readFile(new URL('../../'+path,import.meta.url),'utf8');
const project=resolve('examples/sidebar-tools/quick-notes');
test('real package and offline preview have one compiled visual source and DOM implementation',async()=>{
  const tool=await createSidebarToolPackage(project);
  assert.match(tool.css,/^\/\* opendesk\.shared-design\.v1 sha256=/);
  assert.match(tool.html,/class="od-icon-button/);
  assert.match(tool.html,/class="od-field"/);
  assert.match(tool.js,/className='od-button od-button--secondary note-chip'/);
  const preview=await generatePreview({width:320,theme:'dark',scenario:'success'});
  assert.ok(preview.frameHtml.includes('data:text/css;base64,'+Buffer.from(tool.css).toString('base64')));
  assert.ok(preview.frameHtml.includes('data:text/javascript;base64,'+Buffer.from(tool.js).toString('base64')));
  assert.equal(preview.manifest.mock,true);
  assert.equal(preview.manifest.installed,false);
  assert.equal(preview.manifest.viewport.width,320);
  assert.match(preview.html,/sandbox="allow-scripts"/);
  assert.doesNotMatch(preview.html,/sandbox="allow-scripts allow-same-origin"/);
  assert.match(preview.frameHtml,/connect-src 'none'/);
  assert.match(preview.html,/模拟预览 · 非真实安装/);
});
test('public token/component CSS is consumed verbatim and follows canonical edits',async()=>{
  const layout=await read('examples/sidebar-tools/quick-notes/src/style.css');
  const {tokens,publicRules}=await officialDesignSources();
  const built=await compileSharedToolCss(layout);
  assert.ok(built.includes(tokens));
  assert.ok(built.includes(publicRules));
  assert.ok(built.includes('.od-icon-button{'));
  assert.ok(built.includes('.od-field{')||built.includes(').od-field{'));
  assert.equal(assertLayoutOnly(layout).includes('.notes-app{'),true);
});
test('private button skins, duplicated tokens and remote CSS fail the build',async()=>{
  const bad=[
    '.icon-button{background:#fab123}',
    '.custom-button{background:var(--od-brand)}',
    ':root{--od-brand:red}',
    '.od-icon-button{color:red}',
    'button{border-radius:24px}',
    '@import url(https://evil.invalid/x.css)'
  ];
  for(const rule of bad)
    await assert.rejects(compileSharedToolCss(SHARED_DESIGN_MARKER+'\n'+rule),
      /E_PREVIEW_DESIGN/,rule);
});
test('CSS comments with button wording cannot masquerade as a button visual override',async()=>{
  const innocent=SHARED_DESIGN_MARKER+
    '\n/* R1.13: compact square-button edit form. */\n.ps{gap:var(--space-2);padding:var(--space-2)}';
  assert.match(await compileSharedToolCss(innocent),/\.ps\{gap:var\(--space-2\)/);
  const dangerous=SHARED_DESIGN_MARKER+
    '\n/* inert text */ .ps-button{background:var(--od-brand)}';
  await assert.rejects(compileSharedToolCss(dangerous),/E_PREVIEW_DESIGN/);
});
test('freshness lock rejects a changed formal token without falsely passing',async()=>{
  const lock=JSON.parse(await read('contracts/ui-preview/quick-notes.lock.json'));
  const hashes=await previewSourceHashes();
  assert.equal(assertPreviewLock(lock,hashes),true);
  const altered={...hashes,'src/ui/design-tokens.css':'0'.repeat(40)};
  assert.throws(()=>assertPreviewLock(lock,altered),/stale preview input src\/ui\/design-tokens\.css/);
  assert.deepEqual(Object.keys(hashes),PREVIEW_INPUTS);
});
test('fixed inputs produce byte-identical preview across builds and scenarios are isolated',async()=>{
  const p=await generatePreview(),q=await generatePreview();
  assert.equal(p.html,q.html);
  for(const scenario of PREVIEW_SCENARIOS){
    const result=await generatePreview({scenario});
    assert.equal(result.manifest.scenario,scenario);
    assert.match(result.frameHtml,/<div id="tool-root">/);
  }
  await assert.rejects(generatePreview({surface:'injected-page'}),/no verified production preview adapter/);
  await assert.rejects(generatePreview({tool:'unknown'}),/mock SDK adapter/);
});
test('mock bridge stores only in memory, refuses live task actions and preserves hostile text',async()=>{
  const code=await read('scripts/preview/quick-notes-mock.js');
  const launch=scenario=>{
    const env={document:{getElementById:id=>id==='tool-root'?{}:null},
      __opendeskPreviewScenario:scenario};
    env.globalThis=env;
    vm.runInNewContext(code,env,{timeout:1000});
    return env.OpenDeskTool;
  };
  const api=launch('success'),snapshot=await api.request('storage.get',{key:'notes',withEtag:true});
  assert.equal(snapshot.value[0].id,'preview-note');
  assert.match(snapshot.etag,/^[0-9]{64}$/);
  await assert.rejects(api.request('tasks.open',{taskId:'real-task'}),/不支持打开或执行真实任务/);
  const saved=await api.request('storage.set',{key:'notes',value:[],ifMatch:snapshot.etag});
  assert.equal(saved.simulated,true);
  assert.equal((await api.request('storage.get',{key:'notes'})).value.length,0);
  const hostile=await launch('untrusted').request('storage.get',{key:'notes'});
  assert.match(hostile.value[0].text,/<img src=x onerror=alert\(1\)>/);
  await assert.rejects(launch('permission-denied').request('storage.get',{key:'notes'}),/权限/);
  await assert.rejects(launch('error').request('storage.get',{key:'notes'}),/存储故障/);
});

test('bookmark manager R2.5 shares its real package UI with an isolated full-bookmarks mock',async()=>{
  const project=resolve('examples/sidebar-tools/bookmark-manager');
  const pkg=await createSidebarToolPackage(project);
  assert.match(pkg.css,/^\/\* opendesk\.shared-design\.v1 sha256=/);
  assert.match(pkg.html,/class="od-button/);
  assert.match(pkg.html,/id="bm-inspector"/);
  const preview=await generatePreview({tool:'bookmark-manager',scenario:'success',width:360});
  assert.equal(preview.manifest.tool,'bookmark-manager');
  assert.equal(preview.manifest.mock,true);
  assert.equal(preview.manifest.permissionsGranted,false);
  assert.equal(preview.manifest.operations.length,12);
  assert.ok(preview.frameHtml.includes('data:text/javascript;base64,'+Buffer.from(pkg.js).toString('base64')));
  assert.doesNotMatch(pkg.html,/预览测试辅助工具|od-preview-bookmark-lab/);
  assert.doesNotMatch(pkg.js,/__opendeskBookmarkMockDiagnostic|opendesk\.preview\.bookmark\.command/);
  assert.doesNotMatch(preview.frameHtml,/预览测试辅助工具|id="od-preview-bookmark-lab"|data-bookmark-diagnostic=/);
  assert.match(preview.html,/id="od-preview-bookmark-lab"/);
  assert.match(preview.html,/data-bookmark-diagnostic="external-conflict"/);
  assert.match(preview.html,/预览测试辅助工具（不属于书签管理器）/);
  assert.match(preview.html,/sandbox="allow-scripts"/);
  assert.doesNotMatch(preview.html,/sandbox="allow-scripts allow-same-origin"/);
  const mock=await read('scripts/preview/bookmark-manager-mock.js');
  const context={document:{getElementById:id=>id==='tool-root'?{}:null},
    __opendeskPreviewScenario:'success',Date};
  context.globalThis=context;
  vm.runInNewContext(mock,context,{timeout:1000});
  assert.equal(typeof context.__opendeskBookmarkMockDiagnostic,'function');
  assert.equal(context.__opendeskBookmarkMockDiagnostic('delete-all'),null,
    'mock-only diagnostics reject unknown commands, not privileged requests');
  const sdk=context.OpenDeskSDK.browser;
  const first=await sdk.bookmarks.getTree({limit:100});
  assert.equal(first.nodes.length,100);
  assert.ok(first.nextCursor);
  const created=await sdk.bookmarks.create({title:'Only in mock',parentId:'1'});
  assert.ok(created.id);
  const update=await sdk.bookmarks.update({id:created.id,
    expected:created,changes:{title:'Renamed in mock'}});
  assert.equal(update.title,'Renamed in mock');
  assert.equal((await sdk.bookmarks.getTree({limit:100})).nodes.length,100);
  await assert.rejects(generatePreview({tool:'bookmark-manager',surface:'injected-page'}),
    /no verified production preview adapter/);
});

test('bookmark laboratory is an OUTER preview-only surface across supported tools',async()=>{
  const [bookmark,notes,adblock]=await Promise.all([
    generatePreview({tool:'bookmark-manager',scenario:'success',width:360}),
    generatePreview({tool:'quick-notes',scenario:'success',width:360}),
    generatePreview({tool:'adblock',scenario:'success',width:360})
  ]);
  const shell=bookmark.html;
  assert.ok(shell.indexOf('id="od-preview-bookmark-lab"')>
    shell.indexOf('id="opendesk-preview-frame"'),'test lab follows the simulated device');
  for(const other of [notes,adblock])
    assert.doesNotMatch(other.html,/id="od-preview-bookmark-lab"/);
  assert.ok(!bookmark.frameHtml.includes('data-bookmark-diagnostic='));
  const script=await read('scripts/preview/bookmark-manager-lab.js');
  assert.match(shell,/opendesk\.preview\.bookmark\.command\.v1/);
  assert.match(script,/event\.source!==frame\?\.contentWindow/);
  assert.match(script,/event\.origin!=='null'/);
  assert.doesNotMatch(script,/chrome\.|permissions\.request|\bfetch\s*\(/);
});

test('bookmark Mock accepts only named commands from its immediate preview parent',async()=>{
  const code=await read('scripts/preview/bookmark-manager-mock.js');
  const ack=[],listeners=new Map();
  const parent={postMessage(value,origin){ack.push({value,origin})}};
  const root={querySelector:selector=>selector==='#bm-inspector-id'?
    {textContent:'100'}:null};
  const context={
    document:{getElementById:id=>id==='tool-root'?root:null},
    __opendeskPreviewScenario:'success',parent,Date,
    addEventListener:(type,handler)=>listeners.set(type,handler)
  };
  context.globalThis=context;
  vm.runInNewContext(code,context,{timeout:1000});
  const before=(await context.OpenDeskSDK.browser.bookmarks.get({id:'100'}))[0].title;
  const send=(source,command,requestId='1')=>listeners.get('message')({
    source,data:{type:'opendesk.preview.bookmark.command.v1',command,requestId}
  });
  send({},'external-conflict');
  send(parent,'remove-all');
  send(parent,'external-conflict','../../');
  assert.equal(ack.length,0,'non-parent, unlisted command and bad request ID are inert');
  const still=(await context.OpenDeskSDK.browser.bookmarks.get({id:'100'}))[0].title;
  assert.equal(still,before);
  send(parent,'external-conflict','17');
  assert.equal(ack.length,1,'one bounded receipt sent to the external laboratory');
  assert.equal(ack[0].value.type,'opendesk.preview.bookmark.ack.v1');
  assert.equal(ack[0].value.command,'external-conflict');
  assert.equal(ack[0].value.requestId,'17');
  assert.equal(ack[0].origin,'*','opaque sandbox has no addressable origin');
  const after=(await context.OpenDeskSDK.browser.bookmarks.get({id:'100'}))[0].title;
  assert.match(after,/另一窗口修改/);
});

test('build emits short source-bound review context next to the offline HTML',async()=>{
  const preview=await generatePreview({tool:'quick-notes',scenario:'empty',width:320});
  const brief=previewReviewContext(preview);
  assert.equal(brief.format,PREVIEW_CONTEXT_FORMAT);
  assert.equal(brief.toolId,'quick-notes');
  assert.equal(brief.activeTab,'扩展');
  assert.equal(brief.view,'extension-tool-detail');
  assert.equal(brief.scenario,'empty');
  assert.equal(brief.viewportCssPx.width,320);
  assert.equal(brief.source.shellSha256,preview.manifest.shellSha256);
  assert.equal(brief.simulation.realUninstall,false);
  assert.ok(brief.hostInteractions.some(action=>action.includes('卸载')));
  assert.ok(JSON.stringify(brief).length<1800,'do not copy HTML/CSS/JS into brief');
  const dir=await mkdtemp(join(tmpdir(),'od-preview-r13-'));
  try{
    const result=await buildPreview({out:join(dir,'preview.html'),scenario:'empty',width:320});
    const disk=JSON.parse(await readFile(result.context,'utf8'));
    assert.equal(disk.html,result.output);
    assert.equal(disk.source.uiSha256,result.uiSha256);
    assert.match(await readFile(result.output,'utf8'),/id="opendesk-preview-frame"/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
