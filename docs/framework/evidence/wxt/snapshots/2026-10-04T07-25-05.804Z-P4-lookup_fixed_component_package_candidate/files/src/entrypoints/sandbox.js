import {defineUnlistedScript} from 'wxt/utils/define-unlisted-script';
import {initSandbox} from '../scripting/sandbox/sandbox.js';
export default defineUnlistedScript(() => initSandbox());
