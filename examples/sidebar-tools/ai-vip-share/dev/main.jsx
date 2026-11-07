// Development entry only. Installed src/main.jsx never imports this adapter.
import * as React from 'react';
import {createRoot} from 'react-dom/client';
import VipApp from '../src/App.jsx';
import {createDevelopmentConnection} from './local-test/connection.js';
import '../src/style.css';
import '../src/main.js';
const root=createRoot(globalThis.OpenDeskTool.root.querySelector('#tool-app'));
root.render(<VipApp createDevelopmentControls={()=>createDevelopmentConnection(globalThis.OpenDeskTool.root)}/>);
addEventListener('pagehide',()=>root.unmount(),{once:true});
