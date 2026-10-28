import * as React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.jsx';
import './style.css';

// The installed tool owns one React 19 root; all mutations go to trusted Host.
const bridge=globalThis.OpenDeskTool;
const mount=bridge?.root?.querySelector('#tool-app');
if(!mount||typeof bridge?.request!=='function')
  throw Error('E_SEND_QUEUE_REACT_HOST');
const root=createRoot(mount);
root.render(<App request={bridge.request} hostRoot={bridge.root}/>);
let closed=false;
globalThis.addEventListener('pagehide',()=>{
  if(closed)return;
  closed=true;root.unmount();
},{once:true});
