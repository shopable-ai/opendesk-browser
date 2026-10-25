(function(root){
'use strict';
// Domain-only module. No Provider, Chrome or privileged Host access.
const fail=(message,code='E_KB_VALIDATION')=>{throw Object.assign(new Error(message),{code});};
const isObject=o=>o!==null&&typeof o==='object'&&!Array.isArray(o);
const size=o=>new TextEncoder().encode(JSON.stringify(o)).byteLength;
const norm=s=>String(s).normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim().replace(/[?？!！。．]+$/gu,'');
const isText=(s,max)=>typeof s==='string'&&s.trim().length>0&&s.length<=max&&!/[\u0000-\u0008\u000b-\u001f]/u.test(s);
const schema=['id','question','aliases','answer','scope','enabled'];
const empty=()=>({version:1,items:[]});
function row(value){
  if(!isObject(value)||Object.keys(value).some(k=>!schema.includes(k))||
     typeof value.id!=='string'||!/^qa_[a-zA-Z0-9_-]{6,64}$/.test(value.id)||
     !isText(value.question,180)||!isText(value.answer,1200)||
     typeof value.scope!=='string'||value.scope.length>60||
     !Array.isArray(value.aliases)||value.aliases.length>8||
     !value.aliases.every(x=>isText(x,180))||typeof value.enabled!=='boolean')
    fail('知识条目不符合问答格式');
  const aliases=value.aliases.map(s=>s.trim());
  if(new Set(aliases.map(norm)).size!==aliases.length)fail('同义问题重复');
  return {id:value.id,question:value.question.trim(),aliases,
    answer:value.answer.trim(),scope:value.scope.trim(),enabled:value.enabled};
}
function library(value){
  if(!isObject(value)||Object.keys(value).sort().join(',')!=='items,version'||
    value.version!==1||!Array.isArray(value.items)||value.items.length>20)
    fail('知识库格式无效或超过 20 条');
  const items=value.items.map(row);
  if(new Set(items.map(x=>x.id)).size!==items.length)fail('知识库包含重复 ID');
  const result={version:1,items};
  if(size(result)>8192)fail('数据超出工具存储单项 8 KiB 限制');
  return result;
}
function save(lib,entry){
  const old=library(lib),next=row(entry);
  const items=old.items.filter(x=>x.id!==next.id);
  items.push(next);
  return library({version:1,items});
}
function remove(lib,id){
  const old=library(lib);
  if(!old.items.some(x=>x.id===id))fail('待删除记录不存在');
  return library({version:1,items:old.items.filter(x=>x.id!==id)});
}
function newId(){
  if(typeof root.crypto?.randomUUID!=='function')fail('缺少安全随机 ID 生成器');
  return 'qa_'+root.crypto.randomUUID().replace(/-/g,'');
}
function tokenize(s){
  const out=[];
  for(const part of norm(s).matchAll(/[\p{Script=Han}]+|[\p{Letter}\p{Number}]+/gu)){
    const w=part[0];
    if(/^\p{Script=Han}+$/u.test(w)){
      if(w.length===1)out.push(w);
      else for(let i=0;i<w.length-1;i++)out.push(w.slice(i,i+2));
    }else if(w.length>1)out.push(w);
  }
  return out;
}
function retrieve(lib,question,scope='',topK=3){
  const docs=library(lib).items.filter(x=>x.enabled&&x.scope===scope);
  const q=[...new Set(tokenize(question))];
  if(!q.length)return [];
  const index=docs.map(entry=>{
    const tf=new Map();
    for(const [text,weight] of [[entry.question,3],...entry.aliases.map(a=>[a,2]),[entry.answer,0.4]]){
      for(const term of tokenize(text))tf.set(term,(tf.get(term)||0)+weight);
    }
    return {entry,tf,len:[...tf.values()].reduce((a,b)=>a+b,0)};
  });
  const avg=index.reduce((n,d)=>n+d.len,0)/(index.length||1);
  return index.map(d=>{
    let score=0,hits=0;
    for(const t of q){
      const frequency=d.tf.get(t)||0;
      if(!frequency)continue;
      hits++;
      const df=index.filter(x=>x.tf.has(t)).length;
      const idf=Math.log(1+(index.length-df+0.5)/(df+0.5));
      score+=idf*(frequency*2.2)/(frequency+1.2*(0.25+0.75*d.len/(avg||1)));
    }
    return {id:d.entry.id,question:d.entry.question,answer:d.entry.answer,
      score:Number(score.toFixed(4)),coverage:Number((hits/q.length).toFixed(3))};
  }).filter(x=>x.score>=0.25&&x.coverage>=0.3)
    .sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id))
    .slice(0,Math.max(1,Math.min(3,topK)));
}
function lookup(lib,{question,scope=''}={}){
  const rows=library(lib).items;
  if(!isText(question,300)||typeof scope!=='string'||scope.length>60)
    fail('问题或适用条件无效');
  const exact=rows.filter(x=>x.enabled&&x.scope===scope&&
    [x.question,...x.aliases].some(q=>norm(q)===norm(question)));
  if(exact.length>1)return {status:'AMBIGUOUS',answer:'',sourceIds:exact.map(x=>x.id),needsHuman:true,candidates:[]};
  if(exact.length===1)return {status:'ANSWERED_FIXED',answer:exact[0].answer,
    sourceIds:[exact[0].id],needsHuman:false,candidates:[]};
  const candidates=retrieve(lib,question,scope);
  return {status:candidates.length?'RETRIEVED_ONLY':'NO_MATCH',answer:'',
    sourceIds:candidates.map(x=>x.id),needsHuman:true,candidates};
}
const numerics=s=>String(s).replace(/(\d)\s+(%|元|天|月|年|小时|分钟|GB|MB)/gu,'$1$2')
  .match(/\d+(?:[.,]\d+)?(?:%|元|天|月|年|小时|分钟|GB|MB)?/gu)||[];
