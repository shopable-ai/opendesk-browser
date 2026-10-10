// Developer-only operations for the single src/libs catalog. No runtime npm manager.
import {readdir,readFile,lstat} from 'node:fs/promises';
import {resolve,relative,join} from 'node:path';
import {createHash} from 'node:crypto';
import {BUILTIN_CATALOG} from '../src/libs/catalog.js';
import {RESOURCE_LIMITS} from './build-contract.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const vendors=Object.values(BUILTIN_CATALOG.libraries).filter(row=>row.origin==='vendor');
const command=process.argv[2]||'list';
const root=resolve('src/libs/vendor');
async function tree(dir){
  const rows=[];
  for(const name of await readdir(dir)){
    const full=join(dir,name),stat=await lstat(full);
    if(stat.isSymbolicLink()||!stat.isDirectory()&&!stat.isFile())
      throw Error('Library source symlink/non-file forbidden: '+full);
    if(stat.isDirectory())rows.push(...await tree(full));
    else rows.push(relative(process.cwd(),full).replaceAll('\\','/'));
  }
  return rows.sort();
}
async function verify(){
  const expected=vendors.flatMap(row=>[row.source,row.licenseSource]).sort();
  if(JSON.stringify(await tree(root))!==JSON.stringify(expected))
    throw Error('Unregistered or missing source under src/libs/vendor');
  const ids=new Set(),outputs=new Set();
  for(const row of Object.values(BUILTIN_CATALOG.libraries)){
    if(ids.has(row.id)||outputs.has(row.output)||!row.license||
      !/^[a-zA-Z0-9.\-]+$/.test(row.version)||!Array.isArray(row.worlds)||!row.worlds.length)
      throw Error('Duplicate ID/output or invalid library metadata: '+row.id);
    ids.add(row.id);outputs.add(row.output);
    if(!row.output.startsWith('libs/')||row.output.includes('..'))
      throw Error('Unapproved extension resource path: '+row.id);
    if(row.origin==='vendor'){
      const bytes=await readFile(row.source),license=await readFile(row.licenseSource);
      if(bytes.length!==row.bytes||bytes.length>RESOURCE_LIMITS.vendorBytes||sha(bytes)!==row.sha256||
        license.length<50||license.length>RESOURCE_LIMITS.licenseBytes||sha(license)!==row.licenseSha256)
        throw Error('Fixed vendor bytes/hash/license mismatch: '+row.id);
    }
  }
  const bootstrap=await readFile('src/libs/runtime/bootstrap.js');
  if(sha(bootstrap)!==BUILTIN_CATALOG.bootstrapSha256)throw Error('Bootstrap hash mismatch');
}
if(command==='list'){
  for(const row of Object.values(BUILTIN_CATALOG.libraries))
    console.log([row.id,row.version,row.origin,row.worlds.join('+'),row.default?'default':'opt-in',row.output].join('\t'));
}else if(command==='check'){
  await verify();console.log('LIBRARY_CATALOG_CHECK=PASS');
}else if(command==='hash'){
  const file=process.argv[3],full=resolve(file||'');
  if(!file||!full.startsWith(root+'/')||!(await lstat(full)).isFile())throw Error('Hash target must be a regular file under src/libs/vendor');
  const bytes=await readFile(full);console.log(JSON.stringify({source:relative(process.cwd(),full),bytes:bytes.length,sha256:sha(bytes)}));
}else throw Error('Use list, check or hash');
