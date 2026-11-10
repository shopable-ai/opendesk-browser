import {createPageUI} from '@opendesk/ui';
import {mountBackGesture} from './gesture.js';

export default function main({assets} = {}) {
  if (window.top !== window) return {state:'skipped',reason:'top-frame-only'};
  const ui = createPageUI({id:'app.mouse-gestures',assets,baseStyles:false});
  try {
    mountBackGesture({ui});
    return {state:'ready',gesture:'right-drag-left',scope:'current-document'};
  } catch (error) {
    ui.destroy();
    throw error;
  }
}
