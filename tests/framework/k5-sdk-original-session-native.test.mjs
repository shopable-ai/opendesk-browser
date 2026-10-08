import test from 'node:test';
import assert from 'node:assert/strict';
import {bindSessionRows} from './k5-sdk-original-session-native.mjs';
test('Actual session row binding requires one original operation, run and original 15s deadline',()=>{
  const payload={requestId:'r',deadlineAt:16000};
  const operation={tag:'sdk-operation',method:'APPLOCAL_SETITEM',requestId:'r',runId:'run',resultId:'result',grantIncarnation:'grant',admittedAt:new Date(1000).toISOString(),deadlineAt:16000};
  const snapshot={data:{commandJournal:[{value:operation}],runs:[{value:{runId:'run'}}],results:[]}};
  assert.equal(bindSessionRows(snapshot,payload).operation,operation);
  assert.throws(()=>bindSessionRows({...snapshot,data:{...snapshot.data,commandJournal:[{value:operation},{value:operation}]}},payload));
  assert.throws(()=>bindSessionRows({...snapshot,data:{...snapshot.data,commandJournal:[{value:{...operation,deadlineAt:16001}}]}},payload));
});
