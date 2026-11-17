import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyWorkflow} from '../../src/framework/workflow/contract.js';
import {classifyWorkflowRunRisk} from '../../src/ui/workflow/direct-execution.js';
import {createWorkflowPreviewSimulation} from '../../src/ui/react/preview/workflow-preview-model.js';

// Only the deterministic memory model is exercised here. No browser, Host,
// Provider, actual website execution or persistence receipt is implied.
function plan(request='填写姓名并核对，不提交'){
  const model=createWorkflowPreviewSimulation();
  assert.equal(model.send(request),true);
  model.advance();model.advance();
  assert.equal(model.s.phase,'idle');
  return model;
}
function run(model){
  model.action('run');
  // Completion tests explicitly approve required review; admission tests below
  // assert the pending gate independently before taking any allow action.
  if(model.s.reviewPending){
    assert.equal(model.s.phase,'idle');assert.ok(actions(model).includes('allow'));
    model.action('allow');
  }
  assert.equal(model.s.phase,'waiting');
  model.advance();assert.equal(model.s.phase,'running');
  model.advance();assert.equal(model.s.phase,'idle');
}
const executionMessages=model=>model.s.messages.filter(row=>row.speaker==='执行结果');
const actions=model=>model.s.feedback.actions.map(row=>row.id);

test('returning from a site mismatch cannot unlock execution or clear its reason',()=>{
  const model=createWorkflowPreviewSimulation();model.scene('mismatch');
  model.action('return-plan');model.action('run');
  assert.equal(model.s.phase,'idle');
  assert.match(model.s.error,/网站不匹配/);
  model.editTitle('修改名称也不改变当前网站');model.save();model.advance();
  model.openHistory(model.s.savedKey);model.action('run');
  assert.equal(model.s.phase,'idle');assert.match(model.s.error,/网站不匹配/);
});

test('returning from Task handoff is navigation rather than a new execution intent',()=>{
  const model=createWorkflowPreviewSimulation();model.scene('history');
  const before=structuredClone({rounds:model.s.rounds,messages:model.s.messages,steps:model.s.steps});
  model.action('handoff');model.action('return-plan');
  assert.equal(model.s.pendingAutoRun,false);
  assert.notEqual(model.s.feedback?.title,'步骤已准备');
  assert.equal(model.s.phase,'idle');
  assert.deepEqual({rounds:model.s.rounds,messages:model.s.messages,steps:model.s.steps},before);
});

for(const scene of ['approval','run-review'])for(const decision of ['deny','cancel-gate'])
test(`${scene} ${decision} keeps the unmet requirement for a later run`,()=>{
  const model=createWorkflowPreviewSimulation();model.scene(scene);const requirement=model.s.gate;
  model.action(decision);assert.equal(model.s.reviewPending,false);
  assert.equal(model.s.gate,requirement);
  model.action('run');assert.equal(model.s.phase,'idle');
  assert.equal(model.s.reviewPending,true);assert.ok(actions(model).includes('allow'));
  model.action('allow');assert.equal(model.s.phase,'waiting');
});

test('editing a clarified product parameter changes both actual targets and invalidates old success',()=>{
  const model=createWorkflowPreviewSimulation();model.scene('clarify');model.advance();
  model.send('Camera X');model.advance();model.advance();assert.equal(model.s.outcome,'success');
  model.setParam('productName','Lens Y');
  assert.equal(model.s.steps.find(step=>step.stepId==='product').roleName,'Lens Y');
  assert.equal(model.s.steps.find(step=>step.stepId==='verify').text,'Lens Y');
  model.action('run');assert.equal(model.s.reviewPending,true);
  assert.equal(model.s.phase,'idle');model.action('allow');
  assert.equal(model.s.phase,'waiting');model.advance();model.advance();
  assert.equal(model.s.outcome,'unverified');
});

test('a rejected risk requirement survives saving and reopening without storing approval',()=>{
  const model=createWorkflowPreviewSimulation();model.scene('approval');model.action('deny');
  model.save();model.advance();const key=model.s.savedKey;
  model.newWorkflow();model.openHistory(key);model.action('run');
  assert.equal(model.s.phase,'idle');assert.equal(model.s.gate,'risk');
  assert.equal(model.s.reviewPending,true);assert.ok(actions(model).includes('allow'));
  model.action('allow');assert.equal(model.s.phase,'waiting');
});

test('continues an edited workflow and restores both rounds from a memory saved version',()=>{
  const model=createWorkflowPreviewSimulation(),s=model.s;
  s.draft='填写姓名并核对，不提交';
  assert.equal(model.send(),true);assert.equal(s.draft,'');
  assert.equal(s.phase,'searching');assert.equal(s.rounds.length,0);
  model.advance();assert.equal(s.phase,'planning');assert.equal(s.steps.length,0);
  model.advance();assert.equal(s.phase,'idle');
  model.editStep(s.steps[0].stepId,'roleName','参会者姓名');
  const firstRevision=s.revision,firstSteps=structuredClone(s.steps),firstParams=structuredClone(s.params);
  run(model);
  assert.equal(s.outcome,'unverified');
  assert.match(executionMessages(model)[0].message,/参会者姓名/);
  assert.equal(model.send('继续，只读提取文章标题和正文'),true);
  assert.equal(s.round,2);assert.equal(s.rounds.length,1);
  model.advance();model.advance();run(model);
  assert.deepEqual(s.rounds[0],{round:1,revision:firstRevision,steps:firstSteps,params:firstParams,mode:'form',bundled:false,kind:'unverified'});
  assert.equal(s.rounds[1].round,2);assert.equal(executionMessages(model).length,2);
  assert.equal(s.rounds[1].kind,'success');
  assert.match(executionMessages(model)[1].message,/文章标题与正文/);
  const saved=structuredClone({messages:s.messages,rounds:s.rounds,steps:s.steps,revision:s.revision});
  model.save();assert.equal(s.phase,'saving');model.advance();
  const key=s.savedKey;
  assert.equal(s.history.length,1);assert.match(key,/^memory-version-/);
  assert.match(s.history[0].savedText,/内存样例/);assert.equal(s.dirty,false);
  model.newWorkflow();assert.equal(s.messages.length,0);assert.equal(s.history.length,1);
  model.openHistory(key);
  assert.deepEqual({messages:s.messages,rounds:s.rounds,steps:s.steps,revision:s.revision},saved);
  assert.equal(s.phase,'idle');assert.match(s.notice,/尚未运行/);
});

