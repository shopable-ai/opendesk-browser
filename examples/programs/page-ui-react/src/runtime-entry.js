// Maintainer-built pinned React 19 runtime for Page USER_SCRIPT.
// Export the actual public client surface; the build/hash lock guards updates.
import * as React from 'react';
import {createRoot,hydrateRoot} from 'react-dom/client';
import {jsx,jsxs} from 'react/jsx-runtime';
const api=Object.freeze({...React,createRoot,hydrateRoot,jsx,jsxs});
if(Object.hasOwn(globalThis,'OpenDeskPageReact'))throw Error('E_PAGE_FRAMEWORK_COLLISION');
Object.defineProperty(globalThis,'OpenDeskPageReact',{
  value:api,enumerable:false,writable:false,configurable:false
});
