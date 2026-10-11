// Self-contained runtime is built by maintainers once and ships with the extension.
// Users write plain JS using createElement; no JSX compiler is required.
import * as React from 'react';
import {createRoot} from 'react-dom/client';
const api=Object.freeze({
  version:React.version,createElement:React.createElement,Fragment:React.Fragment,
  useState:React.useState,useEffect:React.useEffect,
  useMemo:React.useMemo,useRef:React.useRef,createRoot
});
if(Object.hasOwn(globalThis,'OpenDeskPageReact'))throw Error('E_PAGE_FRAMEWORK_COLLISION');
Object.defineProperty(globalThis,'OpenDeskPageReact',{
  value:api,enumerable:false,writable:false,configurable:false
});
