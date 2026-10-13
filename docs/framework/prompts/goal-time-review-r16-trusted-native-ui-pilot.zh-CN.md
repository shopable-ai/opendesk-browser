# GOAL：OpenDesk Browser Time Review R1.6 — TRUSTED NATIVE UI PILOT

## 仅将确切批准的第一方 Time Review UI 迁入现有可信 Side Panel；用户与 AI 动态工具继续隔离

日期：2026-10-13。默认中文。

仓库：https://github.com/shopable-ai/opendesk-browser

Mac 本地目录：`/Users/shopme/Documents/workspace/opendesk-browser`

**唯一允许写入、提交及推送分支：`main`。**

执行模式：**IMPLEMENTATION FIRST / PRODUCT FIRST / TRUST-BOUNDARY FIRST / NO DUPLICATE RUNTIME / REAL EVIDENCE REQUIRED / CONTINUOUS EXECUTION**。

## 一、最高优先级目标

**直接修改真实源码**：完成 OpenDesk Browser 第一方 Time Review 工具从「一律在动态 sandbox iframe 展示」向「只对已随当前扩展静态编译、经准入核验的第一方 UI 在可信 Side Panel 原位渲染」迁移。Time Review 是**唯一试点**，不能连带迁移所有官方应用。

用户安装且明确授予网站范围和 Chrome idle 后，点击一次「开始记录」即可启用后台时间统计；暂停、恢复、查看六分类、24h Canvas V3、站点排行、历史日与 JSON/CSV 导出都在同一个简洁工具界面完成。用户关闭 Side Panel、Chrome 正常重启仍按可信后台授权持续计时，不以 UI 是否打开作为计时前提。默认本地、不登录、不上传。

**保留用户/AI/第三方动态工具的现有 opaque-origin iframe 和唯一 SDK/Host；绝不把动态工具包 JS/HTML 放进可信扩展页面直接运行。** 不能把「原生 UI」理解成全站删 iframe。

本轮不是重新比较 3 套架构、另建 Tool Host / 安装器 / Registry / Authority / SDK，不制作 HTML 假原型，不以写文档替代程序交付。

## 二、必须先读取的既有决策与进度

1. `AGENTS.md`、`docs/framework/parallel-development.md`、`docs/framework/testing-guide.md`。
2. **权威设计：** `docs/architecture/browser-framework/custom-tool-ui-and-local-development.zh-CN.md` 的 R1.6 可信 UI 分类；`docs/architecture/sidebar-design-system-r20.zh-CN.md` R31 补充；`docs/architecture/ui-layout-conventions-r27.zh-CN.md`。
3. **工作流：** `docs/framework/workstreams/time-review-r15.md`，尤其最后的 R1.6 迁移交接与旧的失败、部分通过、未测证据。
4. **已有源码：** `src/ui/tool.html`、`src/ui/tool-shell.js`、`src/ui/sidebar-tools.js`、`src/ui/sidebar-tools-loader.js`、`src/entrypoints/sidebar-tool-host.js`、`src/sidebar-tools/bridge.js`、`src/ui/sidebar-tools/{installation,package,lifecycle}.js`、`src/sidebar-tools/official-catalog.js`、`src/time-review/{service,model,policy,host-controls}.js`、`examples/sidebar-tools/time-review/src/*`、`examples/sidebar-tools/time-review/tool.config.json`、`manifest.json` 和 WXT 固定入口/预算脚本。
5. Time Review 专项 Node 与 `tests/framework/time-review-r13-native.test.mjs`、现有 macOS GitHub Actions 工作流。

先核查**最新 main** 和已有并行成果，版本至少包含此前 R1.5.2 的设计方向，但不得因历史摘要推断当前 SHA/CI 结果。若仅能访问 GitHub，不声称检查了用户个人 Mac 的 `git status` 或 Chrome。

## 三、P0 · 先做最小可行性检验，再直接实施

- 验证当前 WXT IIFE、自包含固定资源、`ui/tool-shell.js` 512 KiB 上限、MV3 CSP 与生产/开发正式校验，判断新增静态 Time Review 组件可否放到**现有可信 Side Panel/独立 sidebar-tool-host 固定入口**。不放宽体积阈值、不关闭 IIFE 校验、不使用运行时任意 import/eval/new Function/CDN。
- 明确**唯一可执行 Time Review UI 源码**和其静态编译入口，可复用现有源码或一次性迁移，但最终不能长期维护两套业务前端。不得破坏官方目录、独立安装、升级、卸载和动态工具可离线安装合同。
- 对动态安装包给出 fail-closed 信任分流：仅扩展内置、编译期登记并审核的 Time Review UI 可进入可信页面；同时核对已有官方 catalog/固定包规范化 SHA、版本、来源、安装身份、启用与撤权代际。仅 `id=time-review`、`time.review`、标题、任意包 hash 或同名离线导入**绝不够**。
- 安装的是未知来源/改写包/版本不匹配时不运行该包 JS 于可信页；可以继续既有隔离工具路径或明确拒绝，但不能隐式提升信任。已开始操作中更新/停用/撤权要及时拒绝旧实例并保护历史数据。
- 不重新创建 Browser SDK、Tool RPC、授权存储、Service Worker。可信原生组件使用现有经身份校验的 Host 入口；后台 `time.review/1.5.0`、`opendesk.time-review.v1` 和时间采样语义保持不变。

**实施阻塞边界：** 如果必须复制新的 Time Review 业务运行时、双维护 UI、增加 Chrome 高权限、放宽 WXT/CSP/体积或直接执行安装包任意 JS 才能去 iframe，则停止危险重构，保留现有 iframe 并明确说明首个不可行事实。其余独立修复继续，不要假完成。

