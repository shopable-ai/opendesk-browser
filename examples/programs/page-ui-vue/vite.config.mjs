import {defineConfig} from 'vite';
import vue from '@vitejs/plugin-vue';
import {fileURLToPath} from 'node:url';
// Compile Vue SFC syntax without bundling Vue again. The alias deliberately
// exposes only the audited helpers needed by this example; other templates
// fail at build time instead of silently importing a second Vue runtime.
export default defineConfig({
  plugins:[vue()],
  resolve:{alias:[{find:/^vue$/,replacement:fileURLToPath(new URL('./src/vue-runtime-adapter.js',import.meta.url))}]},
  build:{outDir:'src/compiled',emptyOutDir:true,copyPublicDir:false,
    sourcemap:true,minify:'esbuild',cssCodeSplit:false,
    lib:{entry:'src/framework.js',formats:['es'],fileName:()=> 'framework.js'},
    rollupOptions:{output:{inlineDynamicImports:true}}}
});
