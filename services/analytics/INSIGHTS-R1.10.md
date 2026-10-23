# OpenDesk Analytics R1.12.1 — 管理员 PostHog 四组 Insights（继承原 R1.10 入口）

状态：SOURCE_DEFINED / NOT_DEPLOYED / NOT_CLOUD_VERIFIED（R1.12.1 只有源码定义与定向测试候选；没有 PostHog 真实 SQL 编译、查询、生产交付或云端回读证据）。必须复用现有 PostHog，不建立另一个 Dashboard 或 Analytics 系统。生产端点继续为空。

## 统计口径与证据边界

- 主动 DAU 唯一允许事件：app.opened、tool.opened、tool.engaged、tool.manual_attempt、workflow.manual_attempt、reading_toc.navigated。手动 Task 失败仍算主动尝试；SW 唤醒、脚本自动运行、安装、React 挂载及 tool.manual_result 均不算主动 DAU。
- Page 自动执行来自原 page-execution-v1；Scheduler 自动执行必须由 FireId 绑定 RunId 和 ResultId。单独 Fire 不代表一次已执行任务。云端 Controller 自动任务额外要求原 cloud-request-v1 的 requestId→RunId 双向绑定；非云端、非调度的手动/AI Controller Run 不混入自动指标。最新 `tool.auto_daily` 同时包含 `source_totals`（page_auto / scheduler / cloud）；每行各来源数量之和必须等于总量。
- Task 手动点击来自 task-workbench 的真实 isTrusted 事件；其结果在 Host 从原 Controller Run/Result 读取。completed 仅代表程序执行完成，不是业务效果独立验证。
- R1.11 新增经审查的第一方 Workflow 业务效果（B 级）：仅在工作流 UI 已取得独立业务读回，并由 Host 再次核对原始 Controller Run/Result 后，上报 `workflow.business_effect_verified`。该事件不计入 DAU，同一原始 RunId 在本安装内去重；不得将普通 `completed` 或 Page `effectConfirmed` 解释为此事件。
- Reading TOC 浮动目录的用户真实点击经过原网页适配器对目标章节的可读视区测量、原站点/Chrome 授权检查及 Host 活动 Document 校验后，发送 `reading_toc.navigated`（B 级，计入主动 DAU）；自动目录渲染、Scroll Spy 不发主动使用事件。R1.12 已新增已安装 Page 的手动运行与 Host 持久 Receipt 统计入口，但还缺最新候选真实 Chrome 验收；AdBlock 真正网络规则命中在普通生产 Chrome 标记 NOT_OBSERVABLE，Workflow 仅经三段独立观察证明的链接导航允许 B 级，搜索与单独填写仍不可冒充通用业务成功。尚未观察到的指标是 NOT_OBSERVED，不是数值 0。
- 每个用户自定义 Page/Task ID 使用仅保存在本机的独立随机秘密盐生成 anon-*，只能在同一安装内关联，不能跨安装把相同工具合并。官方 Sidebar ID 可直接聚合。跨安装 Page/Task 按类型统计可靠，按具体匿名工具身份的全球排行榜不可宣称完成。
- 最新安装是原 Sidebar Installer + Foundation Authority 的已知快照；不代表实时 Chrome 商店总装机。R1.11 的 `inventory_types` 分别包括 sidebar/page/task 安装数、Scheduler Definition（active/paused/unknown）与 App Service 正式 Sidebar 父级绑定（enabled/disabled/unknown）；Scheduler 与 App Service 不增加独立 installed 总量。`inventory_items` 最多 96 项，官方 Sidebar ID 公开，用户 Page/Task 使用每安装盐化代号。inventory_read_state=failed 和 inventory_overflow 必须显示为未知/覆盖缺口。

## Insights A — DAU / WAU / MAU

HogQL 示例（真实 PostHog 项目的 SQL 方言和时区仍须核对）：

\`\`\`sql
SELECT toDate(timestamp) AS day, uniqExact(distinct_id) AS active_installs
FROM events
WHERE event IN ('app.opened','tool.opened','tool.engaged','tool.manual_attempt','workflow.manual_attempt','reading_toc.navigated')
  AND timestamp >= now() - INTERVAL 30 DAY
GROUP BY day ORDER BY day
\`\`\`

WAU 和 MAU：最近 7 天及 30 天分别对 distinct_id 去重，不对每日 DAU 求和。单位是同意统计的随机安装，而不是自然人。管理员同时需要下列独立聚合，切勿将 30 个 DAU 相加：

```sql
SELECT
  uniqExactIf(distinct_id, toDate(timestamp) = today()) AS dau_today,
  uniqExactIf(distinct_id, timestamp >= now() - INTERVAL 7 DAY) AS wau_7d,
  uniqExact(distinct_id) AS mau_30d
