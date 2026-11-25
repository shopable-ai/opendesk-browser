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
    const apply=()=>{
      wxt.config.hooks=current.hooks;
      // These fixed registrations come from the root manifest, not from WXT
      // entrypoint discovery. Use the same generation as the package verifier.
      wxt.config.manifest.content_scripts=structuredClone(current.manifest.content_scripts);
    };
    apply();
    // Incremental builds replace the resolved config object; retain the same
    // hooks and fixed registrations until a restart selects the next graph.
    // Preserve the other manifest fields, runner, edition, output paths and Vite config.
    wxt.hook('config:resolved',apply);
  }
};
