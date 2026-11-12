# OpenDesk 网页剪藏区域点选 R4 · 构建阻断差量修复及发布证据

- 任务 ID：`OD-WEB-MARKDOWN-CLIPPER-REGION-PICK-R4-LOCAL-RELEASE-ACCEPTANCE`
- 截止本记录：2026-11-12；**PARTIAL / RELEASE_BLOCKED / REAL_CHROME_NOT_TESTED**。
- 原始目标：在 ChatGPT/Claude/Gemini 的一条长回答上悬停高亮、单击一次提取该条当前已加载 DOM，自动得到 Markdown 并回填；复用复制、下载、我的摘录保存/关闭重开/搜索/全文读回。同 ID 原位升级，保留旧摘录及文章/选区/引用/链接四模式。
- 本记录只收集 R4 新增证据，不重复实现 R2/R3。R2/R3 历史证据见 `region-picker-r2-acceptance.zh-CN.md` 与 `region-picker-r3-acceptance.zh-CN.md`。

## 一、本轮 GitHub 实际修复

| 提交 SHA | 修改 | 源码审阅依据 | 当前验证 |
| --- | --- | --- | --- |
| `143fb1055b5281eea4fb0f778feb7cd62cc75598` | `scripts/bundle-provenance.mjs` + `tests/environment/bundle-provenance.test.mjs` | CI 失败 `agents/chatgpt-fixed-bridge.js` 引入已固定哈希的纯 WebFlow 协议解析器；只增加该固定 Content 目标的准入，原 SHA `50a7ec4...` 与其他世界拒绝条件不变 | 远端文件已读回；当轮 App CI 在随后构建步骤继续失败，不能称全构建 PASS |
| `c13070f68b49cc1b438d7a408dee785404051d71` | `tests/environment/four-tools-ux-r1.test.mjs` | 修正 `examples/...` 过期路径；为 Clipper 现有区域 Mock 补充无副作用的最小 DOM 夹具，替代原先 `document.createElement is not a function` | GitHub Preview CI 的四工具契约 **10/10 PASS**；其他预览/Headless Chrome 步骤失败 |
| `cfc6e232ac074be656a5af8bacacc30e6f351fd3` | `scripts/bundle-provenance.mjs` + `tests/environment/bundle-provenance.test.mjs` | 旧固定 `policy.js` 只允许文章/选区/链接；现代码新增 `clip.region`/取消。Page 新增一键点选/授权复核/清理；`region-picker.js` 为 DOM-only。按实读 Git Blob 分别锁定 `policy.js=9cb4b8af...`、`page.js=46bb1a7b...`、`region-picker.js=c2a7b9b1...`，只将区域 DOM 源准入既有 Page Relay | 远端代码和回归断言读回成功；完整 CI 构建结果仍待取得 |

三个修复均通过 GitHub `main` 上的提交和源码读回确认；未修改网页剪藏 `src` 业务代码、工具 ID、权限或存储。上述哈希缩写是 **Git Blob SHA-1**，不是可发布包 SHA256。

## 二、真实故障与 CI 回执

1. **R3 App CI**：`43063288849` / Job `130813313830`；构建在 `chatgpt-fixed-bridge` 报 `Historical/user/vendor code cannot enter a privileged fixed bundle: projects/webflow/src/task-intent-contract.js`，退出码 **1**。新提交 `143fb105` 已修改精确准入及正反测试。
2. **R4 修复后 App CI**：`43217950090` / Clipper Job `131182365436`；构建向后推进，在 `marketplace` 报 `Trusted Web Clipper source changed ... projects/web-markdown-clipper/trusted/policy.js`，退出码 **1**。新提交 `cfc6e232` 已在审阅后补齐三份 Clipper 固定来源锁及回归，但**当时尚无该提交的绿灯结果**。
3. **R4 Preview CI**：`43218322123` / Job `131183150836`，`tests/environment/four-tools-ux-r1.test.mjs` **10/10、0 failed**；同一 Job 的 Headless Chrome 后续失败：`Import replace confirm was not displayed`（涉及四工具交付测试，不可当作 Clipper 真实 Chrome 失败）。Job 最终退出码 **1**。
4. **独立预览新鲜度阻断**：同运行的 Job `131183150246` 报 `E_UI_PREVIEW_LOCK: stale preview input src/ui/design-tokens.css`，退出码 **1**；需由共享 React 预览源码/锁 owner 生成并审阅，不得仅替换哈希制造 PASS。
5. **跨工具来源差异**：`43217950312` / Job `131181881891`，公共来源测试报 `Trusted AI Proxy source changed; review and re-pin: projects/ai-proxy/src/Settings.tsx`，并存在其他旧示例路径断言失败。**未将其错误归因到 Clipper，也未为本任务改 AI Proxy 来源锁。**
6. 修复 `cfc6e232` 触发的 App CI Run `43219105290` 在本记录读取时仍为 **QUEUED / 部分任务未完成**；未把排队视为通过。

