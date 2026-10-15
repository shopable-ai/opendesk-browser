// Build-only evidence. Never emitted into dist or imported by extension code.
import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';
import {readFileSync,realpathSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {resolve,relative,sep,isAbsolute} from 'node:path';
import {BUILTIN_CATALOG} from '../src/libs/catalog.js';
import {FIXED_OUTPUTS} from './build-contract.mjs';

// Exactly two audited first-party Time Review UI files are compiled into the
// existing trusted sidebar-tool-host entry. Never allow arbitrary examples,
// installed packages or remote/user sources. Each source is pinned to its
// reviewed Git blob; edits require an explicit build-boundary review. The
// separate runtime admission still validates the exact official release.
const compiledTimeReviewInputs=Object.freeze({
  'examples/sidebar-tools/time-review/src/index.html':'fcaec7808b606c8f4484e20bd4c82a7d66e66fa5',
  'examples/sidebar-tools/time-review/src/main.js':'c0d8dc0ce6d42a0ff08ce8012dec3e66a2840ed0'
});
function reviewedCompiledTimeReview(target,path,root){
  if(target!=='ui/sidebar-tool-host.js'||!Object.hasOwn(compiledTimeReviewInputs,path))return null;
  const file=resolve(root,path);
  if(realpathSync(file)!==file)
    throw Error('Trusted Time Review source must not be a symlink: '+path);
  const bytes=readFileSync(file);
  const hash=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
  if(hash!==compiledTimeReviewInputs[path])
    throw Error('Trusted Time Review source changed; review and re-pin before fixed build: '+path);
  return hash;
}

// This is a deliberately fixed, build-reviewed extension source allowance, NOT
// permission for arbitrary examples/ JS. All seven AdBlock privileged/business
// inputs are exact file-blob pinned; the bundle still has a fixed entry point,
// a single output and independently enforced release/package identity.
const compiledAdblockInputs=Object.freeze({
  'examples/sidebar-tools/adblock/trusted/service.js':'f73d0444b1fad46eebd7f3fb99c501f496471d74',
  'examples/sidebar-tools/adblock/trusted/policy.js':'6736074a6c4fe956f2ce62c6099df11f4daca6d4',
  'examples/sidebar-tools/adblock/trusted/rules.js':'8100276a38117c3e6f88f04f65a4a6ea1a7cddc6',
  'examples/sidebar-tools/adblock/trusted/lifecycle.js':'f6789d278c59c8f4148ed0c0c4e55b29c68758d0',
  'examples/sidebar-tools/adblock/trusted/tool-host.js':'e967e44ec44e3d4085e517a6c11bd45e546df1b6',
  'examples/sidebar-tools/adblock/trusted/host-controls.js':'c2d9fb892c76669b169c34de2cb4c168f91402cf',
  'examples/sidebar-tools/adblock/rules/domains.js':'e78bbaea99f39b52cd3bc57d4379af68b166c2f9'
});
const preapprovedFixedTargets=new Set(['sw.js',...Object.values(FIXED_OUTPUTS)]);
function reviewedCompiledAdblock(target,path,root){
  if(!preapprovedFixedTargets.has(target)||!Object.hasOwn(compiledAdblockInputs,path))return null;
  const file=resolve(root,path);
  if(realpathSync(file)!==file)
    throw Error('Trusted AdBlock source must not be a symlink: '+path);
  const bytes=readFileSync(file);
  const hash=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
  if(hash!==compiledAdblockInputs[path])
    throw Error('Trusted AdBlock source changed; review and re-pin before fixed build: '+path);
  return hash;
}

// Prompt Shortcuts is a reviewed fixed, site-specific content adapter.
// The Classic model is exactly the same audited resource declared in the
// independent tool package; only these three immutable blobs may enter
// the pre-existing fixed Host/relay bundles. This is NOT a wildcard exception.
const compiledPromptShortcutInputs=Object.freeze({
  'examples/sidebar-tools/prompt-shortcuts/trusted/model.js':'f015386060e97ad336c3bbaf35d6e9033b7ba2ee',
  'examples/sidebar-tools/prompt-shortcuts/trusted/policy.js':'d393ee2c2511f4786265e8abc23c5c755aae51a6',
  'examples/sidebar-tools/prompt-shortcuts/trusted/page.js':'0eeab5f748101d605fea6a28b82d36c4be31ca89'
});
const promptFixedTargets=new Set(['agents/page-relay.js','ui/sidebar-tool-host.js']);
function reviewedCompiledPromptShortcuts(target,path,root){
  if(!promptFixedTargets.has(target)||!Object.hasOwn(compiledPromptShortcutInputs,path))return null;
  const file=resolve(root,path);
  if(realpathSync(file)!==file)
    throw Error('Trusted Prompt Shortcuts source must not be a symlink: '+path);
  const bytes=readFileSync(file);
  const hash=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
  if(hash!==compiledPromptShortcutInputs[path])
    throw Error('Trusted Prompt Shortcuts source changed; review and re-pin before fixed build: '+path);
  return hash;
}

const npmOwners=new Map(Object.values(BUILTIN_CATALOG.libraries).filter(row=>row.origin==='npm')
  .map(row=>[row.npm,row.output]));
export function assertLibraryModuleBoundary(target,path,npmName) {
  const embeddedPackage=[...npmOwners].find(([name])=>npmName===name||path.includes('node_modules/'+name+'/'));
  const packageSource=path.startsWith('src/libs/packages/');
  const wrongOwner=embeddedPackage&&embeddedPackage[1]!==target ||
    packageSource&&path.slice(4)!==target;
  const raw=path.startsWith('src/libs/vendor/')||path==='src/libs/runtime/bootstrap.js';
  // React/Vue are already reviewed standalone Page files. Rebundling one into
  // WXT (especially the SW) would defeat on-demand loading and duplicate bytes.
  const duplicateFramework=/^src\/libs\/page-frameworks\/(?:react-|vue-)\d[^/]*\.js$/.test(path);
  const swFrameworkNpm=target==='sw.js'&&
    /(?:^|\/)node_modules\/(?:react(?:-dom)?|vue|@vue\/[^/]+)(?:\/|$)/.test(path);
  const backgroundMetadata=target==='sw.js'&&['src/libs/core.js','src/libs/catalog.js'].includes(path);
  if(wrongOwner||raw||backgroundMetadata||duplicateFramework||swFrameworkNpm)
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
    const reviewedSource=reviewedCompiledTimeReview(chunk.fileName,path,root)||
      reviewedCompiledAdblock(chunk.fileName,path,root)||
      reviewedCompiledPromptShortcuts(chunk.fileName,path,root);
    if(!reviewedSource&&/^(?:docs\/contracts\/source-snapshots\/|examples\/|src\/vendor\/)/.test(path))
      throw Error('Historical/user/vendor code cannot enter a privileged fixed bundle: '+path);
    const row={path,renderedLength:info.renderedLength,originalLength:info.originalLength,
      ...(reviewedSource?{reviewedFirstPartyBlob:reviewedSource}:{})};
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
