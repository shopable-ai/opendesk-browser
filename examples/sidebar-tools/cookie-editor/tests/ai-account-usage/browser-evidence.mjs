// Bind simulated browser evidence to the actual checkout, drivers and bundles.
import {readFile, readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const repo = new URL('../../../../../', import.meta.url);
const owner = 'examples/sidebar-tools/cookie-editor/';
const hashFiles = async paths => Object.fromEntries(await Promise.all(paths.sort().map(async path =>
  [path, createHash('sha256').update(await readFile(new URL(path, repo))).digest('hex')])));

export async function browserEvidence(build) {
  if (!['dist', 'preview-dist'].includes(build)) throw new Error('E_EVIDENCE_BUILD');
  const paths = [owner+'package.json', owner+'preview/ai-account-usage.html', owner+'tests/usage-entry-boundary.test.mjs',
    owner+'trusted/account-contract.js', owner+'trusted/account-service.js',
    'src/platform/chrome/context-menus.js', 'src/framework/sdk/browser-contract.js', 'package.json', 'package-lock.json',
    'src/ui/design-tokens.css', '.github/workflows/ai-account-usage-r19.yml'];
  for (const directory of ['ai-account-usage/', 'ai-account-usage/web/', 'tests/ai-account-usage/']) {
    for (const entry of await readdir(new URL(owner+directory, repo), {withFileTypes:true}))
      if (entry.isFile() && /\.(mjs|jsx|css|html|json)$/.test(entry.name)) paths.push(owner+directory+entry.name);
  }
  return {
    checkoutSha:execFileSync('git', ['rev-parse', 'HEAD'], {cwd:fileURLToPath(repo), encoding:'utf8'}).trim(),
    inputs:await hashFiles(paths),
    assets:await hashFiles(['index.html', 'app.js', 'app.css'].map(name=>owner+'ai-account-usage/web/'+build+'/'+name)),
    ...(build==='preview-dist' ? {standalone:await hashFiles([owner+'ai-account-usage/web/preview/index.html'])} : {})
  };
}
