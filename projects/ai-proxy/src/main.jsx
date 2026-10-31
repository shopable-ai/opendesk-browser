import * as React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.jsx';
import {configureEnvironment} from './environment';
import './style.css';
// Static preview and existing sandbox entry share this same business tree.
// Trusted Sidebar mounts the same App in its existing single React portal root.
const bridge=globalThis.OpenDeskTool;
const target=bridge?.root?.querySelector('#ai-proxy-app');
if(!target||typeof bridge?.request!=='function')throw Error('E_AI_PROXY_ENTRY');
const environment=configureEnvironment(bridge,globalThis.OpenDeskSDK);
const root=createRoot(target);root.render(<App/>);
globalThis.addEventListener('pagehide',()=>{root.unmount();environment.dispose();},{once:true});
