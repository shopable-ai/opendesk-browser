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
  return {documents:[...documents.values()],records:records.map(row=>({
    revision:row.revision,state:row.managedCleanup?.state||'unknown',
    records:row.managedCleanup?.records,pendingRecords:row.managedCleanup?.pendingRecords
  }))};
}
