import {defineConfig} from 'vite';
import {createHash} from 'node:crypto';
import {mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {dirname,relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {PAGE_FRAMEWORK_RUNTIMES} from '../../../src/libs/page-frameworks/contract.js';
const root=fileURLToPath(new URL('.',import.meta.url));
const repoRoot=resolve(root,'../../..');
const react=PAGE_FRAMEWORK_RUNTIMES.react;
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const record=(path,bytes)=>({path,bytes:bytes.length,sha256:digest(bytes)});

// Copy only finished WXT bytes. This never builds or writes the extension.
function stageBrowserPreview(){
  const extensionDir=resolve(repoRoot,process.env.OPENDESK_SHARED_UI_EXTENSION_DIR||'dist/development');
  const destination=resolve(root,'.opendesk-preview/browser');
  const sourcePaths=['package.json','tool.config.json','vite.config.mjs','preview/index.html',
    'src/App.jsx','src/main.jsx','src/root.html','src/style.css'];
  const browserPaths=[react.output,'sidebar-shared-ui.js','ui/design-tokens.css',
    react.licensePath,'licenses/shared-ui-third-party-notices.txt'];
  const readSources=()=>Promise.all(sourcePaths.map(async path=>record(path,await readFile(resolve(root,path)))));
  let sources,failed=false;
  return {name:'opendesk-shared-ui-preview',apply:'build',
    async buildStart(){
      failed=false;
      await rm(destination,{recursive:true,force:true});
      sources=await readSources();
    },
    buildEnd(error){failed=Boolean(error);},
    async closeBundle(){
      if(failed)return;
      const manifest=await readFile(resolve(extensionDir,'manifest.json'));
      if(JSON.parse(manifest).manifest_version!==3)throw Error('Shared UI preview requires an existing MV3 WXT build');
      const assets=await Promise.all(browserPaths.map(path=>readFile(resolve(extensionDir,path))));
      if(assets[0].length!==react.bytes||digest(assets[0])!==react.sha256)
        throw Error('Shared UI preview React differs from the pinned runtime: '+extensionDir);
      for(let i=0;i<assets.length;i++)if(!assets[i].length)throw Error('Empty WXT asset: '+browserPaths[i]);
      const toolAssets=await Promise.all(['dist/tool.js','dist/tool.css'].map(async path=>
        record(path,await readFile(resolve(root,path)))));
      if(JSON.stringify(sources)!==JSON.stringify(await readSources()))
        throw Error('Shared UI preview source changed during build; rebuild before previewing');
      for(let i=0;i<assets.length;i++){
        const path=resolve(destination,browserPaths[i]);
        await mkdir(dirname(path),{recursive:true});
        await writeFile(path,assets[i]);
      }
      // Written last: incomplete/failed staging cannot announce a valid preview.
      await writeFile(resolve(destination,'receipt.json'),JSON.stringify({
        format:'opendesk.shared-ui-preview.v1',extensionDir:relative(repoRoot,extensionDir),
        extensionManifest:record('manifest.json',manifest),sources,
        browserAssets:browserPaths.map((path,i)=>record(path,assets[i])),toolAssets
      },null,2)+'\n');
    }
  };
}
export default defineConfig({
  root,base:'./',esbuild:{jsx:'automatic'},
  plugins:[stageBrowserPreview()],
  define:{'process.env.NODE_ENV':JSON.stringify('production')},
  build:{target:'es2022',minify:'esbuild',cssCodeSplit:false,emptyOutDir:true,
    lib:{entry:resolve(root,'src/main.jsx'),name:'OpenDeskSharedToolDemo',
      formats:['iife'],fileName:()=>'tool.js',cssFileName:'tool'},
    rollupOptions:{
      external:['react','react-dom/client','react/jsx-runtime','@opendesk/ui'],
      output:{inlineDynamicImports:true,globals:{
        react:'OpenDeskPageReact',
        'react-dom/client':'OpenDeskPageReact',
        'react/jsx-runtime':'OpenDeskPageReact',
        '@opendesk/ui':'OpenDeskSidebarUI'
      }}
    }}
});
