# OpenDesk Analytics R1.1 — 管理员最小使用统计

> 范围：已明确同意统计、配置真实 HTTPS 接收地址的 OpenDesk 安装实例。**不等于真人、不等于 Chrome Web Store 总安装数。**
> 部署状态：仓库默认 `ANALYTICS_INGEST_URL=''`，没有生产上报；完成开发测试不意味着生产 PostHog 有数据。

## 产品口径（只看三类主动使用）

| 问题 | PostHog 事件及统计方法 | 排除 |
|---|---|---|
| 平台打开次数 | `app.opened` 的事件总数 | Service Worker 唤醒、React 渲染、重复加载相同 hostInstanceId |
| 工具打开次数 | `tool.opened` 的事件总数，按 `tool_id` 分组 | 预览、停用/未安装工具、同一工具已打开时重复点击 |
| 不打开工具界面的主动使用 | `tool.engaged` 总数，按 `tool_id` 分组 | 网页自动注入、失败、浏览/刷新 |
| 平台 DAU / WAU / MAU | 时间窗内 `app.opened OR tool.opened OR tool.engaged` 的 **唯一 `distinct_id`**，分别按本地日 / 最近 7 / 最近 30 天 | `app.inventory`、工具安装/卸载、仅启用统计 |
| 工具活跃安装数、排行 | 同一时间窗内 `tool.opened OR tool.engaged`，按 `tool_id` 分组，对 `distinct_id` 去重 | 不把打开次数当作活跃安装数 |
| 工具当前已知安装覆盖 | 取每个 `distinct_id` **最新的** `app.inventory` 事件的 `installed_tools`，对每个工具去重汇总 | 不从「安装事件总数」推算当前状态 |

每个事件的 `distinct_id` 是参与统计安装实例的随机 UUID。多个工具 DAU **不能相加**得到平台 DAU。仪表板日期按 PostHog 项目的时区解释，并注明筛选时间窗；示例使用 30 天滚动窗口，不把 WAU、MAU 当作互斥人群。

## 已覆盖的真实入口

- **平台**：可信 ToolShell 通过 Chrome `runtime.getContexts` 验证为实际 Side Panel 后报告一次 `app.opened`。重复加载同一 `hostInstanceId` 被持久化去重。已打开的 Side Panel 仅隐藏后再显示、浏览器其它非面板入口，当前无法可靠分辨新的用户打开；不能声称完整捕获所有平台打开。
- **工具**：已有通用 `openTool` 成功通过安装和启停检查并主动挂载后上报 `tool.opened`；适用于通过该入口打开的所有已安装侧边栏工具，无需逐个开发。网页独立运行的工具和独立页程序不自动等于“打开过工具 UI”。
- **无需 UI 的主动使用**：目前**仅 Prompt Shortcuts** 的可信网页适配器经过 Host 核查后，成功插入或成功回退复制才产生 `tool.engaged`。第三方、油猴脚本、阅读目录等网页增强的其它动作**尚不在自动活跃采集范围内**。不会推断未能确认的使用量。
- **安装覆盖**：现有可信 `SIDEBAR_TOOL_STORE` 中的侧边栏工具完整清单（最多 12 个）。首次同意统计会报告既有安装；安装/卸载更新会报告新快照；同清单不重发。网页 Program/其他注册表不在这一份清单，勿称为“全平台所有类别插件安装数”。
- 每个快照只有按字母排序的合法工具 ID 数组，不含标题、HTML、代码、URL、Cookie、提示词或其它业务数据。它不是活跃事件。

## 在 PostHog 配置管理员图表（不要把三条曲线的 UV 相加）

使用 Insights 的 SQL/HogQL（或等价的唯一用户指标）保存到**管理员限定访问**的 Dashboard：

**平台每日 DAU，最近 30 天**

```sql
SELECT toDate(timestamp) AS day, uniqExact(distinct_id) AS active_installations
FROM events
WHERE event IN ('app.opened', 'tool.opened', 'tool.engaged')
  AND timestamp >= now() - INTERVAL 30 DAY
GROUP BY day
ORDER BY day
```

**工具 30 天打开次数 / 活跃安装实例（两种口径应分别展示）**

```sql
SELECT properties.tool_id AS tool, count() AS opens
FROM events
WHERE event = 'tool.opened' AND timestamp >= now() - INTERVAL 30 DAY
GROUP BY tool ORDER BY opens DESC
```

```sql
SELECT properties.tool_id AS tool, uniqExact(distinct_id) AS active_installations
FROM events
WHERE event IN ('tool.opened','tool.engaged')
  AND timestamp >= now() - INTERVAL 30 DAY
GROUP BY tool ORDER BY active_installations DESC
```

**最近有清单报告的安装实例，其最新已知安装覆盖**（30 天；如项目的 HogQL 版本对数组展开语法不同，使用等价 SQL 或保存查询调整；未核实生产实例前标记 NOT_TESTED）：

```sql
SELECT tool, count() AS reported_installations
FROM (
  SELECT arrayJoin(installed) AS tool
  FROM (
    SELECT distinct_id, argMax(properties.installed_tools, timestamp) AS installed
    FROM events
    WHERE event = 'app.inventory' AND timestamp >= now() - INTERVAL 30 DAY
    GROUP BY distinct_id
  )
)
GROUP BY tool ORDER BY reported_installations DESC
```

WAU、MAU 将首条活跃过滤分别改为 `now() - INTERVAL 7 DAY` 和 `30 DAY`，直接对整个窗口内 `distinct_id` 去重。7/30 天趋势用日分桶的 DAU 曲线；为避免误导，缺少足够观测日时仅展示实际可用天数。

## 从代码到真实管理员数据的验收门槛

1. 配置开发/生产独立的 Cloudflare Worker、D1、PostHog 项目、隐私告知、Worker secrets、允许的 HTTPS 域名。生产 PostHog Token 不得进入浏览器包。关闭 PostHog 自动捕获、个人资料和录屏。
2. 将**经验证的正式 HTTPS /v1/events** 配进正式构建；由真实用户明确 opt-in。验证 `/health`、真实用户打开→D1 `event_id`→PostHog 原始事件→Dashboard 读数。
3. 测试两个工具分别打开、同一安装实例一天重复打开、断网重发相同 eventId、同意前零事件、撤回同意后不再上传、首次既有工具全量快照及卸载后的更新。
4. 仓库里的 Node HTTP + SQLite 测试只证明开发环境通路，**不证明正式 Chrome、Cloudflare 部署、PostHog 控制台或线上 DAU 已通过**。

已发生的云端上报历史不因本地关闭而自动在 PostHog/D1 删除；依实际隐私政策应提供管理员删除流程。快照可能因长时间断网、历史未上报、撤回授权而过时，应称“最近报告的最新已知状态”，不得宣传为实时全量安装量。
