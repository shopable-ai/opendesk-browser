// Lock source bytes to the preview-generation contract. CI rejects stale locks.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {generatePreview,buildPreview} from './build-preview.mjs';

export const PREVIEW_LOCK_FORMAT='opendesk.ui-preview-source-lock.v1';
export const PREVIEW_INPUTS=Object.freeze([
  'src/ui/design-tokens.css',
  'src/ui/design-system.css',
  'examples/sidebar-tools/quick-notes/tool.config.json',
  'examples/sidebar-tools/quick-notes/src/index.html',
  'examples/sidebar-tools/quick-notes/src/main.js',
  'examples/sidebar-tools/quick-notes/src/style.css',
  'examples/sidebar-tools/quick-notes/assets/mark.png',
  'scripts/build-sidebar-tool.mjs',
  'scripts/preview/shared-tool-design.mjs',
  'scripts/preview/sidebar-shell-source.mjs',
  'scripts/templates/sidebar-tool-preview-shell.html',
  'scripts/preview/build-preview.mjs',
  'scripts/preview/quick-notes-mock.js',
  'scripts/preview/check-preview-contract.mjs'
]);
const root=fileURLToPath(new URL('../../',import.meta.url));
const lockPath=resolve(root,'contracts/ui-preview/quick-notes.lock.json');
const gitBlobHash=bytes=>createHash('sha1').update('blob '+bytes.length+'\0')
  .update(bytes).digest('hex');

export async function previewSourceHashes(reader=path=>readFile(resolve(root,path))){
  const result={};
  for(const path of PREVIEW_INPUTS){
    const bytes=await reader(path);
    result[path]=gitBlobHash(Buffer.from(bytes));
  }
  return result;
}
export function assertPreviewLock(lock,hashes){
  if(lock?.format!==PREVIEW_LOCK_FORMAT||lock.tool!=='quick-notes'||
    !lock.files||typeof lock.files!=='object'||Array.isArray(lock.files)||
    Object.keys(lock.files).sort().join('\n')!==[...PREVIEW_INPUTS].sort().join('\n'))
    throw Error('E_UI_PREVIEW_LOCK: wrong or incomplete source lock');
  for(const path of PREVIEW_INPUTS){
    if(!/^[0-9a-f]{40}$/.test(lock.files[path])||lock.files[path]!==hashes[path])
      throw Error('E_UI_PREVIEW_LOCK: stale preview input '+path+
        ' (regenerate and review preview before --update-lock)');
  }
  return true;
}
export async function verifyPreviewLock(){
  const lock=JSON.parse(await readFile(lockPath,'utf8'));
  assertPreviewLock(lock,await previewSourceHashes());
  const one=await generatePreview(),two=await generatePreview();
  if(one.html!==two.html)throw Error('E_UI_PREVIEW_LOCK: nondeterministic HTML');
  if(!one.html.includes('sandbox="allow-scripts"'))throw Error('E_UI_PREVIEW_LOCK: sandbox missing');
  return {status:'SOURCE_LOCK_AND_DETERMINISM_PASS',
    tool:'quick-notes',sourceCommit:one.manifest.sourceCommit,
    designSha256:one.manifest.designSha256,uiSha256:one.manifest.uiSha256};
}
export async function refreshPreviewLock(){
  const first=await generatePreview(),second=await generatePreview();
  if(first.html!==second.html)throw Error('E_UI_PREVIEW_LOCK: nondeterministic HTML');
  const generated=await buildPreview();
  const lock={format:PREVIEW_LOCK_FORMAT,tool:'quick-notes',files:await previewSourceHashes()};
  await mkdir(dirname(lockPath),{recursive:true});
  await writeFile(lockPath,JSON.stringify(lock,null,2)+'\n');
  return {status:'REGENERATED_REVIEW_REQUIRED',preview:generated.output,lock:lockPath,
    designSha256:first.manifest.designSha256,uiSha256:first.manifest.uiSha256};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const task=process.argv.length===2?verifyPreviewLock:
    process.argv.length===3&&process.argv[2]==='--update-lock'?refreshPreviewLock:null;
  if(!task){console.error('Usage: node scripts/preview/check-preview-contract.mjs [--update-lock]');process.exitCode=1;}
  else task().then(value=>process.stdout.write(JSON.stringify(value,null,2)+'\n'))
    .catch(error=>{console.error(error.message);process.exitCode=1;});
}