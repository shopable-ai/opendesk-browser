#!/usr/bin/env node
// Simulated Codex app-server for offline contract tests; never invokes a model.
import { createInterface } from 'node:readline';
const rl=createInterface({input:process.stdin});
const emit=obj=>process.stdout.write(JSON.stringify(obj)+'\n');
const threadId='thread12345678',turnId='turn1234';
for await (const line of rl){
  const m=JSON.parse(line);
  if(m.method==='initialize')emit({id:m.id,result:{userAgent:'mock'}});
  if(m.method==='thread/start'){
    if(m.params.cwd!=='/tmp'||m.params.sandbox!=='read-only'||m.params.approvalPolicy!=='never')process.exit(11);
    emit({id:m.id,result:{thread:{id:threadId}}});
  }
  if(m.method==='turn/start'){
    if(m.params.threadId!==threadId||m.params.input?.[0]?.text!=='Test Codex MCP bridge'||m.params.sandboxPolicy?.type!=='readOnly')process.exit(12);
    emit({id:m.id,result:{turn:{id:turnId,status:'inProgress'}}});
    if(process.env.MOCK_APPROVAL==='1'){
      emit({id:99,method:'item/commandExecution/requestApproval',params:{threadId,turnId}});
      continue;
    }
    if(process.env.MOCK_EXIT==='1'){process.exit(8);}
    if(process.env.MOCK_WAIT==='1'){continue;}
    if(process.env.MOCK_NO_ANSWER!=='1'){
      const actual='README 描述了 OpenDesk 的自动化能力。';
      emit({method:'item/agentMessage/delta',params:{threadId,turnId,itemId:'answer-1',delta:'README 描述了 '}});
      emit({method:'item/agentMessage/delta',params:{threadId,turnId,itemId:'answer-1',delta:'OpenDesk 的自动化能力。'}});
      if(process.env.MOCK_DELTA_ONLY!=='1'&&process.env.MOCK_TURN_ITEMS!=='1'){
        emit({method:'item/completed',params:{threadId,turnId,item:{id:'answer-1',type:'agentMessage',text:actual}}});
      }
    }
    const status=process.env.MOCK_FAILED==='1'?'failed':'completed';
    const items=process.env.MOCK_TURN_ITEMS==='1'?[{id:'answer-1',type:'agentMessage',text:'README 描述了 OpenDesk 的自动化能力。'}]:[];
    emit({method:'turn/completed',params:{threadId,turn:{id:turnId,status,items}}});
  }
}