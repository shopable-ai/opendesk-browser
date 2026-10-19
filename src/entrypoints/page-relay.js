import {defineUnlistedScript} from 'wxt/utils/define-unlisted-script';
import {initPageRelay} from '../agents/page-relay.js';
import {initReadingToc} from '../../examples/sidebar-tools/reading-toc/trusted/page.js';
import {initPageClip} from '../../examples/sidebar-tools/web-markdown-clipper/trusted/page.js';
import {initKnowledgeCapture} from '../knowledge/page.js';
import {installFocusPageNotice} from '../../examples/sidebar-tools/stay-focus/trusted/page-notice.js';
import {initPromptShortcuts} from '../../examples/sidebar-tools/prompt-shortcuts/trusted/page.js';
export default defineUnlistedScript(() => {
  // Static registration and trusted repair injection may reach the same
  // isolated document. Never create a second set of observers/listeners.
  if(globalThis.__opendeskTrustedPageRelayV1===true)return;
  Object.defineProperty(globalThis,'__opendeskTrustedPageRelayV1',{value:true,configurable:false});
  initPageRelay();
  if(globalThis.window?.top===globalThis.window){
    initReadingToc();initPageClip();initKnowledgeCapture();installFocusPageNotice();initPromptShortcuts();
  }
});
