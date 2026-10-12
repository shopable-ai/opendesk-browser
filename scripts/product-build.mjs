// npm run build:product -- --product page-qa-inspector
// Separate WXT root/output: never writes the normal OpenDesk dist/production or .wxt.
import {prepare,build} from 'wxt';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import product from '../products/page-qa-inspector/product.config.mjs';
import {resolveProduct} from '../packages/extension-factory/resolve-product.mjs';
import {verifyProduct} from './product-verify.mjs';

export function parseProductArgs(args) {
  if(!Array.isArray(args)||args.length!==2||args[0]!=='--product'||
     args[1]!=='page-qa-inspector')throw Error('Use --product page-qa-inspector (no extra options)');
  return args[1];
}
async function sha256File(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}
export const PRODUCT_INPUTS=Object.freeze([
  'products/page-qa-inspector/package.json',
  'products/page-qa-inspector/product.config.mjs',
  'products/page-qa-inspector/wxt.config.mjs',
  'products/page-qa-inspector/entrypoints/popup.html',
  'products/page-qa-inspector/ui/popup.js',
  'products/page-qa-inspector/ui/popup.css',
  'packages/extension-factory/feature-catalog.mjs',
  'packages/extension-factory/resolve-product.mjs',
  'packages/features/page-qa/capture.js',
  'packages/features/page-qa/a11y.js',
  'packages/features/page-qa/highlight.js',
  'packages/features/page-qa/identity.js',
  'packages/features/page-qa/settings.js',
  'src/ui/design-tokens.css',
  'scripts/product-build.mjs',
  'scripts/product-verify.mjs',
  'scripts/product-pack.mjs',
  'scripts/zip-package.py',
  'package.json',
  'package-lock.json'
].sort());
async function sourceFingerprint() {
  const rows=await Promise.all(PRODUCT_INPUTS.map(async path=>({path,sha256:await sha256File(path)})));
  return {sha256:createHash('sha256').update(JSON.stringify(rows)).digest('hex'),files:rows};
}
export async function buildProduct(id) {
  const plan=resolveProduct(product);
  if(plan.productId!==id)throw Error('Unknown product: '+id);
  const before=await sourceFingerprint();
  const root=resolve('products',id),configFile=resolve(root,'wxt.config.mjs');
  await mkdir(resolve(root,'public'),{recursive:true});
  // WXT may generate product-local .wxt; do not share the main OpenDesk build cache.
  const args={root,configFile,mode:'production',browser:'chrome',manifestVersion:3};
  await prepare(args);
  await build(args);
  const after=await sourceFingerprint();
  if(JSON.stringify(before)!==JSON.stringify(after))
    throw Error('Page QA sources changed during WXT build');
  const output=resolve('dist/products',id,'production');
  const report=await verifyProduct(output,plan);
  const receipt={status:'BUILD_VERIFIED',productId:id,version:plan.version,mode:'production',
    sourceFingerprint:before.sha256,sourceFiles:before.files,
    packageHash:report.packageHash,assets:report.files};
  const destination=resolve('artifacts/products',id);
  await mkdir(destination,{recursive:true});
  await writeFile(resolve(destination,'build-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
  return receipt;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const id=parseProductArgs(process.argv.slice(2));
  console.log(JSON.stringify(await buildProduct(id),null,2));
}