for(const phase of ['searching','planning'])test(`canceling ${phase} preserves the request without execution`,()=>{
  const model=createWorkflowPreviewSimulation(),request='填写姓名，不提交';
  model.send(request);if(phase==='planning')model.advance();
  model.action('cancel');model.advance();
  assert.equal(model.s.phase,'idle');assert.equal(model.s.draft,request);
  assert.deepEqual(model.s.steps,[]);assert.deepEqual(model.s.rounds,[]);
  assert.deepEqual(executionMessages(model),[]);
  assert.match(model.s.messages.at(-1).message,phase==='planning'?/规划已停止/:/查找已取消/);
});

test('canceling before execution produces no completed round',()=>{
  const model=plan();model.action('run');model.action('stop');model.advance();
  assert.equal(model.s.phase,'idle');assert.equal(model.s.outcome,null);
  assert.deepEqual(model.s.rounds,[]);assert.deepEqual(executionMessages(model),[]);
  assert.match(model.s.feedback.detail,/没有发生网页动作/);
});

test('stopping a running workflow records partial effects without replay',()=>{
  const model=plan();model.action('run');model.advance();model.action('stop');
  assert.equal(model.s.phase,'stopping');assert.equal(model.s.rounds.length,0);
  model.advance();assert.equal(model.s.outcome,'partial');
  const result=structuredClone(model.s.rounds);
  assert.match(model.s.error,/不会回滚/);
  assert.deepEqual(actions(model),['inspect','modify']);
  model.advance();model.advance();model.action('inspect');
  assert.equal(model.s.phase,'idle');assert.deepEqual(model.s.rounds,result);
  assert.equal(executionMessages(model).length,1);
});

for(const outcome of ['unknown','unverified'])test(`${outcome} requires inspection and never automatically retries`,()=>{
  const model=plan();model.s.resultKind=outcome;run(model);
  assert.equal(model.s.outcome,outcome);assert.deepEqual(actions(model),['inspect','modify']);
  const rounds=structuredClone(model.s.rounds);
  model.advance();model.action('inspect');model.advance();
  assert.deepEqual(model.s.rounds,rounds);assert.equal(model.s.outcome,outcome);
  assert.equal(executionMessages(model).length,1);
  assert.match(model.s.feedback.detail,/不能把未知结果改成成功/);
});

test('retrying a failed save preserves the execution and only creates one saved version',()=>{
  const model=plan();run(model);
  const before=structuredClone({round:model.s.round,rounds:model.s.rounds,messages:model.s.messages,revision:model.s.revision});
  model.s.saveFail=true;model.save();model.advance();
  assert.equal(model.s.phase,'idle');assert.equal(model.s.dirty,true);
  assert.equal(model.s.history.length,0);assert.equal(model.s.savedKey,null);
  assert.match(model.s.error,/保存失败/);assert.deepEqual(actions(model),['retry-save']);
  model.action('retry-save');assert.equal(model.s.phase,'saving');model.advance();
  assert.equal(model.s.history.length,1);assert.equal(model.s.dirty,false);
  assert.deepEqual({round:model.s.round,rounds:model.s.rounds,messages:model.s.messages,revision:model.s.revision},before);
});

for(const navigation of ['newSession','newWorkflow'])test(`canceling ${navigation} retains a dirty plan and input draft`,()=>{
  const model=plan();model.s.draft='尚未发送的修改';
  const before=structuredClone(model.s);
  model[navigation]();assert.ok(model.s.confirmation);
  model.cancelNavigation();model.confirmNavigation();
  assert.deepEqual(model.s,before,'canceled callback must not execute later');
});

test('canceling history navigation preserves the current edited version',()=>{
  const model=plan();model.save();model.advance();const key=model.s.savedKey;
  model.editStep(model.s.steps[0].stepId,'roleName','未保存字段');model.s.draft='保留草稿';
  const before=structuredClone(model.s);
  model.openHistory(key);assert.ok(model.s.confirmation);model.cancelNavigation();
  assert.deepEqual(model.s,before);
});

test('a draft alone requires confirmation before discarding it for a new workflow',()=>{
  const model=createWorkflowPreviewSimulation();model.s.draft='未发送';
  model.newWorkflow();assert.ok(model.s.confirmation);assert.equal(model.s.draft,'未发送');
  model.confirmNavigation();assert.equal(model.s.draft,'');assert.equal(model.s.confirmation,null);
  assert.deepEqual(model.s.rounds,[]);
});

test('step edits add, reorder and remove variable length plans with stable identities',()=>{
  const model=plan('读取文章'),s=model.s;
  assert.equal(s.steps.length,3);const original=s.steps.map(row=>row.stepId);
  model.addStep();const added=s.steps.at(-1).stepId;
  assert.equal(s.steps.length,4);assert.equal(s.expandStepId,added);
  model.editStep(added,'selector','main');model.moveStep(added,-1);
  assert.deepEqual(s.steps.map(row=>row.stepId),[...original.slice(0,2),added,original[2]]);
  assert.equal(s.steps[2].selector,'main');model.removeStep(original[0]);
  assert.equal(s.steps.length,3);assert.ok(!s.steps.some(row=>row.stepId===original[0]));
  assert.equal(s.revision,5);assert.equal(s.dirty,true);
});

test('out of bounds and unknown step moves preserve order and revision',()=>{
  const model=plan(),before=structuredClone(model.s);
  model.moveStep(model.s.steps[0].stepId,-1);
  model.moveStep(model.s.steps.at(-1).stepId,1);model.moveStep('missing',1);
  assert.deepEqual(model.s,before);
});

for(const value of ['', '   ', 'x'.repeat(121)])test(`rejects required parameter value ${JSON.stringify(value.length?value.slice(0,6):'empty')} before execution`,()=>{
  const model=plan();model.setParam('name',value);model.action('run');
  assert.equal(model.s.phase,'idle');assert.match(model.s.error,/1–120/);
  assert.deepEqual(model.s.rounds,[]);assert.deepEqual(actions(model),['params']);
});

test('correcting a parameter allows execution with a 120 character value',()=>{
  const model=plan();model.setParam('name','');model.action('run');
  model.setParam('name','x'.repeat(120));model.action('run');
  assert.equal(model.s.phase,'waiting');assert.equal(model.s.error,'');
});

for(const name of ['1name','bad-name','x'.repeat(41),'name'])test(`rejects invalid or duplicate parameter name ${name}`,()=>{
  const model=plan(),before=structuredClone(model.s.params),revision=model.s.revision;
  model.addParam(name);assert.deepEqual(model.s.params,before);
  assert.equal(model.s.revision,revision);assert.match(model.s.error,/英文字母.*不能重复/);
});

test('parameterizing a literal preserves its value and links the step to the new parameter',()=>{
  const model=plan(),step=model.s.steps.find(row=>row.stepId==='email'),text=step.text;
  model.parameterizeStep(step.stepId);
  const parameter=model.s.params.find(row=>row.name===step.param);
  assert.ok(parameter);assert.equal(parameter.value,text);assert.equal(parameter.required,true);
  model.setParam(parameter.name,'changed@example.test');
  assert.equal(parameter.value,'changed@example.test');assert.equal(model.s.dirty,true);
});

