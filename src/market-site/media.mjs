// Build-time presentation assets only; never an application registry or trust root.
import {createHash} from 'node:crypto';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const sha=/^[0-9a-f]{64}$/;
const need=(ok,message)=>{if(!ok)throw Error('Market screenshot: '+message);};
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&
  Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const text=(value,limit)=>typeof value==='string'&&value.trim()===value&&value.length>0&&value.length<=limit&&!/[\u0000-\u001f]/.test(value);

export function pngSize(bytes){
  need(Buffer.isBuffer(bytes)&&bytes.length>=33&&bytes.length<=5*1024*1024,'bounded PNG bytes required');
  need(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&
    bytes.readUInt32BE(8)===13&&bytes.toString('ascii',12,16)==='IHDR','PNG IHDR required');
  const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
  need(width>0&&height>0&&width<=8192&&height<=8192,'invalid or oversized image dimensions');
  return {width,height};
}

export async function marketScreenshots({index,releases,readScreenshot}){
  need(exact(index,['schema','items'])&&index.schema==='opendesk.market.media.v1'&&
    Array.isArray(index.items)&&index.items.length<=128,'invalid reviewed media index');
  const seen=new Set(),result=[];
  for(const item of index.items){
    need(exact(item,['toolId','version','sha256','alt','caption','evidence']),'unexpected screenshot fields');
    need(/^[a-z][a-z0-9-]{1,39}$/.test(item.toolId)&&/^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/.test(item.version), 'invalid fixed screenshot identity');
    need(sha.test(item.sha256)&&text(item.alt,240)&&text(item.caption,240),'invalid image identity or display text');
    const evidence=item.evidence;
    need(exact(evidence,['sourceCommit','runId','artifactId','packageHash','releaseSha256','chromeVersion','capturePath','surface','state']), 'incomplete screenshot provenance');
    need(/^[0-9a-f]{40}$/.test(evidence.sourceCommit)&&Number.isSafeInteger(evidence.runId)&&evidence.runId>0&&
      Number.isSafeInteger(evidence.artifactId)&&evidence.artifactId>0&&sha.test(evidence.packageHash)&&
      sha.test(evidence.releaseSha256)&&/^Chrome\/\d+(\.\d+){3}$/.test(evidence.chromeVersion), 'invalid source or browser provenance');
    need(text(evidence.capturePath,200)&&/^[a-zA-Z0-9_./-]+\.png$/.test(evidence.capturePath)&&
      !evidence.capturePath.startsWith('/')&&!evidence.capturePath.includes('..')&&!evidence.capturePath.includes('//')&&
      ['standalone-tool-page','side-panel','authorized-web-page'].includes(evidence.surface)&&text(evidence.state,160), 'invalid capture context');
    const release=releases.find(row=>row.toolId===item.toolId&&row.version===item.version);
    need(release&&release.sha256===evidence.releaseSha256,'screenshot must match a controlled fixed release');
    const filename=item.toolId+'-'+item.version+'.png';
    need(!seen.has(filename),'duplicate screenshot for '+filename);seen.add(filename);
    const bytes=await readScreenshot(filename);
    need(hash(bytes)===item.sha256,'image bytes differ from reviewed screenshot '+filename);
    result.push({...item,filename,src:'/media/'+filename,...pngSize(bytes),bytes});
  }
  return result;
}
