/* OpenDesk AI Insight R5 — pure demo/domain contract; not a browser observer or installed tool. */
(() => {
  'use strict';
  const MIN = 60_000;
  const RELATIONS = Object.freeze(['SAME_PROBLEM','SUBPROBLEM_OF','RELATED','SIMILAR','DISTINCT','UNKNOWN']);
  const EVENTS = Object.freeze(['SUBMITTED_OBSERVED','FIRST_OUTPUT_OBSERVED','OUTPUT_PROGRESS_OBSERVED','COMPLETION_OBSERVED','STOP_OBSERVED','ERROR_OBSERVED','OBSERVATION_GAP','STATUS_UNKNOWN','REGENERATED']);
  const ACTIVE = new Set(['SUBMITTED_OBSERVED','FIRST_OUTPUT_OBSERVED','OUTPUT_PROGRESS_OBSERVED','OBSERVATION_GAP','STATUS_UNKNOWN']);
  const ENDS = new Set(['COMPLETION_OBSERVED','STOP_OBSERVED','ERROR_OBSERVED']);
  const clone = value => JSON.parse(JSON.stringify(value));
  const assert = (ok, reason) => { if (!ok) throw new Error(reason); };
  const unique = arr => [...new Set(arr)];
  const audit = (s, action, detail) => s.audit.push({ revision: ++s.revision, action, detail, actor:'USER_DEMO' });

  function reduceExecution(events) {
    const seen = new Set(); let status = 'NOT_STARTED', startMs = null, firstMs = null;
    let endMs = null, gap = false, accepted = 0, duplicates = 0, rejected = [];
    for (const event of events) {
      const type = event?.eventType ?? event?.type;
      const atMs = Number.isFinite(event?.atMs) ? event.atMs : Date.parse(event?.observedAt ?? '');
      if (!event || !EVENTS.includes(type) || !Number.isFinite(atMs) || !event.eventId || !event.dedupeKey ||
          !event.scopeId || !event.origin || !event.accountId || !event.generationId) {
        rejected.push('INVALID_EVENT'); continue;
      }
      const key = [event.scopeId,event.origin,event.accountId,event.consentRevision ?? 'demo',event.generationId,event.dedupeKey].join('|');
      if (seen.has(key)) { duplicates++; continue; }
      seen.add(key);
      if (startMs !== null && atMs < startMs) { rejected.push('CLOCK_REGRESSION'); gap = true; status = 'STATUS_UNKNOWN'; continue; }
      const allowed =
        (status === 'NOT_STARTED' && type === 'SUBMITTED_OBSERVED') ||
        (ACTIVE.has(status) && (
          type === 'OBSERVATION_GAP' || type === 'STATUS_UNKNOWN' ||
          type === 'STOP_OBSERVED' || type === 'ERROR_OBSERVED' ||
          type === 'COMPLETION_OBSERVED' ||
          ((status === 'SUBMITTED_OBSERVED' || status === 'OBSERVATION_GAP' || status === 'STATUS_UNKNOWN') && type === 'FIRST_OUTPUT_OBSERVED') ||
          ((status === 'FIRST_OUTPUT_OBSERVED' || status === 'OUTPUT_PROGRESS_OBSERVED') && type === 'OUTPUT_PROGRESS_OBSERVED')
        )) ||
        (ENDS.has(status) && type === 'REGENERATED');
      if (!allowed) { rejected.push('INVALID_TRANSITION:' + status + '→' + type); continue; }
      if (type === 'SUBMITTED_OBSERVED') startMs = atMs;
      if (type === 'FIRST_OUTPUT_OBSERVED' && firstMs === null) firstMs = atMs;
      if (type === 'OBSERVATION_GAP' || type === 'STATUS_UNKNOWN') gap = true;
      if (ENDS.has(type)) endMs = atMs;
      status = type; accepted++;
    }
    const complete = status === 'COMPLETION_OBSERVED';
    const exact = complete && !gap && rejected.length === 0 && startMs !== null && endMs >= startMs;
    return { status,startMs,firstMs,endMs,accepted,duplicates,rejected,gap,
      completeObserved:complete, rightCensored:!ENDS.has(status) && status !== 'REGENERATED',
      durationMs:exact ? endMs - startMs : null,
      firstOutputLatencyMs:!gap && startMs !== null && firstMs !== null ? firstMs - startMs : null,
      observedOutputMs:exact && firstMs !== null ? endMs-firstMs : null,
      coverage:gap || rejected.length ? 'PARTIAL' : 'FULL' };
  }

  function intervalMetrics(executions) {
    const seen = new Set(); const intervals = []; const unknownIds = [];
    for (const e of executions) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      if (e.status !== 'COMPLETION_OBSERVED' || e.coverage !== 'FULL' ||
          !Number.isFinite(e.startMs) || !Number.isFinite(e.endMs) || e.endMs < e.startMs) {
        unknownIds.push(e.id); continue;
      }
      intervals.push([e.startMs,e.endMs]);
    }
    intervals.sort((a,b)=>a[0]-b[0] || a[1]-b[1]);
    let unionMs = 0, sumMs = 0, cursorStart = null, cursorEnd = null;
    for (const [start,end] of intervals) {
      sumMs += end-start;
      if (cursorStart === null) { cursorStart=start; cursorEnd=end; }
      else if (start <= cursorEnd) cursorEnd=Math.max(cursorEnd,end);
      else { unionMs+=cursorEnd-cursorStart; cursorStart=start; cursorEnd=end; }
    }
    if (cursorStart !== null) unionMs+=cursorEnd-cursorStart;
    return { sumMs,unionMs,overlapMultiplicityMs:sumMs-unionMs,
      exactSampleCount:intervals.length, unknownSampleCount:unknownIds.length,
      unknownIds, coverage:seen.size ? intervals.length/seen.size : null,
      note:'区间并集不是人工工作时间；未知区间未被零填充' };
  }

  function demoState() {
    return {
      schemaVersion:1,scopeId:'scope_demo_local',revision:0, mode:'normal',
      problems:[
        {id:'prob_bug',title:'修复浏览器扩展的保存失败',status:'NEEDS_VERIFICATION',next:'复验保存→刷新→结果一致',result:'Claude 排除了缓存因素；真实回归仍未确认'},
        {id:'prob_theme',title:'另一个问题：深色模式颜色',status:'OPEN',next:'检查 tokens',result:'尚未关联'}
      ],
      conversations:[
        {id:'conv_a',platform:'ChatGPT',label:'对话 A · 首次修复',origin:'https://chatgpt.com',accountId:'account_demo_1'},
        {id:'conv_b',platform:'Claude',label:'对话 B · 失败归因',origin:'https://claude.ai',accountId:'account_demo_2'},
        {id:'conv_c',platform:'ChatGPT',label:'对话 C · 复测',origin:'https://chatgpt.com',accountId:'account_demo_1'},
        {id:'conv_x',platform:'Gemini',label:'相似但不同的登录 Bug',origin:'https://gemini.google.com',accountId:'account_demo_3'}
      ],
      links:[
        {id:'link_a',problemId:'prob_bug',conversationId:'conv_a',status:'CONFIRMED',revision:1,decisionSource:'USER',evidenceFor:['相同任务 ID'],evidenceAgainst:[]},
        {id:'link_c',problemId:'prob_bug',conversationId:'conv_c',status:'CONFIRMED',revision:1,decisionSource:'USER',evidenceFor:['同一验收目标'],evidenceAgainst:[]}
      ],
      candidates:[
        {id:'candidate_b',problemId:'prob_bug',conversationId:'conv_b',relation:'SAME_PROBLEM',confidence:0.77,evidenceFor:['同一仓库和 Bug 编号'],evidenceAgainst:['来源平台不同'],status:'PENDING'},
        {id:'candidate_x',problemId:'prob_bug',conversationId:'conv_x',relation:'SIMILAR',confidence:0.61,evidenceFor:['标题出现扩展'],evidenceAgainst:['错误代码与验收条件不同'],status:'PENDING'}
      ],
      relations:[],
      executions:[
        {id:'exec_a',conversationId:'conv_a',status:'COMPLETION_OBSERVED',startMs:0,endMs:40*MIN,coverage:'FULL'},
        {id:'exec_b',conversationId:'conv_b',status:'COMPLETION_OBSERVED',startMs:10*MIN,endMs:35*MIN,coverage:'FULL'},
        {id:'exec_c',conversationId:'conv_c',status:'STATUS_UNKNOWN',startMs:45*MIN,endMs:null,coverage:'PARTIAL'}
      ],
      outcome:{problemId:'prob_bug',state:'CLAIMED_BY_AI',aiClaim:'AI 声称已修复',verifiedEvidenceIds:[],userConfirmed:false},
      evidence:[{id:'evi_ai_claim',kind:'AI_CLAIM',label:'AI 回复：已修复（非测试证据）',validFor:['prob_bug'],isDemo:true}],
      grants:[
        {origin:'https://chatgpt.com',accountId:'account_demo_1',metadata:true,body:false,revision:1},
        {origin:'https://claude.ai',accountId:'account_demo_2',metadata:true,body:false,revision:1}
      ],
      observedEvents:[], audit:[],deletedProblems:[], nextId:1
    };
  }

  function confirmedConversationIds(s, problemId) {
    return unique(s.links.filter(l=>l.problemId===problemId && l.status==='CONFIRMED').map(l=>l.conversationId));
  }
  function problemMetrics(s, problemId) {
    const p = s.problems.find(p=>p.id===problemId);
    if (!p || s.deletedProblems.includes(problemId)) return null;
    const conv = confirmedConversationIds(s,problemId);
    const executions = s.executions.filter(e=>conv.includes(e.conversationId));
    const m = intervalMetrics(executions);
    return {...m, conversationCount:conv.length, platformCount:unique(conv.map(id=>s.conversations.find(c=>c.id===id)?.platform).filter(Boolean)).length,
      executionCount:executions.length, exactness:m.unknownSampleCount?'PARTIAL':'FULL'};
  }
  function applyAction(current,action) {
    const s=clone(current); const p=s.problems.find(p=>p.id===action.problemId);
    switch(action.type){
      case 'CREATE_PROBLEM': {
        const title=String(action.title||'').trim();
        assert(title.length>0 && title.length<=120,'标题须为 1–120 字');
        const id='prob_new_'+String(s.nextId++).padStart(3,'0');
        s.problems.push({id,title,status:'OPEN',next:'定义验收条件',result:'尚无观察数据'});
        audit(s,'CREATE_PROBLEM',{problemId:id}); return s;
      }
      case 'LINK_CANDIDATE': {
        const c=s.candidates.find(c=>c.id===action.candidateId);
        assert(c && c.status==='PENDING','候选不存在或已处理');
        assert(c.relation==='SAME_PROBLEM','相似或相关不能直接并为同一问题');
        assert(s.problems.some(p=>p.id===c.problemId),'问题不存在');
        c.status='ACCEPTED';
        s.links.push({id:'link_'+c.conversationId,problemId:c.problemId,conversationId:c.conversationId,
          status:'CONFIRMED',revision:1,decisionSource:'USER',
          evidenceFor:clone(c.evidenceFor),evidenceAgainst:clone(c.evidenceAgainst)});
        audit(s,'LINK_CANDIDATE',{candidateId:c.id,conversationId:c.conversationId,problemId:c.problemId}); return s;
      }
      case 'REJECT_CANDIDATE': {
        const c=s.candidates.find(c=>c.id===action.candidateId);
        assert(c && c.status==='PENDING','候选不存在或已处理');
        c.status='REJECTED';audit(s,'REJECT_CANDIDATE',{candidateId:c.id});return s;
      }
      case 'UNDO_LINK': {
        const l=s.links.find(l=>l.id===action.linkId && l.status==='CONFIRMED');
        assert(l,'已确认关联不存在'); l.status='UNDONE';l.revision++;
        const c=s.candidates.find(c=>c.conversationId===l.conversationId && c.problemId===l.problemId);
        if(c) c.status='PENDING'; audit(s,'UNDO_LINK',{linkId:l.id,problemId:l.problemId});return s;
      }
      case 'SPLIT_LINK': {
        const l=s.links.find(l=>l.id===action.linkId && l.status==='CONFIRMED');
        assert(l,'关联不存在，无法拆分');
        const id='prob_new_'+String(s.nextId++).padStart(3,'0');
        const title=String(action.title||'拆分出的独立问题').slice(0,120);
        s.problems.push({id,title,status:'OPEN',next:'重新定义验收',result:'待重新确认'});
        const old=l.problemId;l.status='UNDONE';l.revision++;
        s.links.push({id:'link_split_'+id,problemId:id,conversationId:l.conversationId,
          status:'CONFIRMED',revision:1,decisionSource:'USER',evidenceFor:['用户手动拆分'],evidenceAgainst:[]});
        audit(s,'SPLIT_LINK',{fromProblemId:old,toProblemId:id,conversationId:l.conversationId});return s;
      }
      case 'SET_OUTCOME': {
        assert(p && p.id===s.outcome.problemId,'仅演示主问题的成果状态');
        assert(['NEEDS_VERIFICATION','USER_CONFIRMED','REOPENED'].includes(action.value),'非法状态');
        s.outcome.state=action.value;s.outcome.userConfirmed=action.value==='USER_CONFIRMED';
        p.status=action.value==='REOPENED'?'OPEN':action.value;
        audit(s,'SET_OUTCOME',{problemId:p.id,value:action.value});return s;
      }
      case 'RECORD_DEMO_TEST': {
        assert(p && p.id===s.outcome.problemId,'问题不存在');
        const id='evi_demo_test_'+s.nextId++;
        s.evidence.push({id,kind:'TEST_PASS',label:'模拟本地测试通过（不代表真实验收）',validFor:[p.id],isDemo:true});
        s.outcome.verifiedEvidenceIds.push(id);s.outcome.state='EVIDENCE_VERIFIED';p.status='EVIDENCE_VERIFIED';
        audit(s,'RECORD_DEMO_TEST',{problemId:p.id,evidenceId:id});return s;
      }
      case 'SET_MODE': assert(['normal','empty','partial','error','privacy'].includes(action.value),'非法视图');s.mode=action.value;return s;
      case 'REVOKE_ORIGIN': {
        const g=s.grants.find(g=>g.origin===action.origin);assert(g,'站点不存在');
        g.metadata=false;g.body=false;g.revision++;audit(s,'REVOKE_ORIGIN',{origin:action.origin});return s;
      }
      case 'GRANT_ORIGIN': {
        const g=s.grants.find(g=>g.origin===action.origin);assert(g,'站点不存在');
        g.metadata=true;g.body=false;g.revision++;audit(s,'GRANT_ORIGIN',{origin:action.origin});return s;
      }
      case 'OBSERVE_EVENT': {
        const e=action.event;const g=s.grants.find(g=>g.origin===e?.origin && g.accountId===e?.accountId && g.metadata);
        assert(g && s.mode!=='privacy','授权已撤销，禁止采集');
        assert(e.scopeId===s.scopeId && e.consentRevision===g.revision,'Scope 或授权版本失效');
        assert(e.body===undefined && e.promptText===undefined && e.responseText===undefined,'未获正文授权');
        const key=[e.scopeId,e.origin,e.accountId,e.consentRevision,e.generationId,e.dedupeKey].join('|');
        const type=e.eventType ?? e.type;
        const atMs=Number.isFinite(e.atMs)?e.atMs:Date.parse(e.observedAt ?? '');
        assert(e.eventId && e.dedupeKey && e.generationId && EVENTS.includes(type) && Number.isFinite(atMs),
          'INVALID_EVENT：缺少事件身份、有效类型或观察时间');
        if (!s.observedEvents.some(v=>v.key===key)){
          s.observedEvents.push({key,eventId:e.eventId,atMs,type,
            conversationId:e.conversationId ?? null, executionId:e.executionId ?? null});
        }
        return s;
      }
      case 'DELETE_PROBLEM': {
        assert(p,'问题不存在');
        s.problems=s.problems.filter(x=>x.id!==p.id);
        const related=s.links.filter(l=>l.problemId===p.id).map(l=>l.conversationId);
        s.links=s.links.filter(l=>l.problemId!==p.id);
        s.candidates=s.candidates.filter(c=>c.problemId!==p.id);
        s.relations=s.relations.filter(r=>r.leftProblemId!==p.id && r.rightProblemId!==p.id);
        s.evidence=s.evidence.filter(e=>!e.validFor.includes(p.id));
        s.audit=s.audit.filter(a=>JSON.stringify(a.detail).includes(p.id)===false);
        if(s.outcome.problemId===p.id) s.outcome={problemId:null,state:'UNKNOWN',verifiedEvidenceIds:[],userConfirmed:false};
        const orphans=related.filter(id=>!s.links.some(l=>l.conversationId===id && l.status==='CONFIRMED'));
        s.executions=s.executions.filter(e=>!orphans.includes(e.conversationId));
        s.conversations=s.conversations.filter(c=>!orphans.includes(c.id));
        // Preserve events attributed to conversations still shared by another problem;
        // unattributed events are discarded conservatively on deletion.
        s.observedEvents=s.observedEvents.filter(v=>v.conversationId && !orphans.includes(v.conversationId));
        s.deletedProblems.push(p.id);
        audit(s,'DELETE_PROBLEM',{deleted:true});return s;
      }
      default: throw new Error('未知操作: '+action.type);
    }
  }
  function relationDecision(left,right,kind,actor,evidenceFor,evidenceAgainst){
    assert(left!==right,'同一 ID 无需关系边');assert(RELATIONS.includes(kind),'关系类型不存在');
    return {leftProblemId:left,rightProblemId:right,relation:kind,decisionSource:actor,
      confidence:actor==='USER'?1:null,evidenceFor:clone(evidenceFor||[]),evidenceAgainst:clone(evidenceAgainst||[]),revision:1};
  }
  function percentile(values,p) {
    const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);
    if(!sorted.length) return {value:null,n:0,coverage:0};
    const i=Math.ceil(p/100*sorted.length)-1;
    return {value:sorted[Math.max(0,Math.min(sorted.length-1,i))],n:sorted.length};
  }
  const API = Object.freeze({MIN,RELATIONS,EVENTS,demoState,reduceExecution,intervalMetrics,problemMetrics,
    confirmedConversationIds,applyAction,relationDecision,percentile});
  globalThis.AIInsightCore=API;
})();
