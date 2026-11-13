// Installed Page startup needs metadata and receipts, not every frozen source
// in frameworkKV. Reuse its existing primary-key cursors without a new index.
export async function readPageRecords(tx,kind) {
  const prefix='page-'+kind+':',store='frameworkKV',limit=256,rows=[];
  const tags=kind==='installed'?['page-installed-v1','page-uninstalled-v1']:['page-'+kind+'-v1'];
  if(typeof tx.scanEntries!=='function')return (await tx.all(store)).filter(row=>tags.includes(row?.tag));
  let afterKey;
  for(;;){
    const page=await tx.scanEntries(store,{prefix,afterKey,limit});
    rows.push(...page.map(row=>row.value).filter(row=>tags.includes(row?.tag)));
    if(page.length<limit)return rows;
    afterKey=page.at(-1).key;
  }
}
