"""One-shot, exact-source maintenance in an exclusive CI checkout, not runtime code.
The workflow tests the resulting tree before a non-force main update. This file
and its temporary workflow are removed from the candidate before compilation.
"""
from pathlib import Path
import json, os, re
changed = set()
def put(path, text):
    p=Path(path); p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding='utf-8'); changed.add(path)
def edit(path, old, new, count=1):
    text=Path(path).read_text(encoding='utf-8')
    if text.count(old)!=count:
        raise RuntimeError(f'Source drift: {path}: expected {count} occurrences of {old[:100]!r}, got {text.count(old)}')
    put(path,text.replace(old,new))

put('src/runtime/builtin-libraries/contract.js',r'''import {BUILTIN_ABI} from './catalog.js';
import {BUILTIN_CATALOG_SHA256,BUILTIN_CONTRACT_SHA256} from './integrity.js';

// This pin describes the reviewed npm bytes, finite API and execution adapters,
// not a website grant. Only framework authoring/admission creates a current pin.
export const BUILTIN_RUNTIME=Object.freeze({format:'opendesk.builtin-runtime.v1',
  abi:BUILTIN_ABI,catalogSha256:BUILTIN_CATALOG_SHA256,contractSha256:BUILTIN_CONTRACT_SHA256});
const keys=Object.keys(BUILTIN_RUNTIME),hex=/^[a-f0-9]{64}$/;
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
export function validateBuiltinRuntime(value) {
  if(!value||typeof value!=='object'||Array.isArray(value)||
    ![Object.prototype,null].includes(Object.getPrototypeOf(value))||
    Object.keys(value).length!==keys.length||!keys.every(key=>Object.hasOwn(value,key))||
    value.format!==BUILTIN_RUNTIME.format||typeof value.abi!=='string'||value.abi.length>160||
    !hex.test(value.catalogSha256)||!hex.test(value.contractSha256))
    fail('E_BUILTIN_CONTRACT','内置库版本合同缺失或损坏');
  return value;
}
export function assertBuiltinRuntime(value) {
  if(!value)fail('E_BUILTIN_VERSION_UNAVAILABLE','此旧版本没有固定内置库身份；请重新试运行并制作新版本，不自动重放');
  validateBuiltinRuntime(value);
  if(!keys.every(key=>value[key]===BUILTIN_RUNTIME[key]))
    fail('E_BUILTIN_VERSION_UNAVAILABLE','内置库或运行适配器已升级；请用当前扩展重新验证并制作新版本，不自动重放');
  return value;
}
''')

put('scripts/builtin-runtime-contract.mjs',r'''import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {BUILTIN_CATALOG} from '../src/runtime/builtin-libraries/catalog.js';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const lockPath='src/runtime/builtin-libraries/integrity.json';
const modulePath='src/runtime/builtin-libraries/integrity.js';
export async function builtinRuntimeInputs() {
  const root=JSON.parse(await readFile('package.json','utf8'));
  const lock=JSON.parse(await readFile('package-lock.json','utf8'));
  const inputs=[];
  async function add(path){const bytes=await readFile(path);inputs.push({path,bytes:bytes.length,sha256:hash(bytes)});}
  async function tree(path){for(const item of await readdir(path,{withFileTypes:true})){
    if(item.isSymbolicLink())throw Error('Symlink in reviewed built-in package: '+path+'/'+item.name);
    if(item.isDirectory())await tree(path+'/'+item.name);else if(item.isFile())await add(path+'/'+item.name);
  }}
  const sources=['src/runtime/builtin-libraries/catalog.js','src/runtime/builtin-libraries/core.js',
    'src/runtime/builtin-libraries/contract.js','src/runtime/builtin-libraries/loader.js',
    'src/scripting/sandbox/worker-runtime.js','src/scripting/user-scripts/execution-source.js',
    'src/scripting/user-scripts/preview.js','src/entrypoints/page-core.js','wxt.config.mjs'];
  for(const path of sources)await add(path);
  const packages=[],licenses=[];
  for(const lib of Object.values(BUILTIN_CATALOG.libraries)){
    const installed=JSON.parse(await readFile('node_modules/'+lib.npm+'/package.json','utf8'));
    const row=lock.packages?.['node_modules/'+lib.npm];
    if(root.dependencies?.[lib.npm]!==lib.version||lock.packages?.['']?.dependencies?.[lib.npm]!==lib.version||
      installed.version!==lib.version||row?.version!==lib.version||row.license!==lib.license||
      !/^sha512-[A-Za-z0-9+/]+=*$/.test(row.integrity)||!row.resolved.startsWith('https://registry.npmjs.org/'))
      throw Error('Pinned built-in npm metadata drift: '+lib.npm);
    packages.push({name:lib.npm,version:row.version,resolved:row.resolved,integrity:row.integrity});
    await tree('node_modules/'+lib.npm);
    const bytes=await readFile('node_modules/'+lib.npm+'/LICENSE');
    licenses.push({path:lib.licensePath,bytes:bytes.length,sha256:hash(bytes)});
  }
  inputs.sort((a,b)=>a.path.localeCompare(b.path,'en'));
  const catalogSha256=hash(JSON.stringify(BUILTIN_CATALOG));
  const identity={format:'opendesk.builtin-inputs.v1',catalogSha256,packages,inputs,licenses};
  return {...identity,contractSha256:hash(JSON.stringify(identity))};
}
export async function verifyBuiltinRuntimeInputs({write=false}={}) {
  const record=await builtinRuntimeInputs(),json=JSON.stringify(record,null,2)+'\n';
  const module='// Generated by scripts/builtin-runtime-contract.mjs --write; review and commit with runtime changes.\n'+
    'export const BUILTIN_CATALOG_SHA256='+JSON.stringify(record.catalogSha256)+';\n'+
    'export const BUILTIN_CONTRACT_SHA256='+JSON.stringify(record.contractSha256)+';\n'+
    'export const BUILTIN_LICENSES=Object.freeze('+JSON.stringify(record.licenses)+'.map(Object.freeze));\n';
  if(write){await writeFile(lockPath,json);await writeFile(modulePath,module);}
  else if(await readFile(lockPath,'utf8')!==json||await readFile(modulePath,'utf8')!==module)
    throw Error('Built-in runtime bytes changed. Audit the change, run node scripts/builtin-runtime-contract.mjs --write, commit the pin, and reverify old Tasks.');
  return record;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const row=await verifyBuiltinRuntimeInputs({write:process.argv.includes('--write')});
  console.log('BUILTIN_RUNTIME_INPUTS',JSON.stringify({status:'passed',files:row.inputs.length,contractSha256:row.contractSha256}));
}
''')

