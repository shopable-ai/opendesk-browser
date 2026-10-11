// Packaged Vue runtime-only entry: users write plain JS render()+h() without SFC.
import {version,createApp,h,ref,reactive,computed,watch,onMounted,onUnmounted} from 'vue';
const api=Object.freeze({version,createApp,h,ref,reactive,computed,watch,onMounted,onUnmounted});
if(Object.hasOwn(globalThis,'OpenDeskPageVue'))throw Error('E_PAGE_FRAMEWORK_COLLISION');
Object.defineProperty(globalThis,'OpenDeskPageVue',{
  value:api,enumerable:false,writable:false,configurable:false
});
