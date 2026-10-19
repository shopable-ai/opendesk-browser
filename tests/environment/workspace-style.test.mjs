import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import Module from 'node:module';
import {build} from 'esbuild';
import {load} from 'cheerio';
import {compileWorkspaceStyle,inspectWorkspaceStyle} from '../../scripts/build-workspace-style.mjs';
import {buildWorkspaceDemo} from '../../scripts/build-workspace-demo.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

// Compile the production components and domain controllers, not a parallel HTML fixture.
// The output stays in memory; these tests never overwrite a running dev build.
const runtime=build({stdin:{contents:`
  export {WorkspaceView} from './src/ui/react/workspace/WorkspaceView.tsx';
  export {createWorkspaceController} from './src/native-agent/workspace.js';
  export {createMemoryWorkspace} from './src/native-agent/file-workspace-demo.js';
  export {setLocalePreference,SUPPORTED_LOCALES,LOCALE_NAMES,translate} from './src/i18n/index.js';
`,resolveDir:resolve('.'),loader:'tsx'},bundle:true,write:false,platform:'node',format:'cjs',packages:'external'})
  .then(result=>{
    const module=new Module(resolve('tests/environment/workspace-ssr.cjs'));
    module.filename=resolve('tests/environment/workspace-ssr.cjs');
    module.paths=Module._nodeModulePaths(resolve('tests/environment'));
    module._compile(result.outputFiles[0].text,module.filename);
    return {...module.exports,React:module.require('react'),renderToStaticMarkup:module.require('react-dom/server').renderToStaticMarkup};
  });
async function workspaceSSR(t,options={}){
  const api=await runtime;
  api.setLocalePreference('zh-CN',{persist:false});
  const controller=api.createWorkspaceController(options);
  t.after(()=>controller.dispose());
  await controller.ready;
  const render=(viewController=controller)=>api.renderToStaticMarkup(api.React.createElement(api.WorkspaceView,{controller:viewController}));
  return {...api,controller,render,html:render()};
}
let generatedStyle;
function currentStyle(){
  return generatedStyle??=(async()=>{
    const dir=await mkdtemp(resolve(tmpdir(),'opendesk-workspace-style-'));
    try{
      const generated=await compileWorkspaceStyle(dir);
      return {generated,css:await readFile(resolve(dir,'native-agent/workspace.css'),'utf8')};
    }finally{await rm(dir,{recursive:true,force:true});}
  })();
}

test('R22 source generates the complete Tailwind CSS behavior contract',async()=>{
  const {generated,css}=await currentStyle();
  assert.deepEqual(generated,{...inspectWorkspaceStyle(css),path:'native-agent/workspace.css'});
  for(const marker of ['.file-entry.selected','.connection.ready','data-view','.workspace-status.error','--space-2:','--od-brand:'])
    assert.ok(css.includes(marker),'Missing state selector '+marker);
  assert.ok(css.includes('.file-entry .file-icon'),'SVG tree icons must be styled');
  assert.ok(css.includes('.file-entry .tree-caret'),'folder disclosure chevrons must remain visible');
  assert.ok(css.includes('.tree-action svg'),'compact explorer toolbar must be bundled');
  assert.ok(css.includes('.tree-location'),'path context must be bundled');
  assert.ok(!css.includes('.file-entry .file-kind'),'legacy DIR/MD/TXT text badges must not ship');
  assert.match(css,/\.file-rail:not\(\[open\]\)>\.rail-toggle\{[^}]*display:flex/,
    'A directory collapsed on a narrow viewport must remain reopenable on desktop');
});

for(const mode of ['production','development'])test('R22 dist '+mode+' publishes the generated Tailwind CSS',async()=>{
  const {generated}=await currentStyle();
  const packed=await readFile('dist/'+mode+'/native-agent/workspace.css');
  assert.equal(sha(packed),generated.sha256,'Unexpected '+mode+' CSS source; rebuild only through the coordinated build owner');
});

test('R22 React SSR retains critical controls and collapses secondary panels',async t=>{
  const {html}=await workspaceSSR(t),$=load(html);
  for(const selector of ['details.chat-edit-panel','details.workspace-tool-preview','details.page-disclosure','details.workspace-technical']){
    assert.equal($(selector).length,1,selector);
    assert.equal($(selector).attr('open'),undefined,'Secondary panel must be opt-in: '+selector);
  }
  assert.equal($('details.file-rail[open]').length,1);
  assert.equal($('#file-list').attr('role'),'tree');
  for(const [id,label] of [['refresh-files','刷新文件树'],['parent-directory','折叠所有子目录']]){
    assert.equal($('#'+id).prop('tagName'),'BUTTON');
    assert.equal($('#'+id).attr('aria-label'),label,id+' accessible name');
    assert.equal($('#'+id).attr('title'),label,id+' tooltip');
  }
  assert.doesNotMatch(html,/文件树<\/strong><button/,'explorer controls must not concatenate with the heading');
  for(const id of ['file-editor','file-list','save-file','discard-file-draft','save-as','edit-answer','edit-review',
    'conflict-panel','file-surface','app-surface','chat-request-path','chat-file-result-panel','edit-receipt-panel','tree-message'])
    assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,'Missing/duplicate '+id);
  assert.deepEqual([...html.matchAll(/data-view="([^"]+)" aria-pressed=/g)].map(m=>m[1]),['preview','source','split','app']);
});

