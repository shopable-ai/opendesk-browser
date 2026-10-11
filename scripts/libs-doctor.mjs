// Read-only source/package diagnosis. Static checks are never native Chrome proof.
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {BUILTIN_CATALOG,BUILTIN_RUNTIME_CATALOG,BUILTIN_RESOURCE_PATHS} from '../src/libs/catalog.js';
import {PAGE_FRAMEWORK_RUNTIMES} from '../src/libs/page-frameworks/contract.js';
import {BUILD_POLICY} from './build-contract.mjs';
import {inspectHistoricalLibraryUsage} from './libs-history-audit.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function maybe(path) {
  try{return await readFile(path);}
  catch(error){if(error?.code==='ENOENT')return null;throw error;}
}
const result=(status,detail)=>({status,...(detail?{detail}: {})});

// This does not attest to native execution. It only rejects foreign/missing
// files in the packaged libs/ tree, including source maps in the wrong mode.
// All paths come from the existing library contract and approved WXT entries.
export async function inspectLibraryOutputInventory(root,mode){
  if(!['production','development'].includes(mode))throw Error('Invalid library build mode: '+mode);
  const approved=new Set([
    ...BUILTIN_RESOURCE_PATHS.filter(path=>path.startsWith('libs/')),
    ...Object.values(PAGE_FRAMEWORK_RUNTIMES).map(row=>row.output),
    BUILTIN_CATALOG.resourceManifest
  ]);
  if(mode==='development'){
    approved.add(BUILTIN_CATALOG.pageCore+'.map');
    for(const row of Object.values(BUILTIN_CATALOG.libraries))
      if(row.origin==='npm')approved.add(row.output+'.map');
  }
  const discovered=[];
  async function walk(directory,prefix){
    for(const item of await readdir(directory,{withFileTypes:true})){
      const path=prefix+'/'+item.name,absolute=join(directory,item.name);
      if(item.isSymbolicLink())throw Error('Library output symlink forbidden: '+path);
      if(item.isDirectory())await walk(absolute,path);
      else if(item.isFile())discovered.push(path);
      else throw Error('Non-file library output forbidden: '+path);
    }
  }
  await walk(join(root,'libs'),'libs');
  const present=new Set(discovered);
  const extra=discovered.filter(path=>!approved.has(path));
  const missing=[...approved].filter(path=>!present.has(path));
  if(extra.length||missing.length)
    throw Error('Unregistered/missing library output in '+mode+
      ': extra='+JSON.stringify(extra.sort())+', missing='+JSON.stringify(missing.sort()));
  return discovered.sort();
}

export function verifyShippedSwBudget(mode,bytes){
  if(!['production','development'].includes(mode)||!Number.isSafeInteger(bytes)||bytes<1)
    throw Error('Invalid Service Worker mode or byte count');
  const limit=mode==='production'?
    BUILD_POLICY.serviceWorkerProductionBytes:BUILD_POLICY.developmentBytes;
  if(bytes>limit)throw Error('Service Worker exceeds '+mode+' byte budget: '+bytes+' > '+limit);
  return Object.freeze({bytes,budgetBytes:limit});
}

