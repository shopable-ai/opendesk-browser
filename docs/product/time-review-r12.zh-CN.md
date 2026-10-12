# Time Review R1.2

可选官方 Side Panel 工具，使用既有官方目录和安装器。今日、七天、网站排行、暂停恢复、域名排除、空闲阈值、保留期限、本机 JSON/CSV 导出及确认清空均由已安装工具操作。详情设置单独申请 Chrome 空闲检测权限；安装和授权本身不启动追踪。

后台是独立的 MV3 固定模块 `time-review/time-review-host.js`，以 Chrome alarms 和真实 tabs/windows/idle/permissions 事件结算，仅存域名、日期和毫秒。不存在页面活动遥测、账号、旧登录、远程配置、HTTP 上传或旧 `hid_*` 消息入口。工具关闭后已开启的后台继续；停用、撤权、包身份变化和卸载保守停止。

旧源码复用活动汇总、暂停和跨日拆分意图。旧版 minute-dominant 抽样、axios 全局配置、缓存网络补发、未销毁定时器和跨日错误未迁入。旧 `https://todo6.com/` 入口经本轮 HTTPS 200 与页面标题确认，只在工具详情操作区独立打开。没有推断或加入未经证实的线上 `/todo/time-review` 地址。

休眠、长延迟、时区变化和跨浏览器 session 的不确定间隔排除并显示；此版本不是无损全天活动监控。每 30 秒持久化、45 秒上限；真实 Browser API 和时钟证据与组件故障注入分别登记。

操作步骤与独立 UI 包更新见 [工具说明](../../examples/sidebar-tools/time-review/README.zh-CN.md)。真实安装、原生输入、下载落盘及恢复的当前状态，以 [本轮工作流](../framework/workstreams/time-review-r12-01a12b0d.md) 与绑定 packageHash 的原始证据为准。


## R5.1 受信任详情页内操作，无 JavaScript 确认弹窗（2026-10-11）

- 工具内“开始记录”“清空记录”只引导到详情设置，不直接执行持续追踪或删除数据。不能把工具沙箱生成的消息当作用户真实点击。
- 扩展受信任设置区提供“开始／恢复记录”（明确点击后直接执行，无网页模态框）和“清空时间统计…”（打开页面内可取消确认，不弹 `confirm()`）。
- 扩展后台仍检查 Time Review 安装身份、`time.review` 能力、工具启停、精确安装代际、唯一宿主文档、Chrome `idle` 授权和真实网站访问权限；缺失则拒绝。
- `chrome.permissions.request({permissions:['idle']})` 仍仅在用户明确点击“授权空闲检测”时调用；Chrome 原生权限对话框无法替代或自动跳过。
- 清空动作的 `{confirm:true}` 只能由受信任宿主的“确认清空全部记录”按钮产生，且发生写入前仍由后台再次核验。

---

## R1.3 六分类与真实分钟数据（2026-10-12）

正式视觉基准：prototypes/time-review-r12/time-review-r12-canvas-v3-single-track.html。继续使用单行 00:00—24:00 Canvas、四象限、生活、未分类，不复制静态原型的模拟数据或宿主浏览器外壳。

## 原有能力不变

time.review 使用 MV3 可信后台和现有安装器，保留开始/暂停/恢复、域名/日期毫秒汇总、30 秒心跳、45 秒保守上限、失焦/空闲/跨会话排除、七天排行、排除域名、保留期限和 JSON/CSV 导出。无新的采集器、RPC、Native 权限或远程上传。

## 新增能力

- categories：用户主动选择域名类别，默认 0 未分类；1 重要且紧急、2 重要不紧急、3 紧急不重要、4 不重要不紧急、5 生活。重要时间 = 1 + 2；只有全部时长已分类时才显示生产率百分比。
- minuteConsent：默认关闭。用户明确开启后才从未来可信结算区间保存分钟/域名/毫秒数据；关闭即清除已有分钟数据，不补造旧日汇总的时间线。
- minuteDays：每天 1440 分钟索引在普通 24 小时本地日期使用；时区/DST 不适用日期隐藏明细并保留日汇总。每日最多 2000 行、最多保留 90 天。多域名占同一分钟以毫秒占比最高类别作为色带代表色，详情标记多个网站。
- time.classify、time.day、time.minuteConsent 共用已有固定 time.review 服务、包 SHA、安装代际和可信 sender/document 身份校验。
- 新 UI：紧凑日概览、四象限、单条 Canvas、当前网站和网站分类修改、日期及近七天排行、设置与导出。

存储继续使用 opendesk.time-review.v1，旧记录向后兼容；新增字段不会修改原先日毫秒。继续不采集网页标题、URL 路径/查询参数、搜索词、Cookie 或 Token。

## 构建与验收

稳定工具 ID `time-review`；当前示例工具版本按 `examples/sidebar-tools/time-review/tool.config.json` 为准（2026-10-12 为 `1.3.1`），capabilities 仍为 `time.review` + `user.export`；扩展可信后台变更意味着必须同时构建与更新扩展。旧工具包身份不能自动延续后台计时许可。工具包已构建并不等于真实安装。真实 Mac Chrome、导出实际落盘、权限、重启、200% 和 320/360/400/600px 视口必须由当前候选证据确认，未测试记为 NOT_TESTED。

工具说明：examples/sidebar-tools/time-review/README.zh-CN.md。
历史工作记录：docs/framework/workstreams/time-review-r12-01a12b0d.md。
本轮工作记录：docs/framework/workstreams/time-review-r13.md。


R1.3 启用或删除分钟明细必须在已合并的 R5.1 受信任工具详情设置区由本人点击确认。沙箱本身只打开该设置入口，不能直接允许增加精细的活动采集；清空仍由详情内联确认执行。CSV 保持原有四列顺序，在尾部追加 category。

## R1.3.1 实际 Chrome 验收口径（2026-10-12）

- 当前 Time Review 为已安装的可选官方工具；`time-review` 是固定 ID，存储仍为 `opendesk.time-review.v1`。扩展受信任宿主设置负责空闲权限、开始/恢复、分钟授权与真正的清空确认；沙箱「开始」只会引导到受信任操作区。
- [Actions 38222319502](https://github.com/shopable-ai/opendesk-browser/actions/runs/38222319502)，绑定 `f4719da31a876fc4f82b6b0658176fd2693c4a26`：已在真正 Mac Chrome 155 里确认 JSON/CSV 规范文件名、包含有效网站时长的重复导出、同名 `(1)` 防覆盖、原生侧栏、暂停、真正 SW 恢复及暂停状态下整个 Chrome 进程的同 Profile 重启，所有该工作流子项 PASS。
- 后续原生六分类修改、工具启停/卸载以及真正 200% Chrome 缩放仍需按**各自最新候选**的证据判断，不把 Chromium DPR2 或旧候选通过当成完整最终验收。参见 [R1.3 工作流](../framework/workstreams/time-review-r13.md)。
