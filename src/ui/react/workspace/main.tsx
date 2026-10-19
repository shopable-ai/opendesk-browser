import * as React from 'react';
import {createRoot} from 'react-dom/client';
import {createWorkspaceController} from '../../../native-agent/workspace.js';
import {previewDocument} from '../../../native-agent/file-preview.js';
import {loadLocalePreference,getLocale,subscribeLocale,translate} from '../../../i18n/index.js';
import {WorkspaceView} from './WorkspaceView';

// This is the one owner of the complete Workspace document. Native and AI
// controllers expose state/actions and never receive its document or elements.
export function mountWorkspace({doc=globalThis.document,api=globalThis.chrome,client,controller:provided}={}){
  const element=doc.getElementById('workspace-root');
  if(!element)return null;
  const controller=provided||createWorkspaceController({api,client,
    renderPreviewDocument:(path,content)=>previewDocument(path,content,doc)});
  const root=createRoot(element);
  const setTitle=()=>{
    doc.documentElement.lang=getLocale();doc.title=translate('workspace.documentTitle');
  };
  const stopLocale=subscribeLocale(setTitle);setTitle();
  void loadLocalePreference({api});
  root.render(<WorkspaceView controller={controller}/>);
  let disposed=false;
  const dispose=()=>{
    if(disposed)return;disposed=true;
    globalThis.removeEventListener?.('pagehide',dispose);stopLocale();root.unmount();controller.dispose();
  };
  globalThis.addEventListener?.('pagehide',dispose,{once:true});
  return {controller,dispose};
}
