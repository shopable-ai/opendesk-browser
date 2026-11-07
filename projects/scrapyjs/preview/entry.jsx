// Offline-only entry. Never selected by tool.config.json or the installable build.
import * as React from 'react';
import {createRoot} from 'react-dom/client';
import App from '../src/App.jsx';
import RuleAssistant from './RuleAssistant.jsx';
import ListScopeAssistant from './ListScopeAssistant.jsx';
import '../src/style.css';
const target=globalThis.OpenDeskTool?.root?.querySelector('#tool-app');
if(!target)throw Error('E_SCRAPYJS_REACT_ROOT');
const root=createRoot(target);
root.render(<App previewAiPlaceholder RuleAssistant={RuleAssistant} ListScopeAssistant={ListScopeAssistant}/>);
globalThis.addEventListener('pagehide',()=>root.unmount(),{once:true});
