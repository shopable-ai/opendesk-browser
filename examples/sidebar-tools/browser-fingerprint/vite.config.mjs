import {defineConfig} from 'vite';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const inputs=[
  'tool.config.json','package.json','vite.config.mjs',
  'src/index.html','src/main.jsx','src/App.jsx','src/style.css',
  'src/adapter.js','src/model.js','src/history.js'
];
const mark='/* @opendesk-shared-design */';
function receiptPlugin(){
  return {name:'fingerprint-build-ready',apply:'build',
    generateBundle(_,bundle){
      const chunks=Object.values(bundle).filter(x=>x.type==='chunk');
      const allowed=new Set(['react','react-dom/client','react/jsx-runtime','@opendesk/ui']);
      if(chunks.length!==1||chunks[0].dynamicImports.length||
        chunks[0].imports.some(x=>!allowed.has(x)))
        throw Error('Browser Fingerprint requires one Classic IIFE with reviewed globals');
    },
    async writeBundle(){
      const cssFile=join(root,'dist/tool.css');
      const css=await readFile(cssFile,'utf8');
      if(!(await readFile(join(root,'src/style.css'),'utf8')).trimStart().startsWith(mark))
        throw Error('Canonical Shared UI style marker missing');
      if(!css.trimStart().startsWith(mark))await writeFile(cssFile,mark+'\n'+css);
      const files={},sources={};
      const stamp=async path=>{
        const b=await readFile(join(root,path));return {bytes:b.length,sha256:sha(b)};
      };
      for(const path of ['dist/tool.js','dist/tool.css'])files[path]=await stamp(path);
      for(const path of inputs)sources[path]=await stamp(path);
      const buildId=sha(Buffer.from(JSON.stringify({sources,files})));
      const temp=join(root,'dist/build-ready.json.'+randomUUID()+'.new');
      await writeFile(temp,JSON.stringify({format:'opendesk.ui-build-ready.v1',
        buildId,sources,files},null,2)+'\n',{flag:'wx'});
      await rename(temp,join(root,'dist/build-ready.json'));
    }
  };
}
export default defineConfig({
  root,base:'./',esbuild:{jsx:'automatic'},plugins:[receiptPlugin()],
  define:{'process.env.NODE_ENV':JSON.stringify('production')},
  build:{target:'es2022',minify:'esbuild',cssCodeSplit:false,
    outDir:resolve(root,'dist'),emptyOutDir:true,
    lib:{entry:resolve(root,'src/main.jsx'),name:'OpenDeskFingerprint',
      formats:['iife'],fileName:()=>'tool.js',cssFileName:'tool'},
    rollupOptions:{
      external:['react','react-dom/client','react/jsx-runtime','@opendesk/ui'],
      output:{inlineDynamicImports:true,
        globals:{react:'OpenDeskPageReact','react-dom/client':'OpenDeskPageReact',
          'react/jsx-runtime':'OpenDeskPageReact','@opendesk/ui':'OpenDeskSidebarUI'}}
    }
  }
});