test('no match enters planning without an execution round',()=>{
  const model=createWorkflowPreviewSimulation();model.send('读取文章');model.advance();
  assert.equal(model.s.phase,'planning');assert.deepEqual(model.s.rounds,[]);
  assert.match(model.s.messages.at(-1).message,/没有匹配/);
});

test('query failure does not masquerade as no match or fall back to planning',()=>{
  const model=createWorkflowPreviewSimulation();model.s.lookup='error';model.send('读取文章');model.advance();
  assert.equal(model.s.phase,'idle');assert.deepEqual(model.s.steps,[]);
  assert.match(model.s.error,/尚未确定是否存在匹配/);assert.deepEqual(actions(model),['retry-query','cancel']);
  model.advance();assert.equal(model.s.phase,'idle');assert.deepEqual(model.s.rounds,[]);
  model.action('retry-query');assert.equal(model.s.phase,'searching');
  model.advance();assert.equal(model.s.phase,'planning');assert.equal(model.s.round,1);
});

test('a single saved match directly runs without a planning turn',()=>{
  const model=createWorkflowPreviewSimulation();model.s.lookup='single';model.send('搜索商品 camera');model.advance();
  assert.equal(model.s.phase,'waiting');assert.equal(model.s.steps.length,5);
  assert.equal(model.s.messages.some(row=>/开始.*整理语义步骤/.test(row.message)),false);
  assert.match(model.s.messages.find(row=>row.speaker==='AI').message,/不调用 AI/);
  model.advance();model.advance();assert.equal(model.s.rounds.length,1);
  assert.equal(model.s.bundled,true);assert.match(executionMessages(model)[0].message,/未下单/);
});

test('multiple matches wait for explicit selection before direct reuse',()=>{
  const model=createWorkflowPreviewSimulation();model.s.lookup='multiple';model.send('搜索商品');model.advance();
  assert.equal(model.s.phase,'idle');assert.equal(model.s.steps.length,0);
  assert.deepEqual(actions(model),['candidate-1','candidate-2','cancel']);
  model.action('candidate-2');assert.equal(model.s.phase,'waiting');
  assert.equal(model.s.steps.length,6);assert.equal(model.s.round,1);
  assert.equal(model.s.steps[2].op,'wait');
});

test('supplying a missing reuse parameter runs the matched plan without a new round',()=>{
  const model=createWorkflowPreviewSimulation();model.s.lookup='clarify';model.send('搜索商品');model.advance();
  assert.equal(model.s.asking,true);assert.deepEqual(model.s.rounds,[]);
  model.send('Camera X');assert.equal(model.s.asking,false);assert.equal(model.s.round,1);
  assert.equal(model.s.phase,'waiting','clarified reuse must prepare the matched steps for execution');
  assert.ok(model.s.steps.length>0);
  assert.equal(model.s.params.find(p=>p.name==='productName').value,'Camera X');
});

test('memory saved snapshots cannot change when the current plan is edited',()=>{
  const model=plan();run(model);model.save();model.advance();
  const row=model.s.history[0],saved=structuredClone(row.data);
  model.editStep(model.s.steps[0].stepId,'roleName','新的姓名字段');model.setParam('name','新姓名');
  assert.deepEqual(row.data,saved);assert.deepEqual(createWorkflowPreviewSimulation().s.history,[]);
});

test('the empty scene begins its first request at round one',()=>{
  const model=createWorkflowPreviewSimulation();model.scene('empty');
  assert.equal(model.s.round,0);model.send('填写姓名为陈小雨，不提交');
  assert.equal(model.s.round,1);
});

test('a form continuation requesting only readback retains the form mode and previous name',()=>{
  const model=plan('填写姓名为陈小雨，不提交');run(model);
  model.send('继续，只读回核对，不提交');model.advance();model.advance();
  assert.equal(model.s.mode,'form');
  assert.equal(model.s.params.find(row=>row.name==='name').value,'陈小雨');
  assert.equal(model.s.steps.find(row=>row.op==='assert').text,'陈小雨');
});

test('a continuation changes the deterministic name and email without mutating previous results',()=>{
  const model=plan('填写姓名为陈小雨，邮箱 first@example.test，不提交');run(model);
  const previous=structuredClone(model.s.rounds[0]);
  model.send('继续，姓名改为李明，邮箱 second@example.test，只读回核对');
  model.advance();model.advance();
  assert.equal(model.s.params.find(row=>row.name==='name').value,'李明');
  assert.equal(model.s.steps.find(row=>row.stepId==='email').text,'second@example.test');
  assert.equal(model.s.steps.find(row=>row.op==='assert').text,'李明');
  run(model);assert.match(executionMessages(model).at(-1).message,/李明/);
  assert.deepEqual(model.s.rounds[0],previous);
});

for(const outcome of ['unknown','partial','unverified'])test(`${outcome} cannot be replayed through the run feedback action after editing`,()=>{
  const model=plan();model.s.resultKind=outcome;run(model);
  model.editStep(model.s.steps[0].stepId,'roleName','新的姓名字段');
  assert.ok(actions(model).includes('run'),'exercise the edit feedback path, not only a disabled toolbar');
  const before=structuredClone(model.s.rounds),messages=structuredClone(model.s.messages);
  model.action('run');model.advance();
  assert.equal(model.s.phase,'idle');assert.equal(model.s.outcome,outcome);
  assert.deepEqual(model.s.rounds,before);assert.deepEqual(model.s.messages,messages);
  assert.match(model.s.feedback.detail,/不能直接重放/);
});

test('a removed parameter referenced by a step blocks execution',()=>{
  const model=plan();model.removeParam('name');model.action('run');
  assert.equal(model.s.phase,'idle');assert.match(model.s.error,/不存在的参数「name」/);
  assert.deepEqual(model.s.rounds,[]);assert.deepEqual(actions(model),['edit']);
});

test('a submitted form cannot claim that submission was never clicked or verified',()=>{
  const model=createWorkflowPreviewSimulation();model.scene('approval');
  assert.equal(model.s.phase,'idle');assert.equal(model.s.rounds.length,0);
  model.action('allow');assert.equal(model.s.phase,'waiting');
  model.advance();model.advance();
  assert.equal(model.s.outcome,'unverified');assert.equal(model.s.rounds[0].kind,'unverified');
  const result=executionMessages(model)[0].message;
  assert.match(result,/没有独立效果回执.*提交报名/);
  assert.doesNotMatch(result,/未点击提交|未向服务器提交|已核验成功/);
  assert.deepEqual(actions(model),['inspect','modify']);
});

