import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';
import {parseHTML} from 'linkedom';
import * as React from 'react';
import {createTrustedHistoryWorkbench} from '../../src/ui/trusted-history-workbench.js';

const compiled=await transform(await readFile(new URL('../../src/ui/react/tabs/browser-history.tsx',import.meta.url),'utf8'),
  {loader:'tsx',format:'esm',jsx:'transform'});
export const {BrowserHistory}=await import('data:text/javascript;base64,'+Buffer.from(
  compiled.code.replace('"react"',JSON.stringify(import.meta.resolve('react')))).toString('base64'));

export async function historyReactFixture(t,{api,hostInstanceId}={}){
  const {window,document}=parseHTML('<html><body><div id="mount"></div></body></html>');
  const previous={window:globalThis.window,document:globalThis.document,act:globalThis.IS_REACT_ACT_ENVIRONMENT};
  globalThis.window=window;globalThis.document=document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  const {createRoot}=await import('react-dom/client');
  const root=createRoot(document.getElementById('mount'));
  let model=null,actions=null,ui;
  const snapshots=[];
  const paint=()=>root.render(React.createElement(BrowserHistory,{model,actions}));
  const reactUI={
    renderBrowserHistory(value){model=value;snapshots.push(value);paint();},
    connectBrowserHistoryActions(value){actions=value;paint();}
  };
  await React.act(async()=>{ui=createTrustedHistoryWorkbench({api,hostInstanceId,reactUI});});
  t.after(async()=>{
    await React.act(async()=>{ui.dispose();root.unmount();});
    globalThis.window=previous.window;globalThis.document=previous.document;globalThis.IS_REACT_ACT_ENVIRONMENT=previous.act;
  });
  return {document,window,ui,reactUI,snapshots,get model(){return model;},get actions(){return actions;},
    get:id=>document.getElementById(id),
    async change(field,value){
      const id={text:'text',startDate:'start',endDate:'end',limit:'limit'}[field];
      await React.act(async()=>{
        const node=document.getElementById('trusted-history-'+id);node.value=value;
        node.dispatchEvent(new window.Event('input',{bubbles:true}));
      });
    },
    async search(){await React.act(async()=>actions.search({isTrusted:true}));},
    async flush(){await React.act(async()=>{await new Promise(resolve=>setImmediate(resolve));});}
  };
}
