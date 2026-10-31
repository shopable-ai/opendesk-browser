import {defineConfig} from 'vite';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {resolve,join,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('.',import.meta.url));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function receiptPlugin(){
  let compiledSources=[];
  return {name:'ai-proxy-build-receipt',apply:'build',
    generateBundle(_,bundle){
      // Rollup lists approved external globals in chunk.imports even in an IIFE.
      // Only unexpected modules, dynamic loading or extra chunks are forbidden.
      const allowed=new Set(['react','react-dom/client','react/jsx-runtime','@opendesk/ui']);
      const chunks=Object.values(bundle).filter(item=>item.type==='chunk');
      if(chunks.length!==1||chunks[0].dynamicImports.length||
         chunks[0].imports.some(name=>!allowed.has(name)))
        throw Error('AI Proxy must use one classic chunk and approved global externals');
      // Every local source contributing to the IIFE must match the completed
      // receipt before the native watcher may stage a new immutable snapshot.
      const names=new Set(['src/main.jsx','src/App.jsx','src/model.js','src/adapter.js','src/style.css',
        // Vite may omit unchanged CSS dependencies from incremental watch files.
        'src/styles/style.css','src/styles/options.css','src/styles/sidepanel-r86.css','src/styles/rotation-entry.css']);
      // Vite flattens CSS imports before Rollup, but retains them as watch files.
      // Bind those inputs as well as the compiled JS modules to the receipt.
      for(const id of new Set([...Object.keys(chunks[0].modules||{}),...this.getWatchFiles()])){
        if(!id.startsWith(root))continue;
        const name=relative(root,id);
        if(name&&!isAbsolute(name)&&!name.startsWith('../')&&
          /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(name)&&
          !name.split('/').some(part=>!part||part==='.'||part==='..'))
          names.add(name);
      }
      if(names.size>96)throw Error('AI Proxy source receipt exceeds 96 files');
      compiledSources=[...names].sort();
    },
    async writeBundle(){
      // Vite drops ordinary CSS comments. Restore the explicit opt-in
      // AFTER compilation so the existing packer embeds canonical design.
      const sourceCss=await readFile(join(root,'src','style.css'),'utf8');
      const marker='/* @opendesk-shared-design */';
      if(!sourceCss.trimStart().startsWith(marker))
        throw Error('AI Proxy source stylesheet must opt into shared design');
      const compiledCssFile=join(root,'dist','tool.css');
      const compiledCss=await readFile(compiledCssFile,'utf8');
      if(!compiledCss.trimStart().startsWith(marker))
        await writeFile(compiledCssFile,marker+'\n'+compiledCss);
      const files={};
      for(const name of ['tool.js','tool.css']){
        const bytes=await readFile(join(root,'dist',name));
        files['dist/'+name]={bytes:bytes.length,sha256:hash(bytes)};
      }
      const sources={};
      for(const name of compiledSources){
        const bytes=await readFile(join(root,name));
        sources[name]={bytes:bytes.length,sha256:hash(bytes)};
      }
      const path=join(root,'dist','build-ready.json');
      const tmp=path+'.'+randomUUID()+'.new';
      try{
        await writeFile(tmp,JSON.stringify({format:'opendesk.ui-build-ready.v1',
          buildId:randomUUID(),files,sources},null,2)+'\n',{flag:'wx'});
        await rename(tmp,path);
      }catch(error){throw error;}
    }
  };
}
export default defineConfig({
  root,base:'./',esbuild:{jsx:'automatic'},plugins:[receiptPlugin()],
  define:{'process.env.NODE_ENV':JSON.stringify('production')},
  build:{target:'es2022',minify:'esbuild',cssCodeSplit:false,emptyOutDir:true,
    lib:{entry:resolve(root,'src/main.jsx'),name:'OpenDeskAIProxy',
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
