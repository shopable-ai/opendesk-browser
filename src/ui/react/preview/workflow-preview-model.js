// UI_PREVIEW_ONLY. Deterministic, memory-only samples; never an execution,
// permission, installation or persistence authority. No real receipts exist here.
import {simpleCommerceReplayGoal} from '../../workflow/segment-replay.js';
import {naturalProductReply} from '../../workflow/workflow-reuse.js';
import {classifyWorkflowRunRisk} from '../../workflow/direct-execution.js';
import {emptyWorkflow} from '../../../framework/workflow/contract.js';
const clone=value=>structuredClone(value);
export const PREVIEW_SCENARIOS={
 empty:'空白欢迎',conversation:'当前方案 · 4 步',searching:'查找中',single:'单个匹配 · 直接复跑',
 multiple:'多个候选',clarify:'缺参数追问','query-failure':'查询失败',planning:'规划中',
 'planning-failure':'规划失败','run-review':'缺网站权限',approval:'必要风险确认',
 'params-error':'参数错误',stale:'目标或版本变化',waiting:'等待执行',running:'执行中',
 stopping:'停止中',success:'核验成功',unverified:'结束 · 效果未确认',failure:'执行失败',
 partial:'部分完成',unknown:'结果未知',denied:'已拒绝',unconfigured:'来源未配置',
 connecting:'连接中',disconnected:'不可用',saving:'保存中','save-failure':'保存失败',
 modified:'保存后修改',history:'历史列表','history-empty':'历史空态',mismatch:'网站不匹配',
 bundle:'多段工作流',settings:'AI 设置'
};
export const PREVIEW_OPERATIONS=[['fill','填写'],['click','点击'],['wait','等待'],
 ['extract','读取'],['assert','检查'],['navigate','打开网页'],['confirm','确认']]
 .map(([value,label])=>({value,label}));
export const PREVIEW_LOCATORS=['css','role','label','text','testId'].map(value=>({value,
 label:{css:'CSS 选择器',role:'ARIA 角色',label:'标签文字',text:'文本',testId:'Test ID'}[value]}));