async function answerWithAI(lib,ask,generate){
  const found=lookup(lib,ask);
  if(found.status!=='RETRIEVED_ONLY'||typeof generate!=='function')return found;
  const records=found.sourceIds.map(id=>library(lib).items.find(x=>x.id===id));
  const output=await generate({question:ask.question,scope:ask.scope||'',
    references:records.map(({id,question,aliases,answer,scope})=>({id,question,aliases,answer,scope}))});
  const proposal=isObject(output?.proposal)?output.proposal:output;
  if(!isObject(proposal)||!isText(proposal.answer,3000)||
     !Array.isArray(proposal.sourceIds)||!proposal.sourceIds.length||proposal.sourceIds.length>3||
     proposal.sourceIds.some(id=>!records.some(r=>r.id===id))||
     new Set(proposal.sourceIds).size!==proposal.sourceIds.length||
     typeof proposal.needsHuman!=='boolean')
    return {...found,status:'INVALID_AI',answer:'',needsHuman:true};
  const cited=records.filter(x=>proposal.sourceIds.includes(x.id));
  const facts=new Set(numerics(cited.map(x=>x.answer).join('\n')));
  const drift=numerics(proposal.answer).some(x=>!facts.has(x));
  if(drift)return {...found,status:'INVALID_AI',answer:'',needsHuman:true,reason:'NUMERIC_DRIFT'};
  // R1 retrieval scores and numeric checks do not prove semantic entailment.
  // The model output remains a reviewable draft; never unlock web auto-send.
  return {status:'REVIEW_REQUIRED',
    answer:proposal.answer.trim(),sourceIds:proposal.sourceIds.slice(),
    needsHuman:true,reason:'SEMANTIC_UNVERIFIED',candidates:found.candidates};
}
function merge(lib,incoming,mode='merge'){
  const current=library(lib),next=library(incoming);
  if(mode!=='merge'&&mode!=='replace')fail('未知导入策略');
  const items=mode==='replace'?[]:current.items.slice();
  let added=0,conflicts=0;
  for(const entry of next.items){
    if(items.some(x=>x.id===entry.id)){conflicts++;continue;}
    items.push(entry);added++;
  }
  return {library:library({version:1,items}),added,conflicts,mode};
}
function parseJson(text){
  if(typeof text!=='string'||new TextEncoder().encode(text).byteLength>65536)fail('JSON 文件超限');
  let value;try{value=JSON.parse(text.replace(/^\uFEFF/u,''));}catch{fail('JSON 文件格式错误');}
  return library(value);
}
// Strict RFC4180-like parser, fixed columns, no guessed headers or silent drops.
const columns=['id','question','aliases','answer','scope','enabled'];
function parseCsv(text){
  if(typeof text!=='string'||new TextEncoder().encode(text).byteLength>65536)fail('CSV 文件超限');
  const rows=[],line=[];let value='',quoted=false,closed=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(quoted){
      if(ch==='"'&&text[i+1]==='"'){value+='"';i++;}
      else if(ch==='"'){quoted=false;closed=true;}
      else value+=ch;
    }else if(ch==='"'&&!value&&!closed)quoted=true;
    else if(ch===','||ch==='\n'||ch==='\r'){
      line.push(value);value='';closed=false;
      if(ch!==','){rows.push(line.splice(0));if(ch==='\r'&&text[i+1]==='\n')i++;}
    }else if(closed)fail('CSV 引号结束后有非法字符');
    else value+=ch;
  }
  if(quoted)fail('CSV 引号未闭合');
  if(value||line.length){line.push(value);rows.push(line.splice(0));}
  if(!rows.length||rows[0].length!==columns.length||
    rows[0].some((v,i)=>v.replace(/^\uFEFF/u,'')!==columns[i]))fail('CSV 表头不匹配');
  if(rows.length-1>20)fail('CSV 超过 20 条');
  return library({version:1,items:rows.slice(1).map(cells=>{
    if(cells.length!==6)fail('CSV 列数错误');
    let aliases;try{aliases=JSON.parse(cells[2]);}catch{fail('CSV 同义问题列必须是 JSON 数组');}
    if(!['true','false'].includes(cells[5]))fail('CSV enabled 只能是 true/false');
    return {id:cells[0],question:cells[1],aliases,answer:cells[3],scope:cells[4],enabled:cells[5]==='true'};
  })});
}
function exportCsv(lib){
  const quote=v=>{
    let text=String(v);
    if(/^\s*[=+\-@]/u.test(text))text="'"+text; // spreadsheet formula safety
    return '"'+text.replace(/"/g,'""')+'"';
  };
  return [columns.join(','),...library(lib).items.map(x=>
    [x.id,x.question,JSON.stringify(x.aliases),x.answer,x.scope,x.enabled]
      .map(quote).join(','))].join('\r\n')+'\r\n';
}
root.OpenDeskKnowledgeAnswersModel=Object.freeze({empty,library,row,save,remove,newId,
  lookup,retrieve,answerWithAI,merge,parseJson,parseCsv,exportCsv,size});
})(globalThis);
