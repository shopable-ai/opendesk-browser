// Read-only historical library and consumer audit; NEVER a browser loader or npm manager.
import {readdir,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';

export const HISTORICAL_LIBRARY_SOURCES=Object.freeze({
  axios:'axios.min.js',
  cheerio:'cheerio.1.0.0.min.js',
  cryptojs:'crypto-js.min.js',
  cssSelectorGenerator:'css-selector-generator@3.6.4.esm.js',
  fingerprintjs:'fingerprintjs@3.js',
  jquery:'jquery.min.js',
  jsCookie:'js.cookie.min.js',
  lodash:'lodash.min.js',
  moment:'moment.min.js',
  psl:'psl.min.js',
  quasar:'quasar.umd.min.js',
  queryString:'query-string.min.js',
  socketIo:'socket.io.min.js',
  store:'store.legacy.min.js',
  vue:'vue.global.min.js'
});
export const HISTORICAL_DECISIONS_PATH='docs/architecture/browser-framework/historical-library-decisions-r156.json';
const SNAPSHOT_ROOT='docs/contracts/source-snapshots/scrapyJsChrome';
const SNAPSHOT_LIBS=SNAPSHOT_ROOT+'/assets/js/libs';
const DECISIONS=new Set(['FULLY_MIGRATED','PARTIAL_COMPAT','NEEDS_MIGRATION','DECOMMISSIONED','UNVERIFIED']);
const allowedSource=/\.(?:[cm]?js|[cm]?ts|tsx|jsx|json|html)$/;
const ignored=new Set(['scripts/libs-history-audit.mjs','scripts/libs-doctor.mjs']);
const oldPaths=Object.freeze([
  {code:'OBSOLETE_BUILTIN_PATH',pattern:/(?:src\/)?runtime\/builtin-libraries\//g},
  {code:'OBSOLETE_JQUERY_PATH',pattern:/(?:src\/)?vendor\/jquery-3\.7\.1(?:\.min\.js|\.LICENSE\.txt)/g},
  {code:'LEGACY_LIBRARY_RUNTIME_PATH',pattern:/assets\/js\/libs\//g}
]);
// These are lexical hints, NOT proof that the source has a runtime consumer.
const consumerHints=Object.freeze({
  axios:/\baxiosx?\b/i,cheerio:/\bcheerio\b/i,cryptojs:/\bCryptoJS\b|\bcrypto-js\b/i,
  cssSelectorGenerator:/css-selector-generator/i,
  fingerprintjs:/\bFingerprintJS\b|\bgetFingerprint\b/i,
  jquery:/\bjQuery\b|\bjquery\b/i,
  jsCookie:/\bjs-cookie\b|\bCookies\.(?:get|set|remove)\b/i,
  lodash:/\blodash-es\b|\bOpenDeskLibs\.lodash\b|\blodash\b/i,
  moment:/\bmoment\b|\bdayjs\b/i,
  psl:/\bpsl\b/i,quasar:/\bquasar\b/i,
  queryString:/\bquery-string\b|\bqueryString\b/i,
  socketIo:/\bsocket\.io\b|\bsocket\.io-client\b/i,
  store:/\bstore\.legacy\b/i,vue:/\bvue\b/i
});
const lodashMethods=new Set(['get','has','words','trim','uniq','chunk','escape','truncate']);
const sha=buffer=>createHash('sha256').update(buffer).digest('hex');
const sourcePos=(path,line,column=1)=>path+':'+line+':'+column;
const lineNumbers=source=>String(source).split(/\r?\n/);
const locate=(path,source,match)=>{
  const found=[];
  for(const [index,line] of lineNumbers(source).entries()){
    const column=line.indexOf(match);
    if(column>=0)found.push({file:path,line:index+1,column:column+1});
  }
  return found;
};

export function scanLibrarySourceLines(path,source){
  const issues=[],hints=[],apiReviews=[];
  for(const [index,line] of lineNumbers(source).entries()){
    // Comments remain reviewable in docs but must not create false live consumers.
    const trimmed=line.trim();
    if(trimmed.startsWith('//')||trimmed.startsWith('*')||trimmed.startsWith('<!--'))continue;
    for(const row of oldPaths){
      row.pattern.lastIndex=0;
      for(const match of line.matchAll(row.pattern))issues.push({code:row.code,file:path,
        line:index+1,column:match.index+1,excerpt:trimmed.slice(0,180)});
    }
    for(const [id,pattern] of Object.entries(consumerHints))if(pattern.test(line))
      hints.push({id,file:path,line:index+1,excerpt:trimmed.slice(0,160),evidence:'LEXICAL_HINT_ONLY'});
    for(const match of line.matchAll(/\b(?:OpenDeskLibs\s*\.\s*lodash|(?<![\w$])_)\s*\.\s*([a-zA-Z_$][\w$]*)/g)){
      if(!lodashMethods.has(match[1]))apiReviews.push({id:'lodash',method:match[1],file:path,
        line:index+1,column:match.index+1,evidence:'API_REVIEW_ONLY'});
    }
    for(const match of line.matchAll(/\bdayjs\s*\.\s*(extend|locale)\s*\(/g))
      apiReviews.push({id:'dayjs',method:match[1],file:path,line:index+1,
        column:match.index+1,evidence:'API_REVIEW_ONLY'});
  }
  return {issues,hints,apiReviews};
}

export async function inspectHistoricalLibraryUsage({cwd=process.cwd(),sourceRoots=['src','scripts']}={}){
  const issues=[],warnings=[],assets=[],legacyWorlds={},liveHints=[],apiReviews=[];
  const historicalNames=Object.values(HISTORICAL_LIBRARY_SOURCES), expected=new Set(historicalNames);
  const abs=path=>join(cwd,path);
  const read=async path=>readFile(abs(path),'utf8');
  let entries=[];
  try{entries=await readdir(abs(SNAPSHOT_LIBS),{withFileTypes:true});}
  catch(error){issues.push(sourcePos(SNAPSHOT_LIBS,1)+' inventory unreadable: '+error.message);}
  const actual=new Set();
  for(const entry of entries){
    if(!entry.isFile())issues.push(sourcePos(SNAPSHOT_LIBS+'/'+entry.name,1)+' historical asset must be regular file');
    else actual.add(entry.name);
  }
  for(const name of actual)if(!expected.has(name))issues.push(sourcePos(SNAPSHOT_LIBS+'/'+name,1)+' unreviewed historical file');
  for(const [id,name] of Object.entries(HISTORICAL_LIBRARY_SOURCES)){
    const path=SNAPSHOT_LIBS+'/'+name;
    if(!actual.has(name)){issues.push(sourcePos(path,1)+' historical file missing');continue;}
    try{
      const bytes=await readFile(abs(path));
      if(!bytes.length)issues.push(sourcePos(path,1)+' historical file empty');
      assets.push({id,path,bytes:bytes.length,sha256:sha(bytes)});
    }catch(error){issues.push(sourcePos(path,1)+' historical file unreadable: '+error.message);}
  }
  const legacySources=[
    {file:SNAPSHOT_ROOT+'/background-sw.js',world:'BACKGROUND',type:'background'},
    {file:SNAPSHOT_ROOT+'/manifest.json',world:'ISOLATED',type:'manifest'},
    {file:SNAPSHOT_ROOT+'/my-content-script.js',world:'MAIN',type:'script'}
  ];
  let backgroundEntries=[];
  for(const old of legacySources){
    try{
      const source=await read(old.file);
      if(old.type==='background'){
        const matched=source.match(/\bconst\s+BACKGROUND_SCRIPTS\s*=\s*(\[[\s\S]*?\]);/);
        backgroundEntries=matched?JSON.parse(matched[1]):[];
        if(!Array.isArray(backgroundEntries)||backgroundEntries.length!==17||
           !backgroundEntries.every(path=>typeof path==='string'))
          issues.push(sourcePos(old.file,1)+' expected exactly 17 background importScripts entries');
      }
      if(old.type==='manifest'){
        const manifest=JSON.parse(source);
        if(!Array.isArray(manifest.content_scripts))
          issues.push(sourcePos(old.file,1)+' missing historical content_scripts');
      }
      for(const [id,name] of Object.entries(HISTORICAL_LIBRARY_SOURCES)){
        const asset='assets/js/libs/'+name;
        const locations=locate(old.file,source,asset).filter(location=>{
          if(old.type==='background')return backgroundEntries.includes(asset);
          if(old.type==='manifest')return true; // exact literal path in historical manifest
          const line=lineNumbers(source)[location.line-1].trim();
          return line.startsWith('appendScript(') && !line.startsWith('//');
        });
        if(locations.length)(legacyWorlds[id]??=[]).push(...locations.map(location=>({...location,world:old.world})));
      }
    }catch(error){issues.push(sourcePos(old.file,1)+' historical loader unreadable/invalid: '+error.message);}
  }
  let decisions=[];
  let decisionSource='';
  try{
    decisionSource=await read(HISTORICAL_DECISIONS_PATH);
    const document=JSON.parse(decisionSource);
    if(document.format!=='opendesk.historical-library-decisions.r156.v1'||!Array.isArray(document.rows))
      throw Error('unknown decision ledger format');
    decisions=document.rows;
  }catch(error){issues.push(sourcePos(HISTORICAL_DECISIONS_PATH,1)+' decision ledger unreadable: '+error.message);}
  const seen=new Set();
  for(const row of decisions){
    const id=String(row?.id||''),loc=locate(HISTORICAL_DECISIONS_PATH,decisionSource,'"id": "'+id+'"')[0];
    const where=sourcePos(HISTORICAL_DECISIONS_PATH,loc?.line||1,loc?.column||1);
    if(!Object.hasOwn(HISTORICAL_LIBRARY_SOURCES,id)||seen.has(id)||
       row?.file!==HISTORICAL_LIBRARY_SOURCES[id]||!DECISIONS.has(row?.decision)||
       typeof row?.reason!=='string'||row.reason.trim().length<15||
       !Array.isArray(row?.currentEvidence)||!row.currentEvidence.length)
      issues.push(where+' missing/duplicate/invalid historical migration decision');
    if(row?.decision==='FULLY_MIGRATED'&&(!row.runtimeEvidence||!row.nativeEvidence))
      issues.push(where+' complete migration requires runtime and native evidence');
    if(row?.decision==='UNVERIFIED')warnings.push(where+' unresolved historical dependency: '+id);
    seen.add(id);
  }
  for(const id of Object.keys(HISTORICAL_LIBRARY_SOURCES))if(!seen.has(id))
    issues.push(sourcePos(HISTORICAL_DECISIONS_PATH,1)+' decision missing: '+id);
  async function scan(directory,relative){
    let files;
    try{files=await readdir(abs(directory),{withFileTypes:true});}
    catch(error){if(error?.code==='ENOENT')return;issues.push(sourcePos(directory,1)+' unreadable live source: '+error.message);return;}
    for(const entry of files){
      const path=relative+'/'+entry.name;
      if(entry.isSymbolicLink()){issues.push(sourcePos(path,1)+' live source symlink forbidden');continue;}
      if(entry.isDirectory()){
        if(path!=='src/libs/vendor')await scan(path,path);
      }else if(entry.isFile()&&allowedSource.test(entry.name)&&!ignored.has(path)){
        let source;
        try{source=await read(path);}catch(error){issues.push(sourcePos(path,1)+' unreadable live source: '+error.message);continue;}
        const found=scanLibrarySourceLines(path,source);
        for(const issue of found.issues)issues.push(sourcePos(issue.file,issue.line,issue.column)+' '+issue.code+' '+issue.excerpt);
        liveHints.push(...found.hints);apiReviews.push(...found.apiReviews);
      }
    }
  }
  for(const root of sourceRoots)await scan(root,root);
  const decisionsById=Object.fromEntries(decisions.filter(row=>row?.id).map(row=>[row.id,row]));
  const rows=assets.map(asset=>({...asset,decision:decisionsById[asset.id]?.decision||'UNVERIFIED',
    oldWorlds:legacyWorlds[asset.id]||[],currentHints:liveHints.filter(hit=>hit.id===asset.id).slice(0,20)}));
  if(apiReviews.length)warnings.push(...apiReviews.slice(0,50).map(hit=>
    sourcePos(hit.file,hit.line,hit.column)+' REVIEW API '+hit.id+'.'+hit.method+' not in built-in safe contract'));
  return {status:issues.length?'SOURCE_FAIL':'SOURCE_PASS',issues,warnings,
    historicalAssetCount:rows.length,expectedHistoricalAssets:historicalNames.length,
    historicalBackgroundEntries:backgroundEntries.length,rows,
    liveHintCount:liveHints.length,apiReviews};
}
