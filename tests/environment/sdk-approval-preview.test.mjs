import test from 'node:test';
import assert from 'node:assert/strict';
import {sdkApprovalPreview} from '../../src/ui/sdk-approval.js';

test('ordinary Run needs no webpage SDK selection and shows no stale-document error',()=>{
  const state=sdkApprovalPreview({capabilities:[]});
  assert.equal(state.valid,false);
  assert.match(state.text,/无需网页 SDK/);
  assert.doesNotMatch(state.text,/E_DOCUMENT_STALE/);
});
test('opting into a webpage SDK service still requires an exact document',()=>{
  assert.match(sdkApprovalPreview({capabilities:['network']}).text,/E_DOCUMENT_STALE/);
  const state=sdkApprovalPreview({document:{tabId:1,frameId:0,documentId:'doc',url:'https:\/\/example.com/'},capabilities:['storage.session']});
  assert.equal(state.valid,true);
  assert.equal(JSON.parse(state.text).documentId,'doc');
});
