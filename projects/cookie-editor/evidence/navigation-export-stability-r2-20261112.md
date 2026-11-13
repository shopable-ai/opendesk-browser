# OD-COOKIE-EDITOR-NAVIGATION-EXPORT-STABILITY-R2 · 核心开发记录

> 2026-11-13 最新状态：`SOURCE_FIXED / TARGETED_NODE_PASS / BUILD_PASS / TOOL_2.0.79_INSTALLED / NATIVE_CORE_PENDING`。
> 当前阶段只完成导航、复制、下载及直接影响的安全保护。完整 CI、95 分评分和全量正式验收继续延期。以下最新段落优先于文末历史记录。

## 当前修复与已证实根因

真实 CFT 155 现场的原始 `E_COOKIE_READ` 已定位为 Host 的请求频率限制（120 次/分钟），不是未经证实的超时。旧自动读取每两秒执行多次 SDK RPC；Chromium 的 History API 还实际发出 `status:loading + url`，被误判为整页替换并进入绕过导航合并的 `load()`。诊断只记录固定错误码及阶段，不保存原始错误、完整 URL 或 Cookie 内容。

- 业务读取共用八秒自动读取预算，合并连续导航，保留脱敏行；核验期间敏感动作继续禁用。明确的旧 Host 限流错误转换为 `E_RATE_LIMIT`，只对读取等待六十秒后重新核验，不重放写入、复制或下载。取消、卸载和撤权会终止等待。
- Host 对准确同 Tab/Window 的短暂 unresolved 状态发送独立 `cookie-page-pending`；沙箱消息还核对工具 ID 与实例。该状态只保留脱敏显示，不是有效目标或授权。真实 `onBeforeNavigate`、文档/Origin/权限变化仍立即失效。恢复后完整核对目标、授权、Store/Partition 与新旧响应所有权。
- 读取前后 unresolved 共用有界恢复窗口；成功恢复清除旧限流提示与诊断。导航立即擦除敏感 DOM，旧编辑/导入/导出计划失效。
- 导出绑定精确 Document、一次可信点击及持久安装/授权状态；native sink 紧邻位置重新核对。sink 后范围变化仍报告结果未知，不能误报成功或自动重试。Controller 的原严格 URL 核验合同保留。

## 当前产物与环境

唯一正式工具包：`projects/cookie-editor/cookie-editor.opendesk-tool.json`，版本 **2.0.79**，397872 bytes，规范 SHA-256 `675fa008623615f3ad673d56758067e8e5244c434a2cce5b66ae6f04e9c20881`。原打包器 candidate → 定向检查 → promote-from → check-project 通过；通过扩展中心正常更新，真实更新审阅显示权限未变化并核对同一 SHA；标题已读回 v2.0.79。

固定 Host 使用独立源码快照构建，attempt `0c4fdd98-0c58-46cc-b2f1-c5687c0b9ef7`，package hash `5f749138021a7a143fab070fbb0b69f42581ccd570efaab5e913bb02a12ca2a7`。快照基于 `f41b40e0e25f24ed9a50dc95acac4c311560e0c2` 加本任务源码；只在快照内恢复并行 AI Proxy 的 HEAD 来源，未覆盖或重新 pin 主工作区修改。依赖也克隆进快照，保留原来源边界检查。构建共 131 文件；逐文件核对后发布到本任务原 `dist/production`。

本体预装工具为 2.0.77，随后正常导入更新为 2.0.79，不能称为同一冻结发行包的全矩阵验收。构建后并行 owner 又在 `src/ui/sidebar-tools.js` 加入了预装/用户脚本恢复 UI；这些后续段落不在本次运行快照中，Cookie 相关段落未变，提交时不能整体暂存该共享文件。测试扩展 ID `efhcmggbgamacpfhhmooelgdkepdcghh`、Profile 与加载路径保持原值；新 CFT PID98795。日常 `dist/development`、原生日常配对、并行 watcher 和其他 CFT 未变。测试只使用本机 fixture 的虚构 Cookie。

## 最小验证

| 证据 | 结果与边界 |
| --- | --- |
| `artifacts/cookie-editor-r2/final-navigation-core.log` | 169 PASS，导航/草稿/目标/Controller/账号回执；在最后清除恢复诊断的小改前执行 |
| `artifacts/cookie-editor-r2/final-read-budget.log` | 最后修订 8 PASS，含 20 路径合并、共享读取预算、限流恢复、unresolved 前后边界、取消与诊断清除 |
| `artifacts/cookie-editor-r2/transient-host-tests.log` | 12 PASS，实际 Host+Bridge pending 消息、实例限制、Document 与持久撤权竞态；未声称全 Host 套件通过 |
| `artifacts/cookie-editor-r2/final-package-tests.log` | 2.0.79 的 19 PASS，编译来源、唯一正式包与当前 React 源码合同 |
| `artifacts/cookie-editor-r2/final-snapshot-build.log` | 独立来源快照 production BUILD_PASS；主工作区构建曾被并行 AI Proxy 来源 pin 阻断，未放宽保护 |

