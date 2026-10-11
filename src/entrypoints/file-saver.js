import {defineUnlistedScript} from 'wxt/utils/define-unlisted-script';
import {installPageFileSaver} from '../libs/packages/file-saver.js';
export default defineUnlistedScript(() => installPageFileSaver(globalThis));
