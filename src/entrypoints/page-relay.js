import {defineUnlistedScript} from 'wxt/utils/define-unlisted-script';
import {initPageRelay} from '../agents/page-relay.js';
import {initReadingToc} from '../reading-toc/page.js';
import {initPageClip} from '../page-clip/page.js';
import {initKnowledgeCapture} from '../knowledge/page.js';
import {installFocusPageNotice} from '../stay-focus/page-notice.js';
import {initPromptShortcuts} from '../../examples/sidebar-tools/prompt-shortcuts/trusted/page.js';
export default defineUnlistedScript(() => {
  initPageRelay();
  if(globalThis.window?.top===globalThis.window){
    initReadingToc();initPageClip();initKnowledgeCapture();installFocusPageNotice();initPromptShortcuts();
  }
});