for(const choice of [0,1,2])test(`all saved commerce candidates retain their identity: choice ${choice+1}`,()=>{
  const model=savedCommerce();
  for(let count=0;count<2;count++){run(model);model.save();model.advance();}
  const saved=structuredClone(model.s.history);assert.equal(saved.length,3);
  model.newSession();model.send('搜索 lens，打开 Lens Y 商品详情，核对名称和价格');model.advance();
  assert.equal(model.s.feedback.title,'找到 3 个候选');
  const offered=model.s.feedback.actions.filter(row=>row.id!=='cancel');
  assert.equal(offered.length,3);
  for(const [index,row] of offered.entries()){
    assert.equal(row.id,'candidate-'+saved[index].key);
    assert.ok(row.label.includes(saved[index].savedText));
  }
  model.action(offered[choice].id);
  assert.equal(model.s.savedKey,saved[choice].key);assert.equal(model.s.phase,'waiting');
});

test('a missing product with no saved candidate plans after clarification and still reviews manual Run',()=>{
  const model=createWorkflowPreviewSimulation();
  model.send('搜索 lens，打开商品详情，核对名称和价格');model.advance();
  assert.equal(model.s.asking,true);model.send('Lens Y');
  assert.equal(model.s.phase,'planning');assert.equal(model.s.reviewPending,false);
  assert.deepEqual(model.s.steps,[]);assert.equal(model.s.activeRun,null);
  model.advance();assert.equal(model.s.steps.find(row=>row.stepId==='product').roleName,'Lens Y');
  model.action('run');assert.equal(model.s.phase,'idle');assert.equal(model.s.reviewPending,true);
});

test('switching fill to extract removes hidden references before deleting the old parameter',()=>{
  const model=plan();model.editStep('name','op','extract');model.removeParam('name');
  assert.equal(Object.hasOwn(model.s.steps[0],'param'),false);
  assert.equal(Object.hasOwn(model.s.steps[0],'text'),false);
  model.action('run');assert.equal(model.s.phase,'waiting');assert.equal(model.s.error,'');
});

test('operation changes rebuild fields using the formal editor defaults and stable step id',()=>{
  const model=plan();model.editStep('name','op','navigate');
  assert.deepEqual(model.s.steps[0],{stepId:'name',op:'navigate',url:'https://workflow.example/'});
  model.editStep('name','op','wait');
  assert.deepEqual(model.s.steps[0],{stepId:'name',op:'wait',locatorKind:'css',selector:'#keyword'});
});

for(const pending of ['clarification','candidates'])test(`new conversation clears stale ${pending} feedback while preserving the prior saved plan`,()=>{
  const model=savedCommerce();
  if(pending==='candidates'){run(model);model.save();model.advance();}
  const prior=structuredClone({steps:model.s.steps,params:model.s.params,history:model.s.history});
  model.send(pending==='clarification'?'搜索 lens，打开商品详情，核对名称和价格':'搜索 lens，打开 Lens Y 商品详情，核对名称和价格');model.advance();
  assert.equal(model.s.phase,'idle');model.newSession();if(model.s.confirmation)model.confirmNavigation();
  assert.equal(model.s.asking,false);assert.equal(model.s.reviewPending,false);
  assert.equal(model.s.feedback.title,'已开始新对话');
  assert.equal(model.s.feedback.actions.some(row=>row.id.startsWith('candidate-')),false);
  assert.doesNotMatch(model.s.feedback.detail,/回复商品完整名称/);
  assert.deepEqual(model.s.steps,prior.steps);assert.deepEqual(model.s.params,prior.params);assert.deepEqual(model.s.history,prior.history);
  model.send('只读提取文章标题和正文');model.advance();assert.equal(model.s.phase,'planning');
});

for(const source of ['unconfigured','connecting','disconnected'])test(`new conversation preserves the recovery action for ${source} source`,()=>{
  const model=createWorkflowPreviewSimulation();model.scene(source);model.newSession();
  assert.equal(model.s.sourceState,source);assert.ok(actions(model).includes('restore'));
  assert.match(model.s.feedback.title,/来源/);assert.equal(model.send('读取文章'),false);
  model.action('restore');assert.equal(model.s.sourceState,'ready');
  assert.equal(model.send('读取文章'),true);model.advance();assert.equal(model.s.phase,'planning');
});

test('a valid wait duration edited through the text field uses the numeric controller contract',()=>{
  const model=plan('读取文章标题和正文');
  model.editStep('heading','op','wait');model.editStep('heading','timeout','10000');
  assert.equal(model.s.steps[0].timeout,10000);model.action('run');
  assert.equal(model.s.phase,'waiting');model.advance();model.advance();
  assert.equal(model.s.outcome,'unverified');assert.equal(model.s.rounds[0].steps[0].timeout,10000);
});

for(const target of ['删除账户','支付订单','购买商品'])test(`review and unknown receipt describe the actual action: ${target}`,()=>{
  const model=plan();model.editStep('email','op','click');model.editStep('email','selector','button');
  model.editStep('email','roleName',target);model.action('run');
  assert.equal(model.s.reviewPending,true);assert.ok(model.s.feedback.detail.includes(target));
  assert.doesNotMatch(model.s.feedback.detail,/提交表单/);
  model.action('allow');model.advance();model.advance();
  assert.equal(model.s.outcome,'unverified');assert.ok(model.s.feedback.detail.includes(target));
  assert.doesNotMatch(model.s.feedback.detail,/提交动作已发出|提交成功|未点击提交/);
  model.action('run');assert.equal(model.s.phase,'idle');assert.ok(model.s.effectFence);
});

for(const edit of ['target','parameter','operation'])test(`an incompatible ${edit} edit cannot inherit fixture success`,()=>{
  const model=plan();
  if(edit==='target')model.editStep('name','roleName','其他字段');
  if(edit==='parameter')model.setParam('name','另一位参会者');
  if(edit==='operation'){
    model.editStep('name','op','click');model.action('run');
    assert.equal(model.s.reviewPending,true);assert.equal(model.s.phase,'idle');
    model.action('allow');assert.equal(model.s.phase,'waiting');
    model.advance();model.advance();
  }else run(model);
  assert.equal(model.s.outcome,'unverified');assert.equal(model.s.rounds[0].kind,'unverified');
  assert.match(executionMessages(model)[0].message,/超出原核验样例/);
  assert.doesNotMatch(executionMessages(model)[0].message,/已核验成功|读回一致/);
});

test('a check request contains only observations and cannot generate filling or submission',()=>{
  const model=plan('请检查表单姓名是否为林小满，不提交。');
  assert.equal(model.s.mode,'check');
  assert.deepEqual(model.s.steps.map(step=>step.op),['extract','assert']);
  assert.deepEqual(model.s.params,[]);run(model);
  assert.equal(model.s.outcome,'success');
  assert.match(executionMessages(model)[0].message,/只读取姓名.*没有填写或提交/);
});

