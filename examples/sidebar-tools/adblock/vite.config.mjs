import {defineConfig} from 'vite';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url));
// Compile ONLY tool-owned JSX/CSS. React, ReactDOM and shared components are
// pinned browser resources and must never enter the installable tool package.
export default defineConfig({
  root,base:'./',esbuild:{jsx:'automatic'},
  define:{'process.env.NODE_ENV':JSON.stringify('production')},
  build:{target:'es2022',minify:'esbuild',cssCodeSplit:false,
    outDir:resolve(root,'src'),emptyOutDir:false,
    lib:{entry:resolve(root,'src/main.jsx'),name:'OpenDeskAdblock',
      formats:['iife'],fileName:()=>'main.js',cssFileName:'style'},
    rollupOptions:{external:['react','react-dom/client','react/jsx-runtime','@opendesk/ui'],
      output:{inlineDynamicImports:true,globals:{
        react:'OpenDeskPageReact','react-dom/client':'OpenDeskPageReact',
        'react/jsx-runtime':'OpenDeskPageReact','@opendesk/ui':'OpenDeskSidebarUI'
      }}}
  }
});
