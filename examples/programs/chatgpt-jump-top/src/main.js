import {createPageUI} from '@opendesk/ui';
import {installJumpToTop} from './conversation.js';

const pageRules = {
  matches: ['https://chatgpt.com/*'],
  excludeMatches: [],
  runAt: 'document_idle',
  allFrames: false,
  world: 'USER_SCRIPT'
};

export default async function main() {
  if (window !== window.top || window.location.origin !== 'https://chatgpt.com') {
    return {programId: 'opendesk.chatgpt-jump-top', status: 'skipped'};
  }
  const owner = createPageUI({
    id: 'opendesk.chatgpt-jump-top.lifecycle',
    pageRules,
    baseStyles: false
  });
  // The managed UI provides cleanup only; the actual button belongs in the
  // conversation header, not in OpenDesk's default floating panel.
  owner.host.hidden = true;
  owner.host.style.setProperty('display', 'none', 'important');
  try {
    installJumpToTop({doc: document, win: window, owner});
    return {programId: 'opendesk.chatgpt-jump-top', status: 'active',
      runtime: 'USER_SCRIPT'};
  } catch (error) {
    owner.destroy();
    throw error;
  }
}