# Keep the current eight real upstream helpers and the captured AsyncBody contract.
edit('src/runtime/builtin-libraries/core.js',"import {BUILTIN_ABI,BUILTIN_CATALOG} from './catalog.js';", "import {BUILTIN_ABI,BUILTIN_CATALOG} from './catalog.js';\nimport {BUILTIN_RUNTIME} from './contract.js';")
edit('src/runtime/builtin-libraries/core.js','const installed=Object.freeze({abi:BUILTIN_ABI,lodash,dayjs,','const installed=Object.freeze({abi:BUILTIN_ABI,runtime:BUILTIN_RUNTIME,lodash,dayjs,')
edit('src/runtime/builtin-libraries/core.js',"const conflict=(key)=>", "// Each actual Worker/USER_SCRIPT realm gets its own module and immutable core.\nfor(const method of Object.values(lodash))Object.freeze(method);\nfor(const value of Object.values(dayjsCore.Ls.en))if(value&&typeof value==='object')Object.freeze(value);\nObject.freeze(dayjsCore.Ls.en);Object.freeze(dayjsCore.Ls);Object.freeze(dayjsCore.prototype);\nconst owned=new WeakMap();\nconst conflict=(key)=>")
edit('src/runtime/builtin-libraries/core.js',"if(previous.value?.abi===BUILTIN_ABI && Object.isFrozen(previous.value) &&", "if(owned.get(scope)===previous.value && previous.value===installed && Object.isFrozen(previous.value) &&")
edit('src/runtime/builtin-libraries/core.js',"  return installed;\n}","  owned.set(scope,installed);\n  return installed;\n}")

