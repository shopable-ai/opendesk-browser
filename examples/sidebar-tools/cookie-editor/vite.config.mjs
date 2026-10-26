import {defineConfig} from 'vite';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export const COOKIE_REACT_SOURCE_FILES=[
  'app/entries/official.jsx','app/CookieEditorApp.jsx',
  'app/adapters/browser-sdk.js','app/controller/cookie-controller.js',
  'app/domain/cookie-model.js','app/domain/account-switch-url.js',
  'app/components/CookieEditorView.jsx','app/components/CookieAccounts.jsx',
  'app/components/CookieInlineEditor.jsx','app/components/CookieClearDialog.jsx',
  'app/components/CookieImport.jsx','app/components/CookieExport.jsx',
  'app/components/CookiePermissions.jsx','app/components/CookieOfflineWorkspace.jsx',
  'src/react.css','src/root.html','vite.config.mjs','package.json'
];
const fingerprint=bytes=>({bytes:bytes.length,sha256:hash(bytes)});
const sourceFingerprints=async()=>Object.fromEntries(await Promise.all(
  COOKIE_REACT_SOURCE_FILES.map(async name=>[name,fingerprint(await readFile(join(root,name)))])));
function receiptPlugin(){
  let builtSources;
  return {name:'cookie-editor-react-release-receipt',apply:'build',
    async buildStart(){builtSources=await sourceFingerprints();},
    generateBundle(_,bundle){
      const allowed=new Set(['react','react-dom/client','react/jsx-runtime','@opendesk/ui']);
      const chunks=Object.values(bundle).filter(item=>item.type==='chunk');
      if(chunks.length!==1||chunks[0].dynamicImports.length||
        chunks[0].imports.some(name=>!allowed.has(name)))
        throw Error('Cookie Editor candidate must have a single classic JS chunk and pinned global externals');
    },
    async writeBundle(){
      const marker='/* @opendesk-shared-design */';
      const sourceCss=await readFile(join(root,'src/react.css'),'utf8');
      if(!sourceCss.trimStart().startsWith(marker))
        throw Error('Cookie Editor React must opt into canonical shared design');
      const cssFile=join(root,'dist/tool.css');
      const compiled=await readFile(cssFile,'utf8');
      if(!compiled.trimStart().startsWith(marker))
        await writeFile(cssFile,marker+'\n'+compiled);
      const files={};
      for(const name of ['tool.js','tool.css']){
        const bytes=await readFile(join(root,'dist',name));
        files['dist/'+name]={bytes:bytes.length,sha256:hash(bytes)};
      }
      const output=join(root,'dist/build-ready.json');
      const tmp=output+'.'+randomUUID()+'.new';
      if(JSON.stringify(await sourceFingerprints())!==JSON.stringify(builtSources))
        throw Error('Cookie React source changed during build');
      const buildId=hash(Buffer.from(JSON.stringify({sources:builtSources,files})));
      await writeFile(tmp,JSON.stringify({format:'opendesk.ui-build-ready.v1',
        buildId,files,sources:builtSources},null,2)+'\n',{flag:'wx'});
      await rename(tmp,output);
    }
  };
}
export default defineConfig({
  root,base:'./',esbuild:{jsx:'automatic'},plugins:[receiptPlugin()],
  define:{'process.env.NODE_ENV':JSON.stringify('production')},
 build:{target:'es2022',minify:'esbuild',cssMinify:false,cssCodeSplit:false,emptyOutDir:true,
    lib:{entry:resolve(root,'app/entries/official.jsx'),
      name:'OpenDeskCookieEditorReact',formats:['iife'],
      fileName:()=>'tool.js',cssFileName:'tool'},
    rollupOptions:{
      external:['react','react-dom/client','react/jsx-runtime','@opendesk/ui'],
      output:{inlineDynamicImports:true,globals:{
        react:'OpenDeskPageReact',
        'react-dom/client':'OpenDeskPageReact',
        'react/jsx-runtime':'OpenDeskPageReact',
        '@opendesk/ui':'OpenDeskSidebarUI'
      }}
    }
  }
});
