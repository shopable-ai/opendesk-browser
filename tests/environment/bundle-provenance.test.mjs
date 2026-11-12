import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,mkdir,realpath,symlink,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,relative,sep,dirname,basename,extname} from 'node:path';
import {createHash} from 'node:crypto';
import {readFileSync,realpathSync} from 'node:fs';
import postcss from 'postcss';
import {parse} from 'acorn';
import {build,transformSync} from 'esbuild';
import {describeBundle,collectBundleEvidence,assertLibraryModuleBoundary,recordBuildFailure,trustedBookmarkStyle,verifyTrustedAIProxySources,reviewedCompiledExtensionSettings} from '../../scripts/bundle-provenance.mjs';
import {BUILTIN_CATALOG} from '../../src/libs/catalog.js';
import {PACKAGE_ENTRIES,FIXED_OUTPUTS} from '../../scripts/build-contract.mjs';
const root='/repo';

test('AI Scroll R4.2 reviewed settings sources admit only exact bytes to the original tool-shell',async t=>{
  const inputs=[
    ['projects/ai-scroll-navigation/trusted/ai-configuration.js','c97137a3a871fb6c19fd3594fc627fafd67d03f8'],
    ['projects/ai-scroll-navigation/trusted/react-controls.tsx','1261228715f9cd8f8496e190213e8b7cedb57406'],
    ['projects/ai-scroll-navigation/trusted/host-localization.js','73b0b62a0d009ff3451457623739d2a1716aad03']
  ];
  const project=await realpath(await mkdtemp(join(tmpdir(),'ai-scroll-r42-settings-pin-')));
  t.after(()=>rm(project,{recursive:true,force:true}));
  for(const [path,pin] of inputs){
    assert.equal(reviewedCompiledExtensionSettings('ui/tool-shell.js',path,process.cwd()),pin);
    for(const target of ['sw.js','ui/sidebar-tool-host.js','agents/page-relay.js',
      'native-agent/settings.js','scripting/sandbox/worker-runtime.js']){
      assert.equal(reviewedCompiledExtensionSettings(target,path,process.cwd()),null);
      assert.throws(()=>describeBundle({chunk:{fileName:target,
        modules:{[resolve(path)]:{renderedLength:1,originalLength:1}}},lock:{packages:{}}}),
      /cannot enter a privileged fixed bundle/);
    }
    const file=join(project,path),bytes=await readFile(resolve(path));
    await mkdir(dirname(file),{recursive:true});await writeFile(file,bytes);
    assert.equal(reviewedCompiledExtensionSettings('ui/tool-shell.js',path,project),pin);
    await writeFile(file,Buffer.concat([bytes,Buffer.from('\n// unreviewed drift')]));
    assert.throws(()=>reviewedCompiledExtensionSettings('ui/tool-shell.js',path,project),
      /Trusted extension settings source changed/);
    await rm(file);await symlink(resolve(path),file);
    assert.throws(()=>reviewedCompiledExtensionSettings('ui/tool-shell.js',path,project),
      /must not be a symlink/);
  }
});

test('Subagent Result projection admits only three exact SW blobs and rejects other worlds or drift',async t=>{
  const pins={
    'projects/subagent/trusted/page-task-result.js':'16dda6e9a439dedb340e33874f1062bdfeaf8147',
    'projects/subagent/trusted/result.js':'87c598a15994af1033b866f8f1b632c4c494deaa',
    'projects/subagent/src/contract.js':'c394ad1d5dfb7271ec2a23d428e7605030da7664'
  };
  const project=await realpath(await mkdtemp(join(tmpdir(),'subagent-result-source-pin-')));
  t.after(()=>rm(project,{recursive:true,force:true}));
  for(const [path,pin] of Object.entries(pins)){
    const modules={[resolve(path)]:{renderedLength:1,originalLength:1}};
    assert.equal(describeBundle({chunk:{fileName:'sw.js',modules},lock:{packages:{}}})
      .modules[0].reviewedFirstPartyBlob,pin);
    for(const target of ['agents/chatgpt-fixed-bridge.js','agents/web-task-content.js',
      'agents/page-relay.js','native-agent/settings.js','native-agent/transport.js',
      'ui/tool-shell.js','ui/sidebar-tool-host.js','scripting/sandbox/worker-runtime.js'])
      assert.throws(()=>describeBundle({chunk:{fileName:target,modules},lock:{packages:{}}}),
        /cannot enter a privileged fixed bundle/);
    const file=join(project,path),bytes=await readFile(resolve(path));
    await mkdir(dirname(file),{recursive:true});await writeFile(file,bytes);
    const candidate={chunk:{fileName:'sw.js',modules:{[file]:{renderedLength:1,originalLength:1}}},
      root:project,lock:{packages:{}}};
    assert.equal(describeBundle(candidate).modules[0].reviewedFirstPartyBlob,pin);
    await writeFile(file,Buffer.concat([bytes,Buffer.from('\n// unreviewed result adapter')]));
    assert.throws(()=>describeBundle(candidate),/Trusted Subagent result source changed/);
    await rm(file);await symlink(resolve(path),file);
    assert.throws(()=>describeBundle(candidate),/Trusted Subagent result source must not be a symlink/);
  }
  // A sibling business module does not inherit the exact adapter admission.
  const path=join(project,'projects/subagent/trusted/unreviewed-result.js');
  await writeFile(path,'export const trust="host-verified";\n');
  assert.throws(()=>describeBundle({chunk:{fileName:'sw.js',
    modules:{[path]:{renderedLength:1,originalLength:1}}},root:project,lock:{packages:{}}}),
    /cannot enter a privileged fixed bundle/);
});

test('A2B2A capability grant source is pinned to the original SW and trusted Side Panel only',async t=>{
  const path='projects/webflow/trusted/issue-workflow-authorization.js';
  const pinned='e26ae6bcf44d1994801faa4fc9a7408964702adc';
  const allowed=target=>describeBundle({chunk:{fileName:target,
    modules:{[resolve(path)]:{renderedLength:1,originalLength:1}}},
    lock:{packages:{}}});
  for(const target of ['sw.js','ui/tool-shell.js'])
    assert.equal(allowed(target).modules[0].reviewedFirstPartyBlob,pinned);
  for(const target of ['agents/chatgpt-fixed-bridge.js','agents/web-task-content.js',
    'native-agent/settings.js','ui/sidebar-tool-host.js','scripting/sandbox/worker-runtime.js'])
    assert.throws(()=>allowed(target),/cannot enter a privileged fixed bundle/);
  const root=await realpath(await mkdtemp(join(tmpdir(),'webflow-issue-scope-pin-')));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const file=join(root,path),bytes=await readFile(resolve(path));
  await mkdir(dirname(file),{recursive:true});await writeFile(file,bytes);
  const candidate={chunk:{fileName:'sw.js',modules:{[file]:{renderedLength:1,originalLength:1}}},
    root,lock:{packages:{}}};
  assert.equal(describeBundle(candidate).modules[0].reviewedFirstPartyBlob,pinned);
  await writeFile(file,Buffer.concat([bytes,Buffer.from('\n// unreviewed change')]));
  assert.throws(()=>describeBundle(candidate),/Trusted Web Flow source changed/);
});

test('reviewed WebFlow task intent parser retains five exact fixed admissions',()=>{
  const path='projects/webflow/src/task-intent-contract.js';
  const modules={[resolve(path)]:{renderedLength:1,originalLength:1}};
  for(const target of ['sw.js','ui/tool-shell.js','agents/web-task-content.js',
    'agents/chatgpt-fixed-bridge.js','native-agent/settings.js']){
    const result=describeBundle({chunk:{fileName:target,modules},lock:{packages:{}}});
    assert.equal(result.modules[0].reviewedFirstPartyBlob,'50a7ec4bd3d8707ba53724efdc378cd98c2404d6');
  }
  for(const target of ['native-agent/transport.js','framework/sdk-main.js','scripting/sandbox/worker-runtime.js',
    'agents/page-relay.js','ui/sidebar-tool-host.js']){
    assert.throws(()=>describeBundle({chunk:{fileName:target,modules},lock:{packages:{}}}),
      /cannot enter a privileged fixed bundle/);
  }
});

