import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createSidebarToolPackage,encodeSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';
import {validateSidebarToolPackage} from '../../src/ui/sidebar-tools/package.js';
import {
 TRUSTED_KNOWLEDGE_ID,TRUSTED_KNOWLEDGE_VERSION,
 admitsTrustedKnowledge
} from '../../src/ui/trusted-knowledge-admission.js';

// Use the real schema and portable encoder, independent of parallel UI edits.
function fixture(overrides={}){
 const tool=validateSidebarToolPackage({
  format:'opendesk.sidebar-tool.v2',id:'ai-knowledge-answers',version:TRUSTED_KNOWLEDGE_VERSION,
  title:'AI 知识问答',description:'本地知识问答',capabilities:['storage.local','user.export'],
  html:'<main>知识</main>',css:'',js:'void 0;',
  requires:{browserSdk:'1.0.0'},contributes:{contextMenus:[]},...overrides
 });
 const bytes=encodeSidebarToolPackage(tool);
 const sha256=createHash('sha256').update(bytes).digest('hex');
 const release={id:'opendesk/ai-knowledge-answers',toolId:tool.id,version:tool.version,
  packagePath:'official-tools/ai-knowledge-answers/ai-knowledge-answers.opendesk-tool.json',
  bytes:bytes.length,sha256};
 const source={marketId:release.id,version:release.version,sha256};
 return {tool,installed:[structuredClone(tool)],release,provenance:{[tool.id]:source},
  enableRecords:{},epochs:{[tool.id]:'epoch-current'},expectedEpoch:'epoch-current'};
}
const id='ai-knowledge-answers';
const nextVersion=TRUSTED_KNOWLEDGE_VERSION.replace(/\d+$/,patch=>String(Number(patch)+1));
async function rejected(cases){
 for(const [label,args] of cases)assert.equal(await admitsTrustedKnowledge(args),false,label);
}

test('knowledge admission accepts the formal installed package and current local source without Catalog',async()=>{
 const formal=validateSidebarToolPackage(JSON.parse(await readFile(
  'projects/ai-knowledge-answers/ai-knowledge-answers.opendesk-tool.json','utf8')));
 const local=await createSidebarToolPackage('projects/'+id);
 // The Catalog selects promoted bytes; advancing local source may differ.
 // Both reviewed installations use their actual identity, not each other's bytes.
 for(const tool of [formal,local]){
  assert.deepEqual(tool.capabilities,['storage.local','user.export']);
  const args={...fixture(),tool,installed:[tool],release:undefined,provenance:undefined};
  assert.equal(await admitsTrustedKnowledge(args),true);
 }
});

test('knowledge admission uses the actual canonical installed package, including reordered storage keys',async()=>{
 assert.equal(TRUSTED_KNOWLEDGE_ID,id);
 assert.equal(TRUSTED_KNOWLEDGE_VERSION,'0.1.7');
 const args=fixture();
 assert.equal(await admitsTrustedKnowledge(args),true);
 assert.equal(await admitsTrustedKnowledge({...args,enableRecords:{[id]:true}}),true);
 const reordered=Object.fromEntries(Object.entries(args.tool).reverse());
 assert.equal(await admitsTrustedKnowledge({...args,installed:[reordered]}),true);
 // Existing lifecycle contract: no epoch is represented by explicit null.
 assert.equal(await admitsTrustedKnowledge({...args,epochs:{},expectedEpoch:null}),true);
 assert.equal(await admitsTrustedKnowledge({...args,epochs:undefined,expectedEpoch:null}),true);
});

test('knowledge admission requires the tool identity and declared storage capability',async()=>{
 const args=fixture();
 await rejected([
  ['different tool ID',{...args,tool:{...args.tool,id:'another-tool'}}],
  ['missing storage.local',fixture({capabilities:['user.export']})]
 ]);
 for(const version of [nextVersion,'0.1.3','0.1.0'])
  assert.equal(await admitsTrustedKnowledge(fixture({version})),true,'actual installed version '+version);
});

