import {validateWebFlowTaskIntent} from '../../projects/webflow/src/task-intent-contract.js';

const activeDocuments=new WeakSet();

// Website events are untrusted suggestions, including synthetic events.
// The consumer must independently authenticate the browser document and run
// the existing Authority/admission checks; observation is never an approval.
export function createGenericTaskAdapter({win,onCandidate}={}){
  if(!win||typeof win.addEventListener!=='function'||typeof onCandidate!=='function')
    throw new TypeError('A window and candidate receiver are required');
  return Object.freeze({version:'1.0.0',start({profile}={}){
    if(activeDocuments.has(win))throw Object.assign(new Error('Generic adapter already active'),{code:'E_SITE_ADAPTER_ACTIVE'});
    const allowed=Array.isArray(profile?.protocols)&&profile.protocols.includes('webflow.task.intent.v1');
    let disposed=false;
    const observe=event=>{
      if(disposed||!allowed||event.target!==win||typeof event.detail!=='string')return;
      let candidate;
      try{candidate=validateWebFlowTaskIntent(event.detail);}catch{return;}
      onCandidate(candidate);
    };
    win.addEventListener('opendesk:task-intent',observe);
    activeDocuments.add(win);
    return Object.freeze({dispose(){if(!disposed){disposed=true;win.removeEventListener('opendesk:task-intent',observe);activeDocuments.delete(win);}}});
  }});
}