test('execution records retain the captured steps, parameters and revision when live state changes',()=>{
  const model=plan('填写姓名为陈小雨，不提交'),s=model.s;
  const captured=structuredClone({round:s.round,revision:s.revision,steps:s.steps,params:s.params,mode:s.mode,bundled:s.mode==='commerce'});
  model.action('run');
  // The model exposes mutable view state. Alter retained references to prove
  // the active execution owns detached data, not aliases to the editor draft.
  s.steps[0].roleName='后来改动的字段';s.steps.push({stepId:'late-submit',op:'click',roleName:'提交'});
  s.params.find(p=>p.name==='name').value='后来改动的姓名';s.round=99;s.revision=99;
  model.advance();model.advance();
  assert.deepEqual(s.rounds[0],{...captured,kind:'success'});
  const result=executionMessages(model)[0].message;
  assert.match(result,/陈小雨/);assert.doesNotMatch(result,/后来改动|late-submit|第 99 轮|修订 99/);
  assert.equal(s.activeRun,null);
});

test('an in-flight result uses its captured mode rather than the current editor mode',()=>{
  const model=plan('填写姓名为陈小雨，不提交');model.action('run');
  model.s.mode='read';model.advance();model.advance();
  assert.match(executionMessages(model)[0].message,/姓名「陈小雨」/);
  assert.doesNotMatch(executionMessages(model)[0].message,/读到了文章标题与正文/);
});

test('editor mutations cannot change the plan during an active execution',()=>{
  const model=plan();model.action('run');const before=structuredClone(model.s.activeRun);
  model.editStep('name','op','click');model.moveStep('name',1);model.removeStep('name');
  model.addStep();model.setParam('name','改名');model.removeParam('name');model.parameterizeStep('email');
  assert.deepEqual(model.s.steps,before.steps);assert.deepEqual(model.s.params,before.params);
  assert.equal(model.s.revision,before.revision);assert.deepEqual(model.s.activeRun,before);
});

const commerceGoal='搜索 camera，打开 Camera X 商品详情，核对名称和价格';
function savedCommerce(){
  const model=plan(commerceGoal);run(model);assert.equal(model.s.outcome,'success');
  model.save();model.advance();return model;
}

test('a normal request in a new session reuses a saved commerce plan without planning',()=>{
  const model=savedCommerce(),s=model.s,saved=structuredClone(s.history[0]);
  assert.equal(s.lookup,'auto');model.newSession();assert.equal(s.round,0);
  assert.deepEqual(s.messages,[]);
  assert.equal(model.send('搜索 lens，打开 Lens Y 商品详情，核对名称和价格'),true);
  assert.equal(s.phase,'searching');model.advance();assert.equal(s.phase,'waiting');
  assert.equal(s.outcome,null,'a saved success is not a result for the pending replay');
  assert.equal(s.savedKey,saved.key);assert.equal(s.round,1);
  assert.equal(s.params.find(p=>p.name==='query').value,'lens');
  assert.equal(s.steps.find(step=>step.stepId==='product').roleName,'Lens Y');
  assert.equal(s.steps.find(step=>step.stepId==='verify').text,'Lens Y');
  assert.equal(s.messages.some(row=>/没有匹配|开始.*整理语义步骤/.test(row.message)),false);
  assert.match(s.messages.find(row=>row.speaker==='AI').message,/直接复跑.*不调用 AI/);
  model.advance();model.advance();assert.equal(s.outcome,'success');
  assert.match(executionMessages(model)[0].message,/Lens Y/);
  assert.deepEqual(s.history[0],saved,'binding new inputs must not rewrite the saved plan');
});

for(const request of ['搜索 camera',commerceGoal+'，然后购买'])test(`saved commerce does not silently reuse an out of grammar goal: ${request}`,()=>{
  const model=savedCommerce();model.newSession();model.send(request);model.advance();
  assert.equal(model.s.phase,'planning');assert.deepEqual(model.s.steps,[]);
  assert.deepEqual(executionMessages(model),[]);
});

test('the second candidate has a distinct ordered wait step rather than duplicating the first',()=>{
  const choose=key=>{
    const model=createWorkflowPreviewSimulation();model.s.lookup='multiple';
    model.send(commerceGoal);model.advance();model.action(key);return model;
  };
  const first=choose('candidate-1'),second=choose('candidate-2');
  assert.equal(first.s.phase,'waiting');assert.equal(second.s.phase,'waiting');
  assert.equal(first.s.steps.length,5);assert.equal(second.s.steps.length,6);
  assert.notEqual(first.s.title,second.s.title);
  assert.equal(second.s.steps[2].op,'wait');assert.equal(second.s.steps[2].selector,'#results');
  assert.deepEqual(second.s.steps.filter(step=>step.op!=='wait'),first.s.steps);
  second.advance();second.advance();assert.equal(second.s.rounds[0].steps.length,6);
});

test('saving an edited commerce plan cannot turn the old successful result into reusable evidence',()=>{
  const model=plan(commerceGoal);run(model);
  const verifiedSignature=model.s.fixtureSignature;
  model.editStep('product','selector','a.different-product');model.save();model.advance();
  assert.equal(model.s.history.length,1);
  const saved=structuredClone(model.s.history[0]);
  assert.equal(saved.data.outcome,'success','the previous result alone must not qualify an edited plan');
  assert.equal(saved.data.fixtureSignature,verifiedSignature,'saving must retain the verified sample identity');
  assert.equal(saved.data.steps.find(step=>step.stepId==='product').selector,'a.different-product');
  model.newSession();assert.equal(model.send(commerceGoal),true);model.advance();
  assert.equal(model.s.phase,'planning','an edited saved plan must not enter direct execution');
  assert.equal(model.s.activeRun,null);assert.deepEqual(executionMessages(model),[]);
  assert.deepEqual(model.s.history[0],saved);
});

