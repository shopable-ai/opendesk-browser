// Local development only. Never promotes vendor bytes or changes license/install status.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir,cp,realpath} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {verifyFixedXmindAssets} from '../preview/serve.mjs';

const project=fileURLToPath(new URL('../',import.meta.url));
const args={};
for(let i=2;i<process.argv.length;i+=2)args[process.argv[i]]=process.argv[i+1];
assert(args['--out']&&args['--compiler-root'],
  'Usage: node scripts/build-local-preview.mjs --out <new artifact directory> --compiler-root <existing repository compiler>');
const out=resolve(args['--out']),compilerRoot=await realpath(args['--compiler-root']);
assert(!out.startsWith(project),'Local preview output must stay outside the business project');
await mkdir(out,{recursive:false});
const snapshot=join(out,'project');
await mkdir(snapshot);
await cp(join(project,'src'),join(snapshot,'src'),{recursive:true});
await cp(join(project,'assets'),join(snapshot,'assets'),{recursive:true});
const pkg=JSON.parse(await readFile(join(project,'package.json'),'utf8'));
pkg.opendesk.pageFrames=[{resourceId:'xmind-runtime',path:'assets/xmind-runtime.js'}];
await writeFile(join(snapshot,'package.json'),JSON.stringify(pkg,null,2)+'\n');

const require=createRequire(join(compilerRoot,'package.json'));
const webpack=require('webpack');
const compiler=webpack({mode:'none',target:'web',entry:join(snapshot,'src/xmind-installed-child.js'),
  devtool:false,output:{path:join(out,'child'),filename:'child.js',iife:true},
  optimization:{minimize:false},performance:{hints:false}});
try{
  const stats=await new Promise((ok,no)=>compiler.run((error,result)=>error?no(error):ok(result)));
  assert(!stats.hasErrors(),stats.toString({all:false,errors:true}));
}finally{await new Promise((ok,no)=>compiler.close(error=>error?no(error):ok()));}

const resources=await verifyFixedXmindAssets();
const child=await readFile(join(out,'child/child.js'),'utf8');
// Snowbrush's string timer fallback cannot run under the existing no-eval CSP.
// Keep original reference bytes untouched; fail explicitly at that exact call.
const snowbrush=resources.get('/snowbrush-2c2b5d62b5.js').toString('utf8');
assert.equal(snowbrush.split('eval(task)').length,2,'Fixed reference timer fallback changed');
const timerGuard='(()=>{throw new Error("E_XMIND_STRING_TIMER_UNSUPPORTED");})()';
const runtime=[...resources].map(([path,bytes])=>path==='/snowbrush-2c2b5d62b5.js'
  ?snowbrush.replace('eval(task)',timerGuard):bytes.toString('utf8')).join('\n;\n')+'\n;\n'+child;
await writeFile(join(snapshot,'assets/xmind-runtime.js'),runtime);
const {buildProgramProject}=await import(pathToFileURL(join(compilerRoot,'scripts/build-program-project.mjs')).href);
const artifact=await buildProgramProject(snapshot,{outputDirectory:join(out,'build'),mode:'production'});
assert.equal(artifact.installable,false);
assert.equal(artifact.status,'BUILT_UNVERIFIED');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const record={format:'opendesk.mindmap.local-preview.v1',scope:'LOCAL_DEVELOPMENT_ONLY',
  productionRedistribution:'NOT_APPROVED',formalInstallation:'NOT_TESTED',
  compilerRoot,webpack:webpack.version,program:artifact,
  resources:[...resources].map(([path,bytes])=>({path,bytes:bytes.length,sha256:sha(bytes)})),
  localTransforms:[{path:'snowbrush-2c2b5d62b5.js',from:'eval(task)',to:timerGuard,
    reason:'Deny string timer execution under the unchanged Page frame CSP',count:1}],
  child:{bytes:Buffer.byteLength(child),sha256:sha(child)},
  fixedResource:{resourceId:'xmind-runtime',bytes:Buffer.byteLength(runtime),sha256:sha(runtime)}};
await writeFile(join(out,'local-preview.json'),JSON.stringify(record,null,2)+'\n');
console.log(JSON.stringify({scope:record.scope,sourceHash:artifact.sourceHash,
  sourceBytes:artifact.sourceBytes,fixedResource:record.fixedResource,
  program:join(out,'build/program.js'),status:artifact.status,installable:artifact.installable}));
