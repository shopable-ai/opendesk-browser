import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {build as buildBrowserModule} from 'vite';
import {createSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';
import {createOfficialToolResources,readOfficialSources} from '../../scripts/build-official-tools.mjs';
import {nextPatchVersion} from '../../scripts/app-update-plan.mjs';
import {OFFICIAL_CATALOG_PATH} from '../../src/sidebar-tools/official-catalog.js';
import {serializeSidebarToolPackage} from '../../src/ui/sidebar-tools/package.js';
import {
 admitsTrustedBookmark,TRUSTED_BOOKMARK_VERSION,TRUSTED_BOOKMARK_ID,
 trustedBookmarkProvenanceChanged
} from '../../src/ui/trusted-bookmark-admission.js';

const read=path=>readFile(resolve(path),'utf8');

test('Bookmark release config, packed catalog and compiled Browser admission advance together',async t=>{
 const source=await readOfficialSources();
 const row=source.tools.find(item=>item.id===TRUSTED_BOOKMARK_ID);
 assert.ok(row,'the official source catalog must include Bookmark Manager');
 const config=JSON.parse(await read(row.project+'/tool.config.json'));
 assert.equal(TRUSTED_BOOKMARK_VERSION,config.version,
   'direct Node admission pin must match the reviewed source release');
 const admissionSource=await read('src/ui/trusted-bookmark-admission.js');
 const wxt=await read('wxt.config.mjs');
 assert.doesNotMatch(admissionSource,/import\s+.*bookmark-manager\/tool\.config\.json/,
   'privileged Host may not import another App configuration');
 assert.match(wxt,/__OPENDESK_TRUSTED_BOOKMARK_VERSION__:JSON\.stringify\(trustedBookmarkVersion\)/,
   'the real MV3 compiler must inject the exact source version');
 // Exercise the next PATCH too: Browser compile-time injection must advance
 // with the source release, while older installed Browser builds fail closed.
 for(const version of [config.version,nextPatchVersion(config.version)])await t.test(version,async t=>{
  const root=await realpath(await mkdtemp(join(tmpdir(),'bookmark-release-')));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const write=async(path,bytes)=>{
   const target=join(root,path);await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes);
  };
  const candidateConfig={...config,version};
  await write(OFFICIAL_CATALOG_PATH,JSON.stringify({...source,tools:[row]}));
  await write(row.project+'/tool.config.json',JSON.stringify(candidateConfig));
  for(const path of [config.files.html,config.files.css,config.files.js,
   ...(config.files.dependencies||[]),...(config.assets||[])])
   await write(row.project+'/'+path,await readFile(row.project+'/'+path));
  // Use the production catalog generator, restricted to this one real project.
  // Never build unrelated Apps or write into a live Browser output directory.
  const {catalog,resources}=await createOfficialToolResources({root});
  const release=catalog.apps[0],bytes=resources.get(release.packagePath);
  const tool=JSON.parse(bytes.toString('utf8'));
  assert.equal(tool.version,version);assert.equal(release.version,version);
  assert.equal(release.bytes,bytes.length);
  assert.equal(release.sha256,createHash('sha256').update(bytes).digest('hex'));
  const bundled=await buildBrowserModule({configFile:false,publicDir:false,logLevel:'silent',
   define:{__OPENDESK_TRUSTED_BOOKMARK_VERSION__:JSON.stringify(version)},
   build:{write:false,minify:false,lib:{entry:resolve('src/ui/trusted-bookmark-admission.js'),formats:['es']}}
  });
  const chunks=(Array.isArray(bundled)?bundled:[bundled]).flatMap(result=>result.output);
  assert.equal(chunks.length,1,'admission must compile to one self-contained module');
  assert.ok(chunks.every(chunk=>Object.keys(chunk.modules||{}).every(id=>
    !id.includes('/bookmark-manager/tool.config.json'))),
   'official App config JSON cannot enter the trusted Browser module graph');
  const compiled=await import('data:text/javascript;base64,'+Buffer.from(chunks[0].code).toString('base64'));
  assert.equal(compiled.TRUSTED_BOOKMARK_VERSION,version,'Browser must compile the same release version');
  const args={tool,release,installed:[tool],enableRecords:{},
   epochs:{[tool.id]:'release-epoch'},expectedEpoch:'release-epoch',
   provenance:{[tool.id]:{marketId:release.id,version,sha256:release.sha256}}};
  assert.equal(await compiled.admitsTrustedBookmark(args),true,'the generated official package must enter React');
  if(version!==config.version)
   assert.equal(await admitsTrustedBookmark(args),false,'an older Browser must reject a future release');
 });
});

