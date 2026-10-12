// Only the actual Chrome Side Panel remembers its selected top-level page.
// The catalog/tool-page and iframe tools share the shell but not this preference.
export const SIDEBAR_LAST_TAB_KEY='opendesk.sidebar.last-tab.v1';
const PRODUCT_TABS=new Set(['tasks','discover','workflow','develop','tools']);

export function isRestorableSidebarTab(value,{debugEnabled=false}={}){
  return typeof value==='string' && (PRODUCT_TABS.has(value) || (debugEnabled && value==='debug'));
}

export function createSidebarTabMemory({storage,getActiveTab,selectTab,debugEnabled=false,
  onError=error=>console.warn('Sidebar last tab was not retained',error)}={}){
  let disposed=false, enabled=false, changedBeforeRestore=false, restorePromise=null;
  // Serialize writes so a slow earlier request cannot overwrite the last click.
  let writes=Promise.resolve();
  const supported=view=>isRestorableSidebarTab(view,{debugEnabled});
  function record(view,{initial=false}={}){
    if(disposed||!supported(view))return;
    if(!enabled){
      // The bootstrap's default Tasks navigation is not a user preference.
      if(!initial)changedBeforeRestore=true;
      return;
    }
    writes=writes.then(()=>storage.set({[SIDEBAR_LAST_TAB_KEY]:view}))
      .catch(error=>onError(error));
  }
  function restore(){
    if(restorePromise)return restorePromise;
    restorePromise=(async()=>{
      let saved;
      try {
        saved=(await storage.get(SIDEBAR_LAST_TAB_KEY))?.[SIDEBAR_LAST_TAB_KEY];
        if(saved==='cloud')saved='tasks';
      }catch(error){onError(error);}
      if(disposed)return;
      enabled=true;
      if(changedBeforeRestore){
        // A real selection (or a context-menu launch) during the async read wins.
        record(getActiveTab());
      }else if(supported(saved) && saved!==getActiveTab()){
        // Use normal navigation for ARIA, dock, tool activation and veto rules.
        selectTab(saved);
      }
    })();
    return restorePromise;
  }
  return {record,restore,dispose(){disposed=true;}};
}
