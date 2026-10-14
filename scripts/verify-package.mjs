import {readdir, readFile, stat} from 'node:fs/promises';
import {join, resolve, dirname, basename} from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {PACKAGE_ENTRIES, FIXED_OUTPUTS, BUILD_POLICY, PINNED_USER_SCRIPT_LIBRARIES, RESOURCE_LIMITS, entryByteBudget} from './build-contract.mjs';
import {REQUIRED_BROWSER_API_PERMISSIONS, OPTIONAL_PLUGIN_API_PERMISSIONS, REQUIRED_HOST_PATTERNS} from '../src/platform/chrome/permission-gate.js';
import {SDK_RESOURCE_PATHS, SDK_RESOURCE_MANIFEST} from '../src/framework/sdk/resource-contract.js';
import {BUILTIN_CATALOG,BUILTIN_RESOURCE_PATHS,BUILTIN_RUNTIME_CATALOG} from '../src/libs/catalog.js';
import {PAGE_FRAMEWORK_RUNTIMES,PAGE_FRAMEWORK_RESOURCE_LIMIT,PAGE_BROWSER_PRIVATE_FILES,PAGE_BROWSER_COMPILER,PAGE_BROWSER_COMPILER_RESOURCE_LIMIT} from '../src/libs/page-frameworks/contract.js';
import {BROWSER_EDITION_RECORD,DEVELOPER_BROWSER_NAME,compilerResourcesForEdition,readEditionRecord} from './browser-editions-r245.mjs';
import {inspectWorkspaceStyle} from './build-workspace-style.mjs';
import {readOfficialSources,createOfficialToolResources} from './build-official-tools.mjs';
import {OFFICIAL_CATALOG_PATH,officialPackagePath} from '../src/sidebar-tools/official-catalog.js';
import {resolveMarketChannel,marketExternalConnectable,MARKET_CHANNEL_PATH} from './market-channel.mjs';
const require = createRequire(import.meta.url);
const {parse} = require('acorn');
export {PACKAGE_ENTRIES, FIXED_OUTPUTS, BUILD_POLICY, SDK_RESOURCE_MANIFEST};
export const BUILD_CONTRACT_SOURCE = 'scripts/build-contract.mjs';
export const BUILTIN_RESOURCE_MANIFEST=BUILTIN_CATALOG.resourceManifest;
export const SANDBOX_HTML = 'scripting/sandbox/sandbox.html';
export const TOOL_SANDBOX_HTML = 'sidebar-tools/sandbox.html';
export const TOOL_SANDBOX_META_CSP = "default-src 'none'; script-src 'self' blob:; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; child-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
export const TOOL_HOST_META_CSP = "frame-src 'self'";
export const WORKSPACE_HOST_META_CSP = "frame-src 'self' http://127.0.0.1:* http://localhost:*";
export const CONTROL_WORKER = 'scripting/sandbox/worker-runtime.js';
export const EXTENSION_CSP = "script-src 'self'; object-src 'self'";
export const SANDBOX_META_CSP = "default-src 'none'; script-src 'self' 'unsafe-eval'; worker-src blob:; connect-src 'none'; child-src 'none'; img-src 'none'; style-src 'none'; base-uri 'none'; form-action 'none'";
export const SANDBOX_CSP = "sandbox allow-scripts; default-src 'none'; script-src 'self' 'unsafe-eval' blob:; worker-src blob:; connect-src 'none'; child-src 'none'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; base-uri 'none'; form-action 'none'";
export const SDK_MAIN_WAR = Object.freeze([{resources: ['framework/sdk-main.js'], matches: ['http://*/*', 'https://*/*']}]);
// Static internal restriction pages can be loaded as DNR redirect targets,
// not as arbitrary extension scripts. Require the exact reviewed paths.
export const FOCUS_BLOCK_RESOURCES=Object.freeze([
  'stay-focus/blocked-quota.html','stay-focus/blocked-schedule.html',
  'stay-focus/blocked-session.html','stay-focus/blocked-always.html'
]);
export const APPROVED_WEB_ACCESSIBLE_RESOURCES=Object.freeze([...SDK_MAIN_WAR,
  {resources:[...FOCUS_BLOCK_RESOURCES],matches:['http://*/*','https://*/*']}]);
