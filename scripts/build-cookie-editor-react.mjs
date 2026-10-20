// Cookie Editor's existing Vite/React build, not an alternative UI/runtime.
// Compiled bytes and their source hashes must match before any package is used.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {parse} from 'acorn';
import {build} from 'vite';
import {inspectSidebarToolProject} from './stage-sidebar-tool.mjs';
import {COOKIE_REACT_SOURCE_FILES} from '../examples/sidebar-tools/cookie-editor/vite.config.mjs';

const root=fileURLToPath(new URL('../examples/sidebar-tools/cookie-editor/',import.meta.url));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const fingerprint=bytes=>({bytes:bytes.length,sha256:sha(bytes)});
const sources=async()=>Object.fromEntries(await Promise.all(
  COOKIE_REACT_SOURCE_FILES.map(async file=>[file,fingerprint(await readFile(resolve(root,file)))])));
const manifest=async()=>JSON.parse(await readFile(resolve(root,'tool.config.json'),'utf8'));

export async function buildCookieEditorReact({log=true}={}){
  const before=await sources();
  await build({configFile:resolve(root,'vite.config.mjs'),logLevel:'warn',clearScreen:false});
  assert.deepEqual(await sources(),before,'Cookie React source changed while compiling');
  const [js,css,ready]=await Promise.all([
    readFile(resolve(root,'dist/tool.js')),
    readFile(resolve(root,'dist/tool.css')),
    readFile(resolve(root,'dist/build-ready.json')).then(b=>JSON.parse(b.toString('utf8')))
  ]);
  assert.ok(js.length>500&&css.length>300,'Cookie React emitted empty assets');
  assert.ok(js.length<220000&&css.length<120000,'Cookie React exceeds installer budget');
  const code=js.toString('utf8');
  parse(code,{ecmaVersion:'latest',sourceType:'script'});
  for(const operation of ['OpenDeskPageReact','OpenDeskSidebarUI',
    'cookieEditor.import.begin','cookieEditor.write.begin',
    'E_COOKIE_REACT_SANDBOX_NOT_READY'])
    assert.ok(code.includes(operation),'Cookie React lost business operation: '+operation);
  // Vite minifies the adapter's browser() accessor name; require the actual call.
  assert.match(code,/[$A-Z_a-z][\w$]*\(\)\.cookies\.setMany\(/,
    'Cookie React lost public SDK batch write call');
  assert.ok(css.toString('utf8').startsWith('/* @opendesk-shared-design */'),
    'Cookie React shared-design marker missing');
  assert.equal(ready.format,'opendesk.ui-build-ready.v1');
  assert.deepEqual(ready.sources,before,'Cookie React source receipt is stale');
  assert.deepEqual(ready.files,{
    'dist/tool.js':fingerprint(js),'dist/tool.css':fingerprint(css)
  },'Cookie React compiled resource differs from its receipt');
  assert.equal(ready.buildId,sha(Buffer.from(JSON.stringify({
    sources:ready.sources,files:ready.files}))),
    'Cookie React build ID must be stable for identical sources');
  const meta=await manifest();
  if(meta.uiRuntime==='opendesk.react-ui.v1'){
    const inspected=await inspectSidebarToolProject(root);
    assert.equal(inspected.buildId,ready.buildId,
      'Cookie Editor official package source fingerprint mismatch');
  }
  const result={status:'COMPILED_NOT_INSTALLED',id:'cookie-editor',version:meta.version,
    buildId:ready.buildId,files:ready.files};
  if(log)console.log(JSON.stringify(result));
  return result;
}

// Existing legacy release stays unchanged until official React gates pass.
export async function buildCookieEditorReactIfOfficial({log=false}={}){
  const meta=await manifest();
  if(meta.uiRuntime!=='opendesk.react-ui.v1')return null;
  if(meta.files?.html!=='src/root.html'||meta.files?.js!=='dist/tool.js'||
    meta.files?.css!=='dist/tool.css')
    throw Error('Official Cookie React entry must use compiled Vite resources');
  return buildCookieEditorReact({log});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  await buildCookieEditorReact();
