import {defineBackground} from 'wxt/utils/define-background';
import {initServiceWorker} from '../sw.js';
import {createDevelopmentWorker} from '../development/worker.js';
import {attachTaskAcceptancePort} from '../development/task-acceptance-port.js';
export default defineBackground(() => {
  const development=import.meta.env.COMMAND==='serve'?createDevelopmentWorker():null;
  initServiceWorker({development,
    attachAcceptance:import.meta.env.COMMAND==='serve'?attachTaskAcceptancePort:null});
});