const OLD_JQUERY_REFERENCE=/vendor\/jquery-3\.7\.1(?:\.min\.js|\.LICENSE\.txt)/;
async function scanLegacyConsumers(cwd) {
  // Scan the actual extension, build code and live tests, never historical
  // snapshots/docs nor the old vendor file itself. No automated deletion.
  const matches=[];
  async function scan(dir,relativePath) {
    let entries;
    try{entries=await readdir(dir,{withFileTypes:true});}
    catch(error){if(error?.code==='ENOENT')return;throw error;}
    for(const entry of entries) {
      const rel=relativePath?relativePath+'/'+entry.name:entry.name;
      if(entry.isSymbolicLink())throw Error('Symlink in source scan: '+rel);
      if(entry.isDirectory()){await scan(join(dir,entry.name),rel);continue;}
      if(!entry.isFile()||!/\.(?:js|mjs|ts|json|html)$/.test(entry.name)||
         rel==='scripts/libs-doctor.mjs' || rel.startsWith('src/vendor/'))continue;
      const bytes=await readFile(join(dir,entry.name));
      if(OLD_JQUERY_REFERENCE.test(bytes.toString('utf8')))matches.push(rel);
    }
  }
  for(const root of ['src','scripts','tests/environment','tests/framework'])
    await scan(join(cwd,root),root);
  for(const name of ['wxt.config.mjs','package.json','manifest.json']){
    const file=await maybe(join(cwd,name));
    if(file&&OLD_JQUERY_REFERENCE.test(file.toString('utf8')))matches.push(name);
  }
  return matches.sort();
}


