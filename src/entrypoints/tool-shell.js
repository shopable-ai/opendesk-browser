import {defineUnlistedScript} from 'wxt/utils/define-unlisted-script';
import {initToolShell} from '../ui/tool-shell.js';
import {installDevelopmentPage} from '../development/page.js';
export default defineUnlistedScript(() => initToolShell(import.meta.env.COMMAND==='serve'?installDevelopmentPage:null));
