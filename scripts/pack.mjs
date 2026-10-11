import {execFileSync} from 'node:child_process';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {verifyPackage} from './verify-package.mjs';
const mode = process.argv[2] || 'production';
if (!['production', 'development'].includes(mode)) throw new Error('Invalid mode');
const report = await verifyPackage(`dist/${mode}`, {mode});
const outputDir=process.env.OPENDESK_PACKAGE_OUTPUT_DIR||'artifacts';
const evidenceDir=process.env.OPENDESK_PACKAGE_EVIDENCE_DIR||'docs/framework/evidence/wxt/packages';
await mkdir(outputDir, {recursive: true});
// Standard-library zip writer fixes order/time/mode so identical packages yield identical archives.
const zipPath=`${outputDir}/opendesk-browser-${mode}.zip`;
execFileSync('python3', ['scripts/zip-package.py', `dist/${mode}`, zipPath], {stdio: 'inherit'});
const zip = await readFile(zipPath);
const receipt = {status: 'passed', mode, packageHash: report.packageHash, zipSha256: createHash('sha256').update(zip).digest('hex'), bytes: zip.length};
await mkdir(evidenceDir, {recursive:true});
await writeFile(`${evidenceDir}/pack-${mode}.json`, JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt));
