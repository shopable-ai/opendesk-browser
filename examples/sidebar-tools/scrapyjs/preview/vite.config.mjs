// UI-only HMR: exact public React runtime, application sources and memory SDK.
import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {loadPreviewRuntime} from './build-preview.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const runtime=await loadPreviewRuntime({compilePreview:process.env.SCRAPYJS_PREVIEW_COMPILE==='1'});
const named={
 react:'Children,Component,Fragment,Profiler,PureComponent,StrictMode,Suspense,cloneElement,createContext,createElement,createRef,forwardRef,isValidElement,lazy,memo,startTransition,use,useActionState,useCallback,useContext,useDebugValue,useDeferredValue,useEffect,useEffectEvent,useId,useImperativeHandle,useInsertionEffect,useLayoutEffect,useMemo,useOptimistic,useReducer,useRef,useState,useSyncExternalStore,useTransition,version',
 'react/jsx-runtime':'Fragment,jsx,jsxs',
 'react/jsx-dev-runtime':'Fragment',
 'react-dom/client':'createRoot,hydrateRoot',
 '@opendesk/ui':'Button,IconButton,Card,CardContent,Switch,SharedConversationFrame,createConversationSession'
};
export default defineConfig({root,base:'./',esbuild:{jsx:'automatic',jsxDev:false},
 optimizeDeps:{noDiscovery:true,include:[]},
 server:{host:'127.0.0.1',port:43127,strictPort:true,open:false,cors:{origin:['null','http://127.0.0.1:43127']},fs:{allow:[root]}},
 plugins:[{
  name:'scrapyjs-public-runtime-dev',enforce:'pre',
  resolveId(id){if(Object.hasOwn(named,id))return '\0scrapyjs-runtime:'+id;},
  load(id){
   const key=id.replace('\0scrapyjs-runtime:','');if(!Object.hasOwn(named,key))return;
   const object=key==='@opendesk/ui'?'OpenDeskSidebarUI':'OpenDeskPageReact';
   return `const value=globalThis.${object};export default value;export const {${named[key]}}=value;`;
  },
  configureServer(server){server.middlewares.use((request,response,next)=>{
   const name=request.url?.split('?')[0];
   const bytes=name==='/preview-runtime/react.js'?runtime.react:name==='/preview-runtime/shared.js'?runtime.shared:null;
   if(!bytes)return next();response.setHeader('Content-Type','text/javascript;charset=utf-8');response.end(bytes);
  });}
 }]
});
