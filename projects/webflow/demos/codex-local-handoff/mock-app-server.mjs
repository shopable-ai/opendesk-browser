#!/usr/bin/env node
// Simulated Codex app-server for offline tests; never invokes a model.
import { createInterface } from 'node:readline';
const rl=createInterface({input:process.stdin});
const emit=obj=>process.stdout.write(JSON.stringify(obj)+'\n');
for await (const line of rl){
 const m=JSON.parse(line);
 if(m.method==='initialize')emit({id:m.id,result:{userAgent:'mock'}});
 if(m.method==='thread/start'){
   if(m.params.cwd!=='/tmp')process.exit(11);
   emit({id:m.id,result:{thread:{id:'thread12345678'}}});
 }
 if(m.method==='turn/start'){
   if(m.params.threadId!=='thread12345678'||m.params.input?.[0]?.text!=='Test Codex MCP bridge'||m.params.sandboxPolicy?.type!=='readOnly')process.exit(12);
   emit({id:m.id,result:{turn:{id:'turn1234',status:'inProgress'}}});
   if(process.env.MOCK_APPROVAL==='1')emit({id:99,method:'item/commandExecution/requestApproval',params:{}});
   else emit({method:'turn/completed',params:{threadId:'thread12345678',turn:{id:'turn1234',status:'completed'}}});
 }
}