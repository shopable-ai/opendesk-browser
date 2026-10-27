// App-owned CI preparation: compile the same production React view with
// the isolated preview SDK fixture. No Host grants or installation occurs.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const repository=resolve(fileURLToPath(new URL('../../../../',import.meta.url)));
const result=spawnSync(process.platform==='win32'?'npm.cmd':'npm',
  ['run','build:preview','--prefix','examples/sidebar-tools/ai-vip-share'],
  {cwd:repository,stdio:'inherit',timeout:180000});
if(result.error)throw result.error;
if(result.status!==0)throw Error('E_AI_VIP_PREVIEW_BUILD: '+String(result.status??result.signal));
