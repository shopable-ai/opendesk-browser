import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// These are source-contract checks for the administrator's four PostHog Insights.
// They prevent metric/NULL semantics from drifting; they do NOT compile HogQL
// or prove that a real PostHog project has deployed or queried these Insights.
const document=await readFile(new URL('../../services/analytics/INSIGHTS-R1.10.md',import.meta.url),'utf8');
function section(start,end){
  const from=document.indexOf(start);
  assert.notEqual(from,-1,`missing section: ${start}`);
  const to=end?document.indexOf(end,from+start.length):document.length;
  assert.notEqual(to,-1,`missing section boundary: ${end}`);
  return document.slice(from,to);
}

test('administrator dashboard is private and does not reinterpret missing data as zero',()=>{
  const dashboard=section('## 管理员 Dashboard 交付与权限边界','## Insights A');
  assert.match(dashboard,/禁止公开分享链接/);
  assert.match(dashboard,/NO_OBSERVATIONS/);
  assert.match(dashboard,/不能区分未部署、无人同意或确实没有主动使用/);
  assert.match(dashboard,/FRESH \/ STALE \/ READ_FAILED/);
});

test('Insight A counts only explicit active-use events and deduplicates installations',()=>{
  const a=section('## Insights A','## Insights B');
  const start=a.indexOf('SELECT toDate(timestamp)');
  const end=a.indexOf('GROUP BY day ORDER BY day',start);
  assert.ok(start>=0&&end>start,'DAU trend query must be present');
  const query=a.slice(start,end);
  const events=[...query.matchAll(/'([a-z][a-z._]+)'/g)].map(match=>match[1]).sort();
  assert.deepEqual(events,[
    'app.opened','reading_toc.navigated','tool.engaged','tool.manual_attempt',
    'tool.opened','workflow.manual_attempt'
  ].sort());
  assert.match(query,/uniqExact\(distinct_id\)/);
  assert.doesNotMatch(query,/tool\.manual_result|tool\.auto_daily|app\.inventory/);
});

test('Insight B separates manual outcomes from latest cumulative automatic snapshots',()=>{
  const b=section('## Insights B','## Insights C');
  assert.match(b,/tool\.manual_attempt/);
  assert.match(b,/tool\.manual_result/);
  assert.match(b,/outcome_unknown/);
  assert.match(b,/workflow\.business_effect_verified/);
  assert.match(b,/argMax\(toInt64\(properties\.cumulative_total\)/);
  assert.match(b,/snapshot_version/);
  assert.match(b,/source_totals/);
  assert.match(b,/reconciliation_gap/);
  assert.match(b,/逐版本累计/);
});

test('Insight C does not turn per-install anonymous Page/Task IDs into a global tool ranking',()=>{
  const c=section('## Insights C','## Insights D');
  assert.match(c,/concat\('custom-',ifNull\(properties\.tool_type,'unknown'\)\)/);
  assert.match(c,/properties\.tool_id/);
  assert.match(c,/跨安装自定义 Page \/ Task/);
  assert.match(c,/自动来源\/趋势必须使用 Insight B/);
});

test('Insight D suppresses stale inventory fields when the latest read failed',()=>{
  const d=section('## Insights D','## D1 开发对账');
  for(const field of ['inventory_types','inventory_items','inventory_overflow','projection_gap']){
    const escaped=field.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    assert.match(d,new RegExp(
      `if\\(argMax\\(properties\\.inventory_read_state,timestamp\\)='failed',NULL,\\s*argMax\\(properties\\.${escaped},timestamp\\)\\)`
    ),`failed latest read must suppress ${field}`);
  }
  assert.match(d,/READ_FAILED/);
  assert.match(d,/STALE/);
  assert.match(d,/argMax\(properties\.inventory_read_state,timestamp\)/);
});

test('global data status distinguishes no observations from observed zero-valued metrics',()=>{
  const query=section('## 全局数据可观测状态','## Insights A');
  assert.match(query,/if\(count\(\)=0,'NO_OBSERVATIONS','OBSERVED'\)/);
  assert.match(query,/observed_events_30d/);
  assert.match(query,/observed_installations_30d/);
});
