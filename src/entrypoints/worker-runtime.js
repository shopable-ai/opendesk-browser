import {defineUnlistedScript} from 'wxt/utils/define-unlisted-script';
import {installControlWorker} from '../scripting/sandbox/worker-runtime.js';
export default defineUnlistedScript(() => installControlWorker(globalThis));
