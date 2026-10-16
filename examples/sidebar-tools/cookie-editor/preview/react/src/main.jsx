import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.jsx';
import './style.css';
const el=document.getElementById('r49-root');
if(!el)throw Error('E_COOKIE_R49_PREVIEW_ROOT_MISSING');
const root=createRoot(el);
root.render(<App/>);
