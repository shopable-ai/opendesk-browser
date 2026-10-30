// The only AdBlock compiler: Vite output is disposable; the source/byte
// receipt is mandatory for standalone, official and preview packaging.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {parse} from 'acorn';
import {build} from 'vite';
import {inspectSidebarToolProject} from './stage-sidebar-tool.mjs';
import {ADBLOCK_REACT_SOURCE_FILES} from '../projects/adblock/vite.config.mjs';

const root=fileURLToPath(new URL('../projects/adblock/',import.meta.url));
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const sourceFingerprint=async()=>Object.fromEntries(await Promise.all(
  ADBLOCK_REACT_SOURCE_FILES.map(async file=>[file,
    sha256(await readFile(resolve(root,file)))])));
export async function buildAdblockReact({log=true}={}){
  const inputsBefore=await sourceFingerprint();
  await build({configFile:resolve(root,'vite.config.mjs'),
    logLevel:'warn',clearScreen:false});
  assert.deepEqual(await sourceFingerprint(),inputsBefore,
    'AdBlock sources changed while compiling; reject this build');
  const [js,css,receipt]=await Promise.all([
    readFile(resolve(root,'dist/tool.js'),'utf8'),
    readFile(resolve(root,'dist/tool.css'),'utf8'),
    readFile(resolve(root,'dist/build-ready.json'),'utf8')
  ]);
  assert.ok(js.length>500&&css.length>300,'AdBlock React emitted empty assets');
  parse(js,{ecmaVersion:'latest',sourceType:'script'});
  for(const name of ['adblock.enable','adblock.disable','adblock.status',
    'adblock.site.set','adblock.site.restore','opendesk-page-changed',
    'opendesk-tool-state-changed','E_ADBLOCK_REACT_ROOT'])
    assert.ok(js.includes(name),'compiled React lost business operation: '+name);
  assert.ok(js.includes('OpenDeskPageReact')&&js.includes('OpenDeskSidebarUI'),
    'React and Shared UI must remain host-owned externals');
  assert.doesNotMatch(js,/chrome\.declarativeNetRequest|chrome\.permissions/);
  const ready=JSON.parse(receipt),sourceInputs=Object.keys(ready.sources||{});
  assert.ok(sourceInputs.includes('src/App.jsx')&&
    sourceInputs.includes('src/layout.css')&&sourceInputs.includes('vite.config.mjs'),
    'compiled receipt must fingerprint the actual React sources');
  for(const [file,digest] of Object.entries(inputsBefore))
    assert.equal(ready.sources[file]?.sha256,digest,'build receipt source drift: '+file);
  assert.equal(ready.buildId,sha256(Buffer.from(JSON.stringify({
    sources:ready.sources,files:ready.files}))));
  const inspected=await inspectSidebarToolProject(root);
  assert.equal(inspected.buildId,ready.buildId);
  const report={status:'COMPILED_NOT_INSTALLED',
    version:JSON.parse(await readFile(resolve(root,'tool.config.json'),'utf8')).version,
    buildId:ready.buildId,files:ready.files,sourceCount:sourceInputs.length};
  if(log)console.log(JSON.stringify(report));
  return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  await buildAdblockReact();