FROM events
WHERE event IN (
    'app.opened','tool.opened','tool.engaged',
    'tool.manual_attempt','workflow.manual_attempt','reading_toc.navigated'
  )
  AND timestamp >= now() - INTERVAL 30 DAY
```

`today()` 与事件日期需以目标 PostHog 项目的已审核时区为准；若按 UTC 报表，则实际部署时显式指定 UTC。离线源码只能保证定义，不保证项目时区。

## Insights B — 主动尝试 / 执行完成 / 失败 / 未知 / 自动执行

手动 Page / Task 使用 tool.manual_attempt 的事件次数；状态只使用 tool.manual_result 的 run_status: completed、failed、outcome_unknown。不得把其 completed 当作业务成功。

```sql
SELECT event,properties.tool_type AS tool_type,
       properties.run_status AS run_status,count() AS occurrences
FROM events
WHERE event IN ('tool.manual_attempt','tool.manual_result')
  AND timestamp >= now() - INTERVAL 30 DAY
GROUP BY event,tool_type,run_status
ORDER BY event,tool_type,run_status
```

Workflow 的用户真实 Send/Run 另用 `workflow.manual_attempt`，而 Workflow 的 B 级成功另用 `workflow.business_effect_verified`，这三个口径不能互相填补。

自动事件 tool.auto_daily 的 cumulative_total 是累计数，不是单次增量。每个 distinct_id + tool_type + tool_id + utc_day + metric_type 先取最大 snapshot_version 的值，再汇总：

\`\`\`sql
SELECT tool_type, metric_type,
  sum(latest_total) AS total,
  sum(page_auto) AS page_auto,
  sum(scheduler) AS scheduler,
  sum(cloud) AS cloud,
  sum(latest_total)-sum(page_auto)-sum(scheduler)-sum(cloud)
    AS reconciliation_gap
FROM (
  SELECT distinct_id,properties.tool_type AS tool_type,
    properties.tool_id AS tool,properties.utc_day AS utc_day,
    properties.metric_type AS metric_type,
    argMax(toInt64(properties.cumulative_total),
      toInt64(properties.snapshot_version)) AS latest_total,
    argMax(toInt64OrZero(ifNull(properties.source_totals.page_auto,'0')),
      toInt64(properties.snapshot_version)) AS page_auto,
    argMax(toInt64OrZero(ifNull(properties.source_totals.scheduler,'0')),
      toInt64(properties.snapshot_version)) AS scheduler,
    argMax(toInt64OrZero(ifNull(properties.source_totals.cloud,'0')),
      toInt64(properties.snapshot_version)) AS cloud
  FROM events
  WHERE event='tool.auto_daily' AND timestamp>=now()-INTERVAL 35 DAY
  GROUP BY distinct_id,tool_type,tool,utc_day,metric_type
)
GROUP BY tool_type,metric_type
\`\`\`

如果 `reconciliation_gap != 0`，应将该分组标记为 **SOURCE_MISMATCH** 并调查，不得用 `HAVING` 隐藏不一致数据；若某期无源数据也不能凭缺失记录宣布零执行。

Reading TOC 的 `reading_toc.navigated` 同时是 B 级可视效果与主动操作，但不代表页面业务交易完成。

Workflow 用户真实 Send（有任务文本）及可信手动运行会发出一次 `workflow.manual_attempt`；多轮 AI 自动分段不再计入，后续 B 级业务验证也不参与 DAU。

PostHog 自动来源查询应先选同一 `distinct_id/tool_type/tool_id/utc_day/metric_type` 的最新 `snapshot_version`，并一起选择那条快照的 `source_totals`；再对 `page_auto`、`scheduler`、`cloud` 逐来源求和。**不得**逐版本累计，也不得将一行多个来源当成多个安装或主动 DAU。云端不能访问时 SOURCE_DEFINED / NOT_DEPLOYED，不得伪造结果。

B 级 Workflow 独立效果查询定义（无原始 RunId/网页内容上传）：

```sql
SELECT toDate(timestamp) AS day, properties.tool_id AS tool,
       uniqExact(uuid) AS verified_effects
FROM events
WHERE event = 'workflow.business_effect_verified'
  AND properties.evidence_level = 'B'
