import {readdir, readFile, stat} from 'node:fs/promises';
import {join, resolve, dirname, basename} from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {PACKAGE_ENTRIES, FIXED_OUTPUTS, BUILD_POLICY, PINNED_USER_SCRIPT_LIBRARIES, RESOURCE_LIMITS, entryByteBudget} from './build-contract.mjs';
import {REQUIRED_BROWSER_API_PERMISSIONS, OPTIONAL_PLUGIN_API_PERMISSIONS, REQUIRED_HOST_PATTERNS} from '../src/platform/chrome/permission-gate.js';
import {SDK_RESOURCE_PATHS, SDK_RESOURCE_MANIFEST} from '../src/framework/sdk/resource-contract.js';
import {BUILTIN_CATALOG,BUILTIN_RESOURCE_PATHS,BUILTIN_RUNTIME_CATALOG} from '../src/libs/catalog.js';
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
  'ui/tool.html': ['design-system.css', 'tool-shell.css', 'tool-shell.js'],
  'native-agent/settings.html': ['settings.js'],
  'native-agent/workspace.html': ['workspace.css','settings.js'],
  'ui/target-bootstrap.html': ['../agents/bootstrap.js'],
  [SANDBOX_HTML]: ['sandbox.js'],
  [TOOL_SANDBOX_HTML]: ['bridge.js']
});
const generatedJS = ['sw.js', ...Object.values(FIXED_OUTPUTS)].sort();
const vendorJS = [BUILTIN_CATALOG.bootstrap,...Object.values(PINNED_USER_SCRIPT_LIBRARIES).map(row => row.output)];
const expectedJS = [...generatedJS, ...vendorJS].sort();
const required = ['manifest.json', SDK_RESOURCE_MANIFEST, BUILTIN_RESOURCE_MANIFEST,
  ...BUILTIN_RESOURCE_PATHS,
  ...Object.keys(HTML_REFERENCES), 'ui/design-system.css', 'ui/tool-shell.css', 'native-agent/workspace.css', 'sidebar-tools/reading-toc.opendesk-tool.json', ...expectedJS, ...Object.keys(FIXED_ASSETS)].sort();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
