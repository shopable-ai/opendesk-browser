import {createBuildModuleLoader} from '../scripts/load-build-module.mjs';

// WXT discovers local modules again on config recovery. C12's native ESM
// cache may still contain the previous config and its transitive helpers.
// Select one fresh hook graph per server generation before WXT adds them.
export default {
  name:'opendesk-development-build',
  async setup(wxt){
    if(wxt.config.command!=='serve')return;
    const load=createBuildModuleLoader({fresh:true,root:wxt.config.root});
    const {default:current}=await load('./wxt.config.mjs');
    const apply=()=>{wxt.config.hooks=current.hooks;};
    apply();
    // Incremental builds replace the resolved config object; retain the same
    // hooks until a config restart selects the next complete graph. Do not
    // replace runner, edition, manifest, output paths or Vite's base config.
    wxt.hook('config:resolved',apply);
  }
};
