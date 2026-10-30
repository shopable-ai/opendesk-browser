import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const resolveDir=fileURLToPath(new URL('../../src/',import.meta.url));

/** Bundle the already substituted controller together with its real ESM dependencies. */
export async function runControllerVm(source,globals,{timeout=2000}={}){
  const {outputFiles}=await build({
    bundle:true,write:false,format:'iife',platform:'browser',
    stdin:{contents:source,resolveDir,sourcefile:'main.js',loader:'js'}
  });
  const context=vm.createContext(globals);
  // JSON.parse must belong to the receiving realm: host structuredClone/JSON
  // would leave Object.prototype mismatched with the real modules' guards.
  const parse=vm.runInContext('(text)=>JSON.parse(text)',context);
  const clone=value=>value===undefined?undefined:parse(JSON.stringify(value));
  const bridge=api=>Object.fromEntries(Object.entries(api).map(([key,value])=>[
    key,typeof value==='function'?async(...args)=>clone(await value.apply(api,args)):
      value&&typeof value==='object'?bridge(value):value
  ]));
  const window=globals.window;
  // DOM nodes, callbacks and lifecycle controls remain live fixtures. Only the
  // JSON SDK response boundary represents data crossing from the Host.
  if(window.OpenDeskTool?.request){
    const tool=window.OpenDeskTool,request=tool.request;
    tool.request=async(...args)=>clone(await request.apply(tool,args));
  }
  if(window.OpenDeskSDK?.browser){
    window.OpenDeskSDK={...window.OpenDeskSDK,browser:bridge(window.OpenDeskSDK.browser)};
  }
  vm.runInContext(outputFiles[0].text,context,{timeout});
  return {context,clone};
}
