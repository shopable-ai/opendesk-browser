import {defineBackground} from 'wxt/utils/define-background';
import {initServiceWorker} from '../sw.js';
import {createDevelopmentWorker} from '../development/worker.js';
export default defineBackground(() => {
  const development=import.meta.env.COMMAND==='serve'?createDevelopmentWorker():null;
  initServiceWorker({development});
});
