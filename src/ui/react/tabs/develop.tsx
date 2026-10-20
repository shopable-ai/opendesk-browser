import * as React from 'react';
import {DevelopProvider,DevelopField} from './develop-controls.tsx';
import {DevelopContextHeader,DevelopSourceEditor} from './develop-editor.tsx';
import {DevelopLocalProject} from './develop-local.tsx';
import {DevelopDiagnostics} from './develop-diagnostics.tsx';
import {DevelopExecution} from './develop-execution.tsx';
import {DevelopAdvanced} from './develop-advanced.tsx';

// One React owner for the complete trusted developer workbench. User source
// stays in fields and crosses only the existing compiler/RunHost boundary.
export function DeveloperPage({model,view=model,actions=view.actions,hidden=false}){
  return <DevelopProvider view={view} actions={actions}>
    <div id="workbench-develop" role="tabpanel" aria-labelledby="tab-develop" className="od-page" data-workbench-page="develop" hidden={hidden}>
      <section className="developer-editor" aria-label="代码开发">
        <DevelopContextHeader/>
        <DevelopLocalProject/>
        <DevelopSourceEditor view={view} actions={actions}/>
        <DevelopDiagnostics/>
        <DevelopExecution/>
        <DevelopAdvanced/>
      </section>
    </div>
  </DevelopProvider>;
}

export function DeveloperDock({model,view=model,actions=view.actions,hidden=false}){
  return <DevelopProvider view={view} actions={actions}>
    <div id="develop-dock" className="dock-actions" hidden={hidden}>
      <div className="dock-buttons od-toolbar" data-opendesk-react-owner="developer-actions">
        <DevelopField as="button" className="od-button" id="script-run">
          {"运行"}
        </DevelopField>
        <DevelopField as="button" id="script-stop" className="od-button od-button--secondary">
          {"停止"}
        </DevelopField>
      </div>
    </div>
  </DevelopProvider>;
}
