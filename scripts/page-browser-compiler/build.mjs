// Maintainer-only review of an OPTIONAL compiler, not a Page runtime or
// a replacement for OpenDesk's original authorization / USER_SCRIPT executor.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve('scripts/page-browser-compiler');
const vendor=join(root,'node_modules/esbuild-wasm');
const pkg=JSON.parse(await readFile(join(vendor,'package.json'),'utf8'));
if(pkg.name!=='esbuild-wasm'||pkg.version!=='0.28.2'||pkg.license!=='MIT')
  throw Error('E_BROWSER_COMPILER_PROVENANCE');
const lock=JSON.parse(await readFile(join(root,'package-lock.json'),'utf8'));
const pinned=lock.packages?.['node_modules/esbuild-wasm'];
if(pinned?.version!=='0.28.2'||!/^https:\/\//.test(pinned.resolved||'')||
  !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(pinned.integrity||''))
  throw Error('E_BROWSER_COMPILER_LOCK');
const filenames=['esm/browser.min.js','esbuild.wasm'];
const out=resolve('artifacts/r243-browser-compiler-review');
await mkdir(out,{recursive:true});
const manifest=[];
for(const name of filenames){
  const bytes=await readFile(join(vendor,name));
  if(bytes.length<1024||bytes.length>24*1024*1024)
    throw Error('E_BROWSER_COMPILER_RESOURCE_BUDGET: '+name);
  manifest.push({file:name,bytes:bytes.length,
    sha256:createHash('sha256').update(bytes).digest('hex')});
  await writeFile(join(out,name.split('/').at(-1)),bytes);
}
let license;
for(const name of ['LICENSE.md','LICENSE','LICENSE.txt']){
  try{license=await readFile(join(vendor,name));break;}
  catch(error){if(error.code!=='ENOENT')throw error;}
}
if(!license||!license.toString('utf8').includes('Permission is hereby granted'))
  throw Error('E_BROWSER_COMPILER_LICENSE');
await writeFile(join(out,'LICENSE.txt'),license);
const report={phase:'QUALIFICATION_ONLY_NOT_PUBLISHED',name:pkg.name,version:pkg.version,
  source:pinned.resolved,integrity:pinned.integrity,license:'MIT',
  licenseSha256:createHash('sha256').update(license).digest('hex'),
  resources:manifest};
console.log('R243_WASM_COMPILER_META '+JSON.stringify(report));
if(process.argv.includes('--emit-lock-base64')){
  const lockBytes=await readFile(join(root,'package-lock.json'));
  const b64=lockBytes.toString('base64');
  console.log('R243_WASM_LOCK_START');
  for(let n=0;n<b64.length;n+=4096)console.log('R243_WASM_LOCK_PART '+b64.slice(n,n+4096));
  console.log('R243_WASM_LOCK_END');
}