test('an unknown effect fence survives read-only success, new workflow and opening a successful saved plan',()=>{
  const model=savedCommerce(),key=model.s.savedKey;
  model.newWorkflow();assert.equal(model.send('填写姓名为陈小雨，不提交'),true);
  model.advance();model.advance();model.s.resultKind='unknown';run(model);
  const fence=structuredClone(model.s.effectFence);
  assert.equal(fence.kind,'unknown');
  const mutating='填写姓名为李明，不提交';
  assert.equal(model.send(mutating),false);assert.equal(model.s.draft,mutating);
  assert.equal(model.send('只读提取文章标题和正文'),true);
  model.advance();model.advance();model.s.resultKind='success';run(model);
  assert.equal(model.s.outcome,'success');assert.deepEqual(model.s.effectFence,fence);
  const rounds=structuredClone(model.s.rounds);
  assert.equal(model.send(mutating),false);assert.deepEqual(model.s.rounds,rounds);
  model.newWorkflow();assert.ok(model.s.confirmation);model.confirmNavigation();
  assert.deepEqual(model.s.effectFence,fence);assert.deepEqual(model.s.steps,[]);
  model.openHistory(key);assert.equal(model.s.savedKey,key);assert.equal(model.s.outcome,'success');
  assert.deepEqual(model.s.effectFence,fence,'opening a clean saved version cannot discard the current fence');
  const restoredRounds=structuredClone(model.s.rounds);
  model.action('run');model.advance();
  assert.equal(model.s.phase,'idle');assert.equal(model.s.activeRun,null);
  assert.deepEqual(model.s.rounds,restoredRounds);assert.equal(model.send(commerceGoal),false);
  assert.deepEqual(model.s.effectFence,fence);
});

test('a clarified product name binds both navigation and verification to the reply',()=>{
  const model=createWorkflowPreviewSimulation();model.s.lookup='clarify';
  model.send('搜索商品');model.advance();assert.equal(model.s.asking,true);
  assert.equal(model.send('Lens Y'),true);assert.equal(model.s.phase,'waiting');
  assert.equal(model.s.round,1);assert.equal(model.s.params.find(p=>p.name==='productName').value,'Lens Y');
  assert.equal(model.s.params.find(p=>p.name==='query').value,'camera');
  assert.equal(model.s.steps.find(step=>step.stepId==='product').roleName,'Lens Y');
  const verify=model.s.steps.find(step=>step.stepId==='verify');
  assert.equal(verify.roleName,'Lens Y');assert.equal(verify.text,'Lens Y');
  model.advance();model.advance();assert.equal(model.s.outcome,'success');
  assert.match(executionMessages(model)[0].message,/找到 Lens Y/);
  assert.doesNotMatch(executionMessages(model)[0].message,/Camera X/);
});

test('rebinding saved commerce inputs creates a dirty revision without changing the original history',()=>{
  const model=savedCommerce(),saved=structuredClone(model.s.history[0]);model.newSession();
  model.send('搜索 lens，打开 Lens Y 商品详情，核对名称和价格');model.advance();
  assert.equal(model.s.phase,'waiting');assert.equal(model.s.revision,saved.data.revision+1);
  assert.equal(model.s.dirty,true);assert.equal(model.s.savedKey,saved.key);
  assert.equal(model.s.activeRun.revision,model.s.revision);
  assert.equal(model.s.params.find(p=>p.name==='query').value,'lens');
  assert.equal(model.s.steps.find(step=>step.stepId==='product').roleName,'Lens Y');
  assert.deepEqual(model.s.history,[saved]);
  model.advance();model.advance();assert.equal(model.s.outcome,'success');
  model.save();model.advance();assert.equal(model.s.history.length,2);
  assert.notEqual(model.s.savedKey,saved.key);assert.deepEqual(model.s.history[1],saved);
  assert.equal(model.s.history[0].data.revision,saved.data.revision+1);
});

test('commerce replay synonyms cannot bypass an unknown effect fence as a read-only request',()=>{
  const model=createWorkflowPreviewSimulation();model.scene('bundle');
  assert.equal(model.s.history.length,1);assert.equal(model.s.history[0].data.outcome,'success');
  assert.equal(model.s.history[0].data.effectFence,null);
  model.s.resultKind='unknown';run(model);
  const fence=structuredClone(model.s.effectFence),history=structuredClone(model.s.history);
  const rounds=structuredClone(model.s.rounds),messages=structuredClone(model.s.messages),round=model.s.round;
  assert.equal(fence.kind,'unknown');
  // This is the formal commerce grammar using 查找 / 进入 / 检查. The word
  // 检查 must not make its navigation and search actions read-only.
  const request='查找 camera，进入 Camera X 商品详情，检查名称和价格';
  assert.equal(model.send(request),false);
  assert.equal(model.s.draft,request);assert.equal(model.s.phase,'idle');
  model.advance();
  assert.equal(model.s.phase,'idle');assert.equal(model.s.activeRun,null);
  assert.equal(model.s.round,round);assert.equal(model.s.outcome,'unknown');
  assert.deepEqual(model.s.effectFence,fence);assert.deepEqual(model.s.history,history);
  assert.deepEqual(model.s.rounds,rounds);assert.deepEqual(model.s.messages,messages);
});

test('a new workflow cannot clear the site mismatch when reopening the original saved version',()=>{
  const model=createWorkflowPreviewSimulation();model.scene('mismatch');
  const key=model.s.savedKey,reason=model.s.error;
  assert.ok(key);assert.match(reason,/网站不匹配/);
  model.newWorkflow();if(model.s.confirmation)model.confirmNavigation();
  assert.equal(model.s.siteMatches,false,'creating a workflow must retain the current site mismatch');
  model.openHistory(key);assert.equal(model.s.savedKey,key);
  assert.equal(model.s.siteMatches,false,'opening history must not replace the current site context');
  const rounds=structuredClone(model.s.rounds),results=structuredClone(executionMessages(model));
  model.action('run');
  assert.equal(model.s.phase,'idle');assert.equal(model.s.error,reason);
  assert.equal(model.s.siteMatches,false);assert.equal(model.s.activeRun,null);
  assert.deepEqual(model.s.rounds,rounds);assert.deepEqual(executionMessages(model),results);
});

for(const phase of ['searching','planning','waiting','running','stopping','saving'])
test(`adding a parameter during ${phase} preserves the parameters and revision`,()=>{
  const model=plan();
  if(['searching','planning'].includes(phase)){
    model.send('只读提取文章标题和正文');if(phase==='planning')model.advance();
  }else if(phase==='saving')model.save();
  else{
    model.action('run');
    if(phase!=='waiting')model.advance();
    if(phase==='stopping')model.action('stop');
  }
  assert.equal(model.s.phase,phase);
  const before=structuredClone({params:model.s.params,revision:model.s.revision});
  model.addParam('extraParameter');
  assert.deepEqual({params:model.s.params,revision:model.s.revision},before);
  assert.equal(model.s.phase,phase);
});

for(const phase of ['searching','planning'])
test(`canceling a replacement request during ${phase} restores the edited plan and original round`,()=>{
  const model=plan();run(model);
  model.editStep('email','text','edited@example.test');model.setParam('name','保留姓名');
  const before=structuredClone({steps:model.s.steps,params:model.s.params,
    revision:model.s.revision,round:model.s.round,rounds:model.s.rounds});
  const request='只读提取文章标题和正文';
  assert.equal(model.send(request),true);if(phase==='planning')model.advance();
  assert.equal(model.s.phase,phase);model.action('cancel');model.advance();
  assert.equal(model.s.phase,'idle');assert.equal(model.s.draft,request);
  assert.deepEqual({steps:model.s.steps,params:model.s.params,
    revision:model.s.revision,round:model.s.round,rounds:model.s.rounds},before);
});

