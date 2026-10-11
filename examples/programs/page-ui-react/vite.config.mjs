import {defineConfig} from 'vite';
// Compile JSX syntax only. React/ReactDOM are loaded by the existing
// hashed Page runtime, not bundled into each user's program.
export default defineConfig({
  esbuild:{jsx:'transform',jsxFactory:'React.createElement',jsxFragment:'React.Fragment'},
  build:{outDir:'src/compiled',emptyOutDir:true,copyPublicDir:false,
    sourcemap:true,minify:'esbuild',cssCodeSplit:false,
    lib:{entry:'src/framework.jsx',formats:['es'],fileName:()=> 'framework.js'},
    rollupOptions:{output:{inlineDynamicImports:true}}}
});
