import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createHash,webcrypto} from 'node:crypto';
import {inspectBrowserControllerESM,prepareBrowserControllerESM}
  from '../../src/libs/page-frameworks/controller-esm-linker-r4.mjs';
import {PAGE_BROWSER_COMPILER,PAGE_BROWSER_PRIVATE_FILES} from '../../src/libs/page-frameworks/contract.js';
import {createControllerESMSavedSource,readControllerESMAuthorSource,
  verifiedControllerESMAuthorSource} from '../../src/ui/controller-esm-source.js';

globalThis.crypto ||= webcrypto;
const sha=text=>createHash('sha256').update(text).digest('hex');
const row=(url,code)=>({url,code,sha256:sha(code),bytes:Buffer.byteLength(code)});
const frozenLock=rows=>({format:'opendesk.remote-lock.v1',modules:Object.fromEntries(
  rows.map(({url,sha256,bytes})=>[url,{sha256,bytes}]))});
const fixed=await readFile(PAGE_BROWSER_COMPILER.source);
assert.equal(fixed.length,PAGE_BROWSER_COMPILER.bytes);
assert.equal(sha(fixed),PAGE_BROWSER_COMPILER.sha256);
const context=vm.createContext({TextEncoder,TextDecoder});
vm.runInContext(fixed.toString('utf8'),context,{timeout:5000});
const Babel=context.Babel;
assert.equal(Babel.version,'7.29.9');
const root='https://cdn.example.org/npm/papaparse@5.5.3/index.mjs';
const child='https://cdn.example.org/npm/papaparse@5.5.3/csv.mjs';
// A tiny CSV module graph deliberately NOT named/claimed as real PapaParse.
// The real distribution needs a separate public HTTPS/native Chrome acceptance.
const first=row(root,"import {lines} from './csv.mjs'; export function parse(text){return {data:lines(text).slice(1).map(r=>({name:r[0],price:r[1]}))}};");
const second=row(child,"export const lines=text=>text.trim().split('\\n').map(s=>s.split(','));");
const raw=`// @opendesk-import papaparse ${root}\nimport {parse} from 'papaparse';\nexport default async function main(){const csv='name,price\\nBook,18\\nPen,3';const data=parse(csv).data;return {count:data.length,first:data[0],total:data.reduce((n,r)=>n+Number(r.price),0),url:await page.url()};}`;
const setup=(extra={})=>({componentSource:raw,projectId:'browser-controller',babel:Babel,...extra});

async function executeBuilt(code,page={url:async()=>"https://example.com/"},params={}){
  const safe=vm.createContext({});
  const fn=vm.runInContext('(async function(page,params){\n'+code+'\n;return await main();})',safe,{timeout:2000});
  return fn(page,params);
}

test('R4 browser Controller inspector reports every static URL without evaluating imported code',async()=>{
  const a=await inspectBrowserControllerESM(setup());
  assert.deepEqual(a.remoteRoots,[root]);assert.deepEqual(a.missingUrls,[root]);
  const b=await inspectBrowserControllerESM(setup({remoteModules:[first]}));
  assert.deepEqual(b.missingUrls,[child]);
  const c=await inspectBrowserControllerESM(setup({remoteModules:[first,second]}));
  assert.equal(c.complete,true);assert.equal(c.sourceHash,sha(raw));
  assert.deepEqual(c.modules.map(({url})=>url),[child,root].sort());
});

