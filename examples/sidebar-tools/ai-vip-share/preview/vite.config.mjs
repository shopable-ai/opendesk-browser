import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {AI_VIP_REACT_SOURCES} from '../vite.config.mjs';
const root=fileURLToPath(new URL('.',import.meta.url));
const repo=resolve(root,'../../../..');
const app='examples/sidebar-tools/ai-vip-share/';
const names=[...AI_VIP_REACT_SOURCES.map(name=>app+name),
  ...['index.html','main.jsx','sdk-fixture.js','shared-ui.jsx','vite.config.mjs'].map(name=>app+'preview/'+name),
  'package-lock.json','src/ui/design-tokens.css','src/ui/design-system.css',
  ...['sidebar-shared.css','button.tsx','card.tsx','switch.tsx'].map(name=>'src/ui/react/components/ui/'+name)];
const fingerprint=bytes=>({bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
async function sourceDigests(){return Object.fromEntries(await Promise.all(names.map(async name=>
  [name,fingerprint(await readFile(resolve(repo,name)))])))}
function previewReceipt(){
  let before;
  return {name:'ai-vip-source-bound-preview',apply:'build',
    async buildStart(){before=await sourceDigests()},
    async writeBundle(options,bundle){
      const sources=await sourceDigests();
      if(JSON.stringify(sources)!==JSON.stringify(before))throw Error('Preview sources changed during build');
      const files={};
      for(const name of Object.keys(bundle))files[name]=fingerprint(await readFile(resolve(options.dir,name)));
      const buildId=fingerprint(Buffer.from(JSON.stringify({sources,files}))).sha256;
      await writeFile(resolve(options.dir,'build-ready.json'),JSON.stringify({
        format:'opendesk.ui-build-ready.v1',buildId,sources,files
      },null,2)+'\n');
    }};
}
export default defineConfig({
  root,base:'./',esbuild:{jsx:'automatic'},
  resolve:{alias:{'@opendesk/ui':resolve(root,'shared-ui.jsx')}},
  define:{'process.env.NODE_ENV':JSON.stringify('production')},
  plugins:[previewReceipt()],
  build:{target:'es2022',outDir:resolve(root,'dist'),emptyOutDir:true,
    cssCodeSplit:false,rollupOptions:{input:resolve(root,'index.html')}}
});
