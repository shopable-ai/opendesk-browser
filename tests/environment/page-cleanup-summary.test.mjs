import test from 'node:test';
import assert from 'node:assert/strict';
import {describePageCleanup} from '../../src/ui/page-cleanup-summary.js';

const programId='page-program';
function receipt(revision,pendingDocuments=[],overrides={}) {
  return {programId,revision,managedCleanup:{state:'unknown',records:12,
    pendingRecords:7,pendingDocuments},...overrides};
}
const identities=summary=>summary.documents.map(({tabId,documentId})=>({tabId,documentId}));

test('returns null when no cleanup records exist',()=>{
  assert.equal(describePageCleanup(programId,null),null);
});

test('returns null when the current installation has no cleanup receipt',()=>{
  assert.equal(describePageCleanup(programId,{programId,revision:3}),null);
});

test('returns null when current and historical cleanup are fully retired',()=>{
  const retired=revision=>receipt(revision,[{tabId:1,documentId:'old'}],{
    managedCleanup:{state:'retired',records:12,pendingRecords:0}
  });
  assert.equal(describePageCleanup(programId,retired(3),[retired(1),retired(2)]),null);
});

test('includes only current and historical unknown receipts for the requested program',()=>{
  const current=receipt(3,[{tabId:3,documentId:'current'}]);
  const history=receipt(1,[{tabId:1,documentId:'history'}]);
  const foreign=receipt(2,[{tabId:2,documentId:'foreign'}],{programId:'other-program'});
  const retired=receipt(0,[],{managedCleanup:{state:'retired'}});
  const summary=describePageCleanup(programId,current,[history,foreign,retired]);
  assert.deepEqual(summary.records.map(row=>row.revision),[3,1]);
  assert.deepEqual(identities(summary),[
    {tabId:3,documentId:'current'},{tabId:1,documentId:'history'}
  ]);
});

test('excludes a foreign current receipt while retaining matching history',()=>{
  const summary=describePageCleanup(programId,
    receipt(3,[{tabId:3,documentId:'foreign'}],{programId:'other-program'}),
    [receipt(1,[{tabId:1,documentId:'history'}])]);
  assert.deepEqual(summary.records.map(row=>row.revision),[1]);
  assert.deepEqual(identities(summary),[{tabId:1,documentId:'history'}]);
});

test('deduplicates the same tab and document across current and multiple historical receipts',()=>{
  const document={tabId:1,documentId:'same-document'};
  const summary=describePageCleanup(programId,receipt(3,[document]),[
    receipt(1,[{...document}]),receipt(2,[{...document}])
  ]);
  assert.deepEqual(identities(summary),[document]);
});

test('retains different documents in the same tab',()=>{
  const current={tabId:1,documentId:'new-document'};
  const historical={tabId:1,documentId:'old-document'};
  const summary=describePageCleanup(programId,receipt(2,[current]),[receipt(1,[historical])]);
  assert.deepEqual(identities(summary),[current,historical]);
});

test('retains the same document identifier in different tabs',()=>{
  const first={tabId:1,documentId:'document'};
  const second={tabId:2,documentId:'document'};
  const summary=describePageCleanup(programId,receipt(2,[first]),[receipt(1,[second])]);
  assert.deepEqual(identities(summary),[first,second]);
});

test('preserves complete identifiers and observation state for an untitled document',()=>{
  const document={tabId:987654,documentId:'complete-document-id-for-technical-records',state:'unobservable'};
  const summary=describePageCleanup(programId,null,[receipt(1,[document])]);
  const {key,...actual}=summary.documents[0];
  assert.deepEqual(actual,document);
});

test('keeps receipt counts separate from the number of unique documents',()=>{
  const document={tabId:1,documentId:'document'};
  const summary=describePageCleanup(programId,receipt(2,[document]),[receipt(1,[document])]);
  assert.equal(summary.documents.length,1);
  assert.deepEqual(summary.records,[
    {revision:2,state:'unknown',records:12,pendingRecords:7},
    {revision:1,state:'unknown',records:12,pendingRecords:7}
  ]);
});

test('retains all pending documents when more than eight need checking',()=>{
  const documents=Array.from({length:13},(_,index)=>({tabId:index+1,documentId:`doc-${index}`}));
  const summary=describePageCleanup(programId,receipt(2,documents.slice(0,6)),[
    receipt(1,documents.slice(6))
  ]);
  assert.deepEqual(identities(summary),documents);
});

test('retains an unknown current receipt without pendingDocuments for checking',()=>{
  const current=receipt(2,[],{managedCleanup:{state:'unknown',records:12,pendingRecords:7}});
  assert.deepEqual(describePageCleanup(programId,current),{documents:[],records:[
    {revision:2,state:'unknown',records:12,pendingRecords:7}
  ]});
});

test('retains an unknown historical receipt without pendingDocuments for checking',()=>{
  const historical=receipt(1,[],{managedCleanup:{state:'unknown',records:12,pendingRecords:7}});
  assert.deepEqual(describePageCleanup(programId,null,[historical]),{documents:[],records:[
    {revision:1,state:'unknown',records:12,pendingRecords:7}
  ]});
});
