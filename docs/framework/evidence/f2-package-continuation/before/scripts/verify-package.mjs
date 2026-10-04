import {readdir, readFile, stat} from 'node:fs/promises';
import {join, relative, resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require = createRequire(import.meta.url);
const {parse} = require('acorn'); // Already required/locked by webpack; no extra dependency.
export async function filesAt(root, prefix = '') {
  const list = [];
  for (const item of await readdir(join(root, prefix), {withFileTypes: true})) {
    const name = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.isSymbolicLink()) throw new Error(`Symlink forbidden in artifact: ${name}`);
    if (item.isDirectory()) list.push(...await filesAt(root, name)); else list.push(name);
  }
  return list.sort();
}
export async function packageFingerprint(root) {
  const files = [];
  for (const path of await filesAt(root)) {
    const bytes = await readFile(join(root, path));
    files.push({path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')});
  }
  const packageHash = createHash('sha256').update(JSON.stringify(files)).digest('hex');
  return {packageHash, hashRecipe: 'SHA256 UTF-8 JSON.stringify(path-sorted [{path,bytes,sha256}]); exact file bytes', files};
}
function inspectNode(node, file) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'Identifier' && ['eval', 'Function', 'AsyncFunction'].includes(node.name)) throw new Error(`Dynamic execution reference in ${file}: ${node.name}`);
  if (node.type === 'ImportExpression' || /^Export/.test(node.type) || node.type === 'ImportDeclaration') throw new Error(`Non-classic syntax in ${file}`);
  if (['CallExpression', 'NewExpression'].includes(node.type)) {
    const callee = node.callee;
    const name = callee.type === 'Identifier' ? callee.name : callee.type === 'MemberExpression' ? callee.property.name || callee.property.value : '';
    if (['eval', 'Function', 'AsyncFunction', 'importScripts'].includes(name)) throw new Error(`Dynamic execution in ${file}: ${name}`);
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) { for (const child of value) inspectNode(child, file); }
    else if (value && typeof value === 'object') inspectNode(value, file);
  }
}
export async function verifyPackage(directory) {
  const root = resolve(directory);
  const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
  if (manifest.manifest_version !== 3 || manifest.background.type || manifest.action.default_popup) throw new Error('Expected MV3 worker and action window entry');
  if (manifest.minimum_chrome_version !== '138') throw new Error('Expected independently qualified minimum Chrome 138');
  if (JSON.stringify(manifest.permissions) !== JSON.stringify(['storage', 'scripting', 'activeTab', 'downloads', 'tabs', 'webNavigation', 'userScripts'])) throw new Error('Unexpected permissions');
  if (JSON.stringify(manifest.optional_permissions) !== JSON.stringify(['cookies', 'notifications'])) throw new Error('Unexpected optional permissions');
  if (manifest.content_security_policy.extension_pages !== "script-src 'self'; object-src 'self'") throw new Error('Unexpected CSP');
  if (manifest.host_permissions || manifest.content_scripts || manifest.web_accessible_resources || manifest.externally_connectable) throw new Error('Unapproved broad exposure');
  const files = await filesAt(root);
  const required = ['manifest.json', 'ui/tool.html', 'ui/tool-shell.css', 'ui/target-bootstrap.html', 'sw.js', 'ui/tool-shell.js', 'agents/health.js', 'agents/selection-entry.js', 'agents/bootstrap.js', 'agents/page-agent.js'];
  for (const file of required) if (!files.includes(file)) throw new Error(`Missing required resource: ${file}`);
  if (manifest.background.service_worker !== 'sw.js') throw new Error('Unexpected or missing worker entry');
  const js = files.filter(path => path.endsWith('.js'));
  const expected = ['agents/bootstrap.js', 'agents/health.js', 'agents/page-agent.js', 'agents/selection-entry.js', 'sw.js', 'ui/tool-shell.js'];
  if (JSON.stringify(js) !== JSON.stringify(expected)) throw new Error(`Unexpected JS/chunks: ${js}`);
  for (const file of js) {
    const text = await readFile(join(root, file), 'utf8');
    inspectNode(parse(text, {ecmaVersion: 'latest', sourceType: 'script'}), file);
    if (/__webpack_require__\.e\s*\(|https?:\/\/[^\s'"]+\.js|\brequire\(['"](?:node:|fs|net|http)/.test(text)) throw new Error(`Remote/lazy/runtime-host execution in ${file}`);
  }
  for (const file of files.filter(path => path.endsWith('.html'))) {
    const text = await readFile(join(root, file), 'utf8');
    if (/\son[a-z]+\s*=|<script\b(?![^>]*\bsrc=)[^>]*>|(?:src|href)\s*=\s*['"](?:https?:|\/\/|data:|javascript:)/i.test(text)) throw new Error(`Unsafe HTML resources in ${file}`);
    for (const match of text.matchAll(/(?:src|href)\s*=\s*['"]([^'"]+)['"]/g)) {
      const path = resolve(root, relative(root, join(root, file, '..')), match[1]);
      if (!path.startsWith(root + '/') || !(await stat(path)).isFile()) throw new Error(`Missing/escaped resource in ${file}: ${match[1]}`);
    }
  }
  const allowed = [...expected, 'manifest.json', 'ui/tool.html', 'ui/tool-shell.css', 'ui/target-bootstrap.html', ...expected.map(path => `${path}.map`)];
  if (files.some(path => !allowed.includes(path))) throw new Error('Unexpected packaged asset');
  return {status: 'passed', manifestVersion: 3, classicEntries: js, dynamicExecutionFound: false,
    ...await packageFingerprint(root)};
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(JSON.stringify(await verifyPackage(process.argv[2] || 'dist/production')));
}
