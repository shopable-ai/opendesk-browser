import {defineConfig} from 'vite';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('.',import.meta.url));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function receiptPlugin(){
  return {name:'quick-notes-react-build-receipt',apply:'build',
    generateBundle(_,bundle){
      // Rollup lists approved external globals in chunk.imports even in an IIFE.
      // Only unexpected modules, dynamic loading or extra chunks are forbidden.
      const allowed=new Set(['react','react-dom/client','react/jsx-runtime','@opendesk/ui']);
      const chunks=Object.values(bundle).filter(item=>item.type==='chunk');
      if(chunks.length!==1||chunks[0].dynamicImports.length||
         chunks[0].imports.some(name=>!allowed.has(name)))
        throw Error('Quick Notes React must use one classic chunk and approved global externals');
    },
    async writeBundle(){
      const files={};
      for(const name of ['tool.js','tool.css']){
        const bytes=await readFile(join(root,'dist',name));
        files['dist/'+name]={bytes:bytes.length,sha256:hash(bytes)};
      }
      const path=join(root,'dist','build-ready.json');
      const tmp=path+'.'+randomUUID()+'.new';
      try{
        await writeFile(tmp,JSON.stringify({format:'opendesk.ui-build-ready.v1',
          buildId:randomUUID(),files},null,2)+'\n',{flag:'wx'});
        await rename(tmp,path);
      }catch(error){throw error;}
    }
  };
}
export default defineConfig({
  root,base:'./',esbuild:{jsx:'automatic'},plugins:[receiptPlugin()],
  define:{'process.env.NODE_ENV':JSON.stringify('production')},
  build:{target:'es2022',minify:'esbuild',cssCodeSplit:false,emptyOutDir:true,
    lib:{entry:resolve(root,'src/main.jsx'),name:'OpenDeskQuickNotesReact',
      formats:['iife'],fileName:()=>'tool.js',cssFileName:'tool'},
    rollupOptions:{
      external:['react','react-dom/client','react/jsx-runtime','@opendesk/ui'],
      output:{inlineDynamicImports:true,globals:{
        react:'OpenDeskPageReact',
        'react-dom/client':'OpenDeskPageReact',
        'react/jsx-runtime':'OpenDeskPageReact',
        '@opendesk/ui':'OpenDeskSidebarUI'
      }}
    }}
});
