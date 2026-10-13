#!/usr/bin/env node
// Offline Chromium schema discovery; never a runtime permission registry.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {BROWSER_OPERATIONS} from '../src/framework/sdk/browser-contract.js';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const pretty=value=>JSON.stringify(value,null,2)+'\n';
export function parseChromiumJson(raw){
  let out='',state='code',escaped=false;
  for(let i=0;i<raw.length;i++){
    const c=raw[i],n=raw[i+1];
    if(state==='line'){if(c==='\n'){state='code';out+='\n';}else out+=' ';continue;}
    if(state==='block'){if(c==='*'&&n==='/'){out+='  ';i++;state='code';}
      else out+=c==='\n'?'\n':' ';continue;}
    if(state==='string'){out+=c;if(escaped)escaped=false;
      else if(c==='\\')escaped=true;else if(c==='"')state='code';continue;}
    if(c==='"'){state='string';out+=c;}
    else if(c==='/'&&n==='/'){out+='  ';i++;state='line';}
    else if(c==='/'&&n==='*'){out+='  ';i++;state='block';}
    else out+=c;
  }
  if(state==='block'||state==='string')throw Error('Unterminated Chromium JSON string/comment');
  return JSON.parse(out);
}
function shape(v){
  if(!v||typeof v!=='object')return null;
  if(v.$ref)return '$ref:'+v.$ref;
  if(v.choices)return v.choices.map(shape);
  if(v.type==='array')return {type:'array',items:shape(v.items)};
  if(v.type==='object')return 'object';
  return v.type||null;
}
function parsedVersion(v){
  const m=typeof v==='string'?v.match(/^(\d+)(?:\.|$)/):null;
  return m?Number(m[1]):null;
}
export function buildNativeCatalog({sources,compatibility,sourceManifest}){
  // These are discovery-only native correlations, NOT runtime aliases.
  // The archived R8 35-item compatibility list has no authority to create SDK calls.
  const currentTabs=[
    {currentPublicOperation:'browser.tabs.create',nativeApis:['chrome.tabs.create'],
      mappingKind:'SCOPED',existingHost:'src/platform/chrome/context-menus.js'},
    {currentPublicOperation:'browser.tabs.activateOwned',
      nativeApis:['chrome.tabs.get','chrome.tabs.update','chrome.windows.update'],
      mappingKind:'SCOPED',existingHost:'src/platform/chrome/context-menus.js'},
    {currentPublicOperation:'browser.tabs.pinOwned',
      nativeApis:['chrome.tabs.get','chrome.tabs.update','chrome.webNavigation.getFrame'],
      mappingKind:'SCOPED',existingHost:'src/platform/chrome/context-menus.js'},
    {currentPublicOperation:'browser.tabs.reloadOwned',
      nativeApis:['chrome.tabs.get','chrome.tabs.reload','chrome.webNavigation.getFrame'],
      mappingKind:'SCOPED',existingHost:'src/platform/chrome/context-menus.js'},
    {currentPublicOperation:'browser.tabs.navigateOwned',
      nativeApis:['chrome.tabs.get','chrome.tabs.update','chrome.webNavigation.getFrame'],
      mappingKind:'SCOPED',existingHost:'src/platform/chrome/context-menus.js'},
    {currentPublicOperation:'browser.tabs.removeOwned',
      nativeApis:['chrome.tabs.get','chrome.tabs.remove','chrome.webNavigation.getFrame'],
      mappingKind:'SCOPED',existingHost:'src/platform/chrome/context-menus.js'}
  ];
  const legacy=[...compatibility.operations.filter(row=>
    Object.hasOwn(BROWSER_OPERATIONS,row.currentPublicOperation)),...currentTabs];
  const entries=[];
  for(const src of sources){
    const parsed=parseChromiumJson(src.body),docs=Array.isArray(parsed)?parsed:[parsed];
    for(const schema of docs){
      if(!schema?.namespace)continue;
      for(const [key,kind] of [['functions','METHOD'],['events','EVENT'],['properties','PROPERTY']]){
        const v=schema[key];
        const rows=Array.isArray(v)?v:Object.entries(v||{}).map(([name,value])=>({name,...value}));
        for(const entry of rows){
          if(!entry?.name)continue;
          const nativeApi='chrome.'+schema.namespace+'.'+entry.name;
          const mapped=legacy.filter(row=>Object.hasOwn(BROWSER_OPERATIONS,row.currentPublicOperation)&&
            row.nativeApis.includes(nativeApi));
          const minChrome=parsedVersion(entry.min_version??schema.min_version);
          entries.push({
            nativeApi,namespace:schema.namespace,kind,
            parameters:Array.isArray(entry.parameters)?entry.parameters.map(p=>({
              name:p.name||null,optional:Boolean(p.optional),type:shape(p)})):[],
            returnType:shape(entry.returns_async?.parameters?.[0]??entry.returns),
            minChrome,contexts:null,chromePermissions:null,hostPermissions:null,
            availability:minChrome===null?'MIN_VERSION_UNVERIFIED':minChrome<=138?'CHROME_138_POSSIBLE':'AFTER_CHROME_138',
            mappingKind:mapped.length===1?mapped[0].mappingKind:null,
            opendeskOperation:mapped.map(row=>row.currentPublicOperation).sort(),
            hostService:mapped.length===1?mapped[0].existingHost:null,
            exposure:mapped.length?'SEE_APPROVED_SDK_CONTRACT':'NOT_EXPOSED',
            implementation:mapped.length?'MAPPED_TO_EXISTING_CONTRACT':'NOT_IMPLEMENTED',
            source:{path:src.path,gitBlobSha:src.sha},
            evidence:'SCHEMA_DISCOVERY_ONLY_NOT_CHROME_TESTED'
          });
        }
      }
    }
  }
  entries.sort((a,b)=>a.nativeApi<b.nativeApi?-1:a.nativeApi>b.nativeApi?1:a.kind<b.kind?-1:a.kind>b.kind?1:0);
  if(new Set(entries.map(x=>x.nativeApi)).size!==entries.length)
    throw Error('Duplicated Chromium native API in pinned sources');
  return {
    schemaVersion:'opendesk.chrome.native-api.catalog.v1',
    sourceOfTruth:'pinned Chromium JSON schemas (discovery only)',
    chromiumCommit:sourceManifest.chromiumCommit,chromeMinimum:138,
    coverage:'PARTIAL_JSON_ONLY_IDL_AND_OTHER_NAMESPACES_PENDING',
    sourceFiles:sourceManifest.files,
    counts:{namespaces:new Set(entries.map(x=>x.namespace)).size,
      methods:entries.filter(x=>x.kind==='METHOD').length,
      events:entries.filter(x=>x.kind==='EVENT').length,
      properties:entries.filter(x=>x.kind==='PROPERTY').length},
    entries
  };
}
export async function compileNativeCatalog({root=ROOT}={}){
  const src=JSON.parse(await readFile(resolve(root,'docs/api/chrome-native-api-sources.json'),'utf8'));
  const compatibility=JSON.parse(await readFile(resolve(root,'docs/api/browser-sdk-compatibility-map.json'),'utf8'));
  if(src.schemaVersion!=='opendesk.chromium.schema.sources.v1'||
     compatibility.schemaVersion!=='opendesk.browser-sdk.compatibility.v1'||
     src.minimumChrome!==138||!Array.isArray(src.files)||!src.files.length)
    throw Error('Chromium source/compatibility manifest invalid');
  const sources=[];
  for(const meta of src.files){
    if(!/^vendor\/chromium-extension-api\/[a-z_]+\.json$/.test(meta.localPath)||
       !/^[a-f0-9]{40}$/.test(meta.gitBlobSha)||meta.format!=='chromium-json-schema')
      throw Error('Unpinned or unsafe Chromium schema source');
    const body=await readFile(resolve(root,meta.localPath),'utf8');
    const sha=createHash('sha1').update('blob '+Buffer.byteLength(body)+'\0').update(body).digest('hex');
    if(sha!==meta.gitBlobSha)throw Error('Chromium source hash drift: '+meta.localPath);
    sources.push({path:meta.upstreamPath,sha,body});
  }
  return buildNativeCatalog({sources,compatibility,sourceManifest:src});
}
export async function syncNativeCatalog({root=ROOT,check=false}={}){
  const generated=pretty(await compileNativeCatalog({root}));
  const output=resolve(root,'docs/api/chrome-native-api-catalog.json');
  if(check){
    if(generated!==await readFile(output,'utf8'))
      throw Error('Native Chrome catalog drift. Run node scripts/sync-chrome-api-catalog.mjs');
  }else await writeFile(output,generated);
  return JSON.parse(generated).counts;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  syncNativeCatalog({check:process.argv.includes('--check')})
    .then(x=>console.log(JSON.stringify({ok:true,...x,scope:'PINNED_PARTIAL_JSON'})),
      error=>{console.error(error);process.exitCode=1;});
}
