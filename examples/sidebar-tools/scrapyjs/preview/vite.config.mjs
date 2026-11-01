// UI-only HMR: exact public React runtime, application sources and memory SDK.
import {defineConfig} from 'vite';
import {sharedDesignPlugin} from '../vite.config.mjs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {loadPreviewRuntime} from './runtime.mjs';
import {sidebarPreviewShellSource} from '../../../../scripts/preview/sidebar-shell-source.mjs';
import {officialDesignSources} from '../../../../scripts/preview/shared-tool-design.mjs';
import {readFile} from 'node:fs/promises';
const root=fileURLToPath(new URL('../',import.meta.url));
let runtime=await loadPreviewRuntime({compilePreview:process.env.SCRAPYJS_PREVIEW_COMPILE==='1'});
let runtimeError;
const named={
 react:'Children,Component,Fragment,Profiler,PureComponent,StrictMode,Suspense,cloneElement,createContext,createElement,createRef,forwardRef,isValidElement,lazy,memo,startTransition,use,useActionState,useCallback,useContext,useDebugValue,useDeferredValue,useEffect,useEffectEvent,useId,useImperativeHandle,useInsertionEffect,useLayoutEffect,useMemo,useOptimistic,useReducer,useRef,useState,useSyncExternalStore,useTransition,version',
 'react/jsx-runtime':'Fragment,jsx,jsxs',
 'react/jsx-dev-runtime':'Fragment',
 'react-dom/client':'createRoot,hydrateRoot',
 '@opendesk/ui':'Button,IconButton,Card,CardContent,Switch,Input,Textarea,SharedConversationFrame,SharedConversationDock,createConversationSession'
};
export default defineConfig({root,base:'./',esbuild:{jsx:'automatic',jsxDev:false},
 optimizeDeps:{noDiscovery:true,include:[]},
 server:{host:'127.0.0.1',port:43127,strictPort:true,open:false,cors:{origin:['null','http://127.0.0.1:43127']},fs:{allow:[root]}},
 plugins:[sharedDesignPlugin(),{
  name:'scrapyjs-public-runtime-dev',enforce:'pre',
  async transformIndexHtml(html,context){
    if(context.path!=='/preview/dev.html')return;
    const shell=await sidebarPreviewShellSource({tool:'scrapyjs'});
    const {tokens,components}=await officialDesignSources();
    const layout=await readFile(resolve(root,'../../../src/ui/react/components/conversation-layout.css'),'utf8');
    return html.replace('<!-- CANONICAL_SHELL_CSS -->','<style>'+tokens+'\n'+components+'\n'+shell.css+'\n'+layout+'</style>')
      .replace('<!-- CANONICAL_SHELL_HEADER -->',shell.nav+shell.head);
  },
  resolveId(id){if(Object.hasOwn(named,id))return '\0scrapyjs-runtime:'+id;},
  load(id){
   const key=id.replace('\0scrapyjs-runtime:','');if(!Object.hasOwn(named,key))return;
   const object=key==='@opendesk/ui'?'OpenDeskSidebarUI':'OpenDeskPageReact';
   return `const value=globalThis.${object};export default value;export const {${named[key]}}=value;`;
  },
  configureServer(server){
   const runtimeInputs=()=>Object.keys(runtime.provenance.inputs||{}).map(path=>resolve(root,'../../..',path));
   server.watcher.add(runtimeInputs());
   let rebuilding=Promise.resolve();
   server.watcher.on('change',path=>{
    if(!runtimeInputs().includes(resolve(path)))return;
    rebuilding=rebuilding.then(async()=>{
     runtime=await loadPreviewRuntime({compilePreview:process.env.SCRAPYJS_PREVIEW_COMPILE==='1'});runtimeError=undefined;
     server.watcher.add(runtimeInputs());
     server.ws.send({type:'full-reload'});
    }).catch(error=>{runtimeError=error;server.config.logger.error(error.message);});
   });
   server.middlewares.use((request,response,next)=>{
   const name=request.url?.split('?')[0];
   if(runtimeError&&['/preview-runtime/react.js','/preview-runtime/shared.js'].includes(name)){
    response.statusCode=503;response.setHeader('Content-Type','text/javascript;charset=utf-8');
    return response.end('throw new Error('+JSON.stringify(runtimeError.message)+');');
   }
   const bytes=name==='/preview-runtime/react.js'?runtime.react:name==='/preview-runtime/shared.js'?runtime.shared:null;
   if(!bytes)return next();response.setHeader('Content-Type','text/javascript;charset=utf-8');response.setHeader('Cache-Control','no-store');response.end(bytes);
  });}
 }]
});
