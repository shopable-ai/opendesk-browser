import {defineConfig} from 'vite';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile,rename,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('.',import.meta.url));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
// The receipt fingerprints product inputs as well as compiled bytes. Stale JSX
// must never be silently packaged with a previous successful Vite output.
export const SCRAPYJS_REACT_SOURCE_FILES=[
  'src/App.jsx','src/main.jsx','src/app-model.js','src/style.css',
  'src/index.html','tool.config.json','vite.config.mjs','package.json',
  'adapters/app-sdk.js'
];
const fingerprint=bytes=>({bytes:bytes.length,sha256:hash(bytes)});
async function sourceFiles(){
  // Include every local UI helper (including editor.js when present).
  const walk=async directory=>(await Promise.all((await readdir(join(root,directory),{withFileTypes:true}))
    .map(async row=>row.isDirectory()?walk(directory+'/'+row.name):
      /\.(?:jsx?|css|html)$/.test(row.name)?[directory+'/'+row.name]:[]))).flat();
  return [...new Set([...SCRAPYJS_REACT_SOURCE_FILES,...await walk('src')])].sort();
}
async function sourceSnapshot(){
  return Object.fromEntries(await Promise.all((await sourceFiles()).map(async file=>
    [file,fingerprint(await readFile(join(root,file)))])));
}
function receiptPlugin(){
  let before;
  return {name:'scrapyjs-react-build-ready',apply:'build',
    async buildStart(){before=await sourceSnapshot();},
    generateBundle(_,bundle){
      const chunks=Object.values(bundle).filter(item=>item.type==='chunk');
      if(chunks.length!==1||chunks[0].dynamicImports.length||
        chunks[0].imports.some(name=>!['react','react-dom/client',
          'react/jsx-runtime','@opendesk/ui'].includes(name)))
        throw Error('scrapyjs must emit one Classic JS chunk with host-owned React externals');
    },
    async writeBundle(){
      const files={},inputs=await sourceSnapshot();
      if(JSON.stringify(before)!==JSON.stringify(inputs))
        throw Error('scrapyjs sources changed during compilation; discard this build');
      for(const file of ['dist/tool.css','dist/tool.js'])
        files[file]=fingerprint(await readFile(join(root,file)));
      // Identical sources and compiled bytes have an identical receipt.
      const buildId=hash(Buffer.from(JSON.stringify({sources:inputs,files})));
      const ready={format:'opendesk.ui-build-ready.v1',buildId,
        sources:inputs,files};
      const destination=join(root,'dist/build-ready.json');
      const temporary=destination+'.'+randomUUID()+'.new';
      await writeFile(temporary,JSON.stringify(ready,null,2)+'\n',{flag:'wx'});
      await rename(temporary,destination);
    }
  };
}
// React and shared components are host-owned resources, never tool authority.
export default defineConfig({
  root,base:'./',esbuild:{jsx:'automatic'},plugins:[receiptPlugin()],
  define:{'process.env.NODE_ENV':JSON.stringify('production')},
  build:{target:'es2022',minify:'esbuild',cssCodeSplit:false,
    outDir:resolve(root,'dist'),emptyOutDir:true,
    lib:{entry:resolve(root,'src/main.jsx'),name:'OpenDeskScrapyjs',
      formats:['iife'],fileName:()=>'tool.js',cssFileName:'tool'},
    rollupOptions:{external:['react','react-dom/client','react/jsx-runtime','@opendesk/ui'],
      output:{inlineDynamicImports:true,globals:{
        react:'OpenDeskPageReact','react-dom/client':'OpenDeskPageReact',
        'react/jsx-runtime':'OpenDeskPageReact','@opendesk/ui':'OpenDeskSidebarUI'
      }}}
  }
});
