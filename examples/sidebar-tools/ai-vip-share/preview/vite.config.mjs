import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=fileURLToPath(new URL('.',import.meta.url));
export default defineConfig({
  root,base:'./',esbuild:{jsx:'automatic'},
  resolve:{alias:{'@opendesk/ui':resolve(root,'shared-ui.jsx')}},
  define:{'process.env.NODE_ENV':JSON.stringify('production')},
  build:{target:'es2022',outDir:resolve(root,'dist'),emptyOutDir:true,
    cssCodeSplit:false,rollupOptions:{input:resolve(root,'index.html')}}
});
