#!/usr/bin/env node
// Headless candidate-only Chromium regression. Does not overwrite approved HTML.
import {spawnSync} from 'node:child_process';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {build} from 'vite';
import {withMockHostAdapter} from './mock-host-adapter.mjs';
const here=dirname(fileURLToPath(import.meta.url));
const toolDir=resolve(here,'../..'),root=resolve(toolDir,'../../..');
const out=join(here,'.opendesk-preview/chrome-formal');
const compiled=join(out,'dist');
await mkdir(out,{recursive:true});
// Exercise the actual formal mount and shared App.jsx, with mock SDK/Host only.
await build({configFile:join(here,'vite.config.mjs'),clearScreen:false,logLevel:'error',
 build:{outDir:compiled,lib:{entry:join(here,'src/formal.jsx'),
  name:'OpenDeskBookmarkReactFormal',formats:['iife'],
  fileName:()=> 'bookmark-formal.js',cssFileName:'bookmark-react'}}});
const read=path=>readFile(path,'utf8');
const sha=value=>createHash('sha256').update(value).digest('hex');
const encode=value=>Buffer.from(value,'utf8').toString('base64');
const [template,bundle,css,mock,app,entry]=await Promise.all([
 read(join(toolDir,'preview/dev.html')),read(join(compiled,'bookmark-formal.js')),
 read(join(compiled,'bookmark-react.css')),read(join(root,'scripts/preview/bookmark-manager-mock.js')),
 read(join(toolDir,'src/react/App.jsx')),read(join(here,'src/formal.jsx'))]);
const framePattern=/atob\('([A-Za-z0-9+/=]+)'\)/;
const manifestPattern=/(<script type="application\/json" id="opendesk-preview-manifest">)([^<]+)(<\/script>)/;
let frame=Buffer.from(template.match(framePattern)[1],'base64').toString('utf8');
const manifest=JSON.parse(template.match(manifestPattern)[2]);
assert.equal(manifest.reactFiles.app,sha(app),'Rebuild preview after App.jsx changes');
assert.equal(manifest.reactFiles.mock,sha(mock),'Rebuild preview after mock changes');
assert.equal(manifest.reactFiles.css,sha(css),'Formal and preview CSS must match');
let scriptIndex=0;
frame=frame.replace(/(<script src="data:text\/javascript;base64,)([A-Za-z0-9+/=]+)("><\/script>)/g,
 (_,open,code,close)=>{
  const index=scriptIndex++;
  return open+(index===0?encode(withMockHostAdapter(mock)):index===3?encode(bundle):code)+close;
 });
assert.equal(scriptIndex,4,'Preserve mock, model, service and React script order');
assert.match(frame,/(<div id="tool-root"[^>]*>)(<\/div>)/);
frame=frame.replace(/(<div id="tool-root"[^>]*>)(<\/div>)/,
 '$1<main data-bookmark-react-root style="height:100%"></main>$2');
const marker={version:'R3.0.4',renderer:'react-dom/client',formalEntry:true,nativeVerified:false};
frame=frame.replace('</body>','<script>globalThis.__BookmarkReactPreview=Object.freeze('+JSON.stringify(marker)+');</script></body>');
Object.assign(manifest,{formalEntry:true,hostAdapter:'MOCK_HOST_ADAPTER',nativeVerified:false,
 sourceBound:false,reactFrameSha256:sha(frame),
 reactFiles:{...manifest.reactFiles,bundle:sha(bundle),main:sha(entry),mock:sha(withMockHostAdapter(mock))}});
const candidate=join(out,'formal-mock.html');
await writeFile(candidate,template.replace(framePattern,()=>"atob('"+encode(frame)+"')")
 .replace(manifestPattern,(_,open,ignored,close)=>open+JSON.stringify(manifest)+close));
const result=spawnSync(process.execPath,[
 join(toolDir,'preview/r304-chrome.mjs'),join(here,'.opendesk-preview/chrome-evidence')
],{cwd:root,stdio:'inherit',env:{...process.env,BOOKMARK_REACT_PREVIEW_HTML:candidate}});
if(result.error)throw result.error;
process.exitCode=result.status??1;
