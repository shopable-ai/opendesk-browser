// Presentation-only compilation: no WXT build, output directory or host authority.
import {build, version as esbuildVersion} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve, relative, extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {PAGE_FRAMEWORK_RUNTIMES, PAGE_FRAMEWORK_IMPORTS} from '../../../../src/libs/page-frameworks/contract.js';

const repo = fileURLToPath(new URL('../../../../', import.meta.url));
const fingerprint = bytes => ({bytes: Buffer.byteLength(bytes), sha256: createHash('sha256').update(bytes).digest('hex')});
const fail = message => {throw Error('E_SCRAPYJS_PREVIEW: ' + message);};
export async function compilePreviewRuntime({record = readFile} = {}) {
  const inputs = {};
  async function input(path) {
    const bytes = await record(path);
    const name = relative(repo, path);
    const row = fingerprint(bytes);
    if (inputs[name] && JSON.stringify(inputs[name]) !== JSON.stringify(row)) fail('runtime input changed: ' + name);
    inputs[name] = row;
    return bytes;
  }
  const contract = PAGE_FRAMEWORK_RUNTIMES.react;
  if (contract.version !== '19.2.0') fail('preview requires pinned React 19.2.0');
  const react = await input(resolve(repo, contract.source));
  if (JSON.stringify(fingerprint(react)) !== JSON.stringify({bytes: contract.bytes, sha256: contract.sha256}))
    fail('React runtime differs from fixed registry SHA');
  for (const name of ['src/libs/page-frameworks/contract.js', 'package-lock.json',
    'node_modules/esbuild/package.json', 'node_modules/react-dom/package.json',
    'examples/sidebar-tools/scrapyjs/preview/runtime-source.mjs']) await input(resolve(repo, name));
  const virtualModules = {};
  const result = await build({absWorkingDir: repo, entryPoints: ['src/entrypoints/sidebar-shared-ui.js'],
    bundle: true, write: false, metafile: true, format: 'iife', platform: 'browser', target: 'es2022',
    jsx: 'transform', minify: true, define: {'process.env.NODE_ENV': '"production"'},
    plugins: [{name: 'preview-presentation-only', setup(builder) {
      builder.onResolve({filter: /^wxt\/utils\/define-unlisted-script$/}, () => ({path: 'entry-wrapper', namespace: 'preview'}));
      builder.onResolve({filter: /^react(?:\/jsx-runtime)?$/}, ({path}) => ({path, namespace: 'preview'}));
      builder.onLoad({filter: /.*/, namespace: 'preview'}, ({path}) => {
        // Execute the canonical entry callback without importing the WXT lifecycle.
        const contents = path === 'entry-wrapper' ? 'export const defineUnlistedScript = callback => callback();' :
          'const value=globalThis.OpenDeskPageReact;export default value;export const {' +
          [...PAGE_FRAMEWORK_IMPORTS.react[path], ...(path === 'react' ? ['__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE', '__COMPILER_RUNTIME'] : [])].join(',') + '}=value;';
        virtualModules[path] = {contents, ...fingerprint(contents)};
        return {contents, loader: 'js'};
      });
      builder.onResolve({filter: /\?raw$/}, ({path, resolveDir}) => ({path: resolve(resolveDir, path.slice(0, -4)), namespace: 'preview-raw'}));
      builder.onLoad({filter: /.*/, namespace: 'preview-raw'}, async ({path}) => ({
        contents: 'export default ' + JSON.stringify((await input(path)).toString('utf8')), loader: 'js'}));
      builder.onLoad({filter: /.*/, namespace: 'file'}, async ({path}) => {
        const extension = extname(path);
        const loader = {'.js': 'js', '.mjs': 'js', '.cjs': 'js', '.jsx': 'jsx', '.ts': 'ts', '.tsx': 'tsx', '.json': 'json'}[extension];
        if (!loader) fail('unsupported presentation input: ' + path);
        return {contents: await input(path), loader, resolveDir: resolve(path, '..')};
      });
    }}]});
  if (result.outputFiles.length !== 1 || Object.values(result.metafile.outputs).some(row => row.imports.length))
    fail('presentation runtime must be a self-contained script');
  // Read again so a concurrent component edit cannot produce mixed evidence.
  for (const [name, expected] of Object.entries(inputs))
    if (JSON.stringify(fingerprint(await record(resolve(repo, name)))) !== JSON.stringify(expected))
      fail('runtime input changed during compilation: ' + name);
  const shared = Buffer.from(result.outputFiles[0].contents);
  const metafile = result.metafile;
  return {react, shared, provenance: {receiptStatus: 'SOURCE_COMPONENT_PREVIEW',
    sourceComponentPreview: true, wxtPassed: false, productionAcceptance: 'NOT_TESTED',
    reactVersion: contract.version, compiler: {name: 'esbuild', version: esbuildVersion,
      format: 'iife', platform: 'browser', target: 'es2022', jsx: 'transform', minify: true,
      define: {'process.env.NODE_ENV': '"production"'}, write: false},
    entry: 'src/entrypoints/sidebar-shared-ui.js', inputs, virtualModules,
    metafile, metafileSha256: fingerprint(JSON.stringify(metafile)).sha256,
    outputs: {react: fingerprint(react), shared: fingerprint(shared)}}};
}
