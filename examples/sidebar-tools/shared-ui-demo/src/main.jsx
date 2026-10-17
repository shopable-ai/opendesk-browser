import * as React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.jsx';
import './style.css';

// Tool-framework-generated-style bootstrap, not a public author's API.
const target=globalThis.OpenDeskTool?.root?.querySelector('#tool-app');
if(!target)throw Error('E_TOOL_SHARED_DEMO_ROOT');
const root=createRoot(target);
root.render(React.createElement(App));
let released=false;
const release=()=>{if(!released){released=true;root.unmount();}};
globalThis.addEventListener('pagehide',release,{once:true});