if (!same(BUILD_POLICY, {productionBytes: 320 * 1024, serviceWorkerProductionBytes: 512 * 1024, serviceWorkerReviewBytes: 320 * 1024, developmentBytes: 768 * 1024, splitChunks: false, runtimeChunk: false, formats: ['iife'], sourcemap: {production: false, development: true}})) throw new Error('Unexpected build policy contract');
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
export function verifyManifest(manifest) {
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
  if (!same(manifest.web_accessible_resources, SDK_MAIN_WAR)) throw new Error('Unexpected web accessible resources');
  if (!same(manifest.content_scripts, SDK_AUTOMATIC_CONTENT_SCRIPTS))
    throw new Error('SDK auto-install must use the two approved fixed scripts and distinct worlds');
  if (manifest.optional_host_permissions || manifest.externally_connectable)
    throw new Error('Unapproved optional host or page exposure');
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
function assertClassicIIFE(text, file) {
  const ast = parseScript(text, file, 'script'), declaration = ast.body[0];
  const call = declaration?.declarations?.[0]?.init;
  if (ast.body.length !== 1 || declaration?.type !== 'VariableDeclaration' || declaration.kind !== 'var' ||
      declaration.declarations.length !== 1 || declaration.declarations[0].id.type !== 'Identifier' ||
      call?.type !== 'CallExpression' || call.arguments.length || call.callee.type !== 'FunctionExpression' ||
      call.callee.params.length || call.callee.async || call.callee.generator)
    throw new Error(`Non-classic IIFE output in ${file}: top=${ast.body.length}, ${ast.body.map(node=>node.type).join(',')}, decl=${declaration?.kind}, init=${call?.type}, callee=${call?.callee?.type}, expr=${declaration?.expression?.type}, exprCallee=${declaration?.expression?.callee?.type}, unaryArg=${declaration?.expression?.argument?.type}, unaryCallee=${declaration?.expression?.argument?.callee?.type}`);
  // A WXT unlisted IIFE is a top-level 'var <entryName> = (function(){...})()'.
  // In a single USER_SCRIPT ScriptSource, that declaration is hoisted BEFORE
  // any library installation. Reserved public API names must be installed only
  // by the audited src/libs/core.js installer, never claimed by WXT wrappers.
  const bundleGlobal = declaration.declarations[0].id.name;
  if (['_', 'dayjs', 'OpenDeskLibs'].includes(bundleGlobal))
    throw new Error(`WXT bundle preclaims built-in API global: ${file} (${bundleGlobal})`);
}
// Narrow exception: the classic MV3 worker may import its ONE pinned,
// same-extension Native transport asset synchronously at boot. The package
// verifier separately requires the asset and includes its bytes in the hash.
// All computed, remote, arbitrary and non-worker importScripts remain forbidden.
function approvedNativeImport(callee,call,file) {
  return file==='sw.js' && callee?.type==='Identifier' && callee.name==='importScripts' &&
    call?.type==='CallExpression' && call.callee===callee && call.arguments?.length===1 &&
    call.arguments[0]?.type==='Literal' && call.arguments[0].value==='native-agent/transport.js';
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
    if (node.type === 'MemberExpression' && property(node) === 'constructor' && node !== approved?.init) throw new Error(`Unapproved dynamic constructor reference in ${file} offset=${node.start} nearby=${JSON.stringify(text.slice(Math.max(0,node.start-100),node.end+100))}`);
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
  const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8')); verifyManifest(manifest);
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
  const boundaries = [];
  for (const file of js) {
    const bytes = await readFile(join(root, file));
    const vendor = Object.values(PINNED_USER_SCRIPT_LIBRARIES).find(row => row.output === file);
    const rawBootstrap=file===BUILTIN_CATALOG.bootstrap;
    const budget=vendor?RESOURCE_LIMITS.vendorBytes:entryByteBudget(file,mode);
    if(bytes.length>budget)throw new Error(`Packaged JS exceeds byte budget: ${file} (${bytes.length} > ${budget})`);
    if(vendor||rawBootstrap) {
      if((vendor&&bytes.length!==vendor.bytes)||
          digest(bytes)!==(vendor?.sha256||BUILTIN_CATALOG.bootstrapSha256)||
          files.includes(file+'.map'))throw new Error('Pinned raw JS asset mismatch: '+file);
      // jQuery retains its audited legacy UMD format. New classic JS must
      // satisfy the fixed AST policy, despite bypassing Vite conversion.
      if(file!==BUILTIN_CATALOG.libraries.jquery.output) {
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
  for (const file of Object.keys(HTML_REFERENCES)) await inspectHTML(root, file);
  for(const cssPath of ['ui/design-system.css','ui/tool-shell.css']) {
    const css = await readFile(join(root,cssPath),'utf8');
    if(/@import\b|url\s*\(|expression\s*\(/i.test(css)) throw new Error('Unsafe CSS resources in '+cssPath);
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
  return {status: 'passed', mode, manifestVersion: 3, classicEntries: js, htmlChecked: Object.keys(HTML_REFERENCES), assetsChecked: [...Object.keys(FIXED_ASSETS), SDK_RESOURCE_MANIFEST,BUILTIN_RESOURCE_MANIFEST], sdkResources,builtinResources,
    sdkEntries: {MAIN: 'framework/sdk-main.js', ISOLATED: 'agents/page-relay.js'}, privilegedDynamicExecutionFound: false,
    approvedDynamicExecution: boundaries, sandbox: {pages: [SANDBOX_HTML, TOOL_SANDBOX_HTML], csp: SANDBOX_CSP}, ...await packageFingerprint(root)};
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(JSON.stringify(await verifyPackage(process.argv[2] || 'dist/production', {mode:process.argv[3]})));
}
