import {readFile,writeFile} from 'node:fs/promises';
import {decodeValue} from '../../../../src/platform/page-port/codec.js';
const dir=new URL('./',import.meta.url);
const read=async name=>JSON.parse(await readFile(new URL(name+'.json',dir),'utf8'));
const database=async name=>(await read(name)).result['opendesk-browser'];
const db=await database('final-native-db');
const controllers=db.results.filter(r=>r.tag==='controller-result').map(result=>{
  const run=db.runs.find(r=>r.runId===result.runId);
  const operations=db.commandJournal.filter(r=>r.runId===result.runId && r.tag==='controller-operation');
  return {runId:result.runId,resultId:result.resultId,state:result.state,revision:result.revision,
    sourceKind:result.sourceKind,retirementState:run.retirementState,workerRetired:run.workerRetired,
    value:result.outcome?.valueWire?decodeValue(result.outcome.valueWire):undefined,
    error:result.outcome?.error,operationCount:operations.length,
    nativeReceiptCount:operations.reduce((n,r)=>n+(r.nativeReceipts?.length??0),0)};
});
const sdk=db.results.filter(r=>r.tag==='sdk-result').map(result=>{
  const run=db.runs.find(r=>r.runId===result.runId);
  const op=db.commandJournal.find(r=>r.opId===result.opId);
  return {runId:result.runId,resultId:result.resultId,requestId:result.requestId,opId:result.opId,
    state:result.state,runState:run.state,operationState:op.state,method:op.method,
    grantIncarnation:result.grantIncarnation,requestDigest:result.requestDigest,
    nativeReceipt:op.nativeReceiptWire?decodeValue(op.nativeReceiptWire):undefined,
    httpError:result.httpErrorWire?decodeValue(result.httpErrorWire):undefined};
});
const cross=await database('cross-final-db');
const crossResults=cross.results.filter(r=>r.tag==='sdk-result').map(r=>({runId:r.runId,resultId:r.resultId,
  requestId:r.requestId,grantIncarnation:r.grantIncarnation,state:r.state,value:decodeValue(r.valueWire)}));
await writeFile(new URL('native-summary.json',dir),JSON.stringify({
  derivedFrom:['final-native-db.json','cross-final-db.json'],
  testedCodeCommit:'c44d441d17de2c3b64fa9fec32dae86323a8203c',binding:'Final pre-integration production/development receipt sourceInputs, plus example hashes',
  controllers,sdk,crossResults,
  unknownRuns:db.runs.filter(r=>r.runId && !['completed','failed','stopped'].includes(r.state)).map(r=>({runId:r.runId,state:r.state,terminalReason:r.terminalReason})),
  grants:cross.commandJournal.filter(r=>r.tag==='sdk-grant')
},null,2)+'\n');
console.log(JSON.stringify({controllers:controllers.length,sdk:sdk.length,crossResults:crossResults.length}));