# A bounded extension-only reader: no CDN, broad origin, unbounded text or fallback.
put('src/runtime/builtin-libraries/loader.js',r'''import {digestUtf8} from '../../platform/protocol.js';
import {BUILTIN_ABI,BUILTIN_CATALOG} from './catalog.js';
import {BUILTIN_RUNTIME} from './contract.js';
const error=(code,message)=>Object.assign(new Error(message||code),{code});
const hex=/^[a-f0-9]{64}$/;
const fields=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&
  Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
async function packagedText(path,{runtime,fetchImpl},maxBytes) {
  if(typeof runtime?.getURL!=='function'||typeof fetchImpl!=='function')throw error('E_BUILTIN_RESOURCE','扩展内置库加载器不可用');
  let base,url;
  try{base=new URL(runtime.getURL(''));url=new URL(runtime.getURL(path));}catch{throw error('E_BUILTIN_RESOURCE','内置资源地址非法');}
  if(base.protocol!=='chrome-extension:'||!base.host||base.pathname!=='/'||base.search||base.hash||
    url.protocol!==base.protocol||url.host!==base.host||url.username||url.password||url.search||url.hash||
    url.pathname!=='/'+path||(runtime.id&&runtime.id!==base.host))
    throw error('E_BUILTIN_RESOURCE','内置库必须来自当前扩展的固定路径');
  const abort=new AbortController();let reader,timer;
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{
    abort.abort();reject(error('E_BUILTIN_TIMEOUT','扩展内置库读取超时；用户脚本未执行'));
  },8000);});
  try{return await Promise.race([timeout,(async()=>{
    const response=await fetchImpl(url.href,{cache:'no-store',credentials:'omit',redirect:'error',signal:abort.signal});
    if(!response?.ok||response.redirected||response.url&&response.url!==url.href||!response.body?.getReader)
      throw error('E_BUILTIN_RESOURCE','内置资源缺失、重定向或响应不可安全读取');
    reader=response.body.getReader();let size=0,text='';
    const decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
    for(;;){const part=await reader.read();if(part.done)break;
      size+=part.value.byteLength;if(size>maxBytes)throw error('E_BUILTIN_RESOURCE','内置资源超过固定大小上限');
      text+=decoder.decode(part.value,{stream:true});
    }
    text+=decoder.decode();if(!size)throw error('E_BUILTIN_RESOURCE','内置资源为空');return text;
  })()]);}catch(failure){if(failure?.code?.startsWith('E_BUILTIN_'))throw failure;
    throw error('E_BUILTIN_RESOURCE','内置资源读取或 UTF-8 解码失败；用户代码未执行');
  }finally{clearTimeout(timer);abort.abort();if(reader){try{await reader.cancel();}catch{}try{reader.releaseLock();}catch{}}}
}
export async function loadBuiltinPageSource({runtime=globalThis.chrome?.runtime,fetchImpl=globalThis.fetch}={}) {
  const provider={runtime,fetchImpl};let manifest;
  try{manifest=JSON.parse(await packagedText(BUILTIN_CATALOG.resourceManifest,provider,8192));}
  catch(failure){if(failure?.code)throw failure;throw error('E_BUILTIN_MANIFEST','内置库发布清单不是 JSON');}
  const paths=[BUILTIN_CATALOG.pageCore,BUILTIN_CATALOG.libraries.lodash.licensePath,BUILTIN_CATALOG.libraries.dayjs.licensePath];
  if(!fields(manifest,['format','abi','catalogSha256','runtimeSha256','resources'])||
    manifest.format!=='opendesk.builtin-resources.v1'||manifest.abi!==BUILTIN_ABI||
    manifest.catalogSha256!==BUILTIN_RUNTIME.catalogSha256||manifest.runtimeSha256!==BUILTIN_RUNTIME.contractSha256||
    !Array.isArray(manifest.resources)||manifest.resources.length!==paths.length||
    manifest.resources.some((row,i)=>!fields(row,['path','bytes','sha256'])||row.path!==paths[i]||
      !Number.isSafeInteger(row.bytes)||row.bytes<=0||row.bytes>512*1024||!hex.test(row.sha256)))
    throw error('E_BUILTIN_VERSION_UNAVAILABLE','内置库目录、运行时或发布清单不一致，请完整更新扩展');
  const code=await packagedText(BUILTIN_CATALOG.pageCore,provider,512*1024),row=manifest.resources[0];
  if(new TextEncoder().encode(code).byteLength!==row.bytes||await digestUtf8(code)!==row.sha256)
    throw error('E_BUILTIN_HASH','内置库固定脚本哈希错误，用户代码未执行');
  return Object.freeze({code,sha256:row.sha256,catalogSha256:manifest.catalogSha256,
    runtimeSha256:manifest.runtimeSha256,abi:BUILTIN_ABI});
}
''')

edit('scripts/verify-package.mjs',"import {BUILTIN_CATALOG} from '../src/runtime/builtin-libraries/catalog.js';", "import {BUILTIN_CATALOG} from '../src/runtime/builtin-libraries/catalog.js';\nimport {BUILTIN_RUNTIME} from '../src/runtime/builtin-libraries/contract.js';\nimport {BUILTIN_LICENSES} from '../src/runtime/builtin-libraries/integrity.js';")
edit('scripts/verify-package.mjs',"catalogSha256:digest(Buffer.from(JSON.stringify(BUILTIN_CATALOG))),resources};", "catalogSha256:digest(Buffer.from(JSON.stringify(BUILTIN_CATALOG))),runtimeSha256:BUILTIN_RUNTIME.contractSha256,resources};")
edit('scripts/verify-package.mjs',"  for(const license of generated.resources.slice(1))if(license.bytes<50||license.bytes>8192)\n    throw new Error('Built-in npm license notice missing or oversized: '+license.path);", "  if(!same(generated.resources.slice(1),BUILTIN_LICENSES))\n    throw new Error('Built-in npm license bytes differ from the reviewed source lock');")
edit('scripts/check-source.mjs',"import {execFileSync} from 'node:child_process';", "import {execFileSync} from 'node:child_process';\nimport {verifyBuiltinRuntimeInputs} from './builtin-runtime-contract.mjs';\nawait verifyBuiltinRuntimeInputs();")
edit('scripts/prepare-public.mjs',"import {SANDBOX_HTML} from './verify-package.mjs';", "import {SANDBOX_HTML} from './verify-package.mjs';\nimport {verifyBuiltinRuntimeInputs} from './builtin-runtime-contract.mjs';")
edit('scripts/prepare-public.mjs',"  'src/vendor/jquery-3.7.1.LICENSE.txt':'licenses/jquery-MIT.txt'", "  'src/vendor/jquery-3.7.1.LICENSE.txt':'licenses/jquery-MIT.txt',\n  'node_modules/lodash-es/LICENSE':'licenses/lodash-es-MIT.txt',\n  'node_modules/dayjs/LICENSE':'licenses/dayjs-MIT.txt'")
edit('scripts/prepare-public.mjs',"export async function preparePublic() {", "export async function preparePublic() {\nawait verifyBuiltinRuntimeInputs();")
edit('scripts/wxt-development.mjs',"import {createSdkResourceManifest,SDK_RESOURCE_MANIFEST} from './verify-package.mjs';", "import {createSdkResourceManifest,SDK_RESOURCE_MANIFEST,createBuiltinResourceManifest,BUILTIN_RESOURCE_MANIFEST} from './verify-package.mjs';")
edit('scripts/wxt-development.mjs',"  paths.push(SDK_RESOURCE_MANIFEST);", "  await writeFile(resolve(wxt.config.outDir,BUILTIN_RESOURCE_MANIFEST),JSON.stringify(await createBuiltinResourceManifest(wxt.config.outDir),null,2)+'\\n');\n  paths.push(SDK_RESOURCE_MANIFEST,BUILTIN_RESOURCE_MANIFEST);\n  paths.sort();")

