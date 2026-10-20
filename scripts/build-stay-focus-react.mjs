// Build the existing Stay Focus React UI before official/staged packaging.
// A source-bound receipt makes stale previews or JS/CSS fail closed.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {parse} from 'acorn';
import {build} from 'vite';
import {inspectSidebarToolProject} from './stage-sidebar-tool.mjs';
import {STAY_FOCUS_REACT_SOURCES} from '../examples/sidebar-tools/stay-focus/vite.config.mjs';

const root=fileURLToPath(new URL('../examples/sidebar-tools/stay-focus/',import.meta.url));
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const fingerprints=async()=>Object.fromEntries(await Promise.all(
  STAY_FOCUS_REACT_SOURCES.map(async path=>[path,sha256(await readFile(resolve(root,path)))])));

export async function buildStayFocusReact({log=true}={}){
  const inputs=await fingerprints();
  await build({configFile:resolve(root,'vite.config.mjs'),logLevel:'warn',clearScreen:false});
  assert.deepEqual(await fingerprints(),inputs,
    'Stay Focus source changed while compiling: do not package this candidate');
  const [js,css,raw]=await Promise.all([
    readFile(resolve(root,'dist/tool.js'),'utf8'),
    readFile(resolve(root,'dist/tool.css'),'utf8'),
    readFile(resolve(root,'dist/build-ready.json'),'utf8')
  ]);
  assert.ok(js.length>500&&css.length>300,'Stay Focus emitted empty assets');
  assert.ok(Buffer.byteLength(js)<220000&&Buffer.byteLength(css)<120000,
    'Stay Focus compiled asset exceeds installer budget');
  parse(js,{ecmaVersion:'latest',sourceType:'script'});
  for(const operation of ['focus.status','focus.site.put','focus.site.remove',
    'focus.group.put','focus.schedule.set','focus.session.start','focus.session.stop',
    'E_STAY_FOCUS_SHARED_UI','OpenDeskPageReact','OpenDeskSidebarUI'])
    assert.ok(js.includes(operation),'Stay Focus compiled source is missing: '+operation);
  assert.ok(css.includes('.sf'),'Stay Focus compiled stylesheet is missing');
  assert.doesNotMatch(js,/chrome\.(?:declarativeNetRequest|permissions|idle|tabs)\b/,
    'sandbox UI must not import privileged browser capabilities');
  const ready=JSON.parse(raw);
  for(const [file,digest] of Object.entries(inputs))
    assert.equal(ready.sources[file]?.sha256,digest,'stale Build Ready source: '+file);
  for(const file of ['dist/tool.js','dist/tool.css']){
    const bytes=await readFile(resolve(root,file));
    assert.deepEqual(ready.files[file],{bytes:bytes.length,sha256:sha256(bytes)});
  }
  assert.equal(ready.buildId,sha256(Buffer.from(JSON.stringify({
    sources:ready.sources,files:ready.files}))));
  const inspected=await inspectSidebarToolProject(root);
  assert.equal(inspected.buildId,ready.buildId);
  const result={status:'COMPILED_NOT_INSTALLED',
    version:JSON.parse(await readFile(resolve(root,'tool.config.json'),'utf8')).version,
    buildId:ready.buildId,files:ready.files};
  if(log)console.log(JSON.stringify(result));
  return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  await buildStayFocusReact();
