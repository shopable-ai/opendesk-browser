// Maintainer-built pinned Vue 3 runtime-only exports including render helpers.
// The compiler itself does not execute in USER_SCRIPT; it emits these imports.
import * as Vue from 'vue';
const api=Object.freeze({...Vue});
if(Object.hasOwn(globalThis,'OpenDeskPageVue'))throw Error('E_PAGE_FRAMEWORK_COLLISION');
Object.defineProperty(globalThis,'OpenDeskPageVue',{
  value:api,enumerable:false,writable:false,configurable:false
});