GROUP BY day, tool ORDER BY day
```

该事件为仅经审查的特定第一方流程，不代表所有 Workflow 的业务成功，也不自动增加 DAU。以上示例均 NOT_DEPLOYED，PostHog SQL 方言与查询结果需云端核对；数据缺口和权限缺失不得以 0 代替。

## Insights C — 排行与日/周/月趋势

将 tool.opened、tool.engaged、tool.manual_attempt、workflow.manual_attempt、reading_toc.navigated、手动完成、手动失败、Workflow B 级验证效果，以及从 Insight B 按最新版本取值的自动完成、自动失败、自动未知分别展示。时间分桶：手动事件 timestamp；自动事件 utc_day。工具身份：Sidebar 可以跨安装排行；自定义 Page/Task 按类型或单安装内匿名 ID 排行，不能虚构跨安装同一工具排行。

以下是人工操作/可信业务效果的趋势查询；把 `'day'` 分别替换为 `'week'`、`'month'` 即得到同口径周、月图。对跨安装自定义 Page / Task 只保留工具**类型**分类，不把 `anon-*` 当成全球同一工具：

```sql
SELECT dateTrunc('day', timestamp) AS period,
       if(event IN ('tool.manual_attempt','tool.manual_result'),
         concat('custom-',ifNull(properties.tool_type,'unknown')),
         properties.tool_id) AS tool_group,
       event,properties.run_status AS run_status,count() AS events_count
FROM events
WHERE event IN (
  'tool.opened','tool.engaged','tool.manual_attempt','tool.manual_result',
  'workflow.manual_attempt','workflow.business_effect_verified',
  'reading_toc.navigated'
) AND timestamp >= now() - INTERVAL 90 DAY
GROUP BY period,tool_group,event,run_status
ORDER BY period,events_count DESC
```

自动来源/趋势必须使用 Insight B 的先选最新版本子查询，把同一分组的 `utc_day` 转为对应日、周、月再聚合，**绝不能对历史快照直接 `count()` 或 `sum(properties.cumulative_total)`**。

## Insights D — 最新已知安装状态、权限与新鲜度

每个 distinct_id 仅取最新的 app.inventory 和 app.inventory_types。后者包含 inventory_types 中 Sidebar、Page、Task 的实际安装/启用/停用/阻断/未知计数、Scheduler Definition 的当前活跃/暂停、App Service 父级绑定状态，以及 inventory_items 中最多 96 个可信安装身份（Sidebar ID 与其他类型匿名 ID），超出部分 inventory_overflow。最后一次观测时间超过 24 小时示例阈值时标记 STALE。读取失败标记 READ_FAILED，不冒充零安装。Scheduler Schedule Definition、Workflow 和 App Service 不得作为独立安装工具重复计数。

\`\`\`sql
SELECT distinct_id,max(timestamp) AS last_reported,
  dateDiff('hour',max(timestamp),now()) AS age_hours,
  if(argMax(properties.inventory_read_state,timestamp)='failed','READ_FAILED',
    if(dateDiff('hour',max(timestamp),now())>=24,'STALE','FRESH'))
    AS freshness,
  argMax(properties.inventory_read_state,timestamp) AS latest_state,
  argMax(properties.inventory_types,timestamp) AS latest_types,
  argMax(properties.inventory_items,timestamp) AS latest_items,
  argMax(properties.inventory_overflow,timestamp) AS latest_overflow,
  argMax(properties.projection_gap,timestamp) AS latest_gap
FROM events
WHERE event='app.inventory_types'
  AND timestamp >= now() - INTERVAL 90 DAY
GROUP BY distinct_id
\`\`\`

## D1 开发对账

\`\`\`sql
SELECT utc_day,tool_type,metric_type,SUM(total) AS latest_total,
  SUM(projection_gap) AS coverage_gaps
FROM analytics_auto_latest GROUP BY utc_day,tool_type,metric_type;
SELECT status,COUNT(*) FROM analytics_events GROUP BY status;
\`\`\`

D1 的原子版本比较要求 excluded.version > 当前 version 且 excluded.total >= 当前 total。PostHog 需要另行检查实际可查询记录；D1 ACK 只表示已持久接收，不代表 PostHog 已成功投递。

## 发行阻断

仍需 Reading TOC/AdBlock 的原生结果证据、手动 Page 与 Workflow 三 Run B 级真实 Chrome 验证、Chrome 138–142 多版本真实验证、真实 macOS Chrome 安装及权限撤销、Cloudflare D1 与 PostHog 开发环境对账、原定 28 项业务矩阵，以及隐私合规独立审核。

Chrome Web Store 2026-07-01 公告 / 2026-08-01 执行政策：
https://developer.chrome.com/blog/cws-policy-updates-2026

没有审查结论与开发云端证据，不得启用正式 Analytics 生产接收地址。
