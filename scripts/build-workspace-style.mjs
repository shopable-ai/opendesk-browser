import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {readFile,mkdir,mkdtemp,rename,rm} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const exec=promisify(execFile);
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const SOURCE=resolve(ROOT,'src/native-agent/workspace.tailwind.css');
const CLI=resolve(ROOT,'node_modules/@tailwindcss/cli/dist/index.mjs');
export const WORKSPACE_STYLE_INPUTS=Object.freeze([
  'src/native-agent/workspace.tailwind.css',
  'src/ui/design-tokens.css',
  'src/native-agent/workspace.html',
  'src/native-agent/workspace.js',
  'src/native-agent/workspace-chat-edit-ui.js'
]);
export const WORKSPACE_STYLE_DEST='native-agent/workspace.css';

export function inspectWorkspaceStyle(css) {
  if(typeof css!=='string'||Buffer.byteLength(css)<5000)throw Error('R22 Workspace CSS is missing/too small');
  const forbidden=/@(?:import|source|apply|tailwind|config|plugin)\b|\burl\s*\(|\bexpression\s*\(|(?:^|[;{])\s*behavior\s*:/i.exec(css);
  if(forbidden)
    throw Error('R22 Workspace CSS contains uncompiled directives or remote/unsafe CSS resources: '+JSON.stringify({token:forbidden[0],at:forbidden.index,near:css.slice(Math.max(0,forbidden.index-90),forbidden.index+140)}));
  for(const marker of ['--od-brand','--od-ink','--space-2','--radius-control','.workspace-layout','.file-surface','.chat-edit-panel',
    '.file-entry','.workspace-tool-preview','data-view'])
    if(!css.includes(marker))throw Error('R22 Workspace CSS missing expected contract: '+marker);
  return {bytes:Buffer.byteLength(css),sha256:createHash('sha256').update(css).digest('hex')};
}

export async function compileWorkspaceStyle(publicRoot=resolve(ROOT,'.wxt/public')) {
  const stageParent=resolve(ROOT,'.wxt');
  await mkdir(stageParent,{recursive:true});
  const stage=await mkdtemp(resolve(stageParent,'r22-style-'));
  const output=resolve(stage,'workspace.css');
  try{
    // No npx download, runtime Tailwind, CDN or browser-side compilation.
    await exec(process.execPath,[CLI,'-i',SOURCE,'-o',output,'--minify'],{
      cwd:ROOT,maxBuffer:2*1024*1024,windowsHide:true
    });
    const css=await readFile(output,'utf8');
    const fingerprint=inspectWorkspaceStyle(css);
    const target=resolve(publicRoot,WORKSPACE_STYLE_DEST);
    await mkdir(dirname(target),{recursive:true});
    await rename(output,target);
    return {...fingerprint,path:WORKSPACE_STYLE_DEST};
  }finally{
    await rm(stage,{recursive:true,force:true});
  }
}
