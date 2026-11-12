# OD-COOKIE-EDITOR-NAVIGATION-EXPORT-STABILITY-R2 · 差量开发与验收记录

> 状态：`SOURCE_COMMITTED / R2_NODE_PASS_53 / CANDIDATE_BUILD_VERIFIED / CI_PARTIAL_FAIL / NATIVE_NOT_TESTED / NOT_RELEASED`  
> 本记录只声明实际可核对的远端源码、工作流及连接结果；不将 HTML 预览视为正式 Chrome 验收。
> 本任务唯一开发分支为 `main`，不创建临时开发分支，不覆盖其他任务修改。

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
