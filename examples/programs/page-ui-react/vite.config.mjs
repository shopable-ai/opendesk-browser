import {defineConfig} from 'vite';
// JSX is precompiled offline; the existing OpenDesk builder remains the only
// Page runtime and owns the @opendesk/ui alias.
export default defineConfig({
  esbuild:{jsx:'automatic'},
  build:{outDir:'src/compiled',emptyOutDir:true,copyPublicDir:false,
    sourcemap:true,minify:'esbuild',cssCodeSplit:false,
    lib:{entry:'src/framework.jsx',formats:['es'],fileName:()=> 'framework.js'},
    rollupOptions:{output:{inlineDynamicImports:true}}}
});
