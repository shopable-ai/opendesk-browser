// Build-only analysis. No extension-runtime import or emitted asset.
import {readFile, stat, writeFile, mkdir} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

function groupFor(path) {
  if (path.startsWith('src/platform/host/')) return 'platform/host';
  if (path.startsWith('src/platform/storage/')) return 'platform/storage';
  if (path.startsWith('src/platform/')) return 'platform/other';
  if (path.startsWith('src/framework/')) return 'framework';
  if (path.startsWith('src/scripting/')) return 'scripting';
  if (path.startsWith('src/')) return 'src/other';
  if (path.startsWith('node_modules/')) return 'npm';
  return 'virtual/other';
}

export function summarizeSwEvidence(receipt, physicalBytes) {
  if (receipt?.mode !== 'production' || receipt.status !== 'passed' || !Array.isArray(receipt.bundleModules))
    throw Error('Production build with Rollup bundleModules evidence required; old receipts are not measurements');
  const row = receipt.bundleModules.find(x => x.target === 'sw.js');
  const file = receipt.report?.files?.find(x => x.path === 'sw.js');
  if (!row || !file || !Array.isArray(row.modules) || row.modules.length === 0 ||
      !Number.isSafeInteger(file.bytes) || file.bytes !== row.bytes ||
      (physicalBytes !== undefined && file.bytes !== physicalBytes) || row.sha256 !== file.sha256)
    throw Error('SW evidence does not match actual output size/hash or lacks modules');
  const modules = row.modules.map(m => {
    if (!m.path || !Number.isSafeInteger(m.renderedLength) || m.renderedLength < 0 ||
        !Number.isSafeInteger(m.originalLength) || m.originalLength < 0)
      throw Error('Invalid Rollup module attribution');
    return {path:m.path, group:groupFor(m.path), renderedLength:m.renderedLength,
      originalLength:m.originalLength, ...(m.npm ? {npm:{name:m.npm.name,version:m.npm.version}} : {})};
  }).sort((a,b)=> b.renderedLength - a.renderedLength || a.path.localeCompare(b.path));
  const seen = new Set();
  for(const m of modules) {
    if (seen.has(m.path)) throw Error('Duplicate module evidence: ' + m.path);
    seen.add(m.path);
  }
  const groups = Object.values(modules.reduce((acc,m) => {
    const target = acc[m.group] ??= {group:m.group, modules:0, renderedLength:0, originalLength:0};
    target.modules++;
    target.renderedLength += m.renderedLength;
    target.originalLength += m.originalLength;
    return acc;
  },{})).sort((a,b)=>b.renderedLength-a.renderedLength);
  return {
    sourceIdentity: 'current-build-receipt-and-physical-sw',
    sw:{bytes:file.bytes,sha256:file.sha256,modules:modules.length},
    builtJs:receipt.bundleModules.filter(x=>x.target.endsWith('.js')).map(x=>({target:x.target,bytes:x.bytes})),
    totalFixedJsBytes:receipt.bundleModules.filter(x=>x.target.endsWith('.js')).reduce((n,x)=>n+x.bytes,0),
    renderedLengthNote:'Pre-minification Rollup renderedLength; NOT an allocation of final SW bytes. Do not sum as compressed module sizes.',
    groups,modules
  };
}

async function main() {
  const receipt=JSON.parse(await readFile('docs/framework/evidence/wxt/builds/build-production.json','utf8'));
  const outputSize=(await stat('dist/production/sw.js')).size;
  const result=summarizeSwEvidence(receipt,outputSize);
  const output=process.argv[2] ?? 'artifacts/r12-sw-analysis.json';
  await mkdir(dirname(resolve(output)),{recursive:true});
  await writeFile(output,JSON.stringify(result,null,2)+'\n');
  console.log('PHYSICAL_SW_BYTES='+result.sw.bytes+' MODULES='+result.sw.modules+' FIXED_JS_BYTES='+result.totalFixedJsBytes);
  console.log('Rollup renderedLength is PRE-minification; it is not compressed byte attribution');
  console.log('GROUPS '+JSON.stringify(result.groups));
  for (const m of result.modules.slice(0,30)) console.log('MODULE '+m.renderedLength+' '+m.path);
}
if(process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error=>{console.error(error);process.exitCode=1;});
}