# The current framework pin is separate from the unchanged user source SHA.
edit('src/platform/tasks/contract.js',"import {BUDGETS, canonical, digest, digestUtf8, invariant} from '../protocol.js';", "import {BUDGETS, canonical, digest, digestUtf8, invariant} from '../protocol.js';\nimport {BUILTIN_RUNTIME,validateBuiltinRuntime,assertBuiltinRuntime} from '../../runtime/builtin-libraries/contract.js';")
edit('src/platform/tasks/contract.js',"    'permissions','entryFormat','program','paramsSchema']);", "    'permissions','entryFormat','program','paramsSchema','builtinRuntime'],\n    ['format','taskId','version','title','description','author','source','siteOrigins','permissions','entryFormat','program','paramsSchema']);\n  if(Object.hasOwn(manifest,'builtinRuntime'))validateBuiltinRuntime(manifest.builtinRuntime);")
edit('src/platform/tasks/contract.js',"export async function createTaskPackage(manifest, sourceUtf8) {\n  validateTaskManifest(manifest);", "export async function createTaskPackage(manifest, sourceUtf8) {\n  manifest={...manifest,...(!Object.hasOwn(manifest,'builtinRuntime')?{builtinRuntime:BUILTIN_RUNTIME}:{})};\n  validateTaskManifest(manifest);\n  assertBuiltinRuntime(manifest.builtinRuntime);")
edit('src/platform/tasks/service.js',"import {canonical, digest, invariant} from '../protocol.js';", "import {canonical, digest, invariant} from '../protocol.js';\nimport {assertBuiltinRuntime} from '../../runtime/builtin-libraries/contract.js';")
edit('src/platform/tasks/service.js',"  await verifyTaskPackage(candidate.package);", "  await verifyTaskPackage(candidate.package);\n  assertBuiltinRuntime(candidate.package.manifest.builtinRuntime);\n  assertBuiltinRuntime(candidate.verification?.builtinRuntime);")
edit('src/platform/tasks/service.js',"      await verifyTaskPackage(row.package);\n      if (row.stage!=='candidate') return detail(row);", "      await verifyTaskPackage(row.package);\n      assertBuiltinRuntime(row.package.manifest.builtinRuntime);\n      if (row.stage!=='candidate') {assertBuiltinRuntime(row.verification?.builtinRuntime);return detail(row);}")
edit('src/platform/tasks/service.js',"      // A settled run alone is not formal verification.", "      assertBuiltinRuntime(run.builtinRuntime);\n      // A settled run alone is not formal verification.")
edit('src/platform/tasks/service.js',"      row.verification={runId:run.runId,resultId:result.resultId,sourceHash:hash,", "      row.verification={runId:run.runId,resultId:result.resultId,sourceHash:hash,builtinRuntime:structuredClone(run.builtinRuntime),")
edit('src/platform/tasks/service.js',"      await verifyTaskPackage(row.package);\n      invariant(row.package.manifestHash===request.manifestHash", "      await verifyTaskPackage(row.package);\n      assertBuiltinRuntime(row.package.manifest.builtinRuntime);assertBuiltinRuntime(row.verification?.builtinRuntime);\n      invariant(row.package.manifestHash===request.manifestHash")
edit('src/platform/tasks/service.js',"      const pkg=await verifyTaskPackage(candidate.package);\n      invariant(candidate.stage", "      const pkg=await verifyTaskPackage(candidate.package);\n      assertBuiltinRuntime(pkg.manifest.builtinRuntime);\n      if(candidate.verification)assertBuiltinRuntime(candidate.verification.builtinRuntime);\n      invariant(candidate.stage")
edit('src/platform/host/controller-methods.js',"import {assertInstalledTask,assertRunTaskAuthorization} from '../tasks/service.js';", "import {assertInstalledTask,assertRunTaskAuthorization} from '../tasks/service.js';\nimport {BUILTIN_RUNTIME,assertBuiltinRuntime} from '../../runtime/builtin-libraries/contract.js';")
edit('src/platform/host/controller-methods.js',"    if (active) {\n      checkFence(run);", "    if (active) {\n      assertBuiltinRuntime(run.builtinRuntime);\n      checkFence(run);")
edit('src/platform/host/controller-methods.js',"      'scriptId', 'contentHash', 'sourceKind'].filter", "      'scriptId', 'contentHash', 'sourceKind', 'builtinRuntime'].filter")
edit('src/platform/host/controller-methods.js',"      const run = {tag: 'controller-run', runId, namespace:", "      const run = {tag: 'controller-run', builtinRuntime:BUILTIN_RUNTIME, runId, namespace:")

