import {readFile,realpath,mkdir,writeFile,lstat} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {PACKAGED_TASK_RESOURCES,assertPackagedTask} from '../src/platform/tasks/builtin-releases.js';
import {TASK_PACKAGE_LIMIT} from '../src/platform/source-budgets.js';

export {PACKAGED_TASK_RESOURCES};
export async function readPackagedTaskResource(sourcePath,{root=process.cwd()}={}){
  root=await realpath(root);
  const row=PACKAGED_TASK_RESOURCES.find(row=>row.sourcePath===sourcePath);
  if(!row)throw Error('Undeclared Task resource: '+sourcePath);
  const file=resolve(root,sourcePath);
  if(await realpath(file)!==file)throw Error('Task resource must not be a symlink: '+sourcePath);
  if((await lstat(file)).size>TASK_PACKAGE_LIMIT)throw Error('Oversized Task resource: '+sourcePath);
  const bytes=await readFile(file),pkg=await assertPackagedTask(JSON.parse(bytes.toString('utf8')));
  if(pkg.manifest.taskId!==row.taskId||pkg.manifest.version!==row.version||
    pkg.manifestHash!==row.manifestHash||pkg.manifest.program.sourceHash!==row.sourceHash)
    throw Error('Task resource identity differs: '+sourcePath);
  return bytes;
}
export async function preparePackagedTaskResources(directory,{root=process.cwd()}={}){
  // Validate the complete set before changing any published resource.
  const resources=await Promise.all(PACKAGED_TASK_RESOURCES.map(async row=>[
    row.path,await readPackagedTaskResource(row.sourcePath,{root})
  ]));
  await mkdir(directory,{recursive:true});directory=await realpath(directory);
  for(const [path,bytes] of resources){
    const file=resolve(directory,path);
    await mkdir(dirname(file),{recursive:true});
    if(await realpath(dirname(file))!==dirname(file))throw Error('Task output directory must not be a symlink');
    try{if((await lstat(file)).isSymbolicLink())throw Error('Task output must not be a symlink');}
    catch(error){if(error.code!=='ENOENT')throw error;}
    await writeFile(file,bytes);
  }
}
export async function verifyPackagedTaskResources(directory,{root=process.cwd()}={}){
  directory=await realpath(directory);
  for(const row of PACKAGED_TASK_RESOURCES){
    const file=resolve(directory,row.path);
    if(await realpath(file)!==file)throw Error('Packaged Task must not be a symlink: '+row.path);
    const expected=await readPackagedTaskResource(row.sourcePath,{root});
    const bytes=await readFile(file);
    if(!bytes.equals(expected))throw Error('Packaged Task resource differs from reviewed source: '+row.path);
  }
}