test('actual fixed entry graphs retain every reviewed WebFlow intent consumer',async()=>{
  const entries=(await readdir('src/entrypoints')).filter(path=>path.endsWith('.js'))
    .map(path=>'src/entrypoints/'+path);
  const {metafile}=await build({entryPoints:entries,bundle:true,write:false,metafile:true,
    outdir:join(tmpdir(),'opendesk-intent-graph'),treeShaking:false,format:'iife',platform:'browser',
    loader:{'.html':'text','.dat':'text'},
    alias:{'@opendesk/ui':resolve('src/ui/react/components/ui/button.tsx')},logLevel:'silent'});
  const path='projects/webflow/src/task-intent-contract.js';
  const consumers=Object.values(metafile.outputs).filter(output=>output.inputs[path]);
  assert.deepEqual(consumers.map(output=>basename(output.entryPoint,'.js')).sort(),
    ['background','chatgpt-fixed-bridge','tool-shell','web-task-content']);
  for(const output of consumers){
    const name=basename(output.entryPoint,'.js');
    const target=name==='background'?'sw.js':FIXED_OUTPUTS[name];
    assert.ok(target,'approved output for '+name);
    const record=describeBundle({chunk:{fileName:target,modules:{[resolve(path)]:{
      renderedLength:output.inputs[path].bytesInOutput,originalLength:metafile.inputs[path].bytes
    }}},lock:{packages:{}}});
    assert.equal(record.modules[0].reviewedFirstPartyBlob,'50a7ec4bd3d8707ba53724efdc378cd98c2404d6');
  }
});

test('Settings and Native file graphs retain original source gates without Task-only dependencies',()=>{
  // Inspect the actual local import graph without generating shared bundles.
  // TypeScript/JSX are erased only for syntax inspection; no module executes.
  function localGraph(entry){
    const seen=new Set();
    function visit(file){
      if(seen.has(file))return;
      seen.add(file);
      const extension=extname(file);
      if(!['.js','.mjs','.ts','.tsx','.jsx'].includes(extension))return;
      const loader=extension==='.mjs'?'js':extension.slice(1);
      const code=transformSync(readFileSync(file,'utf8'),{loader,format:'esm',jsx:'transform'}).code;
      const ast=parse(code,{ecmaVersion:'latest',sourceType:'module'});
      function walk(node){
        if(!node||typeof node!=='object')return;
        const source=node.type==='ImportExpression'?node.source:
          ['ImportDeclaration','ExportNamedDeclaration','ExportAllDeclaration'].includes(node.type)?node.source:null;
        if(source?.type==='Literal'&&typeof source.value==='string'&&source.value.startsWith('.'))
          visit(resolve(dirname(file),source.value.split('?')[0]));
        for(const value of Object.values(node)){
          if(Array.isArray(value)){for(const child of value)walk(child);}
          else if(value&&typeof value==='object')walk(value);
        }
      }
      walk(ast);
    }
    visit(resolve(entry));return seen;
  }
  for(const [target,entry] of [['native-agent/settings.js','src/entrypoints/settings.js'],
    ['native-agent/transport.js','src/entrypoints/transport.js']]){
    const modules=localGraph(entry);
    assert.ok(modules.has(resolve('src/native-agent/workspace-chatgpt-core.js')));
    for(const path of ['src/native-agent/workspace-chatgpt.js',
      'src/native-agent/chatgpt-task-request.js','projects/webflow/src/task-intent-contract.js',
      'projects/webflow/trusted/chatgpt-conversation-route.js'])
      assert.equal(modules.has(resolve(path)),false,target+' imports Task policy through '+path);
    const projectModules=Object.fromEntries([...modules].filter(path=>path.includes('/projects/'))
      .map(path=>[path,{renderedLength:1,originalLength:1}]));
    assert.doesNotThrow(()=>describeBundle({chunk:{fileName:target,modules:projectModules},lock:{packages:{}}}));
  }
});

test('reviewed WebFlow intent source pin rejects mutated and symlinked content',async t=>{
  const root=await realpath(await mkdtemp(join(tmpdir(),'webflow-intent-source-pin-')));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const path='projects/webflow/src/task-intent-contract.js';
  const file=join(root,path);
  await mkdir(dirname(file),{recursive:true});
  const bytes=await readFile(resolve(path));
  await writeFile(file,bytes);
  const inputs=['sw.js','agents/chatgpt-fixed-bridge.js'].map(fileName=>({
    chunk:{fileName,modules:{[file]:{renderedLength:1,originalLength:1}}},root,lock:{packages:{}}
  }));
  for(const input of inputs)
    assert.equal(describeBundle(input).modules[0].reviewedFirstPartyBlob,'50a7ec4bd3d8707ba53724efdc378cd98c2404d6');
  await writeFile(file,Buffer.concat([bytes,Buffer.from('\n// drift')]));
  for(const input of inputs)assert.throws(()=>describeBundle(input),/Trusted Web Flow source changed/);
  await rm(file);
  await symlink(resolve(path),file);
  for(const input of inputs)assert.throws(()=>describeBundle(input),/Trusted Web Flow source must not be a symlink/);
});

test('reviewed ChatGPT route guard enters Native Settings Workspace only as pinned deny-only source',()=>{
  const path='projects/webflow/trusted/chatgpt-conversation-route.js';
  const modules={[resolve(path)]:{renderedLength:1,originalLength:1}};
  const make=target=>describeBundle({chunk:{fileName:target,modules},lock:{packages:{}}});
  for(const target of ['sw.js','ui/tool-shell.js','agents/chatgpt-fixed-bridge.js',
    'native-agent/settings.js'])
    assert.equal(make(target).modules[0].reviewedFirstPartyBlob,'8e28adedd8cc2b49ff34897c0857d33cf2478c87');
  for(const target of ['native-agent/transport.js','agents/page-relay.js',
    'ui/sidebar-tool-host.js','scripting/sandbox/worker-runtime.js'])
    assert.throws(()=>make(target),/cannot enter a privileged fixed bundle/);
});

test('reviewed app display routes enter only the fixed tool shell',()=>{
 const routes=['projects/ai-proxy/trusted/app-page-routes.js','projects/webflow/src/ui/app-page-routes.js'];
 const modules=Object.fromEntries(routes.map(path=>[resolve(path),{renderedLength:1,originalLength:1}]));
 const accepted=describeBundle({chunk:{fileName:'ui/tool-shell.js',modules},lock:{packages:{}}});
 assert.equal(accepted.modules.length,2);
 assert.ok(accepted.modules.every(row=>/^[0-9a-f]{40}$/.test(row.reviewedFirstPartyBlob)));
 for(const path of routes)assert.throws(()=>describeBundle({chunk:{fileName:'sw.js',
  modules:{[resolve(path)]:{renderedLength:1,originalLength:1}}},lock:{packages:{}}}),/cannot enter a privileged fixed bundle/);
});

test('trusted AI Proxy checks nested CSS even when Rollup omits it from chunk.modules',async t=>{
 const project=await realpath(await mkdtemp(join(tmpdir(),'ai-proxy-inputs-')));
 t.after(()=>rm(project,{recursive:true,force:true}));
 const pins=JSON.parse(await readFile(resolve('projects/ai-proxy/trusted/source-lock.json'),'utf8'));
 for(const path of Object.keys(pins)){
  await mkdir(join(project,path,'..'),{recursive:true});
  await writeFile(join(project,path),await readFile(resolve(path)));
 }
 assert.doesNotThrow(()=>verifyTrustedAIProxySources(project));
 const path='projects/ai-proxy/src/styles/sidebar-settings.css',bytes=await readFile(join(project,path));
 await writeFile(join(project,path),Buffer.concat([bytes,Buffer.from('\n.proxy-app{display:none}') ]));
 // No AI Proxy module is enumerated: the whole trusted entry still refuses drift.
 assert.throws(()=>describeBundle({chunk:{fileName:'ui/tool-shell.js',modules:{}},root:project,lock:{packages:{}}}),/Trusted AI Proxy source changed/);
 await rm(join(project,path));await symlink(resolve(path),join(project,path));
 assert.throws(()=>verifyTrustedAIProxySources(project),/must not be a symlink/);
});

