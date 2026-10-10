import {defineUnlistedScript} from 'wxt/utils/define-unlisted-script';
import {installBuiltinLibraries} from '../libs/core.js';
export default defineUnlistedScript(() => installBuiltinLibraries(globalThis));
