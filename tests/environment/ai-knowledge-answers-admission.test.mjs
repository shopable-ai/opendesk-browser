import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createSidebarToolPackage,encodeSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';
import {createOfficialToolResources} from '../../scripts/build-official-tools.mjs';
import {validateSidebarToolPackage} from '../../src/ui/sidebar-tools/package.js';
import {
 TRUSTED_KNOWLEDGE_ID,TRUSTED_KNOWLEDGE_VERSION,
 admitsTrustedKnowledge,trustedKnowledgeProvenanceChanged
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
async function rejected(cases){
 for(const [label,args] of cases)assert.equal(await admitsTrustedKnowledge(args),false,label);
}

test('actual knowledge source and optional official release share bytes; plain import grants no trusted AI',async()=>{
 const {catalog,resources}=await createOfficialToolResources();
 const release=catalog.apps.find(row=>row.toolId===id);
 assert.equal(release.installationPolicy,'optional');
 const tool=await createSidebarToolPackage('examples/sidebar-tools/'+id);
 assert.deepEqual(resources.get(release.packagePath),encodeSidebarToolPackage(tool));
 assert.deepEqual(tool.capabilities,['storage.local','user.export']);
 const args={...fixture(),tool,installed:[tool],release,
  provenance:{[id]:{marketId:release.id,sha256:release.sha256,version:release.version}}};
 assert.equal(await admitsTrustedKnowledge(args),true);
 assert.equal(await admitsTrustedKnowledge({...args,provenance:{}}),false);
});

test('exact official canonical package is admitted, including reordered storage keys',async()=>{
 assert.equal(TRUSTED_KNOWLEDGE_ID,id);
 assert.equal(TRUSTED_KNOWLEDGE_VERSION,'0.1.2');
 const args=fixture();
 assert.equal(await admitsTrustedKnowledge(args),true);
 assert.equal(await admitsTrustedKnowledge({...args,enableRecords:{[id]:true}}),true);
 const reordered=Object.fromEntries(Object.entries(args.tool).reverse());
 assert.equal(await admitsTrustedKnowledge({...args,installed:[reordered]}),true);
 // Existing lifecycle contract: no epoch is represented by explicit null.
 assert.equal(await admitsTrustedKnowledge({...args,epochs:{},expectedEpoch:null}),true);
 assert.equal(await admitsTrustedKnowledge({...args,epochs:undefined,expectedEpoch:null}),true);
});

test('official identity, exact package path, version and storage capability are mandatory',async()=>{
 const args=fixture();
 await rejected([
  ['different tool ID',{...args,tool:{...args.tool,id:'another-tool'}}],
  ['different publisher',{...args,release:{...args.release,id:'third-party/'+id}}],
  ['different release tool',{...args,release:{...args.release,toolId:'another-tool'}}],
  ['different path',{...args,release:{...args.release,packagePath:'examples/sidebar-tools/'+id+'/'+id+'.opendesk-tool.json'}}],
  ['non-exact path',{...args,release:{...args.release,packagePath:args.release.packagePath+'?v=1'}}],
  ['new official version',fixture({version:'0.1.3'})],
  ['previous official version',fixture({version:'0.1.1'})],
  ['old official version',fixture({version:'0.1.0'})],
  ['release version mismatch',{...args,release:{...args.release,version:'0.1.3'}}],
  ['missing storage.local',fixture({capabilities:['user.export']})]
 ]);
});

test('same ID replacements and altered package bytes never inherit trusted admission',async()=>{
 const args=fixture(),changed=fixture({js:'globalThis.changed=true;'});
 assert.notEqual(changed.release.sha256,args.release.sha256);
 assert.equal(changed.release.bytes===args.release.bytes,false);
 await rejected([
  ['missing install',{...args,installed:[]}],
  ['invalid install list',{...args,installed:{[id]:args.tool}}],
  ['same ID altered install',{...args,installed:[changed.tool]}],
  ['altered requested package',{...args,tool:changed.tool}],
  ['both packages replaced, official release unchanged',{
   ...args,tool:changed.tool,installed:changed.installed
  }],
  // Matching forged provenance is insufficient: final real digest must agree.
  ['forged release and provenance hash',{
   ...args,release:{...args.release,sha256:'f'.repeat(64)},
   provenance:{[id]:{...args.provenance[id],sha256:'f'.repeat(64)}}
  }],
  ['wrong byte count',{...args,release:{...args.release,bytes:args.release.bytes+1}}],
  ['invalid package schema',{
   ...args,tool:{...args.tool,extra:true},installed:[{...args.tool,extra:true}]
  }]
 ]);
 // Equal length tampering still fails the final digest check.
 const sameLength=fixture({js:'void 1;'});
 assert.equal(sameLength.release.bytes,args.release.bytes);
 assert.notEqual(sameLength.release.sha256,args.release.sha256);
 assert.equal(await admitsTrustedKnowledge({
  ...args,tool:sameLength.tool,installed:sameLength.installed
 }),false);
});

test('absent, malformed or mismatched provenance fails closed',async()=>{
 const args=fixture(),source=args.provenance[id];
 await rejected([
  ['missing provenance',{...args,provenance:undefined}],
  ['absent source',{...args,provenance:{}}],
  ['array source map',{...args,provenance:[]}],
  ['inherited source',{...args,provenance:Object.create({[id]:source})}],
  ...[null,[],{}, {...source,extra:true},
   {...source,marketId:'third-party/'+id},{...source,version:'0.1.3'},
   {...source,sha256:'f'.repeat(64)},{...source,sha256:source.sha256.toUpperCase()},
   {marketId:source.marketId,version:source.version}
  ].map((value,index)=>['invalid source '+index,{...args,provenance:{[id]:value}}]),
  ['invalid release digest',{...args,release:{...args.release,sha256:'invalid'}}]
 ]);
});

test('disable and stale, missing or malformed epoch authority reject admission',async()=>{
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
 Object.defineProperty(broken.release,'sha256',{get(){throw new Error('unreadable');}});
 assert.equal(await admitsTrustedKnowledge(broken),false);
});

test('unrelated provenance updates preserve valid knowledge; own changes revoke it',()=>{
 const source=fixture().provenance[id];
 for(const unrelated of [undefined,{marketId:'opendesk/other-tool',sha256:'a'.repeat(64)},null]){
  assert.equal(trustedKnowledgeProvenanceChanged({
   oldValue:{[id]:source,'other-tool':{old:true}},
   newValue:{'other-tool':unrelated,[id]:{sha256:source.sha256,version:source.version,marketId:source.marketId}}
  }),false);
 }
 for(const value of [undefined,null,[],{},
  {...source,sha256:fixture({js:'void 1;'}).release.sha256},
  {...source,version:'0.1.3'},{...source,marketId:'third-party/'+id},
  {...source,extra:true}]){
  assert.equal(trustedKnowledgeProvenanceChanged({oldValue:{[id]:source},newValue:{[id]:value}}),true);
  assert.equal(trustedKnowledgeProvenanceChanged({oldValue:{[id]:value},newValue:{[id]:source}}),true);
 }
 assert.equal(trustedKnowledgeProvenanceChanged(),true);
});
