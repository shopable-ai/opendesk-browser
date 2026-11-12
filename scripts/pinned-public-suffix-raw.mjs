// Build-only reduction of one reviewed raw data import. The complete upstream
// file stays unchanged in its owner project; no executable code is evaluated.
import {readFileSync,realpathSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {parse} from 'acorn';

const sourcePath='projects/ai-proxy/src/usage/vendor/public_suffix_list.dat';
const sourceBlob='1eca38b5174fdd4b43612cd5e639dca5b06299d9';
// The removal is valid only for this original consumer's ignored-line grammar.
const consumerPath='projects/ai-proxy/src/usage/domain.ts';
const consumerBlob='3730ac5455225e5451b142fba7be3403426272ab';
const notice=/copyright|licen[cs]|mozilla|\bmpl\b|\bpermission\b|all rights reserved|©/i;
const section=/^\/\/\s*===(?:BEGIN|END) (?:ICANN|PRIVATE) DOMAINS===\s*$/;

function reviewedFile(root,path,pin){
  const file=resolve(root,path);
  if(realpathSync(file)!==file)throw Error('Pinned PSL input must not be a symlink: '+path);
  const bytes=readFileSync(file);
  const blob=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
  if(blob!==pin)throw Error('Pinned PSL input changed; review before compacting: '+path);
  return bytes.toString('utf8');
}
const token=line=>line.trim().split(/\s/)[0];
const isRule=line=>{const value=token(line);return value&&!value.startsWith('//');};
function compactIgnoredLines(source){
  const lines=source.split('\n'),firstRule=lines.findIndex(isRule);
  if(firstRule<0)throw Error('Pinned PSL has no rules');
  // Preserve the entire original header, including MPL, upstream source,
  // version, commit and usage notices, verbatim and in their original order.
  const kept=lines.slice(0,firstRule);
  for(let index=firstRule;index<lines.length;){
    const line=lines[index];
    if(!line.trim()){index++;continue;}
    if(!line.trim().startsWith('//')){kept.push(line);index++;continue;}
    const block=[];
    while(index<lines.length&&lines[index].trim().startsWith('//'))block.push(lines[index++]);
    // Retain complete notice blocks, not just the line containing a keyword.
    if(block.some(value=>notice.test(value)||section.test(value.trim())))kept.push(...block);
  }
  const compact=kept.join('\n')+'\n';
  const before=lines.filter(isRule).map(token),after=compact.split('\n').filter(isRule).map(token);
  if(before.length!==after.length||before.some((rule,index)=>rule!==after[index]))
    throw Error('Pinned PSL rule sequence changed while compacting');
  return compact;
}

export function transformPinnedPublicSuffixRaw(code,id,{target,root=process.cwd()}={}){
  if(target!=='ui/tool-shell.js'||id!==resolve(root,sourcePath)+'?raw')return null;
  const source=reviewedFile(root,sourcePath,sourceBlob);
  reviewedFile(root,consumerPath,consumerBlob);
  let body;
  try{body=parse(code,{ecmaVersion:'latest',sourceType:'module'}).body;}
  catch{throw Error('Pinned PSL raw import must be one default string export');}
  const exported=body.length===1&&body[0].type==='ExportDefaultDeclaration'?body[0].declaration:null;
  if(exported?.type!=='Literal'||typeof exported.value!=='string')
    throw Error('Pinned PSL raw import must be one default string export');
  if(exported.value!==source)throw Error('Pinned PSL raw import differs from reviewed source bytes');
  return 'export default '+JSON.stringify(compactIgnoredLines(source))+';';
}
