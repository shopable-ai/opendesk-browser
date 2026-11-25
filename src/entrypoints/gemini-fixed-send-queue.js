import {defineUnlistedScript} from 'wxt/utils/define-unlisted-script';
import {initFixedSendQueue} from '../../projects/ai-send-queue/trusted/fixed-page.js';

export default defineUnlistedScript(() => {
  // The adapter must obtain a document-bound grant before mounting.
  initFixedSendQueue();
});
