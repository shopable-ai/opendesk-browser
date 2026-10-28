import {defineConfig} from 'vite';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('.',import.meta.url));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
function receiptPlugin(){
  const names=['src/sidebar/main.jsx','src/sidebar/App.jsx','src/sidebar/style.css','src/shared/queue-contract.js'];
  return {name:'send-queue-source-bound-receipt',apply:'build',
    generateBundle(_,bundle){
      const chunks=Object.values(bundle).filter(row=>row.type==='chunk');
      const approved=new Set(['react','react-dom/client','react/jsx-runtime','@opendesk/ui']);
      if(chunks.length!==1||chunks[0].dynamicImports.length||
         chunks[0].imports.some(name=>!approved.has(name)))
        throw Error('Queue React must have one IIFE chunk with only approved shared runtime imports');
    },
    async writeBundle(){
      const cssFile=join(root,'dist','tool.css');
      const css=await readFile(cssFile,'utf8');
      const marker='/* @opendesk-shared-design */';
      if(!css.trimStart().startsWith(marker))
        await writeFile(cssFile,marker+'\n'+css);
      const files={},sources={};
      for(const name of ['dist/tool.js','dist/tool.css']){
        const bytes=await readFile(join(root,name));
        files[name]={bytes:bytes.length,sha256:digest(bytes)};
      }
      for(const name of names){
        const bytes=await readFile(join(root,name));
        sources[name]={bytes:bytes.length,sha256:digest(bytes)};
      }
      const file=join(root,'dist','build-ready.json'),temporary=file+'.'+randomUUID()+'.new';
      await writeFile(temporary,JSON.stringify({format:'opendesk.ui-build-ready.v1',
        buildId:randomUUID(),files,sources},null,2)+'\n',{flag:'wx'});
      await rename(temporary,file);
    }
  };
}
export default defineConfig({
  root,base:'./',esbuild:{jsx:'automatic'},plugins:[receiptPlugin()],
  define:{'process.env.NODE_ENV':JSON.stringify('production')},
  build:{target:'es2022',minify:'esbuild',cssCodeSplit:false,emptyOutDir:true,
    lib:{entry:resolve(root,'src/sidebar/main.jsx'),name:'OpenDeskSendQueue',
      formats:['iife'],fileName:()=>'tool.js',cssFileName:'tool'},
    rollupOptions:{external:['react','react-dom/client','react/jsx-runtime','@opendesk/ui'],
      output:{inlineDynamicImports:true,globals:{
        react:'OpenDeskPageReact','react-dom/client':'OpenDeskPageReact',
        'react/jsx-runtime':'OpenDeskPageReact','@opendesk/ui':'OpenDeskSidebarUI'
      }}}
  }
});
