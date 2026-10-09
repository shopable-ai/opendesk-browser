import {initServiceWorker} from '../../src/sw.js';
// Mirror src/entrypoints/background.js without importing WXT's builder-only wrapper.
initServiceWorker();