# Page Candidate hashes include the pin; importing old metadata stays inspectable,
# but verification/installation/execution can never silently assign today's pin.
edit('src/scripting/user-scripts/page-program-contract.js',"import {canonical,digest,digestUtf8,invariant} from '../../platform/protocol.js';", "import {canonical,digest,digestUtf8,invariant} from '../../platform/protocol.js';\nimport {BUILTIN_RUNTIME,validateBuiltinRuntime,assertBuiltinRuntime} from '../../runtime/builtin-libraries/contract.js';")
edit('src/scripting/user-scripts/page-program-contract.js',"    'dependencyLockId','dependencyManifestDigest','pageRules']);", "    'dependencyLockId','dependencyManifestDigest','pageRules',...(Object.hasOwn(value,'builtinRuntime')?['builtinRuntime']:[])]);\n  if(Object.hasOwn(value,'builtinRuntime'))validateBuiltinRuntime(value.builtinRuntime);")
edit('src/scripting/user-scripts/page-program-contract.js',"  return validatePageProgramManifest({format:PAGE_PROGRAM_FORMAT,runtimeKind:PAGE_PROGRAM_RUNTIME,", "  return validatePageProgramManifest({format:PAGE_PROGRAM_FORMAT,runtimeKind:PAGE_PROGRAM_RUNTIME,builtinRuntime:BUILTIN_RUNTIME,")
edit('src/scripting/user-scripts/page-program-contract.js',"  resolvePageProgramRules(parsed,admission,checked.pageRules);\n  return checked;", "  resolvePageProgramRules(parsed,admission,checked.pageRules);\n  assertBuiltinRuntime(checked.builtinRuntime);\n  return checked;")
edit('src/scripting/user-scripts/installed-programs.js',"import {PAGE_WORLD_CSP} from './execution-source.js';", "import {PAGE_WORLD_CSP} from './execution-source.js';\nimport {assertBuiltinRuntime} from '../../runtime/builtin-libraries/contract.js';")
edit('src/scripting/user-scripts/installed-programs.js',"  async function proofFor(candidate,{available=false}={}){", "  async function proofFor(candidate,{available=false}={}){\n    assertBuiltinRuntime(candidate.manifest.builtinRuntime);")
edit('src/scripting/user-scripts/installed-programs.js',"    invariant(!available||proof.status==='Available'", "    assertBuiltinRuntime(proof.receipt.builtinRuntime);\n    invariant(!available||proof.status==='Available'")
edit('src/scripting/user-scripts/installed-programs.js',"    const m=candidate.manifest;\n    const existing=", "    const m=candidate.manifest;\n    assertBuiltinRuntime(m.builtinRuntime);\n    const existing=")

