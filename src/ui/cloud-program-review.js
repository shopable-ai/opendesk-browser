// Pure descriptor and source-comparison helpers. Neither imports, installs,
// authorizes, nor evaluates a remote program.
export function matchesCloudProgramDescriptor(row,deliveryId,pkg){
  const manifest=pkg?.manifest;
  return Boolean(row&&row.deliveryId===deliveryId&&manifest&&
    pkg.manifestHash===row.manifestHash&&
    manifest.program?.sourceHash===row.sourceHash&&
    manifest.taskId===row.taskId&&manifest.version===row.version&&
    manifest.title===row.title&&
    Array.isArray(row.siteOrigins)&&Array.isArray(manifest.siteOrigins)&&
    row.siteOrigins.length===manifest.siteOrigins.length&&
    row.siteOrigins.every((origin,index)=>origin===manifest.siteOrigins[index]));
}

// A bounded, honest line-level change region (not a misleading claim that
// this is a full semantic diff). For large edits, inspect both full sources.
export function summarizeCloudSourceDifference(before,after){
  if(typeof before!=='string'||typeof after!=='string')return null;
  const previous=before.replace(/\r\n/g,'\n').split('\n'),
    next=after.replace(/\r\n/g,'\n').split('\n');
  let prefix=0,suffix=0;
  while(prefix<previous.length&&prefix<next.length&&previous[prefix]===next[prefix])
    prefix++;
  while(suffix<previous.length-prefix&&suffix<next.length-prefix&&
    previous[previous.length-1-suffix]===next[next.length-1-suffix])suffix++;
  const removed=previous.slice(prefix,previous.length-suffix),
    added=next.slice(prefix,next.length-suffix);
  if(!removed.length&&!added.length)return {removed:0,added:0,excerpt:'源码没有变化',truncated:false};
  const commonBefore=next.slice(Math.max(0,prefix-2),prefix).map(line=>'  '+line);
  const commonAfter=suffix?next.slice(next.length-suffix,Math.min(next.length,next.length-suffix+2)).map(line=>'  '+line):[];
  const changed=[...removed.map(line=>'- '+line),...added.map(line=>'+ '+line)];
  const excerpt=[...commonBefore,...changed.slice(0,120),...(changed.length>120?['… 变更内容已截断，请对照查看完整源码']:[]),...commonAfter].join('\n');
  return {removed:removed.length,added:added.length,excerpt:excerpt.slice(0,14000),
    truncated:changed.length>120||excerpt.length>14000};
}