test('knowledge admission rejects same-ID mismatches, duplicate installs and invalid package schema',async()=>{
 const args=fixture(),changed=fixture({js:'globalThis.changed=true;'});
 assert.notEqual(changed.release.sha256,args.release.sha256);
 assert.equal(changed.release.bytes===args.release.bytes,false);
 await rejected([
  ['missing install',{...args,installed:[]}],
  ['invalid install list',{...args,installed:{[id]:args.tool}}],
  ['same ID altered install',{...args,installed:[changed.tool]}],
  ['altered requested package',{...args,tool:changed.tool}],
  ['duplicate install',{...args,installed:[args.tool,args.tool]}],
  ['duplicate same ID with different bytes',{...args,installed:[args.tool,changed.tool]}],
  ['invalid package schema',{
   ...args,tool:{...args.tool,extra:true},installed:[{...args.tool,extra:true}]
  }]
 ]);
 // A locally reviewed replacement is admitted only when it is the actual install.
 const sameLength=fixture({js:'void 1;'});
 assert.equal(sameLength.release.bytes,args.release.bytes);
 assert.notEqual(sameLength.release.sha256,args.release.sha256);
 assert.equal(await admitsTrustedKnowledge({
  ...args,tool:sameLength.tool,installed:sameLength.installed
 }),true);
});

test('knowledge admission ignores missing, stale or malformed distribution metadata',async()=>{
 const args=fixture(),source=args.provenance[id];
 const admitted=[
  ['missing Catalog',{...args,release:undefined,provenance:undefined}],
  ['missing provenance',{...args,provenance:undefined}],
  ['absent source',{...args,provenance:{}}],
  ['array source map',{...args,provenance:[]}],
  ['inherited source',{...args,provenance:Object.create({[id]:source})}],
  ...[null,[],{}, {...source,extra:true},
   {...source,marketId:'third-party/'+id},{...source,version:nextVersion},
   {...source,sha256:'f'.repeat(64)},{...source,sha256:source.sha256.toUpperCase()},
   {marketId:source.marketId,version:source.version}
  ].map((value,index)=>['invalid source '+index,{...args,provenance:{[id]:value}}]),
  ['invalid release digest',{...args,release:{...args.release,sha256:'invalid'}}]
 ];
 for(const [label,value] of admitted)assert.equal(await admitsTrustedKnowledge(value),true,label);
 const unreadable={...args};
 for(const key of ['release','provenance'])Object.defineProperty(unreadable,key,{
  get(){throw new Error('distribution metadata must not be read');}
 });
 assert.equal(await admitsTrustedKnowledge(unreadable),true);
});

test('knowledge admission rejects disabled, stale, missing or malformed epoch authority',async()=>{
 const args=fixture();
 await rejected([
  ['disabled',{...args,enableRecords:{[id]:false}}],
  ['invalid enable map',{...args,enableRecords:[]}],
  ['invalid enable value',{...args,enableRecords:{[id]:'true'}}],
  ['revoked epoch',{...args,epochs:{[id]:'epoch-revoked'}}],
  ['stale expected epoch',{...args,expectedEpoch:'epoch-old'}],
  ['missing expected epoch',{...args,expectedEpoch:undefined}],
  ['missing current epoch',{...args,epochs:{}}],
  ['invalid epoch map',{...args,epochs:[]}],
  ['null epoch map',{...args,epochs:null}],
  ['invalid epoch',{...args,epochs:{[id]:7},expectedEpoch:7}],
  ['empty epoch',{...args,epochs:{[id]:''},expectedEpoch:''}]
 ]);
 assert.equal(await admitsTrustedKnowledge(),false);
 assert.equal(await admitsTrustedKnowledge({}),false);
 const broken=fixture();
 Object.defineProperty(broken.tool,'js',{get(){throw new Error('unreadable package');}});
 assert.equal(await admitsTrustedKnowledge(broken),false);
});
