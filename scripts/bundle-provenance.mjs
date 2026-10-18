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
// permission for arbitrary examples/ JS. All eight AdBlock privileged/business
// inputs are exact file-blob pinned; the bundle still has a fixed entry point,
// a single output and independently enforced release/package identity.
const compiledAdblockInputs=Object.freeze({
  'examples/sidebar-tools/adblock/trusted/dnr-session.js':'d3e221eac17261a34751cb8ab035c622eb1b42a8',
  'examples/sidebar-tools/adblock/trusted/service.js':'fe2a1a9e9c1e836ed2ab343c5e2458b8dbadec46',
  'examples/sidebar-tools/adblock/trusted/policy.js':'0a4801d44af9232052eec86bd4e9a720743762e7',
  'examples/sidebar-tools/adblock/trusted/rules.js':'8100276a38117c3e6f88f04f65a4a6ea1a7cddc6',
  'examples/sidebar-tools/adblock/trusted/lifecycle.js':'1c750e4367a978a9a82e2d4709433ea77b93c505',
  'examples/sidebar-tools/adblock/trusted/tool-host.js':'fb9dfcc07dd21fdcb5c2c7445823445dc1f01191',
  'examples/sidebar-tools/adblock/trusted/host-controls.js':'79dbe97eaf1eb61315e634384d922079f2d4b136',
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

// R3.2: The Bookmark Manager trusted React pilot compiles exactly four
// reviewed first-party files into the EXISTING ui/tool-shell.js. They are
// author-controlled static imports, not installed or user-supplied package
// code. Every Git blob is pinned to fail closed on source drift, and no other
// output or examples module is permitted. Runtime official-release/epoch
// admission and the dynamic opaque iframe boundary remain independent.
const compiledBookmarkReactInputs=Object.freeze({
  'examples/sidebar-tools/bookmark-manager/src/model.js':'34cc7a737869ca502b4bcbbb47d2437d1b6b2bd5',
  'examples/sidebar-tools/bookmark-manager/src/service.js':'1c1541ee128e37dd8897b073581bd476ce8f4171',
  'examples/sidebar-tools/bookmark-manager/src/react/App.jsx':'a9da341d824e29ac8b8a29fb28874bfd247e4159',
  'examples/sidebar-tools/bookmark-manager/src/react/style.css':'1db0dbaf6896bd66e0c39f5184c1ae41d7436cf4'
});
function reviewedCompiledBookmarkReact(target,path,root){
  if(target!=='ui/tool-shell.js'||!Object.hasOwn(compiledBookmarkReactInputs,path))return null;
  const file=resolve(root,path);
  if(realpathSync(file)!==file)
    throw Error('Trusted Bookmark React source must not be a symlink: '+path);
  const bytes=readFileSync(file);
  const hash=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
  if(hash!==compiledBookmarkReactInputs[path])
    throw Error('Trusted Bookmark React source changed; review and re-pin before fixed build: '+path);
  return hash;
}

// Prompt Shortcuts is a reviewed fixed, site-specific content adapter.
// The Classic model is exactly the same audited resource declared in the
// independent tool package; only these three immutable blobs may enter
// the pre-existing fixed Host/relay bundles. This is NOT a wildcard exception.
const compiledPromptShortcutInputs=Object.freeze({
  'examples/sidebar-tools/prompt-shortcuts/trusted/model.js':'709620e151cc448844a263e1f367db23a5fbb2da',
  'examples/sidebar-tools/prompt-shortcuts/trusted/policy.js':'6544a03db0f11373dccdf67cc9b5ce808920a495',
  'examples/sidebar-tools/prompt-shortcuts/trusted/page.js':'ad5e3bb10a0af62629db5bd0da474b71f1ae4ed4'
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

// Stay Focus R2: exactly audited application-owned trusted source blobs may
// enter the existing fixed Chrome Host outputs. Moving the business source out
// of src/ must not turn examples/ into an executable-code wildcard.
// These blob pins intentionally require review when privileged code changes.
const compiledStayFocusInputs=Object.freeze({
  'examples/sidebar-tools/stay-focus/trusted/blocked.js':'2c2147226ccd3d31eaa0b605a15ec6846ce0f451',
  'examples/sidebar-tools/stay-focus/trusted/catalog.js':'0b46b62e097cc84fa29fd942c7d1480a9f44d0f8',
  'examples/sidebar-tools/stay-focus/trusted/host-controls.js':'5f22f27e452b675f3df48a044457fb7bfe2f76c5',
  'examples/sidebar-tools/stay-focus/trusted/lifecycle.js':'2f5de0ad7751c36ae210d7f8f5297bddb450287f',
  'examples/sidebar-tools/stay-focus/trusted/model.js':'e160e2636a31a91815a7a8fb4e4e79437b83d137',
  'examples/sidebar-tools/stay-focus/trusted/page-notice.js':'a2cf3feda9902cfe0bb64187f11119ff0f2a2b20',
  'examples/sidebar-tools/stay-focus/trusted/policy.js':'508056b5ad9e1651efec29fbcfe87676c4fd0495',
  'examples/sidebar-tools/stay-focus/trusted/rule-host.js':'b6aa04a83ca05d2c11bdee6dd65bca78b9b26841',
  'examples/sidebar-tools/stay-focus/trusted/rule-ownership.js':'f5bd5722b94a772bb461ff00882ae8cf66ce9d29',
  'examples/sidebar-tools/stay-focus/trusted/service.js':'8787ff2f051f33adda98b9eb5a10b2b5d40db646',
  'examples/sidebar-tools/stay-focus/trusted/tool-host.js':'2f4b071d66c0d41ab055d87300c87ed4efda1122'
});
// The shared lifecycle module is statically linked by other approved hosts
// (including knowledge-host). Reuse AdBlock's exact fixed-output registry:
// only pinned reviewed blobs, never arbitrary example/user modules.
const stayFocusFixedTargets=preapprovedFixedTargets;
function reviewedCompiledStayFocus(target,path,root){
  if(!stayFocusFixedTargets.has(target)||!Object.hasOwn(compiledStayFocusInputs,path))return null;
  const file=resolve(root,path);
  if(realpathSync(file)!==file)
    throw Error('Trusted Stay Focus source must not be a symlink: '+path);
  const bytes=readFileSync(file);
  const hash=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
  if(hash!==compiledStayFocusInputs[path])
    throw Error('Trusted Stay Focus source changed; review and re-pin before fixed build: '+path);
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
      reviewedCompiledPromptShortcuts(chunk.fileName,path,root)||
      reviewedCompiledBookmarkReact(chunk.fileName,path,root)||
      reviewedCompiledStayFocus(chunk.fileName,path,root);
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
