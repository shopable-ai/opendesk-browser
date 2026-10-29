import * as React from 'react';
import {createRoot} from 'react-dom/client';
import App from '../src/App.jsx';
import '../src/style.css';
import '../adapters/app-sdk.js';
import '../src/app-model.js';
import config from '../tool.config.json';
// Only this UI dev entry loads the memory host. Production entry never imports it.
Object.defineProperty(globalThis,'__opendeskPreviewScenario',{value:new URLSearchParams(location.search).get('scenario')||'success'});
Object.defineProperty(globalThis,'__opendeskPreviewTask',{value:config.delegatedTasks[0]});
await import('./mock-host.js');
const root=createRoot(document.getElementById('tool-app'));
root.render(<App/>);
if(import.meta.hot){import.meta.hot.accept('../src/App.jsx',module=>root.render(React.createElement(module.default)));import.meta.hot.dispose(()=>root.unmount());}
