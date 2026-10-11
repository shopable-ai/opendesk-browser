import {defineUnlistedScript} from 'wxt/utils/define-unlisted-script';
import {installPageAxios} from '../libs/packages/axios.js';
export default defineUnlistedScript(()=>installPageAxios(globalThis));
