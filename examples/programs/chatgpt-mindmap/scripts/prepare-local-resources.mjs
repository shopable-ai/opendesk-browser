// Local development only; original vendor bytes and approval state stay unchanged.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,rename,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {build} from 'esbuild';
import {verifyFixedXmindAssets} from '../preview/serve.mjs';

const project=fileURLToPath(new URL('../',import.meta.url));
const output=join(project,'.opendesk-local');
await mkdir(output,{recursive:true});
const resources=await verifyFixedXmindAssets();
const child=await build({
  entryPoints:[join(project,'src/xmind-installed-child.js')],
  bundle:true,format:'iife',platform:'browser',write:false,
  sourcemap:false,minify:false
});
const snowbrush=resources.get('/snowbrush-2c2b5d62b5.js').toString('utf8');
assert.equal(snowbrush.split('eval(task)').length,2,'Fixed reference timer fallback changed');
const timerGuard='(()=>{throw new Error("E_XMIND_STRING_TIMER_UNSUPPORTED");})()';
const runtime=[...resources].map(([path,bytes])=>path==='/snowbrush-2c2b5d62b5.js'
  ?snowbrush.replace('eval(task)',timerGuard):bytes.toString('utf8')).join('\n;\n')+
  '\n;\n'+child.outputFiles[0].text;
const temporary=join(output,'xmind-runtime.js');
await writeFile(temporary,runtime);
await rename(temporary,join(project,'assets/xmind-runtime.js'));
const sha256=createHash('sha256').update(runtime).digest('hex');
await writeFile(join(output,'resource.json'),JSON.stringify({
  scope:'LOCAL_DEVELOPMENT_ONLY',resourceId:'xmind-runtime',sha256,
  bytes:Buffer.byteLength(runtime),productionRedistribution:'NOT_APPROVED'
},null,2)+'\n');
console.log(JSON.stringify({resourceId:'xmind-runtime',sha256,bytes:Buffer.byteLength(runtime)}));