GitHub Actions 具体证据：
- https://github.com/shopable-ai/opendesk-browser/actions/runs/43063288849
- https://github.com/shopable-ai/opendesk-browser/actions/runs/43217950090
- https://github.com/shopable-ai/opendesk-browser/actions/runs/43218322123
- https://github.com/shopable-ai/opendesk-browser/actions/runs/43217950312
- https://github.com/shopable-ai/opendesk-browser/actions/runs/43219105290

## 三、门禁、发行和 Chrome 状态（不要混淆证据等级）

| 任务 | 截止状态 | 证据/限制 |
| --- | --- | --- |
| T01 本机工作区 | **BLOCKED** | CodexPro `UNAVAILABLE / Connection failed`；OpenDesk Mac96 `HTTP 429`；无法读取本机 HEAD/未提交修改。隔离环境 GitHub DNS 解析失败，不能冒充本机。 |
| T02 代码与 Host/Node/App CI | **PARTIAL** | 根因日志和三项最小修复已实际完成；Node 原生指令未在本机运行，GitHub 新提交 App CI 尚未取得 PASS。 |
| T03 React 同源预览 | **PARTIAL** | 现有四工具 SDK Mock 合同 10/10 PASS；源码锁失败，宽度/暗色/区域交互矩阵和真实安装尚无证据。 |
| T04 ChatGPT、Claude、Gemini | **NOT_TESTED** | 无网页真实点选、旧回执、撤权、流式及容量边界的 Host/Chrome 回执。 |
| T05 新版本与晋升 | **BLOCKED / NOT_DONE** | `tool.config.json` 与唯一正式包均为 `web-markdown-clipper@1.2.10`；未升版本、未创建验收候选、未执行 `--promote-from`、`--check-project`。**候选包 SHA256：N/A；正式新包 SHA256：N/A。** |
| T06 Chrome 同 ID 升级与存取闭环 | **BLOCKED / NOT_TESTED** | 未验证旧摘录保留、保存→关闭重开→搜索→全文读回哈希一致。不可用模拟 Mock/Headless Chromium 替代。 |

## 四、三项反方攻击与角色化静态评分

- 多轮混入：`region-picker.test.mjs` 已有目标容器隔离断言；**ChatGPT/Claude/Gemini 真实长对话仍 NOT_TESTED**。
- 取消/导航/撤权竞态：源码存在 session.cancel、授权 epoch 和页面销毁清理；**真实 Host 迟到回执/实际导航仍 NOT_TESTED**。
- Markdown 与字节容量：生产逻辑沿用转换器与存储限制；**150KB 提取、160KB 保存、复杂代码/表格/公式的真实字节验收仍 NOT_TESTED**。

以下为 5 个角色**分别**依据本轮有限实证给出的阶段性保守评估，不冒称外部独立专家或正式 Chrome 通过：UX **68**（真站、键盘/窄屏未验证）、架构 **78**（构建依赖与来源链已修但 Host 未验）、Markdown **63**（格式和边界缺读回）、安全 **76**（精确 SHA/目标围栏已加强但相关 CI 未全绿）、QA **43**（Mock 合同 10/10，其他构建及用户 Chrome 未通过）。

算术平均：`(68+78+63+76+43)/5 = 65.6 / 100`；**低于 95，不可关闭 R4**。所有未测项必须继续扣分。

## 五、下一次最小续接点（不是新任务/R5）

在允许执行的现有 Mac `main` 工作区读取最新 HEAD 和未提交差异，保护并行修改后，仅核对本轮已修的构建来源是否通过，按新 CI 日志修确有证据的剩余阻断。然后运行 Clipper/Host/预览真实测试并记录退出码；共享 AI Proxy pins 与 UI Preview lock 需原 owner 审阅。全部门禁通过后，才按原打包器合同提升高于 1.2.10 的版本、产生候选、验证 SHA256、晋升并逐字节检查；在真实用户 Chrome 同 ID 原位升级，实测单条长回答→Markdown→复制/下载→保存→关闭重开→搜索/全文读回，并核对原有摘录。取得截图、正文 SHA256、安装回执、版本与 5 角色平均分 ≥95 后才可写 **YES / R4 CLOSED**。
