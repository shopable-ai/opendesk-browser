import {defineUnlistedScript} from 'wxt/utils/define-unlisted-script';
import {initPageRelay} from '../agents/page-relay.js';
import {initReadingToc} from '../reading-toc/page.js';
export default defineUnlistedScript(() => {
  initPageRelay();
  if(globalThis.window?.top===globalThis.window)initReadingToc();
});