# Bind the prelude's installed identity, not just a public version label.
edit('src/scripting/user-scripts/execution-source.js',"import {BUILTIN_ABI} from '../../runtime/builtin-libraries/catalog.js';", "import {BUILTIN_ABI} from '../../runtime/builtin-libraries/catalog.js';\nimport {BUILTIN_RUNTIME} from '../../runtime/builtin-libraries/contract.js';")
edit('src/scripting/user-scripts/execution-source.js',"      await sha256Utf8(builtinSource.code)===builtinSource.sha256,", "      builtinSource.runtimeSha256===BUILTIN_RUNTIME.contractSha256 &&\n      builtinSource.catalogSha256===BUILTIN_RUNTIME.catalogSha256 &&\n      await sha256Utf8(builtinSource.code)===builtinSource.sha256,")
edit('src/scripting/user-scripts/execution-source.js',"      \"||globalThis._!==globalThis.OpenDeskLibs.lodash", "      \"||globalThis.OpenDeskLibs?.runtime?.contractSha256!==\"+JSON.stringify(BUILTIN_RUNTIME.contractSha256)+\n      \"||globalThis._!==globalThis.OpenDeskLibs.lodash")
edit('src/scripting/user-scripts/execution-source.js',"...(builtinSource?{builtinAbi:BUILTIN_ABI", "...(builtinSource?{builtinRuntime:BUILTIN_RUNTIME,builtinAbi:BUILTIN_ABI")
edit('src/scripting/user-scripts/preview.js',"import {BUILTIN_ABI} from '../../runtime/builtin-libraries/catalog.js';", "import {BUILTIN_ABI} from '../../runtime/builtin-libraries/catalog.js';\nimport {BUILTIN_RUNTIME,assertBuiltinRuntime} from '../../runtime/builtin-libraries/contract.js';")
edit('src/scripting/user-scripts/preview.js',"...(builtinSource?{builtinAbi:BUILTIN_ABI", "...(builtinSource?{builtinRuntime:BUILTIN_RUNTIME,builtinAbi:BUILTIN_ABI")
edit('src/scripting/user-scripts/preview.js',"      builtinAbi:script.builtinAbi,builtinCatalogSha256:script.builtinCatalogSha256,", "      builtinRuntime:script.builtinRuntime,builtinAbi:script.builtinAbi,builtinCatalogSha256:script.builtinCatalogSha256,",2)
edit('src/scripting/user-scripts/preview.js',"    const t=freezeTarget(target);\n    active=true;", "    const t=freezeTarget(target);\n    assertBuiltinRuntime(candidate.manifest.builtinRuntime);\n    active=true;")

# Update only explicit Node doubles; these remain labeled component evidence.
put('tests/environment/builtin-support.mjs',r'''// Node-only prelude double for authority tests; never native/package evidence.
import {createHash} from 'node:crypto';
import {BUILTIN_RUNTIME} from '../../src/runtime/builtin-libraries/contract.js';
const code='globalThis.OpenDeskLibs={abi:'+JSON.stringify(BUILTIN_RUNTIME.abi)+
  ',runtime:'+JSON.stringify(BUILTIN_RUNTIME)+',lodash:{trim:x=>String(x).trim()},dayjs:()=>{}};'+
  'globalThis._=globalThis.OpenDeskLibs.lodash;globalThis.dayjs=globalThis.OpenDeskLibs.dayjs;';
export const fakeBuiltinSource=Object.freeze({code,sha256:createHash('sha256').update(code).digest('hex'),
  catalogSha256:BUILTIN_RUNTIME.catalogSha256,runtimeSha256:BUILTIN_RUNTIME.contractSha256,abi:BUILTIN_RUNTIME.abi});
export async function loadFakeBuiltin(){return fakeBuiltinSource;}
''')
edit('tests/environment/task-package-flow.test.mjs',"import test from 'node:test';", "import test from 'node:test';\nimport {BUILTIN_RUNTIME} from '../../src/runtime/builtin-libraries/contract.js';")
edit('tests/environment/task-package-flow.test.mjs',"  const run={tag:'controller-run',runId", "  const run={tag:'controller-run',builtinRuntime:BUILTIN_RUNTIME,runId")
edit('tests/environment/page-installed-programs.test.mjs',"import {loadFakeBuiltin} from './builtin-support.mjs';", "import {loadFakeBuiltin} from './builtin-support.mjs';\nimport {BUILTIN_RUNTIME} from '../../src/runtime/builtin-libraries/contract.js';")
edit('tests/environment/page-installed-programs.test.mjs',"return {state:'preview-evaluated',world:'USER_SCRIPT'", "return {state:'preview-evaluated',builtinRuntime:BUILTIN_RUNTIME,world:'USER_SCRIPT'")
edit('tests/environment/builtin-libraries.test.mjs',"import {BUILTIN_ABI,BUILTIN_CATALOG} from '../../src/runtime/builtin-libraries/catalog.js';", "import {BUILTIN_ABI,BUILTIN_CATALOG} from '../../src/runtime/builtin-libraries/catalog.js';\nimport {BUILTIN_RUNTIME} from '../../src/runtime/builtin-libraries/contract.js';")
edit('tests/environment/builtin-libraries.test.mjs',"catalogSha256:catalogHash,resources};", "catalogSha256:catalogHash,runtimeSha256:BUILTIN_RUNTIME.contractSha256,resources};")
edit('tests/environment/builtin-libraries.test.mjs',"return cases.has(path)?{ok:true,text:async()=>cases.get(path),url}: {ok:false};", "if(!cases.has(path))return {ok:false};const response=new Response(cases.get(path));Object.defineProperty(response,'url',{value:url});return response;")