test('reviewed AI Proxy diagnostics/PC layout keeps all eight exact source locks and rejects altered locale bytes',async t=>{
 const changed=[
  ['projects/ai-proxy/src/Settings.tsx','8df117891c0a0ef174652d704c902d6b52490062'],
  ['projects/ai-proxy/src/i18n/locales/en.json','c424f3e122eb90c2a01cd0092d502c881350c2f5'],
  ['projects/ai-proxy/src/i18n/locales/zh-CN.json','2889bd4e57509b6f13e6d31d4bf42c5e593009c9'],
  ['projects/ai-proxy/src/i18n/locales/zh-TW.json','27e954916cc032b3f76c8210806a1a6e4668e0c8'],
  ['projects/ai-proxy/src/styles/management.css','f4ea8d39cd408bcd70b14633128c5fdb8d595a58'],
  ['projects/ai-proxy/src/styles/options.css','b4caaf40bb3e6d25bb3e19b8e8b8f1e8f72a326a'],
  ['projects/ai-proxy/src/styles/sidebar-settings.css','4f86a1c71e03453767b0a76a0a92d8de745cb962'],
  ['projects/ai-proxy/src/ui/DiagnosticsPage.tsx','97538e5a13569339c44a016951b507cdc686ee9a']
 ];
 const locks=JSON.parse(await readFile(resolve('projects/ai-proxy/trusted/source-lock.json'),'utf8'));
 for(const [path,pin] of changed)assert.equal(locks[path],pin,'Current reviewed AI Proxy source changed: '+path);
 assert.doesNotThrow(()=>verifyTrustedAIProxySources());
 // Compile-time pins remain in charge; changing even presentation text fails
 // closed before installing an unreviewed privileged UI bundle.
 const project=await realpath(await mkdtemp(join(tmpdir(),'ai-proxy-r2-source-pin-')));
 t.after(()=>rm(project,{recursive:true,force:true}));
 for(const path of Object.keys(locks)){
   await mkdir(join(project,path,'..'),{recursive:true});
   await writeFile(join(project,path),await readFile(resolve(path)));
 }
 const locale='projects/ai-proxy/src/i18n/locales/zh-CN.json',file=join(project,locale);
 await writeFile(file,(await readFile(file,'utf8'))+'\\n');
 assert.throws(()=>verifyTrustedAIProxySources(project),/Trusted AI Proxy source changed/);
 await rm(file);await symlink(resolve(locale),file);
 assert.throws(()=>verifyTrustedAIProxySources(project),/must not be a symlink/);
});

test('trusted AI Proxy rejects missing CSS pins, remote imports and project escapes',async t=>{
 const project=await realpath(await mkdtemp(join(tmpdir(),'ai-proxy-css-closure-')));
 t.after(()=>rm(project,{recursive:true,force:true}));
 const rootCss='projects/ai-proxy/src/style.css',leaf='projects/ai-proxy/src/styles/leaf.css';
 await mkdir(join(project,leaf,'..'),{recursive:true});
 const pins={},pin=async(path,text)=>{
  await writeFile(join(project,path),text);
  const bytes=Buffer.from(text);pins[path]=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
 };
 // Run the production helper/traversal with fixture pins. The real exported
 // API never accepts caller-supplied lock overrides.
 const source=await readFile(resolve('scripts/bundle-provenance.mjs'),'utf8');
 const helper=source.slice(source.indexOf('function reviewedAIProxyInput('),source.indexOf('function reviewedCompiledAIProxy(')).replace('export function','function');
 const verify=new Function('compiledAIProxyInputs','readFileSync','realpathSync','createHash','postcss','resolve','relative','sep','dirname',
  helper+';return verifyTrustedAIProxySources;')(pins,readFileSync,realpathSync,createHash,postcss,resolve,relative,sep,dirname);
 await pin(rootCss,"@import './styles/leaf.css';");
 await writeFile(join(project,leaf),'.proxy-app{color:blue}');
 assert.throws(()=>verify(project),/Unreviewed trusted AI Proxy input/);
 await pin(leaf,'.proxy-app{color:blue}');assert.doesNotThrow(()=>verify(project));
 await pin(leaf,"@import './grandchild.css';");
 await writeFile(join(project,'projects/ai-proxy/src/styles/grandchild.css'),'.proxy-app{color:red}');
 assert.throws(()=>verify(project),/Unreviewed trusted AI Proxy input/);
 await pin(leaf,'.proxy-app{color:blue}');
 await pin(rootCss,'@import url("https://example.com/remote.css");');
 assert.throws(()=>verify(project),/Unreviewed trusted AI Proxy CSS import/);
 await pin(rootCss,"@import '../../../outside.css';");
 assert.throws(()=>verify(project),/CSS import outside project/);
});

test('migration: unpinned projects cannot enter fixed trusted outputs',()=>{
  for(const path of [
    'projects/prompt-shortcuts/trusted/unaudited.js',
    'projects/adblock/trusted/unaudited.js',
    'projects/stay-focus/trusted/unaudited.js'
  ])assert.throws(()=>describeBundle({chunk:{fileName:'sw.js',
    modules:{[resolve(path)]:{renderedLength:1,originalLength:1}}},
    lock:{packages:{}}}),/cannot enter a privileged fixed bundle/);
  const accepted=describeBundle({chunk:{fileName:'sw.js',modules:{
    [resolve('projects/stay-focus/trusted/service.js')]:{renderedLength:1,originalLength:1}
  }},lock:{packages:{}}});
  assert.equal(accepted.modules[0].reviewedFirstPartyBlob,'2e387c7bfdca4add8093489368777b4a651d0c01');
});

