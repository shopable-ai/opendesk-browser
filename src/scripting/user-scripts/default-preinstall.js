// Trusted Side Panel bootstrap only. All installation and registration stay in
// the existing Page Authority; this module never grants Chrome permissions.
import {DEFAULT_PREINSTALL_STORE,DEFAULT_PREINSTALL_LOCK,validDefaultPreinstallMarker}
  from '../../sidebar-tools/preinstall-intent.js';
import {writeVerifiedLocalValue} from '../../ui/sidebar-tools/storage-state.js';
import {loadOfficialPageCatalog,loadOfficialPagePackage} from './official-page-catalog.js';
import {pageHostPermissionOrigins} from './page-install-authorization.js';
import {readNativeUserScripts} from './native-access.js';

export async function resumeDefaultPagePreinstall({api,lockManager,client,fetcher=globalThis.fetch}){
  if(!lockManager?.request)throw Object.assign(new Error('缺少可信浏览器存储锁'),{code:'E_TOOL_LOCK'});
  return lockManager.request(DEFAULT_PREINSTALL_LOCK,async()=>{
    let marker=(await api.storage.local.get(DEFAULT_PREINSTALL_STORE))[DEFAULT_PREINSTALL_STORE];
    if(marker===undefined)return {state:'not-requested'};
    marker=validDefaultPreinstallMarker(marker);
    // Older profiles have no Page intent. Updates never manufacture one.
    if(marker.pageState===undefined)return {state:'not-requested'};
    if(marker.pageState!=='pending')return {state:marker.pageState};
    if(marker.extensionVersion!==api.runtime.getManifest().version)return {state:'version-changed'};
    if(marker.state!=='complete')return {state:'waiting'};
    const save=async pageState=>{
      const next={...marker,pageState};
      await writeVerifiedLocalValue(api,DEFAULT_PREINSTALL_STORE,next,marker,'默认网页增强进度');
      marker=next;
    };
    const {apps}=await loadOfficialPageCatalog({api,fetcher});
    const releases=apps.filter(row=>row.installationPolicy==='preinstalled');
    const observed=await client.request('listPagePrograms',{});
    // Candidates survive uninstall. Any prior user work, including a local,
    // older, disabled or cleanup-unknown installation, wins over defaults.
    const missing=releases.filter(release=>![...observed.installed,...observed.catalog]
      .some(row=>row.programId===release.programId));
    const packages=[];
    for(const release of missing){
      const {pkg}=await loadOfficialPagePackage(release,{api,fetcher});
      if(!await api.permissions.contains({origins:pageHostPermissionOrigins(pkg.pageRules.matches)}))
        return {state:'permission-required'};
      packages.push(pkg);
    }
    if(packages.length)await readNativeUserScripts(api);
    // Persist the no-replay fence BEFORE requesting any durable mutation.
    // Lost replies and partial imports require read-only/manual reconciliation.
    if(packages.length)await save('attention');
    for(const pkg of packages){
      const result=await client.request('importPageInstallPackage',{package:pkg,
        expectedInstalledManifestHash:null,expectedGeneration:null});
      const current=await client.request('listPagePrograms',{});
      const installed=current.installed.find(row=>row.programId===pkg.programId);
      if(!installed||installed.manifestHash!==result?.manifestHash||
        installed.sourceHash!==pkg.sourceHash||installed.revision!==pkg.revision||
        installed.authorization?.installationId!==result?.authorization?.installationId||
        installed.authorization?.status!=='active'||installed.enabled!==true||
        installed.nativeState!=='registered'||installed.error)
        return {state:'attention'};
    }
    await save('complete');
    return {state:'complete',installed:packages.length};
  });
}