test('rerunning a successfully saved plan clears its pending outcome but retains previous result messages',()=>{
  const model=savedCommerce(),results=structuredClone(executionMessages(model));
  assert.equal(model.s.outcome,'success');assert.equal(results.length,1);
  model.action('run');assert.equal(model.s.reviewPending,true);
  assert.equal(model.s.phase,'idle');assert.equal(model.s.activeRun,null);
  assert.deepEqual(executionMessages(model),results);
  model.action('allow');assert.equal(model.s.phase,'waiting');
  assert.equal(model.s.outcome,null);
  assert.deepEqual(executionMessages(model),results);
});

test('a completed rerun can be saved as a new version and reopened with all results',()=>{
  const model=savedCommerce(),original=structuredClone(model.s.history[0]);
  run(model);assert.equal(model.s.outcome,'success');assert.equal(model.s.dirty,true);
  assert.equal(model.s.rounds.length,2);assert.equal(executionMessages(model).length,2);
  const results=structuredClone({rounds:model.s.rounds,messages:model.s.messages});
  model.save();assert.equal(model.s.phase,'saving');model.advance();
  const key=model.s.savedKey;
  assert.notEqual(key,original.key);assert.equal(model.s.history.length,2);
  assert.deepEqual(model.s.history[1],original);assert.equal(model.s.dirty,false);
  model.newWorkflow();assert.deepEqual(model.s.messages,[]);
  model.openHistory(key);assert.equal(model.s.savedKey,key);
  assert.deepEqual({rounds:model.s.rounds,messages:model.s.messages},results);
});

test('starting a new session from history closes the list and allows sending while retaining steps',()=>{
  const model=savedCommerce(),steps=structuredClone(model.s.steps);
  model.action('history');assert.equal(model.s.historyOpen,true);
  model.newSession();if(model.s.confirmation)model.confirmNavigation();
  assert.equal(model.s.historyOpen,false);assert.deepEqual(model.s.steps,steps);
  assert.equal(model.s.round,0);assert.deepEqual(model.s.messages,[]);
  assert.equal(model.send('只读提取文章标题和正文'),true);
  assert.equal(model.s.phase,'searching');
});

test('a late allow after editing a step cannot execute an expired review',()=>{
  const model=createWorkflowPreviewSimulation();model.scene('approval');
  assert.equal(model.s.reviewPending,true);
  const reviewedRevision=model.s.revision;
  model.editStep('name','roleName','修改后的姓名字段');
  assert.equal(model.s.revision,reviewedRevision+1);
  const rounds=structuredClone(model.s.rounds),results=structuredClone(executionMessages(model));
  model.action('allow');model.advance();
  assert.equal(model.s.phase,'idle');assert.equal(model.s.activeRun,null);
  assert.equal(model.s.gate,'risk');assert.match(model.s.error,/原审阅已失效/);
  assert.deepEqual(model.s.rounds,rounds);assert.deepEqual(executionMessages(model),results);
});


// Revision audit regressions: exercise public model transitions, not synthetic
// success receipts. Formal risk classification remains the admission oracle.
test('a first Lens request plans its own query, product target and verification',()=>{
  const model=plan('搜索 lens，打开 Lens Y 商品详情，核对名称和价格');
  assert.equal(model.s.mode,'commerce');
  assert.equal(model.s.params.find(p=>p.name==='query')?.value,'lens');
  assert.equal(model.s.params.find(p=>p.name==='productName')?.value,'Lens Y');
  assert.equal(model.s.steps.find(step=>step.stepId==='search')?.param,'query');
  assert.equal(model.s.steps.find(step=>step.stepId==='product')?.roleName,'Lens Y');
  const verify=model.s.steps.find(step=>step.stepId==='verify');
  assert.equal(verify?.roleName,'Lens Y');assert.equal(verify?.text,'Lens Y');
  assert.ok(model.s.steps.some(step=>step.op==='extract'&&step.selector==='#price'));
  assert.deepEqual(model.s.rounds,[]);assert.equal(model.s.activeRun,null);
});

for(const phase of ['searching','planning'])
test(`canceling ${phase} retains a newer unsent draft instead of the sent request`,()=>{
  const model=plan('读取文章'),original=structuredClone(model.s.steps);
  assert.equal(model.send('只读提取文章标题和正文'),true);
  if(phase==='planning')model.advance();
  assert.equal(model.s.phase,phase);
  model.setDraft('草稿 B：只读取文章摘要，不发送');
  model.action('cancel');model.advance();
  assert.equal(model.s.draft,'草稿 B：只读取文章摘要，不发送');
  assert.equal(model.s.phase,'idle');assert.deepEqual(model.s.steps,original);
  assert.deepEqual(executionMessages(model),[]);
});

test('the clarify scene applies to one turn and a new conversation plans an article normally',()=>{
  const model=createWorkflowPreviewSimulation();model.scene('clarify');model.advance();
  assert.equal(model.s.asking,true);assert.equal(model.send('Lens Y'),true);
  model.advance();model.advance();model.save();model.advance();model.newSession();
  assert.equal(model.s.round,0);
  assert.equal(model.send('只读提取文章标题和正文'),true);model.advance();
  assert.equal(model.s.phase,'planning');assert.equal(model.s.asking,false);
  model.advance();assert.equal(model.s.mode,'read');
  assert.deepEqual(model.s.steps.map(step=>step.op),['extract','extract','assert']);
});

test('a complete new task during clarification is planned rather than bound as a product name',()=>{
  const model=createWorkflowPreviewSimulation();model.scene('clarify');model.advance();
  const request='只读提取文章标题和正文';assert.equal(model.send(request),true);
  assert.equal(model.s.asking,false);assert.equal(model.s.phase,'searching');
  model.advance();assert.equal(model.s.phase,'planning');model.advance();
  assert.equal(model.s.mode,'read');assert.deepEqual(model.s.params,[]);
  assert.equal(model.s.steps.some(step=>step.roleName===request||step.text===request),false);
  assert.deepEqual(executionMessages(model),[]);
});

function askForSavedProduct(){
  const model=savedCommerce();model.newSession();
  assert.equal(model.send('搜索 lens，打开商品详情，核对名称和价格'),true);model.advance();
  assert.equal(model.s.asking,true);assert.equal(model.s.phase,'idle');
  assert.equal(model.s.activeRun,null);return model;
}

test('a natural request missing a product asks before reusing a saved bundle',()=>{
  const model=askForSavedProduct();
  assert.deepEqual(executionMessages(model),[]);assert.deepEqual(actions(model),['cancel']);
});

