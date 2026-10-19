// Trusted, bounded TOC summary shared by the webpage overlay and the Side Panel.
// A single depth-0 heading is rarely a useful "overview": progressively reveal
// children, but do not turn the compact overview into the entire outline.
export const TOC_OVERVIEW_TARGET=5;
export const TOC_OVERVIEW_LIMIT=12;
export const TOC_OVERVIEW_MAX_DEPTH=3;

export function selectReadingTocOverview(items,activeId='') {
  const roots=items.filter(item=>item.depth===0);
  if(!roots.length)return {ids:[],representedId:'',hiddenCount:0,depth:0};
  let depth=0,candidates=roots;
  if(roots.length<TOC_OVERVIEW_TARGET){
    while(candidates.length<TOC_OVERVIEW_TARGET && depth<TOC_OVERVIEW_MAX_DEPTH){
      const expanded=items.filter(item=>item.depth<=depth+1);
      if(expanded.length===candidates.length)break;
      candidates=expanded;depth++;
    }
  }
  let shown=candidates;
  if(roots.length<TOC_OVERVIEW_TARGET && candidates.length>TOC_OVERVIEW_LIMIT){
    const chosen=new Set(roots.map(item=>item.id));
    const sourceItems=new Map(items.map(item=>[item.id,item]));
    // Preserve the current reading position even when it lies beyond the
    // first 12 headings. Pin its closest eligible ancestor chain, then its
    // adjacent siblings, before distributing the remaining overview slots.
    let anchor=sourceItems.get(activeId);
    while(anchor&&anchor.depth>depth)anchor=sourceItems.get(anchor.parentId);
    if(anchor?.depth>0){
      const ancestors=[],seen=new Set();
      for(let item=anchor;item?.depth>0&&!seen.has(item.id);item=sourceItems.get(item.parentId)){
        ancestors.unshift(item);seen.add(item.id);
      }
      for(const item of ancestors){
        if(chosen.has(item.parentId)&&chosen.size<TOC_OVERVIEW_LIMIT)chosen.add(item.id);
      }
      const siblings=candidates.filter(item=>item.depth===anchor.depth&&item.parentId===anchor.parentId);
      const index=siblings.findIndex(item=>item.id===anchor.id);
      for(const sibling of [siblings[index-1],siblings[index+1]]){
        if(sibling&&chosen.has(sibling.parentId)&&chosen.size<TOC_OVERVIEW_LIMIT)chosen.add(sibling.id);
      }
    }
    // Allocate remaining siblings across top-level sections fairly.
    // No displayed descendant may lose its visible real parent.
    for(let level=1;level<=depth && chosen.size<TOC_OVERVIEW_LIMIT;level++){
      const queues=roots.map(root=>candidates.filter(item=>
        item.depth===level&&item.topId===root.id));
      while(chosen.size<TOC_OVERVIEW_LIMIT && queues.some(queue=>queue.length)){
        for(const queue of queues){
          if(chosen.size>=TOC_OVERVIEW_LIMIT)break;
          const item=queue.shift();
          if(item && chosen.has(item.parentId))chosen.add(item.id);
        }
      }
    }
    shown=candidates.filter(item=>chosen.has(item.id));
  }
  const visibleIds=new Set(shown.map(item=>item.id));
  const byId=new Map(items.map(item=>[item.id,item]));
  let representedId=activeId;
  while(representedId && !visibleIds.has(representedId)){
    representedId=byId.get(representedId)?.parentId||'';
  }
  if(!visibleIds.has(representedId))representedId=shown[0]?.id||'';
  return {ids:shown.map(item=>item.id),representedId,
    hiddenCount:candidates.length-shown.length,depth};
}
