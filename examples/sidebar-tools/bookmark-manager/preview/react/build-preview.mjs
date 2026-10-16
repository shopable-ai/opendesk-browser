#!/usr/bin/env node
// R3.0.4 source-bound React-CANDIDATE design preview. Business semantics reuse
// the real model/service; authority is the sandbox-only in-memory Mock.
// This builder edits ONLY the encoded inner frame and its manifest, preserving
// the existing R2.9 outer Side Panel shell and external diagnostic laboratory.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url));
const toolDir=resolve(here,'../..');
const root=resolve(toolDir,'../../..');
const preview=join(toolDir,'preview/index.html');
const sha=x=>createHash('sha256').update(x).digest('hex');
const read=p=>readFile(p,'utf8');
const out=await read(preview);
const manifestPattern=/(<script type="application\/json" id="opendesk-preview-manifest">)([^<]+)(<\/script>)/;
const oldManifest=JSON.parse(out.match(manifestPattern)?.[2]||'null');
assert.equal(oldManifest?.tool,'bookmark-manager');
assert.match(out,/sandbox="allow-scripts"/);
assert.doesNotMatch(out,/sandbox="[^"]*allow-same-origin/);
assert.match(out,/class="preview-device"/);
assert.match(out,/id="od-preview-bookmark-lab"/);
assert.match(out,/atob\('[A-Za-z0-9+/=]+'\)/);
const [bundle,style,tokens,mock,model,service,main,app]=await Promise.all([
 read(join(here,'dist/bookmark-react.js')),
 read(join(here,'dist/bookmark-react.css')),
 read(join(root,'src/ui/design-tokens.css')),
 read(join(root,'scripts/preview/bookmark-manager-mock.js')),
 read(join(toolDir,'src/model.js')),
 read(join(toolDir,'src/service.js')),
 read(join(here,'src/main.jsx')),
 read(join(here,'src/App.jsx'))
]);
assert.match(bundle,/createRoot|createRoot|react-dom/i,'Vite must bundle actual React renderer');
assert.match(app,/export default function App/);
const encoded=x=>Buffer.from(x,'utf8').toString('base64');
const scripts=[mock,model,service,bundle].map(code=>'<script src="data:text/javascript;base64,'+encoded(code)+'"></script>').join('');
const frame='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">'+
 '<meta name="viewport" content="width=device-width,initial-scale=1">'+
 '<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; script-src data: &#39;unsafe-inline&#39;; style-src data: &#39;unsafe-inline&#39;; img-src data:; connect-src &#39;none&#39;; object-src &#39;none&#39;; base-uri &#39;none&#39;; form-action &#39;none&#39;">'+
 '<link rel="stylesheet" href="data:text/css;base64,'+encoded(tokens+'\n'+style)+'">'+
 '</head><body><div id="tool-root" data-react-root="bookmark-r304" aria-label="书签管理"></div>'+
 '<script>globalThis.__opendeskPreviewScenario="success";</script>'+scripts+'</body></html>';
assert.equal((frame.match(/data:text\/javascript;base64,/g)||[]).length,4);
const reactFiles={bundle:sha(bundle),css:sha(style),model:sha(model),service:sha(service),mock:sha(mock),app:sha(app),main:sha(main)};
const manifest={...oldManifest,previewBuild:'R3.0.4 REACT LIST-FIRST UX CANDIDATE',reactRuntime:true,
 reactFiles,reactFrameSha256:sha(frame),previewCandidate:'REACT_OFFLINE_MOCK',
 designStatus:'DESIGN_PROTOTYPE_NOT_SOURCE_BOUND',sourceBound:false,nativeVerified:false,
 previewViewportModes:[360,400,960]};
const updated=out.replace(/atob\('[A-Za-z0-9+/=]+'\)/,()=>"atob('"+encoded(frame)+"')")
 .replace(manifestPattern,(_,open,ignored,close)=>open+JSON.stringify(manifest)+close);
assert.match(updated,/\"reactRuntime\":true/);
if(process.argv.includes('--check')){
 if(out!==updated){console.error('R304_PREVIEW_DRIFT: run npm run preview:build');process.exitCode=1}
 else console.log('R304_PREVIEW_SOURCE_MATCH '+sha(updated));
}else{
 await writeFile(preview,updated,'utf8');
 console.log(JSON.stringify({result:'R304_REACT_PREVIEW_BUILT',sha256:sha(updated),
  htmlBytes:Buffer.byteLength(updated),frameBytes:Buffer.byteLength(frame),reactFiles},null,2));
}