put('tests/environment/builtin-runtime-identity.test.mjs',r'''import test from 'node:test';
import assert from 'node:assert/strict';
import {BUILTIN_RUNTIME,assertBuiltinRuntime,validateBuiltinRuntime} from '../../src/runtime/builtin-libraries/contract.js';
import {digest,digestUtf8} from '../../src/platform/protocol.js';
import {createTaskPackage,verifyTaskPackage,TASK_MANIFEST_FORMAT} from '../../src/platform/tasks/contract.js';
import {verifyBuiltinRuntimeInputs} from '../../scripts/builtin-runtime-contract.mjs';
import {installBuiltinLibraries} from '../../src/runtime/builtin-libraries/core.js';

test('reviewed npm file closure and source adapters match the committed runtime pin',async()=>{
  const record=await verifyBuiltinRuntimeInputs();
  assert.equal(record.contractSha256,BUILTIN_RUNTIME.contractSha256);
  assert.equal(record.catalogSha256,BUILTIN_RUNTIME.catalogSha256);
  assert.ok(record.inputs.some(row=>row.path==='node_modules/lodash-es/get.js'));
  assert.equal(record.licenses.length,2);
});
test('missing, stale, additional and malformed immutable runtime pins cannot run',()=>{
  assert.strictEqual(assertBuiltinRuntime(BUILTIN_RUNTIME),BUILTIN_RUNTIME);
  for(const pin of [undefined,{...BUILTIN_RUNTIME,contractSha256:'0'.repeat(64)},
    {...BUILTIN_RUNTIME,catalogSha256:'0'.repeat(64)},{...BUILTIN_RUNTIME,abi:'old'}])
    assert.throws(()=>assertBuiltinRuntime(pin),error=>error.code==='E_BUILTIN_VERSION_UNAVAILABLE');
  assert.throws(()=>validateBuiltinRuntime({...BUILTIN_RUNTIME,approved:true}),error=>error.code==='E_BUILTIN_CONTRACT');
});
test('Task authoring fixes runtime identity without changing raw user source; old packages remain inspectable only',async()=>{
  const sourceUtf8='async function main(){return {title:await page.title(),value:_.trim(" ok "),day:dayjs().format("YYYY-MM-DD")};}';
  const manifest={format:TASK_MANIFEST_FORMAT,taskId:'builtin.test',version:'1.0.0',title:'内置库',description:'内置库测试',
    author:'test',source:'test',siteOrigins:['https://example.com'],permissions:['page.automation'],entryFormat:'async-main',
    program:{revision:1,sourceHash:await digestUtf8(sourceUtf8)},paramsSchema:{type:'object',properties:{},required:[],additionalProperties:false}};
  const pkg=await createTaskPackage(manifest,sourceUtf8);
  assert.deepEqual(pkg.manifest.builtinRuntime,BUILTIN_RUNTIME);assert.equal(pkg.sourceUtf8,sourceUtf8);
  assert.equal(pkg.manifest.program.sourceHash,manifest.program.sourceHash);
  assert.equal(manifest.builtinRuntime,undefined,'authoring does not mutate caller metadata');
  const legacy={...pkg,manifest,manifestHash:await digest(manifest)};
  assert.equal((await verifyTaskPackage(legacy)).manifest.builtinRuntime,undefined,'importing never auto-approves an old runtime');
  assert.throws(()=>assertBuiltinRuntime(legacy.manifest.builtinRuntime),error=>error.code==='E_BUILTIN_VERSION_UNAVAILABLE');
  await assert.rejects(verifyTaskPackage({...pkg,manifest:{...pkg.manifest,builtinRuntime:{...BUILTIN_RUNTIME,contractSha256:'0'.repeat(64)}}}),error=>error.code==='E_HASH');
});
test('spoofed read-only globals with the correct public ABI are not mistaken for owned libraries',()=>{
  const scope={},fake=Object.freeze({abi:BUILTIN_RUNTIME.abi,lodash:Object.freeze({}),dayjs:Object.freeze(()=>{})});
  Object.defineProperties(scope,{OpenDeskLibs:{value:fake},_:{value:fake.lodash},dayjs:{value:fake.dayjs}});
  assert.throws(()=>installBuiltinLibraries(scope),error=>error.code==='E_BUILTIN_COLLISION');
});
test('built-in date prototypes and English locale cannot be changed through an instance',()=>{
  const scope={};installBuiltinLibraries(scope);const date=scope.dayjs('2026-10-10');
  assert.ok(Object.isFrozen(Object.getPrototypeOf(date)));
  assert.ok(Object.isFrozen(date.$locale()));assert.ok(Object.isFrozen(date.$locale().months));
  assert.equal(date.format('YYYY-MM-DD'),'2026-10-10');
});
''')

