import {defineConfig} from 'vite';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=dirname(fileURLToPath(import.meta.url));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const sources={};
for(const path of ['vite.config.mjs','build-preview.mjs'])sources[resolve(root,path)]=hash(readFileSync(resolve(root,path)));
export default defineConfig({
 root,base:'./',define:{'process.env.NODE_ENV':JSON.stringify('production')},
 plugins:[{name:'cookie-preview-source-receipt',enforce:'pre',
  transform(code,id){
   if(id.startsWith(resolve(root,'../../app')+'/')||id.startsWith(resolve(root,'src')+'/')){
    if(hash(code)!==hash(readFileSync(id)))throw Error('E_PREVIEW_SOURCE_CHANGED_DURING_BUILD');
    sources[id]=hash(code);
   }
  },
  generateBundle(){this.emitFile({type:'asset',fileName:'source-inputs.json',source:JSON.stringify(sources,null,2)});}
 }],
 build:{target:'es2022',minify:'esbuild',cssCodeSplit:false,emptyOutDir:true,
  lib:{entry:resolve(root,'src/main.jsx'),name:'CookieEditorR520Preview',formats:['iife'],fileName:()=> 'cookie-react.js',cssFileName:'cookie-react'},
  rollupOptions:{external:['react','react-dom/client','react/jsx-runtime','@opendesk/ui'],output:{inlineDynamicImports:true,globals:{react:'OpenDeskPageReact','react-dom/client':'OpenDeskPageReact','react/jsx-runtime':'OpenDeskPageReact','@opendesk/ui':'OpenDeskSidebarUI'}}}}
});
