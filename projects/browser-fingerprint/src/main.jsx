import * as React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.jsx';
import {createAdapter} from './adapter.js';
import './style.css';
const bridge=globalThis.OpenDeskTool;
const target=bridge?.root?.querySelector('#tool-app');
if(!target||typeof bridge?.request!=='function')throw Error('E_FINGERPRINT_REACT_SDK');
const root=createRoot(target); // exactly one React root in tool Sandbox
root.render(<App adapter={createAdapter(bridge)}
  preview={globalThis.__OpenDeskFingerprintPreview===true}/>);
let destroyed=false;
globalThis.addEventListener('pagehide',()=>{
  if(!destroyed){destroyed=true;root.unmount();}
},{once:true});
