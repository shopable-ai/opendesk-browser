import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.jsx';
import './style.css';
const target=globalThis.OpenDeskTool?.root?.querySelector('#tool-app');
if(!target)throw new Error('OpenDesk Tool sandbox root unavailable');
createRoot(target).render(<App request={globalThis.OpenDeskTool.request}/>);