test('an explicit product reply resumes the pending bundle without adding a new round',()=>{
  const model=askForSavedProduct(),round=model.s.round;
  assert.equal(model.send('Lens Y'),true);assert.equal(model.s.phase,'waiting');
  assert.equal(model.s.asking,false);assert.equal(model.s.round,round);
  assert.equal(model.s.params.find(p=>p.name==='productName')?.value,'Lens Y');
  assert.equal(model.s.steps.find(step=>step.stepId==='product')?.roleName,'Lens Y');
  assert.equal(model.s.steps.find(step=>step.stepId==='verify')?.text,'Lens Y');
});

test('a cancellation reply exits a pending bundle without navigating to a product named cancel',()=>{
  const model=askForSavedProduct();model.send('取消');
  assert.equal(model.s.asking,false);assert.equal(model.s.phase,'idle');
  model.advance();assert.equal(model.s.activeRun,null);
  assert.deepEqual(executionMessages(model),[]);
  assert.equal(model.s.steps.some(step=>step.roleName==='取消'),false);
});

test('a new article task replaces a pending saved bundle clarification',()=>{
  const model=askForSavedProduct();
  assert.equal(model.send('只读提取文章标题和正文'),true);
  assert.equal(model.s.phase,'searching');assert.equal(model.s.asking,false);
  model.advance();assert.equal(model.s.phase,'planning');model.advance();
  assert.equal(model.s.mode,'read');assert.deepEqual(model.s.params,[]);
  assert.deepEqual(executionMessages(model),[]);
});

for(const stage of ['planned','executed'])
test(`an article ${stage} after a bundle has no current bundle identity`,()=>{
  const model=savedCommerce(),saved=structuredClone(model.s.history[0]);
  assert.equal(model.send('只读提取文章标题和正文'),true);model.advance();model.advance();
  assert.equal(model.s.mode,'read');if(stage==='executed')run(model);
  assert.equal(model.s.bundled,false);
  assert.deepEqual(model.s.history[0],saved,'historical commerce stays a bundle');
  assert.equal(model.s.steps.some(step=>step.stepId==='product'),false);
  if(stage==='executed'){
    assert.match(executionMessages(model).at(-1).message,/文章标题与正文/);
    assert.equal(model.s.rounds.at(-1).mode,'read');
    assert.equal(model.s.rounds.at(-1).bundled,false);
    assert.equal(model.s.rounds[0].mode,'commerce');assert.equal(model.s.rounds[0].bundled,true);
  }
});

test('saving later email edits retains the executed parameter values after reopening',()=>{
  const model=plan(),s=model.s;
  model.parameterizeStep('email');const emailParam=s.steps.find(step=>step.stepId==='email').param;
  model.setParam(emailParam,'executed@example.test');
  const executed=structuredClone(s.params);run(model);
  model.setParam(emailParam,'edited-after-run@example.test');
  model.save();model.advance();const key=s.savedKey;
  model.newWorkflow();model.openHistory(key);
  assert.deepEqual(s.rounds[0].params,executed);
  assert.equal(s.params.find(p=>p.name===emailParam)?.value,'edited-after-run@example.test');
  model.setParam(emailParam,'third@example.test');
  assert.deepEqual(s.rounds[0].params,executed,'execution params must not alias editor params');
  assert.deepEqual(s.history[0].data.rounds[0].params,executed);
});

const manualAdmissionCases=[
  ['English Submit click',{op:'click',locatorKind:'role',selector:'button',roleName:'Submit'},true],
  ['same-origin navigation',{op:'navigate',url:'https://workflow.example/next'},true],
  ['password fill',{op:'fill',locatorKind:'css',selector:'#password',text:'example'},true],
  ['ordinary name fill',{op:'fill',locatorKind:'role',selector:'textbox',roleName:'姓名',text:'林小满'},false]
];
for(const [label,step,needsReview] of manualAdmissionCases)
test(`manual ${label} follows formal admission before execution`,()=>{
  const model=plan('读取文章');
  for(const row of [...model.s.steps])model.removeStep(row.stepId);
  model.addStep();const stepId=model.s.steps[0].stepId;
  for(const [field,value] of Object.entries(step))model.editStep(stepId,field,value);
  // Construct the same valid workflow used by the production classifier.
  const workflow=emptyWorkflow('https://workflow.example','12345678-1234-1234-1234-123456789abc');
  workflow.steps=[{stepId,...step}];
  assert.equal(classifyWorkflowRunRisk(workflow).needsReview,needsReview);
  model.action('run');
  assert.equal(model.s.reviewPending,needsReview);
  assert.equal(model.s.phase,needsReview?'idle':'waiting');
  assert.equal(model.s.activeRun===null,needsReview);
  assert.deepEqual(model.s.rounds,[]);
});


for(const phase of ['searching','planning'])
test(`canceling ${phase} does not restore the request after the newer draft was cleared`,()=>{
  const model=createWorkflowPreviewSimulation();model.send('只读提取文章标题和正文');
  if(phase==='planning')model.advance();assert.equal(model.s.phase,phase);
  model.setDraft('草稿 B');model.setDraft('');model.action('cancel');model.advance();
  assert.equal(model.s.draft,'');assert.equal(model.s.phase,'idle');
  assert.deepEqual(executionMessages(model),[]);
});


for(const source of ['newly planned','saved and reopened'])
test(`manual Run of an unchanged ${source} commerce fixture requires review`,()=>{
  const model=source==='newly planned'?plan(commerceGoal):savedCommerce();
  if(source==='saved and reopened'){
    const key=model.s.savedKey;model.newWorkflow();model.openHistory(key);
  }
  const before=structuredClone({rounds:model.s.rounds,messages:executionMessages(model)});
  model.action('run');
  assert.equal(model.s.reviewPending,true);assert.equal(model.s.phase,'idle');
  assert.equal(model.s.activeRun,null);assert.ok(actions(model).includes('allow'));
  model.advance();
  assert.deepEqual({rounds:model.s.rounds,messages:executionMessages(model)},before);
  model.action('allow');
  assert.equal(model.s.reviewPending,false);assert.equal(model.s.phase,'waiting');
});

test('canceling manual commerce review cannot turn a later Run into automatic reuse',()=>{
  const model=plan(commerceGoal);model.action('run');
  assert.equal(model.s.reviewPending,true);model.action('cancel-gate');
  assert.equal(model.s.reviewPending,false);assert.equal(model.s.activeRun,null);
  model.action('run');
  assert.equal(model.s.reviewPending,true);assert.equal(model.s.phase,'idle');
  assert.equal(model.s.activeRun,null);assert.deepEqual(model.s.rounds,[]);
});
