# Time Review R1.2 · 源码对齐原型与数据边界

> 2026-10-11。本目录是**纯 HTML 原型**，不是已安装工具，也不是 Chrome 原生验收证据。离线打开不进行网络请求、授权、读取浏览器记录或更改 Chrome 设置。

## 预览文件

- [初始界面原型](time-review-r12-preview.html)：保留先前的 R1.2 演示快照（记录中 / 暂停 / 未连接、简化时间统计、常用入口、设置页）。
- [源码对齐优化版](time-review-r12-source-aligned.html)：本轮在旧版数据证据基础上重新组织。**后续设计以此版本为基线**。记录与同步分别展示，专注规则独立，未经实现的统计值默认展示 `—`；可主动查看标注为模拟的数值。

两份 HTML 仅使用静态 CSS/JS，脚本运行范围只在预览页面自身；全部交互为模拟，没有后端和插件通信。不要将其直接登记进官方 Catalog 或当作用户数据。

## 旧版事实与新界面的映射

| 旧源码 / 数据 | 源码中可核实的行为 | 建议 UI 呈现 | 实装边界 |
| --- | --- | --- | --- |
| `TimeReview.ts` / `ActionItem` | `path`、`title`、`action`、`timestamp`、`duration`、`createTime`、`app`，可选 `userId/ext` | 后台记录服务，侧栏只读状态、简要汇总 | 旧代码未等同迁移 |
| `detect_focus.js` | 事件 `focus/click/keydown/mousemove`，250ms 合并发送 | 不展示每次鼠标事件，避免干扰 | 必须重新审视 MV3 后台与最小采集 |
| `TimeReview.initData` | 需要 `token` 或 `apikey`；`GET /app/todo/action/config` 获得 `index/precision` | 账号连接状态与用户手动启停 | 旧 Token 不得从网页/沙箱明文泄露 |
| `TimeReview.httpSend` | `POST /app/todo/action/add`；`validate` 请求 `GET /app/common/apikey/validate` | 最近成功上传 / 失败状态 / 需核对待发队列 | 旧代码没有可靠“队列计数”和可证明回执的 UI 接口 |
| `localStorage.action` | 单条未发送动作缓存，恢复时尝试重发 | 与记录控制区分的“同步状态” | 需要持久队列、幂等 ID 与结果核对 |
| `my-content-script.ts` | `blackList`、`focusState`、`getRedirectUrl` 与限制提醒 | 单独“专注管理”设置 | **不是**时间记录的开关 |
| `background.ts` | `minuMax`、`duration_YYYY-MM-DD`、定时器、剩余额度和通知 | “每日额度与规则”入口 | MV3 生命周期、时区、跨日和恢复需重新实现 |
| 旧路由 | `#/todo/time-review`、`#/todo/time-review-config`、`/todo/focus` | “完整时间报告 / 原有高级设置 / 专注规则”入口 | 确认具体发行网站或扩展 URL 后才能真正跳转 |

## 原始证据文件

- [TimeReview.ts](../../docs/contracts/source-snapshots/todo-src-bex/src-bex/TimeReview.ts)
- [background.ts](../../docs/contracts/source-snapshots/todo-src-bex/src-bex/background.ts)
- [detect_focus.js](../../docs/contracts/source-snapshots/todo-src-bex/src-bex/assets/js/detect_focus.js)
- [my-content-script.ts](../../docs/contracts/source-snapshots/todo-src-bex/src-bex/my-content-script.ts)
- [原 manifest.json](../../docs/contracts/source-snapshots/todo-src-bex/src-bex/manifest.json)
- [当前 Side Panel 工具开发合同](../../docs/api/sidebar-tool-development.zh-CN.md)

## 明确没有证明已实现的功能

- 原代码没有提供当前可调用的时间统计**读取**合同或跨端汇总数据接口。原型数字默认 `—`，模拟值不能作为真实记录。
- 单条 `localStorage.action` 缓存不等于安全、可核对的上传队列。网络断开仍可产生浏览事件，但不得据此声称待同步条数或成功上传。
- 旧版 `filterQueryURL` 可能保留搜索词和敏感参数；新版本默认应采用可审计的 URL 最小化与敏感域名排除机制。
- 旧版专注计时采用常驻 `setInterval`，不能直接复制为 MV3 Service Worker 的可持久定时器。
- 旧版浏览器权限、所有页面注入及外部脚本路径均不可直接照搬；必须复用当前 OpenDesk 受信宿主 / Side Panel 工具机制并单独测试授权边界。
- `focusState` 是专注限制开关；独立“记录浏览活动”开关属于**新设计**，需要真实受信后台实现，当前仅在预览中模拟。

## 后续实施建议（未实施）

- [ ] 设计明确的 `recording.enabled` 用户选择、连接状态与专注状态三套状态合同，缺失时按“未启用/未知”显示。
- [ ] 在已存在的可信 MV3 后台承接追踪、活动归并、空闲与恢复，不将后台计时托付给 Side Panel iframe。
- [ ] 审查每条上传记录的隐私字段，建立持久队列、去重/幂等回执与跨日时区测试。
- [ ] 只在已有聚合接口经过核实时显示“今日浏览时长 / 访问站点数”。否则呈现 `—` 和完整报告入口。
- [ ] 将实际 UI 工具按官方目录、权限、升级与卸载合同安装；不要仅为了预览改动 `official-tools/catalog.json`。
- [ ] 完成 360/400/600px 与 200% 缩放、Mac Chrome 原生安装、后台暂停/重启、网络中断、撤权等独立验收。

## 自检与版本边界

- 本轮只提交 HTML 和 README，不更改 `src/`、`official-tools/catalog.json`、测试账本或运行时入口。
- 原型主要交互：四种演示场景、记录启停模拟、独立专注开关、设置导航、模拟统计切换、快捷入口说明和返回我的工具。
- 不能将静态原型评分转换为实际工具完成度；必须单独记录真实实现、组件测试和 Mac Chrome 验收。