// Pure trusted maintainer build; no user source is executed or uploaded.
// Uses the EXISTING, independently locked Vue example's @vue/compiler-sfc 3.5.22.
import {build} from 'vite';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve('examples/programs/page-ui-vue');
const outDir=resolve('artifacts/r243-sfc-compiler');
await mkdir(outDir,{recursive:true});
await build({
  configFile:false,root,mode:'production',
  build:{outDir,emptyOutDir:true,copyPublicDir:false,target:'es2022',
    minify:'esbuild',sourcemap:false,cssCodeSplit:false,
    lib:{entry:resolve(root,'src/sfc-compiler-entry.js'),formats:['es'],
      fileName:()=> 'vue-sfc-compiler.mjs'},
    rollupOptions:{output:{inlineDynamicImports:true}}}
});
const bytes=await readFile(resolve(outDir,'vue-sfc-compiler.mjs'));
const sha256=createHash('sha256').update(bytes).digest('hex');
console.log('R243_VUE_SFC_COMPILER '+JSON.stringify({version:'3.5.22',bytes:bytes.length,sha256,
  source:'examples/programs/page-ui-vue/src/sfc-compiler-entry.js'}));
if(process.argv.includes('--emit-base64')){
  console.log('R243_VUE_SFC_START');
  const base64=bytes.toString('base64');
  for(let i=0;i<base64.length;i+=4096)console.log('R243_VUE_SFC_PART '+base64.slice(i,i+4096));
  console.log('R243_VUE_SFC_END');
}
