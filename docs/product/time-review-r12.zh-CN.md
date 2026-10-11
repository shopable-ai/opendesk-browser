# Time Review R1.3 真实数据集成（延续 R1.2）

正式视觉基准：prototypes/time-review-r12/time-review-r12-canvas-v3-single-track.html。继续使用单行 00:00—24:00 Canvas、四象限、生活、未分类，不复制静态原型的模拟数据或宿主浏览器外壳。

## 原有能力不变

time.review 使用 MV3 可信后台和现有安装器，保留开始/暂停/恢复、域名/日期毫秒汇总、30 秒心跳、45 秒保守上限、失焦/空闲/跨会话排除、七天排行、排除域名、保留期限和 JSON/CSV 导出。无新的采集器、RPC、Native 权限或远程上传。

## 新增能力

- categories：用户主动选择域名类别，默认 0 未分类；1 工作/生产、2 阅读学习、3 聊天/新闻、4 娱乐、5 生活。重要时间 = 1 + 2；只有全部时长已分类时才显示生产率百分比。
- minuteConsent：默认关闭。用户明确开启后才从未来可信结算区间保存分钟/域名/毫秒数据；关闭即清除已有分钟数据，不补造旧日汇总的时间线。
- minuteDays：每天 1440 分钟索引在普通 24 小时本地日期使用；时区/DST 不适用日期隐藏明细并保留日汇总。每日最多 2000 行、最多保留 90 天。多域名占同一分钟以毫秒占比最高类别作为色带代表色，详情标记多个网站。
- time.classify、time.day、time.minuteConsent 共用已有固定 time.review 服务、包 SHA、安装代际和可信 sender/document 身份校验。
- 新 UI：紧凑日概览、四象限、单条 Canvas、当前网站和网站分类修改、日期及近七天排行、设置与导出。

存储继续使用 opendesk.time-review.v1，旧记录向后兼容；新增字段不会修改原先日毫秒。继续不采集网页标题、URL 路径/查询参数、搜索词、Cookie 或 Token。

## 构建与验收

稳定工具 ID time-review、工具版本 1.3.0，capabilities 仍为 time.review + user.export；扩展可信后台变更意味着必须同时构建与更新扩展。旧工具包身份不能自动延续后台计时许可。工具包已构建并不等于真实安装。真实 Mac Chrome、导出实际落盘、权限、重启、200% 和 320/360/400/600px 视口必须由当前候选证据确认，未测试记为 NOT_TESTED。

工具说明：examples/sidebar-tools/time-review/README.zh-CN.md。
历史工作记录：docs/framework/workstreams/time-review-r12-01a12b0d.md。
本轮工作记录：docs/framework/workstreams/time-review-r13.md。
