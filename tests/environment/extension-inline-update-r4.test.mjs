import test from 'node:test';
import assert from 'node:assert/strict';
import {projectTrustedInlineUpdates} from '../../src/ui/extension-center-model.js';

const hash='a'.repeat(64);
const makeRow=(id,version='1.0.0')=>({
  key:'app:'+id,id,kind:'app',title:id,installed:true,
  update:true,updateIdentity:{id,fromVersion:version,version:'1.1.0',
    source:'opendesk/'+id,sha256:hash}
});
const makeCandidate=(id,status='available')=>({
  kind:'sidebar-tool',id,status,version:'1.1.0',
  fromVersion:'1.0.0',source:'opendesk/'+id,sha256:hash,ignoredAt:null,
  requiresReview:true,newCapabilities:status==='review_required'?['browser.tabs']:[]
});
const state=(...records)=>({verified:true,records});

test('R4 0/1/3/10 candidates map only to the matching installed tool identity',()=>{
  for(const count of [0,1,3,10]){
    const rows=Array.from({length:10},(_,n)=>makeRow('tool-'+n));
    const records=Array.from({length:count},(_,n)=>makeCandidate('tool-'+n));
    const next=projectTrustedInlineUpdates(rows,state(...records),{promote:true});
    assert.equal(next.filter(row=>row.inlineUpdate).length,count);
    assert.deepEqual(next.slice(0,count).map(row=>row.id),
      Array.from({length:count},(_,n)=>'tool-'+n));
    assert.deepEqual(rows.map(row=>row.id),Array.from({length:10},(_,n)=>'tool-'+n),
      'a presentation sort never mutates Registry input');
  }
});
test('R4 fails closed for unknown, unverified, ignored, ambiguous and source conflicts',()=>{
  const row=makeRow('tool-one'),valid=makeCandidate('tool-one');
  const cases=[
    {verified:false,records:[valid]},
    state({...valid,status:'unknown'}),
    state({...valid,ignoredAt:123}),
    state({...valid,source:'opendesk/tool-other'}),
    state({...valid,sha256:'b'.repeat(64)}),
    state({...valid,fromVersion:'0.9.0'}),
    state(valid,{...valid,version:'1.2.0'}),
    state({...valid,status:'review_required',newCapabilities:[]}),
    state({...valid,status:'available',newCapabilities:['browser.tabs']})
  ];
  for(const snapshot of cases)
    assert.equal(projectTrustedInlineUpdates([row],snapshot)[0].inlineUpdate,null);
});
test('R4 new capabilities ask for explicit review, ordinary update remains a separate action',()=>{
  const row=makeRow('tool-one'),safe=makeCandidate('tool-one'),
    permissions=makeCandidate('tool-one','review_required');
  assert.equal(projectTrustedInlineUpdates([row],state(safe))[0].inlineUpdate.label,'更新');
  assert.equal(projectTrustedInlineUpdates([row],state(permissions))[0].inlineUpdate.label,'审阅');
  assert.equal(projectTrustedInlineUpdates([{...row,updateIdentity:null}],state(safe))[0].inlineUpdate,null);
});
test('R4 search/filter projection preserves original order when promotion disabled',()=>{
  const rows=[makeRow('tool-c'),makeRow('tool-a'),makeRow('tool-b')];
  const viewed=projectTrustedInlineUpdates(rows,state(makeCandidate('tool-b')));
  assert.deepEqual(viewed.map(row=>row.id),['tool-c','tool-a','tool-b']);
});
