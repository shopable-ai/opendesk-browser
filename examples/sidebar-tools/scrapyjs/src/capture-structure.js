import {configKey,isRunSettled} from './local-runner-client.js';

export async function structureInputHash(binding){
  const value=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(binding));
  return 'sha256:'+Array.from(new Uint8Array(value),byte=>byte.toString(16).padStart(2,'0')).join('');
}

export function validateStructure(run,reply,config){
  if(!isRunSettled(run)||run.status!=='completed'||run.mode!=='structure'||run.previewPassed||
    run.errors.length||run.pagesVisited!==1||run.recordsCount!==1||configKey(run.config)!==configKey(config)||
    reply.offset!==0||reply.total!==1||reply.records.length!==1)throw Error('网页结构任务尚未成功完成，不能采用样本。');
  const row=reply.records[0];
  let url;try{url=new URL(row.url);}catch{}
  if(row.format!=='scrapyjs.static-structure.v1'||!url||url.origin!==new URL(config.url).origin||url.username||url.password||
    row.inputHash!==config.inputHash||!/^sha256:[a-f0-9]{64}$/.test(row.sourceHash)||
    typeof row.fetchedAt!=='string'||!Number.isFinite(Date.parse(row.fetchedAt))||typeof row.truncated!=='boolean'||
    typeof row.sample!=='string'||!row.sample.trim()||new TextEncoder().encode(row.sample).length>8000||
    new TextEncoder().encode(JSON.stringify(row)).length>16384)throw Error('网页结构来源、输入绑定或大小不符，未采用。');
  return structuredClone(row);
}
