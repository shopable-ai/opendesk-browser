import {execFileSync} from 'node:child_process';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {verifyPackage} from './verify-package.mjs';
const mode = process.argv[2] || 'production';
if (!['production', 'development'].includes(mode)) throw new Error('Invalid mode');
const report = await verifyPackage(`dist/${mode}`, {mode});
await mkdir('artifacts', {recursive: true});
// Standard-library zip writer fixes order/time/mode so identical packages yield identical archives.
execFileSync('python3', ['scripts/zip-package.py', `dist/${mode}`, `artifacts/opendesk-browser-${mode}.zip`], {stdio: 'inherit'});
const zip = await readFile(`artifacts/opendesk-browser-${mode}.zip`);
const receipt = {status: 'passed', mode, packageHash: report.packageHash, zipSha256: createHash('sha256').update(zip).digest('hex'), bytes: zip.length};
await mkdir('docs/framework/evidence/wxt/packages', {recursive:true});
await writeFile(`docs/framework/evidence/wxt/packages/pack-${mode}.json`, JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt));
