import {createPageUI} from '@opendesk/ui';
import {label,step} from './model.js';
import {render} from './view.js';
export default async function main({assets}) {
  const ui=createPageUI({id:'sample.local-page-ui',assets});
  ui.addStyle(ui.getAsset('assets/ui.css'));
  render(ui,{label,step});
  return {label,step};
}
