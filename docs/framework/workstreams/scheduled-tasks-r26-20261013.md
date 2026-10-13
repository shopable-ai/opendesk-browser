# Scheduled Tasks R2.6 · 生产 UX 收敛与验收边界

日期：2026-10-13。唯一可写分支：`main`。

## 产品范围与已实施变更

从最新 `main` 的 R2.5 表单、唯一原型及既有 Controller Task/Authority/RunHost/Alarms 开始增量修改；没有新增调度器、权限系统、数据库、全局 CSS token、正式 HTML 原型或兼容 Host。

| 用户入口 | 生产改动 | 实际代码 |
| --- | --- | --- |
| 我的 → 定时计划 | Back 位于标题左侧，顶部计划数量/可执行状态及近期执行，计划卡突出下次时间；长中文换行 | `src/ui/tool.html`、`src/ui/tool-shell.css`、`src/ui/scheduled-task-workbench.js` |
| 列表操作 | 暂停/恢复、编辑成为一级操作；删除移至可展开「更多操作」和二次确认；历史默认折叠、每次 20 条分页 | `scheduled-task-workbench.js` |
| 创建、编辑 | 分组、字段间距、时间字段 ARIA 错误、首个无效字段聚焦、两阶段保存 | `tool.html`、`tool-shell.css`、`scheduled-task-workbench.js` |
| 时区 | 新建用设备 IANA，编辑沿用保存值；搜索只筛选原生 select 候选，不直接改写时区；无搜索结果仍保留原值；确认时显式列出固定时区 | `scheduled-task-workbench.js` |
| 可见运行页 | 重复标题降权；优先真实 RunId/正在执行，等待类历史显示为「未运行」，UNKNOWN 等不误报成功 | `scheduled-task-workbench.js`、`tool-shell.css` |
| 唯一原型 | 继续维护 `examples/ui/scheduled-tasks-r2.5-preview.html`，同步 IANA 搜索、长任务名称和新建规则默认值；仍是无真实宿主的模拟交互 | 上述唯一 HTML |

不变约束：`saveSchedule` 仍由两阶段确认发起，`resolveInstalledTask` 验证 Manifest/Source Hash、Installation ID、Task Generation；编辑仍提供 Schedule Generation 乐观并发控制；Stop 仍由原当前 RunId 绑定原 `host.stop`；UNKNOWN 仍不可自动重放。

## 本轮提交

- `130dd44d` — 生产 HTML Header、计划汇总、时区搜索和错误关联。
- `01693a8a` — IANA 查询、固定时区保存确认及状态解释。
- `f4f794db` — 优先当前任务/下一次执行、删除层级和历史解释。
- `925b97ef` — R27/R20 局部样式与窄屏间距。
- `0827f221`、`83bf7271` — 唯一 R2.5 原型同步与行为一致性。
- `a7be3c7e`、`1cf1d890` — IANA 搜索、DST gap/fold、跨地区及安全合同单测。
- `eff2af9e`、`11c3ec1c` — WXT Chrome 原生尺寸、时区过滤、焦点与草稿回归测试驱动。
- `5bc0d76f`、`c5999c44` — 原有 zoom 工作流上增加定向单测、双构建和源码变动触发。
- `9327a450` — 定时计划列表与 RunHost 状态静态回归。

上述 SHA 是独立连续提交，GitHub 通过 `main` contents API 提交成功；并行更新可能使最新 `main` HEAD 晚于这些提交，不得拿旧 SHA 冒充新 HEAD。

## 实际证据及尚未验收的事项

- **SOURCE IMPLEMENTED**：GitHub `main` 实际文件已按上面路径修改，未创建 PR/分支。
- **STATIC CHECKED（有限）**：在 GitHub 读取最新版对应文件，独立执行 26 项源码字符串/正则合同核对，全数匹配；生产 JS 与原型内联脚本通过 V8 语法解析，生产 HTML ID 无重复。这不是 Node 测试通过，不是 DOM 计算结果或真实视觉验收。
- **CI QUEUED / NOT_TESTED**：R2.6 最新可追踪候选 `1cf1d890abe7a2f60d4bb8bb929926eab879b886` 的 [原生定时 UI 工作流 38377624368](https://github.com/shopable-ai/opendesk-browser/actions/runs/38377624368)，启动时仍处于 queued。其 Linux job 的 `npm run check`、`npm run build`、`npm run build:dev`、`npm run verify` 及 R25/R1/R27 定向测试结果都必须以日志为准。
- 现有 native zoom 测试使用实际 Chrome 已安装 WXT 包，`tabs.setZoom` 测 125/150/200%；**新增宽度 220/300/320/360/420/520px 仅是 Chrome TAB 内 CDP CSS viewport 模拟**，会在日志中记录 `getBoundingClientRect`、scrollWidth、点击区与草稿；它不能证明物理 Side Panel 宽度。
- 该工作流理应上传 `artifacts/r23-native-zoom-{linux|macos}/` 及 `native-zoom-report.json`、`runner-real-zoom-{125|150|200}.png`、`runner-css-viewport-{220|300|320|360|420|520}.png`、`runner-timezone-filter-320.png`。**这些是预期产物路径，并非已下载或已核实存在**；等待成功日志和包哈希核对才能引用为 PASS。
- **NOT_TESTED**：用户本机 `/Users/shopme/Documents/workspace/opendesk-browser` 工作区、macOS Chrome Profile、真实 Side Panel 的物理 220/300/320/360/420/520px、Chrome 100/125/150/200% 全状态组合、全量权限撤销场景、真实用户点击完成保存的端到端闭环。
- **NOT_SCORED**：10 项 95+ 专家评分需要真实 Chrome 当前候选截图、计算布局及交互证据，静态检查不能代替。

## 不可提升的证据等级

历史 R1/R2/R2.3 Chrome 成功属于**当时的输入 SHA / 安装包**。原型模拟、Node 组件、CI 预定输出、真实 Chrome TAB 内 CDP CSS 模拟、macOS CFT、用户实际 Mac Side Panel 六者不等价。失败必须保留原始日志，不能宣称完全 Final PASS。

推荐核验次序：候选 SHA → WXT 生产/开发构建哈希 → 测试日志 → Chrome 版本/Profile/PID → DOM/截图 SHA → 320/360/420px 表单视觉与 125–200% 缩放 → 独立用户 Mac Profile 回归。禁止强推、清理未提交数据或改写原 Run/Result。
