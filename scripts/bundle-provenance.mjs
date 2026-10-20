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
  'examples/sidebar-tools/adblock/trusted/service.js':'dfb86edf93a84066b71f81df8c4f4934cb8a8679',
  'examples/sidebar-tools/adblock/trusted/policy.js':'0a4801d44af9232052eec86bd4e9a720743762e7',
  'examples/sidebar-tools/adblock/trusted/rules.js':'8100276a38117c3e6f88f04f65a4a6ea1a7cddc6',
  'examples/sidebar-tools/adblock/trusted/lifecycle.js':'1c750e4367a978a9a82e2d4709433ea77b93c505',
  'examples/sidebar-tools/adblock/trusted/tool-host.js':'b4d5e973ad0e9168b57512ad38da41263d2cc30b',
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
  'examples/sidebar-tools/bookmark-manager/src/react/App.jsx':'0b25fef1d33dbd857b682d9735cf76b6d606c8e7',
  'examples/sidebar-tools/bookmark-manager/src/react/style.css':'8b90e2e988381dc75c860d628acb64a818f4ed57'
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
// independent tool package; only these reviewed immutable blobs may enter
// the pre-existing fixed Host/relay bundles. This is NOT a wildcard exception.
const compiledPromptShortcutInputs=Object.freeze({
  'examples/sidebar-tools/prompt-shortcuts/trusted/model.js':'9f58c21cd1754eb1a35961cb22424a73ba604afe',
  'examples/sidebar-tools/prompt-shortcuts/trusted/policy.js':'6544a03db0f11373dccdf67cc9b5ce808920a495',
  'examples/sidebar-tools/prompt-shortcuts/trusted/page.js':'2845a958e5f85f88208ba0295f81b9aa4b37a0c0',
  // Shared with the standalone diagnostic harness; never an installed package import.
  'examples/programs/chatgpt-jump-top/src/conversation.js':'dc2ab912d8aff83a9b306d1e6a68206002620c4a',
  // The first-party OD gesture bridge is fixed SW code, never an installed package.
  'examples/sidebar-tools/prompt-shortcuts/trusted/rail-open.js':'3f4c4fcb98db72ca8537f1e44e64809e0cd5d4d6'
});
const promptFixedTargets=new Set(['agents/page-relay.js','ui/sidebar-tool-host.js']);
const promptRailTargets=new Set(['sw.js','agents/page-relay.js']);
const promptJumpTargets=new Set(['agents/page-relay.js']);
function reviewedCompiledPromptShortcuts(target,path,root){
  const targets=path==='examples/sidebar-tools/prompt-shortcuts/trusted/rail-open.js'?promptRailTargets:
    path==='examples/programs/chatgpt-jump-top/src/conversation.js'?promptJumpTargets:promptFixedTargets;
  if(!targets.has(target)||!Object.hasOwn(compiledPromptShortcutInputs,path))return null;
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
  'examples/sidebar-tools/stay-focus/trusted/host-controls.js':'65346648494b88fbf434a5a951769edba445c32e',
  'examples/sidebar-tools/stay-focus/trusted/lifecycle.js':'77afc647cf1345462751964d7c74c2ee8b0fbce2',
  'examples/sidebar-tools/stay-focus/trusted/model.js':'e160e2636a31a91815a7a8fb4e4e79437b83d137',
  'examples/sidebar-tools/stay-focus/trusted/page-notice.js':'a2cf3feda9902cfe0bb64187f11119ff0f2a2b20',
  'examples/sidebar-tools/stay-focus/trusted/policy.js':'508056b5ad9e1651efec29fbcfe87676c4fd0495',
  'examples/sidebar-tools/stay-focus/trusted/rule-host.js':'b6aa04a83ca05d2c11bdee6dd65bca78b9b26841',
  'examples/sidebar-tools/stay-focus/trusted/rule-ownership.js':'f5bd5722b94a772bb461ff00882ae8cf66ce9d29',
  'examples/sidebar-tools/stay-focus/trusted/service.js':'8106c72e1009c662b8af7376a1aace51009ae198',
  'examples/sidebar-tools/stay-focus/trusted/tool-host.js':'cb7ac4b76be907d07d699c802fc576de6074d0b9'
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

// R1.3: The official first-party AI Access and Time Review applications own
// trusted business modules under examples/, while their privileged handlers
// still compile into the pre-existing fixed Browser entries. Only these exact
// reviewed Git blobs may be included; installed/user JSON, unsigned updates,
// symlinks and arbitrary examples/ files remain explicitly prohibited.
// Updating application source requires a new source review and pin revision.
const compiledAppOwnedBackgroundInputs=Object.freeze({
  'examples/sidebar-tools/ai-vip-share/trusted/host-controls.js':'d00a67b654d109ac854fbd0691f263daabf6f607',
  'examples/sidebar-tools/ai-vip-share/trusted/lifecycle.js':'340de54ab4aabec78b3e0c05145a7a752b74e506',
  'examples/sidebar-tools/ai-vip-share/trusted/policy.js':'949ae514645f5691244f185b07e835e7e132cb5d',
  'examples/sidebar-tools/ai-vip-share/trusted/provider-config.js':'d09c57ef4bbc96f406bb2092feb9ff9b2465cf43',
  'examples/sidebar-tools/ai-vip-share/trusted/service.js':'861861cfea1a02ccf4e7c3535372c4aba389a30c',
  'examples/sidebar-tools/ai-vip-share/trusted/tool-host.js':'5fe63cd1351f29e59c77da914e9cd5ef87a2ae4e',
  'examples/sidebar-tools/time-review/trusted/host-controls.js':'6cb8a7e357a5a9f8011ae755dcbbbde6cde8578b',
  'examples/sidebar-tools/time-review/trusted/model.js':'eeac13501cad3717a53f8ad9a2b90a70d97e6e19',
  'examples/sidebar-tools/time-review/trusted/policy.js':'d5127624c129bd29533f37e24eedab3216f396db',
  'examples/sidebar-tools/time-review/trusted/service.js':'1b4dfe90936c70ef89e90dd87307b308ef30be68',
  'examples/sidebar-tools/time-review/trusted/sync-outbox.js':'d00c7d7c4d3507b6fda21347a4c87d900979e3a2',
  'examples/sidebar-tools/time-review/trusted/sync-transport.js':'b09f943f2b176b2da2162df1174cd0758f593c56',
  'examples/sidebar-tools/time-review/trusted/trusted-admission.js':'23ae6cb70c60dc45776c3fe199c4a6af646b790c',
  'examples/sidebar-tools/time-review/trusted/trusted-native-ui.js':'d9aae298be73fac262490cd943c531414bf8d3d4'
});
function reviewedCompiledAppOwnedBackground(target,path,root){
  // App-owned privileged services are not sandbox, third-party library or
  // dynamically installed script inputs. A reviewed blob is necessary but
  // must never expand an untrusted execution world's output admission.
  // Keep the audited fixed Host targets; block the two extensible worlds.
  if(!preapprovedFixedTargets.has(target)||
     target.startsWith('scripting/')||target.startsWith('libs/')||
     !Object.hasOwn(compiledAppOwnedBackgroundInputs,path))return null;
  const file=resolve(root,path);
  if(realpathSync(file)!==file)throw Error('Trusted app-owned source must not be a symlink: '+path);
  const bytes=readFileSync(file);
  const hash=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
  if(hash!==compiledAppOwnedBackgroundInputs[path])
    throw Error('Trusted app-owned source changed; review and re-pin before fixed build: '+path+
      ' (pinned='+compiledAppOwnedBackgroundInputs[path]+' actual='+hash+')');
  return hash;
}

// One immutable Markdown domain converter is shared by Clipper and Knowledge
// Inbox. Its byte-reviewed source may enter only the existing Page Relay.
const sharedMarkdownInput='examples/shared/markdown/convert.js';
const sharedMarkdownBlob='b53147ff3bd888f1291e81daf8a90d06b5a1a114';
function reviewedCompiledSharedMarkdown(target,path,root){
  if(path!==sharedMarkdownInput||target!=='agents/page-relay.js')return null;
  const file=resolve(root,path);
  if(realpathSync(file)!==file)throw Error('Shared Markdown source must not be a symlink: '+path);
  const bytes=readFileSync(file);
  const hash=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
  if(hash!==sharedMarkdownBlob)throw Error('Shared Markdown source changed; review and re-pin: '+path);
  return hash;
}
// Only byte-reviewed first-party Clipper page/policy sources enter fixed
// Chrome Host/Relay targets; installed/user sources are not authorized.
const compiledWebClipperInputs=Object.freeze({
  'examples/sidebar-tools/web-markdown-clipper/trusted/page.js':'2e4f46ee205cd3749841a79d82c74f3c35b84c00',
  'examples/sidebar-tools/web-markdown-clipper/trusted/policy.js':'6240ef2d75f251c0b4d980690081d3540bba275f'
});
function reviewedCompiledWebClipper(target,path,root){
  if(!Object.hasOwn(compiledWebClipperInputs,path)||
    (path.endsWith('/policy.js')?(!preapprovedFixedTargets.has(target)||
      target.startsWith('scripting/')||target.startsWith('libs/')):target!=='agents/page-relay.js'))return null;
  const file=resolve(root,path);
  if(realpathSync(file)!==file)throw Error('Trusted Web Clipper source must not be a symlink: '+path);
  const bytes=readFileSync(file);
  const hash=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
  if(hash!==compiledWebClipperInputs[path])
    throw Error('Trusted Web Clipper source changed; review and re-pin before fixed build: '+path);
  return hash;
}

// Reading TOC has one trusted business source. All these exact Git blobs
// compile into EXISTING reviewed fixed outputs, never arbitrary JS, remote
// packages or another privileged Host. Page algorithms/renderers are limited
// to Page Relay; the policy and generated locale are fixed-host shared.
const compiledReadingTocInputs=Object.freeze({
  'examples/sidebar-tools/reading-toc/trusted/overview.js':'a148dc645ec49b22f0f0a911f4861960442617b5',
  'examples/sidebar-tools/reading-toc/trusted/model.js':'9a7320084caa2efa2acb40dcaf5c00e60659bc66',
  'examples/sidebar-tools/reading-toc/trusted/placement.js':'b29ddc6e66d0203fefccbcb98c071b046aaaa2c0',
  'examples/sidebar-tools/reading-toc/trusted/page.js':'8c9c3faa71c26a84e3388c41c31dffcac947d76e',
  'examples/sidebar-tools/reading-toc/trusted/view.js':'71f6d57ad101936c963c41c118c8e78ef74bbf3b',
  'examples/sidebar-tools/reading-toc/trusted/policy.js':'17d930495245bf92c6e36a9228a7cd286dc611b3',
  'examples/sidebar-tools/reading-toc/trusted/locales.generated.js':'0484bd67fadb23a88c6a7164435d5bf90acd8295',
  'examples/sidebar-tools/reading-toc/trusted/existing-tabs.js':'f5d9882cd1de65ef2ed0115c4d002114575c1058'
});
function reviewedCompiledReadingToc(target,path,root){
  if(!Object.hasOwn(compiledReadingTocInputs,path))return null;
  // Existing-tabs repair is a reviewed App-specific adapter within the existing
  // fixed preinstall worker; it cannot run from sandbox or user package bytes.
  const approved=path.endsWith('/existing-tabs.js')
    ? target==='sidebar-tools/preinstall-intent.js'
    : path.endsWith('/policy.js')||path.endsWith('/locales.generated.js')
      ? preapprovedFixedTargets.has(target)&&!target.startsWith('scripting/')&&!target.startsWith('libs/')
      : target==='agents/page-relay.js';
  if(!approved)return null;
  const file=resolve(root,path);
  if(realpathSync(file)!==file)throw Error('Trusted Reading TOC source must not be a symlink: '+path);
  const bytes=readFileSync(file);
  const hash=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
  if(hash!==compiledReadingTocInputs[path])
    throw Error('Trusted Reading TOC source changed; review and re-pin before fixed build: '+path);
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
      reviewedCompiledStayFocus(chunk.fileName,path,root)||
      reviewedCompiledAppOwnedBackground(chunk.fileName,path,root)||
      reviewedCompiledSharedMarkdown(chunk.fileName,path,root)||
      reviewedCompiledWebClipper(chunk.fileName,path,root)||
      reviewedCompiledReadingToc(chunk.fileName,path,root);
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
