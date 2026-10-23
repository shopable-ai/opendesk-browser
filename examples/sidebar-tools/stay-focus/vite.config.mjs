import {defineConfig} from 'vite';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('.',import.meta.url));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const fingerprint=bytes=>({bytes:bytes.length,sha256:hash(bytes)});
// Fingerprint every authored source, not just the last generated Vite bytes.
export const STAY_FOCUS_REACT_SOURCES=[
  'src/main.js','src/entry.js','src/style.css','src/index.html',
  'trusted/focus-controller.js','trusted/migrations.js','trusted/mutations.js',
  'trusted/model.js','trusted/compile-site-policy.js','trusted/policy.js',
  'trusted/catalog.js',
  'tool.config.json','vite.config.mjs','package.json'
];
function receiptPlugin(){
  return {name:'stay-focus-react-build-ready',apply:'build',
    generateBundle(_,bundle){
      const chunks=Object.values(bundle).filter(item=>item.type==='chunk');
      if(chunks.length!==1||chunks[0].dynamicImports.length||chunks[0].imports.length)
        throw Error('Stay Focus must emit one self-contained Classic UI chunk');
    },
    async writeBundle(){
      const files={},sources={};
      for(const file of ['dist/tool.css','dist/tool.js'])
        files[file]=fingerprint(await readFile(join(root,file)));
      for(const file of STAY_FOCUS_REACT_SOURCES)
        sources[file]=fingerprint(await readFile(join(root,file)));
      const buildId=hash(Buffer.from(JSON.stringify({sources,files})));
      const ready={format:'opendesk.ui-build-ready.v1',buildId,sources,files};
      const destination=join(root,'dist/build-ready.json');
      const temp=destination+'.'+randomUUID()+'.new';
      await writeFile(temp,JSON.stringify(ready,null,2)+'\n',{flag:'wx'});
      await rename(temp,destination);
    }
  };
}
// React 19 and shared primitives are host-owned via opendesk.react-ui.v1.
// The source is intentionally unchanged: createElement, one Root, no JSX migration.
export default defineConfig({
  root,base:'./',plugins:[receiptPlugin()],
  define:{'process.env.NODE_ENV':JSON.stringify('production')},
  build:{target:'es2022',minify:'esbuild',cssCodeSplit:false,
    outDir:resolve(root,'dist'),emptyOutDir:true,
    lib:{entry:resolve(root,'src/entry.js'),name:'OpenDeskStayFocus',
      formats:['iife'],fileName:()=>'tool.js',cssFileName:'tool'},
    rollupOptions:{output:{inlineDynamicImports:true}}
  }
});