export const SDK_AUTOMATIC_CONTENT_SCRIPTS = Object.freeze([
  {matches:['http://*/*','https://*/*'],js:['agents/page-relay.js'],run_at:'document_start',all_frames:true,world:'ISOLATED'},
  {matches:['http://*/*','https://*/*'],js:['framework/sdk-main.js'],run_at:'document_start',all_frames:true,world:'MAIN'}
]);
export const FIXED_ASSETS = Object.freeze({
  'icons/notification.png': {bytes: 595, sha256: 'efb5caddc95697204e98f9e7319119095ea195fa02448904bc985e90e96d4de6'},
  'licenses/todo-user-vue-MIT.txt': {bytes: 1096, sha256: 'e301f131f52747f87193c4a41d3d5c09e6c021cc664a6a3101a2213635f03f29'},
  'licenses/jquery-MIT.txt': {bytes: 1097, sha256: 'd4db9ebe6f29f5168eac45ad713f055623ac5d0dcd5ba92da23d650ae012020d'}
});
const HTML_REFERENCES = Object.freeze({
  'ui/tool.html': ['design-tokens.css', 'design-system.css', 'tool-shell.css', 'bookmark-manager.css', 'time-review.css', 'cloud-hosting.css', 'sidebar-tool-host.js', 'stay-focus-controls.js', 'trusted-cookie-ui.js', 'tool-shell.js'],
  'ui/cloud-control.html': ['design-tokens.css', 'design-system.css', 'cloud-control-console.css', 'cloud-console.js'],
  'ui/marketplace.html': ['design-tokens.css', 'marketplace.css', 'marketplace.js'],
  'native-agent/settings.html': ['../ui/design-tokens.css', 'settings.css', 'settings.js'],
  'native-agent/workspace.html': ['workspace.css','settings.js'],
  'ui/target-bootstrap.html': ['../agents/bootstrap.js'],
  [SANDBOX_HTML]: ['sandbox.js'],
  [TOOL_SANDBOX_HTML]: ['bridge.js'],
  ...Object.fromEntries(['quota','schedule','session','always'].map(reason=>[
    'stay-focus/blocked-'+reason+'.html',['./blocked.css','./blocked.js']]))
});
const generatedJS = ['sw.js', ...Object.values(FIXED_OUTPUTS)].sort();
const vendorJS = [BUILTIN_CATALOG.bootstrap,...Object.values(PINNED_USER_SCRIPT_LIBRARIES).map(row => row.output)];
const frameworkJS=Object.values(PAGE_FRAMEWORK_RUNTIMES).map(row=>row.output);
const frameworkLicenses=Object.values(PAGE_FRAMEWORK_RUNTIMES).map(row=>row.licensePath);
const officialSource=await readOfficialSources();
const officialPaths=[OFFICIAL_CATALOG_PATH,...officialSource.tools.map(row=>officialPackagePath(row.id))];
// A "standard" package cannot smuggle a dormant compiler: the verifier
// rejects ANY unlisted file, including both ESM assets and MIT notices.
function editionFiles(edition){
  const compilerFiles=compilerResourcesForEdition(edition);
  const browserCompilerJS=compilerFiles.map(row=>row.output).filter(path=>path.endsWith('.js'));
  const browserCompilerESM=compilerFiles.map(row=>row.output).filter(path=>path.endsWith('.mjs'));
  const expectedJS=[...generatedJS,...vendorJS,...frameworkJS,...browserCompilerJS].sort();
  const required=['manifest.json',BROWSER_EDITION_RECORD,MARKET_CHANNEL_PATH,SDK_RESOURCE_MANIFEST,BUILTIN_RESOURCE_MANIFEST,
    ...BUILTIN_RESOURCE_PATHS,...frameworkLicenses,...browserCompilerESM,
    ...(edition==='developer'?[PAGE_BROWSER_COMPILER.licensePath]:[]),
    ...Object.keys(HTML_REFERENCES),'stay-focus/blocked.css','ui/design-tokens.css','ui/design-system.css','ui/tool-shell.css','ui/bookmark-manager.css','ui/time-review.css','ui/cloud-hosting.css','ui/cloud-control-console.css','native-agent/settings.css','native-agent/workspace.css','ui/marketplace.css',...officialPaths,...expectedJS,...Object.keys(FIXED_ASSETS)].sort();
  return {compilerFiles,expectedJS,required};
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
// SW shipping cap: 1 MiB (512 KiB review); development SW: 1.5 MiB.
// Other generated JS remains capped at 512 KiB; safety scans are unchanged.
if (!same(BUILD_POLICY, {productionBytes: 512 * 1024, fixedEntryReviewBytes: 320 * 1024, serviceWorkerProductionBytes: 1024 * 1024, serviceWorkerReviewBytes: 512 * 1024, developmentBytes: 1536 * 1024, splitChunks: false, runtimeChunk: false, formats: ['iife'], sourcemap: {production: false, development: true}})) throw new Error('Unexpected build policy contract');
if (Object.entries(PACKAGE_ENTRIES).some(([name]) => name !== 'sw' && FIXED_OUTPUTS[name.split('/').at(-1)] !== `${name}.js`)) throw new Error('Unexpected fixed output contract');
if (!Object.isFrozen(SDK_RESOURCE_PATHS) || !same(SDK_RESOURCE_PATHS, ['framework/sdk-main.js', 'agents/page-relay.js']) || SDK_RESOURCE_MANIFEST !== 'framework/sdk-resources.json') throw new Error('Unexpected SDK resource contract');
export async function filesAt(root, prefix = '') {
  const list = [];
  for (const item of await readdir(join(root, prefix), {withFileTypes: true})) {
    const name = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.isSymbolicLink()) throw new Error(`Symlink forbidden in artifact: ${name}`);
    if (item.isDirectory()) list.push(...await filesAt(root, name));
    else if (item.isFile()) list.push(name);
    else throw new Error(`Non-file forbidden in artifact: ${name}`);
  }
  return list.sort();
}
export async function packageFingerprint(root) {
  const files = [];
  for (const path of await filesAt(root)) {
    const bytes = await readFile(join(root, path));
    files.push({path, bytes: bytes.length, sha256: digest(bytes)});
  }
  return {packageHash: digest(JSON.stringify(files)), hashRecipe: 'SHA256 UTF-8 JSON.stringify(path-sorted [{path,bytes,sha256}]); exact file bytes', files};
}
export async function createSdkResourceManifest(directory) {
  const root = resolve(directory), resources = [];
  for (const path of SDK_RESOURCE_PATHS) {
    const bytes = await readFile(join(root, path));
    resources.push({path, bytes: bytes.length, sha256: digest(bytes)});
  }
  return {schemaVersion: 1, resources};
}
export async function verifySdkResourceManifest(directory) {
  const root = resolve(directory);
  const bytes = await readFile(join(root, SDK_RESOURCE_MANIFEST));
  if (bytes.length > 8192) throw new Error(`SDK resource manifest exceeds reader size limit: ${SDK_RESOURCE_MANIFEST}`);
  let manifest;
  try { manifest = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes)); }
  catch { throw new Error(`Invalid SDK resource manifest JSON: ${SDK_RESOURCE_MANIFEST}`); }
  const fields = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
    same(Object.keys(value).sort(), [...keys].sort());
  if (!fields(manifest, ['schemaVersion', 'resources']) || manifest.schemaVersion !== 1 ||
      !Array.isArray(manifest.resources) || manifest.resources.length !== SDK_RESOURCE_PATHS.length ||
      !manifest.resources.every((entry, index) => fields(entry, ['path', 'bytes', 'sha256']) &&
        entry.path === SDK_RESOURCE_PATHS[index] && Number.isSafeInteger(entry.bytes) && entry.bytes > 0 &&
        entry.bytes <= BUILD_POLICY.productionBytes && typeof entry.sha256 === 'string' && entry.sha256.length === 64 && /^[a-f0-9]{64}$/.test(entry.sha256)))
    throw new Error(`Invalid SDK resource manifest schema: ${SDK_RESOURCE_MANIFEST}`);
  const actual = await createSdkResourceManifest(root);
  for (const [index, entry] of actual.resources.entries()) {
    const expected = manifest.resources[index];
    if (entry.bytes !== expected.bytes || entry.sha256 !== expected.sha256) throw new Error(`SDK resource integrity mismatch in ${entry.path}`);
  }
  return actual;
}
export async function createBuiltinResourceManifest(directory) {
  const root=resolve(directory),resources=[];
  const paths=BUILTIN_RESOURCE_PATHS;
  for(const path of paths) {
    const bytes=await readFile(join(root,path));
    resources.push({path,bytes:bytes.length,sha256:digest(bytes)});
  }
  return {format:'opendesk.builtin-resources.v2',abi:BUILTIN_CATALOG.abi,
    catalogSha256:digest(Buffer.from(JSON.stringify(BUILTIN_RUNTIME_CATALOG))),resources};
}
export async function verifyBuiltinResourceManifest(directory) {
  const root=resolve(directory);
  const bytes=await readFile(join(root,BUILTIN_RESOURCE_MANIFEST));
  if(bytes.length>RESOURCE_LIMITS.manifestBytes)throw new Error('Builtin library manifest exceeds '+RESOURCE_LIMITS.manifestBytes+' bytes');
  let row;try{row=JSON.parse(bytes.toString('utf8'));}catch{throw new Error('Malformed built-in library manifest');}
  const generated=await createBuiltinResourceManifest(root);
  if(!same(Object.keys(row||{}).sort(),Object.keys(generated).sort())||
    !same(row,generated))throw new Error('Built-in library checksum, ABI, license or catalog drift');
  // Resources also include the Controller Worker runtime. Only explicitly
  // declared npm license artifacts have the small-text size constraint;
  // runtime scripts stay protected by the full resource hash comparison above.
  for(const licensePath of Object.values(BUILTIN_CATALOG.libraries).map(row=>row.licensePath)) {
    const license=generated.resources.find(item=>item.path===licensePath);
    if(!license||license.bytes<50||license.bytes>RESOURCE_LIMITS.licenseBytes)
      throw new Error('Built-in npm license notice missing or oversized: '+licensePath);
  }
  for(const pinned of [BUILTIN_CATALOG.bootstrap,...Object.values(PINNED_USER_SCRIPT_LIBRARIES).map(row=>row.output)]){
    const info=generated.resources.find(row=>row.path===pinned);
    const vendor=Object.values(PINNED_USER_SCRIPT_LIBRARIES).find(row=>row.output===pinned);
    if(!info||info.sha256!==(vendor?.sha256||BUILTIN_CATALOG.bootstrapSha256)||
       (vendor&&info.bytes!==vendor.bytes))
      throw new Error('Pinned raw library source drift: '+pinned);
  }
  return generated;
}
export function verifyManifest(manifest,{mode='production',source=false,edition='standard',channel=resolveMarketChannel({mode})}={}) {
  if(manifest.name!==(edition==='developer'?DEVELOPER_BROWSER_NAME:'OpenDesk Browser'))
    throw Error('Extension manifest name differs from reviewed browser edition');
  const fields = ['manifest_version', 'name', 'version', 'description', 'minimum_chrome_version', 'permissions', 'optional_permissions', 'host_permissions', 'background', 'action', 'side_panel', 'options_ui', 'content_security_policy', 'incognito', 'sandbox', 'web_accessible_resources', 'content_scripts'];
  if (manifest.manifest_version !== 3 || manifest.background?.type || manifest.action?.default_popup) throw new Error('Expected MV3 worker and action window entry');
  if (manifest.minimum_chrome_version !== '138') throw new Error('Expected independently qualified minimum Chrome 138');
  if (!same(manifest.permissions, REQUIRED_BROWSER_API_PERMISSIONS)) throw new Error('Unexpected required browser API permissions');
  if (!same(manifest.optional_permissions, OPTIONAL_PLUGIN_API_PERMISSIONS)) throw new Error('Unexpected optional plugin API permissions');
  if (!same(manifest.host_permissions, REQUIRED_HOST_PATTERNS)) throw new Error('Expected default all-site host permission');
  if (!same(manifest.content_security_policy, {extension_pages: EXTENSION_CSP, sandbox: SANDBOX_CSP})) throw new Error('Unexpected CSP');
  if (!same(manifest.sandbox, {pages: [SANDBOX_HTML, TOOL_SANDBOX_HTML]})) throw new Error('Unexpected sandbox boundary');
  if (!same(manifest.background, {service_worker: 'sw.js'})) throw new Error('Unexpected or missing worker entry');
  if (!same(Object.keys(manifest.action || {}), ['default_title'])) throw new Error('Unexpected action resource/entry');
  if (!same(manifest.side_panel, {default_path: 'ui/tool.html'})) throw new Error('Unexpected or missing Side Panel entry');
  if (!same(manifest.options_ui, {page:'native-agent/settings.html',open_in_tab:true})) throw new Error('Unexpected Native Agent settings exposure');
  if (manifest.incognito !== 'not_allowed') throw new Error('Unexpected incognito policy');
  if (!same(manifest.web_accessible_resources, APPROVED_WEB_ACCESSIBLE_RESOURCES)) throw new Error('Unexpected web accessible resources');
  if (!same(manifest.content_scripts, SDK_AUTOMATIC_CONTENT_SCRIPTS))
    throw new Error('SDK auto-install must use the two approved fixed scripts and distinct worlds');
  if (manifest.optional_host_permissions)
    throw new Error('Unapproved optional host or page exposure');
  const external=source?undefined:marketExternalConnectable(channel);
  if(!same(manifest.externally_connectable,external))throw new Error('Unapproved market external origin or build mode');
  if(external)fields.push('externally_connectable');
  if (!same(Object.keys(manifest).sort(), fields.sort())) throw new Error('Unexpected manifest entry/exposure');
}
const property = node => node?.type === 'MemberExpression' ? node.computed ? node.property.value : node.property.name : undefined;
const isMember = (node, object, name) => node?.type === 'MemberExpression' && node.object.type === 'Identifier' && node.object.name === object && property(node) === name && !node.computed;
function asyncConstructor(node) {
  const call = node?.object;
  return property(node) === 'constructor' && call?.type === 'CallExpression' && isMember(call.callee, 'Object', 'getPrototypeOf') &&
    call.arguments.length === 1 && call.arguments[0].type === 'FunctionExpression' && call.arguments[0].async &&
    call.arguments[0].params.length === 0 && call.arguments[0].body.body.length === 0;
}
function walk(node, visit, ancestors = []) {
  if (!node?.type) return;
  visit(node, ancestors);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) { for (const child of value) if (child?.type) walk(child, visit, [...ancestors, node]); }
    else if (value?.type) walk(value, visit, [...ancestors, node]);
  }
}
function safeFunctionReference(node, ancestors, file) {
  const parent = ancestors.at(-1), grandparent = ancestors.at(-2), call = ancestors.at(-3);
  if (node.name !== 'Function' || parent?.object !== node) return false;
  // Introspection of an existing function does not compile source.
  if (property(parent) === 'prototype' && property(grandparent) === 'toString' && grandparent.object === parent && !parent.computed && !grandparent.computed) return true;
  // Existing Worker binds the native Promise.then helper before user code runs.
  return file === CONTROL_WORKER && property(parent) === 'call' && property(grandparent) === 'bind' && !parent.computed && !grandparent.computed &&
    call?.type === 'CallExpression' && call.callee === grandparent && call.arguments.length === 1 &&
    property(call.arguments[0]) === 'then' && isMember(call.arguments[0].object, 'Promise', 'prototype');
}
function nonReference(node, parent) {
  return ((parent?.type === 'Property' || parent?.type === 'MethodDefinition' || parent?.type === 'PropertyDefinition') && parent.key === node && !parent.computed && !parent.shorthand);
}
function parseScript(text, file, sourceType) {
  try { return parse(text, {ecmaVersion: 'latest', sourceType}); }
  catch (error) { throw new Error(`Non-classic syntax in ${file}: ${error.message}`); }
}
function allowedSourceExport(node, file) {
  return file === 'scripting/sandbox/sandbox.js' && node.type === 'ExportNamedDeclaration' && !node.source &&
    node.declaration?.type === 'FunctionDeclaration' && node.declaration.id?.name === 'initSandbox' && node.specifiers.length === 0;
}
// Independently pinned framework sources are produced by the approved
// maintenance Vite build as '(function(){...})()', not WXT's 'var x=(...)()'.
// The caller MUST first verify exact byte size and SHA-256. Never use for
// user-authored scripts or arbitrary public resources.
function assertPinnedFrameworkIIFE(text,file){
  const ast=parseScript(text,file,'script');
  const expr=ast.body[0]?.expression;
  const fn=expr?.callee;
  if(ast.body.length!==1||ast.body[0]?.type!=='ExpressionStatement'||
    expr?.type!=='CallExpression'||expr.arguments.length!==0||
    fn?.type!=='FunctionExpression'||fn.id||fn.params.length||
    fn.async||fn.generator||!fn.body?.body?.length||
    fn.body.body[0]?.type!=='ExpressionStatement'||
    fn.body.body[0]?.expression?.type!=='Literal'||
    fn.body.body[0].expression.value!=='use strict')
    throw Error('Non-isolated pinned Page framework IIFE: '+file);
}
export function assertClassicIIFE(text, file) {
  const ast = parseScript(text,file,'script'), declaration=ast.body[0];
  // WXT/Terser can emit a side-effect-only tool-shell as !function(){...}().
  // Accept ONLY that one fixed resource and ONLY this exact no-argument
  // synchronous IIFE. It is not a bypass for extra statements or dynamic JS.
  const unary=declaration?.type==='ExpressionStatement'?declaration.expression:null;
  const expressionIIFE=file==='ui/tool-shell.js'&&
    unary?.type==='UnaryExpression'&&unary.operator==='!'&&unary.prefix===true&&
    unary.argument?.type==='CallExpression'?unary.argument:null;
  if(expressionIIFE&&ast.body.length===1&&expressionIIFE.arguments.length===0&&
     expressionIIFE.callee?.type==='FunctionExpression'&&
     expressionIIFE.callee.params.length===0&&!expressionIIFE.callee.async&&
     !expressionIIFE.callee.generator)return;
  const call=declaration?.declarations?.[0]?.init;
  if(ast.body.length!==1||declaration?.type!=='VariableDeclaration'||declaration.kind!=='var'||
      declaration.declarations.length!==1||declaration.declarations[0].id.type!=='Identifier'||
      call?.type!=='CallExpression'||call.arguments.length||
      call.callee.type!=='FunctionExpression'||call.callee.params.length||
      call.callee.async||call.callee.generator)
    throw new Error(`Non-classic IIFE output in ${file}: top=${ast.body.length}, ${ast.body.map(node=>node.type).join(',')}, decl=${declaration?.kind}, init=${call?.type}, callee=${call?.callee?.type}, expr=${declaration?.expression?.type}, exprCallee=${declaration?.expression?.callee?.type}, unaryArg=${declaration?.expression?.argument?.type}, unaryCallee=${declaration?.expression?.argument?.callee?.type}`);
  // Named fixed IIFE globals must never pre-claim runtime-provided APIs.
  const bundleGlobal=declaration.declarations[0].id.name;
  if(['_', 'dayjs', 'OpenDeskLibs'].includes(bundleGlobal))
    throw new Error(`WXT bundle preclaims built-in API global: ${file} (${bundleGlobal})`);
}
// Narrow exception: only these seven reviewed, packaged classic resources may
// load synchronously at SW boot. Exact output filenames are checked against
// FIXED_OUTPUTS and covered by the release hash. Computed paths, remote code,
// additional arguments and non-SW importScripts remain forbidden.
const REVIEWED_SW_IMPORTS=Object.freeze([
  'sidebar-tools/preinstall-intent.js','agents/health-host.js',
  'marketplace/market-host.js',
  'cloud-control/cloud-host.js','native-agent/transport.js','knowledge/knowledge-host.js','time-review/time-review-host.js','platform/context-menus.js'
]);
if(REVIEWED_SW_IMPORTS.some(file=>!Object.values(FIXED_OUTPUTS).includes(file)))
  throw Error('Unregistered classic SW sidecar');
