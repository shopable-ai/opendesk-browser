import {defineConfig} from 'vite';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function receiptPlugin(){
  return {name:'cookie-editor-react-release-receipt',apply:'build',
    generateBundle(_,bundle){
      const allowed=new Set(['react','react-dom/client','react/jsx-runtime','@opendesk/ui']);
      const chunks=Object.values(bundle).filter(item=>item.type==='chunk');
      if(chunks.length!==1||chunks[0].dynamicImports.length||
        chunks[0].imports.some(name=>!allowed.has(name)))
        throw Error('Cookie Editor candidate must have a single classic JS chunk and pinned global externals');
    },
    async writeBundle(){
      const marker='/* @opendesk-shared-design */';
      const sourceCss=await readFile(join(root,'src/react.css'),'utf8');
      if(!sourceCss.trimStart().startsWith(marker))
        throw Error('Cookie Editor React must opt into canonical shared design');
      const cssFile=join(root,'dist/tool.css');
      const compiled=await readFile(cssFile,'utf8');
      if(!compiled.trimStart().startsWith(marker))
        await writeFile(cssFile,marker+'\n'+compiled);
      const files={};
      for(const name of ['tool.js','tool.css']){
        const bytes=await readFile(join(root,'dist',name));
        files['dist/'+name]={bytes:bytes.length,sha256:hash(bytes)};
      }
      const output=join(root,'dist/build-ready.json');
      const tmp=output+'.'+randomUUID()+'.new';
      await writeFile(tmp,JSON.stringify({format:'opendesk.ui-build-ready.v1',
        buildId:randomUUID(),files},null,2)+'\n',{flag:'wx'});
      await rename(tmp,output);
    }
  };
}
export default defineConfig({
  root,base:'./',esbuild:{jsx:'automatic'},plugins:[receiptPlugin()],
  define:{'process.env.NODE_ENV':JSON.stringify('production')},
  build:{target:'es2022',minify:'esbuild',cssCodeSplit:false,emptyOutDir:true,
    lib:{entry:resolve(root,'app/entries/official.jsx'),
      name:'OpenDeskCookieEditorReact',formats:['iife'],
      fileName:()=>'tool.js',cssFileName:'tool'},
    rollupOptions:{
      external:['react','react-dom/client','react/jsx-runtime','@opendesk/ui'],
      output:{inlineDynamicImports:true,globals:{
        react:'OpenDeskPageReact',
        'react-dom/client':'OpenDeskPageReact',
        'react/jsx-runtime':'OpenDeskPageReact',
        '@opendesk/ui':'OpenDeskSidebarUI'
      }}
    }
  }
});
