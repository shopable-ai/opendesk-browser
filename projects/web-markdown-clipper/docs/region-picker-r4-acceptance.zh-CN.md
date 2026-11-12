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

## 五、R4 续接实证：修复 Native Settings Workspace 来源边界（2026-11-12）

- 本轮继续任务 `OD-WEB-MARKDOWN-CLIPPER-REGION-PICK-R4-LOCAL-RELEASE-ACCEPTANCE`，执行基线 GitHub `main=f590505b84e13b0ac2d7789db7c4bedfb62d21aa`；本轮实际源码提交 `3e1a68431a71e2c449c9cbf29da2d9c405fe1f2f`。该提交通过带预期 HEAD 的非强制前进引用更新写入唯一 `main`，并从远端读回两份修改文件。
- 新取得失败日志：App CI `43219105290` / Clipper Job `131186337612` 在提交 `cfc6e232` 上实际执行 `node scripts/app-ci.mjs build web-markdown-clipper`，`npm run build` 子进程因 `[opendesk-fixed-settings] Historical/user/vendor code cannot enter a privileged fixed bundle: projects/webflow/src/task-intent-contract.js` 失败，退出码 `1`。证明前轮修复并未完成全工程构建。
- 静态依赖追溯：固定 `src/entrypoints/settings.js` 引入 Native Workspace，沿 `src/ui/react/workspace/main.tsx` → `src/native-agent/workspace.js` → `workspace-chat-edit-ui.js` → `workspace-chatgpt.js` → `chatgpt-task-request.js` 间接引入 WebFlow 纯结构校验器；同一 Workspace 读取器引入 `projects/webflow/trusted/chatgpt-conversation-route.js`（只拒绝冲突路由，不产生 Task 授权）。两份内容已有精确 Git Blob SHA-1 锁：`50a7ec4bd3d8707ba53724efdc378cd98c2404d6` 与 `8e28adedd8cc2b49ff34897c0857d33cf2478c87`。
- 修复范围**仅两文件**：`scripts/bundle-provenance.mjs` 为上述**两份**固定字节源码在**唯一新增输出** `native-agent/settings.js` 精确准入；`tests/environment/bundle-provenance.test.mjs` 更新 WebFlow 解析器正反目标列表，并添加 deny-only route 的允许/禁止目标检查。未添加通配允许、未改变哈希、安全扫描、权限、安装器、Clipper ID、存储或业务 UI。
- GitHub 新提交触发 CI：`43226868275` 的 `audit` Job `131212185601` **FAIL，退出码 1**；实际错误主要为共享 `projects/ai-proxy/src/Settings.tsx` 可信哈希过期、Bookmark 旧目录测试路径及 Reading TOC 等其他来源差异；本次新增的两个 `describeBundle` 测试也被前置的 AI Proxy 来源校验阻断，**不能标为 PASS**。另一工作流 `43226868689` / Job `131212186890` 同样 **FAIL**，原因含上述跨工具问题；未擅自将其归因于 Clipper 或放宽安全检查。
- 新 App CI `43226868089`（基于本轮提交）当时 `discover` 和 `ci-contract` 已成功，但 `app-validate (web-markdown-clipper)` Job `131212628757` 仍为 **QUEUED / NOT_TESTED**，后续必须读回真实结果，不能把队列等于成功。
- 本机 CodexPro `UNAVAILABLE / Connection failed`；OpenDesk Desktop 与本机文件接口均 `UNAVAILABLE / MCP SSE probe 429`。没有用户工作区 `git status`、真正本机 Node、用户 Chrome 同 ID 原位升级或长回答保存读回证据。
- 正式工具配置及正式包依旧 `web-markdown-clipper@1.2.10`；旧正式包 HTML 尚只有四种模式。新候选构建、`--promote-from`、`--check-project`、正式新包 SHA256、Chrome 回执与 Markdown 正文哈希均为 **N/A**；**RELEASE_BLOCKED / REAL_CHROME_NOT_TESTED**。
- 评分保守沿用 R4 静态阶段：UX 68、架构 78、Markdown 63、安全 76、QA 43，算术平均 `65.6/100`，不是新的独立外部专家评级。多轮隔离、取消/导航竞态、150KB/160KB 字节边界依然缺真实 Chrome 验收。
- 下一有效续接：先读 `43226868089` 的 Clipper Job 实际结果；仅根据当前 SHA 的实测故障做差量修复，并让共享来源锁对应 App owner 审阅。完全门禁可证后才提升版本、构建候选/核验/晋升，并在用户真实 Chrome 验证原位升级、旧摘录保留、长回答 Markdown 保存及关闭重开读回。**禁止本轮提前关闭 R4**。

### R4 续接 CI 完成结果（Run 43226868089）

- 真实 App CI 的 `app-validate (web-markdown-clipper)` Job `131212628757` **completed/failure**；`Compile App and build a source-identical, unpromoted candidate` 步骤 **failure**，底层 `npm run build` 退出码 `1`；后续 Node/Browser 步骤 skipped。
- 在该提交 `3e1a68431a71e2c449c9cbf29da2d9c405fe1f2f` 的构建日志里，WXT **第 34/44 个 settings 目标已越过**，未再触发先前 WebFlow parser/route 来源拒绝；**第 40/44 个 tool-shell** 报 `Trusted extension settings source changed; review and re-pin before fixed build: projects/ai-scroll-navigation/trusted/ai-configuration.js`，导致本轮首次可见构建失败。
- 核查当前远端：`scripts/bundle-provenance.mjs` 对上述 AI Scroll 来源使用 reviewed Git Blob SHA-1 `ecec6df2621355503c26d0e24eaae4f84db99699`，而该源 Git Blob SHA-1 实际为 `c97137a3a871fb6c19fd3594fc627fafd67d03f8`；这是**独立 App 的来源锁差异**。需其所属代码 owner 审阅改动、负向校验及相关门禁后再处理，不得在 Clipper R4 中自动替换哈希或放宽全局权限。
- 因全构建仍未通过，不能将 settings 阶段通过上升为 Clipper App CI PASS；没有候选包、晋升、真实 Chrome、正文哈希或旧摘录保留的新证据。发布状态保持 **PARTIAL / RELEASE_BLOCKED / REAL_CHROME_NOT_TESTED**，专家阶段均分仍是 `65.6/100`，未达到验收线。
