import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.jsx';
const container=document.getElementById('tool-root');
if(!container)throw Error('E_BOOKMARK_REACT_ROOT_MISSING');
const root=createRoot(container);
root.render(<App/>);
Object.defineProperty(globalThis,'__BookmarkReactPreview',{value:Object.freeze({version:'R3.0.2',renderer:'react-dom/client',unmount:()=>root.unmount()})});
