import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {createSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';
import {serializeSidebarToolPackage} from '../../src/ui/sidebar-tools/package.js';
import {
 admitsTrustedBookmark,TRUSTED_BOOKMARK_VERSION,TRUSTED_BOOKMARK_ID,
 trustedBookmarkProvenanceChanged
} from '../../src/ui/trusted-bookmark-admission.js';

const read=path=>readFile(resolve(path),'utf8');

test('R3.0.6 only the exact official, enabled, current installed package enters static React',async()=>{
 const tool=await createSidebarToolPackage(resolve('examples/sidebar-tools/bookmark-manager'));
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
 const cases=[
  {...args,tool:{...tool,js:tool.js+';globalThis.evil=true;'}},
  {...args,tool:{...tool,id:'another-tool'}},
  {...args,tool:{...tool,version:'0.3.7'}},
  {...args,installed:[]},
  {...args,release:{...release,sha256:'f'.repeat(64)}},
  {...args,release:{...release,id:'third-party/bookmark-manager'}},
  {...args,enableRecords:{[tool.id]:false}},
  {...args,epochs:{[tool.id]:'epoch-revoked'}},
  {...args,expectedEpoch:'epoch-stale'},
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
  'examples/sidebar-tools/bookmark-manager/preview/react/src/App.jsx',
  'examples/sidebar-tools/bookmark-manager/preview/react/src/style.css',
  'examples/sidebar-tools/bookmark-manager/preview/react/src/main.jsx',
  'examples/sidebar-tools/bookmark-manager/preview/react/src/formal.jsx',
  'examples/sidebar-tools/bookmark-manager/preview/react/build-preview.mjs',
  'examples/sidebar-tools/bookmark-manager/preview/react/run-chrome.mjs',
  'examples/sidebar-tools/bookmark-manager/preview/.gitignore','wxt.config.mjs'
 ].map(read));
 assert.match(react,/createPortal\(<[\s\S]*BookmarkReactApp/);
 assert.match(react,/mountBookmarkPilot\(/);
 assert.match(react,/BookmarkReactApp from .*preview\/react\/src\/App\.jsx/);
 assert.equal((react.match(/createRoot\(/g)||[]).length,1);
 assert.match(shell,/bookmarkReactPilot/);
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
 assert.match(entry,/import '\.\/style\.css'/);
 assert.match(formal,/import '\.\/style\.css'/);
 assert.match(build,/preview'\);\nconst candidate=join\(candidateDir,'dev\.html'\)/);
 assert.match(chrome,/preview\/dev\.html/);
 assert.match(ignore,/^\/dev\.html$/m);
 assert.doesNotMatch(ignore,/index\.html/);
 assert.match(wxt,/resolve:\{dedupe:\['react','react-dom'\]/);
});
