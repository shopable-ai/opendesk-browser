import {defineUnlistedScript} from 'wxt/utils/define-unlisted-script';
import {initToolShell} from '../ui/tool-shell.js';
import {installDevelopmentPage} from '../development/page.js';
export default defineUnlistedScript(() => initToolShell(import.meta.env.COMMAND==='serve'?installDevelopmentPage:null,
  {debugEnabled:import.meta.env.MODE==='development',openAcceptance:import.meta.env.COMMAND==='serve'
    ?async options=>(await import('../development/task-acceptance-page.js')).openTaskAcceptancePage(options):null}));
