import {createPageUI} from '@opendesk/ui';
import {createMouseGestureRuntime} from './runtime.js';

export default async function main({assets}={}){
  if(window.top!==window)return {state:'skipped',reason:'top-frame-only'};
  const ui=createPageUI({id:'app.mouse-gestures',assets,baseStyles:false});
  try{return await createMouseGestureRuntime({ui}).ready;}
  catch(error){ui.destroy();throw error;}
}
