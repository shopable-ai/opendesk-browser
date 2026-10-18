import * as React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.jsx';
import './style.css';

// One React root per isolated user tool. No privileged Host code lives here.
const bridge=globalThis.OpenDeskTool;
const target=bridge?.root?.querySelector('#tool-app');
if(!target||typeof bridge?.request!=='function')throw Error('E_QUICK_NOTES_REACT_SANDBOX');
const root=createRoot(target);
root.render(<App request={bridge.request} setState={bridge.setState}
  hostRoot={bridge.root} markUrl={target.dataset.markUrl||''}/>);
let released=false;
function release(){
  if(released)return;
  released=true;
  root.unmount();
}
globalThis.addEventListener('pagehide',release,{once:true});