test('fixed Bookmark CSS keeps its exact source pin after leaving the JS bundle',async t=>{
  const css=trustedBookmarkStyle();
  assert.match(css,/\.bm-app\{/);
  assert.doesNotMatch(css,/\/\*|url\s*\(/i);
  const project=await realpath(await mkdtemp(join(tmpdir(),'bookmark-style-pin-')));
  t.after(()=>rm(project,{recursive:true,force:true}));
  const path='examples/sidebar-tools/bookmark-manager/src/react/style.css',file=join(project,path);
  await mkdir(join(file,'..'),{recursive:true});
  const bytes=await readFile(resolve(path));
  await writeFile(file,bytes);
  assert.equal(trustedBookmarkStyle(project),css);
  await writeFile(file,Buffer.concat([bytes,Buffer.from('\n.bm-app{display:none}') ]));
  assert.throws(()=>trustedBookmarkStyle(project),/Trusted Bookmark React source changed/);
  await rm(file);await symlink(resolve(path),file);
  assert.throws(()=>trustedBookmarkStyle(project),/must not be a symlink/);
});
const chunk={fileName:'sw.js',modules:{
  '/repo/src/sw.js':{renderedLength:10,originalLength:20},
  '/repo/node_modules/@wxt-dev/browser/src/index.mjs':{renderedLength:5,originalLength:50},
  '/repo/src/unused.js':{renderedLength:0,originalLength:100}
}};
const lock={packages:{'node_modules/@wxt-dev/browser':{version:'1.0.0',resolved:'https://registry.example/pkg.tgz',integrity:'sha512-test'}}};
test('actual Rollup modules retain separate npm identity and zero-rendered evidence',()=>{
  const row=describeBundle({chunk,root,lock});
  assert.equal(row.target,'sw.js');assert.equal(row.modules.length,3);
  assert.equal(row.modules[0].npm.name,'@wxt-dev/browser');
  assert.equal(row.modules.find(row=>row.path==='src/unused.js').renderedLength,0);
  assert.match(row.note,/not final bytes/);
});
test('independent npm implementations stay in their own outputs and raw libraries are never bundled',()=>{
  for(const [path,owner] of [['src/libs/packages/lodash.js','libs/packages/lodash.js'],
    ['node_modules/lodash-es/get.js','libs/packages/lodash.js'],['node_modules/dayjs/dayjs.min.js','libs/packages/dayjs.js']]){
    assert.doesNotThrow(()=>assertLibraryModuleBoundary(owner,path));
    for(const target of ['sw.js','libs/runtime/page-core.js','scripting/sandbox/worker-runtime.js','ui/tool-shell.js'])
      assert.throws(()=>assertLibraryModuleBoundary(target,path),/implementation unexpectedly bundled/);
  }
  for(const row of Object.values(BUILTIN_CATALOG.libraries).filter(row=>!row.default&&row.origin==='npm')){
    assert.doesNotThrow(()=>assertLibraryModuleBoundary(row.output,'node_modules/'+row.npm+'/index.js',row.npm));
    assert.throws(()=>assertLibraryModuleBoundary('sw.js','node_modules/'+row.npm+'/index.js',row.npm),
      /implementation unexpectedly bundled/,'opt-in npm package must not enter the SW: '+row.id);
  }
  for(const path of ['src/libs/page-frameworks/react-19.2.0.js',
    'src/libs/page-frameworks/vue-3.5.22.js','node_modules/react/index.js',
    'node_modules/react-dom/client.js','node_modules/@vue/runtime-core/dist/runtime-core.esm-bundler.js'])
    assert.throws(()=>assertLibraryModuleBoundary('sw.js',path),/implementation unexpectedly bundled/);
  for(const path of ['src/libs/core.js','src/libs/catalog.js','src/libs/vendor/my-utils/1.0.0/index.js'])
    assert.throws(()=>assertLibraryModuleBoundary('sw.js',path),/implementation unexpectedly bundled/);
  assert.doesNotThrow(()=>assertLibraryModuleBoundary('sw.js','src/libs/runtime-contract.js'));
  assert.doesNotThrow(()=>assertLibraryModuleBoundary('scripting/sandbox/worker-runtime.js','src/libs/core.js'));
});
test('a failed oversized build preserves the offending graph separately from the last success',async t=>{
  const evidence=await mkdtemp(join(tmpdir(),'opendesk-failed-build-'));
  const directory=await mkdtemp(join(tmpdir(),'opendesk-failed-modules-'));
  t.after(()=>Promise.all([rm(evidence,{recursive:true,force:true}),rm(directory,{recursive:true,force:true})]));
  const prior='{"status":"passed","prior":"preserved"}\n';
  await writeFile(join(evidence,'build-production.json'),prior);
  await writeFile(join(directory,'sw.js.json'),JSON.stringify(describeBundle({chunk,root,lock})));
  const error=Object.assign(Error('over budget'),{target:'sw.js',bytes:328942,budgetBytes:327680});
  const wrapped=new Error('Failed to build sw',{cause:error});
  const path=await recordBuildFailure({directory,evidence,mode:'production',attemptId:'test-attempt',error:wrapped,sourceInputs:[{path:'src/sw.js',sha256:'b'.repeat(64)}]});
  const failed=JSON.parse(await readFile(path,'utf8'));
  assert.equal(failed.status,'failed');assert.equal(failed.packageVerified,false);
  assert.equal(failed.error.excessBytes,1262);assert.equal(failed.bundleModules[0].target,'sw.js');
  assert.equal(failed.error.message,'Failed to build sw');assert.equal(failed.error.causes[0].message,'over budget');
  assert.equal(failed.sourceInputs[0].path,'src/sw.js');
  assert.equal(await readFile(join(evidence,'build-production.json'),'utf8'),prior);
  assert.deepEqual(JSON.parse(await readFile(join(evidence,'build-production-latest.json'),'utf8')),
    {status:'failed',mode:'production',attemptId:'test-attempt',diagnostic:path});
});
test('partial diagnostic JSON and circular causes cannot leave a stale success marker',async t=>{
  const evidence=await mkdtemp(join(tmpdir(),'opendesk-partial-failure-'));
  const directory=await mkdtemp(join(tmpdir(),'opendesk-partial-modules-'));
  t.after(()=>Promise.all([rm(evidence,{recursive:true,force:true}),rm(directory,{recursive:true,force:true})]));
  await writeFile(join(evidence,'build-production-latest.json'),'{"status":"passed"}');
  await writeFile(join(directory,'sw.js.json'),'{"target":');
  const error=new Error('write interrupted');error.cause=error;
  const path=await recordBuildFailure({directory,evidence,mode:'production',error});
  const failed=JSON.parse(await readFile(path,'utf8'));
  assert.equal(failed.error.message,'write interrupted');assert.deepEqual(failed.bundleModules,[]);
  assert.equal(failed.diagnosticErrors[0].path,'sw.js.json');
  assert.equal(JSON.parse(await readFile(join(evidence,'build-production-latest.json'),'utf8')).status,'failed');
});
test('privileged entries reject historical, user project and standalone vendor modules',()=>{
  for(const path of ['examples/programs/sample/main.js','projects/unreviewed-tool/trusted/policy.js',
    'projects/reading-toc/trusted/unreviewed.js','docs/contracts/source-snapshots/lib.js','src/vendor/jquery.js'])
    assert.throws(()=>describeBundle({chunk:{fileName:'sw.js',modules:{['/repo/'+path]:{}}},root,lock}),/cannot enter/);
  assert.throws(()=>describeBundle({chunk,root,lock:{packages:{}}}),/missing lock/);
});
test('Web Flow keyword policy uses exact reviewed bytes and only the original compiled targets',async t=>{
 const project=await realpath(await mkdtemp(join(tmpdir(),'webflow-policy-boundary-')));
 t.after(()=>rm(project,{recursive:true,force:true}));
 const path='projects/webflow/src/authorization-policy.js',file=join(project,path),bytes=await readFile(resolve(path));
 await mkdir(dirname(file),{recursive:true});await writeFile(file,bytes);
 const graph=target=>({chunk:{fileName:target,modules:{[file]:{renderedLength:bytes.length,originalLength:bytes.length}}},
  root:project,lock:{packages:{}}});
 for(const target of ['sw.js','agents/chatgpt-fixed-bridge.js'])assert.ok(describeBundle(graph(target)).modules[0].reviewedFirstPartyBlob);
 for(const target of ['agents/page-relay.js','scripting/sandbox/worker-runtime.js','ui/sidebar-tool-host.js'])
  assert.throws(()=>describeBundle(graph(target)),/cannot enter a privileged fixed bundle/);
 await writeFile(file,Buffer.concat([bytes,Buffer.from('\n// changed policy\n')]));
 assert.throws(()=>describeBundle(graph('sw.js')),/Trusted Web Flow source changed/);
 await rm(file);await symlink(resolve(path),file);
 assert.throws(()=>describeBundle(graph('sw.js')),/must not be a symlink/);
});
test('ChatGPT image files enter only their reviewed Native transport/settings entries with exact bytes',async t=>{
 const project=await realpath(await mkdtemp(join(tmpdir(),'webflow-images-boundary-')));
 t.after(()=>rm(project,{recursive:true,force:true}));
 for(const name of ['chatgpt-images.js','chatgpt-image-page.js','chatgpt-images-ui.js']){
  const path='projects/webflow/trusted/'+name,file=join(project,path),bytes=await readFile(resolve(path));
  await mkdir(dirname(file),{recursive:true});await writeFile(file,bytes);
  const graph=target=>({chunk:{fileName:target,modules:{[file]:{}}},root:project,lock:{packages:{}}});
  const allowed=name==='chatgpt-images-ui.js'?['native-agent/settings.js']:['native-agent/settings.js','native-agent/transport.js'];
  for(const target of allowed)assert.ok(describeBundle(graph(target)).modules[0].reviewedFirstPartyBlob);
  for(const target of ['sw.js','agents/page-relay.js','ui/sidebar-tool-host.js','scripting/sandbox/worker-runtime.js',
   ...(name==='chatgpt-images-ui.js'?['native-agent/transport.js']:[])])
   assert.throws(()=>describeBundle(graph(target)),/cannot enter a privileged fixed bundle/);
  await writeFile(file,Buffer.concat([bytes,Buffer.from('\n// changed image boundary\n')]));
  assert.throws(()=>describeBundle(graph(allowed[0])),/Trusted ChatGPT image source changed/);
  await rm(file);await symlink(resolve(path),file);
  assert.throws(()=>describeBundle(graph(allowed[0])),/must not be a symlink/);
 }
});
test('receipt collection requires every fixed output and binds final verified hashes',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'r9-provenance-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  await assert.rejects(collectBundleEvidence(directory,['sw.js'],[]),/Incomplete/);
  await writeFile(join(directory,'sw.js.json'),JSON.stringify(describeBundle({chunk,root,lock})));
  const rows=await collectBundleEvidence(directory,['sw.js'],[{path:'sw.js',bytes:42,sha256:'a'.repeat(64)}]);
  assert.equal(rows[0].bytes,42);assert.equal(rows[0].sha256,'a'.repeat(64));
  await assert.rejects(collectBundleEvidence(directory,['sw.js'],[]),/does not match/);
});

test('reviewed Time Review markup and logic can enter only the pinned existing sidebar host',()=>{
  const inputs=[
    'projects/time-review/src/index.html',
    'projects/time-review/src/main.js'
  ];
  const approved={fileName:'ui/sidebar-tool-host.js',modules:Object.fromEntries(
    inputs.map(path=>[resolve(path),{renderedLength:12,originalLength:40}]))};
  const row=describeBundle({chunk:approved,lock:{packages:{}}});
  assert.equal(row.modules.length,2);
  for(const source of row.modules)
    assert.match(source.reviewedFirstPartyBlob,/^[0-9a-f]{40}$/);
  for(const target of ['sw.js','ui/tool-shell.js','scripting/sandbox/sandbox.js'])
    assert.throws(()=>describeBundle({chunk:{...approved,fileName:target},lock:{packages:{}}}),
      /cannot enter a privileged fixed bundle/);
  for(const path of ['examples/sidebar-tools/other/src/main.js',
    'projects/time-review/src/unsafe.js',
    'src/vendor/legacy.js','docs/contracts/source-snapshots/tool.js'])
    assert.throws(()=>describeBundle({chunk:{
      fileName:'ui/sidebar-tool-host.js',modules:{[resolve(path)]:{}}},lock:{packages:{}}}),
      /cannot enter a privileged fixed bundle/,
      'no path-prefix escape is permitted for '+path);
});

test('a modified Time Review source must not enter privileged fixed output under the old pin',async t=>{
  const project=await realpath(await mkdtemp(join(tmpdir(),'opendesk-compiled-review-')));
  t.after(()=>rm(project,{recursive:true,force:true}));
  const path='projects/time-review/src/index.html';
  const file=join(project,path);
  await mkdir(join(project,'projects/time-review/src'),{recursive:true});
  await writeFile(file,'<main>unreviewed markup</main>');
  assert.throws(()=>describeBundle({chunk:{
    fileName:'ui/sidebar-tool-host.js',modules:{[file]:{}}},root:project,lock:{packages:{}}}),
    /Trusted Time Review source changed/,
    'a native HTML/JS revision requires explicit source-blob re-review before build');
});
test('a symlink cannot substitute a pinned Time Review source in privileged output',async t=>{
  const project=await realpath(await mkdtemp(join(tmpdir(),'opendesk-compiled-symlink-')));
  t.after(()=>rm(project,{recursive:true,force:true}));
  const path='projects/time-review/src/index.html';
  const file=join(project,path);
  await mkdir(join(project,'projects/time-review/src'),{recursive:true});
  await symlink(resolve(path),file);
  assert.throws(()=>describeBundle({chunk:{
    fileName:'ui/sidebar-tool-host.js',modules:{[file]:{}}
  },root:project,lock:{packages:{}}}),/Trusted Time Review source must not be a symlink/);
});

test('R3.1 trusted Bookmark React compiles only four pinned first-party blobs into the existing tool-shell',()=>{
  const inputs=[
    'examples/sidebar-tools/bookmark-manager/src/model.js',
    'examples/sidebar-tools/bookmark-manager/src/service.js',
    'examples/sidebar-tools/bookmark-manager/src/react/App.jsx',
    'examples/sidebar-tools/bookmark-manager/src/react/style.css'
  ];
  const modules=Object.fromEntries(inputs.map(path=>[resolve(path),{renderedLength:42,originalLength:42}]));
  const compiled=describeBundle({chunk:{fileName:'ui/tool-shell.js',modules},lock:{packages:{}}});
  assert.equal(compiled.modules.length,inputs.length);
  for(const row of compiled.modules)assert.match(row.reviewedFirstPartyBlob,/^[0-9a-f]{40}$/);
  for(const target of ['sw.js','ui/sidebar-tool-host.js','scripting/sandbox/sandbox.js'])
    assert.throws(()=>describeBundle({chunk:{fileName:target,modules},lock:{packages:{}}}),
      /cannot enter a privileged fixed bundle/);
  for(const path of ['examples/sidebar-tools/bookmark-manager/src/main.js',
    'examples/sidebar-tools/bookmark-manager/preview/react/src/formal.jsx',
    'examples/sidebar-tools/bookmark-manager/preview/react/src/main.jsx',
    'examples/sidebar-tools/bookmark-manager/bookmark-manager.opendesk-tool.json'])
    assert.throws(()=>describeBundle({chunk:{
      fileName:'ui/tool-shell.js',modules:{[resolve(path)]:{renderedLength:1,originalLength:1}}
    },lock:{packages:{}}}),/cannot enter a privileged fixed bundle/,
    'installed, arbitrary, or non-audited tool code must not be privileged: '+path);
});
test('R3.1 modified trusted Bookmark App fails at build rather than silently executing new JSX',async t=>{
  const project=await realpath(await mkdtemp(join(tmpdir(),'opendesk-bookmark-pin-')));
  t.after(()=>rm(project,{recursive:true,force:true}));
  const path='examples/sidebar-tools/bookmark-manager/src/react/App.jsx';
  const file=join(project,path);
  await mkdir(join(project,'examples/sidebar-tools/bookmark-manager/src/react'),{recursive:true});
  await writeFile(file,'export default function Unexpected(){return null}');
  assert.throws(()=>describeBundle({chunk:{
    fileName:'ui/tool-shell.js',modules:{[file]:{renderedLength:8,originalLength:8}}
  },root:project,lock:{packages:{}}}),/Trusted Bookmark React source changed/);
});
test('R3.1 symlink substitution cannot bypass trusted Bookmark static pin',async t=>{
  const project=await realpath(await mkdtemp(join(tmpdir(),'opendesk-bookmark-symlink-')));
  t.after(()=>rm(project,{recursive:true,force:true}));
  const path='examples/sidebar-tools/bookmark-manager/src/model.js';
  const file=join(project,path);
  await mkdir(join(project,'examples/sidebar-tools/bookmark-manager/src'),{recursive:true});
  await symlink(resolve('src/ui/react/main.tsx'),file);
  assert.throws(()=>describeBundle({chunk:{
    fileName:'ui/tool-shell.js',modules:{[file]:{renderedLength:9,originalLength:9}}
  },root:project,lock:{packages:{}}}),/Trusted Bookmark React source must not be a symlink/);
});

test('AdBlock session fence is a fixed audited source and rejects byte drift',async t=>{
  const path='projects/adblock/trusted/dnr-session.js';
  const chunkFor=file=>({fileName:'sw.js',modules:{[file]:{renderedLength:1,originalLength:1}}});
  const accepted=describeBundle({chunk:chunkFor(resolve(path)),lock:{packages:{}}});
  assert.equal(accepted.modules[0].reviewedFirstPartyBlob,'6cf976c7f89ab6e9aec04bf7bc92b5189e8b3cca');
  const project=await realpath(await mkdtemp(join(tmpdir(),'opendesk-adblock-session-pin-')));
  t.after(()=>rm(project,{recursive:true,force:true}));
  const file=join(project,path);
  await mkdir(join(project,'projects/adblock/trusted'),{recursive:true});
  await writeFile(file,(await readFile(resolve(path),'utf8'))+'\n// unreviewed drift\n');
  assert.throws(()=>describeBundle({chunk:chunkFor(file),root:project,lock:{packages:{}}}),
    /Trusted AdBlock source changed/);
});


test('R1.3 app-owned trusted background inputs require an exact reviewed Git blob',async t=>{
  const approved=[
    ['projects/ai-vip-share/trusted/provider-config.js','sw.js',
      'd09c57ef4bbc96f406bb2092feb9ff9b2465cf43'],
    ['examples/sidebar-tools/time-review/trusted/service.js','time-review/time-review-host.js',
      '3dfd773fa8cf38deeb23a5d5f9f56d0b27e11ff6']
  ];
  const make=(target,file,project=process.cwd())=>describeBundle({
    chunk:{fileName:target,modules:{[file]:{renderedLength:1,originalLength:1}}},
    root:project,lock:{packages:{}}
  });
  const project=await realpath(await mkdtemp(join(tmpdir(),'opendesk-app-owned-pin-')));
  t.after(()=>rm(project,{recursive:true,force:true}));
  for(const [source,target,pin] of approved){
    const row=make(target,resolve(source));
    assert.equal(row.modules[0].reviewedFirstPartyBlob,pin);
    assert.throws(()=>make('scripting/sandbox/worker-runtime.js',resolve(source)),/cannot enter/);
    const changed=join(project,source);
    await mkdir(join(changed,'..'),{recursive:true});
    await writeFile(changed,(await readFile(resolve(source),'utf8'))+'\\n// unsigned drift\\n');
    assert.throws(()=>make(target,changed,project),/Trusted app-owned source changed/);
  }
  for(const unknown of [
    'projects/ai-vip-share/trusted/remote-supplied.js',
    'examples/sidebar-tools/time-review/trusted/unsafe-background.js',
    'examples/programs/local-controller/src/main.js'
  ])assert.throws(()=>make('sw.js',resolve(unknown)),/cannot enter/);
});


test('original installers share only the byte-pinned Prompt Shortcuts asset identity for uninstall cleanup',async ctx=>{
  const path='projects/prompt-shortcuts/trusted/asset-contract.js';
  const pin='86e95bff786e52efb9089f97126542430f39a716';
  const make=(target,root=process.cwd(),file=path)=>describeBundle({chunk:{fileName:target,
    modules:{[resolve(root,file)]:{renderedLength:1,originalLength:1}}},root,lock:{packages:{}}});
  for(const target of ['ui/marketplace.js','ui/tool-shell.js','ui/sidebar-tool-host.js','agents/page-relay.js'])
    assert.equal(make(target).modules[0].reviewedFirstPartyBlob,pin);
  for(const target of ['sw.js','native-agent/settings.js','native-agent/transport.js',
    'agents/web-task-content.js','marketplace/market-host.js','scripting/sandbox/sandbox.js'])
    assert.throws(()=>make(target),/cannot enter a privileged fixed bundle/);
  for(const target of ['ui/marketplace.js','ui/tool-shell.js'])
    for(const source of ['asset-host.js','model.js','page.js','unaudited.js'])
      assert.throws(()=>make(target,process.cwd(),'projects/prompt-shortcuts/trusted/'+source),
        /cannot enter a privileged fixed bundle/);
  const root=await realpath(await mkdtemp(join(tmpdir(),'prompt-asset-cleanup-pin-')));
  ctx.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'projects/prompt-shortcuts/trusted'),{recursive:true});
  await writeFile(join(root,path),(await readFile(resolve(path),'utf8'))+'\n// unsigned change\n');
  for(const target of ['ui/marketplace.js','ui/tool-shell.js'])
    assert.throws(()=>make(target,root),/Trusted Prompt Shortcuts source changed/);
  await rm(join(root,path));await symlink(resolve(path),join(root,path));
  assert.throws(()=>make('ui/tool-shell.js',root),/Trusted Prompt Shortcuts source must not be a symlink/);
});

