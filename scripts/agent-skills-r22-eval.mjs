#!/usr/bin/env node
/**
 * OpenDesk Browser Agent Skills R2.2 — read-only Codex evaluation harness.
 * This file is a repository-side tool: it does not intentionally change project files,
 * install software or upload saved traces. Codex inference uses its configured provider.
 * Raw traces stay under $HOME with restrictive file permissions.
 * Only run with an already-authenticated local Codex CLI.
 *
 * Usage:
 *   node opendesk-agent-skills-r22-eval.mjs --repo /Users/shopme/Documents/workspace/opendesk-browser --mode all
 *   node opendesk-agent-skills-r22-eval.mjs --repo ... --mode core --max-tests 2
 *   node opendesk-agent-skills-r22-eval.mjs --self-test
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const SKILLS = [
  'opendesk-extension-ui',
  'opendesk-extension-runtime',
  'opendesk-sidebar-tool-dev',
  'opendesk-sidebar-tool-package',
  'opendesk-trusted-sidebar-feature',
  'opendesk-script-authoring',
  'opendesk-program-publish'
];

const CORE = [
  ['在扩展里开发一个小应用','opendesk-sidebar-tool-dev'],
  ['编译 Cookie Editor 并生成可导入 JSON','opendesk-sidebar-tool-package'],
  ['为网页安装一个增强脚本','opendesk-program-publish'],
  ['修改扩展列表和安装管理界面','opendesk-extension-ui'],
  ['开发一个需要后台能力的扩展功能','opendesk-extension-runtime'],
  ['在我的任务中创建自动化任务','opendesk-script-authoring'],
  ['开发并发布 React/Vue 网页程序','opendesk-program-publish']
];
const AMBIGUOUS = [
  ['修复 Cookie Editor 的可信后台权限','opendesk-trusted-sidebar-feature'],
  ['只修改 Cookie Editor 沙箱应用 UI','opendesk-sidebar-tool-dev'],
  ['给网页增加 React 悬浮组件','opendesk-script-authoring'],
  ['修改 Page Program 的安装和撤权','opendesk-extension-runtime'],
  ['修改「我的」定时计划页面','opendesk-extension-ui'],
  ['修复 MV3 Service Worker 生命周期','opendesk-extension-runtime'],
  ['导入已有 Sidebar Tool JSON','opendesk-sidebar-tool-package'],
  ['更新已经发布的 Page Program','opendesk-program-publish']
];
const NEGATIVE = [
  '请解释 JavaScript Promise.all 的基本行为，不涉及此项目。',
  '只检查仓库根目录 README.md 中的拼写和标点。',
  '解释一般 Node.js 单元测试的断言机制，不进行功能开发。',
  '对比 JSON 和 YAML 的语法区别，不分析浏览器产品。',
  '只读分析 package.json 中许可证声明的格式是否规范。',
  '解释 Git 的 rebase 与 merge 的区别，不修改仓库。'
];
const CONTEXT = [
  ['扩展中心统一列表的安装管理入口混合了筛选和详情。请只读找出负责列表与交互的真实代码，不要调整安装器权限实现。','opendesk-extension-ui'],
  ['现有可安装侧栏应用 iframe 内的表单交互需要优化，同时需要调用已经提供的后台 SDK。只读指出应用自身代码及 SDK 责任边界。','opendesk-sidebar-tool-dev'],
  ['先为当前网页写一个 React JSX 浮层原型并预览，不进行签名、安装或发布。只读检查相关源码和测试入口。','opendesk-script-authoring']
];
const REAL = [
  ['只读检查扩展中心现有统一列表的真实 UI 文件；说明修改筛选交互时应触及哪些文件，并给出定向测试。','opendesk-extension-ui'],
  ['只读检查 examples/sidebar-tools 下某个已存在应用；说明其 iframe UI、OpenDeskTool.request 和 Host 的职责，不要改文件。','opendesk-sidebar-tool-dev'],
  ['只读检查 Page Program 的版本冻结、安装与发布流程；定位现有代码路径，避免改写底层 Authority。','opendesk-program-publish'],
  ['只读检查 Cookie Editor 的 JSON 打包器、项目目录预生成包和防过期测试；不要运行 Chrome 或线上市场发布。','opendesk-sidebar-tool-package']
];

const opt = (key, fallback) => {
  const i = process.argv.indexOf(key);
  return i >= 0 && i+1 < process.argv.length ? process.argv[i+1] : fallback;
};
const run = (command,args,cwd,timeout=30000) => spawnSync(command,args,{cwd,encoding:'utf8',timeout,maxBuffer:32*1024*1024,shell:false});
const quoted = value => JSON.stringify(value);
const uniq = xs => [...new Set(xs)];

function casesFor(mode){
  const cases=[];
  const push=(group,kind,prompt,expected,iteration=1)=>cases.push({id:`${group}-${String(cases.length+1).padStart(2,'0')}`,group,kind,prompt,expected:expected||null,iteration});
  if(mode==='all'||mode==='core') for(let repeat=1;repeat<=2;repeat++) for(const [p,s] of CORE)push('core','implicit',p,s,repeat);
  if(mode==='all'||mode==='ambiguous')for(const [p,s] of AMBIGUOUS)push('ambiguous','implicit',p,s);
  if(mode==='all'||mode==='explicit')for(const skill of SKILLS)push('explicit','explicit',`请使用 $${skill} Skill，只读检查其源码入口和工作流程，不要修改任何文件。`,skill);
  if(mode==='all'||mode==='negative')for(const p of NEGATIVE)push('negative','negative',p,null);
  if(mode==='all'||mode==='context')for(const [p,s] of CONTEXT)push('context','context',p,s);
  if(mode==='all'||mode==='real')for(const [p,s] of REAL)push('real','real',p,s);
  if(!cases.length) throw new Error('Invalid --mode. Valid: all/core/ambiguous/explicit/negative/context/real');
  return cases;
}

function getEvents(raw){
  const result=[];let invalid=0;
  for(const line of raw.split(/\r?\n/)){
    if(!line.trim())continue;
    try{result.push(JSON.parse(line));}catch{invalid++;}
  }
  return {result,invalid};
}
function skillsFrom(value){
  const s=typeof value==='string'?value:JSON.stringify(value??'');
  return SKILLS.filter(name=>s.includes(name));
}
function analyzeTrace(raw,runResult){
  const {result:events,invalid}=getEvents(raw);
  const invocations=[],reads=[],genericSkillReads=[],routes=[];
  let model='NOT_OBSERVABLE',completed=false;
  for(let i=0;i<events.length;i++){
    const e=events[i]||{};const item=e.item||{};
    if(e.type==='turn.completed')completed=true;
    const candidateModel=e.model||e.turn?.model||e.data?.model||e.item?.model;
    if(typeof candidateModel==='string'&&candidateModel)model=candidateModel;
    const type=String(e.type||'');
    if(/skill.?invocation/i.test(type)||/skill.?invocation/i.test(String(item.type||''))){
      const value=e.skill?.name||e.skill_name||e.name||item.skill?.name||item.skill_name||item.name||e.attributes?.['skill.name']||'';
      const detected=skillsFrom(value);
      for(const name of detected)invocations.push({name,eventIndex:i,invocationType:e.invocation_type||e.attributes?.['skill.invocation_type']||item.invocation_type||'unknown'});
    }
    if((type==='item.completed'||type==='item.started') && /command_execution|tool_call/i.test(String(item.type||''))){
      const cmd=typeof item.command==='string'?item.command:Array.isArray(item.command)?item.command.join(' '):String(item.arguments?.command||item.input?.command||'');
      // A list/search of all SKILL.md files is NOT proof of invocation. Only direct reads count.
      const matchNames=SKILLS.filter(n=>cmd.includes(`.agents/skills/${n}/SKILL.md`));
      const mayRead=/(^|[\s;&|])(cat|sed|head|tail|awk|Get-Content)(?:\s|$)/i.test(cmd);
      // Started commands, failed reads and tool calls with no exit status cannot prove loading.
      const completedSuccessfully=type==='item.completed'&&(item.exit_code===0||item.exitCode===0);
      if(completedSuccessfully&&mayRead&&matchNames.length===1)reads.push({name:matchNames[0],eventIndex:i});
      else if(matchNames.length)genericSkillReads.push({names:matchNames,eventIndex:i});
      if(/\.agents\/skills\/README\.md/.test(cmd))routes.push(i);
    }
  }
  return {events:events.length,invalidJsonLines:invalid,completed,model,invocations:uniq(invocations.map(x=>x.name)),invocationDetails:invocations,readSkills:uniq(reads.map(x=>x.name)),genericSkillReads,readIndexBeforeSkill:routes.length>0 && (!reads.length||routes[0]<reads[0].eventIndex),exitCode:runResult.status??null,signal:runResult.signal||null,timedOut:runResult.error?.code==='ETIMEDOUT'};
}
function score(test,trace){
  if(trace.exitCode!==0||!trace.completed||trace.invalidJsonLines>0)return 'RUN_FAILED';
  const events=trace.invocations;
  const read=trace.readSkills;
  if(test.kind==='negative'){
    if(events.length||read.length)return 'FAIL';
    // Absence of telemetry is not evidence that automatic routing was suppressed.
    return 'TRIGGER_NOT_OBSERVABLE';
  }
  if(events.length&&events[0]!==test.expected)return 'FAIL';
  if(read.length&&!read.includes(test.expected))return 'FAIL';
  if(events.length>1||read.length>1)return 'MULTI_SKILL_REVIEW';
  if(events.length===1){
    // Confirmed invocation without a successful SKILL.md read is not full acceptance.
    if(read.length===1&&!trace.readIndexBeforeSkill)
      return test.kind==='explicit'?'EXPLICIT_TRIGGER_PASS':'PASS';
    return test.kind==='explicit'?'EXPLICIT_TRIGGER_OBSERVED':'IMPLICIT_TRIGGER_OBSERVED';
  }
  if(read.length===1&&!trace.readIndexBeforeSkill)
    return test.kind==='explicit'?'EXPLICIT_READ_OBSERVED':'SKILL_READ_OBSERVED';
  return 'TRIGGER_NOT_OBSERVABLE';
}

function localPreflight(repo){
  const result={};
  if(!fs.existsSync(path.join(repo,'.git'))){
    const gitRoot=run('git',['rev-parse','--show-toplevel'],repo);
    if(gitRoot.status!==0)throw new Error('Not a git repository: '+repo);
  }
  const branch=run('git',['branch','--show-current'],repo),sha=run('git',['rev-parse','HEAD'],repo),status=run('git',['status','--short'],repo);
  if(branch.status||sha.status||status.status)throw new Error('Git preflight failed');
  result.branch=branch.stdout.trim();result.sha=sha.stdout.trim();
  const remote=run('git',['ls-remote','origin','refs/heads/main'],repo,20000);
  result.remoteMainSha=remote.status===0?(remote.stdout.trim().split(/\s+/)[0]||null):null;
  result.remoteCheckStatus=remote.status===0?'AVAILABLE':'UNAVAILABLE';
  result.localMatchesRemote=result.remoteMainSha?result.sha===result.remoteMainSha:null;
  result.dirty=status.stdout.trim().length>0;result.worktreeStatus=status.stdout.trim().split('\n').filter(Boolean).length;
  result.statusSnapshot=status.stdout.trim();
  if(result.branch!=='main')throw new Error('Refusing non-main checkout: '+result.branch);
  const skillRoot=path.join(repo,'.agents','skills');
  const dirs=fs.readdirSync(skillRoot,{withFileTypes:true}).filter(v=>v.isDirectory()).map(v=>v.name).sort();
  const active=dirs.filter(name=>fs.existsSync(path.join(skillRoot,name,'SKILL.md')));
  const reserved=dirs.filter(name=>!active.includes(name));
  if(JSON.stringify(active)!==JSON.stringify([...SKILLS].sort()))throw new Error('Active seven Skill directories mismatch: '+active.join(', '));
  if(JSON.stringify(reserved)!==JSON.stringify(['opendesk-marketplace-publish'])||
     !fs.existsSync(path.join(skillRoot,'opendesk-marketplace-publish','RESERVED.md')))
    throw new Error('Inactive marketplace-publish reservation not found or unexpectedly enabled');
  const meta=[];
  for(const name of SKILLS){
    const p=path.join(skillRoot,name,'SKILL.md');const text=fs.readFileSync(p,'utf8');
    const match=text.match(/^---\r?\nname: ([^\n]+)\r?\ndescription: ([^\n]+)\r?\n---(?:\r?\n|$)/);
    if(!match||match[1]!==name)throw new Error('Invalid SKILL frontmatter: '+p);
    meta.push({name,descriptionLength:match[2].length});
  }
  result.skills=meta;
  const codex=run('codex',['--version'],repo);if(codex.error||codex.status!==0)throw new Error('Local Codex CLI unavailable. Existing login is required; no credentials will be requested.');
  result.codexVersion=codex.stdout.trim()||codex.stderr.trim();
  const help=run('codex',['exec','--help'],repo);if(help.status!==0)throw new Error('Cannot inspect codex exec --help');
  if(!/--json/.test(help.stdout)||!/--sandbox/.test(help.stdout))throw new Error('This CLI does not expose required --json and --sandbox options');
  result.sandbox='read-only';
  return result;
}
function selfTest(){
  const done=JSON.stringify({type:'turn.completed'});
  const completeRead=JSON.stringify({type:'item.completed',item:{type:'command_execution',command:'cat .agents/skills/opendesk-extension-ui/SKILL.md',exit_code:0}});
  const read=analyzeTrace(completeRead+'\n'+done,{status:0});
  if(read.readSkills.join(',')!=='opendesk-extension-ui'||score({kind:'implicit',expected:'opendesk-extension-ui'},read)!=='SKILL_READ_OBSERVED')throw new Error('successful read evidence failed');
  for(const [type,code] of [['item.started',null],['item.completed',1],['item.completed',null]]){
    const raw=JSON.stringify({type,item:{type:'command_execution',command:'cat .agents/skills/opendesk-extension-ui/SKILL.md',exit_code:code}})+'\n'+done;
    if(analyzeTrace(raw,{status:0}).readSkills.length)throw new Error('failed/started read was falsely accepted');
  }
  const skillEvent=JSON.stringify({type:'codex.skill_invocation',skill:{name:'opendesk-extension-ui'},invocation_type:'implicit'});
  const selection=analyzeTrace(skillEvent+'\n'+done,{status:0});
  if(score({kind:'implicit',expected:'opendesk-extension-ui'},selection)!=='IMPLICIT_TRIGGER_OBSERVED')throw new Error('invocation without loading must not pass');
  const verified=analyzeTrace(skillEvent+'\n'+completeRead+'\n'+done,{status:0});
  if(score({kind:'implicit',expected:'opendesk-extension-ui'},verified)!=='PASS')throw new Error('verified implicit route failed');
  if(score({kind:'implicit',expected:'opendesk-program-publish'},verified)!=='FAIL')throw new Error('wrong route was not detected');
  if(score({kind:'negative',expected:null},read)!=='FAIL')throw new Error('negative false positive');
  if(score({kind:'negative',expected:null},analyzeTrace(done,{status:0}))!=='TRIGGER_NOT_OBSERVABLE')throw new Error('unobservable negative wrongly passed');
  if(score({kind:'implicit',expected:'opendesk-extension-ui'},analyzeTrace(completeRead+'\n'+done,{status:1}))!=='RUN_FAILED')throw new Error('failed command wrongly passed');
  if(casesFor('all').length!==38)throw new Error('fixture count regression');
  console.log('SELF_TEST_PASS: 38 fixtures; verified invocation+load, failure detection and conservative grading');
}

if(process.argv.includes('--self-test')){
  selfTest();
}else if(process.argv.includes('--help')){
  console.log('Usage: node opendesk-agent-skills-r22-eval.mjs --repo <Mac git path> [--mode all|core|ambiguous|explicit|negative|context|real] [--max-tests N] [--model MODEL]\nRequires existing Codex login; output stays under ~/.codex-evals/opendesk-r22/. No repository writes.');
}else{
  try{
    const repo=path.resolve(opt('--repo',process.cwd()));
    const mode=opt('--mode','all');
    const limit=Number(opt('--max-tests','0'));
    if(!Number.isSafeInteger(limit)||limit<0)throw new Error('--max-tests must be a nonnegative integer');
    const tests=casesFor(mode).slice(0,limit||undefined);
    const before=localPreflight(repo);
    const model=opt('--model',null);
    const stamp=new Date().toISOString().replace(/[:.]/g,'-');
    const outDir=path.join(os.homedir(),'.codex-evals','opendesk-r22',`${before.sha.slice(0,12)}-${stamp}`);
    fs.mkdirSync(outDir,{recursive:true,mode:0o700});
    fs.chmodSync(outDir,0o700);
    const records=[];
    console.log(`Codex: ${before.codexVersion} | repo SHA: ${before.sha} | cases: ${tests.length} | sandbox: read-only`);
    console.log(`Private trace directory: ${outDir}`);
    for(let i=0;i<tests.length;i++){
      const t=tests[i],stem=`${String(i+1).padStart(2,'0')}-${t.id}`;
      // Expected skill is NEVER included in the implicit prompt. Prompts are passed as argv, not through a shell.
      const suffix='\n\n只读检查真实源码并说明正确的职责边界、代码归属与可运行测试。不要修改文件、安装扩展、授权网站、使用凭据或执行发布操作。';
      const prompt=t.kind==='explicit'?t.prompt:t.prompt+suffix;
      const args=['exec','--json','--sandbox','read-only'];
      if(model)args.push('--model',model);
      args.push(prompt);
      const start=Date.now();
      const caseShaBefore=run('git',['rev-parse','HEAD'],repo).stdout.trim();
      const caseStatusBefore=run('git',['status','--short'],repo).stdout.trim();
      const res=run('codex',args,repo,300000);
      const caseShaAfter=run('git',['rev-parse','HEAD'],repo).stdout.trim();
      const caseStatusAfter=run('git',['status','--short'],repo).stdout.trim();
      const stdout=res.stdout||'',stderr=res.stderr||'';
      const outPath=path.join(outDir,stem+'.jsonl');
      fs.writeFileSync(outPath,stdout,{encoding:'utf8',mode:0o600,flag:'wx'});
      if(stderr)fs.writeFileSync(path.join(outDir,stem+'.stderr.txt'),stderr,{encoding:'utf8',mode:0o600,flag:'wx'});
      const trace=analyzeTrace(stdout,res);
      const outcome=caseShaBefore!==caseShaAfter||caseStatusBefore!==caseStatusAfter?'SOURCE_CHANGED_DURING_CASE':score(t,trace);
      const record={id:t.id,group:t.group,kind:t.kind,iteration:t.iteration,prompt:t.prompt,expected:t.expected,status:outcome,caseShaBefore,caseShaAfter,sourceChangedDuringCase:caseShaBefore!==caseShaAfter||caseStatusBefore!==caseStatusAfter,trace,durationMs:Date.now()-start,traceFilename:path.basename(outPath)};
      records.push(record);
      console.log(`${String(i+1).padStart(2,'0')}/${tests.length} ${t.id} ${outcome} ${t.expected||'(none)'}`);
    }
    const afterSha=run('git',['rev-parse','HEAD'],repo).stdout.trim();
    const afterStatus=run('git',['status','--short'],repo).stdout.trim();
    const totals=Object.fromEntries([...new Set(records.map(r=>r.status))].map(status=>[status,records.filter(r=>r.status===status).length]));
    const summary={createdAt:new Date().toISOString(),tool:'opendesk-agent-skills-r22-eval',preflight:before,modelRequested:model||null,repoShaAfter:afterSha,gitStatusLineCountAfter:afterStatus?afterStatus.split('\n').length:0,repoShaChanged:afterSha!==before.sha,worktreeStatusChanged:afterStatus!==before.statusSnapshot,counts:totals,records};
    fs.writeFileSync(path.join(outDir,'summary.json'),JSON.stringify(summary,null,2)+'\n',{encoding:'utf8',mode:0o600,flag:'wx'});
    console.log('RESULT: '+JSON.stringify(totals));
    if(summary.repoShaChanged||summary.worktreeStatusChanged||records.some(r=>r.sourceChangedDuringCase))console.error('WARNING: repository HEAD or status changed during the evaluation; do not combine sample results into one SHA accuracy claim.');
    if(before.localMatchesRemote===false)console.error('WARNING: local main is not identical to remote main; this tests the local candidate only.');
    console.log('Evidence: '+path.join(outDir,'summary.json'));
    // Incomplete/non-observable evaluations must never emit a green exit code.
    process.exitCode=(!summary.repoShaChanged && !summary.worktreeStatusChanged && records.every(r=>r.status==='PASS'||r.status==='EXPLICIT_TRIGGER_PASS'))?0:2;
  }catch(error){console.error('BLOCKED: '+String(error?.message||error));process.exitCode=2;}
}