test('R3.0.6 only the exact official, enabled, current installed package enters static React',async()=>{
 const tool=await createSidebarToolPackage(resolve('projects/bookmark-manager'));
 assert.equal(tool.version,TRUSTED_BOOKMARK_VERSION);
 assert.equal(tool.id,TRUSTED_BOOKMARK_ID);
 const canonical=serializeSidebarToolPackage(tool);
 const sha256=createHash('sha256').update(canonical,'utf8').digest('hex');
 const release={id:'opendesk/bookmark-manager',toolId:TRUSTED_BOOKMARK_ID,
  version:TRUSTED_BOOKMARK_VERSION,
  packagePath:'official-tools/bookmark-manager/bookmark-manager.opendesk-tool.json',
  bytes:Buffer.byteLength(canonical,'utf8'),sha256};
 const source={marketId:release.id,version:release.version,sha256};
 const args={tool,installed:[tool],release,provenance:{[tool.id]:source},
  enableRecords:{},epochs:{[tool.id]:'epoch-valid'},expectedEpoch:'epoch-valid'};
 assert.equal(await admitsTrustedBookmark(args),true);
 // Even mutually consistent remote metadata cannot select another version
 // of the statically compiled Browser component.
 const futureTool={...tool,version:'99.0.0'};
 const futureCanonical=serializeSidebarToolPackage(futureTool);
 const futureHash=createHash('sha256').update(futureCanonical,'utf8').digest('hex');
 const cases=[
  {...args,tool:{...tool,js:tool.js+';globalThis.evil=true;'}},
  {...args,tool:{...tool,id:'another-tool'}},
  {...args,tool:{...tool,version:'0.3.7'}},
  {...args,tool:futureTool,installed:[futureTool],
   release:{...release,version:futureTool.version,sha256:futureHash,bytes:Buffer.byteLength(futureCanonical)},
   provenance:{[tool.id]:{...source,version:futureTool.version,sha256:futureHash}}},
  {...args,installed:[]},
  {...args,release:{...release,version:'0.3.12'}},
  {...args,release:{...release,sha256:'f'.repeat(64)}},
  {...args,release:{...release,id:'third-party/bookmark-manager'}},
  {...args,enableRecords:{[tool.id]:false}},
  {...args,epochs:{[tool.id]:'epoch-revoked'}},
  {...args,expectedEpoch:'epoch-stale'},
  {...args,provenance:{}},
  {...args,provenance:{[tool.id]:{...source,version:'0.3.12'}}},
  {...args,provenance:{[tool.id]:{...source,marketId:'third-party/bookmark-manager'}}},
  {...args,provenance:{[tool.id]:{...source,extra:'unknown'}}}
 ];
 for(const value of cases)assert.equal(await admitsTrustedBookmark(value),false,
  'an altered install, release, grant or provenance must fail closed');
 assert.equal(trustedBookmarkProvenanceChanged({
  oldValue:{[tool.id]:source},newValue:{[tool.id]:source,unrelated:{foo:true}}
 }),false);
 assert.equal(trustedBookmarkProvenanceChanged({
  oldValue:{[tool.id]:source},newValue:{[tool.id]:{...source,sha256:'f'.repeat(64)}}
 }),true);
 assert.equal(trustedBookmarkProvenanceChanged({
  oldValue:{[tool.id]:source},newValue:{unrelated:{foo:true}}
 }),true);
});

test('R3.0.6 one audited JSX source and one React Host root; dynamic iframe intact',async()=>{
 const [react,host,shell,app,css,entry,formal,build,chrome,ignore,wxt]=await Promise.all([
  'src/ui/react/main.tsx','src/ui/sidebar-tools.js','src/ui/tool-shell.js',
  'projects/bookmark-manager/src/react/App.jsx',
  'projects/bookmark-manager/src/react/style.css',
  'projects/bookmark-manager/preview/react/src/main.jsx',
  'projects/bookmark-manager/preview/react/src/formal.jsx',
  'projects/bookmark-manager/preview/react/build-preview.mjs',
  'projects/bookmark-manager/preview/react/run-chrome.mjs',
  'projects/bookmark-manager/preview/.gitignore','wxt.config.mjs'
 ].map(read));
 assert.match(react,/createPortal\(<[\s\S]*BookmarkReactApp/);
 assert.match(react,/mountBookmarkPilot\(/);
 assert.match(react,/import BookmarkReactApp from '\.\.\/\.\.\/\.\.\/projects\/bookmark-manager\/src\/react\/App\.jsx'/);
 assert.doesNotMatch(react,/bookmarkConversationSamples/,'Shared trusted Host must not reintroduce demo shortcuts');
 assert.equal((react.match(/createRoot\(/g)||[]).length,1);
 assert.match(shell,/trustedBookmarkPilot:\{[\s\S]*?enabled:true,/);
 assert.doesNotMatch(shell,/bookmarkReactPilot/);
 assert.match(shell,/debugEnabled/);
 assert.match(host,/admittedNativeBookmark/);
 assert.match(host,/trustedBookmarkSource=Symbol/);
 assert.match(host,/return dispatch\(operation,payload,tool,trustedBookmarkSource/);
 assert.match(host,/frame=doc\.createElement\('iframe'\)/);
 assert.match(host,/trustedBookmarkProvenanceChanged/);
 assert.match(host,/onBookmarkChromeGrantRemoved/);
 assert.match(app,/export default function App\(\{runtime=null/);
 assert.match(app,/watchStart\(\)/);
 assert.match(app,/watchStop\(/);
 assert.match(app,/E_DOCUMENT_STALE/);
 assert.match(app,/sourcePage:source/);
 assert.doesNotMatch(app,/^const service=globalThis\./m);
 assert.doesNotMatch(css,/^:root|^html,body|^button,input/m);
 assert.match(entry,/import '\.\.\/\.\.\/\.\.\/src\/react\/style\.css'/);
 assert.match(formal,/import '\.\.\/\.\.\/\.\.\/src\/react\/style\.css'/);
 assert.match(build,/preview'\);\nconst candidate=join\(candidateDir,'dev\.html'\)/);
 assert.match(chrome,/preview\/dev\.html/);
 assert.match(ignore,/^\/dev\.html$/m);
 assert.doesNotMatch(ignore,/index\.html/);
 assert.match(wxt,/resolve:\{dedupe:\['react','react-dom'\]/);
});
