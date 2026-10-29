import {defineUnlistedScript} from 'wxt/utils/define-unlisted-script';
import {initPageRelay} from '../agents/page-relay.js';
import {initReadingToc} from '../../projects/reading-toc/trusted/page.js';
import {initPageClip} from '../../projects/web-markdown-clipper/trusted/page.js';
import {initKnowledgeCapture} from '../knowledge/page.js';
import {installFocusPageNotice} from '../../projects/stay-focus/trusted/page-notice.js';
import {installManagedSiteNoticePage} from '../platform/chrome/managed-site-notice-page.js';
import {initPromptShortcuts} from '../../projects/prompt-shortcuts/trusted/page.js';
import {initAdblockCosmetics} from '../../projects/adblock/trusted/page.js';
export default defineUnlistedScript(() => {
  // Static registration and trusted repair injection may reach the same
  // isolated document. Never create a second set of observers/listeners.
  if(globalThis.__opendeskTrustedPageRelayV1===true)return;
  Object.defineProperty(globalThis,'__opendeskTrustedPageRelayV1',{value:true,configurable:false});
  initPageRelay();
  if(globalThis.window?.top===globalThis.window){
    initReadingToc();initPageClip();initKnowledgeCapture();installFocusPageNotice();installManagedSiteNoticePage();initPromptShortcuts();initAdblockCosmetics();
  }
});
