import {defineConfig} from 'vite';
import vue from '@vitejs/plugin-vue';
// Offline Vue SFC compilation only: never add a second Page runtime.
export default defineConfig({
  plugins:[vue()],
  build:{outDir:'src/compiled',emptyOutDir:true,copyPublicDir:false,
    sourcemap:true,minify:'esbuild',cssCodeSplit:false,
    lib:{entry:'src/framework.js',formats:['es'],fileName:()=> 'framework.js'},
    rollupOptions:{output:{inlineDynamicImports:true}}}
});
