import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {parseHTML} from 'linkedom';
import * as React from 'react';
import {flushSync} from 'react-dom';
import {createRoot} from 'react-dom/client';

// Compile the real static component graph in memory, sharing the fixture's React.
const result=await build({entryPoints:[fileURLToPath(new URL('../../src/ui/react/tabs/trusted-settings.tsx',import.meta.url))],
  bundle:true,write:false,packages:'external',format:'esm',jsx:'transform'});
export const settingsModuleURL='data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text.replaceAll('"react"',JSON.stringify(import.meta.resolve('react')))).toString('base64');
const components=await import(settingsModuleURL);
const names={timeReview:'TimeReviewSettings',stayFocus:'StayFocusSettings',aiAccess:'AiAccessSettings'};
const actionNames={'stay-focus-enable-native':'grant','stay-focus-disable':'stop','stay-focus-clear-open':'openClear',
  'stay-focus-clear-approve':'approveClear','stay-focus-clear-cancel':'cancelClear',
  'stay-focus-current-add':'quickAdd','stay-focus-current-pause':'quickAdd',
  'ai-access-toggle':'toggle',
  'ai-access-local-activate':'activate'};
export function settingsReactFixture(kind,t){
  const {window,document}=parseHTML('<html><body><div id="mount"></div></body></html>');
  const previous={window:globalThis.window,document:globalThis.document};
  globalThis.window=window;globalThis.document=document;
  const mount=document.getElementById('mount'),root=createRoot(mount);
  let model=null,actions=null,closed=false;
  const paint=()=>{if(!closed)flushSync(()=>root.render(kind==='stayFocus'
    ?React.createElement(React.Fragment,null,
      React.createElement(components.StayFocusQuickAdd,{model,actions}),
      React.createElement(components.StayFocusSettings,{model,actions}))
    :React.createElement(components[names[kind]],{model,actions})));};
  const ui={render(next){model=next;paint();},connect(next){actions=next;paint();}};
  const close=async()=>{
    if(closed)return;closed=true;flushSync(()=>root.unmount());
    await new Promise(resolve=>setImmediate(resolve));
    globalThis.window=previous.window;globalThis.document=previous.document;
  };
  t?.after(close);
  return {root:mount,doc:document,document,window,ui,close,find:id=>document.getElementById(id),
    get model(){return model;},get actions(){return actions;},
    // Controller tests inject a trust fixture into explicit actions. Separate
    // React event tests prove the original native object is forwarded unchanged.
    invoke(id,event={isTrusted:true}){return actions?.[actionNames[id]||id]?.(event);}};
}
