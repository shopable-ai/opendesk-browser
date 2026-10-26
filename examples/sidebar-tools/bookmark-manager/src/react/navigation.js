// Trusted React bookmark editor is a genuine Back target only while a sheet
// is open. A preview drawer, menu, confirmation, or folder picker is not a route.
export function bookmarkEditorNavigation(draft){
  if(!draft||!['create','edit'].includes(draft.mode)||
     !['bookmark','folder'].includes(draft.kind))
    return {page:'home',title:'书签管理',canBack:false};
  const title=draft.mode==='create'?
    (draft.kind==='folder'?'新建文件夹':'新建书签'):
    (draft.kind==='folder'?'编辑文件夹':'编辑书签');
  return {page:draft.mode,title,canBack:true};
}