test('reviewed Scroll settings keep exact blobs and shell-only admission',async ctx=>{
  const pins={
    'projects/ai-scroll-navigation/trusted/ai-configuration.js':'c97137a3a871fb6c19fd3594fc627fafd67d03f8',
    'projects/ai-scroll-navigation/trusted/host-localization.js':'73b0b62a0d009ff3451457623739d2a1716aad03',
    'projects/ai-scroll-navigation/trusted/react-controls.tsx':'1261228715f9cd8f8496e190213e8b7cedb57406'
  };
  const root=await realpath(await mkdtemp(join(tmpdir(),'scroll-settings-source-pin-')));
  ctx.after(()=>rm(root,{recursive:true,force:true}));
  const make=(target,path,project=process.cwd())=>describeBundle({chunk:{fileName:target,
    modules:{[resolve(project,path)]:{renderedLength:1,originalLength:1}}},root:project,lock:{packages:{}}});
  for(const [path,pin] of Object.entries(pins)){
    assert.equal(make('ui/tool-shell.js',path).modules[0].reviewedFirstPartyBlob,pin);
    for(const target of ['sw.js','agents/page-relay.js','agents/web-task-content.js',
      'native-agent/settings.js','native-agent/transport.js','ui/sidebar-tool-host.js',
      'scripting/sandbox/worker-runtime.js'])
      assert.throws(()=>make(target,path),/cannot enter a privileged fixed bundle/);
    const file=join(root,path);
    await mkdir(dirname(file),{recursive:true});
    await writeFile(file,(await readFile(resolve(path),'utf8'))+'\n// unreviewed change\n');
    assert.throws(()=>make('ui/tool-shell.js',path,root),/Trusted extension settings source changed/);
    await rm(file);await symlink(resolve(path),file);
    assert.throws(()=>make('ui/tool-shell.js',path,root),/Trusted extension settings source must not be a symlink/);
  }
  assert.throws(()=>make('ui/tool-shell.js','projects/ai-scroll-navigation/trusted/unreviewed.js'),
    /cannot enter a privileged fixed bundle/);
});

