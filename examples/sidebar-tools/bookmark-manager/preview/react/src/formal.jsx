import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.jsx';
import './style.css';

// Non-release feasibility entry. Same App.jsx shared by preview/formal.
const host=globalThis.OpenDeskTool;
const container=host?.root?.querySelector?.('[data-bookmark-react-root]');
if(!container)throw Error('E_BOOKMARK_FORMAL_TOOL_ROOT_MISSING');
if(!globalThis.BookmarkR2Model||!globalThis.BookmarkR2Service||!globalThis.OpenDeskSDK?.browser)
 throw Error('E_BOOKMARK_FORMAL_SDK_MISSING');
const root=createRoot(container);
root.render(<App/>);
globalThis.addEventListener('pagehide',()=>root.unmount(),{once:true});
