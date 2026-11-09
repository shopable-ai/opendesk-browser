// Existing Scripts tab. Display-only: never creates or runs Tasks.
export function acceptAppPage(page){
  return page?.view==='scripts'&&!Object.hasOwn(page,'section')?page:null;
}
