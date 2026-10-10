import {defineConfig} from 'vite';
import vue from '@vitejs/plugin-vue';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(fileURLToPath(import.meta.url));
// Published only after Vite finishes writing BOTH generated JS and CSS.
// Every watch success issues a new ID; an error never announces new code.
function completeBuild(){
  return {name:'opendesk-tool-build-receipt',apply:'build',
    async writeBundle(){
      const files={};
      for(const name of ['tool.js','tool.css']){
        const bytes=await readFile(join(root,'dist',name));
        files['dist/'+name]={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
      }
      const ready={format:'opendesk.ui-build-ready.v1',buildId:randomUUID(),files};
      const destination=join(root,'dist','build-ready.json'),temp=destination+'.'+randomUUID()+'.new';
      await writeFile(temp,JSON.stringify(ready,null,2)+'\n',{flag:'wx'});
      await rename(temp,destination);
    }
  };
}
export default defineConfig({root,base:'./',
  plugins:[vue(),completeBuild()],
  define:{'process.env.NODE_ENV':JSON.stringify('production')},
  build:{target:'es2022',minify:'esbuild',cssCodeSplit:false,emptyOutDir:true,
    lib:{entry:resolve(root,'src/main.js'),name:'OpenDeskToolUI',
      formats:['iife'],fileName:()=>'tool.js',cssFileName:'tool'},
    rollupOptions:{external:[],output:{inlineDynamicImports:true}}}
});
