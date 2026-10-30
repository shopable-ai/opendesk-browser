import {defineConfig} from 'vite';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('.',import.meta.url));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export const AI_VIP_REACT_SOURCES=[
  'src/index.html','src/App.jsx','src/main.jsx','src/main.js','src/style.css',
  'src/session-context.js','src/cookie-journal.js','src/site-session.js',
  'dev/local-test/connection.js',
  'tool.config.json','package.json','vite.config.mjs'
];
const fingerprint=bytes=>({bytes:bytes.length,sha256:hash(bytes)});
async function sources(){
  return Object.fromEntries(await Promise.all(AI_VIP_REACT_SOURCES.map(async file=>
    [file,fingerprint(await readFile(join(root,file)))])));
}
function receiptPlugin(){
  let before;
  return {name:'ai-vip-source-bound-react-receipt',apply:'build',
    async buildStart(){before=await sources();},
    generateBundle(_,bundle){
      const chunks=Object.values(bundle).filter(item=>item.type==='chunk');
      const allowed=['react','react-dom/client','react/jsx-runtime','@opendesk/ui'];
      if(chunks.length!==1||chunks[0].dynamicImports.length||
        chunks[0].imports.some(name=>!allowed.includes(name)))
        throw Error('AI VIP Share must emit one classic JS bundle with host-owned React externals');
    },
    async writeBundle(){
      const latest=await sources();
      if(JSON.stringify(latest)!==JSON.stringify(before))
        throw Error('AI VIP React source changed during build');
      const cssPath=join(root,'dist/tool.css');
      const marker='/* @opendesk-shared-design */';
      const css=await readFile(cssPath,'utf8');
      if(!css.trimStart().startsWith(marker))
        await writeFile(cssPath,marker+'\n'+css);
      const files={};
      for(const file of ['dist/tool.css','dist/tool.js'])
        files[file]=fingerprint(await readFile(join(root,file)));
      const buildId=hash(Buffer.from(JSON.stringify({sources:latest,files})));
      const target=join(root,'dist/build-ready.json');
      const temp=target+'.'+randomUUID()+'.new';
      await writeFile(temp,JSON.stringify({
        format:'opendesk.ui-build-ready.v1',buildId,sources:latest,files
      },null,2)+'\n',{flag:'wx'});
      await rename(temp,target);
    }
  };
}
export default defineConfig({
  root,base:'./',esbuild:{jsx:'automatic'},
  define:{'process.env.NODE_ENV':JSON.stringify('production')},
  plugins:[receiptPlugin()],
  build:{
    target:'es2022',minify:'esbuild',cssCodeSplit:false,
    outDir:resolve(root,'dist'),emptyOutDir:true,
    lib:{entry:resolve(root,'src/main.jsx'),name:'OpenDeskVipShare',
      formats:['iife'],fileName:()=>'tool.js',cssFileName:'tool'},
    rollupOptions:{
      external:['react','react-dom/client','react/jsx-runtime','@opendesk/ui'],
      output:{inlineDynamicImports:true,globals:{
        react:'OpenDeskPageReact','react-dom/client':'OpenDeskPageReact',
        'react/jsx-runtime':'OpenDeskPageReact','@opendesk/ui':'OpenDeskSidebarUI'
      }}
    }
  }
});
