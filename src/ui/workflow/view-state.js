// Presentation-only workflow states. They are not a replacement for RunHost authority.
export const WORKFLOW_VIEW_STATES = Object.freeze([
  'ai-unconfigured','empty','planning','proposal','draft','running','result','failed','saved'
]);

export function deriveWorkflowViewState({
  phase='idle',proposal=false,hasSteps=false,saved=false,
  lastRun='none',error=false,providerReady=false
}={}) {
  if(phase==='planning')return 'planning';
  if(phase==='running')return 'running';
  if(proposal)return 'proposal';
  if(error||lastRun==='failed')return 'failed';
  if(lastRun==='success')return 'result';
  if(saved)return 'saved';
  if(hasSteps)return 'draft';
  return providerReady?'empty':'ai-unconfigured';
}
