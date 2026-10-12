// The archive is built only from a successfully re-verified independent WXT root.
import {execFileSync} from 'node:child_process';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import product from '../products/page-qa-inspector/product.config.mjs';
import {resolveProduct} from '../packages/extension-factory/resolve-product.mjs';
import {parseProductArgs} from './product-build.mjs';
import {verifyProduct} from './product-verify.mjs';

export async function packProduct(id) {
  const plan=resolveProduct(product);
  if(id!==plan.productId)throw Error('Unknown product');
  const source=resolve('dist/products',id,'production');
  const report=await verifyProduct(source,plan);
  const directory=resolve('artifacts/products',id);
  const previous=JSON.parse(await readFile(resolve(directory,'build-receipt.json'),'utf8'));
  if(previous.status!=='BUILD_VERIFIED'||previous.productId!==id||
     previous.version!==plan.version||previous.packageHash!==report.packageHash)
    throw Error('Pack candidate does not match verified product build receipt');
  const filename=id+'-'+plan.version+'-production.zip';
  const zipPath=resolve(directory,filename);
  await mkdir(directory,{recursive:true});
  execFileSync('python3',['scripts/zip-package.py',source,zipPath],{stdio:'inherit'});
  const bytes=await readFile(zipPath);
  if(bytes.length>plan.budgets.maxZipBytes)throw Error('Page QA ZIP byte budget exceeded');
  const receipt={status:'PACK_VERIFIED',productId:id,version:plan.version,
    packageHash:report.packageHash,zipSha256:createHash('sha256').update(bytes).digest('hex'),
    zipBytes:bytes.length,zipFile:filename,files:report.files};
  // Compare every compressed payload with the approved output (not only file names).
  const verify=`import sys,zipfile,pathlib
root=pathlib.Path(sys.argv[1]); archive=pathlib.Path(sys.argv[2])
expected={p.relative_to(root).as_posix():p.read_bytes() for p in root.rglob('*') if p.is_file()}
with zipfile.ZipFile(archive) as z:
 assert z.testzip() is None
 assert sorted(z.namelist())==sorted(expected)
 for path,raw in expected.items(): assert z.read(path)==raw,path
print('PRODUCT_ZIP_EXACT_DIST_BYTES=PASS',len(expected))
`;
  execFileSync('python3',['-c',verify,source,zipPath],{stdio:'inherit'});
  await writeFile(resolve(directory,'pack-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
  return receipt;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const id=parseProductArgs(process.argv.slice(2));
  console.log(JSON.stringify(await packProduct(id),null,2));
}
