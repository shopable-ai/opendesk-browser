import {createPageUI} from '@opendesk/ui';
import {label,step} from './model.js';
import {render} from './view.js';

// Run is always explicit. The wildcard page rule is only a URL eligibility
// check; website permission and USER_SCRIPT approval stay with OpenDesk.
export default async function main({assets}) {
  const ui=createPageUI({id:'sample.local-page-ui',assets});
  try {
    ui.addStyle(ui.getAsset('assets/ui.css'));
    render(ui,{label,step});
    return {
      project:'sample.local-page-ui',
      runtime:'page-userscript',
      state:ui.active()?'mounted':'detached',
      placement:ui.getMountDiagnostics().strategy,
      targetOrigin:ui.content.ownerDocument.defaultView?.location?.origin||null,
      label,step
    };
  } catch(error) {
    ui.destroy();
    throw error;
  }
}