## 原生核心操作当前状态

- 旧 2.0.73 / 2.0.74 / 2.0.75 的实际连续导航均失败；这些失败不被 Node PASS 覆盖。
- 2.0.79 更新与真实版本读回通过。测试浏览器重启后需要恢复 Cookie 授权；产品当前入口显示全站 Cookie 管理，用户已明确批准仅在该隔离测试 Profile 恢复权限；尚未实际点击授权，不在日常 Chrome 操作。
- 最新 20 次 SPA、标题/Query/Hash、虚构 Cookie 变化、真实复制与下载：**PENDING**，不得声明通过。
- 原始 `E_OUTCOME_UNKNOWN` 尚未在浏览器复现。安全竞态目前有定向 Node 证据，不冒称真实故障注入验收。

## 后续边界

测试授权已取得，后续只跑上述最短核心链。完整 CI、权限/Store/Partition 的正式浏览器矩阵、长时间压力、跨版本与独立评分继续 `NOT_TESTED / DEFERRED`。源码、构建、正式 JSON、已安装版本和当前运行行为分开报告。源对话的旧 goal 生命周期未同步，本对话没有暂停或完成它。

## 历史记录（2.0.69 阶段）

以下保留旧提交和 CI 链接供追溯；其 NOT_TESTED、评分、排队状态和旧待办只表示当时观察，不是本轮行动清单。

## 原始目标

1. 同网站内标题、Query、Hash、SPA Path 变化不应使 Side Panel 的脱敏 Cookie 列表先清空后重读；同一 Cookie 安全范围内保留已显示列表，真实变更同步更新，Store/Partition/Origin/Document/权限失效必须重新核验。
2. 复制、下载导出偶发 `E_OUTCOME_UNKNOWN` 不应错误提示成功或自动重复执行；保存当前会话最近 10 条不含 Cookie 内容的诊断，按钮附近展示简明错误，避免底部重复。

## 本轮实际提交

- `83619451061ae52c8dce27972586688762f43ee0`：标题/SPA 同文档导航分类；修复同步期间列表闪烁的执行路径；Cookie Store/Partition 核验；单次导出及脱敏诊断 UI；新增控制器与当前页导航测试。
- `abf9a21aab311f801ff81df550660ac3fe1f6291`：正式候选从 `2.0.68` 升至 `2.0.69`，满足“变更发行字节必须升版本”的现有构建门禁。
- `a7fad60fab0924761a0db8c6b2ebee78677f4aa2`：后台连续 SPA 路径变化时，仅对已排队且已失效的 `E_DOCUMENT_CHANGED` 读取执行排队重核验；其他授权、Store、Partition 失效仍 fail closed；新增回归。

涉及核心文件：`src/ui/current-page-target.js`、`src/ui/sidebar-tools.js`、`src/sidebar-tools/bridge.js`、`src/ui/sidebar-tools/cookie-page-transition.js`、`projects/cookie-editor/app/controller/cookie-controller.js`、`app/CookieEditorApp.jsx`、`app/components/CookieExport.jsx`、`app.ci.json` 和两组测试。未新增私有越权浏览器接口。

## CI 的真实证据及限制

