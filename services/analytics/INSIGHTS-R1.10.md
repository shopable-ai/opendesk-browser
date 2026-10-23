# OpenDesk Analytics R1.10 — 管理员 PostHog 四组 Insights

状态：SOURCE_DEFINED / NOT_DEPLOYED / NOT_CLOUD_VERIFIED。必须复用现有 PostHog，不建立另一个 Dashboard 或 Analytics 系统。生产端点继续为空。

## 统计口径与证据边界

- 主动 DAU 唯一允许事件：app.opened、tool.opened、tool.engaged、tool.manual_attempt。手动 Task 失败仍算主动尝试；SW 唤醒、脚本自动运行、安装、React 挂载及 tool.manual_result 均不算主动 DAU。
- Page 自动执行来自原 page-execution-v1；Scheduler 自动执行必须由 FireId 绑定 RunId 和 ResultId。单独 Fire 不代表一次已执行任务。
- Task 手动点击来自 task-workbench 的真实 isTrusted 事件；其结果在 Host 从原 Controller Run/Result 读取。completed 仅代表程序执行完成，不是业务效果独立验证。
- 当前缺失 Workflow 最终业务效果、Reading TOC、AdBlock 规则命中及 Page 手动执行的完整归因。可信业务效果成功指标应标记 NOT_OBSERVED，而非填写 0。
- 每个用户自定义 Page/Task ID 使用仅保存在本机的独立随机秘密盐生成 anon-*，只能在同一安装内关联，不能跨安装把相同工具合并。官方 Sidebar ID 可直接聚合。跨安装 Page/Task 按类型统计可靠，按具体匿名工具身份的全球排行榜不可宣称完成。
- 最新安装是只读 Foundation Authority 的已知快照；不代表实时 Chrome 商店总装机。inventory_read_state=failed 和 inventory_overflow 必须显示为未知/覆盖缺口。

## Insights A — DAU / WAU / MAU

HogQL 示例（真实 PostHog 项目的 SQL 方言和时区仍须核对）：

\`\`\`sql
SELECT toDate(timestamp) AS day, uniqExact(distinct_id) AS active_installs
FROM events
WHERE event IN ('app.opened','tool.opened','tool.engaged','tool.manual_attempt')
  AND timestamp >= now() - INTERVAL 30 DAY
GROUP BY day ORDER BY day
\`\`\`

WAU 和 MAU：最近 7 天及 30 天分别对 distinct_id 去重，不对每日 DAU 求和。单位是同意统计的随机安装，而不是自然人。

## Insights B — 主动尝试 / 执行完成 / 失败 / 未知 / 自动执行

手动 Task 使用 tool.manual_attempt 的事件次数；状态只使用 tool.manual_result 的 run_status: completed、failed、outcome_unknown。不得把其 completed 当作业务成功。

自动事件 tool.auto_daily 的 cumulative_total 是累计数，不是单次增量。每个 distinct_id + tool_type + tool_id + utc_day + metric_type 先取最大 snapshot_version 的值，再汇总：

\`\`\`sql
SELECT tool_type,metric_type,sum(latest_total) AS total
FROM (
  SELECT distinct_id,properties.tool_type AS tool_type,
    properties.tool_id AS tool,properties.utc_day AS utc_day,
    properties.metric_type AS metric_type,
    argMax(toInt64(properties.cumulative_total),
      toInt64(properties.snapshot_version)) AS latest_total
  FROM events
  WHERE event='tool.auto_daily' AND timestamp>=now()-INTERVAL 35 DAY
  GROUP BY distinct_id,tool_type,tool,utc_day,metric_type
)
GROUP BY tool_type,metric_type
\`\`\`

上述示例均 NOT_DEPLOYED。PostHog 实际需要校验字段访问与强制类型转换。数据缺口和权限缺失不得以 0 代替。

## Insights C — 排行与日/周/月趋势

将 tool.opened、tool.engaged、tool.manual_attempt、手动完成、手动失败，以及从 Insight B 按最新版本取值的自动完成、自动失败、自动未知分别展示。时间分桶：手动事件 timestamp；自动事件 utc_day。工具身份：Sidebar 可以跨安装排行；自定义 Page/Task 按类型或单安装内匿名 ID 排行，不能虚构跨安装同一工具排行。

## Insights D — 最新已知安装状态、权限与新鲜度

每个 distinct_id 仅取最新的 app.inventory 和 app.inventory_types。后者包含 inventory_types 中各类安装/启用/停用/阻断/未知计数，以及 inventory_items 中最多 96 个匿名工具身份和状态，超出部分 inventory_overflow。最后一次观测时间超过 24 小时示例阈值时标记 STALE。读取失败标记 READ_FAILED，不冒充零安装。Scheduler Schedule Definition、Workflow 和 App Service 不得作为独立安装工具重复计数。

\`\`\`sql
SELECT distinct_id,max(timestamp) AS last_reported,
  argMax(properties.inventory_read_state,timestamp) AS latest_state,
  argMax(properties.inventory_types,timestamp) AS latest_types,
  argMax(properties.inventory_items,timestamp) AS latest_items,
  argMax(properties.inventory_overflow,timestamp) AS latest_overflow,
  argMax(properties.projection_gap,timestamp) AS latest_gap
FROM events
WHERE event='app.inventory_types'
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

仍需 Workflow/Reading TOC/AdBlock/手动 Page 的可信业务效果接入、Chrome 138–142 多版本真实验证、真实 macOS Chrome 安装及权限撤销、Cloudflare D1 与 PostHog 开发环境对账、原定 28 项业务矩阵，以及隐私合规独立审核。

Chrome Web Store 2026-07-01 公告 / 2026-08-01 执行政策：
https://developer.chrome.com/blog/cws-policy-updates-2026

没有审查结论与开发云端证据，不得启用正式 Analytics 生产接收地址。
