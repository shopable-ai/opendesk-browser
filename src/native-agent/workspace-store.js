// A read-only view-model stream for the React useSyncExternalStore consumer.
// The DOM-free controller remains the sole owner of records and Native
// authority. Never publish sessionId, leaseEpoch or Native request credentials.
export function createWorkspaceStore(){
  let snapshot=Object.freeze({revision:0}),closed=false;
  const listeners=new Set();
  return Object.freeze({
    getSnapshot:()=>snapshot,
    subscribe(listener){
      if(typeof listener!=='function')throw new TypeError('Workspace subscriber must be a function');
      if(closed)return ()=>{};
      listeners.add(listener);
      return ()=>listeners.delete(listener);
    },
    publish(state){
      if(closed)return snapshot;
      snapshot=Object.freeze({...state,revision:snapshot.revision+1});
      for(const listener of [...listeners])if(listeners.has(listener))listener();
      return snapshot;
    },
    dispose(){closed=true;listeners.clear();}
  });
}

export function projectWorkspaceState({connected=false,busy=false,demo=false,workspaceId='',
  rows=[],targets=[],targetId='',current=null,treeFolders=new Map(),view='preview',
  status='',statusError=false,locale='en',access='none',creationPending=null,presentation={},capabilities={}}={}){
  const file=current?Object.freeze({
    workspaceId:current.workspaceId,path:current.path,content:current.content,
    baseContent:current.baseContent,sha256:current.sha256||null,
    dirty:current.content!==current.baseContent,unknown:!!current.unknown,
    importedDraft:!!current.importedDraft,
    remote:current.remote?Object.freeze({content:current.remote.content,sha256:current.remote.sha256}):null
  }):null;
  const visible=[];
  function visit(path,depth){
    const folder=treeFolders.get(path);
    if(!folder?.expanded||!Array.isArray(folder.entries))return;
    for(const entry of folder.entries){
      const child=treeFolders.get(entry.path);
      visible.push(Object.freeze({path:entry.path,name:entry.name,kind:entry.kind,depth,
        expanded:entry.kind==='directory'?!!child?.expanded:null,truncated:!!child?.truncated}));
      if(entry.kind==='directory')visit(entry.path,depth+1);
    }
  }
  // Tree entries must already have been validated against Native list results.
  visit('',0);
  return {
    connected:!!connected,busy:!!busy,demo:!!demo,workspaceId,access,
    writable:!!connected&&access==='read-write',view,locale,
    status:Object.freeze({text:status,error:!!statusError}),
    workspaces:Object.freeze(rows.map(row=>Object.freeze({workspaceId:row.workspaceId,name:row.name,
      access:row.access,sourceId:row.sourceId||'',label:row.label||row.name,offline:!!row.offline}))),
    targets:Object.freeze(targets.map(row=>Object.freeze({tabId:row.tabId,title:row.title||row.url,url:row.url}))),
    targetId:String(targetId||''),file,tree:Object.freeze(visible),
    creationPending:creationPending?Object.freeze({path:creationPending.path,workspaceId:creationPending.workspaceId}):null,
    presentation:freezePresentation(presentation),capabilities:Object.freeze({...capabilities})
  };
}

// Explicit projection, not a spread of controller state: session credentials and
// authority objects must never cross the UI subscription boundary.
function freezePresentation(value){
  const text=key=>typeof value[key]==='string'?value[key]:'';
  return Object.freeze({
    connectionLabel:text('connectionLabel'),fileTitle:text('fileTitle'),fileMeta:text('fileMeta'),draftLabel:text('draftLabel'),
    previewHTML:text('previewHTML'),previewKind:text('previewKind'),previewURL:text('previewURL'),connectedPreviewURL:text('connectedPreviewURL'),
    saveAsPath:text('saveAsPath'),accessReason:text('accessReason'),treeMessage:text('treeMessage'),directoryName:text('directoryName'),
    pendingSource:!!value.pendingSource,
    creationPending:value.creationPending?Object.freeze({workspaceId:value.creationPending.workspaceId,path:value.creationPending.path}):null,
    toolPreviewStatus:Object.freeze({text:value.toolPreviewStatus?.text||'',error:!!value.toolPreviewStatus?.error}),
    actionReview:value.actionReview?Object.freeze({message:value.actionReview.message,button:value.actionReview.button}):null,
    knowledgeHandoff:value.knowledgeHandoff?Object.freeze({title:value.knowledgeHandoff.title,filename:value.knowledgeHandoff.filename}):null
  });
}
