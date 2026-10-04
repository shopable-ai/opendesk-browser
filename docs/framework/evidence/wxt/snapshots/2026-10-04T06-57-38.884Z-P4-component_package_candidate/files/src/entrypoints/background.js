import {defineBackground} from 'wxt/utils/define-background';
import {initServiceWorker} from '../sw.js';
export default defineBackground(() => initServiceWorker());