## 四、P0 · 真实用户体验与权限

保持现有 Side Panel 工具标题、设置和卸载操作；只对确切可信 Time Review 渲染静态界面，不绘制第二层标题、大容器边框或第二滚动条；使用 `src/ui/design-tokens.css` 与 `od-*` 公共组件。JS 用模块闭包防变量冲突，样式可按需局部作用域/Shadow DOM，但不能把这些当成恶意代码沙箱。

首次：安装不是采集授权 → 用户单独同意精确 HTTP(S) Origin 或明确选择全部普通网站 → 必要时由真实可信点击请求 Chrome idle → 点击一次可信「开始记录」→ 展示运行状态与今日数据。已有网站/idle 授权仍有效时，**一次真实点击直接开始或恢复，不再二次弹出「确认开始」**；只有权限失效、范围扩大、重新安装/不兼容升级或危险数据操作时重新审阅。

保留随时暂停/恢复、未授权原因、Chrome 失焦/idle 原因、六分类编辑、Canvas V3、历史日、站点排行与 JSON/CSV。关闭 Side Panel、Worker 休眠和 Chrome 正常重启不暗中取消有效计时；未知长断档保守排除，不能伪造真实注意力。网站拦截/限制完全属于 Stay Focus，不能混入。

## 五、P0 · 安全、生命周期与回归必须过关

至少覆盖：

- 伪造 ID/标题/官方描述/包来源，同名第三方或 AI 工具、包改写后仅可走 sandbox 或拒绝；永远不能提权、读取其他工具存储或绕过 Browser SDK。
- `manifest.json` 扩展级 `<all_urls>` 不能成为 Time Review 的独立站点同意；未安装/未授权/停用/撤单站点/撤全部站点/卸载不能继续统计。
- Chrome idle 权限撤回、用户切换网站、旧 UI 实例、慢速写、已安装包更新、用户撤回 permission/Chrome 重启，均正确结算已观察的时间，不补算未知时段。
- 更新与卸载复用**一个** `installation.js` 与 epoch，历史数据不因 UI 移动被清空，明确卸载按正式清理事务执行；不因安装 Stay Focus、Cookie Editor 等工具意外停止 Time Review。
- 用户/AI 动态工具仍可离线安装并通过既有 sandbox 调用被授予的 SDK；不破坏 Reading TOC、Knowledge Inbox、Scheduled Tasks、Stay Focus、Cookie Editor 现有产品。

## 六、测试、构建与真实 Chrome

按 `testing-guide.md` 做影响分析，先复用输入身份不变的历史 PASS，不重跑无关大测试；执行受影响的 Time Review Node 专项、`tests/environment/sidebar-tools-host.test.mjs` 和共享入口安全回归。

正式工具包和扩展：
```bash
npm run build:sidebar-tool -- examples/sidebar-tools/time-review
npm run check
npm run build
npm run build:dev
npm run verify
```

在**已有** macOS Chrome 测试驱动中补真正原生验收（不创建第二驱动、第二 Profile 默认入口）：从 Side Panel 安装 → 首次可信授权 → **一次点击开始** → 关闭 Side Panel 后后台统计 → 前台/失焦/idle 与精确网站撤权 → 恢复 → 更新 → 卸载 → 重新安装不复活旧授权。验证动态同名包仍隔离/拒绝，不出现直接 `chrome.*` 权限泄漏。验证 320、360、400、600 CSS px 及真实 Chrome 200% 缩放、焦点、长域名、空状态、滚动与真实可访问名称。

同候选保存：Git SHA、源码输入、正式工具包 SHA-256、Production/Development 身份、`sw.js` 字节及 SHA、Chrome 版本和真实测试环境、原始日志、截图与失败；CI Mac 不能冒充用户个人 Mac。包成功 ≠ Chrome 成功。不得以复用旧 1.5.2 UI 截图声称新候选 95+。

## 七、保存与提交

只在 `main` 安全修改、提交和推送；提交前复核目标原始 Blob/最新 HEAD，避免覆盖其他 Agent，禁止新分支、Worktree、PR、强推、reset --hard、clean。不要改写其他 Agent 的工作流文件或旧证据。

必要时更新现有：
- `docs/architecture/browser-framework/custom-tool-ui-and-local-development.zh-CN.md`（若实施与目标合同有经验证差异）；
- `docs/architecture/sidebar-design-system-r20.zh-CN.md`（只更新实际 UI 差异）；
- `docs/framework/workstreams/time-review-r15.md`、`examples/sidebar-tools/time-review/README.zh-CN.md` 和 LEGACY 文档。

最终报告必须先用中文回答：当前 Time Review 是否真的已不使用 iframe？哪些动态工具仍有 iframe？官方身份怎样防止同名伪造？用户如何安装、开始、暂停、恢复和卸载？离线、旧数据、云同步怎样？本轮源码文件、commit SHA、CI 链接、工具包/构建哈希、真实 Chrome 测试场景、未完成阻塞、八维专家实证分数是什么？

**评分目标：** 功能、权限安全、UI/UX、性能预算、后台计时真实性、持久化恢复、独立升级卸载、证据可信度八项各 ≥95/100；没有同候选真实证据标 `NOT_SCORED` 或 `NOT_TESTED`，云同步无真实生产后端继续 `LOCAL_ONLY / NO_UPLOAD / BLOCKED`。不要在未实现前宣称产品完成。

**当前任务是直接实施，不要只提交新 GOAL。**