function approvedNativeImport(callee,call,file) {
  return file==='sw.js' && callee?.type==='Identifier' && callee.name==='importScripts' &&
    call?.type==='CallExpression' && call.callee===callee && call.arguments?.length===1 &&
    call.arguments[0]?.type==='Literal' && REVIEWED_SW_IMPORTS.includes(call.arguments[0].value);
}
export function inspectScript(text, file, options = {}) {
  const ast = parseScript(text, file, options.sourceType || 'script');
  const scopes = new WeakMap(), declarations = [], bindings = new WeakMap();
  let scope = {parent: null, names: new Map(), kind: 'function'};
  // Resolve the approved captured constructor lexically; minified local names are not an allowlist.
  function index(node) {
    if (!node?.type) return;
    const previous = scope;
    if (/^(?:FunctionDeclaration|FunctionExpression|ArrowFunctionExpression|BlockStatement|CatchClause)$/.test(node.type)) {
      if (node.type === 'FunctionDeclaration' && node.id) scope.names.set(node.id.name, {node});
      scope = {parent: scope, names: new Map(), kind: node.type.includes('Function') ? 'function' : 'block'};
      function bindPattern(pattern) {
        if (pattern?.type === 'Identifier') scope.names.set(pattern.name, {node: pattern});
        else if (pattern?.type === 'ObjectPattern') for (const item of pattern.properties) bindPattern(item.type === 'RestElement' ? item.argument : item.value);
        else if (pattern?.type === 'ArrayPattern') for (const item of pattern.elements) bindPattern(item);
        else if (pattern?.type === 'AssignmentPattern') bindPattern(pattern.left);
        else if (pattern?.type === 'RestElement') bindPattern(pattern.argument);
      }
      for (const param of node.params || []) bindPattern(param);
      if (node.type === 'FunctionExpression' && node.id) scope.names.set(node.id.name, {node});
      if (node.type === 'CatchClause') bindPattern(node.param);
    }
    scopes.set(node, scope);
    if (node.type === 'VariableDeclaration') for (const d of node.declarations) if (d.id.type === 'Identifier') {
      let owner = scope; if (node.kind === 'var') while (owner.parent && owner.kind !== 'function') owner = owner.parent;
      const binding = {node: d, declaration: node, scope: owner}; owner.names.set(d.id.name, binding); bindings.set(d, binding); declarations.push(d);
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) { for (const child of value) if (child?.type) index(child); }
      else if (value?.type) index(value);
    }
    scope = previous;
  }
  index(ast);
  const captures = declarations.filter(d => asyncConstructor(d.init));
  if (captures.length !== (file === CONTROL_WORKER ? 1 : 0)) throw new Error(`Unapproved dynamic execution boundary in ${file}`);
  const approved = captures[0], binding = approved && bindings.get(approved);
  let uses = 0;
  function resolveBinding(node) { for (let s = scopes.get(node); s; s = s.parent) if (s.names.has(node.name)) return s.names.get(node.name); }
  walk(ast, (node, ancestors) => {
    const parent = ancestors.at(-1);
    if (node.type === 'ImportExpression' || node.type === 'ImportDeclaration' || (/^Export/.test(node.type) && !allowedSourceExport(node, file))) throw new Error(`Non-classic syntax in ${file}`);
    if (node.type === 'Identifier' && !nonReference(node, parent)) {
      if (['eval', 'Function', 'AsyncFunction', 'importScripts'].includes(node.name) && !safeFunctionReference(node, ancestors, file) && !approvedNativeImport(node,parent,file)) throw new Error(`Dynamic execution reference in ${file}: ${node.name} offset=${node.start} nearby=${JSON.stringify(text.slice(Math.max(0,node.start-100),node.end+100))}`);
      if (binding && resolveBinding(node) === binding && node !== approved.id) {
        if (parent?.type !== 'NewExpression' || parent.callee !== node || parent.arguments.length !== 7 ||
          ['page','params','axiosx','AppStorage','AppLocal','storage'].some((name,index)=>parent.arguments[index]?.value!==name) || property(parent.arguments[6]) !== 'body') throw new Error(`Unapproved dynamic constructor use in ${file}`);
        uses++;
      }
    }
    if (node.type === 'MemberExpression' && ['eval', 'Function', 'AsyncFunction', 'importScripts'].includes(property(node))) throw new Error(`Dynamic execution in ${file}: ${property(node)}`);
    if (node.type === 'MemberExpression' && property(node) === 'constructor' && node !== approved?.init) {
      // The pinned crypto-js@4.2.0 CommonJS namespace bridge uses
      // Reflect.construct(Ctor, arguments, this.constructor) to preserve
      // new.target for wrapped constructor functions. This is not Function()
      // or code evaluation. Review ONLY this exact AST shape on the approved
      // dedicated Page package; all other constructor access is still denied.
      const reviewedCryptoJsNewTarget=file===BUILTIN_CATALOG.libraries.cryptoJs.output&&
        BUILTIN_CATALOG.libraries.cryptoJs.version==='4.2.0'&&
        node.computed===false&&node.object?.type==='ThisExpression'&&
        parent?.type==='CallExpression'&&parent.arguments?.length===3&&
        parent.arguments[2]===node&&parent.callee?.type==='MemberExpression'&&
        parent.callee.computed===false&&parent.callee.object?.type==='Identifier'&&
        parent.callee.object.name==='Reflect'&&parent.callee.property?.name==='construct';
      if(!reviewedCryptoJsNewTarget)
        throw new Error(`Unapproved dynamic constructor reference in ${file} offset=${node.start} nearby=${JSON.stringify(text.slice(Math.max(0,node.start-100),node.end+100))}`);
    }
    if (['CallExpression', 'NewExpression'].includes(node.type) && node.callee.type === 'Identifier' && ['eval', 'Function', 'AsyncFunction', 'importScripts'].includes(node.callee.name) && !approvedNativeImport(node.callee,node,file)) throw new Error(`Dynamic execution in ${file}: ${node.callee.name}`);
  });
  if (binding && uses !== 1) throw new Error(`Expected one approved async-body constructor use in ${file}`);
  if (/__webpack_require__\.e\s*\(|https?:\/\/[^\s'"]+\.js(?:[?#][^\s'"]*)?(?=['"\s]|$)|\brequire\(['"](?:node:|fs|net|http)/.test(text)) throw new Error(`Remote/lazy/runtime-host execution in ${file}`);
  return {approvedAsyncBodyConstructors: uses};
}
async function inspectHTML(root, file) {
  const text = await readFile(join(root, file), 'utf8'), references = [], policies = [];
  if (/\son[a-z]+\s*=|<script\b(?![^>]*\bsrc\s*=)[^>]*>|(?:src|href)\s*=\s*['"](?:https?:|\/\/|data:|javascript:)/i.test(text)) throw new Error(`Unsafe HTML resources in ${file}`);
  for (const match of text.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*)>/gi)) {
    const tag = match[1].toLowerCase(), attributes = new Map();
    if (['base', 'iframe', 'object', 'embed'].includes(tag)) throw new Error(`Unsafe HTML element in ${file}: ${tag}`);
    let tail = match[2];
    while (tail.trim()) {
      const attr = /^\s+([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/.exec(tail);
      if (!attr) throw new Error(`Unsafe HTML attributes in ${file}`);
      const key = attr[1].toLowerCase(), value = attr[2] ?? attr[3] ?? attr[4] ?? '';
      if (attributes.has(key) || /^on/.test(key) || ['srcdoc', 'srcset', 'style', 'action', 'formaction'].includes(key)) throw new Error(`Unsafe HTML attribute in ${file}: ${key}`);
      attributes.set(key, value); tail = tail.slice(attr[0].length);
      if (['src', 'href', 'poster', 'data'].includes(key)) {
        if (attr[4] !== undefined || !value || /[&%\\?#:]|^\//.test(value)) throw new Error(`Unsafe HTML resources in ${file}: ${value}`);
        const target = resolve(root, dirname(file), value);
        if (!target.startsWith(root + '/') || !(await stat(target)).isFile()) throw new Error(`Missing/escaped resource in ${file}: ${value}`);
        references.push(value);
      }
    }
    if (tag === 'meta' && attributes.get('http-equiv')?.toLowerCase() === 'content-security-policy') policies.push(attributes.get('content'));
    if (tag === 'script' && (attributes.size !== 1 || !attributes.has('src') || !attributes.get('src').endsWith('.js'))) throw new Error(`Unsafe HTML script in ${file}`);
    if (attributes.has('href') && (tag !== 'link' || attributes.get('rel') !== 'stylesheet' || !attributes.get('href').endsWith('.css'))) throw new Error(`Unsafe HTML stylesheet in ${file}`);
    if (attributes.has('src') && tag !== 'script') throw new Error(`Unsafe HTML resource consumer in ${file}`);
  }
  for (const match of text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)) if (match[1].trim()) throw new Error(`Unsafe HTML inline script in ${file}`);
  if (!same(references, HTML_REFERENCES[file])) throw new Error(`Unapproved HTML resource references in ${file}`);
  if (!same(policies, file === SANDBOX_HTML ? [SANDBOX_META_CSP] : file === TOOL_SANDBOX_HTML ? [TOOL_SANDBOX_META_CSP] : file === 'ui/tool.html' ? [TOOL_HOST_META_CSP] : file === 'native-agent/workspace.html' ? [WORKSPACE_HOST_META_CSP] : [])) throw new Error(`Unexpected HTML CSP in ${file}`);
}
export async function verifyPackage(directory, {mode: requestedMode} = {}) {
  const root = resolve(directory);
  const expectedMode=requestedMode??(['production','development'].includes(basename(root))?basename(root):undefined);
  if(expectedMode!==undefined&&!['production','development'].includes(expectedMode))throw new Error('Invalid package mode');
  const edition=readEditionRecord(await readFile(join(root,BROWSER_EDITION_RECORD),'utf8'));
  const {compilerFiles,expectedJS,required}=editionFiles(edition);
  const files = await filesAt(root);
  for (const file of required) if (!files.includes(file)) throw new Error(`Missing required resource: ${file}`);
  const js = files.filter(path => path.endsWith('.js'));
  if (!same(js, expectedJS)) throw new Error(`Unexpected JS/chunks: ${js}`);
  const allowed = [...required, ...generatedJS.map(path => `${path}.map`)];
  if (files.some(path => !allowed.includes(path))) throw new Error('Unexpected packaged asset');
  const mapFiles = files.filter(path => path.endsWith('.map'));
  if (mapFiles.length && mapFiles.length !== generatedJS.length) throw new Error('Incomplete source map asset set');
  const mode=mapFiles.length?'development':'production';
  if(expectedMode!==undefined&&mode!==expectedMode)
    throw new Error(`Package mode mismatch: expected ${expectedMode}, found ${mode} source map policy`);
  const marketChannel=resolveMarketChannel({mode});
  const actualChannel=JSON.parse(await readFile(join(root,MARKET_CHANNEL_PATH),'utf8'));
  if(!same(actualChannel,marketChannel))throw Error('Packaged market channel differs from reviewed build configuration');
  const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8')); verifyManifest(manifest,{mode,edition,channel:marketChannel});
  const boundaries = [];
  for (const file of js) {
    const bytes = await readFile(join(root, file));
    const vendor = Object.values(PINNED_USER_SCRIPT_LIBRARIES).find(row => row.output === file);
    const rawBootstrap=file===BUILTIN_CATALOG.bootstrap;
    const framework=Object.values(PAGE_FRAMEWORK_RUNTIMES).find(row=>row.output===file);
    const compilerResource=PAGE_BROWSER_PRIVATE_FILES.find(row=>row.output===file);
    const budget=vendor?RESOURCE_LIMITS.vendorBytes:framework?PAGE_FRAMEWORK_RESOURCE_LIMIT:compilerResource?PAGE_BROWSER_COMPILER_RESOURCE_LIMIT:entryByteBudget(file,mode);
    if(bytes.length>budget)throw new Error(`Packaged JS exceeds byte budget: ${file} (${bytes.length} > ${budget})`);
    if(compilerResource){
      // Exact source byte identity is mandatory. The trusted classic Worker is
      // the only approved importScripts consumer; all imported URLs are local
      // resources from the same immutable private package. Never allow
      // arbitrary user JS to acquire this exemption.
      if(bytes.length!==compilerResource.bytes||digest(bytes)!==compilerResource.sha256||
         files.includes(file+'.map'))throw Error('Browser compiler asset hash/byte mismatch: '+file);
      const code=bytes.toString('utf8');
      if(file==='ui/page-component-compiler-worker.js'){
        if(!code.includes("importScripts('../libs/page-frameworks/babel-7.29.9.min.js')")||
           !code.includes("import('../libs/page-frameworks/page-component-linker-r243.mjs')")||
            !code.includes("import('../libs/page-frameworks/controller-esm-linker-r4.mjs')")||
           !code.includes("import('../libs/page-frameworks/vue-sfc-transform-r243.mjs')"))
          throw Error('Browser compiler Worker only accepts fixed packaged imports');
      }else if(file==='ui/static-esm-compiler-worker.js'){
        if(!code.includes("importScripts('../libs/page-frameworks/babel-7.29.9.min.js')")||
           !code.includes("import('./static-esm-linker.mjs')"))
          throw Error('Static ESM compiler Worker only accepts fixed packaged imports');
      }else if(/\b(?:eval|new\s+Function|AsyncFunction|importScripts)\s*\(/.test(code)
        &&file!==PAGE_BROWSER_COMPILER.output)
        throw Error('Dynamic execution forbidden in fixed compiler source: '+file);
      continue;
    }
    if(vendor||rawBootstrap||framework) {
      if((vendor&&bytes.length!==vendor.bytes)||(framework&&bytes.length!==framework.bytes)||
          digest(bytes)!==(vendor?.sha256||framework?.sha256||BUILTIN_CATALOG.bootstrapSha256)||
          files.includes(file+'.map'))throw new Error('Pinned raw JS asset mismatch: '+file);
      // jQuery retains its audited legacy UMD format. New classic JS must
      // satisfy the fixed AST policy, despite bypassing Vite conversion.
      if(framework){
        // The SHA-256/size check above pins the entire reviewable React/Vue
        // vendor IIFE. ReactDOM legitimately reads/writes .constructor for
        // component prototypes and native event recreation; keep the stricter
        // generic user-code analyzer intact rather than allow this globally.
        // This exceptional path is ONLY for exact bytes listed in the fixed
        // framework contract, never user source, generated chunks or CDN code.
        const reviewed=bytes.toString('utf8');
        if(/\b(?:eval|Function|AsyncFunction|importScripts)\s*\(|\bimport\s*\(/.test(reviewed))
          throw Error('Dynamic execution forbidden in pinned Page framework: '+file);
        assertPinnedFrameworkIIFE(reviewed,file);
      }else if(file!==BUILTIN_CATALOG.libraries.jquery.output) {
        inspectScript(bytes.toString('utf8'),file);
        assertClassicIIFE(bytes.toString('utf8'),file);
      }
      continue;
    }
    const text = bytes.toString('utf8');
    const inspection = inspectScript(text, file);
    assertClassicIIFE(text, file);
    if (inspection.approvedAsyncBodyConstructors) boundaries.push({file, ...inspection, execution: 'Host fetches fixed bytes; Blob classic Worker only inside opaque sandbox'});
    const maps = [...text.matchAll(/\/\/# sourceMappingURL=(.+)/g)];
    if (maps.length !== (mapFiles.length ? 1 : 0) || maps.some(m => m[1].trim() !== file.split('/').at(-1) + '.map' || !files.includes(file + '.map'))) throw new Error(`Unsafe/missing source map in ${file}`);
  }
  // Browser-only ESM modules are private extension resources, not runtime
  // dynamically generated JS entries. Validate all bytes and MIME-ready paths.
  for(const row of compilerFiles.filter(row=>row.output.endsWith('.mjs'))){
    const bytes=await readFile(join(root,row.output));
    if(bytes.length!==row.bytes||bytes.length>PAGE_BROWSER_COMPILER_RESOURCE_LIMIT||
       digest(bytes)!==row.sha256)throw Error('Browser compiler ESM resource drift: '+row.output);
    const code=bytes.toString('utf8');
    parse(code,{ecmaVersion:'latest',sourceType:'module'});
  }
  if(edition==='developer'){
    const babelLicense=await readFile(join(root,PAGE_BROWSER_COMPILER.licensePath));
    if(digest(babelLicense)!==PAGE_BROWSER_COMPILER.licenseSha256)
      throw Error('Browser compiler license mismatch');
  }
  for (const file of Object.keys(HTML_REFERENCES)) await inspectHTML(root, file);
  // A checked-in SVG explorer cannot ship with a stale compiled settings bundle.
  // The extension serves HTML/CSS as public assets, but Workspace JS is built
  // into the fixed native-agent/settings.js IIFE; verify both halves together.
  const explorerHTML=await readFile(join(root,'native-agent/workspace.html'),'utf8');
  if(!explorerHTML.includes('data-workspace-ui="svg-r3"')||
     !explorerHTML.includes('data-icon-system="local-svg"')||
     /<span>展开\s*\/\s*收起<\/span>/.test(explorerHTML))
    throw Error('Workspace explorer UI asset is stale or missing SVG R3 contract');
  const explorerJS=await readFile(join(root,'native-agent/settings.js'),'utf8');
  if(!['data-variant','folder-open','tree-caret','file-icon'].every(value=>explorerJS.includes(value)))
    throw Error('Workspace explorer runtime is stale: packaged settings.js lacks SVG file-tree icons');
  for(const cssPath of ['ui/design-tokens.css','ui/design-system.css','ui/tool-shell.css','ui/bookmark-manager.css','ui/time-review.css','ui/cloud-hosting.css','ui/cloud-control-console.css','native-agent/settings.css','native-agent/workspace.css','stay-focus/blocked.css']) {
    const css = await readFile(join(root,cssPath),'utf8');
    if(/@(?:import|source|apply|tailwind|config|plugin)\b|url\s*\(|expression\s*\(/i.test(css)) throw new Error('Unsafe CSS resources in '+cssPath);
    if(cssPath==='native-agent/workspace.css')inspectWorkspaceStyle(css);
    if(cssPath==='ui/design-tokens.css' && (!css.includes('--od-brand:#365eda') || /\b(?:html|body)\s*\{|\*\s*\{/.test(css))) throw new Error('R23 tokens must remain page-agnostic');
  }
  // Compare against the trusted projects, not merely a mutually consistent
  // but tampered pair of release catalog + payload.
  const official=await createOfficialToolResources();
  for(const [path,expected] of official.resources){
    const actual=await readFile(join(root,path));
    if(!actual.equals(expected))throw new Error('Official release differs from trusted source: '+path);
  }
  for(const cssPath of ['ui/marketplace.css']) {
    const css=await readFile(join(root,cssPath),'utf8');
    if(/@(?:import|source|apply|tailwind|config|plugin)\b|url\s*\(|expression\s*\(/i.test(css))
      throw new Error('Unsafe CSS resources in '+cssPath);
  }
  for (const [file, expected] of Object.entries(FIXED_ASSETS)) {
    const bytes = await readFile(join(root, file));
    if (bytes.length !== expected.bytes || digest(bytes) !== expected.sha256) throw new Error(`Asset integrity mismatch in ${file}`);
  }
  for (const file of files.filter(path => path.endsWith('.map'))) {
    const map = JSON.parse(await readFile(join(root, file), 'utf8'));
    if (map.version !== 3 || !Array.isArray(map.sources) || !Array.isArray(map.sourcesContent)) throw new Error(`Invalid source map: ${file}`);
  }
  const sdkResources = await verifySdkResourceManifest(root);
  const builtinResources = await verifyBuiltinResourceManifest(root);
  return {status: 'passed', mode, edition, manifestVersion: 3, classicEntries: js, htmlChecked: Object.keys(HTML_REFERENCES), assetsChecked: [...Object.keys(FIXED_ASSETS), SDK_RESOURCE_MANIFEST,BUILTIN_RESOURCE_MANIFEST], sdkResources,builtinResources,
    sdkEntries: {MAIN: 'framework/sdk-main.js', ISOLATED: 'agents/page-relay.js'}, privilegedDynamicExecutionFound: false,
    approvedDynamicExecution: boundaries, sandbox: {pages: [SANDBOX_HTML, TOOL_SANDBOX_HTML], csp: SANDBOX_CSP}, ...await packageFingerprint(root)};
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(JSON.stringify(await verifyPackage(process.argv[2] || 'dist/production', {mode:process.argv[3]})));
}