function sampleSteps(kind='form'){
 if(kind==='check')return [
  {stepId:'read',op:'extract',locatorKind:'role',selector:'textbox',roleName:'姓名'},
  {stepId:'verify',op:'assert',locatorKind:'role',selector:'textbox',roleName:'姓名',text:'林小满'}];
 if(kind==='read')return [
  {stepId:'heading',op:'extract',locatorKind:'role',selector:'heading',roleName:'文章标题'},
  {stepId:'text',op:'extract',locatorKind:'css',selector:'article'},
  {stepId:'check',op:'assert',locatorKind:'css',selector:'article',text:'正文不为空'}];
 if(kind==='commerce')return [
  {stepId:'search',op:'fill',locatorKind:'role',selector:'textbox',roleName:'搜索关键词',param:'query'},
  {stepId:'go',op:'click',locatorKind:'role',selector:'button',roleName:'搜索'},
  {stepId:'product',op:'click',locatorKind:'role',selector:'link',roleName:'Camera X'},
  {stepId:'price',op:'extract',locatorKind:'css',selector:'#price'},
  {stepId:'verify',op:'assert',locatorKind:'role',selector:'heading',roleName:'Camera X',text:'Camera X'}];
 return [
  {stepId:'name',op:'fill',locatorKind:'role',selector:'textbox',roleName:'姓名',param:'name',text:''},
  {stepId:'email',op:'fill',locatorKind:'role',selector:'textbox',roleName:'联系邮箱（用于本轮报名草稿的联系信息回读核对，请核对完整邮箱内容及对应联系人）',text:'demo@example.test'},
  {stepId:'readback',op:'extract',locatorKind:'css',selector:'#registration-form'},
  {stepId:'verify',op:'assert',locatorKind:'role',selector:'textbox',roleName:'姓名',text:'林小满'}];
}
const param=(name,title,value)=>({name,rule:{type:'string',title,maxLength:120},required:true,value});
const planSignature=({steps,params})=>JSON.stringify(steps.map(step=>{
 const resolved={...step};delete resolved.stepId;
 if(step.op==='fill'){resolved.text=step.param?params.find(p=>p.name===step.param)?.value:step.text;delete resolved.param;}
 return resolved;
}));
const mutates=steps=>steps.some(step=>['fill','click','navigate'].includes(step.op));
// Use the same bounded full-goal parser for the missing-name variant. No
// placeholder enters a plan or execution; it only recovers the validated query.
const missingProductGoal=request=>{
 const withName=request.replace(/^((?:请)?(?:搜索|查找|检索))\s*/u,'$1 ')
  .replace(/((?:打开|点开|进入)\s*)(?:商品)?详情(?:页)?(?=[，,])/u,'$1 Preview Placeholder 商品详情');
 if(withName===request)return null;
 const intent=simpleCommerceReplayGoal(withName);
 return intent?.productName==='Preview Placeholder'?{query:intent.query,productName:null}:null;
};
const siteMismatchReason='网站不匹配：此版本仅属于 https://workflow.example；请先打开匹配网站。Preview 不会替你打开网站。';
export function createWorkflowPreviewSimulation(changed=()=>{}){
 let id=0,pending=null,candidates=[],reuseIntent=null,returnFeedback=null,previousPlan=null,draftEdited=false;
 const s={scene:'empty',phase:'idle',draft:'',messages:[],steps:[],params:[],round:0,revision:0,
  title:'新工作流',dirty:false,savedKey:null,history:[],historyOpen:false,manageOpen:false,
  outcome:null,notice:'',error:'',feedback:null,confirmation:null,sourceState:'ready',
  gate:null,mode:'form',rounds:[],bundled:false,expandStepId:null,saveFail:false,lastRequest:'',previousName:'',
  resultKind:'success',lookup:'auto',asking:false,fixtureSignature:'',activeRun:null,effectFence:null,siteMatches:true,pendingAutoRun:false,reviewPending:false,reviewRevision:null,reviewSignature:''};
 const add=(speaker,message)=>s.messages.push({id:'preview-'+(++id),speaker,message});
 const notify=message=>{s.notice=message;};
 const update=()=>changed(s);
 const feedback=(title,detail,actions=[],tone='info')=>{s.feedback={title,detail,tone,
  actions:actions.map(([id,label,primary=false])=>({id,label,primary}))};};
 const snapshot=()=>clone({title:s.title,steps:s.steps,params:s.params,revision:s.revision,
  round:s.round,mode:s.mode,rounds:s.rounds,bundled:s.bundled,messages:s.messages,outcome:s.outcome,error:s.error,fixtureSignature:s.fixtureSignature,effectFence:s.effectFence});
 const signature=()=>planSignature(s);
 const edited=()=>{const staleReview=s.reviewPending;s.reviewPending=false;s.revision++;s.dirty=true;s.pendingAutoRun=false;s.notice='未保存更改';if(s.siteMatches&&!s.effectFence&&!['unknown','partial','unverified'].includes(s.outcome))s.error=staleReview?'原审阅已失效：方案修订已变化，请重新运行并审阅。':'';
  feedback('当前方案已修改',`修订 ${s.revision} 尚未执行。先前结果仍归属于对话中标注的旧修订。`,[['run','运行当前方案演示',true]]);};
 function buildPlan(){
  s.steps=sampleSteps(s.mode);s.params=s.mode==='form'?[param('name','姓名','林小满')]:
   s.mode==='commerce'?[param('query','搜索关键词','camera'),param('productName','商品完整名称','Camera X')]:[];
  if(s.mode==='form'){
   const name=s.lastRequest.match(/姓名(?:改为|改成|为|是)[“「"']?([^，。\s”」"']{1,20})/)?.[1]||s.previousName||'林小满';
   s.params[0].value=name;s.steps.find(step=>step.op==='assert').text=name;
   const email=s.lastRequest.match(/[\w.+-]+@[\w.-]+\.[a-z]+/i)?.[0];
   if(email)s.steps.find(step=>step.stepId==='email').text=email;
  }
  if(s.mode==='commerce'){
   const intent=reuseIntent||simpleCommerceReplayGoal(s.lastRequest);
   if(intent){s.params.find(p=>p.name==='query').value=intent.query;
    if(intent.productName){s.params.find(p=>p.name==='productName').value=intent.productName;bindProductName(intent.productName);}}
  }
  s.bundled=false;
  s.title=s.mode==='form'?'填写并核对报名草稿':s.mode==='read'?'读取并核对文章':'搜索并核对商品';
  if(s.mode==='check')s.title='检查表单姓名（只读）';
  s.fixtureSignature=signature();
  s.revision++;s.dirty=true;
 }
 function ready(){previousPlan=null;s.phase='idle';s.scene='conversation';s.pendingAutoRun=true;feedback('步骤已准备',
  `当前方案 · 修订 ${s.revision}。下方 ${s.steps.length} 个语义步骤可展开编辑。这里暂停便于检查；正式流程在原准入允许时可直接执行。`,
  [['run','继续执行演示',true],['edit','查看与编辑步骤']]);}
 function beginPlanning(){s.phase='planning';s.scene='planning';add('AI','没有匹配，开始为本轮请求整理语义步骤。尚未执行。');feedback('正在规划', '理解目标与当前网页范围；规划进度不代表动作完成。', [['advance','返回方案演示']]);}
 // Explicit scene fixtures are real in-memory candidate records too. Ordinary
 // requests never synthesize a reusable candidate from an absent history row.
 function sceneCandidates(count){
  return Array.from({length:count},(_,index)=>{
   const steps=sampleSteps('commerce');
   if(index)steps.splice(2,0,{stepId:'legacy-wait',op:'wait',locatorKind:'css',selector:'#results',timeout:10000});
   const title=index?'旧版商品核对':'搜索并核对商品';
   const data={...snapshot(),title,steps,params:[param('query','搜索关键词','camera'),param('productName','商品完整名称','Camera X')],mode:'commerce',bundled:true,outcome:'success',revision:1};
   data.fixtureSignature=planSignature(data);
   return {key:String(index+1),title,savedText:'',data};
  });
 }
 function send(request=s.draft){
  if(!request.trim()||s.phase!=='idle'||s.sourceState!=='ready'||s.historyOpen||s.reviewPending)return false;
  if(!s.siteMatches){s.draft=request;showSiteMismatch();update();return false;}
  s.pendingAutoRun=false;
  const requestedReuse=simpleCommerceReplayGoal(request)||missingProductGoal(request);
  if(s.asking&&/^(?:我)?(?:取消|算了|不想|不要|不再)/.test(request.trim())){
   action('cancel');s.draft=request;update();return false;
  }
  if(s.asking&&/^(?:请|只读|读取|提取|检查|填写|搜索|查找|检索)/.test(request.trim())){
   s.asking=false;s.lookup='auto';reuseIntent=null;candidates=[];
  }
  if(s.asking&&!naturalProductReply(request)){
   s.draft=request;s.error='请只回复 3–120 字符的商品完整名称，或取消复用后描述新任务。';update();return false;
  }
  const readOnlyRequest=/只读|读取|提取|检查/.test(request)&&!/填写|改为|改成|修改|点击|提交|购买|搜索|打开/.test(request.replace(/不(?:提交|填写|修改|点击)/g,''));
  if(s.effectFence&&(!readOnlyRequest||requestedReuse)){s.draft=request;s.error=s.effectFence.message;feedback('仍有未核对的动作','上一轮效果尚未确认，新的消息也不会解除围栏。请先核对网页与服务器记录；可发送明确的只读检查请求。',[['inspect','查看安全的下一步'],['modify','继续修改草稿']],'warning');update();return false;}
  if(!s.asking)previousPlan=s.steps.length?clone(Object.fromEntries(['title','steps','params','revision','round','mode','dirty','savedKey','outcome','bundled','expandStepId','fixtureSignature'].map(key=>[key,s[key]]))):null;
  s.draft='';draftEdited=false;add('你',request.trim());s.notice='';s.error=s.effectFence?.message||'';s.outcome=null;
  if(s.asking){s.asking=false;s.mode='commerce';reuseIntent={query:reuseIntent?.query||'camera',productName:naturalProductReply(request)};
   if(candidates.length){useCandidate(0);add('AI','已补齐本轮样例参数；不会连接真实模型。');startRun(false,true);}
   else{s.lastRequest=`搜索 ${reuseIntent.query}，打开 ${reuseIntent.productName} 商品详情，核对名称和价格`;beginPlanning();}
   update();return true;}
  s.previousName=s.params.find(p=>p.name==='name')?.value||s.previousName;s.lastRequest=request;
  s.round++;s.mode=requestedReuse||/搜索|商品|camera|lens/i.test(request)?'commerce':/检查表单|检查页面/.test(request)?'check':/读取|文章|提取|只读(?!回)/.test(request)?'read':
   /继续|改为|改成|修改/.test(request)?s.mode:'form';
  reuseIntent=requestedReuse;
  candidates=reuseIntent?s.history.filter(row=>row.data.mode==='commerce'&&row.data.bundled&&row.data.outcome==='success'&&
   !row.data.effectFence&&planSignature(row.data)===row.data.fixtureSignature):[];
  if(s.steps.length)add('系统',`开始第 ${s.round} 轮修订；前一轮步骤和结果保留在上方，新的方案尚未执行。`);
  s.steps=[];s.params=[];s.phase='searching';s.scene='searching';
  feedback('正在查找可复用程序','先查询当前网站的保存版本与已安装 Task；查找不是执行。', [['advance','推进演示']]);update();return true;
 }
 function advance(){
  if(s.phase==='searching'){
   s.phase='idle';
   if(['single','multiple','clarify'].includes(s.lookup)&&!candidates.length)candidates=sceneCandidates(s.lookup==='multiple'?2:1);
   const lookup=s.lookup==='auto'?(reuseIntent&&!reuseIntent.productName?(candidates.length>1?'multiple':'clarify'):
    candidates.length?(candidates.length===1?'single':'multiple'):'auto'):s.lookup;
   s.lookup='auto';
   if(lookup==='error'){s.error='查询目录失败；尚未确定是否存在匹配。不会回退到 AI 重做。';feedback('查询失败',s.error,[['retry-query','重新查询演示'],['cancel','返回草稿']],'error');}
   else if(lookup==='multiple')feedback(`找到 ${candidates.length} 个候选`,'仅演示受限商品搜索复用；请明确选择，不自动猜测。',
    [...candidates.map((row,index)=>['candidate-'+row.key,`使用第 ${index+1} 个 · ${row.title}${row.savedText?' · '+row.savedText:''}`,index===0]),['cancel','取消']]);
   else if(lookup==='clarify'){s.asking=true;feedback('还缺一个参数','请在下方回复商品完整名称。'+(candidates.length?'已找到内存候选。':'没有可复用版本，补齐后将规划新方案。')+'当前没有执行网页动作。', [['cancel',candidates.length?'取消复用':'取消']]);}
   else if(lookup==='single'){useCandidate(0);add('AI','找到 1 个内存样例：'+s.title+'。权限齐备，演示直接复跑，不调用 AI。');startRun(false,true);}
   else beginPlanning();
  }else if(s.phase==='planning'){buildPlan();ready();}
  else if(s.phase==='waiting'){s.phase='running';s.scene='running';feedback('正在执行演示','模拟填写与读回正在进行，随后核对结果。这里没有真实逐步事件；不标记具体步骤已完成。', [['advance','展示结果',true],['stop','停止后续执行']]);}
  else if(s.phase==='running')finish(s.resultKind);
  else if(s.phase==='stopping')finish('partial');
  else if(s.phase==='saving'){
   s.phase='idle';
   if(s.saveFail){s.error='保存失败：内存存储模拟写入失败。步骤与结果仍保留，重试保存不会重新执行网页任务。';feedback('保存失败',s.error,[['retry-save','仅重试保存',true]],'error');notify('保存失败 · 可仅重试保存');}
   else{const version=s.history.filter(row=>row.title===s.title).length+1;
    const key='memory-version-'+(++id);s.savedKey=key;s.dirty=false;
    s.history.unshift({key,title:s.title,fullTitle:s.title,savedText:`内存样例 · v${version} · ${s.steps.length} 步`,data:snapshot()});
    notify(`已保存内存版本 v${version} · 重新打开页面后清空`);
    feedback('已保存，可再次使用','保存的是当前方案与完整对话分段；保存不等于验证、安装或计划。',
     [['history','查看保存版本',true],['run','再次运行此版本'],['handoff','了解 Task 后续入口']]);}
  }
  update();
 }
 function startRun(reviewedRisk=false,automaticReuse=false){
  if(!s.steps.length||s.phase!=='idle')return;
  previousPlan=null;
  s.pendingAutoRun=false;
  if(!s.siteMatches){showSiteMismatch();return;}
  if(['unknown','partial','unverified'].includes(s.outcome)||(s.effectFence&&mutates(s.steps))){
   feedback('先核对已有结果','先前动作的效果尚未完全确定，不能直接重放。请核对网页与服务器记录；本预览不会代为确认。',[['inspect','查看安全的下一步'],['modify','继续修改草稿']],'warning');return;
  }
  const missing=s.steps.find(step=>step.param&&!s.params.some(p=>p.name===step.param));
  if(missing){s.error=`步骤引用了不存在的参数「${missing.param}」，请修正步骤或参数定义。`;feedback('参数引用无效',s.error,[['edit','返回步骤']],'error');return;}
  const invalid=s.params.find(p=>p.required&&!String(p.value).trim()||String(p.value).length>120);
  if(invalid){s.error=`请填写「${invalid.rule.title}」，长度须为 1–120 个字符。`;feedback('参数需要修改',s.error,[['params','返回参数']],'error');return;}
  let risk;
  try{
   const workflow=emptyWorkflow('https://workflow.example','preview-model');
   workflow.steps=s.steps.map(step=>{
    const value={...step};
    if(step.op==='fill')value.text=step.param?s.params.find(p=>p.name===step.param)?.value:step.text;
    delete value.param;
    return value;
   });
   risk=classifyWorkflowRunRisk(workflow);
  }catch(error){s.error='步骤需要修改：'+error.message;feedback('步骤无效',s.error,[['edit','返回步骤']],'error');return;}
  // The exact built-in commerce fixture is the only demonstrated automatic
  // reuse path. Arbitrary edits use the production manual risk classifier.
  const fixtureReuse=automaticReuse&&candidates.some(row=>row.key===s.savedKey)&&s.mode==='commerce'&&signature()===s.fixtureSignature;
  const risky=risk.needsReview&&!fixtureReuse;
  if(s.gate==='risk'&&!risky)s.gate=null;
  if(!s.gate&&risky&&!reviewedRisk)s.gate='risk';
  if(s.gate){s.reviewPending=true;s.reviewRevision=s.revision;s.reviewSignature=signature();feedback(s.gate==='permission'?'需要网站权限':s.gate==='stale'?'原操作已失效':'执行前确认',
    s.gate==='permission'?'样例网站 https://workflow.example 尚未获得访问权限；拒绝后不会执行。':
    s.gate==='stale'?'网页或方案修订已变化；旧确认不能继续执行。请重新检查目标。':
    '此方案包含需审阅的动作：'+risk.description+'。请审阅目标与后果；动作返回不等于效果已确认。',
    s.gate==='stale'?[['recheck','重新检查目标'],['deny','返回']]:[['allow','允许本轮演示',true],['deny','拒绝'],['cancel-gate','取消']],'warning');return;}
  s.error=s.effectFence?.message||'';s.notice='';s.outcome=null;s.dirty=true;s.phase='waiting';s.scene='waiting';
  s.activeRun={...snapshot(),fixtureCompatible:signature()===s.fixtureSignature,riskDescription:risk.description};
  add('系统',`第 ${s.round||1} 轮 · 修订 ${s.revision}，准备执行 ${s.steps.length} 步（离线模拟）。`);
  feedback('等待执行','尚未发生动作。可以取消；演示推进后进入执行中。', [['advance','开始执行演示',true],['stop','执行前取消']]);
 }
 function finish(kind){
  const run=s.activeRun||{...snapshot(),fixtureCompatible:signature()===s.fixtureSignature};
  s.activeRun=null;
  if(kind==='success'&&!run.fixtureCompatible)kind='unverified';
  s.phase='idle';s.scene=kind;s.outcome=kind;
  s.dirty=true;
  const output={
   success:`已核验成功（样例）：姓名「${run.params.find(p=>p.name==='name')?.value||'林小满'}」与邮箱读回一致。未点击提交，未向服务器提交。`,
   unverified:run.riskDescription?'执行结束，效果未确认（样例）：动作已返回，但没有独立效果回执。本轮审阅动作：'+run.riskDescription+'。'+(!run.fixtureCompatible?'当前修订已超出原核验样例，不能沿用旧成功结论。':'')+'请核对网站记录，不能认定成功。':
    !run.fixtureCompatible?'执行结束，效果未确认（样例）：当前修订已超出原核验样例，无法沿用旧成功结论。对话已记录本次步骤，请检查实际效果。':
    '执行结束，效果未确认（样例）：动作已返回，但没有独立读回证据。请检查页面，不能据此认定提交成功。',
   failure:'执行失败（样例）：找不到预定目标，本轮动作尚未发生。请检查字段或更新定位后明确重试。',
   partial:`部分完成（样例）：已发生「${PREVIEW_OPERATIONS.find(item=>item.value===run.steps[0]?.op)?.label||'首个动作'} ${run.steps[0]?.roleName||run.steps[0]?.selector||''}」；其余 ${Math.max(0,run.steps.length-1)} 步与最终核验未完成。停止不会回滚已发生的操作，请先检查页面。`,
   unknown:'结果未知（样例）：动作后连接中断，缺少最终效果与服务器回执。请核对网页和网站记录；不会自动重试。'
  };
  const text=kind==='success'&&run.mode==='check'?'已核验成功（样例）：只读取姓名并核对为林小满；没有填写或提交。':
   kind==='success'&&run.mode==='read'?'已核验成功（样例）：读到了文章标题与正文，并确认正文不为空。':
   kind==='success'&&run.mode==='commerce'?`已核验成功（样例）：搜索结果中找到 ${run.steps.find(step=>step.stepId==='product')?.roleName||'Camera X'}，详情名称匹配，样例价格 ¥499。未下单。`:output[kind];
  const steps=clone(run.steps);const label=PREVIEW_OPERATIONS;
  const params=clone(run.params);
  s.rounds.push({round:run.round||1,revision:run.revision,steps,params,mode:run.mode,bundled:run.mode==='commerce',kind});
  add('执行结果',`第 ${run.round||1} 轮 · 修订 ${run.revision}\n`+steps.map((step,i)=>
   `${i+1}. ${label.find(x=>x.value===step.op)?.label||step.op} ${step.roleName||step.selector||step.text||''}`+
   (step.op==='fill'?`；填写值「${step.param?params.find(p=>p.name===step.param)?.value:step.text}」`:'')).join('\n')+'\n\n'+text);
  const unsafe=['unknown','partial','unverified'].includes(kind);
  if(unsafe&&mutates(run.steps))s.effectFence={round:run.round,revision:run.revision,kind,message:`第 ${run.round||1} 轮 · 修订 ${run.revision}：${text}`};
  s.error=s.effectFence?.message||(kind==='success'?'':text);
  feedback(kind==='success'?'本轮结果':'需要核对结果',text,unsafe?
   [['inspect','查看安全的下一步'],['modify','继续修改']]:[['modify','继续修改',true],['save','保存当前方案']],
   kind==='failure'?'error':unsafe?'warning':'success');
  if(kind==='success')notify('本轮演示完成 · 结果已显示');
  s.bundled=run.mode==='commerce';
 }
 function useCandidate(index){
  const candidate=candidates[index];
  const currentMessages=s.messages,currentRounds=s.rounds,fence=s.effectFence;
  if(candidate){const round=s.round;Object.assign(s,clone(candidate.data));s.round=round;s.savedKey=candidate.key;s.dirty=false;
   // Reuse the stored plan without discarding this conversation or old results.
   s.messages=currentMessages;s.rounds=currentRounds;s.effectFence=fence;s.outcome=null;s.error=fence?.message||'';
   for(const p of s.params)if(reuseIntent){if(p.name==='query')p.value=reuseIntent.query;if(p.name==='productName')p.value=reuseIntent.productName;}
   const product=s.steps.find(step=>step.stepId==='product');if(product&&reuseIntent)product.roleName=reuseIntent.productName;
   const verify=s.steps.find(step=>step.stepId==='verify');if(verify&&reuseIntent){verify.roleName=reuseIntent.productName;verify.text=reuseIntent.productName;}
   const rebound=signature();
   if(rebound!==candidate.data.fixtureSignature){s.revision++;s.dirty=true;s.notice='新参数已形成当前修订；原保存版本保持不变。';}
   // Candidate structure was checked before selection. Only the explicit,
   // grammar-bound query/product substitutions above create this new fixture.
   s.fixtureSignature=rebound;
  }
 }
 function save(){if(!s.steps.length||s.phase!=='idle'||!s.dirty)return;
  s.pendingAutoRun=false;if(s.siteMatches&&!s.effectFence&&!['unknown','partial','unverified'].includes(s.outcome))s.error='';s.phase='saving';feedback('正在保存','只保存当前方案和对话，不重新执行。', [['advance','完成保存演示']]);update();}
 function navigate(callback){
  if(s.phase!=='idle')return;
  if(s.dirty||s.draft.trim()){
   pending=callback;s.confirmation={identity:'preview-navigation-'+(++id),title:'保留未保存内容？',
    message:'当前方案或输入草稿尚未保存。返回可继续编辑；放弃后只切换内存样例，不执行网页动作。',confirmLabel:'放弃并继续'};update();
  }else{callback();update();}
 }
 function openHistory(key){navigate(()=>{
  const row=s.history.find(row=>row.key===key);if(!row)return;
  const fence=s.effectFence;
  Object.assign(s,clone(row.data));s.savedKey=key;s.dirty=false;s.draft='';s.historyOpen=false;s.phase='idle';
  s.asking=false;s.lookup='auto';reuseIntent=null;candidates=[];previousPlan=null;draftEdited=false;
  s.pendingAutoRun=false;s.reviewPending=false;s.reviewRevision=null;s.reviewSignature='';
  s.effectFence=fence||s.effectFence;if(s.effectFence)s.error=s.effectFence.message;
  if(!s.siteMatches)s.error=siteMismatchReason;
  else if(!s.effectFence&&!['unknown','partial','unverified'].includes(s.outcome))s.error='';
  feedback('已打开保存版本','完整对话与分段均已恢复。再次运行使用此版本；发送新消息才继续调用 AI。', [['run','再次运行此版本',true],['modify','继续修改']]);
  notify('已打开内存版本 · 尚未运行');
 });}
 function showSiteMismatch(){
  if(s.feedback?.title!=='网站不匹配')returnFeedback=clone(s.feedback);
  s.siteMatches=false;s.pendingAutoRun=false;s.error=siteMismatchReason;
  feedback('网站不匹配',siteMismatchReason,[['return-plan','返回工作流']],'warning');
 }
 function bindProductName(value){
  const product=s.steps.find(step=>step.stepId==='product'),verify=s.steps.find(step=>step.stepId==='verify');
  if(product)product.roleName=value;if(verify){verify.roleName=value;verify.text=value;}
 }
 function action(key){
  if(key==='advance')return advance();
  if(key==='run'){startRun();}
  else if(key==='edit'){s.expandStepId=s.steps[0]?.stepId;}
  else if(key==='params'){s.notice='请修改下方必填参数，再运行。';}
  else if(key==='allow'){
   if(!s.reviewPending||s.reviewRevision!==s.revision||s.reviewSignature!==signature()){s.reviewPending=false;s.error='原审阅已失效：方案修订已变化，请重新运行并审阅。';feedback('原审阅已失效',s.error,[['run','重新审阅当前方案']],'warning');}
   else{const reviewedRisk=s.gate==='risk';s.reviewPending=false;s.gate=null;startRun(reviewedRisk);}
  }
  else if(key==='recheck'){if(s.gate==='stale')s.gate=null;s.reviewPending=false;feedback('目标已重新检查（样例）','请核对当前方案后主动运行；没有自动重放。',[['run','运行当前方案演示']]);}
  else if(['deny','cancel-gate'].includes(key)){s.reviewPending=false;s.pendingAutoRun=false;s.error='本轮已拒绝或取消，未执行网页操作；原准入条件仍未满足，再次运行需要重新审阅。';feedback('操作已取消',s.error,[['modify','返回对话']]);}
  else if(key==='stop'){
   if(s.phase==='waiting'){s.phase='idle';feedback('执行前已取消','没有发生网页动作。', [['run','重新准备执行']]);notify('执行前已取消');}
   else if(s.phase==='running'){s.phase='stopping';s.scene='stopping';feedback('正在停止后续执行','已发生的操作不会回滚，等待停止状态与结果核对。', [['advance','查看停止结果']],'warning');}
  }else if(key==='cancel'){
   const phase=s.phase;s.phase='idle';s.asking=false;add('系统',phase==='planning'?'规划已停止，未执行网页动作。':'查找已取消，未执行网页动作。');
   if(previousPlan){Object.assign(s,previousPlan);previousPlan=null;s.dirty=true;}
   s.pendingAutoRun=false;
   if(!s.draft&&!draftEdited)s.draft=s.messages.findLast(row=>row.speaker==='你')?.message||'';
   s.lookup='auto';reuseIntent=null;candidates=[];
   feedback('已返回草稿','任务请求和取消前正在编辑的输入均已保留，可修改后再次发送。', [['modify','继续编辑']]);
  }else if(key==='retry-query'){s.lookup='none';s.phase='searching';feedback('正在重新查询','只重试目录查询；尚未进入 AI 规划。',[['advance','推进演示']]);}
  else if(key.startsWith('candidate-')){const index=candidates.findIndex(row=>key==='candidate-'+row.key);if(index<0)return;s.mode='commerce';
   if(reuseIntent&&!reuseIntent.productName){candidates=[candidates[index]];s.asking=true;feedback('还缺一个参数','请在下方回复商品完整名称。当前没有执行网页动作。',[['cancel','取消复用']]);}
   else{useCandidate(index);add('AI',`已明确选择第 ${index+1} 个候选：${s.title}。原语义准入通过，演示直接复跑。`);startRun(false,true);}}
  else if(key==='retry-plan'){s.phase='planning';s.error='';feedback('正在重新规划','尚未执行网页动作。',[['advance','返回方案演示']]);}
  else if(key==='restore'){s.sourceState='ready';s.error='';feedback('样例来源已恢复','仅恢复离线交互，不连接真实模型。输入草稿仍保留。',[['modify','返回输入']]);notify('离线样例已恢复');}
  else if(key==='modify'){s.notice='在底部输入修改要求；前一轮记录会保留。';}
  else if(key==='inspect')feedback('先核对，避免重复副作用','正式产品中请查看目标网页与服务器记录。此 Preview 没有真实网站可核对；可继续修改草稿，但不能把未知结果改成成功。',[['modify','继续修改草稿']],'warning');
  else if(key==='save')return save();
  else if(key==='retry-save'){s.saveFail=false;return save();}
  else if(key==='history'){s.historyOpen=true;}
  else if(key==='handoff'){returnFeedback=clone(s.feedback);s.pendingAutoRun=false;feedback('当前对象：已保存工作流版本',s.bundled?
    '完整多段 Bundle 尚无已核实的 Task 导出入口。可在工作流内复跑；不能直接安装或建立计划。':
    '正式产品：工作流编辑 → 代码与 Task 候选 → 提交候选 → 目录审阅/同源码验证 → 设为可用 → 明确安装 → 我的 → 运行或定时计划。候选不等于安装；离线预览停留在交接说明。',
    [['return-plan','返回当前工作流']]);}
  else if(key==='return-plan'){s.pendingAutoRun=false;s.feedback=returnFeedback;returnFeedback=null;notify('已返回当前工作流 · 未重新执行');}
  else if(key==='mismatch')showSiteMismatch();
  update();
 }
 function scene(name){
  if(!Object.hasOwn(PREVIEW_SCENARIOS,name))return;
  const draft=s.draft;
  Object.assign(s,{scene:name,phase:'idle',draft,messages:[],steps:[],params:[],round:1,revision:0,title:'新工作流',
   dirty:false,savedKey:null,historyOpen:false,manageOpen:false,outcome:null,notice:'',error:'',feedback:null,
   sourceState:'ready',gate:null,mode:'form',rounds:[],bundled:false,expandStepId:null,saveFail:false,resultKind:'success',lookup:'auto',asking:false,confirmation:null,activeRun:null,effectFence:null,siteMatches:true,pendingAutoRun:false,reviewPending:false,reviewRevision:null,reviewSignature:''});
  pending=null;candidates=[];reuseIntent=null;returnFeedback=null;previousPlan=null;draftEdited=false;
  s.lastRequest='';s.previousName='';
  if(['empty','settings','history-empty'].includes(name)){s.round=0;s.historyOpen=name==='history-empty';if(s.historyOpen)s.history=[];update();return;}
  if(['unconfigured','connecting','disconnected'].includes(name)){
   s.sourceState=name;s.error={unconfigured:'AI 来源尚未配置。',connecting:'正在连接，请稍候。',disconnected:'当前来源不可用。'}[name];
   feedback(s.error,'输入保留。使用下方恢复入口继续离线演示；实际设置仍通过原 AI 设置入口。',[['restore','恢复离线样例']],'warning');update();return;
  }
  add('你',['single','multiple','clarify'].includes(name)?'搜索 camera，打开 Camera X 商品详情，核对名称和价格。':'请填写姓名为林小满，读回核对，不提交。');
  if(['searching','single','multiple','clarify','query-failure','planning'].includes(name)){
   s.phase=name==='planning'?'planning':'searching';s.lookup={single:'single',multiple:'multiple',clarify:'clarify','query-failure':'error'}[name]||'auto';
   if(s.lookup!=='none')s.mode='commerce';
   feedback(s.phase==='planning'?'正在规划':'正在查找可复用程序','内存样例，不连接真实来源。',[['advance','推进演示']]);update();return;
  }
  buildPlan();
  if(name==='planning-failure'){s.steps=[];s.params=[];s.error='规划失败：模型回复格式不符合语义步骤合同（样例）。未执行。';feedback('规划失败',s.error,[['retry-plan','重试规划演示'],['modify','修改请求']],'error');}
  else if(['approval','run-review','stale'].includes(name)){s.gate={approval:'risk','run-review':'permission',stale:'stale'}[name];if(name==='approval')s.steps.push({stepId:'submit',op:'click',locatorKind:'role',selector:'button',roleName:'提交报名'});startRun();}
  else if(name==='params-error'){s.params[0].value='';startRun();}
  else if(['waiting','running','stopping'].includes(name)){startRun();if(name!=='waiting')advance();if(name==='stopping')action('stop');}
  else if(['success','unverified','failure','partial','unknown'].includes(name))finish(name);
  else if(['saving','save-failure','modified','history','bundle','mismatch'].includes(name)){
   if(name==='bundle'){s.mode='commerce';buildPlan();}
   finish('success');s.saveFail=name==='save-failure';save();
   if(name!=='saving')advance();
   if(name==='modified')edited();
   if(name==='history')s.historyOpen=true;
   if(name==='mismatch')action('mismatch');
  }else if(name==='denied'){s.gate='permission';s.error='本轮已拒绝，未执行网页动作。';feedback('已拒绝',s.error,[['modify','修改任务']],'warning');}
  else ready();
  update();
 }
 return {s,send,advance,action,save,scene,openHistory,navigate,
  confirmNavigation(){const next=pending;pending=null;s.confirmation=null;next?.();update();},
  cancelNavigation(){pending=null;s.confirmation=null;update();},
  newSession(){navigate(()=>{
   if(previousPlan)Object.assign(s,previousPlan);
   s.messages=[];s.draft='';s.round=0;s.historyOpen=false;s.pendingAutoRun=false;s.asking=false;s.lookup='auto';reuseIntent=null;candidates=[];previousPlan=null;draftEdited=false;
   s.reviewPending=false;s.reviewRevision=null;s.reviewSignature='';
   s.error=!s.siteMatches?siteMismatchReason:s.effectFence?.message||(s.sourceState==='ready'?'':s.error);
   if(s.sourceState!=='ready')feedback('来源尚未就绪','当前来源'+({unconfigured:'未配置',connecting:'连接中',disconnected:'不可用'}[s.sourceState]||'不可用')+'；恢复离线样例后可继续输入。'+(s.effectFence?s.effectFence.message:''),[['restore','恢复离线样例']],'warning');
   else feedback('已开始新对话',s.effectFence?s.effectFence.message:s.steps.length?'当前工作流与参数已保留；在下方描述新任务。尚未执行新动作。':'在下方描述新任务；尚未执行网页动作。',s.effectFence?[['inspect','查看安全的下一步']]:[],s.effectFence?'warning':'info');
   s.notice='已开始新对话 · 保留当前工作流与参数';
  });},
  setDraft(value){s.draft=value;draftEdited=true;},
  editTitle(value){if(s.phase!=='idle')return;s.title=value;edited();update();},
  newWorkflow(){if(['searching','planning'].includes(s.phase))action('cancel');navigate(()=>{
   const context={history:s.history,effectFence:s.effectFence,siteMatches:s.siteMatches,sourceState:s.sourceState,gate:s.gate==='permission'?'permission':null};
   const sourceError=s.sourceState==='ready'?'':s.error;
   scene('empty');Object.assign(s,context);s.draft='';
   s.error=!s.siteMatches?siteMismatchReason:s.effectFence?.message||sourceError;
   if(s.sourceState!=='ready')feedback('来源尚未就绪',sourceError,[['restore','恢复离线样例']],'warning');
  });},
  editStep(stepId,field,value){
   if(s.phase!=='idle')return;const index=s.steps.findIndex(row=>row.stepId===stepId);if(index<0)return;
   const step=s.steps[index];
   // Mirror the formal editor's action switch: a new operation gets only its
   // applicable defaults, rather than retaining invisible references or URLs.
   if(field==='op'){
    if(!PREVIEW_OPERATIONS.some(row=>row.value===value))return;
    const next={stepId,op:value};
    if(['fill','click','wait','extract','assert'].includes(value)){next.locatorKind='css';next.selector='#keyword';}
    if(value==='fill')next.text='';
    if(['assert','confirm'].includes(value))next.text='期望的文字';
    if(value==='navigate')next.url='https://workflow.example/';
    s.steps[index]=next;
   }else if(field==='locatorKind'){
    if(!PREVIEW_LOCATORS.some(row=>row.value===value))return;step.locatorKind=value;
   }else if(field==='param'){
    if(value){step.param=value;delete step.text;}else{delete step.param;step.text='';}
   }else if(field==='text'&&step.op==='fill'&&step.param)return;
   else if(['selector','roleName','url','text','timeout'].includes(field))step[field]=field==='timeout'?Number(value):value;
   else return;
   edited();update();
  },
  addStep(){if(s.phase!=='idle')return;s.steps.push({stepId:'added-'+(++id),op:'extract',locatorKind:'role',selector:'heading',roleName:'页面标题'});s.expandStepId=s.steps.at(-1).stepId;edited();update();},
  removeStep(stepId){if(s.phase!=='idle')return;s.steps=s.steps.filter(row=>row.stepId!==stepId);edited();update();},
  moveStep(stepId,delta){if(s.phase!=='idle')return;const from=s.steps.findIndex(row=>row.stepId===stepId),to=from+delta;if(from<0||to<0||to>=s.steps.length)return;[s.steps[from],s.steps[to]]=[s.steps[to],s.steps[from]];edited();update();},
  setParam(name,value){if(s.phase!=='idle')return;const p=s.params.find(row=>row.name===name);if(p){p.value=value;if(name==='productName'&&s.mode==='commerce')bindProductName(value);edited();update();}},
  removeParam(name){if(s.phase!=='idle')return;s.params=s.params.filter(row=>row.name!==name);edited();update();},
  addParam(name){if(s.phase!=='idle')return;if(!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(name)||s.params.some(row=>row.name===name)){s.error='参数名称须以英文字母开头且不能重复。';update();return;}s.params.push(param(name,name,''));edited();update();},
  parameterizeStep(stepId){const step=s.steps.find(row=>row.stepId===stepId);if(!step||s.phase!=='idle')return;const name='value'+(++id);s.params.push(param(name,'填写值',step.text||''));step.param=name;edited();update();}
 };
}
