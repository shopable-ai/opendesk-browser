// Build-only evidence. Never emitted into dist or imported by extension code.
import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';
import {readFileSync,realpathSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {transformSync} from 'esbuild';
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
// permission for arbitrary examples/ JS. All twelve AdBlock privileged/business
// inputs are exact file-blob pinned; the bundle still has a fixed entry point,
// a single output and independently enforced release/package identity.
const compiledAdblockInputs=Object.freeze({
  'examples/sidebar-tools/adblock/trusted/dnr-session.js':'d3e221eac17261a34751cb8ab035c622eb1b42a8',
  'examples/sidebar-tools/adblock/trusted/service.js':'72294807bea97a1e1b33328bb4f3864ddc342dc5',
  'examples/sidebar-tools/adblock/trusted/policy.js':'1ba80150d930f51130ceb7806371f7542f35871b',
  'examples/sidebar-tools/adblock/trusted/rules.js':'4bebe24f991783d6ceb14dd80aa507f8497fce61',
  'examples/sidebar-tools/adblock/trusted/lifecycle.js':'708e2b226eb327d46ac109afa6145fe9b13b1526',
  'examples/sidebar-tools/adblock/trusted/tool-host.js':'fe96d9d1a9b1e737f42c3f875c1622d4cd5ea076',
  'examples/sidebar-tools/adblock/trusted/host-controls.js':'79dbe97eaf1eb61315e634384d922079f2d4b136',
  'examples/sidebar-tools/adblock/rules/domains.js':'b6b2ad8bb2085018f355f046d9b2a787601039bd',
  'examples/sidebar-tools/adblock/trusted/cosmetic.js':'da37f1f0e8f40860ac059ef2f43a27daeeb6d3d3',
  'examples/sidebar-tools/adblock/trusted/page.js':'8a65d7d913b84282cc6d3b5f21eed1caf862b296',
  'examples/sidebar-tools/adblock/trusted/picker.js':'dd92c939a12a72be2239634bddf8fd878ca153dc',
  'examples/sidebar-tools/adblock/trusted/cosmetic-policy.js':'65804d9e8455fb9521f789744e4b3d276876b455'
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

// R1.8 source review: Service now checks local cancellation before SDK writes
// and preserves writeIssued evidence; App enforces trusted authorization,
// prevents async AI reveals from hijacking newer user navigation, and shows a
// readback-only locate action. CSS adds only that locate notice. Exact Git
// blob locks stay fail-closed; any subsequent change requires re-review.
// R3.2 follow-up: reviewed style.css f7be8f4 adds only narrow coarse-pointer
// (<=240px / 200% zoom) horizontal toolbar scrolling; no new business JS.
// R3.2: The Bookmark Manager trusted React pilot compiles exactly four
// reviewed first-party files into the EXISTING ui/tool-shell.js. They are
// author-controlled static imports, not installed or user-supplied package
// code. Every Git blob is pinned to fail closed on source drift, and no other
// output or examples module is permitted. Runtime official-release/epoch
// admission and the dynamic opaque iframe boundary remain independent.
const compiledBookmarkReactInputs=Object.freeze({
  'examples/sidebar-tools/bookmark-manager/src/model.js':'34cc7a737869ca502b4bcbbb47d2437d1b6b2bd5',
  'examples/sidebar-tools/bookmark-manager/src/service.js':'d072ace5379d0d4c8f8cda8d8d172cb60122576e',
  'examples/sidebar-tools/bookmark-manager/src/react/App.jsx':'5df3df059e601bf343b698a0300cccbfdd58ad8a',
  'examples/sidebar-tools/bookmark-manager/src/react/style.css':'f7be8f43c22dab3dccdbb85585aa03f31ca6d941'
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

// The same reviewed CSS source now travels in the existing fixed stylesheet.
// Compile comments/whitespace only; do not change selectors or scan exceptions.
export function trustedBookmarkStyle(root=process.cwd()){
  const path='examples/sidebar-tools/bookmark-manager/src/react/style.css';
  reviewedCompiledBookmarkReact('ui/tool-shell.js',path,root);
  return transformSync(readFileSync(resolve(root,path),'utf8'),{
    loader:'css',minifyWhitespace:true,legalComments:'none'
  }).code;
}

export function trustedToolShellStyle(root=process.cwd()){
  return readFileSync(resolve(root,'src/ui/tool-shell.css'),'utf8')+'\n'+trustedBookmarkStyle(root);
}

// Prompt Shortcuts is a reviewed fixed, site-specific content adapter.
// The Classic model is exactly the same audited resource declared in the
// independent tool package; only these reviewed immutable blobs may enter
// the pre-existing fixed Host/relay bundles. This is NOT a wildcard exception.
// 2026-10-22 R1.8 exact-source review: model.js narrows DeepSeek to
// #root and Perplexity to stable test-ID selectors. page.js preserves
// existing origin, instance and permission gates; omits locale-based picker
// selectors; accepts the exact ChatGPT footer mobile textarea; shows one
// launcher and expanded, bounded image/text tray on fresh render and navigation.
// R1.9.6 reviewed delta: preserve explicit manual collapse through SPA/storage, resize failed images,
// clamp tooltip to viewport; no added origins, Host calls, permissions or injections.
// R1.9.5 reviewed delta: initial/reset expansion and no post-insertion auto-collapse;
// site/instance/permission gates, IME/no-autosend and source imports are unchanged.
// No dynamic imports, privileged outputs, origins or installer rights added.
// R2.15 static source-diff review (2026-10-24): schema-1 optional scroll-navigation
// defaults/validation; ChatGPT/DeepSeek/Gemini scoped scrolling and a floating
// top affordance; per-owner jump sessions. Site-grant, activation and storage
// epoch guards are retained. No automatic message submission, new Host calls,
// new origins, output targets or extension permission grants. This precise blob
// approval does NOT assert Chromium/Native success or official package parity.
const compiledPromptShortcutInputs=Object.freeze({
  'examples/sidebar-tools/prompt-shortcuts/trusted/model.js':'f5bc9499a4d5df8166959b3b9c207fa8eb7e2afa',
  'examples/sidebar-tools/prompt-shortcuts/trusted/policy.js':'4c6f608a26e0d69278c18a0afda94b3c8ce8274c',
  'examples/sidebar-tools/prompt-shortcuts/trusted/page.js':'d2939acc9e40f169c92cc162657dbc860ed9a55c',
  'examples/sidebar-tools/prompt-shortcuts/trusted/asset-contract.js':'86e95bff786e52efb9089f97126542430f39a716',
  'examples/sidebar-tools/prompt-shortcuts/trusted/asset-host.js':'b960044deb5e7d059c26d5d520f912c0b72c7b0e',
  'examples/sidebar-tools/prompt-shortcuts/trusted/conversation-sites.js':'7c10e8270c43be93229afbf0d3171455de628030',
  // Shared with the standalone diagnostic harness; never an installed package import.
  'examples/programs/chatgpt-jump-top/src/conversation.js':'77139704bc9e918f97840a3a34756a07deb3a32c',
  // The first-party OD gesture bridge is fixed SW code, never an installed package.
  'examples/sidebar-tools/prompt-shortcuts/trusted/rail-open.js':'d8650195e9b43178caafa015edaf60649d994b2f'
});
const promptFixedTargets=new Set(['agents/page-relay.js','ui/sidebar-tool-host.js']);
// Installer is shared by Marketplace. Allow only the byte-pinned asset identity
// contract there for owner-scoped uninstall cleanup, never the asset Host or UI.
const promptAssetContractTargets=new Set([...promptFixedTargets,'ui/marketplace.js']);
const promptRailTargets=new Set(['sw.js','agents/page-relay.js']);
const promptJumpTargets=new Set(['agents/page-relay.js']);
function reviewedCompiledPromptShortcuts(target,path,root){
  const targets=path==='examples/sidebar-tools/prompt-shortcuts/trusted/asset-contract.js'?promptAssetContractTargets:
    path==='examples/sidebar-tools/prompt-shortcuts/trusted/rail-open.js'?promptRailTargets:
    (path==='examples/programs/chatgpt-jump-top/src/conversation.js'||
      path==='examples/sidebar-tools/prompt-shortcuts/trusted/conversation-sites.js')?promptJumpTargets:promptFixedTargets;
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
  'examples/sidebar-tools/stay-focus/trusted/react-controls.tsx':'2c304e19e6a8f9b74d5fc2de19554c21b8ab3932',
  'examples/sidebar-tools/stay-focus/trusted/blocked.js':'2c2147226ccd3d31eaa0b605a15ec6846ce0f451',
  'examples/sidebar-tools/stay-focus/trusted/catalog.js':'0b46b62e097cc84fa29fd942c7d1480a9f44d0f8',
  'examples/sidebar-tools/stay-focus/trusted/host-controls.js':'65346648494b88fbf434a5a951769edba445c32e',
  'examples/sidebar-tools/stay-focus/trusted/lifecycle.js':'77afc647cf1345462751964d7c74c2ee8b0fbce2',
  'examples/sidebar-tools/stay-focus/trusted/model.js':'3634f018d4282af101e408b5acf77d4d08626fe0',
  'examples/sidebar-tools/stay-focus/trusted/page-notice.js':'a2cf3feda9902cfe0bb64187f11119ff0f2a2b20',
  'examples/sidebar-tools/stay-focus/trusted/policy.js':'508056b5ad9e1651efec29fbcfe87676c4fd0495',
  'examples/sidebar-tools/stay-focus/trusted/rule-host.js':'b6aa04a83ca05d2c11bdee6dd65bca78b9b26841',
  'examples/sidebar-tools/stay-focus/trusted/rule-ownership.js':'f5bd5722b94a772bb461ff00882ae8cf66ce9d29',
  'examples/sidebar-tools/stay-focus/trusted/service.js':'98c2db8cbc9602fa7eb9ac23fc6b50362c2cca74',
  'examples/sidebar-tools/stay-focus/trusted/tool-host.js':'cb7ac4b76be907d07d699c802fc576de6074d0b9'
});
// The shared lifecycle module is statically linked by other approved hosts
// (including knowledge-host). Reuse AdBlock's exact fixed-output registry:
// only pinned reviewed blobs, never arbitrary example/user modules.
const stayFocusFixedTargets=preapprovedFixedTargets;
function reviewedCompiledStayFocus(target,path,root){
  if(!stayFocusFixedTargets.has(target)||!Object.hasOwn(compiledStayFocusInputs,path))return null;
  // App-owned presentation is fixed Side Panel code, never a SW or sandbox input.
  if(path.endsWith('/react-controls.tsx')&&target!=='ui/tool-shell.js')return null;
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
  'examples/sidebar-tools/ai-vip-share/trusted/react-controls.tsx':'7f951bcaf8bc18450d03e450258a8024c3e71906',
  'examples/sidebar-tools/ai-vip-share/trusted/host-controls.js':'d00a67b654d109ac854fbd0691f263daabf6f607',
  'examples/sidebar-tools/ai-vip-share/trusted/lifecycle.js':'340de54ab4aabec78b3e0c05145a7a752b74e506',
  'examples/sidebar-tools/ai-vip-share/trusted/policy.js':'949ae514645f5691244f185b07e835e7e132cb5d',
  'examples/sidebar-tools/ai-vip-share/trusted/provider-config.js':'d09c57ef4bbc96f406bb2092feb9ff9b2465cf43',
  'examples/sidebar-tools/ai-vip-share/trusted/service.js':'861861cfea1a02ccf4e7c3535372c4aba389a30c',
  'examples/sidebar-tools/ai-vip-share/trusted/tool-host.js':'5fe63cd1351f29e59c77da914e9cd5ef87a2ae4e',
  'examples/sidebar-tools/time-review/trusted/host-controls.js':'8157ad15d99dd43d21836e5654c3eba5b13b1c6c',
  'examples/sidebar-tools/time-review/trusted/model.js':'ef7cb2281334b7161c39f68a768992e3527b9d5c',
  'examples/sidebar-tools/time-review/trusted/policy.js':'d5127624c129bd29533f37e24eedab3216f396db',
  'examples/sidebar-tools/time-review/trusted/service.js':'3dfd773fa8cf38deeb23a5d5f9f56d0b27e11ff6',
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
  if(path.endsWith('/react-controls.tsx')&&target!=='ui/tool-shell.js')return null;
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
// R1.8 source review: the shared converter only corrects nested-list
// Markdown indentation; URL filtering and secret redaction are unchanged.
const sharedMarkdownInputs=Object.freeze({
  'examples/shared/markdown/convert.js':'58516382e28fc03b89b58371f9b905d89e05ae27',
  'examples/shared/markdown/selection.js':'747d1afe2cee9a745552a3a7ceb699d1af83b35b'
});
function reviewedCompiledSharedMarkdown(target,path,root){
  if(!Object.hasOwn(sharedMarkdownInputs,path)||target!=='agents/page-relay.js')return null;
  const file=resolve(root,path);
  if(realpathSync(file)!==file)throw Error('Shared Markdown source must not be a symlink: '+path);
  const bytes=readFileSync(file);
  const hash=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
  if(hash!==sharedMarkdownInputs[path])throw Error('Shared Markdown source changed; review and re-pin: '+path);
  return hash;
}
// Only byte-reviewed first-party Clipper page/policy sources enter fixed
// Chrome Host/Relay targets; installed/user sources are not authorized.
const compiledWebClipperInputs=Object.freeze({
  'examples/sidebar-tools/web-markdown-clipper/trusted/page.js':'24c9a9b38965bc1a02931a243a99a5bd9edc5cab',
  'examples/sidebar-tools/web-markdown-clipper/trusted/policy.js':'35b60045acd85bc021f25e9e97b5de3474e44d08',
  'examples/sidebar-tools/web-markdown-clipper/trusted/notes-store.js':'a801ebcf0b932cf4a9425588a8e2dbada0de3963'
});
function reviewedCompiledWebClipper(target,path,root){
  // Notes storage is the reviewed first-party Clipper-only service imported by
  // the original Sidebar Tools host; it is never a dynamic app privilege.
  const permitted=path.endsWith('/notes-store.js')?target==='ui/sidebar-tool-host.js':
    path.endsWith('/policy.js')?(preapprovedFixedTargets.has(target)&&
      !target.startsWith('scripting/')&&!target.startsWith('libs/')):
      target==='agents/page-relay.js';
  if(!Object.hasOwn(compiledWebClipperInputs,path)||!permitted)return null;
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
  'examples/sidebar-tools/reading-toc/trusted/page.js':'7a5337360a9512b17acefd4dc2f45b894c4b8eaf',
  'examples/sidebar-tools/reading-toc/trusted/view.js':'5528e01bc46fa8c6bb38390898dec3a608c055b7',
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
