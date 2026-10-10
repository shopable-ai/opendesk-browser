// Build-only report for every WXT fixed entry. Never import from an extension runtime.
// A receipt without the matching physical files is NOT an acceptance measurement.
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname, join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {PACKAGE_ENTRIES, BUILD_POLICY} from './build-contract.mjs';

export const FIXED_ENTRY_PATHS = Object.freeze(Object.keys(PACKAGE_ENTRIES).map(name => name + '.js').sort());
const SHA256 = /^[0-9a-f]{64}$/;
const byteHash = bytes => createHash('sha256').update(bytes).digest('hex');
const compare = (a,b) => JSON.stringify(a) === JSON.stringify(b);

export function summarizeFixedEntries(receipt, measuredFiles) {
  if (receipt?.mode !== 'production' || receipt.status !== 'passed' ||
      !Array.isArray(receipt.bundleModules) || !Array.isArray(receipt.report?.files) ||
      typeof receipt.report.packageHash !== 'string') {
    throw Error('A passed production build receipt with Rollup module evidence is required');
  }
  const targets = receipt.bundleModules.map(item => item.target).sort();
  if (!compare(targets, FIXED_ENTRY_PATHS)) throw Error('Fixed entry module evidence is missing, duplicated or unexpected');
  if (!measuredFiles || !compare(Object.keys(measuredFiles).sort(), FIXED_ENTRY_PATHS))
    throw Error('Every fixed entry must be physically measured from the matching output directory');
  const reportRows = new Map();
  for (const file of receipt.report.files) {
    if (typeof file.path !== 'string' || reportRows.has(file.path)) throw Error('Duplicate or invalid package path');
    reportRows.set(file.path, file);
  }
  const budget = BUILD_POLICY.productionBytes;
  const entries = receipt.bundleModules.map(row => {
    const recorded = reportRows.get(row.target), physical = measuredFiles[row.target];
    if (!recorded || !Number.isSafeInteger(recorded.bytes) || recorded.bytes <= 0 ||
        !SHA256.test(recorded.sha256 || '') || !Number.isSafeInteger(row.bytes) ||
        row.bytes !== recorded.bytes || row.sha256 !== recorded.sha256 ||
        !physical || physical.bytes !== recorded.bytes || physical.sha256 !== recorded.sha256) {
      throw Error('Physical file / production receipt size or hash mismatch: ' + row.target);
    }
    if (!Array.isArray(row.modules) || !row.modules.length) throw Error('Missing module graph: ' + row.target);
    const paths = new Set();
    for (const module of row.modules) {
      if (typeof module.path !== 'string' || !module.path || paths.has(module.path) ||
          !Number.isSafeInteger(module.renderedLength) || module.renderedLength < 0 ||
          !Number.isSafeInteger(module.originalLength) || module.originalLength < 0) {
        throw Error('Invalid or duplicate Rollup module attribution: ' + row.target);
      }
      paths.add(module.path);
      if (row.target === 'sw.js' &&
          (/(?:^|\/)node_modules\/(?:lodash-es|dayjs)\//.test(module.path) ||
            ['lodash-es', 'dayjs'].includes(module.npm?.name) ||
            module.path === 'src/runtime/builtin-libraries/core.js')) {
        throw Error('Preinstalled library implementation unexpectedly bundled into privileged SW: ' + module.path);
      }
    }
    if (recorded.bytes > budget) throw Error('Fixed entry exceeds unchanged production byte budget: ' + row.target);
    const ratio = recorded.bytes / budget;
    return {
      path: row.target, bytes: recorded.bytes, sha256: recorded.sha256,
      budgetBytes: budget, remainingBytes: budget - recorded.bytes,
      usagePercent: Math.round(ratio * 10000) / 100,
      risk: ratio >= 0.9 ? 'critical' : ratio >= 0.8 ? 'watch' : 'normal',
      designReserveDebtBytes: Math.max(0, recorded.bytes - Math.floor(budget * 0.8)),
      moduleCount: row.modules.length,
      topModulesPreMinify: row.modules.slice().sort((a,b) => b.renderedLength - a.renderedLength)
        .slice(0, 5).map(module => ({path:module.path, renderedLength:module.renderedLength}))
    };
  }).sort((a,b) => b.bytes - a.bytes || a.path.localeCompare(b.path));
  return {
    kind: 'physical-verified-fixed-entry-budget', mode: 'production',
    packageHash: receipt.report.packageHash,
    budgetSource: 'scripts/build-contract.mjs',
    productionBudgetBytes: budget,
    policy: {watchAtPercent:80, criticalAtPercent:90, designReservePercent:20},
    attributionNote: 'renderedLength is PRE-minification Rollup length, NOT compressed bytes.',
    fixedEntryCount: entries.length,
    totalFixedJsBytes: entries.reduce((sum,row) => sum + row.bytes,0),
    critical: entries.filter(row => row.risk === 'critical').map(row => row.path),
    watch: entries.filter(row => row.risk === 'watch').map(row => row.path),
    entries
  };
}

export async function measureFixedEntries({outputRoot = 'dist/production',
  receiptPath = 'docs/framework/evidence/wxt/builds/build-production.json'} = {}) {
  const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
  const measured = {};
  for (const path of FIXED_ENTRY_PATHS) {
    const bytes = await readFile(join(outputRoot,path));
    measured[path] = {bytes:bytes.length,sha256:byteHash(bytes)};
  }
  return summarizeFixedEntries(receipt, measured);
}

async function main() {
  const output = process.argv[2] || 'artifacts/fixed-entry-budget.json';
  const report = await measureFixedEntries();
  await mkdir(dirname(resolve(output)), {recursive:true});
  await writeFile(output, JSON.stringify(report,null,2) + '\n');
  for (const row of report.entries) {
    console.log('FIXED_ENTRY ' + row.risk.toUpperCase() + ' ' + row.path + ': ' +
      row.bytes + '/' + row.budgetBytes + ' bytes; remaining=' + row.remainingBytes +
      '; modules=' + row.moduleCount);
  }
  console.log('FIXED_ENTRIES_VERIFIED=' + report.fixedEntryCount +
    ' PACKAGE_HASH=' + report.packageHash);
  if (report.critical.length) console.warn('ARCHITECTURE_DEBT critical entries: ' + report.critical.join(', '));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch(error => {console.error(error);process.exitCode = 1;});
