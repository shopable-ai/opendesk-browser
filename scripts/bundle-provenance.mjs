// Build-only evidence. Never emitted into dist or imported by extension code.
import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {resolve,relative,sep,isAbsolute} from 'node:path';
import {BUILTIN_CATALOG} from '../src/libs/catalog.js';

const npmOwners=new Map(Object.values(BUILTIN_CATALOG.libraries).filter(row=>row.origin==='npm')
  .map(row=>[row.npm,row.output]));
export function assertLibraryModuleBoundary(target,path,npmName) {
  const embeddedPackage=[...npmOwners].find(([name])=>npmName===name||path.includes('node_modules/'+name+'/'));
  const packageSource=path.startsWith('src/libs/packages/');
  const wrongOwner=embeddedPackage&&embeddedPackage[1]!==target ||
    packageSource&&path.slice(4)!==target;
  const raw=path.startsWith('src/libs/vendor/')||path==='src/libs/runtime/bootstrap.js';
  const backgroundMetadata=target==='sw.js'&&['src/libs/core.js','src/libs/catalog.js',
    'src/runtime/builtin-libraries/core.js'].includes(path);
  if(wrongOwner||raw||backgroundMetadata)
    throw Error('Preinstalled library implementation unexpectedly bundled into '+target+': '+path);
}

export function modulePath(id,root) {
  if(id.startsWith('\0'))return 'virtual:'+id.slice(1).split(root).join('<root>');
  const file=id.split('?')[0];
  if(!isAbsolute(file))return 'virtual:'+id;
  const path=relative(root,file).split(sep).join('/');
  if(path.startsWith('../')||path==='..')throw Error('Build module outside repository: '+id);
  return path;
}
export function describeBundle({chunk,root=process.cwd(),lock}) {
  const modules=Object.entries(chunk.modules).map(([id,info])=>{
    const path=modulePath(id,root);
    assertLibraryModuleBoundary(chunk.fileName,path);
    if(/^(?:docs\/contracts\/source-snapshots\/|examples\/|src\/vendor\/)/.test(path))
      throw Error('Historical/user/vendor code cannot enter a privileged fixed bundle: '+path);
    const row={path,renderedLength:info.renderedLength,originalLength:info.originalLength};
    if(path.startsWith('node_modules/')){
      const parts=path.split('/'),index=parts.lastIndexOf('node_modules');
      const count=parts[index+1].startsWith('@')?3:2;
      const packagePath=parts.slice(0,index+count).join('/'),entry=lock.packages?.[packagePath];
      if(!entry?.version||!entry.integrity)throw Error('Bundled npm module missing lock provenance: '+path);
      row.npm={name:parts.slice(index+1,index+count).join('/'),version:entry.version,
        resolved:entry.resolved,integrity:entry.integrity,...(entry.license?{license:entry.license}:{})};
    }
    return row;
  }).sort((a,b)=>a.path.localeCompare(b.path));
  return {target:chunk.fileName,modules,
    ...(typeof chunk.code==='string'?{bytes:Buffer.byteLength(chunk.code),
      sha256:createHash('sha256').update(chunk.code).digest('hex')} : {}),
    note:'Rollup module graph; renderedLength is pre-minification characters, not final bytes or browser execution proof.'};
}
export async function recordBundle(chunk) {
  const directory=process.env.OPENDESK_MODULE_EVIDENCE_DIR;
  if(!directory)return; // Direct WXT debugging is not a verified build receipt.
  const lock=JSON.parse(await readFile('package-lock.json','utf8'));
  const record=describeBundle({chunk,lock});
  await writeFile(resolve(directory,encodeURIComponent(chunk.fileName)+'.json'),
    JSON.stringify(record),{flag:'wx'});
}
export async function collectBundleEvidence(directory,targets,files) {
  const names=targets.map(target=>encodeURIComponent(target)+'.json').sort();
  if(JSON.stringify((await readdir(directory)).sort())!==JSON.stringify(names))
    throw Error('Incomplete or extra fixed-entry module evidence');
  return Promise.all([...targets].sort().map(async target=>{
    const record=JSON.parse(await readFile(resolve(directory,encodeURIComponent(target)+'.json'),'utf8'));
    const output=files.find(file=>file.path===target);
    if(record.target!==target||!record.modules?.length||!output||
       record.bytes!==undefined&&(record.bytes!==output.bytes||record.sha256!==output.sha256))
      throw Error('Module evidence does not match verified package: '+target);
    return {...record,bytes:output.bytes,sha256:output.sha256};
  }));
}

// Preserve failed attempts separately. A partial build/module graph is never a
// passed package receipt, even if an older build-<mode>.json is still present.
export async function recordBuildFailure({directory,evidence,mode,attemptId=randomUUID(),error,sourceInputs=[]}) {
  await mkdir(evidence,{recursive:true});
  const path=resolve(evidence,`build-${mode}-failed-${Date.now()}-${randomUUID()}.json`);
  // Invalidate the old success before reading possibly incomplete diagnostics.
  await writeFile(resolve(evidence,`build-${mode}-latest.json`),JSON.stringify({status:'failed',mode,attemptId,diagnostic:path})+'\n');
  const bundleModules=[],diagnosticErrors=[];
  if(directory) {
    let names=[];
    try{names=(await readdir(directory)).sort();}
    catch(error){diagnosticErrors.push({path:directory,message:error.message});}
    for(const name of names)try {
      bundleModules.push(JSON.parse(await readFile(resolve(directory,name),'utf8')));
    } catch(error){diagnosticErrors.push({path:name,message:error.message});}
  }
  // WXT wraps the Rollup error in Error(..., {cause}). Preserve the real size
  // violation even when the top-level error only says "Failed to build sw".
  const causes=[],seen=new Set();let size;
  for(let current=error;current!==undefined&&!seen.has(current)&&causes.length<8;current=current?.cause) {
    seen.add(current);
    causes.push({message:current?.message??String(current),...(current?.code?{code:current.code}:{})});
    if(!size&&typeof current?.target==='string'&&Number.isSafeInteger(current.bytes)&&
       Number.isSafeInteger(current.budgetBytes)&&current.budgetBytes>0&&current.bytes>current.budgetBytes)
      size={target:current.target,bytes:current.bytes,budgetBytes:current.budgetBytes,
        excessBytes:current.bytes-current.budgetBytes};
  }
  await writeFile(path,JSON.stringify({status:'failed',mode,attemptId,packageVerified:false,sourceInputs,
    error:{...causes[0],...(causes.length>1?{causes:causes.slice(1)}:{}),...size},bundleModules,diagnosticErrors,
    note:'Partial failed build diagnostics only; renderedLength is pre-minification, not final module bytes.'},null,2)+'\n',{flag:'wx'});
  return path;
}
