import {defineConfig} from 'vite';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {approvedHtml,comparisonHtml} from './build-a-b.mjs';
import {compileSharedToolCss,canonicalThemeOverride} from '../../../../../scripts/preview/shared-tool-design.mjs';
const root=dirname(fileURLToPath(import.meta.url));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const sources={};
for(const path of ['vite.config.mjs','build-preview.mjs'])sources[resolve(root,path)]=hash(readFileSync(resolve(root,path)));
const repo=resolve(root,'../../../../..');
const runtimePath=resolve(repo,'src/libs/page-frameworks/react-19.2.0.js');
const sharedPath=resolve(repo,'dist/development/sidebar-shared-ui.js');
const productCss=resolve(root,'../../src/react.css');
const reactExports=['Activity','Children','Component','Fragment','Profiler','PureComponent','StrictMode','Suspense','cloneElement','createContext','createElement','createRef','forwardRef','isValidElement','lazy','memo','startTransition','use','useCallback','useContext','useDebugValue','useDeferredValue','useEffect','useId','useImperativeHandle','useInsertionEffect','useLayoutEffect','useMemo','useReducer','useRef','useState','useSyncExternalStore','useTransition','version','createRoot','hydrateRoot','jsx','jsxs'];
const bridges={'react':'OpenDeskPageReact','react-dom/client':'OpenDeskPageReact','react/jsx-runtime':'OpenDeskPageReact','@opendesk/ui':'OpenDeskSidebarUI'};
export default defineConfig(({command})=>({

 root,base:'./',define:{'process.env.NODE_ENV':JSON.stringify('production')},
 server:{host:'127.0.0.1',port:43134,strictPort:true,fs:{allow:[repo]}},
 optimizeDeps:{noDiscovery:true,exclude:Object.keys(bridges)},
 plugins:[{name:'cookie-preview-current-source-dev',enforce:'pre',
  resolveId(id){if(command==='serve'&&bridges[id])return '\0cookie-preview:'+id;},
  load(id){if(!id.startsWith('\0cookie-preview:'))return;
   const spec=id.slice('\0cookie-preview:'.length),global=bridges[spec];
   const names=spec==='@opendesk/ui'?['Button']:reactExports;
   return 'const runtime=globalThis.'+global+';export default runtime;'+names.map(name=>'export const '+name+'=runtime.'+name+';').join('');
  },
  configureServer(server){
   const cssInputs=[productCss,resolve(repo,'src/ui/design-tokens.css'),resolve(repo,'src/ui/design-system.css')];
   server.watcher.add([...cssInputs,runtimePath,sharedPath]);
   server.watcher.on('change',path=>{if([...cssInputs,runtimePath,sharedPath].includes(path))server.ws.send({type:'full-reload',path:'*'});});
   server.middlewares.use(async(req,res,next)=>{
    const pathname=req.url?.split('?')[0];
    try{
     if(pathname==='/dev-source.json'){
      const {readdir}=await import('node:fs/promises');
      const files=[runtimePath,sharedPath,productCss,resolve(root,'vite.config.mjs'),resolve(root,'build-a-b.mjs'),resolve(root,'visual-contract.json'),resolve(root,'visual-contract-check.mjs'),resolve(repo,'src/entrypoints/sidebar-shared-ui.js'),resolve(repo,'scripts/preview/shared-tool-design.mjs'),resolve(repo,'wxt.config.mjs'),resolve(repo,'package-lock.json'),resolve(repo,'src/ui/design-tokens.css'),resolve(repo,'src/ui/design-system.css')];
      async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const path=resolve(dir,entry.name);if(entry.isDirectory())await walk(path);else files.push(path);}}
      await walk(resolve(root,'src'));await walk(resolve(root,'../../app'));await walk(resolve(repo,'src/ui/react'));
      const inputs=Object.fromEntries(files.sort().map(path=>[path.slice(repo.length+1),hash(readFileSync(path))]));
      res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
      res.end(JSON.stringify({mode:'CURRENT_SOURCE_DEV',entry:'preview/react/src/main.jsx',generatedHtmlUsed:false,existingSharedUIArtifact:true,sourceBuildProof:false,sharedUINote:'Existing dist/development artifact reused; current source hashes are recorded but no build correspondence is claimed.',inputs,sourceHash:hash(JSON.stringify(inputs))}));return;
     }
     if(pathname==='/a-b-dev.html'){
      res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','no-store');
      res.end(comparisonHtml(await approvedHtml(),'',{dev:true}));return;
     }
     if(pathname==='/dev-runtime.js'||pathname==='/dev-shared-ui.js'){
      res.setHeader('Content-Type','text/javascript');res.setHeader('Cache-Control','no-store');
      res.end(readFileSync(pathname==='/dev-runtime.js'?runtimePath:sharedPath));return;
     }
     if(pathname==='/dev-product.css'){
      const [css,light,dark]=await Promise.all([compileSharedToolCss(readFileSync(productCss,'utf8')),canonicalThemeOverride('light'),canonicalThemeOverride('dark')]);
      res.setHeader('Content-Type','text/css');res.setHeader('Cache-Control','no-store');
      res.end(css+'\n'+light.replace(':root{',':root:not([data-preview-theme="dark"]){')+'\n'+dark.replace(':root{',':root[data-preview-theme="dark"]{'));return;
     }
     if(pathname==='/dev.html'){
      const html='<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cookie Editor R2.6 · React 同源视觉与交互预览</title><link rel="stylesheet" href="/dev-product.css"></head><body><div id="r49-root"></div><script src="/dev-runtime.js"></script><script src="/dev-shared-ui.js"></script><script type="module" src="/src/main.jsx"></script></body></html>';
      res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','no-store');
      res.end(await server.transformIndexHtml('/dev.html',html));return;
     }
     next();
    }catch(error){res.statusCode=500;res.end(String(error.stack||error));}
   });
  }
 },{name:'cookie-preview-source-receipt',enforce:'pre',
  transform(code,id){
   if(command!=='build')return;
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
}));