test('fixed Clipper relay and marketplace admit their reviewed capture dependency graphs',async()=>{
  for(const [entry,target,required] of [
    ['src/entrypoints/page-relay.js','agents/page-relay.js',['page.js','policy.js','region-picker.js']],
    ['src/entrypoints/marketplace.js','ui/marketplace.js',['policy.js']]
  ]){
    const {metafile}=await build({entryPoints:[entry],bundle:true,write:false,metafile:true,
      format:'iife',platform:'browser',logLevel:'silent'});
    const prefix='projects/web-markdown-clipper/trusted/';
    const paths=Object.keys(metafile.inputs).filter(path=>path.startsWith(prefix));
    for(const name of required)assert.ok(paths.includes(prefix+name),target+' consumes '+name);
    const record=describeBundle({chunk:{fileName:target,modules:Object.fromEntries(paths.map(path=>[
      resolve(path),{renderedLength:1,originalLength:metafile.inputs[path].bytes}
    ]))},lock:{packages:{}}});
    assert.ok(record.modules.every(row=>/^[0-9a-f]{40}$/.test(row.reviewedFirstPartyBlob)));
  }
});

test('Clipper region picker retains exact source, target and symlink fences',async ctx=>{
  const path='projects/web-markdown-clipper/trusted/region-picker.js';
  const pin='c2a7b9b15c9ac7d6e132c5a1d1f5f27609d20a0a';
  const make=(target,root=process.cwd())=>describeBundle({chunk:{fileName:target,
    modules:{[resolve(root,path)]:{renderedLength:1,originalLength:1}}},root,lock:{packages:{}}});
  assert.equal(make('agents/page-relay.js').modules[0].reviewedFirstPartyBlob,pin);
  for(const target of ['sw.js','ui/marketplace.js','ui/tool-shell.js','ui/sidebar-tool-host.js',
    'agents/chatgpt-fixed-bridge.js','scripting/sandbox/worker-runtime.js'])
    assert.throws(()=>make(target),/cannot enter a privileged fixed bundle/);
  const root=await realpath(await mkdtemp(join(tmpdir(),'clip-region-pin-')));
  ctx.after(()=>rm(root,{recursive:true,force:true}));
  const file=resolve(root,path),bytes=await readFile(path);
  await mkdir(dirname(file),{recursive:true});await writeFile(file,bytes);
  assert.equal(make('agents/page-relay.js',root).modules[0].reviewedFirstPartyBlob,pin);
  await writeFile(file,Buffer.concat([bytes,Buffer.from('\n// unreviewed drift')]));
  assert.throws(()=>make('agents/page-relay.js',root),/Trusted Web Clipper source changed/);
  await rm(file);await symlink(resolve(path),file);
  assert.throws(()=>make('agents/page-relay.js',root),/must not be a symlink/);
});

