// R24.3 maintainer-only browser linker build. No user input is executed.
import {build} from 'esbuild';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {parse} from 'acorn';
const require=createRequire(import.meta.url);
if(require('esbuild/package.json').version!=='0.28.2')
  throw Error('E_BROWSER_LINKER_TOOLCHAIN');
const out=resolve('artifacts/r243-browser-linker');
await mkdir(out,{recursive:true});
const workerSource='src/ui/page-component-compiler-worker.js';
const workerBytes=await readFile(resolve(workerSource));
parse(workerBytes.toString('utf8'),{ecmaVersion:'latest',sourceType:'script'});
if(workerBytes.length>8192||!workerBytes.toString('utf8').includes("importScripts('../libs/page-frameworks/babel-7.29.9.min.js')"))
 throw Error('E_BROWSER_LINKER_WORKER');
const workerReport={id:'worker',source:workerSource,
  output:'page-component-compiler-worker.js',bytes:workerBytes.length,
  sha256:createHash('sha256').update(workerBytes).digest('hex'),
  sourceFiles:[workerSource]};
console.log('R243_BROWSER_LINKER_META '+JSON.stringify(workerReport));
await writeFile(resolve(out,'page-component-compiler-worker.js'),workerBytes);

for(const [id,input,output] of [
  ['component','src/libs/page-frameworks/page-component-browser-linker.js','page-component-linker-r243.mjs'],
  ['vue-transform','src/libs/page-frameworks/vue-sfc-transform.js','vue-sfc-transform-r243.mjs']
]){
  const result=await build({entryPoints:[resolve(input)],bundle:true,
    platform:'browser',format:'esm',target:'es2022',write:false,
    minify:true,metafile:true,legalComments:'none',logLevel:'silent',
    external:['./vue-sfc-compiler-3.5.22.mjs'],outfile:resolve(out,output)});
  if(result.outputFiles.length!==1)throw Error('E_BROWSER_LINKER_CHUNKS');
  const bytes=Buffer.from(result.outputFiles[0].contents),code=bytes.toString('utf8');
  parse(code,{ecmaVersion:'latest',sourceType:'module'});
  if(bytes.length>96*1024||bytes.length<1000||/\b(?:eval|Function|AsyncFunction|importScripts)\s*\(/.test(code))
    throw Error('E_BROWSER_LINKER_OUTPUT: '+id);
  if(id==='component'&&!code.includes('prepareBrowserPageComponent'))
    throw Error('E_BROWSER_LINKER_ENTRY');
  if(id==='vue-transform'&&!code.includes('vue-sfc-compiler-3.5.22.mjs'))
    throw Error('E_BROWSER_LINKER_VUE_RESOURCE');
  await writeFile(resolve(out,output),bytes);
  const report={id,source:input,output,bytes:bytes.length,
    sha256:createHash('sha256').update(bytes).digest('hex'),
    sourceFiles:Object.keys(result.metafile.inputs).sort()};
  console.log('R243_BROWSER_LINKER_META '+JSON.stringify(report));
  if(process.argv.includes('--emit-base64')){
    const encoded=bytes.toString('base64');
    console.log('R243_BROWSER_LINKER_BEGIN '+id);
    for(let n=0;n<encoded.length;n+=4096)
      console.log('R243_BROWSER_LINKER_PART '+id+' '+encoded.slice(n,n+4096));
    console.log('R243_BROWSER_LINKER_END '+id);
  }
}
