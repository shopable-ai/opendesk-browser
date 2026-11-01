import * as React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.jsx';
import './style.css';

// The installed tool owns one informational React root; the Page owns the queue.
const bridge=globalThis.OpenDeskTool;
const mount=bridge?.root?.querySelector('#tool-app');
if(!mount)
  throw Error('E_SEND_QUEUE_REACT_HOST');
const root=createRoot(mount);
root.render(<App/>);
let closed=false;
globalThis.addEventListener('pagehide',()=>{
  if(closed)return;
  closed=true;root.unmount();
},{once:true});
