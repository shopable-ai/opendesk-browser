// Read-only presentation of the existing Page cleanup receipts. A confirmed
// installation and an unobserved old document are independent states.
export function describePageCleanup(programId,current,pending=[]) {
  if(!programId)return null;
  const records=[
    ...(current?.programId===programId&&current.managedCleanup&&
      current.managedCleanup.state!=='retired'?[current]:[]),
    ...(Array.isArray(pending)?pending:[]).filter(row=>row.programId===programId&&
      row.managedCleanup?.state!=='retired')
  ];
  if(!records.length)return null;
  const documents=new Map();
  for(const row of records){
    for(const document of row.managedCleanup?.pendingDocuments||[]){
      const key=JSON.stringify([document.tabId,document.documentId??null]);
      if(!documents.has(key))documents.set(key,{...document,key});
    }
  }
  return {documents:[...documents.values()],records:records.map(row=>{
    const cleanup=row.managedCleanup;
    const error=cleanup?.error;
    return {revision:row.revision,state:cleanup?.state||'unknown',
      records:cleanup?.records,pendingRecords:cleanup?.pendingRecords,
      ...(error?{error:{code:error.code,message:error.message}}:{})};
  })};
}

function isCleanup(cleanup){
  if(!cleanup||!['unknown','retired'].includes(cleanup.state))return false;
  const {pendingDocuments,pendingRecords}=cleanup;
  return !(cleanup.state==='retired'&&(pendingRecords>0||pendingDocuments?.length))&&
    (pendingDocuments===undefined||(Array.isArray(pendingDocuments)&&pendingDocuments.every(document=>
      Number.isSafeInteger(document?.tabId)&&typeof document.documentId==='string'&&
      (document.tabTitle===undefined||typeof document.tabTitle==='string'))));
}

export function isPageCleanupHistory(rows){
  return Array.isArray(rows)&&rows.every(row=>typeof row?.programId==='string'&&row.programId.length>0&&
    (row.title===undefined||typeof row.title==='string')&&isCleanup(row.managedCleanup));
}

export function describePageCleanupGroups(response){
  if(!Array.isArray(response?.installed)||!isPageCleanupHistory(response.cleanupPending))return null;
  const byProgram=new Map();
  for(const row of response.installed){
    const page=row?.installed??row;
    if(typeof page?.programId!=='string'||!page.programId||
      (page.managedCleanup!=null&&!isCleanup(page.managedCleanup)))return null;
    if(page.managedCleanup?.state==='unknown')byProgram.set(page.programId,{page,history:[]});
  }
  for(const row of response.cleanupPending){
    if(row.managedCleanup.state==='retired')continue;
    if(!byProgram.has(row.programId))byProgram.set(row.programId,{history:[]});
    byProgram.get(row.programId).history.push(row);
  }
  return [...byProgram].map(([id,{page,history}])=>({id,
    title:[page?.title,...history.map(row=>row.title)].find(title=>typeof title==='string'&&title.trim())||id,
    cleanup:describePageCleanup(id,page,history)}));
}
