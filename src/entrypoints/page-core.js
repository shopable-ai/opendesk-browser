import {defineUnlistedScript} from 'wxt/utils/define-unlisted-script';
import {installBuiltinLibraries} from '../runtime/builtin-libraries/core.js';
export default defineUnlistedScript(() => installBuiltinLibraries(globalThis));