put('tests/environment/builtin-development.test.mjs',r'''import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {publishDevelopment} from '../../scripts/wxt-development.mjs';
import {BUILTIN_CATALOG} from '../../src/runtime/builtin-libraries/catalog.js';
import {BUILTIN_RUNTIME} from '../../src/runtime/builtin-libraries/contract.js';
const hash=value=>createHash('sha256').update(value).digest('hex');
// Publication contract only: intentionally synthetic assets are not Chrome evidence.
test('hot development publication includes the exact builtin manifest and changed core bytes',async t=>{
  const root=await mkdtemp(join(tmpdir(),'opendesk-builtin-dev-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const paths=['manifest.json','framework/sdk-main.js','agents/page-relay.js',BUILTIN_CATALOG.pageCore,
    BUILTIN_CATALOG.libraries.lodash.licensePath,BUILTIN_CATALOG.libraries.dayjs.licensePath];
  for(const path of paths){await mkdir(dirname(join(root,path)),{recursive:true});await writeFile(join(root,path),'fixture '+path);}
  const wxt={config:{outDir:root},logger:{info(){}}},output={publicAssets:paths.map(fileName=>({fileName})),steps:[]};
  await publishDevelopment(wxt,output);
  const first=JSON.parse(await readFile(join(root,'development-update.json'),'utf8'));
  const manifest=JSON.parse(await readFile(join(root,BUILTIN_CATALOG.resourceManifest),'utf8'));
  assert.equal(manifest.runtimeSha256,BUILTIN_RUNTIME.contractSha256);
  assert.equal(first.files[BUILTIN_CATALOG.resourceManifest],hash(await readFile(join(root,BUILTIN_CATALOG.resourceManifest))));
  await writeFile(join(root,BUILTIN_CATALOG.pageCore),'changed core fixture');await publishDevelopment(wxt,output);
  const next=JSON.parse(await readFile(join(root,'development-update.json'),'utf8'));
  assert.notEqual(next.revision,first.revision);
  assert.notEqual(next.files[BUILTIN_CATALOG.resourceManifest],first.files[BUILTIN_CATALOG.resourceManifest]);
  await rm(join(root,BUILTIN_CATALOG.pageCore));
  await assert.rejects(publishDevelopment(wxt,output));
  assert.equal((await readFile(join(root,'development-update.json'),'utf8')),JSON.stringify(next));
});
''')

# The generation step is explicit and verified; generated files are committed
# together with the audited sources, never silently changed by a build.
changed.update(['src/runtime/builtin-libraries/integrity.js','src/runtime/builtin-libraries/integrity.json'])
for path in ['.github/r15-runtime-close.py','.github/workflows/r15-runtime-close.yml']:
    Path(path).unlink();changed.add(path)
Path(os.environ['RUNNER_TEMP'],'r15-paths.json').write_text(json.dumps(sorted(changed)))
Path(os.environ['RUNNER_TEMP'],'r15-publish.py').write_text(r'''from pathlib import Path
import base64,json,os,urllib.request
repo=os.environ['GITHUB_REPOSITORY'];root='https://api.github.com/repos/'+repo
base=Path(os.environ['RUNNER_TEMP'],'r15-base-sha').read_text().strip()
token=os.environ['GH_TOKEN']
def api(method,path,data=None):
  body=None if data is None else json.dumps(data).encode()
  request=urllib.request.Request(root+path,data=body,method=method,headers={'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'})
  with urllib.request.urlopen(request,timeout=30) as response:return json.load(response)
head=api('GET','/git/ref/heads/main')['object']['sha']
if head!=base:raise SystemExit('E_MAIN_ADVANCED: tested parent '+base+' is not current '+head+'; no ref updated')
paths=json.loads(Path(os.environ['RUNNER_TEMP'],'r15-paths.json').read_text())
entries=[]
for path in paths:
  if not path.startswith(('src/','scripts/','tests/environment/','.github/r15-','.github/workflows/r15-')):raise SystemExit('Unexpected write path '+path)
  p=Path(path)
  if not p.exists():entries.append({'path':path,'mode':'100644','type':'blob','sha':None});continue
  blob=api('POST','/git/blobs',{'encoding':'base64','content':base64.b64encode(p.read_bytes()).decode()})
  entries.append({'path':path,'mode':'100644','type':'blob','sha':blob['sha']})
parent=api('GET','/git/commits/'+base)
tree=api('POST','/git/trees',{'base_tree':parent['tree']['sha'],'tree':entries})
commit=api('POST','/git/commits',{'message':'fix(r15): pin reviewed builtin runtime, harden package loading and complete hot development resources','tree':tree['sha'],'parents':[base]})
if api('GET','/git/ref/heads/main')['object']['sha']!=base:raise SystemExit('E_MAIN_ADVANCED before publication; no ref updated; tested commit '+commit['sha'])
api('PATCH','/git/refs/heads/main',{'sha':commit['sha'],'force':False})
record={'status':'integrated','baseSha':base,'commitSha':commit['sha'],'treeSha':tree['sha'],'paths':paths,'runId':os.environ['GITHUB_RUN_ID'],'nativeChrome':'NOT_TESTED'}
evidence=Path(os.environ['RUNNER_TEMP'],'r15-evidence');evidence.mkdir(exist_ok=True)
(evidence/'integration.json').write_text(json.dumps(record,indent=2)+'\n')
print('R15_MAIN_INTEGRATED',json.dumps(record))
''')
print('R15_CANDIDATE_CHANGED',json.dumps(sorted(changed)))