export async function inspectLibraries({cwd=process.cwd()}={}) {
  const at=path=>join(cwd,path);
  const report={
    format:'opendesk.libs-doctor.v1',
    libraries:Object.values(BUILTIN_CATALOG.libraries).map(row=>({
      id:row.id,version:row.version,origin:row.origin,worlds:row.worlds,
      loading:row.default?'default':'opt-in',output:row.output,
      methods:row.methods,apiCoverage:row.id==='lodash'?'8-method subset':
        row.id==='dayjs'?'core + duration/UTC/timezone/strict parse without public mutators':
        row.id==='jquery'?'jQuery 3.7.1 Page only':'declared methods'
    })),
    sources:{},packages:{},legacy:{},policy:{
      expectedSwHardBytes:327680,
      configuredSwHardBytes:BUILD_POLICY.serviceWorkerProductionBytes,
      status:BUILD_POLICY.serviceWorkerProductionBytes===327680?'PASS':'POLICY_DRIFT'
    },
    runtime:'RUNTIME_UNVERIFIED',native:'NATIVE_UNVERIFIED'
  };
  const errors=[];
  // R15.6: historical snapshot decisions and live import hints are
  // read-only diagnostics, never new script loaders or runtime imports.
  const history=await inspectHistoricalLibraryUsage({cwd});
  report.history=history;
  report.sources.history=result(history.status,{
    historicalAssets:history.historicalAssetCount,
    expectedAssets:history.expectedHistoricalAssets,
    backgroundEntries:history.historicalBackgroundEntries,
    unresolvedDecisions:history.warnings.filter(line=>line.includes('unresolved historical dependency')).length,
    apiReviews:history.apiReviews.length
  });
  if(history.issues.length)errors.push(...history.issues);
  const invalidWorlds=Object.values(BUILTIN_CATALOG.libraries).filter(row=>
    row.worlds.some(world=>!['CONTROLLER','USER_SCRIPT'].includes(world))||
    (['jquery','jsCookie','cryptoJs','fileSaver','queryString'].includes(row.id)&&(row.default||row.worlds.join(',')!=='USER_SCRIPT'))||
    (!['jquery','jsCookie','cryptoJs','fileSaver','queryString'].includes(row.id)&&!row.default));
  report.sources.worlds=result(invalidWorlds.length?'SOURCE_FAIL':'SOURCE_PASS',
    invalidWorlds.length?{location:'src/libs/runtime-contract.js:1',ids:invalidWorlds.map(row=>row.id)}:undefined);
  if(invalidWorlds.length)errors.push('src/libs/runtime-contract.js:1 built-in library world/default drift');
  const apiValid=BUILTIN_CATALOG.libraries.lodash.methods.join(',')===
    'get,has,words,trim,uniq,chunk,escape,truncate'&&
    BUILTIN_CATALOG.libraries.dayjs.methods.join(',')==='isDayjs,duration,isDuration,utc,tz'&&
    BUILTIN_CATALOG.libraries.jsCookie.methods.join(',')==='get,set,remove,withAttributes,withConverter'&&
    BUILTIN_CATALOG.libraries.cryptoJs.methods.join(',')==='SHA256,HmacSHA256,AES,enc'&&
    BUILTIN_CATALOG.libraries.fileSaver.methods.join(',')==='saveAs'&&
    BUILTIN_CATALOG.libraries.queryString.methods.join(',')==='extract,parse,stringify,parseUrl,stringifyUrl,pick,exclude';
  report.sources.api=result(apiValid?'SOURCE_PASS':'SOURCE_FAIL',
    apiValid?undefined:{location:'src/libs/catalog.js:1',reason:'built-in API contract drift'});
  if(!apiValid)errors.push('src/libs/catalog.js:1 built-in API contract drift');
  try{
    execFileSync(process.execPath,[at('scripts/libs.mjs'),'check'],{cwd,stdio:'pipe'});
    report.sources.catalog=result('SOURCE_PASS');
  }catch(error){
    report.sources.catalog=result('SOURCE_FAIL',String(error.stderr||error.message).slice(0,500));
    errors.push('source catalog');
  }
  let pkg,lock;
  try{
    pkg=JSON.parse((await readFile(at('package.json'))).toString());
    lock=JSON.parse((await readFile(at('package-lock.json'))).toString());
  }catch(error){errors.push('npm lock');report.sources.npm=result('SOURCE_FAIL',error.message);}
  if(pkg&&lock){
    for(const row of Object.values(BUILTIN_CATALOG.libraries).filter(row=>row.origin==='npm')){
      const declared=pkg.dependencies?.[row.npm];
      const lockEntry=lock.packages?.['node_modules/'+row.npm];
      const locked=lockEntry?.version;
      const rootLocked=lock.packages?.['']?.dependencies?.[row.npm];
      const installed=await maybe(at('node_modules/'+row.npm+'/package.json'));
      let version;
      try{version=installed&&JSON.parse(installed.toString()).version;}catch{version=null;}
      const valid=declared===row.version&&locked===row.version&&rootLocked===row.version&&
        /^sha512-[A-Za-z0-9+/=]+$/.test(lockEntry?.integrity||'')&&
        /^https:\/\/registry\.npmjs\.org\//.test(lockEntry?.resolved||'')&&
        lockEntry?.license===row.license;
      const status=!valid?'SOURCE_FAIL':!installed?'SOURCE_UNVERIFIED':
        version===row.version?'SOURCE_PASS':'SOURCE_FAIL';
      report.sources[row.id]=result(status,{
        requested:row.version,declared:declared||null,locked:locked||null,rootLocked:rootLocked||null,
        integrityPresent:Boolean(lockEntry?.integrity),license:lockEntry?.license||null,
        installed:version||null
      });
      if(status==='SOURCE_FAIL')errors.push('npm '+row.id);
    }
  }
  const references=await scanLegacyConsumers(cwd);
  const legacy=await maybe(at('src/vendor/jquery-3.7.1.min.js'));
  const current=await maybe(at(BUILTIN_CATALOG.libraries.jquery.source));
  report.legacy.jquery=result(!legacy?'ABSENT':current&&sha(legacy)===sha(current)?
    'DUPLICATE_SOURCE':'LEGACY_DISTINCT',legacy?
    {bytes:legacy.length,sha256:sha(legacy)}:undefined);
  report.legacy.jquery.references=references;
  if(references.length)errors.push('legacy jquery path still referenced: '+references.join(', '));
  for(const mode of ['production','development']){
    const root=at('dist/'+mode);
    const raw=await maybe(join(root,BUILTIN_CATALOG.resourceManifest));
    if(!raw){report.packages[mode]=result('PACKAGE_UNVERIFIED','Build directory/manifest not present');continue;}
    try{
      if(raw.length>8192)throw Error('manifest exceeds size limit');
      const manifest=JSON.parse(raw.toString('utf8'));
      if(manifest.format!=='opendesk.builtin-resources.v2'||
        manifest.abi!==BUILTIN_CATALOG.abi||
        manifest.catalogSha256!==sha(Buffer.from(JSON.stringify(BUILTIN_RUNTIME_CATALOG)))||
        !Array.isArray(manifest.resources)||
        manifest.resources.length!==BUILTIN_RESOURCE_PATHS.length)
        throw Error('manifest format, ABI, catalog or count mismatch');
      const data={};
      for(let i=0;i<BUILTIN_RESOURCE_PATHS.length;i++){
        const path=BUILTIN_RESOURCE_PATHS[i],row=manifest.resources[i];
        if(row?.path!==path||!Number.isSafeInteger(row.bytes)||row.bytes<1||
          !/^[a-f0-9]{64}$/.test(row.sha256))throw Error('manifest row invalid: '+path);
        const bytes=await maybe(join(root,path));
        if(!bytes||bytes.length!==row.bytes||sha(bytes)!==row.sha256)
          throw Error('resource bytes/hash mismatch: '+path);
        const pinned=Object.values(BUILTIN_CATALOG.libraries).find(lib=>lib.output===path&&lib.sha256);
        if(pinned&&(row.sha256!==pinned.sha256||row.bytes!==pinned.bytes))
          throw Error('vendor identity mismatch: '+path);
        if(path===BUILTIN_CATALOG.bootstrap&&row.sha256!==BUILTIN_CATALOG.bootstrapSha256)
          throw Error('bootstrap hash mismatch');
        data[path]=row.bytes;
      }
      const lodash=(await readFile(join(root,BUILTIN_CATALOG.libraries.lodash.output))).toString('utf8');
      const dayjs=(await readFile(join(root,BUILTIN_CATALOG.libraries.dayjs.output))).toString('utf8');
      if(!/^var\s+OpenDeskLodashBundle\s*=/.test(lodash)||
         !/^var\s+OpenDeskDayjsBundle\s*=/.test(dayjs))
        throw Error('generated IIFE wrapper names are not isolated');
      const sw=await maybe(join(root,'sw.js'));
      if(!sw)throw Error('sw.js missing');
      verifyShippedSwBudget(mode,sw.length);
      await inspectLibraryOutputInventory(root,mode);
      const defaults=Object.values(BUILTIN_CATALOG.libraries).filter(row=>row.default)
        .reduce((sum,row)=>sum+data[row.output],0)+data[BUILTIN_CATALOG.bootstrap];
      const optional=Object.values(BUILTIN_CATALOG.libraries).filter(row=>!row.default)
        .reduce((sum,row)=>sum+data[row.output],0);
      report.packages[mode]=result('PACKAGE_PASS',{
        swBytes:sw.length,withinRequested327680:mode==='production'?sw.length<=327680:null,
        defaultLibraryBytes:defaults,optInLibraryBytes:optional,resourceBytes:data
      });

    }catch(error){
      errors.push(mode+' package');
      report.packages[mode]=result('PACKAGE_FAIL',String(error.message));
    }
  }
  report.issues=[...errors,...(report.policy.status==='POLICY_DRIFT'?
    ['configured SW hard cap differs from requested 327680 bytes']:[]),
    ...(report.legacy.jquery.status==='DUPLICATE_SOURCE'?
      ['old src/vendor jQuery duplicates the canonical src/libs source']:[])];
  return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const report=await inspectLibraries();
  console.log(JSON.stringify(report,null,2));
  if(report.issues.some(value=>!value.includes('configured SW')&&!value.includes('duplicates'))||
     process.argv.includes('--strict')&&(
       report.issues.length>0||
       Object.values(report.packages).some(row=>row.status!=='PACKAGE_PASS')||
       Object.values(report.sources).some(row=>row.status!=='SOURCE_PASS')
     ))process.exitCode=1;
}