- [R4.9 React/Chromium（源提交 8361945）](https://github.com/shopable-ai/opendesk-browser/actions/runs/43219371805)：控制器回归 `64 PASS / 0 FAIL`；完整工作流 **FAIL**，被旧预览静态断言 `React.useState('serviceConnections')` 阻断。该预览断言和所引用的现行预览入口状态不一致；不是此次修改的组件代码。
- [R5.38 首轮（8361945）](https://github.com/shopable-ai/opendesk-browser/actions/runs/43219371765)：**FAIL**，由于源码改变而发行版本仍为 2.0.68，版本门禁按设计拒绝构建。
- [R2 专项回归（5fba6bc）](https://github.com/shopable-ai/opendesk-browser/actions/runs/43221800986)：CI 实际执行 `tests/environment/cookie-editor-navigation-export-r2.test.mjs` + `tests/environment/current-page-target.test.mjs`，**53 PASS / 0 FAIL / 0 SKIP**（Node 模拟与源码行为验证，不等于真实 Chrome）。随后受旧 R5.24 的源码格式匹配断言阻断完整工作流。
- [R5.38 版本更新轮（abf9a21）](https://github.com/shopable-ai/opendesk-browser/actions/runs/43220051969)：React 编译及候选构建步骤通过；R2.4 既有回归 `117 PASS / 0 FAIL`；后续 `cookie-editor-r524-grant.test.mjs` 的旧源码正则匹配有 `3 PASS / 2 FAIL`，涉及权限卡片隐藏式和扩展中心开关位置，导致后续任务跳过。**此工作流总体不是 PASS，也未自动提升正式包。**
- R5.24 的旧权限卡片/本地化开关正则已通过只改测试的 `4d070c83a0971ad6294b722146fdbcefca9ff888`、`547ae35615dba99abfce13fe0cbe546654f868ee` 调整；旧预览测试仅允许固定 `/__isolated-http/config` 无凭据配置请求，见 `8ff23141051e2471382f43390a7ddf9a2e030819`。本轮业务代码未因此更改。
- `5fba6bc3151af35bf639e0a237ae69bc16e1b4a3`：R2 专项测试已被加入 R5.38 候选工作流前置门禁。
- [最新 R5.38 候选测试工作流](https://github.com/shopable-ai/opendesk-browser/actions/runs/43222298908) 与 [最新 App CI](https://github.com/shopable-ai/opendesk-browser/actions/runs/43222298939)：本记录时仍 queued，**不声明全部通过**。
- [App CI（版本更新轮 abf9a21）](https://github.com/shopable-ai/opendesk-browser/actions/runs/43220052094) 和 [App CI（SPA 并发补修轮 a7fad60）](https://github.com/shopable-ai/opendesk-browser/actions/runs/43220852126)：截至早期记录 queued，随后已由独立 R5.38 前置步骤确认为 **53 PASS / 0 FAIL**；对应 App CI 全量状态仍需另行核验。
- [R4.9（SPA 补修轮 a7fad60）](https://github.com/shopable-ai/opendesk-browser/actions/runs/43220852196)：旧预览断言仍失败，不能用此前的 64 PASS 代替该轮的全部测试。

本机 Codex workspace 接入返回 `UNAVAILABLE: Connection failed`；OpenDesk Desktop Browser 接入返回 `MCP SSE probe 429`。**真实 Chrome 安装、源包一致性读回、实际装机版本、真人操作的 T1–T4 验收均为 `NOT_TESTED`**。未读取、复制或上传真实 Cookie；本轮测试代码使用虚构值。

## 验收矩阵（R2）

| 维度 | 代码路径 | 本轮验收 |
| --- | --- | --- |
| 标题 / URL 不变 | 相同 Document 下静默验证；不撤销导出 Intent | `NODE_PASS / CHROME_NOT_TESTED` |
| Query / Hash / SPA Path | 同文档 Path 差量同步；保留脱敏列表；排队与过期结果处理 | `NODE_PASS / CHROME_NOT_TESTED` |
| Store / Partition / Origin / Document | 新范围禁用敏感操作；不继承旧授权与原始值 | `NODE_PASS / CHROME_NOT_TESTED` |
| Chrome Cookie 权限撤销 | 旧数据应立即失效；原安全流程保留 | `NOT_TESTED` |
| 真实数据变化及 2 秒慢请求 | 保留列表并静默同步（已定位与代码接线） | `NOT_TESTED` |
| 复制/下载与真实导航竞态 | 单次 Intent；未知回执不报成功、不自动重放 | `SIMULATED_NODE_PASS / CHROME_NOT_TESTED` |
| 10 条诊断与脱敏复制 | 当前工具会话内存、固定字段，不记录 Cookie 值、URL 参数和明文错误 | `NODE_PASS / CHROME_NOT_TESTED` |
| Side Panel / PC / 窄屏 / 重开后权限 | 需在真实浏览器操作 | `NOT_TESTED` |

## 关键未完成项

1. R2 的 Node 专项已 53 PASS；还需等最新候选及 App CI 全部门禁执行，特别是共享 Host 与真实浏览器场景，并修复真正由本轮导致的失败。
2. 单独处理 R5.24 / R4.9 现行代码与旧静态测试不一致的问题；先确认测试契约，再小范围更新，不因追求绿色 CI 直接删除安全断言。
3. 对新候选执行 canonical source/package SHA 一致性检查；不得把源码提交冒充正式发行。
4. 接通获得授权的独立 Chrome，确定安装版本，用虚构 Cookie 实跑 20 次 SPA 导航、权限撤销、Store/Partition 切换、剪贴板未知结果与诊断脱敏。
5. 全部安全关键项通过后才可走正式包推广与安装回执流程；之前 `NOT_RELEASED`。

## 初步专家视角复核（非实测评分）

此处只用于定位风险，并非五名外部专家实测或发布资格：UI/UX 88、React 状态 90、Chrome MV3/Host 86、Cookie 安全 91、自动化可靠性 80；算术平均值 **87/100**。主要扣分来自最新 R2 用例未执行、旧断言阻断 CI 和真实 Chrome 缺失，**未达到 95/100 及安全关键验收全 PASS 的发布目标**。