test('R22 CSS scanner rejects uncompiled directives and missing design contract',()=>{
  assert.throws(()=>inspectWorkspaceStyle('x'.repeat(6000)+'@source "./workspace.html";'),/uncompiled/);
  assert.throws(()=>inspectWorkspaceStyle('x'.repeat(6000)),/missing expected contract/);
});

test('Workspace memory demo builds with the same compiled source stylesheet and React root',async t=>{
  const dir=await mkdtemp(resolve(tmpdir(),'opendesk-workspace-demo-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const result=await buildWorkspaceDemo({output:resolve(dir,'demo.html'),fixtureRoot:resolve(dir,'files')});
  const html=await readFile(result.demo,'utf8'),css=html.match(/<style>([\s\S]*?)<\/style>/)?.[1];
  assert.equal(inspectWorkspaceStyle(css).sha256,result.cssSha256);
  assert.equal(result.cssSha256,(await currentStyle()).generated.sha256);
  assert.equal(result.backend,'memory-only');assert.equal(result.native,false);
  const $=load(html);
  assert.match($('title').text(),/内存演示/);
  assert.equal($('#workspace-root').length,1);
  assert.equal($('#workspace-root').children().length,0,'Demo mounts the same React view');
  const rendered=load((await workspaceSSR(t)).html);
  assert.equal(rendered('#demo-banner[hidden]').length,0);
  assert.match(rendered('#demo-banner').text(),/内存/);
  assert.equal(await readFile(resolve(dir,'files/README.md'),'utf8'),(await import('../../src/native-agent/file-workspace-demo.js')).DEMO_FILES['README.md']);
});

test('R3 React explorer ships an SVG-first compact toolbar with semantic accessible actions',async t=>{
  const {html}=await workspaceSSR(t),$=load(html);
  const styles=await readFile('src/native-agent/workspace.tailwind.css','utf8');
  assert.match(html,/data-workspace-ui="svg-r3"/);
  assert.doesNotMatch(html,/<(?:path|circle|rect)\b[^>]*\/>/,
    'SVG shapes must have explicit closing tags to satisfy the strict package HTML scanner');
  assert.match(html,/id="file-list"[^>]*data-icon-system="local-svg"[^>]*role="tree"/);
  for(const id of ['refresh-connection','open-settings','open-sidebar','open-workbench',
    'reload-file','copy-content','open-preview-tab']){
    const button=$('#'+id);
    assert.equal(button.prop('tagName'),'BUTTON',id);
    assert.ok(button.attr('aria-label'),id+' accessible name');
    assert.ok(button.attr('title'),id+' tooltip');
    assert.ok(button.hasClass('workspace-icon-action'),id+' compact style');
    assert.ok(button.hasClass('od-icon-button'),id+' shared React primitive');
    assert.equal(button.children('svg[aria-hidden="true"]').length,1,id+' local vector');
  }
  for(const [id,text] of [['save-file','保存'],['discard-file-draft','丢弃草稿']])
    assert.match(html,new RegExp('id="'+id+'"[^>]*>\\s*<svg\\b[^>]*>[\\s\\S]*?<\\/svg>'+text+'<\\/button>'),
      'Primary or destructive action must retain visible text: '+id);
  assert.doesNotMatch(html,/展开 \/ 收起|>DIR<|>MD<|>TXT</);
  assert.ok(styles.includes('.workspace-icon-action'),'compact icon-button style missing');
  assert.ok(styles.includes('@media (pointer:coarse)'),'touch targets must remain at least 44px');
});

test('R231 one React root owns Workspace business markup (source and SSR)',async t=>{
  const shell=load(await readFile('src/native-agent/workspace.html','utf8'));
  assert.equal(shell('body > #workspace-root').length,1);
  assert.equal(shell('#workspace-root').children().length,0);
  assert.equal(shell('body').children().length,2,'Only the React root and bootstrap script belong in static HTML');
  assert.equal(shell('body > script').attr('src'),'settings.js');
  assert.equal(shell('body button,body textarea,body iframe,body main').length,0);
  const main=await readFile('src/ui/react/workspace/main.tsx','utf8');
  assert.equal((main.match(/\bcreateRoot\(/g)||[]).length,1);
  assert.match(main,/root\.render\(<WorkspaceView controller=\{controller\}/);
  assert.match(main,/root\.unmount\(\)/);
  for(const path of ['src/native-agent/workspace.js','src/native-agent/workspace-chat-edit-ui.js',
    ...['WorkspaceView.tsx','ChatEditPanel.tsx','FileTree.tsx','view-helpers.tsx'].map(name=>'src/ui/react/workspace/'+name)]){
    const source=await readFile(path,'utf8');
    assert.doesNotMatch(source,/\b(?:createPortal|getElementById|querySelector(?:All)?|replaceChildren|createElementNS)\s*\(|\.innerHTML\b|\bdangerouslySetInnerHTML\b|\bdoc\.createElement\s*\(/,path+' must not introduce a second DOM owner');
  }
  const {html}=await workspaceSSR(t),$=load(html);
  // This is the complete original 80-ID contract, independent of local artifacts or current component source.
  const ids=`file-workspace workspace-locale connection-label refresh-connection open-settings demo-banner
    workspace-picker target-picker open-sidebar open-workbench workspace-status workspace-action-review
    workspace-action-summary workspace-action-continue workspace-action-cancel knowledge-handoff
    knowledge-handoff-title knowledge-handoff-import preview-sidebar-tool-status preview-sidebar-tool
    workspace-access-note workspace-access-reason refresh-files parent-directory directory-name file-list
    tree-message file-title file-meta reload-file copy-content discard-file-draft save-file show-page-preview
    remove-page-preview file-surface draft-label file-editor preview-kind file-preview-slot app-surface preview-url
    connect-preview open-preview-tab app-preview-slot edit-task chat-request-path prepare-file-request
    fill-chat-context prepare-edit copy-edit-context read-chatgpt-edit demo-edit-answer chat-edit-status
    chat-request-stages chat-file-result-panel chat-result-state chat-file-result refill-chat-result
    edit-context-panel edit-context-binding edit-context edit-answer review-edit edit-review edit-review-summary
    edit-before edit-after adopt-edit discard-edit edit-receipt-panel edit-receipt copy-edit-receipt conflict-panel
    disk-version use-disk save-as-path save-as check-created file-limits`.trim().split(/\s+/);
  assert.equal(ids.length,80);
  for(const id of ids)assert.equal($('[id]').filter((_,node)=>$(node).attr('id')===id).length,1,id);
  const all=$('[id]').map((_,node)=>$(node).attr('id')).get();
  assert.equal(new Set(all).size,all.length,'React output must not duplicate semantic IDs');
});

test('R231 four-language React SSR uses semantic translations without changing file bytes or performing actions',async t=>{
  const api=await workspaceSSR(t),{controller}=api;
  t.after(()=>api.setLocalePreference('auto',{persist:false}));
  const file=controller.getSnapshot().file;
  const calls=[];
  const actions=object=>Object.fromEntries(Object.keys(object).map(name=>[name,()=>calls.push(name)]));
  const observed={...controller,actions:actions(controller.actions),
    chatEdit:{...controller.chatEdit,actions:actions(controller.chatEdit.actions)},
    knowledgeHandoff:{...controller.knowledgeHandoff,importDraft:()=>calls.push('importDraft')}};
  for(const locale of api.SUPPORTED_LOCALES){
    api.setLocalePreference(locale,{persist:false});
    const html=api.render(observed),$=load(html);
    assert.doesNotMatch(html,/Translation unavailable/);
    assert.equal($('.header-subtitle').text(),api.translate('workspace.heading'));
    assert.equal($('#save-file').text(),api.translate('common.save'));
    assert.equal($('.chat-edit-panel > summary strong').text(),api.translate('workspace.chatEditing'));
    assert.equal($('#workspace-locale option[selected]').attr('value'),locale);
    assert.deepEqual($('#workspace-locale option').map((_,node)=>$(node).attr('value')).get(),['auto',...api.SUPPORTED_LOCALES]);
    for(const id of api.SUPPORTED_LOCALES)assert.equal($('#workspace-locale option[value="'+id+'"]').text(),api.LOCALE_NAMES[id]);
    assert.equal($('#file-editor').val(),file.content,'Locale changes must preserve user file bytes');
    assert.equal($('button.od-button').length>0,true);
  }
  assert.deepEqual(calls,[],'Rendering never sends, adopts, saves or imports');
});

test('R231 real file-tree SSR preserves hierarchy, roving tab stop, selection and local SVGs',async t=>{
  const api=await workspaceSSR(t);
  await api.controller.actions.toggleDirectory('app');
  const $=load(api.render()),rows=$('#file-list > button[role="treeitem"]');
  assert.ok(rows.length>1);
  assert.equal(rows.filter('[tabindex="0"]').length,1,'Exactly one tree row participates in Tab navigation');
  assert.equal(rows.filter('[aria-selected="true"]').attr('data-path'),api.controller.getSnapshot().file.path);
  const directory=rows.filter('[data-path="app"]'),child=rows.filter('[data-path="app/page.tsx"]');
  assert.equal(directory.attr('aria-expanded'),'true');
  assert.equal(Number(child.attr('aria-level')),Number(directory.attr('aria-level'))+1);
  assert.equal(child.attr('aria-expanded'),undefined,'Files are not disclosure controls');
  for(const row of rows){
    const node=$(row);
    assert.ok(Number(node.attr('aria-level'))>=1);
    assert.ok(Number(node.attr('aria-posinset'))>=1);
    assert.ok(Number(node.attr('aria-setsize'))>=Number(node.attr('aria-posinset')));
    assert.equal(node.children('svg.file-icon[data-variant]').length,1);
    assert.equal(node.children('.tree-caret').length,1);
    assert.ok(node.hasClass('od-button'));
  }
  await api.controller.actions.toggleDirectory('app');
  const collapsed=load(api.render());
  assert.equal(collapsed('[data-path="app"]').attr('aria-expanded'),'false');
  assert.equal(collapsed('[data-path="app/page.tsx"]').length,0);
});

test('R231 SSR keeps static file HTML in srcDoc and connects the app iframe only on explicit action',async t=>{
  // Intentionally do not sanitize this preview callback: this case proves the React/iframe boundary,
  // not the separate previewDocument sanitizer, without constructing any fake business DOM.
  const api=await workspaceSSR(t,{renderPreviewDocument:(_path,content)=>content});
  const {controller}=api;
  await controller.actions.read('index.html');
  controller.actions.setDraft('<h1 id="untrusted-file">User HTML</h1><script>window.bad=true</script>');
  // Static preview generation is debounced by the domain; reread the current projection after it runs.
  await new Promise(resolve=>setTimeout(resolve,250));
  controller.actions.setPreviewURL('http://127.0.0.1:43111/');
  let $=load(api.render());
  assert.equal($('iframe').length,2);
  assert.equal($('#file-preview-slot > #file-preview').attr('sandbox'),'');
  assert.equal($('#file-preview').attr('referrerpolicy'),'no-referrer');
  assert.match($('#file-preview').attr('srcdoc'),/id="untrusted-file"/);
  assert.equal($('#untrusted-file').length,0,'File HTML cannot become trusted document children');
  assert.equal($('script').length,0);
  assert.equal($('#app-preview-slot > #app-preview').attr('sandbox'),'allow-scripts allow-forms allow-same-origin');
  assert.equal($('#app-preview').attr('referrerpolicy'),'no-referrer');
  assert.equal($('#app-preview').attr('src'),undefined,'Typing a URL must not connect the iframe');
  controller.actions.connectPreview();
  $=load(api.render());
  assert.equal($('#app-preview').attr('src'),'http://127.0.0.1:43111/');
  controller.actions.setPreviewURL('http://localhost:3001/');
  assert.equal(load(api.render())('#app-preview').attr('src'),'http://127.0.0.1:43111/');
});

test('R231 real pending read keeps the SSR editor enabled and controlled by the current draft',async t=>{
  const {createMemoryWorkspace}=await runtime;
  const memory=createMemoryWorkspace();
  let hold=false,release;
  const pending=new Promise(resolve=>{release=resolve;});
  const client={...memory,request:async(method,...args)=>{
    if(hold&&method==='files.read')await pending;
    return memory.request(method,...args);
  }};
  const api=await workspaceSSR(t,{client});
  hold=true;
  const reading=api.controller.actions.reread();
  try{
    assert.equal(api.controller.getSnapshot().busy,true);
    const content=api.controller.getSnapshot().file.content+'\nUser typed while reading';
    api.controller.actions.setDraft(content);
    const $=load(api.render());
    assert.equal($('#file-editor').length,1);
    assert.equal($('#file-editor').attr('disabled'),undefined);
    assert.equal($('#file-editor').val(),content);
    assert.equal($('#refresh-connection').attr('disabled'),'disabled');
    assert.equal($('#save-file').attr('disabled'),'disabled');
  }finally{release();await reading;}
  // SSR does not prove browser focus, selection or reconciliation identity; Chromium owns that evidence.
});
