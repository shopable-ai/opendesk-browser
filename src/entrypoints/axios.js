import {defineUnlistedScript} from 'wxt/utils/define-unlisted-script';
import {installPageAxios,installControllerAxios} from '../libs/packages/axios.js';

// One physical, locked Axios IIFE is evaluated ONLY in the opted-in world.
// In a Controller AsyncBody the trusted runner supplies lexical axiosx;
// no website document, global fetch or privileged runtime handle is accepted.
export default defineUnlistedScript(()=>{
  if(globalThis.document)return installPageAxios(globalThis);
  if(typeof axiosx!=='undefined')return installControllerAxios(globalThis,axiosx);
  throw Object.assign(new Error('Axios requires a declared Page or Controller world'),
    {code:'E_BUILTIN_WORLD'});
});
