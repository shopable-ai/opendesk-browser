// Trusted deterministic mirror of ONE author-maintained tool locale resource.
// Never import examples/sidebar-tools/** into a privileged fixed extension bundle.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {compileToolLocaleCatalog} from '../src/ui/app-localization.js';
export const READING_TOC_LOCALE_SOURCE='examples/sidebar-tools/reading-toc/locales.json';
export const READING_TOC_LOCALE_MIRROR='src/reading-toc/locales.generated.js';
const sourcePath=resolve(READING_TOC_LOCALE_SOURCE),outPath=resolve(READING_TOC_LOCALE_MIRROR);
const blobHash=raw=>createHash('sha1').update('blob '+Buffer.byteLength(raw)+'\0')
  .update(raw).digest('hex');

export function renderReadingTocTrustedLocales(raw){
  const parsed=JSON.parse(raw);
  compileToolLocaleCatalog(parsed); // includes stale, placeholder and pure-text checks
  const sha=blobHash(raw);
  return '// GENERATED from '+READING_TOC_LOCALE_SOURCE+'; do not edit.\n'+
    '// Source Git blob SHA-1: '+sha+'\n'+
    "export const READING_TOC_LOCALE_SOURCE_BLOB='"+sha+"';\n"+
    'export default Object.freeze('+JSON.stringify(parsed)+');\n';
}
export async function verifyReadingTocTrustedLocales(){
  const raw=await readFile(sourcePath,'utf8'),expected=renderReadingTocTrustedLocales(raw);
  const actual=await readFile(outPath,'utf8');
  if(actual!==expected)throw Error('E_TOC_LOCALE_TRUSTED_MIRROR_STALE: run node scripts/generate-reading-toc-locales.mjs --write and review diff');
  return {state:'MATCHED',source:READING_TOC_LOCALE_SOURCE,mirror:READING_TOC_LOCALE_MIRROR,
    sourceBlob:blobHash(raw)};
}
export async function writeReadingTocTrustedLocales(){
  const raw=await readFile(sourcePath,'utf8');
  await writeFile(outPath,renderReadingTocTrustedLocales(raw));
  return verifyReadingTocTrustedLocales();
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const action=process.argv.length===3&&process.argv[2]==='--write'?
    writeReadingTocTrustedLocales:verifyReadingTocTrustedLocales;
  action().then(result=>process.stdout.write(JSON.stringify(result,null,2)+'\n'))
    .catch(error=>{console.error(error.message);process.exitCode=1;});
}
