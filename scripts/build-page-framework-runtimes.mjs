// Offline maintainers' build of pinned frameworks for the existing Page runtime.
// It never compiles individual end-user programs and never executes CDN code.
import {build} from 'vite';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const targets=[
  {id:'react',root:resolve('examples/programs/page-ui-react'),entry:'src/runtime-entry.js'},
  {id:'vue',root:resolve('examples/programs/page-ui-vue'),entry:'src/runtime-entry.js'}
];
for(const target of targets){
  const outDir=resolve('artifacts','r241-no-build',target.id);
  await mkdir(outDir,{recursive:true});
  await build({
    configFile:false,root:target.root,mode:'production',
    define:{'process.env.NODE_ENV':JSON.stringify('production')},
    build:{outDir,emptyOutDir:true,copyPublicDir:false,target:'es2022',
      minify:'esbuild',sourcemap:false,cssCodeSplit:false,
      lib:{entry:resolve(target.root,target.entry),formats:['iife'],
        name:'OpenDeskPageFrameworkBundle',fileName:()=> 'runtime.js'},
      rollupOptions:{output:{inlineDynamicImports:true}}}
  });
  const data=await readFile(resolve(outDir,'runtime.js'));
  const hash=createHash('sha256').update(data).digest('hex');
  console.log(JSON.stringify({id:target.id,bytes:data.length,sha256:hash,file:resolve(outDir,'runtime.js')}));
  if(process.argv.includes('--emit-base64')){
    console.log('R241_RUNTIME_START '+target.id);
    const value=data.toString('base64');
    for(let i=0;i<value.length;i+=4096)
      console.log('R241_RUNTIME_PART '+target.id+' '+value.slice(i,i+4096));
    console.log('R241_RUNTIME_END '+target.id);
  }
}
