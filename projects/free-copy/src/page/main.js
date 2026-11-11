import {createPageUI} from '@opendesk/ui';
import {createFreeCopyRuntime} from './runtime.js';

export default async function main({assets}={}) {
  if (window.top!==window) return {state:'skipped',reason:'top-frame-only'};
  const ui=createPageUI({id:'app.free-copy',assets,baseStyles:false});
  ui.host.style.setProperty('display','none','important');
  try { return await createFreeCopyRuntime({ui}).ready; }
  catch (error) { ui.destroy(); throw error; }
}