test('R4 controller fixed graph executes real imported functions in the lexical Worker entry',async()=>{
  const modules=[first,second],built=await prepareBrowserControllerESM(setup({
    remoteModules:modules,remoteLock:frozenLock(modules)}));
  assert.equal(built.authoringSourceHash,sha(raw));
  assert.equal(built.sourceHash,sha(built.sourceUtf8));
  assert.equal(built.framework,'controller');
  assert.ok(Buffer.byteLength(built.sourceUtf8)<48000);
  new vm.Script(built.sourceUtf8);
  const answer=await executeBuilt(built.sourceUtf8);
  assert.deepEqual(JSON.parse(JSON.stringify(answer)),{count:2,first:{name:'Book',price:'18'},total:21,url:'https://example.com/'});
  assert.doesNotMatch(built.sourceUtf8,/import\s*\(\s*['"]https:|@require/);
});

test('R4 truly executes the original pinned D3 3.2.4 ESM function, not a handwritten substitute',async()=>{
  const url='https://raw.githubusercontent.com/d3/d3-array/v3.2.4/src/max.js';
  const code=await readFile('examples/programs/page-ui-toc-react-direct/.opendesk/remote-cache/'+
    '691945a453633d9e204846af8ea4e299821b924f82b15eaf7906aba642979b1d.mjs','utf8');
  assert.equal(sha(code),'691945a453633d9e204846af8ea4e299821b924f82b15eaf7906aba642979b1d');
  const module=row(url,code);
  const author=`// @opendesk-import d3-array ${url}\nimport max from 'd3-array';\nexport default async function main(){return {number:max([2,9,4]),title:await page.title()}}`;
  const built=await prepareBrowserControllerESM(setup({componentSource:author,
    remoteModules:[module],remoteLock:frozenLock([module])}));
  const result=await executeBuilt(built.sourceUtf8,{title:async()=>'D3 real',url:async()=>''});
  assert.deepEqual(JSON.parse(JSON.stringify(result)),{number:9,title:'D3 real'});
});

test('R4 compiled classic Controller still has zero-argument lexical page/params',async()=>{
  const simple='export default async function main(){return {url:await page.url(),n:params.n}}';
  const built=await prepareBrowserControllerESM(setup({componentSource:simple}));
  const value=await executeBuilt(built.sourceUtf8,{url:async()=>"https://example.net/"},{n:17});
  assert.deepEqual(JSON.parse(JSON.stringify(value)),{url:'https://example.net/',n:17});
});

test('R4 missing graph, wrong fixed SHA, unknown exports, dynamic and bare imports all fail before Run',async()=>{
  const expected=frozenLock([first,second]);
  await assert.rejects(prepareBrowserControllerESM(setup()),{code:'E_REMOTE_UNLOCKED'});
  await assert.rejects(prepareBrowserControllerESM(setup({remoteModules:[first,second]})),{code:'E_REMOTE_LOCK'});
  await assert.rejects(prepareBrowserControllerESM(setup({remoteModules:[first,second],remoteLock:{...expected,modules:{[root]:expected.modules[root]}}})),{code:'E_REMOTE_LOCK'});
  await assert.rejects(inspectBrowserControllerESM(setup({remoteModules:[{...first,code:first.code+' '},second]})),{code:'E_REMOTE_HASH'});
  await assert.rejects(inspectBrowserControllerESM(setup({componentSource:"import {notFound} from 'https://cdn.example.org/a@1.0.0.mjs'; export default async function main(){}",remoteModules:[row('https://cdn.example.org/a@1.0.0.mjs','export const exists=1;')]})),{code:'E_REMOTE_EXPORT'});
  await assert.rejects(inspectBrowserControllerESM(setup({componentSource:"export default async function main(){return import('https://cdn.example.org/a@1.0.0.mjs')}"})),{code:'E_CONTROLLER_ESM_DYNAMIC'});
  await assert.rejects(inspectBrowserControllerESM(setup({componentSource:"import x from 'no-lock';export default async function main(){return x}"})),{code:'E_REMOTE_IMPORT'});
  await assert.rejects(inspectBrowserControllerESM(setup({componentSource:"import x from './some-local.js';export default async function main(){return x}"})),{code:'E_CONTROLLER_LOCAL_PROJECT'});
});

test('R4 saved Controller revision keeps author source while the immutable compiled bytecode runs offline',async()=>{
  const modules=[first,second],built=await prepareBrowserControllerESM(setup({remoteModules:modules,remoteLock:frozenLock(modules)}));
  const saved=await createControllerESMSavedSource({authorSourceUtf8:raw,programId:'csv.parser',built,
    lockId:'component-lock-'+'a'.repeat(64)});
  assert.ok(saved.startsWith('/* opendesk.controller-esm-authoring.v1 '));
  const restored=await verifiedControllerESMAuthorSource(saved);
  assert.equal(restored.authorSourceUtf8,raw);
  assert.equal(restored.compiledSourceUtf8,built.sourceUtf8);
  assert.equal(restored.programId,'csv.parser');
  const value=await executeBuilt(saved);
  assert.equal(value.total,21);
  await assert.rejects(verifiedControllerESMAuthorSource(saved.replace('return await __odESMEntry()', 'return __odESMEntry()')),{code:'E_CONTROLLER_ESM_HASH'});
  assert.equal(readControllerESMAuthorSource('async function main(){return 9;}'),null);
});

test('R4 dedicated compiler inputs are pinned Developer-only source data',async()=>{
  for(const name of ['controller-esm-linker-r4','page-compiler-worker']){
    const pkg=PAGE_BROWSER_PRIVATE_FILES.find(r=>r.id===name);
    assert.ok(pkg,name);
    const b=await readFile(pkg.source);
    assert.equal(b.length,pkg.bytes);
    assert.equal(sha(b),pkg.sha256);
  }
  const worker=await readFile('src/ui/page-component-compiler-worker.js','utf8');
  assert.match(worker,/import\('\.\.\/libs\/page-frameworks\/controller-esm-linker-r4\.mjs'\)/);
  assert.doesNotMatch(worker,/eval\s*\(|new\s+Function\s*\(/);
});