test('first-party Clipper full-text notes store is pinned exclusively to the original Sidebar Host',async ctx=>{
  const path='projects/web-markdown-clipper/trusted/notes-store.js';
  const pin='34547422b3a85be15cfad179e8df5993146c5b80';
  const make=(target,root=process.cwd(),source=path)=>describeBundle({chunk:{fileName:target,
    modules:{[resolve(root,source)]:{renderedLength:1,originalLength:1}}},root,lock:{packages:{}}});
  assert.equal(make('ui/sidebar-tool-host.js').modules[0].reviewedFirstPartyBlob,pin);
  for(const target of ['sw.js','ui/tool-shell.js','ui/marketplace.js','agents/page-relay.js',
    'scripting/sandbox/sandbox.js','scripting/sandbox/worker-runtime.js'])
    assert.throws(()=>make(target),/cannot enter a privileged fixed bundle/);
  assert.throws(()=>make('ui/sidebar-tool-host.js',process.cwd(),
    'projects/web-markdown-clipper/trusted/unreviewed.js'),
    /cannot enter a privileged fixed bundle/);
  const root=await realpath(await mkdtemp(join(tmpdir(),'clip-notes-pin-')));
  ctx.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'projects/web-markdown-clipper/trusted'),{recursive:true});
  await writeFile(join(root,path),(await readFile(resolve(path),'utf8'))+'\n// unsigned change\n');
  assert.throws(()=>make('ui/sidebar-tool-host.js',root),/Trusted Web Clipper source changed/);
});

test('Prompt Shortcuts OD rail bridge requires its reviewed SW blob and fixed outputs',async ctx=>{
  const path='projects/prompt-shortcuts/trusted/rail-open.js';
  const pin='3131842ad495be96fcf26c83571f7061bc66c3d7';
  const make=(target,root=process.cwd())=>describeBundle({chunk:{fileName:target,
    modules:{[resolve(root,path)]:{renderedLength:1,originalLength:1}}},root,lock:{packages:{}}});
  for(const target of ['sw.js','agents/page-relay.js'])
    assert.equal(make(target).modules[0].reviewedFirstPartyBlob,pin);
  for(const target of ['ui/tool-shell.js','ui/sidebar-tool-host.js','scripting/sandbox/worker-runtime.js'])
    assert.throws(()=>make(target),/cannot enter a privileged fixed bundle/);
  const root=await realpath(await mkdtemp(join(tmpdir(),'prompt-rail-pin-')));
  ctx.after(()=>rm(root,{recursive:true,force:true}));
  const file=join(root,path);
  await mkdir(join(root,'projects/prompt-shortcuts/trusted'),{recursive:true});
  await writeFile(file,(await readFile(resolve(path),'utf8'))+'\n// unsigned edit\n');
  assert.throws(()=>make('sw.js',root),/Trusted Prompt Shortcuts source changed/);
});

test('independent Scroll Page source cannot regain privileged fixed output admission',()=>{
  const path='examples/programs/chatgpt-jump-top/src/conversation.js';
  const make=(target,root=process.cwd())=>describeBundle({chunk:{fileName:target,
    modules:{[resolve(root,path)]:{renderedLength:1,originalLength:1}}},root,lock:{packages:{}}});
  for(const target of Object.keys(PACKAGE_ENTRIES).map(name=>name+'.js'))
    assert.throws(()=>make(target),/cannot enter a privileged fixed bundle/);
});

test('removed Prompt Shortcuts site bindings cannot regain privileged output admission',async ctx=>{
  const path='projects/prompt-shortcuts/trusted/conversation-sites.js';
  const make=(target,root=process.cwd())=>describeBundle({chunk:{fileName:target,
    modules:{[resolve(root,path)]:{renderedLength:1,originalLength:1}}},root,lock:{packages:{}}});
  const targets=['agents/page-relay.js','sw.js','ui/sidebar-tool-host.js','ui/tool-shell.js'];
  for(const target of targets)
    assert.throws(()=>make(target),/cannot enter a privileged fixed bundle/);
  const root=await realpath(await mkdtemp(join(tmpdir(),'prompt-site-pin-')));
  ctx.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'projects/prompt-shortcuts/trusted'),{recursive:true});
  await writeFile(join(root,path),'export const sites = [];\n');
  for(const target of targets)
    assert.throws(()=>make(target,root),/cannot enter a privileged fixed bundle/,
      'recreating the removed path must not restore approval: '+target);
});

test('R1.3 pinned shared Markdown converter can only enter the existing Page Relay',async ctx=>{
  const path='examples/shared/markdown/convert.js';
  const legacy='projects/web-markdown-clipper/trusted/convert.js';
  const make=(target,root=process.cwd())=>describeBundle({chunk:{fileName:target,
    modules:{[resolve(root,path)]:{renderedLength:20,originalLength:40}}},root,lock:{packages:{}}});
  const row=make('agents/page-relay.js');
  assert.equal(row.modules[0].path,path);
  assert.equal(row.modules[0].reviewedFirstPartyBlob,'53687ae72643aa751c1ad0d5becf2401ada09bd0');
  for(const target of ['sw.js','ui/tool-shell.js','ui/sidebar-tool-host.js','scripting/sandbox/worker-runtime.js'])
    assert.throws(()=>make(target),/cannot enter a privileged fixed bundle/,
      'shared converter must not cross the Page Relay boundary: '+target);
  assert.throws(()=>describeBundle({chunk:{fileName:'agents/page-relay.js',
    modules:{[resolve(legacy)]:{renderedLength:1,originalLength:1}}},lock:{packages:{}}}),
    /cannot enter a privileged fixed bundle/,
    'removed legacy Clipper path must never be treated as an approved source');
  const root=await realpath(await mkdtemp(join(tmpdir(),'shared-markdown-pin-')));
  ctx.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'examples/shared/markdown'),{recursive:true});
  await writeFile(join(root,path),(await readFile(resolve(path),'utf8'))+'\n// unsigned edit\n');
  assert.throws(()=>make('agents/page-relay.js',root),/Shared Markdown source changed/);
  assert.throws(()=>make('sw.js',root),/cannot enter a privileged fixed bundle/);
});

test('R1.3 Reading TOC model, overview, placement, page and view require audited Page Relay pins',async ctx=>{
  const names=['overview.js','model.js','placement.js','page.js','view.js'];
  const prefix='projects/reading-toc/trusted/';
  const make=(target,root=process.cwd(),list=names)=>describeBundle({chunk:{fileName:target,
    modules:Object.fromEntries(list.map(name=>[resolve(root,prefix+name),
      {renderedLength:20,originalLength:100}]))},root,lock:{packages:{}}});
  const row=make('agents/page-relay.js');
  assert.equal(row.modules.length,names.length);
  for(const item of row.modules)assert.match(item.reviewedFirstPartyBlob,/^[0-9a-f]{40}$/);
  for(const target of ['sw.js','ui/tool-shell.js','ui/sidebar-tool-host.js','scripting/sandbox/worker-runtime.js'])
    assert.throws(()=>make(target),/cannot enter a privileged fixed bundle/);
  const tmp=await realpath(await mkdtemp(join(tmpdir(),'reading-toc-source-pin-')));
  ctx.after(()=>rm(tmp,{recursive:true,force:true}));
  await mkdir(join(tmp,prefix),{recursive:true});
  for(const name of ['model.js','page.js','view.js']){
    const path=join(tmp,prefix,name),bytes=await readFile(resolve(prefix,name));
    await writeFile(path,bytes);
    assert.equal(make('agents/page-relay.js',tmp,[name]).modules[0].reviewedFirstPartyBlob,
      row.modules.find(item=>item.path===prefix+name).reviewedFirstPartyBlob);
    await writeFile(path,Buffer.concat([bytes,Buffer.from('\n// unsigned edit\n')]));
    assert.throws(()=>make('agents/page-relay.js',tmp,[name]),
      /Trusted Reading TOC source changed/);
    await rm(path);await symlink(resolve(prefix,name),path);
    assert.throws(()=>make('agents/page-relay.js',tmp,[name]),/must not be a symlink/);
  }
});

