// Frozen project-owned frame code. Inspection never evaluates code or fetches URLs.
import {digestUtf8,invariant} from '../../platform/protocol.js';

export const PREFIX='// OpenDesk Page frame resources v1 ';
export const PAGE_FRAME_RESOURCES_FORMAT='opendesk.page-frame-resources.v1';
export const PAGE_FRAME_RESOURCE_ID=/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/;
export const PAGE_FRAME_RESOURCES_LIMITS=Object.freeze({count:4,resourceBytes:5*1024*1024,totalBytes:6*1024*1024});
// Worst-case JSON escaping: source controls use six characters, then seven in a
// JSON draft string. These transport bounds never replace the decoded code limits.
export const PAGE_FRAME_SOURCE_LIMIT=6*PAGE_FRAME_RESOURCES_LIMITS.totalBytes+512*1024+8192;
export const PAGE_FRAME_DRAFT_LIMIT=7*PAGE_FRAME_RESOURCES_LIMITS.totalBytes+768*1024;
const encoder=new TextEncoder();
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&
  Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));

function inspectResources(resources){
  invariant(Array.isArray(resources)&&resources.length<=PAGE_FRAME_RESOURCES_LIMITS.count,
    'E_PAGE_FRAME_RESOURCES','Page frame resources must be an array of at most four entries');
  let total=0;
  const ids=new Set();
  for(const row of resources){
    invariant(exact(row,['resourceId','code','bytes','sha256'])&&typeof row.resourceId==='string'&&
      PAGE_FRAME_RESOURCE_ID.test(row.resourceId)&&!ids.has(row.resourceId)&&
      typeof row.code==='string'&&row.code.trim()&&Number.isInteger(row.bytes)&&row.bytes>0&&
      row.bytes<=PAGE_FRAME_RESOURCES_LIMITS.resourceBytes&&encoder.encode(row.code).length===row.bytes&&
      typeof row.sha256==='string'&&/^[a-f0-9]{64}$/.test(row.sha256),
      'E_PAGE_FRAME_RESOURCES','Invalid Page frame resource identity, code, byte count or SHA-256');
    ids.add(row.resourceId);total+=row.bytes;
  }
  invariant(total<=PAGE_FRAME_RESOURCES_LIMITS.totalBytes,
    'E_PAGE_FRAME_RESOURCES','Page frame resources exceed the 6 MiB total limit');
}

export function inspectPageFrameSource(sourceUtf8){
  invariant(typeof sourceUtf8==='string','E_SOURCE','Page source must be text');
  if(!sourceUtf8.startsWith(PREFIX))return null;
  const end=sourceUtf8.indexOf('\n');
  // JSON escaping can use six bytes per source byte; this only bounds parsing overhead.
  invariant(sourceUtf8.length<=PAGE_FRAME_SOURCE_LIMIT&&end>PREFIX.length&&end<=PAGE_FRAME_RESOURCES_LIMITS.totalBytes*6+4096&&
    !/[\r\u2028\u2029]/.test(sourceUtf8.slice(0,end)),
    'E_PAGE_FRAME_RESOURCES','Page frame resources require one bounded JSON comment line');
  let header;
  try{header=JSON.parse(sourceUtf8.slice(PREFIX.length,end));}
  catch{invariant(false,'E_PAGE_FRAME_RESOURCES','Page frame resource header must be JSON');}
  invariant(exact(header,['format','resources'])&&header.format===PAGE_FRAME_RESOURCES_FORMAT,
    'E_PAGE_FRAME_RESOURCES','Unsupported Page frame resource header');
  inspectResources(header.resources);
  const body=sourceUtf8.slice(end+1);
  invariant(body.trim()&&!body.startsWith(PREFIX),
    'E_PAGE_FRAME_RESOURCES','Page frame source requires a nonempty body without nested frame headers');
  return {body,resources:header.resources};
}

export async function readPageFrameResources(sourceUtf8){
  const framed=inspectPageFrameSource(sourceUtf8);
  if(!framed)return [];
  for(const row of framed.resources)invariant(await digestUtf8(row.code)===row.sha256,
    'E_PAGE_FRAME_RESOURCE_HASH','Page frame resource SHA-256 mismatch: '+row.resourceId);
  return framed.resources;
}

// Accept {resourceId,code}; byte counts and hashes are always derived from the fixed code.
export async function wrapPageFrameSource(sourceUtf8,resources){
  invariant(typeof sourceUtf8==='string'&&sourceUtf8.trim(),'E_SOURCE','Page source must be nonempty text');
  invariant(!sourceUtf8.startsWith(PREFIX),'E_PAGE_FRAME_RESOURCES','Page frame headers cannot be nested');
  invariant(Array.isArray(resources)&&resources.length<=PAGE_FRAME_RESOURCES_LIMITS.count,
    'E_PAGE_FRAME_RESOURCES','Page frame resources must be an array of at most four entries');
  const rows=resources.map(row=>({resourceId:row?.resourceId,code:row?.code,
    bytes:typeof row?.code==='string'?encoder.encode(row.code).length:0,sha256:'0'.repeat(64)}));
  inspectResources(rows);
  for(const row of rows)row.sha256=await digestUtf8(row.code);
  const header=JSON.stringify({format:PAGE_FRAME_RESOURCES_FORMAT,resources:rows})
    .replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  return PREFIX+header+'\n'+sourceUtf8;
}
