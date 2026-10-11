// Read-only source/package diagnosis. Static checks are never native Chrome proof.
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {BUILTIN_CATALOG,BUILTIN_RUNTIME_CATALOG,BUILTIN_RESOURCE_PATHS} from '../src/libs/catalog.js';
import {BUILD_POLICY} from './build-contract.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function maybe(path) {
  try{return await readFile(path);}
  catch(error){if(error?.code==='ENOENT')return null;throw error;}
}
const result=(status,detail)=>({status,...(detail?{detail}: {})});

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
        row.id==='dayjs'?'core without extend/locale mutation':
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
      const locked=lock.packages?.['node_modules/'+row.npm]?.version;
      const installed=await maybe(at('node_modules/'+row.npm+'/package.json'));
      let version;
      try{version=installed&&JSON.parse(installed.toString()).version;}catch{version=null;}
      const valid=declared===row.version&&locked===row.version;
      const status=!valid?'SOURCE_FAIL':!installed?'SOURCE_UNVERIFIED':
        version===row.version?'SOURCE_PASS':'SOURCE_FAIL';
      report.sources[row.id]=result(status,{
        requested:row.version,declared:declared||null,locked:locked||null,installed:version||null
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
      const defaults=Object.values(BUILTIN_CATALOG.libraries).filter(row=>row.default)
        .reduce((sum,row)=>sum+data[row.output],0)+data[BUILTIN_CATALOG.bootstrap];
      const optional=Object.values(BUILTIN_CATALOG.libraries).filter(row=>!row.default)
        .reduce((sum,row)=>sum+data[row.output],0);
      report.packages[mode]=result('PACKAGE_PASS',{
        swBytes:sw.length,withinRequested327680:mode==='production'?sw.length<=327680:null,
        defaultLibraryBytes:defaults,optInLibraryBytes:optional,resourceBytes:data
      });
      if(mode==='production'&&sw.length>327680)
        errors.push('production SW exceeds requested 327680-byte hard budget');
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