test('Reading TOC generated locale keeps exact source, target and symlink fences',async ctx=>{
  const path='projects/reading-toc/trusted/locales.generated.js';
  const make=(target,root=process.cwd())=>describeBundle({root,lock:{packages:{}},chunk:{
    fileName:target,modules:{[resolve(root,path)]:{originalLength:100,renderedLength:20}}
  }});
  const pin='e494a458a006adeb90697aca8dd8957bc90e2ef3';
  assert.equal(make('sw.js').modules[0].reviewedFirstPartyBlob,pin);
  assert.throws(()=>make('scripting/sandbox/worker-runtime.js'),/cannot enter a privileged fixed bundle/);
  const tmp=await realpath(await mkdtemp(join(tmpdir(),'reading-toc-locale-pin-')));
  ctx.after(()=>rm(tmp,{recursive:true,force:true}));
  const file=resolve(tmp,path),bytes=await readFile(path);
  await mkdir(resolve(file,'..'),{recursive:true});await writeFile(file,bytes);
  assert.equal(make('sw.js',tmp).modules[0].reviewedFirstPartyBlob,pin);
  await writeFile(file,Buffer.concat([bytes,Buffer.from('\n// unreviewed drift\n')]));
  assert.throws(()=>make('sw.js',tmp),/Trusted .* source changed/);
  await rm(file);await symlink(resolve(path),file);
  assert.throws(()=>make('sw.js',tmp),/must not be a symlink/);
});

test('relocated trusted policies and tab repair keep exact source, target and symlink fences',async ctx=>{
  const cases=[
    ['projects/reading-toc/trusted/policy.js','sw.js','2a2dcc3c21ac74bb569c2c418c52bdd3cb430bb2'],
    ['projects/web-markdown-clipper/trusted/policy.js','sw.js','9cb4b8af149d25e2427ed0e187433f77a03b788f'],
    ['projects/reading-toc/trusted/existing-tabs.js','sidebar-tools/preinstall-intent.js','e82a3e3b43debfff756180ccf1da110b7dfd8172']
  ];
  const tmp=await realpath(await mkdtemp(join(tmpdir(),'relocated-trusted-source-')));
  ctx.after(()=>rm(tmp,{recursive:true,force:true}));
  for(const [path,target,pin] of cases){
    const make=(at,root=process.cwd())=>describeBundle({root,lock:{packages:{}},chunk:{
      fileName:at,modules:{[resolve(root,path)]:{originalLength:100,renderedLength:20}}
    }});
    assert.equal(make(target).modules[0].reviewedFirstPartyBlob,pin);
    assert.throws(()=>make('scripting/sandbox/worker-runtime.js'),/cannot enter a privileged fixed bundle/);
    if(path.endsWith('/existing-tabs.js'))assert.throws(()=>make('sw.js'),/cannot enter a privileged fixed bundle/);
    const file=resolve(tmp,path),bytes=await readFile(path);
    await mkdir(resolve(file,'..'),{recursive:true});await writeFile(file,bytes);
    assert.equal(make(target,tmp).modules[0].reviewedFirstPartyBlob,pin);
    await writeFile(file,Buffer.concat([bytes,Buffer.from('\n// unreviewed drift\n')]));
    assert.throws(()=>make(target,tmp),/Trusted .* source changed/);
    await rm(file);await symlink(resolve(path),file);
    assert.throws(()=>make(target,tmp),/must not be a symlink/);
  }
});

test('Clipper region source is byte-pinned to Page Relay and never admitted elsewhere',async t=>{
  const inputs=[
    ['projects/web-markdown-clipper/trusted/page.js','46bb1a7b4355922fdc8e84e2be3933d8a2b33a17'],
    ['projects/web-markdown-clipper/trusted/region-picker.js','c2a7b9b15c9ac7d6e132c5a1d1f5f27609d20a0a']
  ];
  const project=await realpath(await mkdtemp(join(tmpdir(),'clipper-region-provenance-')));
  t.after(()=>rm(project,{recursive:true,force:true}));
  for(const [path,pin] of inputs){
    const make=(target,root=process.cwd())=>describeBundle({root,lock:{packages:{}},
      chunk:{fileName:target,modules:{[resolve(root,path)]:{renderedLength:1,originalLength:1}}}});
    assert.equal(make('agents/page-relay.js').modules[0].reviewedFirstPartyBlob,pin);
    for(const target of ['sw.js','ui/tool-shell.js','ui/sidebar-tool-host.js',
      'agents/chatgpt-fixed-bridge.js','scripting/sandbox/worker-runtime.js'])
      assert.throws(()=>make(target),/cannot enter a privileged fixed bundle/);
    const file=resolve(project,path),bytes=await readFile(path);
    await mkdir(dirname(file),{recursive:true});await writeFile(file,bytes);
    assert.equal(make('agents/page-relay.js',project).modules[0].reviewedFirstPartyBlob,pin);
    await writeFile(file,Buffer.concat([bytes,Buffer.from('\n// unreviewed drift')]));
    assert.throws(()=>make('agents/page-relay.js',project),/Trusted Web Clipper source changed/);
    await rm(file);await symlink(resolve(path),file);
    assert.throws(()=>make('agents/page-relay.js',project),/must not be a symlink/);
  }
});

test('shared visible-selection helper is pinned only into existing Page Relay',async t=>{
  const file='examples/shared/markdown/selection.js';
  const project=await realpath(await mkdtemp(join(tmpdir(),'opendesk-selection-pin-')));
  t.after(()=>rm(project,{recursive:true,force:true}));
  await mkdir(join(project,'examples/shared/markdown'),{recursive:true});
  const source=await readFile(file,'utf8');
  await writeFile(join(project,file),source);
  const make=target=>describeBundle({chunk:{fileName:target,modules:{
    [resolve(project,file)]:{renderedLength:1,originalLength:source.length}
  }},root:project,lock:{packages:{}}});
  assert.equal(make('agents/page-relay.js').modules[0].reviewedFirstPartyBlob,
    '747d1afe2cee9a745552a3a7ceb699d1af83b35b');
  for(const target of ['sw.js','ui/tool-shell.js','ui/sidebar-tool-host.js',
    'scripting/sandbox/worker-runtime.js','libs/runtime/page-core.js'])
    assert.throws(()=>make(target),/Historical\/user\/vendor code cannot enter/);
  await writeFile(join(project,file),source+'\n// changed');
  assert.throws(()=>make('agents/page-relay.js'),/Shared Markdown source changed/);
});

// R1.3: trusted bridge DOM code needs no independent-program admission exception.
test('fixed ChatGPT bridge uses src ownership without admitting independent queue code',()=>{
  const target='agents/chatgpt-fixed-bridge.js';
  const describe=path=>describeBundle({root,lock:{packages:{}},chunk:{fileName:target,
    modules:{[root+'/'+path]:{renderedLength:1,originalLength:1}}}});
  const row=describe('src/native-agent/chatgpt-bridge-site.js').modules[0];
  assert.equal(row.path,'src/native-agent/chatgpt-bridge-site.js');
  assert.equal(row.reviewedFirstPartyBlob,undefined);
  for(const path of ['examples/programs/chatgpt-send-queue/src/site.js',
    'examples/programs/chatgpt-send-queue/src/engine.js'])
    assert.throws(()=>describe(path),/cannot enter a privileged fixed bundle/);
});
